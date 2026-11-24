import {
  ElementType,
  ProjectileParticle,
  SectorDefinition,
  SurfaceDecal,
  Weapon,
  WorldEntity,
} from '../types/game';
import { DynamicLightMap, LIGHTMAP_SUB } from './dynamicLighting';
import { spriteAtlas } from './spriteAtlas';

export interface RenderState {
  px: number;
  py: number;
  angle: number;
  pitch: number; // -0.35 .. +0.35 vertical look offset
  bobOffset: number;
  weaponSwayX?: number;
  weaponSwayY?: number;
  weaponRoll?: number;
  weaponScale?: number;
  weaponInspectGlow?: number;
  recoil: number;
  muzzleFlash: number;
  time: number;
  sector: SectorDefinition;
  weapon: Weapon;
  particles: ProjectileParticle[];
  targetEntityId: string | null;
}

interface CoverHit {
  tx: number;
  ty: number;
  dist: number;
  wallX: number;
  side: number;
  wallTex: string;
  heightFrac: number;
  stage: 0 | 1 | 2;
  shake: number;
}

export class Raycaster25D {
  private width: number;
  private height: number;
  private imageData: ImageData;
  private buf32: Uint32Array;
  private zBuffer: Float32Array;
  private lightMap = new DynamicLightMap();
  private sampleOut: [number, number, number] = [0, 0, 0];

  constructor(width = 480, height = 270) {
    this.width = width;
    this.height = height;
    this.imageData = new ImageData(width, height);
    this.buf32 = new Uint32Array(this.imageData.data.buffer);
    this.zBuffer = new Float32Array(width);
  }

