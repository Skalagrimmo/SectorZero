import { ElementType, SectorDefinition } from '../types/game';

export const LIGHTMAP_SUB = 4; // 4x4 sub-cells per map tile (80x80 for 20x20 sector)
export const MAX_ACTIVE_LIGHTS = 4;
const NUM_RAYS = 128;

const RAY_COS = new Float32Array(NUM_RAYS);
const RAY_SIN = new Float32Array(NUM_RAYS);
for (let i = 0; i < NUM_RAYS; i++) {
  const theta = (i / NUM_RAYS) * Math.PI * 2;
  RAY_COS[i] = Math.cos(theta);
  RAY_SIN[i] = Math.sin(theta);
}

interface LightCandidate {
  id: string;
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  priority: number;
  isDynamic: boolean;
}

interface CachedFootprint {
  geomStamp: number;
  lx: number;
  ly: number;
  radius: number;
  minSx: number;
  maxSx: number;
  minSy: number;
  maxSy: number;
  weights: Float32Array;
}

function getWeaponLightRgb(el: ElementType): [number, number, number] {
  switch (el) {
    case 'thermal':
      return [1.0, 0.48, 0.14];
    case 'cryo':
      return [0.34, 0.84, 1.0];
    case 'shock':
      return [0.42, 0.74, 1.0];
    case 'toxin':
      return [0.24, 0.92, 0.48];
    default:
      return [1.0, 0.78, 0.42];
  }
}

export class DynamicLightMap {
  public gridW = 20;
  public gridH = 20;
  public lmW = 20 * LIGHTMAP_SUB;
  public lmH = 20 * LIGHTMAP_SUB;
  public rgb = new Float32Array(this.lmW * this.lmH * 3);
  public activeCount = 0;

  private fullDist = new Float32Array(NUM_RAYS);
  private wallDist = new Float32Array(NUM_RAYS);
  private clusterVisited = new Uint8Array(400);
  private clusterQueue = new Int16Array(400);
  private footprintCache = new Map<string, CachedFootprint>();
  private candidates: LightCandidate[] = [];

  private ensureSize(gw: number, gh: number): void {
    if (this.gridW === gw && this.gridH === gh) return;
    this.gridW = gw;
    this.gridH = gh;
    this.lmW = gw * LIGHTMAP_SUB;
    this.lmH = gh * LIGHTMAP_SUB;
    this.rgb = new Float32Array(this.lmW * this.lmH * 3);
    if (this.clusterVisited.length < gw * gh) {
      this.clusterVisited = new Uint8Array(gw * gh);
      this.clusterQueue = new Int16Array(gw * gh);
    }
    this.footprintCache.clear();
  }

  private computeGeometryStamp(sector: SectorDefinition): number {
    let h = 2166136261;
    for (let i = 0; i < sector.id.length; i++) {
      h ^= sector.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const gw = sector.width;
    const gh = sector.height;
    for (let y = 0; y < gh; y++) {
      const row = sector.grid[y];
      for (let x = 0; x < gw; x++) {
        const c = row[x];
        let code = 0;
        if (c.kind === 'wall') code = 1;
        else if (c.kind === 'cover' && c.coverHp > 0) code = 2;
        else if ((c.kind === 'door' || c.kind === 'gate') && c.doorOpen < 0.7) code = 3;
        if (code !== 0) {
          h ^= (y * gw + x) * 7 + code;
          h = Math.imul(h, 16777619);
        }
      }
    }
    return h >>> 0;
  }

  private isCellOpaque(sector: SectorDefinition, gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= sector.width || gy >= sector.height) return true;
    const cell = sector.grid[gy][gx];
    if (cell.kind === 'wall') return true;
    if ((cell.kind === 'door' || cell.kind === 'gate') && cell.doorOpen < 0.7) return true;
    return false;
  }

