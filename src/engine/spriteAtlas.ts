export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
  alphaKey: boolean;
  isWall?: boolean;
}

export const SPRITE_SHEET_PATH =
  '/assets/aistudio/Gemini_Generated_Image_h6ltkuh6ltkuh6lt_bbf891be.jpg';

// Pixel coordinates mapped directly from the 1408x768 sprite sheet
export const ATLAS_RECTS: Record<string, AtlasRect> = {
  // Walls (Row 1 & 2)
  wall_concrete_clean: { x: 4, y: 2, w: 103, h: 111, alphaKey: false, isWall: true },
  wall_concrete_cracked: { x: 115, y: 2, w: 105, h: 111, alphaKey: false, isWall: true },
  wall_panel_blue: { x: 228, y: 2, w: 112, h: 111, alphaKey: false, isWall: true },
  wall_brick_gray: { x: 352, y: 2, w: 110, h: 111, alphaKey: false, isWall: true },
  wall_concrete_graffiti: { x: 470, y: 2, w: 109, h: 111, alphaKey: false, isWall: true },
  wall_shutter_rust: { x: 590, y: 2, w: 106, h: 111, alphaKey: false, isWall: true },

  wall_graffiti_guads: { x: 4, y: 124, w: 103, h: 112, alphaKey: false, isWall: true },
  wall_graffiti_red: { x: 115, y: 124, w: 104, h: 112, alphaKey: false, isWall: true },
  wall_graffiti_blue: { x: 228, y: 124, w: 112, h: 112, alphaKey: false, isWall: true },
  wall_brick_red: { x: 352, y: 124, w: 110, h: 112, alphaKey: false, isWall: true },
  wall_vent_rust: { x: 470, y: 124, w: 109, h: 112, alphaKey: false, isWall: true },
  wall_shutter_blue: { x: 590, y: 124, w: 106, h: 112, alphaKey: false, isWall: true },

  // Floors & Ceilings (Row 3 & 4)
  floor_concrete_a: { x: 3, y: 270, w: 102, h: 111, alphaKey: false, isWall: true },
  floor_concrete_b: { x: 112, y: 270, w: 104, h: 111, alphaKey: false, isWall: true },
  floor_metal_rust: { x: 224, y: 270, w: 106, h: 111, alphaKey: false, isWall: true },
  floor_metal_blue: { x: 352, y: 270, w: 109, h: 111, alphaKey: false, isWall: true },
  floor_lit_panel: { x: 469, y: 270, w: 107, h: 111, alphaKey: false, isWall: true },
  floor_grime: { x: 588, y: 270, w: 108, h: 111, alphaKey: false, isWall: true },
  floor_tile_dark: { x: 4, y: 387, w: 101, h: 109, alphaKey: false, isWall: true },
  floor_panel_trim: { x: 112, y: 387, w: 104, h: 109, alphaKey: false, isWall: true },
  floor_vent_cyan: { x: 230, y: 387, w: 96, h: 109, alphaKey: false, isWall: true },
  floor_grate_steel: { x: 352, y: 387, w: 109, h: 109, alphaKey: false, isWall: true },

  // Doors (rendered as sliding wall textures or decals)
  door_blue_locked: { x: 980, y: 236, w: 50, h: 97, alphaKey: false, isWall: true },
  door_steel_rust: { x: 1117, y: 236, w: 51, h: 97, alphaKey: false, isWall: true },
  door_locker: { x: 150, y: 634, w: 46, h: 106, alphaKey: false, isWall: true },
  door_wood_metal: { x: 265, y: 634, w: 61, h: 106, alphaKey: false, isWall: true },

  // Destructible Cover & World Props
  cover_crate_wood: { x: 713, y: 437, w: 47, h: 74, alphaKey: true },
  cover_crate_ammo: { x: 777, y: 437, w: 48, h: 74, alphaKey: true },
  cover_server_rack: { x: 381, y: 521, w: 53, h: 92, alphaKey: true },
  cover_dumpster_green: { x: 474, y: 521, w: 73, h: 92, alphaKey: true },
  cover_dumpster_blue: { x: 1067, y: 48, w: 111, h: 135, alphaKey: true },
  prop_trash_can: { x: 1191, y: 78, w: 39, h: 105, alphaKey: true },

  // Interactives & Terminals & Vending Machines
  prop_terminal_atm: { x: 7, y: 521, w: 96, h: 92, alphaKey: true },
  prop_desk_console: { x: 225, y: 521, w: 103, h: 92, alphaKey: true },
  prop_terminal_green: { x: 843, y: 236, w: 73, h: 97, alphaKey: true },
  prop_terminal_small: { x: 774, y: 245, w: 50, h: 88, alphaKey: true },
  prop_keypad: { x: 713, y: 255, w: 45, h: 78, alphaKey: true },
  prop_server_wide: { x: 1196, y: 242, w: 115, h: 91, alphaKey: true },
  prop_vending_red: { x: 715, y: 7, w: 84, h: 176, alphaKey: true },
  prop_vending_amber: { x: 815, y: 7, w: 71, h: 176, alphaKey: true },
  prop_vending_blue: { x: 1107, y: 649, w: 56, h: 97, alphaKey: true },
  prop_vending_white: { x: 1253, y: 649, w: 57, h: 97, alphaKey: true },

  // Loot & Pickups
  obj_medkit: { x: 713, y: 387, w: 47, h: 39, alphaKey: true },
  obj_ammo_red: { x: 778, y: 387, w: 54, h: 39, alphaKey: true },
  obj_ammo_green: { x: 860, y: 387, w: 62, h: 39, alphaKey: true },

  // Weapons (HUD viewmodel cutouts)
  weapon_pistol: { x: 964, y: 384, w: 50, h: 42, alphaKey: true },
  weapon_rifle: { x: 1068, y: 382, w: 138, h: 48, alphaKey: true },
  weapon_smg: { x: 844, y: 444, w: 94, h: 52, alphaKey: true },
  weapon_shotgun: { x: 1222, y: 382, w: 82, h: 44, alphaKey: true },

  // Enemies & NPCs
  enemy_guard_1: { x: 715, y: 551, w: 35, h: 77, alphaKey: true },
  enemy_guard_2: { x: 771, y: 551, w: 34, h: 77, alphaKey: true },
  enemy_mercenary: { x: 834, y: 551, w: 36, h: 77, alphaKey: true },
  enemy_scout: { x: 902, y: 565, w: 25, h: 63, alphaKey: true },
  enemy_rat_1: { x: 978, y: 572, w: 42, h: 56, alphaKey: true },
  enemy_rat_2: { x: 1049, y: 572, w: 41, h: 56, alphaKey: true },
  enemy_droid_1: { x: 1193, y: 551, w: 35, h: 77, alphaKey: true },
  enemy_droid_2: { x: 1264, y: 551, w: 35, h: 77, alphaKey: true },
  npc_civilian: { x: 835, y: 649, w: 40, h: 97, alphaKey: true },
  npc_hazmat: { x: 894, y: 649, w: 38, h: 97, alphaKey: true },
  npc_agent: { x: 1264, y: 437, w: 34, h: 74, alphaKey: true },
};