  public resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.imageData = new ImageData(width, height);
    this.buf32 = new Uint32Array(this.imageData.data.buffer);
    this.zBuffer = new Float32Array(width);
  }

  private sampleLightmapBilinear(wx: number, wy: number, out: [number, number, number]): void {
    if (this.lightMap.activeCount === 0) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return;
    }
    const lmW = this.lightMap.lmW;
    const lmH = this.lightMap.lmH;
    const lmRgb = this.lightMap.rgb;
    const u = wx * LIGHTMAP_SUB - 0.5;
    const v = wy * LIGHTMAP_SUB - 0.5;
    const sx0 = u < 0 ? 0 : u >= lmW - 1 ? lmW - 1 : u | 0;
    const sy0 = v < 0 ? 0 : v >= lmH - 1 ? lmH - 1 : v | 0;
    const sx1 = sx0 + 1 < lmW ? sx0 + 1 : sx0;
    const sy1 = sy0 + 1 < lmH ? sy0 + 1 : sy0;
    const fu = u < 0 ? 0 : u >= lmW - 1 ? 0 : u - sx0;
    const fv = v < 0 ? 0 : v >= lmH - 1 ? 0 : v - sy0;
    const w00 = (1 - fu) * (1 - fv);
    const w10 = fu * (1 - fv);
    const w01 = (1 - fu) * fv;
    const w11 = fu * fv;
    const i00 = (sy0 * lmW + sx0) * 3;
    const i10 = (sy0 * lmW + sx1) * 3;
    const i01 = (sy1 * lmW + sx0) * 3;
    const i11 = (sy1 * lmW + sx1) * 3;
    out[0] = lmRgb[i00] * w00 + lmRgb[i10] * w10 + lmRgb[i01] * w01 + lmRgb[i11] * w11;
    out[1] = lmRgb[i00 + 1] * w00 + lmRgb[i10 + 1] * w10 + lmRgb[i01 + 1] * w01 + lmRgb[i11 + 1] * w11;
    out[2] = lmRgb[i00 + 2] * w00 + lmRgb[i10 + 2] * w10 + lmRgb[i01 + 2] * w01 + lmRgb[i11 + 2] * w11;
  }

  public render(state: RenderState): ImageData {
    const W = this.width;
    const H = this.height;
    const buf = this.buf32;
    const { px, py, angle, pitch, bobOffset, sector, time } = state;
    const grid = sector.grid;
    const gw = sector.width;
    const gh = sector.height;

    this.lightMap.solve(
      sector,
      px,
      py,
      angle,
      state.muzzleFlash,
      state.weapon.element,
      time
    );
    const hasLights = this.lightMap.activeCount > 0;
    const lmW = this.lightMap.lmW;
    const lmH = this.lightMap.lmH;
    const lmRgb = this.lightMap.rgb;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const fovScale = 0.66;
    const planeX = -dirY * fovScale;
    const planeY = dirX * fovScale;

    const horizon = Math.floor(H * 0.5 + pitch * H + bobOffset);
    const fogR = sector.fogColor[0];
    const fogG = sector.fogColor[1];
    const fogB = sector.fogColor[2];
    const ambR = sector.ambientColor[0] * 0.66;
    const ambG = sector.ambientColor[1] * 0.66;
    const ambB = sector.ambientColor[2] * 0.66;

    const floorTex = spriteAtlas.get(grid[1]?.[1]?.floorTex || 'floor_concrete_a');
    const ceilTex = spriteAtlas.get(grid[1]?.[1]?.ceilingTex || 'floor_tile_dark');

    // Index blood & oil surface decals into O(1) cell buckets for fast per-pixel lookup
    let floorBuckets: Map<number, SurfaceDecal[]> | null = null;
    let wallBuckets: Map<number, SurfaceDecal[]> | null = null;
    const decals = sector.decals;
    if (decals && decals.length > 0) {
      for (let di = 0; di < decals.length; di++) {
        const d = decals[di];
        if (d.surface === 'floor' && d.x !== undefined && d.y !== undefined && d.radius) {
          if (!floorBuckets) floorBuckets = new Map();
          const minGx = Math.max(0, Math.floor(d.x - d.radius * 1.45));
          const maxGx = Math.min(gw - 1, Math.floor(d.x + d.radius * 1.45));
          const minGy = Math.max(0, Math.floor(d.y - d.radius * 1.45));
          const maxGy = Math.min(gh - 1, Math.floor(d.y + d.radius * 1.45));
          for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
              const key = gy * gw + gx;
              let arr = floorBuckets.get(key);
              if (!arr) {
                arr = [];
                floorBuckets.set(key, arr);
              }
              arr.push(d);
            }
          }
        } else if (d.surface === 'wall' && d.side !== undefined) {
          if (!wallBuckets) wallBuckets = new Map();
          const key = (d.ty * gw + d.tx) * 2 + d.side;
          let arr = wallBuckets.get(key);
          if (!arr) {
            arr = [];
            wallBuckets.set(key, arr);
          }
          arr.push(d);
        }
      }
    }

    // 1. Floor & Ceiling Cast + Elemental Surface Hazards & Splatter Decals + Localized Lightmap
    const rayDirX0 = dirX - planeX;
    const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX;
    const rayDirY1 = dirY + planeY;
    const posZ = 0.5 * H;

    for (let y = 0; y < H; y++) {
      const isFloor = y >= horizon;
      const p = isFloor ? y - horizon : horizon - y;
      const rowDist = p === 0 ? 100 : posZ / p;
      const fogFactor = Math.min(1, rowDist * sector.fogDensity * 1.1);
      const invFog = 1 - fogFactor;

      if (rowDist > 20) {
        const c = (255 << 24) | (fogB << 16) | (fogG << 8) | fogR;
        const rowOff = y * W;
        for (let x = 0; x < W; x++) buf[rowOff + x] = c;
        continue;
      }

      const stepX = (rowDist * (rayDirX1 - rayDirX0)) / W;
      const stepY = (rowDist * (rayDirY1 - rayDirY0)) / W;
      let fx = px + rowDist * rayDirX0;
      let fy = py + rowDist * rayDirY0;

      const tex = isFloor ? floorTex : ceilTex;
      const texData = tex?.pixels;
      const tw = tex?.width || 64;
      const th = tex?.height || 64;
      const rowOff = y * W;
      const lightWeight = isFloor ? 1.0 : 0.48;

      for (let x = 0; x < W; x++) {
        const cellX = fx | 0;
        const cellY = fy | 0;
        const tx = ((fx - cellX) * tw) & 63;
        const ty = ((fy - cellY) * th) & 63;

        let r = 32;
        let g = 36;
        let b = 42;
        if (texData) {
          const ti = ((ty % th) * tw + (tx % tw)) * 4;
          r = texData[ti];
          g = texData[ti + 1];
          b = texData[ti + 2];
        }

        // Surface hazard tinting on floor tiles
        if (isFloor && cellX >= 0 && cellY >= 0 && cellX < gw && cellY < gh) {
          const haz = grid[cellY][cellX].hazard;
          if (haz !== 'none') {
            const wave = 0.5 + 0.5 * Math.sin(fx * 6 + fy * 6 + time * 7);
            if (haz === 'oil') {
              r = (r * 0.35) | 0;
              g = (g * 0.35) | 0;
              b = (b * 0.42 + wave * 25) | 0;
            } else if (haz === 'burning') {
              r = Math.min(255, (r * 0.5 + 165 + wave * 80) | 0);
              g = Math.min(255, (g * 0.3 + 55 + wave * 90) | 0);
              b = (b * 0.2) | 0;
            } else if (haz === 'coolant') {
              r = (r * 0.4) | 0;
              g = Math.min(255, (g * 0.65 + 75 + wave * 35) | 0);
              b = Math.min(255, (b * 0.7 + 125 + wave * 45) | 0);
            } else if (haz === 'electrified') {
              const arc = Math.sin(fx * 18 + time * 24) > 0.6 ? 1 : 0;
              r = (r * 0.45 + arc * 120) | 0;
              g = Math.min(255, (g * 0.7 + 100 + arc * 140) | 0);
              b = Math.min(255, (b * 0.8 + 165 + arc * 90) | 0);
            } else if (haz === 'toxic') {
              r = (r * 0.45) | 0;
              g = Math.min(255, (g * 0.7 + 95 + wave * 65) | 0);
              b = (b * 0.35) | 0;
            } else if (haz === 'frozen') {
              r = Math.min(255, (r * 0.6 + 85) | 0);
              g = Math.min(255, (g * 0.75 + 115) | 0);
              b = Math.min(255, (b * 0.9 + 145) | 0);
            }
          }

          if (floorBuckets) {
            const fDecs = floorBuckets.get(cellY * gw + cellX);
            if (fDecs) {
              for (let di = 0; di < fDecs.length; di++) {
                const dec = fDecs[di];
                const ddx = fx - (dec.x ?? 0);
                const ddy = fy - (dec.y ?? 0);
                const drx = dec.dirX ?? 1;
                const dry = dec.dirY ?? 0;
                const along = ddx * drx + ddy * dry;
                const perp = -ddx * dry + ddy * drx;
                const sAlong = along > 0 ? along / 1.45 : along * 1.15;
                const ang = Math.atan2(ddy, ddx);
                const lobe =
                  1.0 +
                  0.24 * Math.sin(ang * 3 + dec.seed) +
                  0.14 * Math.cos(ang * 5 - dec.seed * 0.7);
                const effR = (dec.radius ?? 0.25) * lobe;
                const distSq = sAlong * sAlong + perp * perp;
                if (distSq <= effR * effR) {
                  const rim = Math.sqrt(distSq) / Math.max(0.01, effR);
                  if (dec.kind === 'blood') {
                    const mix = rim < 0.72 ? 0.82 : 0.66;
                    const cr = rim < 0.72 ? 132 : 76;
                    const cg = rim < 0.72 ? 16 : 9;
                    const cb = rim < 0.72 ? 24 : 14;
                    r = (r * (1 - mix) + cr * mix) | 0;
                    g = (g * (1 - mix) + cg * mix) | 0;
                    b = (b * (1 - mix) + cb * mix) | 0;
                  } else {
                    const mix = rim < 0.76 ? 0.85 : 0.70;
                    const cr = rim > 0.76 ? 38 : 16;
                    const cg = rim > 0.76 ? 50 : 20;
                    const cb = rim > 0.76 ? 70 : 28;
                    r = (r * (1 - mix) + cr * mix) | 0;
                    g = (g * (1 - mix) + cg * mix) | 0;
                    b = (b * (1 - mix) + cb * mix) | 0;
                  }
                }
              }
            }
          }
        }

        let litR = ambR;
        let litG = ambG;
        let litB = ambB;
        if (hasLights) {
          const lu = fx * LIGHTMAP_SUB - 0.5;
          const lv = fy * LIGHTMAP_SUB - 0.5;
          const sx0 = lu < 0 ? 0 : lu >= lmW - 1 ? lmW - 1 : lu | 0;
          const sy0 = lv < 0 ? 0 : lv >= lmH - 1 ? lmH - 1 : lv | 0;
          const sx1 = sx0 + 1 < lmW ? sx0 + 1 : sx0;
          const sy1 = sy0 + 1 < lmH ? sy0 + 1 : sy0;
          const fu = lu < 0 ? 0 : lu >= lmW - 1 ? 0 : lu - sx0;
          const fv = lv < 0 ? 0 : lv >= lmH - 1 ? 0 : lv - sy0;
          const w00 = (1 - fu) * (1 - fv);
          const w10 = fu * (1 - fv);
          const w01 = (1 - fu) * fv;
          const w11 = fu * fv;
          const i00 = (sy0 * lmW + sx0) * 3;
          const i10 = (sy0 * lmW + sx1) * 3;
          const i01 = (sy1 * lmW + sx0) * 3;
          const i11 = (sy1 * lmW + sx1) * 3;
          litR = Math.min(1.55, ambR + (lmRgb[i00] * w00 + lmRgb[i10] * w10 + lmRgb[i01] * w01 + lmRgb[i11] * w11) * lightWeight);
          litG = Math.min(1.55, ambG + (lmRgb[i00 + 1] * w00 + lmRgb[i10 + 1] * w10 + lmRgb[i01 + 1] * w01 + lmRgb[i11 + 1] * w11) * lightWeight);
          litB = Math.min(1.55, ambB + (lmRgb[i00 + 2] * w00 + lmRgb[i10 + 2] * w10 + lmRgb[i01 + 2] * w01 + lmRgb[i11 + 2] * w11) * lightWeight);
        }

        const lr = Math.min(255, (r * litR * invFog + fogR * fogFactor) | 0);
        const lg = Math.min(255, (g * litG * invFog + fogG * fogFactor) | 0);
        const lb = Math.min(255, (b * litB * invFog + fogB * fogFactor) | 0);
        buf[rowOff + x] = (255 << 24) | (lb << 16) | (lg << 8) | lr;

        fx += stepX;
        fy += stepY;
      }
    }

    // 2. DDA Column Raycasting (Full Walls + Doors + Partial Destructible Cover)
    const coverQueue: CoverHit[] = [];

    for (let x = 0; x < W; x++) {
      const cameraX = (2 * x) / W - 1;
      const rdx = dirX + planeX * cameraX;
      const rdy = dirY + planeY * cameraX;

      let mapX = px | 0;
      let mapY = py | 0;
      const deltaDistX = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const deltaDistY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);

      let stepX = 1;
      let sideDistX = 0;
      if (rdx < 0) {
        stepX = -1;
        sideDistX = (px - mapX) * deltaDistX;
      } else {
        sideDistX = (mapX + 1.0 - px) * deltaDistX;
      }

      let stepY = 1;
      let sideDistY = 0;
      if (rdy < 0) {
        stepY = -1;
        sideDistY = (py - mapY) * deltaDistY;
      } else {
        sideDistY = (mapY + 1.0 - py) * deltaDistY;
      }

      coverQueue.length = 0;
      let hit = false;
      let side = 0;
      let hitWallTex = 'wall_concrete_clean';
      let isDoor = false;
      let doorOpen = 0;
      let steps = 0;

      while (!hit && steps < 48) {
        steps++;
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }

        if (mapX < 0 || mapY < 0 || mapX >= gw || mapY >= gh) {
          hit = true;
          break;
        }

        const cell = grid[mapY][mapX];
        if (cell.kind === 'wall') {
          hit = true;
          hitWallTex = cell.wallTex;
        } else if (cell.kind === 'door' || cell.kind === 'gate') {
          if (cell.doorOpen < 0.92) {
            hit = true;
            isDoor = true;
            doorOpen = cell.doorOpen;
            hitWallTex = cell.wallTex;
          }
        } else if (cell.kind === 'cover' && cell.coverHp > 0) {
          const cDist =
            side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
          let cWallX =
            side === 0 ? py + cDist * rdy : px + cDist * rdx;
          cWallX -= Math.floor(cWallX);
          const hpPct = cell.coverHp / Math.max(1, cell.coverMaxHp);
          const stage: 0 | 1 | 2 = hpPct > 0.66 ? 0 : hpPct > 0.33 ? 1 : 2;
          const visualScale = cell.coverVisualScale ?? (stage === 0 ? 1.0 : stage === 1 ? 0.88 : 0.68);
          coverQueue.push({
            tx: mapX,
            ty: mapY,
            dist: Math.max(0.1, cDist),
            wallX: cWallX,
            side,
            wallTex: cell.wallTex,
            heightFrac: cell.coverHeight * visualScale,
            stage,
            shake: cell.coverShake ?? 0,
          });
        }
      }

      const perpDist = Math.max(
        0.1,
        side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY
      );
      this.zBuffer[x] = perpDist;

      let rawWallX = side === 0 ? py + perpDist * rdy : px + perpDist * rdx;
      rawWallX -= Math.floor(rawWallX);
      const wallX = isDoor ? (rawWallX + doorOpen) % 1 : rawWallX;

      const lineHeight = (H / perpDist) | 0;
      const drawStart = Math.max(0, ((-lineHeight / 2) + horizon) | 0);
      const drawEnd = Math.min(H - 1, ((lineHeight / 2) + horizon) | 0);

      const wallSprite = spriteAtlas.get(hitWallTex);
      const wPixels = wallSprite?.pixels;
      const wW = wallSprite?.width || 64;
      const wH = wallSprite?.height || 64;
      const texX = Math.min(wW - 1, Math.max(0, (wallX * wW) | 0));
      const sideShade = side === 1 ? 0.74 : 1.0;
      const fogFactor = Math.min(1, perpDist * sector.fogDensity);
      const invFog = 1 - fogFactor;

      // Sample lightmap immediately in front of the wall face (O(1) per column)
      const wSampleX = side === 0 ? (rdx > 0 ? mapX - 0.14 : mapX + 1.14) : mapX + rawWallX;
      const wSampleY = side === 1 ? (rdy > 0 ? mapY - 0.14 : mapY + 1.14) : mapY + rawWallX;
      this.sampleLightmapBilinear(wSampleX, wSampleY, this.sampleOut);
      const wLitR = Math.min(1.55, ambR + this.sampleOut[0]);
      const wLitG = Math.min(1.55, ambG + this.sampleOut[1]);
      const wLitB = Math.min(1.55, ambB + this.sampleOut[2]);

      const stepTex = wH / Math.max(1, lineHeight);
      let texPos = (drawStart - horizon + lineHeight / 2) * stepTex;
      const wallTopY = -lineHeight / 2 + horizon;
      const invLineH = 1 / Math.max(1, lineHeight);

      let colDecals: SurfaceDecal[] | null = null;
      if (!isDoor && wallBuckets) {
        const wDecs = wallBuckets.get((mapY * gw + mapX) * 2 + side);
        if (wDecs) {
          for (let di = 0; di < wDecs.length; di++) {
            const wd = wDecs[di];
            if (Math.abs(wallX - (wd.u ?? 0)) <= (wd.radU ?? 0.15) * 1.35) {
              if (!colDecals) colDecals = [];
              colDecals.push(wd);
            }
          }
        }
      }

      for (let y = drawStart; y <= drawEnd; y++) {
        const texY = Math.min(wH - 1, Math.max(0, texPos | 0));
        texPos += stepTex;
        let r = 90;
        let g = 96;
        let b = 104;
        if (wPixels) {
          const i = (texY * wW + texX) * 4;
          r = wPixels[i];
          g = wPixels[i + 1];
          b = wPixels[i + 2];
        }

        if (colDecals) {
          const wallV = (y - wallTopY) * invLineH;
          for (let di = 0; di < colDecals.length; di++) {
            const wd = colDecals[di];
            const du = wallX - (wd.u ?? 0.5);
            const dv = wallV - (wd.v ?? 0.5);
            const rU = wd.radU ?? 0.15;
            const rV = wd.radV ?? 0.14;
            const normU = du / rU;
            const normV = dv / rV;
            const lobe = 0.85 + 0.25 * Math.sin(du * 38 + wd.seed);
            const inSplash = normU * normU + normV * normV <= lobe;
            const inDrip =
              dv > 0 &&
              dv < rV * 2.1 &&
              Math.abs(du) < rU * 0.72 &&
              Math.abs(Math.sin(du * 46 + wd.seed)) > 0.83;

            if (inSplash || inDrip) {
              if (wd.kind === 'blood') {
                const mix = inSplash ? 0.84 : 0.72;
                const cr = inSplash ? 128 : 86;
                const cg = inSplash ? 14 : 9;
                const cb = inSplash ? 20 : 14;
                r = (r * (1 - mix) + cr * mix) | 0;
                g = (g * (1 - mix) + cg * mix) | 0;
                b = (b * (1 - mix) + cb * mix) | 0;
              } else {
                const mix = inSplash ? 0.86 : 0.74;
                r = (r * (1 - mix) + 18 * mix) | 0;
                g = (g * (1 - mix) + 24 * mix) | 0;
                b = (b * (1 - mix) + 34 * mix) | 0;
              }
            }
          }
        }

        const sr = Math.min(255, (r * sideShade * wLitR * invFog + fogR * fogFactor) | 0);
        const sg = Math.min(255, (g * sideShade * wLitG * invFog + fogG * fogFactor) | 0);
        const sb = Math.min(255, (b * sideShade * wLitB * invFog + fogB * fogFactor) | 0);
        buf[y * W + x] = (255 << 24) | (sb << 16) | (sg << 8) | sr;
      }

      // Composite Destructible Cover blocks back-to-front in this column
      for (let ci = coverQueue.length - 1; ci >= 0; ci--) {
        const cov = coverQueue[ci];
        if (cov.dist >= perpDist) continue;
        const cLineH = (H / cov.dist) | 0;
        const shakePxY =
          cov.shake > 0.01 ? Math.round(Math.sin(time * 65 + cov.tx) * cov.shake * 2.5) : 0;
        const cFullBottom = (((cLineH / 2) + horizon) | 0) + shakePxY;
        const cFullTop = (((-cLineH / 2) + horizon) | 0) + shakePxY;

        // Deterministic jagged crown erosion for fractured / critical cover
        let notchFrac = 0;
        if (cov.stage >= 1) {
          const uBucket = (cov.wallX * 12) | 0;
          const seed = (uBucket * 17 + cov.tx * 31 + cov.ty * 13) & 7;
          notchFrac = cov.stage === 2 ? (seed * 0.028) : (seed < 4 ? seed * 0.014 : 0);
        }

        const effectiveH = Math.max(0.18, cov.heightFrac - notchFrac);
        const cTop = Math.max(
          0,
          (cFullBottom - cLineH * effectiveH) | 0
        );
        const cBottom = Math.min(H - 1, cFullBottom);

        const texKey = cov.stage > 0 ? `${cov.wallTex}_dmg${cov.stage}` : cov.wallTex;
        const covSprite = spriteAtlas.get(texKey) || spriteAtlas.get(cov.wallTex);
        const cp = covSprite?.pixels;
        const cw = covSprite?.width || 64;
        const ch = covSprite?.height || 64;
        const shakeU = cov.shake > 0.01 ? Math.sin(time * 80) * cov.shake * 0.03 : 0;
        const wrappedWallX = (cov.wallX + shakeU + 1) % 1;
        const ctx = Math.min(cw - 1, Math.max(0, (wrappedWallX * cw) | 0));
        const cShade = cov.side === 1 ? 0.76 : 1.0;
        const cFog = Math.min(1, cov.dist * sector.fogDensity);
        const cInvFog = 1 - cFog;
        const cStep = ch / Math.max(1, cFullBottom - cFullTop);
        let cTexPos = (cTop - cFullTop) * cStep;

        const cSampleX = cov.side === 0 ? (rdx > 0 ? cov.tx - 0.14 : cov.tx + 1.14) : cov.tx + cov.wallX;
        const cSampleY = cov.side === 1 ? (rdy > 0 ? cov.ty - 0.14 : cov.ty + 1.14) : cov.ty + cov.wallX;
        this.sampleLightmapBilinear(cSampleX, cSampleY, this.sampleOut);
        const cLitR = Math.min(1.55, ambR + this.sampleOut[0]);
        const cLitG = Math.min(1.55, ambG + this.sampleOut[1]);
        const cLitB = Math.min(1.55, ambB + this.sampleOut[2]);

        for (let y = cTop; y <= cBottom; y++) {
          const cty = Math.min(ch - 1, Math.max(0, cTexPos | 0));
          cTexPos += cStep;
          let r = 110;
          let g = 88;
          let b = 70;
          if (cp) {
            const idx = (cty * cw + ctx) * 4;
            r = cp[idx];
            g = cp[idx + 1];
            b = cp[idx + 2];
          }
          // Subtle darkened edge along jagged crumbled crown
          if (cov.stage >= 1 && y - cTop < 2) {
            r = (r * 0.55) | 0;
            g = (g * 0.55) | 0;
            b = (b * 0.55) | 0;
          }
          const sr = Math.min(255, (r * cShade * cLitR * cInvFog + fogR * cFog) | 0);
          const sg = Math.min(255, (g * cShade * cLitG * cInvFog + fogG * cFog) | 0);
          const sb = Math.min(255, (b * cShade * cLitB * cInvFog + fogB * cFog) | 0);
          buf[y * W + x] = (255 << 24) | (sb << 16) | (sg << 8) | sr;
        }
      }
    }

    // 3. Z-Buffered Sprite Billboards (Enemies, NPCs, Terminals, Barrels, Pickups)
    const activeEntities: Array<{ e: WorldEntity; distSq: number }> = [];
    for (const e of sector.entities) {
      if (e.dead) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      activeEntities.push({ e, distSq: dx * dx + dy * dy });
    }
    activeEntities.sort((a, b) => b.distSq - a.distSq);

    const invDet = 1.0 / (planeX * dirY - dirX * planeY);

    for (const { e } of activeEntities) {
      const sprite = spriteAtlas.get(e.spriteId);
      if (!sprite) continue;

      const sx = e.x - px;
      const sy = e.y - py;
      const transformX = invDet * (dirY * sx - dirX * sy);
      const transformY = invDet * (-planeY * sx + planeX * sy);
      if (transformY <= 0.18) continue;

      const screenX = ((W / 2) * (1 + transformX / transformY)) | 0;
      const aspect = sprite.width / Math.max(1, sprite.height);
      const spriteH = Math.abs(((H / transformY) * e.scale) | 0);
      const spriteW = Math.max(2, (spriteH * aspect) | 0);

      // Anchor bottom of sprite onto floor level
      const baseLine = ((H / transformY) * 0.5 + horizon) | 0;
      const drawEndY = Math.min(H - 1, baseLine);
      const drawStartY = Math.max(0, baseLine - spriteH);
      const vMoveTop = baseLine - spriteH;

      const drawStartX = Math.max(0, (screenX - spriteW / 2) | 0);
      const drawEndX = Math.min(W - 1, (screenX + spriteW / 2) | 0);

      const fogFactor = Math.min(1, transformY * sector.fogDensity);
      const invFog = 1 - fogFactor;
      const spPixels = sprite.pixels;
      const sw = sprite.width;
      const sh = sprite.height;

      this.sampleLightmapBilinear(e.x, e.y, this.sampleOut);
      const eLitR = Math.min(1.55, ambR + this.sampleOut[0]);
      const eLitG = Math.min(1.55, ambG + this.sampleOut[1]);
      const eLitB = Math.min(1.55, ambB + this.sampleOut[2]);

      for (let stripe = drawStartX; stripe <= drawEndX; stripe++) {
        if (transformY >= this.zBuffer[stripe]) continue;
        const texX = Math.min(
          sw - 1,
          Math.max(0, (((stripe - (screenX - spriteW / 2)) * sw) / spriteW) | 0)
        );
        for (let y = drawStartY; y <= drawEndY; y++) {
          const texY = Math.min(
            sh - 1,
            Math.max(0, (((y - vMoveTop) * sh) / Math.max(1, spriteH)) | 0)
          );
          const si = (texY * sw + texX) * 4;
          const alpha = spPixels[si + 3];
          if (alpha < 110) continue;

          let r = spPixels[si];
          let g = spPixels[si + 1];
          let b = spPixels[si + 2];

          // Diegetic elemental status shader tint on enemies
          if (e.statusElement && e.statusTimer > 0) {
            if (e.statusElement === 'thermal') {
              r = Math.min(255, r + 95);
              g = (g * 0.75 + 20) | 0;
            } else if (e.statusElement === 'cryo') {
              r = (r * 0.65 + 45) | 0;
              g = Math.min(255, g + 60);
              b = Math.min(255, b + 115);
            } else if (e.statusElement === 'shock') {
              const jolt = Math.sin(time * 32 + y) > 0 ? 110 : 30;
              g = Math.min(255, g + jolt);
              b = Math.min(255, b + jolt + 40);
            } else if (e.statusElement === 'toxin') {
              g = Math.min(255, g + 85);
            }
          }

          const sr = Math.min(255, (r * eLitR * invFog + fogR * fogFactor) | 0);
          const sg = Math.min(255, (g * eLitG * invFog + fogG * fogFactor) | 0);
          const sb = Math.min(255, (b * eLitB * invFog + fogB * fogFactor) | 0);
          buf[y * W + stripe] = (255 << 24) | (sb << 16) | (sg << 8) | sr;
        }
      }

      // Minimal diegetic HP bar & adjacent status glyph when damaged or afflicted
      const hasActiveStatus = Boolean(
        e.statusElement && e.statusElement !== 'kinetic' && e.statusTimer > 0
      );
      if (
        e.hostile &&
        e.hp > 0 &&
        transformY < 10 &&
        (e.hp < e.maxHp || hasActiveStatus)
      ) {
        const barW = Math.max(12, Math.min(36, (spriteW * 0.72) | 0));
        const bx0 = Math.max(hasActiveStatus ? 10 : 1, (screenX - barW / 2) | 0);
        const bx1 = Math.min(W - 2, bx0 + barW);
        const by = Math.max(4, drawStartY - 6);
        const fillW = Math.max(0, Math.min(barW, ((e.hp / Math.max(1, e.maxHp)) * barW) | 0));

        // 1px dark frame + 2px health bar for crisp contrast
        for (let bx = bx0 - 1; bx <= bx1 + 1; bx++) {
          if (bx < 0 || bx >= W || transformY >= this.zBuffer[bx]) continue;
          const isBorder = bx < bx0 || bx > bx1;
          buf[(by - 1) * W + bx] = 0xff110d0b;
          if (by + 2 < H) buf[(by + 2) * W + bx] = 0xff110d0b;
          if (isBorder) {
            buf[by * W + bx] = 0xff110d0b;
            buf[(by + 1) * W + bx] = 0xff110d0b;
          } else {
            const filled = bx - bx0 < fillW;
            const col = filled ? 0xff4444ef : 0xff241c18;
            buf[by * W + bx] = col;
            buf[(by + 1) * W + bx] = col;
          }
        }

        // Render 7x7 pixel-art status glyph immediately to the left of the HP bar
        if (hasActiveStatus && e.statusElement) {
          const blinkOff = e.statusTimer < 1.0 && ((time * 10) | 0) % 2 === 1;
          if (!blinkOff) {
            this.drawStatusGlyph(
              bx0 - 9,
              by - 3,
              e.statusElement,
              transformY,
              time
            );
          }
        }
      }
    }

    // 4. 3D Particles (Debris, Embers, Frost Mist, Shock Sparks)
    for (const pt of state.particles) {
      const sx = pt.x - px;
      const sy = pt.y - py;
      const transformX = invDet * (dirY * sx - dirX * sy);
      const transformY = invDet * (-planeY * sx + planeX * sy);
      if (transformY <= 0.15) continue;

      const screenX = ((W / 2) * (1 + transformX / transformY)) | 0;
      const screenY = ((horizon + (0.5 - pt.z) * (H / transformY))) | 0;
      const rad = Math.max(1, ((pt.size * H) / (transformY * 140)) | 0);
      const lifeRatio = Math.max(0, Math.min(1, pt.life / Math.max(0.01, pt.maxLife)));
      const baseAlpha = (pt.alpha ?? 1) * lifeRatio;
      if (baseAlpha <= 0.04) continue;

      const col = hexToAbgr(pt.color);
      const pr = col & 0xff;
      const pg = (col >> 8) & 0xff;
      const pb = (col >> 16) & 0xff;
      const isMist = pt.kind === 'frost';

      for (let dy = -rad; dy <= rad; dy++) {
        const pyScreen = screenY + dy;
        if (pyScreen < 0 || pyScreen >= H) continue;
        const rowOff = pyScreen * W;
        for (let dx = -rad; dx <= rad; dx++) {
          if (isMist && dx * dx + dy * dy > rad * rad + 1) continue;
          const pxScreen = screenX + dx;
          if (pxScreen < 0 || pxScreen >= W) continue;
          if (transformY >= this.zBuffer[pxScreen]) continue;

          if (baseAlpha >= 0.92 && !isMist) {
            buf[rowOff + pxScreen] = col;
          } else {
            const falloff = isMist
              ? baseAlpha * (1 - Math.hypot(dx, dy) / (rad + 1.2))
              : baseAlpha;
            const a = Math.max(0, Math.min(1, falloff));
            const dst = buf[rowOff + pxScreen];
            const dr = dst & 0xff;
            const dg = (dst >> 8) & 0xff;
            const db = (dst >> 16) & 0xff;
            const nr = (dr + (pr - dr) * a) | 0;
            const ng = (dg + (pg - dg) * a) | 0;
            const nb = (db + (pb - db) * a) | 0;
            buf[rowOff + pxScreen] = (255 << 24) | (nb << 16) | (ng << 8) | nr;
          }
        }
      }
    }

    // 5. First-Person Equipped Sprite-Sheet Weapon Viewmodel
    this.drawWeaponViewmodel(state);

    return this.imageData;
  }

  private drawWeaponViewmodel(state: RenderState): void {
    const W = this.width;
    const H = this.height;
    const buf = this.buf32;
    const weaponSprite = spriteAtlas.get(state.weapon.spriteId);
    if (!weaponSprite) return;

    const baseScale = Math.max(2.2, W / 170);
    const zoom = state.weaponScale ?? 1.0;
    const baseDrawW = weaponSprite.width * baseScale;
    const baseDrawH = weaponSprite.height * baseScale;
    const drawW = (baseDrawW * zoom) | 0;
    const drawH = (baseDrawH * zoom) | 0;
    const recoilScale =
      state.weapon.archetype === 'shotgun'
        ? 1.35
        : state.weapon.archetype === 'rifle'
          ? 1.12
          : state.weapon.archetype === 'pistol'
            ? 0.9
            : 1.0;
    const recoilY = state.recoil * (H * 0.11) * recoilScale;
    const swayX =
      state.weaponSwayX !== undefined
        ? state.weaponSwayX
        : Math.sin(state.time * 5.2) * (Math.abs(state.bobOffset) * 0.45);
    const swayY =
      state.weaponSwayY !== undefined
        ? state.weaponSwayY
        : Math.abs(state.bobOffset) * 0.85;
    const roll = state.weaponRoll ?? 0;
    const inspectGlow = state.weaponInspectGlow ?? 0;

    // Anchor grip pivot consistently so inspect zoom scales outward cleanly
    const pivotX = W * 0.56 + swayX + baseDrawW * 0.72;
    const pivotY = H - baseDrawH + 10 + recoilY + swayY + baseDrawH * 0.85;
    const startX = pivotX - drawW * 0.72;
    const startY = pivotY - drawH * 0.85;

    const wp = weaponSprite.pixels;
    const sw = weaponSprite.width;
    const sh = weaponSprite.height;
    const elemCol = getElementRgb(state.weapon.element);

    const useRot = Math.abs(roll) > 0.002;
    const cosR = useRot ? Math.cos(roll) : 1;
    const sinR = useRot ? Math.sin(roll) : 0;

    let minX = startX | 0;
    let maxX = (startX + drawW) | 0;
    let minY = startY | 0;
    let maxY = (startY + drawH) | 0;

    if (useRot) {
      const c00x = startX - pivotX;
      const c00y = startY - pivotY;
      const c10x = startX + drawW - pivotX;
      const c10y = startY - pivotY;
      const c01x = startX - pivotX;
      const c01y = startY + drawH - pivotY;
      const c11x = startX + drawW - pivotX;
      const c11y = startY + drawH - pivotY;

      const x00 = pivotX + c00x * cosR - c00y * sinR;
      const y00 = pivotY + c00x * sinR + c00y * cosR;
      const x10 = pivotX + c10x * cosR - c10y * sinR;
      const y10 = pivotY + c10x * sinR + c10y * cosR;
      const x01 = pivotX + c01x * cosR - c01y * sinR;
      const y01 = pivotY + c01x * sinR + c01y * cosR;
      const x11 = pivotX + c11x * cosR - c11y * sinR;
      const y11 = pivotY + c11x * sinR + c11y * cosR;

      minX = Math.floor(Math.min(x00, x10, x01, x11));
      maxX = Math.ceil(Math.max(x00, x10, x01, x11));
      minY = Math.floor(Math.min(y00, y10, y01, y11));
      maxY = Math.ceil(Math.max(y00, y10, y01, y11));
    }

    const clampMinX = Math.max(0, minX);
    const clampMaxX = Math.min(W - 1, maxX);
    const clampMinY = Math.max(0, minY);
    const clampMaxY = Math.min(H - 1, maxY);

    this.sampleLightmapBilinear(state.px, state.py, this.sampleOut);
    const wEnvR = Math.min(1.45, Math.max(0.76, state.sector.ambientColor[0] * 0.78 + this.sampleOut[0] * 0.55));
    const wEnvG = Math.min(1.45, Math.max(0.76, state.sector.ambientColor[1] * 0.78 + this.sampleOut[1] * 0.55));
    const wEnvB = Math.min(1.45, Math.max(0.76, state.sector.ambientColor[2] * 0.78 + this.sampleOut[2] * 0.55));

    for (let sy = clampMinY; sy <= clampMaxY; sy++) {
      const dyP = sy - pivotY;
      for (let sx = clampMinX; sx <= clampMaxX; sx++) {
        let lx: number;
        let ly: number;
        if (useRot) {
          const dxP = sx - pivotX;
          lx = pivotX + dxP * cosR + dyP * sinR - startX;
          ly = pivotY - dxP * sinR + dyP * cosR - startY;
        } else {
          lx = sx - startX;
          ly = sy - startY;
        }

        if (lx < 0 || lx >= drawW || ly < 0 || ly >= drawH) continue;
        const tx = ((lx * sw) / drawW) | 0;
        const ty = ((ly * sh) / drawH) | 0;
        const idx = (ty * sw + tx) * 4;
        if (wp[idx + 3] < 120) continue;

        let r = Math.min(255, (wp[idx] * wEnvR) | 0);
        let g = Math.min(255, (wp[idx + 1] * wEnvG) | 0);
        let b = Math.min(255, (wp[idx + 2] * wEnvB) | 0);

        // Elemental core glow (amplified smoothly during KeyI weapon inspect)
        if (
          lx > drawW * 0.28 &&
          lx < drawW * 0.58 &&
          ly > drawH * 0.28 &&
          ly < drawH * 0.58
        ) {
          if (state.weapon.element !== 'kinetic') {
            const coreMix = Math.min(0.65, 0.25 + inspectGlow * 0.36);
            r = Math.min(255, (r * (1 - coreMix) + elemCol[0] * coreMix) | 0);
            g = Math.min(255, (g * (1 - coreMix) + elemCol[1] * coreMix) | 0);
            b = Math.min(255, (b * (1 - coreMix) + elemCol[2] * coreMix) | 0);
          } else if (inspectGlow > 0.02) {
            const sheen = inspectGlow * 28;
            r = Math.min(255, (r + sheen) | 0);
            g = Math.min(255, (g + sheen) | 0);
            b = Math.min(255, (b + sheen * 1.1) | 0);
          }
        }

        // Muzzle flash illumination on weapon metal
        if (state.muzzleFlash > 0.05) {
          r = Math.min(255, (r + elemCol[0] * state.muzzleFlash * 0.45) | 0);
          g = Math.min(255, (g + elemCol[1] * state.muzzleFlash * 0.45) | 0);
          b = Math.min(255, (b + elemCol[2] * state.muzzleFlash * 0.45) | 0);
        }

        buf[sy * W + sx] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }

  private drawStatusGlyph(
    ix0: number,
    iy0: number,
    element: ElementType,
    depth: number,
    time: number
  ): void {
    const glyph = STATUS_GLYPHS[element];
    if (!glyph) return;
    const W = this.width;
    const H = this.height;
    const buf = this.buf32;

    const pulsePhase = ((time * 8) | 0) % 2 === 0;
    const pal = getStatusGlyphPalette(element, pulsePhase);

    for (let gy = 0; gy < 7; gy++) {
      const py = iy0 + gy;
      if (py < 0 || py >= H) continue;
      const row = glyph[gy];
      const rowOff = py * W;
      for (let gx = 0; gx < 7; gx++) {
        const ch = row[gx];
        if (ch === '.') continue;
        const px = ix0 + gx;
        if (px < 0 || px >= W) continue;
        if (depth >= this.zBuffer[px]) continue;
        buf[rowOff + px] =
          ch === '#'
            ? 0xff110d0b
            : ch === '1'
            ? pal[0]
            : pal[1];
      }
    }
  }
}

// 7x7 pixel-art glyphs: '.' transparent, '#' dark contrast outline, '1' outer pigment, '2' bright core
const STATUS_GLYPHS: Partial<Record<ElementType, readonly string[]>> = {
  thermal: [
    '..#.#..',
    '.#121#.',
    '#1221#.',
    '#12211#',
    '#11221#',
    '.#111#.',
    '..###..',
  ],
  cryo: [
    '..###..',
    '.#212#.',
    '#21212#',
    '#12221#',
    '#21212#',
    '.#212#.',
    '..###..',
  ],
  shock: [
    '..####.',
    '.#221#.',
    '#221#..',
    '#1222#.',
    '..#21#.',
    '.#21#..',
    '.###...',
  ],
  toxin: [
    '..###..',
    '.#121#.',
    '#12221#',
    '#12121#',
    '#11211#',
    '.#111#.',
    '..###..',
  ],
};

function getStatusGlyphPalette(
  el: ElementType,
  pulse: boolean
): [number, number] {
  // Returns [outerABGR, coreABGR]
  switch (el) {
    case 'thermal':
      return pulse ? [0xff2455ef, 0xff0bf5fb] : [0xff1644ef, 0xff249ef5];
    case 'cryo':
      return [0xfff8bd38, 0xfffef2e0];
    case 'shock':
      return pulse ? [0xfffaa560, 0xff8af0fe] : [0xffeb823b, 0xfffef293];
    case 'toxin':
      return [0xff699605, 0xff99d334];
    default:
      return [0xff94a3b8, 0xfff8fafc];
  }
}

function getElementRgb(el: ElementType): [number, number, number] {
  switch (el) {
    case 'thermal':
      return [255, 145, 45];
    case 'cryo':
      return [95, 220, 255];
    case 'shock':
      return [110, 190, 255];
    case 'toxin':
      return [85, 235, 120];
    default:
      return [245, 190, 95];
  }
}

function hexToAbgr(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 255;
  const g = parseInt(clean.slice(2, 4), 16) || 200;
  const b = parseInt(clean.slice(4, 6), 16) || 100;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}