  private castOcclusionFan(sector: SectorDefinition, lx: number, ly: number, radius: number): void {
    const gw = sector.width;
    const gh = sector.height;
    const maxTrace = radius + 0.35;

    for (let i = 0; i < NUM_RAYS; i++) {
      const rdx = RAY_COS[i];
      const rdy = RAY_SIN[i];
      let mapX = lx | 0;
      let mapY = ly | 0;
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);

      const stepX = rdx < 0 ? -1 : 1;
      const stepY = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (lx - mapX) * ddx : (mapX + 1.0 - lx) * ddx;
      let sdy = rdy < 0 ? (ly - mapY) * ddy : (mapY + 1.0 - ly) * ddy;

      let firstCover = -1;
      let hitWall = maxTrace;
      let steps = 0;

      while (steps < 36) {
        steps++;
        let side = 0;
        if (sdx < sdy) {
          sdx += ddx;
          mapX += stepX;
          side = 0;
        } else {
          sdy += ddy;
          mapY += stepY;
          side = 1;
        }

        const dist = side === 0 ? sdx - ddx : sdy - ddy;
        if (dist >= maxTrace) break;

        if (mapX < 0 || mapY < 0 || mapX >= gw || mapY >= gh) {
          hitWall = dist;
          break;
        }

        const cell = sector.grid[mapY][mapX];
        if (cell.kind === 'wall' || ((cell.kind === 'door' || cell.kind === 'gate') && cell.doorOpen < 0.7)) {
          hitWall = dist;
          break;
        }
        if (cell.kind === 'cover' && cell.coverHp > 0 && firstCover < 0) {
          firstCover = dist;
        }
      }

      this.wallDist[i] = hitWall;
      this.fullDist[i] = firstCover >= 0 ? Math.min(firstCover, hitWall) : hitWall;
    }
  }

  private rayVisAt(bin: number, dist: number): number {
    if (dist <= this.fullDist[bin] + 0.16) return 1.0;
    if (dist <= this.wallDist[bin] + 0.16) return 0.18;
    return 0.0;
  }

  private buildWeights(
    sector: SectorDefinition,
    lx: number,
    ly: number,
    radius: number,
    minSx: number,
    maxSx: number,
    minSy: number,
    maxSy: number,
    outWeights: Float32Array
  ): void {
    this.castOcclusionFan(sector, lx, ly, radius);
    const invRadius = 1 / Math.max(0.1, radius);
    const rSq = radius * radius;
    const spanX = maxSx - minSx + 1;

    for (let sy = minSy; sy <= maxSy; sy++) {
      const wy = (sy + 0.5) / LIGHTMAP_SUB;
      const gy = wy | 0;
      const dy = wy - ly;
      const rowOff = (sy - minSy) * spanX;

      for (let sx = minSx; sx <= maxSx; sx++) {
        const wx = (sx + 0.5) / LIGHTMAP_SUB;
        const gx = wx | 0;
        const idx = rowOff + (sx - minSx);

        if (this.isCellOpaque(sector, gx, gy)) {
          outWeights[idx] = 0;
          continue;
        }

        const dx = wx - lx;
        const dSq = dx * dx + dy * dy;
        if (dSq >= rSq) {
          outWeights[idx] = 0;
          continue;
        }

        const dist = Math.sqrt(dSq);
        let vis = 1.0;
        if (dist > 0.12) {
          let ang = Math.atan2(dy, dx);
          if (ang < 0) ang += Math.PI * 2;
          const fBin = (ang / (Math.PI * 2)) * NUM_RAYS;
          const b0 = Math.floor(fBin) % NUM_RAYS;
          const b1 = (b0 + 1) % NUM_RAYS;
          const frac = fBin - Math.floor(fBin);
          vis =
            this.rayVisAt(b0, dist) * (1 - frac) +
            this.rayVisAt(b1, dist) * frac;
        }

        if (vis <= 0.001) {
          outWeights[idx] = 0;
          continue;
        }

        const norm = dist * invRadius;
        const falloff = (1 - norm) * (1 - norm);
        outWeights[idx] = (falloff / (1 + 0.34 * dSq)) * vis;
      }
    }
  }

  private collectLights(
    sector: SectorDefinition,
    px: number,
    py: number,
    angle: number,
    muzzleFlash: number,
    weaponElement: ElementType,
    time: number
  ): void {
    const cands = this.candidates;
    cands.length = 0;

    const gw = sector.width;
    const gh = sector.height;

    // 1. Player weapon muzzle flash (highest priority when active)
    if (muzzleFlash > 0.02) {
      let mx = px + Math.cos(angle) * 0.36;
      let my = py + Math.sin(angle) * 0.36;
      if (this.isCellOpaque(sector, mx | 0, my | 0)) {
        mx = px;
        my = py;
      }
      const [mr, mg, mb] = getWeaponLightRgb(weaponElement);
      cands.push({
        id: 'muzzle',
        x: mx,
        y: my,
        radius: 6.4,
        r: mr,
        g: mg,
        b: mb,
        intensity: 1.35 * muzzleFlash,
        priority: 1000,
        isDynamic: true,
      });
    }

    // 2. Active environmental hazards (clustered by contiguous same-type tiles)
    const visited = this.clusterVisited;
    visited.fill(0, 0, gw * gh);
    const queue = this.clusterQueue;

    for (let y = 0; y < gh; y++) {
      const row = sector.grid[y];
      for (let x = 0; x < gw; x++) {
        const cellIdx = y * gw + x;
        if (visited[cellIdx]) continue;
        const haz = row[x].hazard;
        if (
          haz !== 'burning' &&
          haz !== 'electrified' &&
          haz !== 'frozen' &&
          haz !== 'coolant' &&
          haz !== 'toxic'
        ) {
          continue;
        }

        // BFS cluster of adjacent identical hazard tiles
        visited[cellIdx] = 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = cellIdx;
        let sumX = 0;
        let sumY = 0;
        let count = 0;

        while (head < tail) {
          const cur = queue[head++];
          const cx = cur % gw;
          const cy = (cur / gw) | 0;
          sumX += cx + 0.5;
          sumY += cy + 0.5;
          count++;

          if (cx > 0) {
            const ni = cur - 1;
            if (!visited[ni] && sector.grid[cy][cx - 1].hazard === haz) {
              visited[ni] = 1;
              queue[tail++] = ni;
            }
          }
          if (cx + 1 < gw) {
            const ni = cur + 1;
            if (!visited[ni] && sector.grid[cy][cx + 1].hazard === haz) {
              visited[ni] = 1;
              queue[tail++] = ni;
            }
          }
          if (cy > 0) {
            const ni = cur - gw;
            if (!visited[ni] && sector.grid[cy - 1][cx].hazard === haz) {
              visited[ni] = 1;
              queue[tail++] = ni;
            }
          }
          if (cy + 1 < gh) {
            const ni = cur + gw;
            if (!visited[ni] && sector.grid[cy + 1][cx].hazard === haz) {
              visited[ni] = 1;
              queue[tail++] = ni;
            }
          }
        }

        let lx = sumX / count;
        let ly = sumY / count;
        if (this.isCellOpaque(sector, lx | 0, ly | 0)) {
          lx = x + 0.5;
          ly = y + 0.5;
        }

        const dx = lx - px;
        const dy = ly - py;
        const dSq = dx * dx + dy * dy;
        if (dSq > 144) continue; // > 12 tiles away

        const seed = x * 17 + y * 31;
        const radBoost = Math.min(1.0, (count - 1) * 0.24);
        let r = 1;
        let g = 1;
        let b = 1;
        let baseRadius = 3.6;
        let intensity = 0.7;

        if (haz === 'burning') {
          r = 1.0;
          g = 0.44;
          b = 0.1;
          baseRadius = 4.6 + radBoost;
          intensity = 0.98 * (0.84 + 0.16 * Math.sin(time * 13 + seed) * Math.cos(time * 7.3 + seed));
        } else if (haz === 'electrified') {
          r = 0.36;
          g = 0.74;
          b = 1.0;
          baseRadius = 4.4 + radBoost;
          const snap = Math.sin(time * 28 + seed) > 0.15 ? 1.0 : 0.42;
          intensity = 0.94 * snap;
        } else if (haz === 'frozen') {
          r = 0.32;
          g = 0.84;
          b = 1.0;
          baseRadius = 3.8 + radBoost;
          intensity = 0.76 * (0.92 + 0.08 * Math.sin(time * 2.8 + seed));
        } else if (haz === 'coolant') {
          r = 0.2;
          g = 0.72;
          b = 0.96;
          baseRadius = 3.4 + radBoost;
          intensity = 0.56 * (0.9 + 0.1 * Math.sin(time * 3.1 + seed));
        } else {
          // toxic
          r = 0.22;
          g = 0.92;
          b = 0.42;
          baseRadius = 3.7 + radBoost;
          intensity = 0.72 * (0.88 + 0.12 * Math.sin(time * 4.2 + seed));
        }

        cands.push({
          id: `${sector.id}_haz_${haz}_${x}_${y}`,
          x: lx,
          y: ly,
          radius: baseRadius,
          r,
          g,
          b,
          intensity,
          priority: (intensity * 2.4) / (dSq + 0.75),
          isDynamic: false,
        });
      }
    }

    // 3. Intact volatile barrels (fuel, cryo, shock)
    for (let i = 0; i < sector.entities.length; i++) {
      const e = sector.entities[i];
      if (e.dead) continue;
      if (
        e.kind !== 'barrel_fuel' &&
        e.kind !== 'barrel_cryo' &&
        e.kind !== 'barrel_shock'
      ) {
        continue;
      }

      const dx = e.x - px;
      const dy = e.y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq > 110) continue;

      let r = 1;
      let g = 0.38;
      let b = 0.12;
      let intensity = 0.54;
      const pulse = 0.86 + 0.14 * Math.sin(time * 4.5 + i * 1.9);

      if (e.kind === 'barrel_cryo') {
        r = 0.28;
        g = 0.82;
        b = 1.0;
        intensity = 0.52 * pulse;
      } else if (e.kind === 'barrel_shock') {
        r = 0.4;
        g = 0.72;
        b = 1.0;
        intensity = 0.56 * (Math.sin(time * 19 + i) > 0.25 ? 1.0 : 0.62);
      } else {
        intensity = 0.54 * pulse;
      }

      cands.push({
        id: `${sector.id}_bar_${e.id}`,
        x: e.x,
        y: e.y,
        radius: 2.75,
        r,
        g,
        b,
        intensity,
        priority: (intensity * 1.65) / (dSq + 0.8),
        isDynamic: false,
      });
    }

    if (cands.length > MAX_ACTIVE_LIGHTS) {
      cands.sort((a, b) => b.priority - a.priority);
      cands.length = MAX_ACTIVE_LIGHTS;
    }
  }

  public solve(
    sector: SectorDefinition,
    px: number,
    py: number,
    angle: number,
    muzzleFlash: number,
    weaponElement: ElementType,
    time: number
  ): void {
    this.ensureSize(sector.width, sector.height);
    this.rgb.fill(0);

    this.collectLights(sector, px, py, angle, muzzleFlash, weaponElement, time);
    this.activeCount = this.candidates.length;
    if (this.activeCount === 0) return;

    const geomStamp = this.computeGeometryStamp(sector);
    const lmW = this.lmW;
    const lmH = this.lmH;
    const rgb = this.rgb;

    for (let li = 0; li < this.candidates.length; li++) {
      const L = this.candidates[li];
      const minSx = Math.max(0, Math.floor((L.x - L.radius) * LIGHTMAP_SUB));
      const maxSx = Math.min(lmW - 1, Math.ceil((L.x + L.radius) * LIGHTMAP_SUB));
      const minSy = Math.max(0, Math.floor((L.y - L.radius) * LIGHTMAP_SUB));
      const maxSy = Math.min(lmH - 1, Math.ceil((L.y + L.radius) * LIGHTMAP_SUB));
      const spanX = maxSx - minSx + 1;
      const spanY = maxSy - minSy + 1;
      if (spanX <= 0 || spanY <= 0) continue;

      let weights: Float32Array;
      if (L.isDynamic) {
        const needed = spanX * spanY;
        const cachedDyn = this.footprintCache.get('__muzzle__');
        if (cachedDyn && cachedDyn.weights.length >= needed) {
          weights = cachedDyn.weights;
        } else {
          weights = new Float32Array(needed);
          this.footprintCache.set('__muzzle__', {
            geomStamp: 0,
            lx: L.x,
            ly: L.y,
            radius: L.radius,
            minSx,
            maxSx,
            minSy,
            maxSy,
            weights,
          });
        }
        this.buildWeights(sector, L.x, L.y, L.radius, minSx, maxSx, minSy, maxSy, weights);
      } else {
        const cached = this.footprintCache.get(L.id);
        if (
          cached &&
          cached.geomStamp === geomStamp &&
          Math.abs(cached.lx - L.x) < 0.02 &&
          Math.abs(cached.ly - L.y) < 0.02 &&
          cached.radius === L.radius &&
          cached.minSx === minSx &&
          cached.maxSx === maxSx &&
          cached.minSy === minSy &&
          cached.maxSy === maxSy
        ) {
          weights = cached.weights;
        } else {
          weights = new Float32Array(spanX * spanY);
          this.buildWeights(sector, L.x, L.y, L.radius, minSx, maxSx, minSy, maxSy, weights);
          this.footprintCache.set(L.id, {
            geomStamp,
            lx: L.x,
            ly: L.y,
            radius: L.radius,
            minSx,
            maxSx,
            minSy,
            maxSy,
            weights,
          });
        }
      }

      const lr = L.r * L.intensity;
      const lg = L.g * L.intensity;
      const lb = L.b * L.intensity;

      for (let sy = minSy; sy <= maxSy; sy++) {
        const wRow = (sy - minSy) * spanX;
        const lmRow = sy * lmW;
        for (let sx = minSx; sx <= maxSx; sx++) {
          const w = weights[wRow + (sx - minSx)];
          if (w <= 0.001) continue;
          const off = (lmRow + sx) * 3;
          rgb[off] += lr * w;
          rgb[off + 1] += lg * w;
          rgb[off + 2] += lb * w;
        }
      }
    }
  }
}