export interface ExtractedSprite {
  id: string;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  pixels: Uint8ClampedArray; // RGBA bytes for ultra-fast raycaster sampling
}

export class SpriteAtlasManager {
  private sprites = new Map<string, ExtractedSprite>();
  public ready = false;
  public sourceImage: HTMLImageElement | null = null;

  async load(): Promise<void> {
    if (this.ready) return;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = (err) => reject(err);
      el.src = SPRITE_SHEET_PATH;
    });
    this.sourceImage = img;

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = img.width;
    sheetCanvas.height = img.height;
    const sheetCtx = sheetCanvas.getContext('2d', { willReadFrequently: true })!;
    sheetCtx.drawImage(img, 0, 0);

    for (const [id, rect] of Object.entries(ATLAS_RECTS)) {
      const targetW = rect.isWall ? 64 : rect.w;
      const targetH = rect.isWall ? 64 : rect.h;
      const c = document.createElement('canvas');
      c.width = targetW;
      c.height = targetH;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = rect.isWall ? true : false;
      ctx.drawImage(
        sheetCanvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        targetW,
        targetH
      );

      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      if (rect.alphaKey) {
        this.floodFillBackgroundKey(imgData.data, targetW, targetH);
        ctx.putImageData(imgData, 0, 0);
      }

      this.sprites.set(id, {
        id,
        width: targetW,
        height: targetH,
        canvas: c,
        pixels: imgData.data,
      });

      if (rect.isWall) {
        this.bakeCoverDamageStage(id, imgData.data, targetW, targetH, 1);
        this.bakeCoverDamageStage(id, imgData.data, targetW, targetH, 2);
      }
    }
    this.ready = true;
  }

  private bakeCoverDamageStage(
    baseId: string,
    srcPixels: Uint8ClampedArray,
    w: number,
    h: number,
    stage: 1 | 2
  ): void {
    const out = new Uint8ClampedArray(srcPixels);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Deterministic structural crack & spall pattern
        const diagA = (x + y * 2) % (stage === 1 ? 23 : 15);
        const diagB = (x * 2 - y + 128) % (stage === 1 ? 29 : 19);
        const hash = ((x * 73 + y * 137) & 31);
        const isCrack =
          diagA === 0 ||
          (stage === 2 && diagB <= 1) ||
          (stage === 1 && diagB === 0 && y < h * 0.72);
        const isChip =
          (y < (stage === 1 ? 10 : 20) && hash < (stage === 1 ? 8 : 16)) ||
          (stage === 2 && hash < 5 && y < h * 0.85);

        if (isChip) {
          // Deep shadowed spall cavity
          out[i] = (out[i] * 0.22) | 0;
          out[i + 1] = (out[i + 1] * 0.22) | 0;
          out[i + 2] = (out[i + 2] * 0.24) | 0;
        } else if (isCrack) {
          // Dark fracture seam
          out[i] = (out[i] * 0.34) | 0;
          out[i + 1] = (out[i + 1] * 0.33) | 0;
          out[i + 2] = (out[i + 2] * 0.35) | 0;
        } else if (stage === 2) {
          // Slight weathered darkening & scorch
          out[i] = (out[i] * 0.84) | 0;
          out[i + 1] = (out[i + 1] * 0.82) | 0;
          out[i + 2] = (out[i + 2] * 0.8) | 0;
        }
      }
    }

    ctx.putImageData(new ImageData(out, w, h), 0, 0);
    this.sprites.set(`${baseId}_dmg${stage}`, {
      id: `${baseId}_dmg${stage}`,
      width: w,
      height: h,
      canvas: c,
      pixels: out,
    });
  }

  /**
   * Edge-seeded flood fill removes the dark grid background (~#161A20)
   * without erasing dark interior details like boots, rifles, or visors.
   */
  private floodFillBackgroundKey(
    data: Uint8ClampedArray,
    w: number,
    h: number
  ): void {
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const isBgPixel = (idx: number): boolean => {
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      // Background grid cells are cool dark slate (#12151C .. #2A303A)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;
      return maxC < 56 && sat < 18 && b >= r - 2;
    };

    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const idx = y * w + x;
      if (visited[idx]) return;
      if (isBgPixel(idx)) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }

    while (head < tail) {
      const idx = queue[head++];
      data[idx * 4 + 3] = 0; // transparent
      const x = idx % w;
      const y = (idx / w) | 0;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    // Soft anti-fringe pass for 1px halo around cutouts
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (data[idx * 4 + 3] === 0) continue;
        const p = idx * 4;
        const maxC = Math.max(data[p], data[p + 1], data[p + 2]);
        if (maxC < 44) {
          const adjTransparent =
            data[(idx - 1) * 4 + 3] === 0 ||
            data[(idx + 1) * 4 + 3] === 0 ||
            data[(idx - w) * 4 + 3] === 0 ||
            data[(idx + w) * 4 + 3] === 0;
          if (adjTransparent) {
            data[p + 3] = 90;
          }
        }
      }
    }
  }

  get(id: string): ExtractedSprite | undefined {
    return this.sprites.get(id);
  }
}

export const spriteAtlas = new SpriteAtlasManager();
