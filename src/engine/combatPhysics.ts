import {
  DebuffElement,
  DecalKind,
  ElementType,
  FactionId,
  PlayerCharacter,
  ProjectileParticle,
  SectorDefinition,
  SurfaceDecal,
  Weapon,
  WorldEntity,
} from '../types/game';

export interface PlayerBlastSplash {
  element: DebuffElement;
  x: number;
  y: number;
  radius: number;
  maxDmg: number;
}

export interface ShotOutcome {
  hitEvents: Array<{ text: string; tone: 'info' | 'combo' | 'rep' | 'danger' }>;
  repShifts: Partial<Record<FactionId, number>>;
  creditsGained: number;
  materialsGained: Partial<Record<keyof PlayerCharacter['materials'], number>>;
  playerSplashes?: PlayerBlastSplash[];
}

export function getElementColor(el: ElementType): string {
  switch (el) {
    case 'thermal':
      return '#F59E0B';
    case 'cryo':
      return '#38BDF8';
    case 'shock':
      return '#60A5FA';
    case 'toxin':
      return '#34D399';
    default:
      return '#E2E8F0';
  }
}

export const MAX_PARTICLES = 180;

const EMBER_COLORS = ['#F59E0B', '#EF4444', '#FEF08A'];
const FROST_COLORS = ['#7DD3FC', '#BAE6FD', '#E0F2FE'];
const SPARK_COLORS = ['#60A5FA', '#38BDF8', '#FEF9C3'];

function pushParticleCapped(
  list: ProjectileParticle[],
  pt: ProjectileParticle
): void {
  if (list.length >= MAX_PARTICLES) {
    list.shift();
  }
  list.push(pt);
}

export function spawnParticles(
  list: ProjectileParticle[],
  x: number,
  y: number,
  z: number,
  color: string,
  count: number,
  speed = 2.6
): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.3 + Math.random() * 0.7) * speed;
    const life = 0.35 + Math.random() * 0.35;
    pushParticleCapped(list, {
      x,
      y,
      z,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      vz: 0.8 + Math.random() * 1.8,
      color,
      size: 2.5 + Math.random() * 2.5,
      life,
      maxLife: life,
      kind: 'ballistic',
      gravity: 6.5,
      drag: 0.4,
      jitter: 0,
      sizeGrowth: 0,
      alpha: 1,
    });
  }
}

export function emitStatusParticles(
  list: ProjectileParticle[],
  ent: WorldEntity,
  element: ElementType
): void {
  const angle = Math.random() * Math.PI * 2;
  const rOff = 0.1 + Math.random() * 0.24;
  const sx = ent.x + Math.cos(angle) * rOff;
  const sy = ent.y + Math.sin(angle) * rOff;
  const sz = (0.22 + Math.random() * 0.55) * ent.scale;

  if (element === 'thermal') {
    // Burning: buoyant rising embers with gentle horizontal swirl
    const life = 0.55 + Math.random() * 0.4;
    pushParticleCapped(list, {
      x: sx,
      y: sy,
      z: sz,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      vz: 0.65 + Math.random() * 0.75,
      color: EMBER_COLORS[(Math.random() * EMBER_COLORS.length) | 0],
      size: 1.8 + Math.random() * 1.3,
      life,
      maxLife: life,
      kind: 'ember',
      gravity: -1.6, // thermal buoyancy rises upward
      drag: 1.1,
      jitter: 0.65,
      sizeGrowth: -0.9,
      alpha: 0.95,
    });
  } else if (element === 'cryo') {
    // Frozen: cold drifting frost mist expanding outward and settling slowly
    const life = 0.7 + Math.random() * 0.45;
    pushParticleCapped(list, {
      x: sx,
      y: sy,
      z: sz * 0.85,
      vx: Math.cos(angle) * (0.45 + Math.random() * 0.45),
      vy: Math.sin(angle) * (0.45 + Math.random() * 0.45),
      vz: 0.06 - Math.random() * 0.18,
      color: FROST_COLORS[(Math.random() * FROST_COLORS.length) | 0],
      size: 3.8 + Math.random() * 2.2,
      life,
      maxLife: life,
      kind: 'frost',
      gravity: 0.22,
      drag: 2.5,
      jitter: 0.25,
      sizeGrowth: 2.4,
      alpha: 0.58,
    });
  } else if (element === 'shock') {
    // Shocked: high-velocity erratic electrical sparks snapping in 3D space
    const burst = 2;
    for (let i = 0; i < burst; i++) {
      const a2 = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 2.2;
      const life = 0.16 + Math.random() * 0.16;
      pushParticleCapped(list, {
        x: sx,
        y: sy,
        z: sz,
        vx: Math.cos(a2) * sp,
        vy: Math.sin(a2) * sp,
        vz: (Math.random() - 0.3) * 2.2,
        color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
        size: 1.6 + Math.random() * 1.1,
        life,
        maxLife: life,
        kind: 'spark',
        gravity: 0,
        drag: 3.2,
        jitter: 8.5,
        sizeGrowth: -1.5,
        alpha: 1,
      });
    }
  }
}

const CONCRETE_DUST_COLORS = ['#94A3B8', '#CBD5E1', '#64748B'];
const GRIME_DEBRIS_COLORS = ['#78716C', '#A8A29E', '#92400E'];
const METAL_SCUFF_COLORS = ['#64748B', '#94A3B8', '#CBD5E1'];
const VENT_VAPOR_COLORS = ['#7DD3FC', '#BAE6FD', '#CBD5E1'];

export function emitFootstepParticles(
  list: ProjectileParticle[],
  px: number,
  py: number,
  angle: number,
  cell: SectorDefinition['grid'][number][number] | undefined,
  isSprinting: boolean,
  footSide: 1 | -1
): void {
  if (!cell) return;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  // Spawn slightly ahead of camera near plane at foot height with L/R lateral offset
  const fx = px + cosA * 0.45 - sinA * (0.16 * footSide);
  const fy = py + sinA * 0.45 + cosA * (0.16 * footSide);

  const count = isSprinting ? 3 + ((Math.random() * 2) | 0) : 1 + ((Math.random() * 2) | 0);
  const haz = cell.hazard;
  const tex = cell.floorTex;

  for (let i = 0; i < count; i++) {
    const spreadA = angle + Math.PI + (Math.random() - 0.5) * 1.9;
    const baseSp = (isSprinting ? 0.85 : 0.4) + Math.random() * (isSprinting ? 0.75 : 0.35);

    let color = CONCRETE_DUST_COLORS[(Math.random() * CONCRETE_DUST_COLORS.length) | 0];
    let kind: ProjectileParticle['kind'] = 'frost';
    let gravity = 1.4;
    let drag = 3.6;
    let size = isSprinting ? 2.8 : 2.1;
    let sizeGrowth = 1.4;
    let alpha = isSprinting ? 0.52 : 0.38;
    let life = 0.32 + Math.random() * 0.22;
    let vz = (isSprinting ? 0.65 : 0.35) + Math.random() * 0.35;

    if (haz === 'coolant') {
      color = Math.random() > 0.4 ? '#38BDF8' : '#BAE6FD';
      kind = 'ballistic';
      gravity = 5.4;
      drag = 1.8;
      size = 1.9 + Math.random() * 1.1;
      sizeGrowth = -0.4;
      alpha = 0.85;
      vz = (isSprinting ? 1.25 : 0.75) + Math.random() * 0.5;
    } else if (haz === 'oil') {
      color = Math.random() > 0.4 ? '#1E293B' : '#475569';
      kind = 'ballistic';
      gravity = 6.0;
      drag = 1.5;
      size = 2.0 + Math.random() * 1.0;
      sizeGrowth = 0;
      alpha = 0.88;
      vz = (isSprinting ? 1.15 : 0.65) + Math.random() * 0.4;
    } else if (haz === 'frozen') {
      color = Math.random() > 0.35 ? '#E0F2FE' : '#7DD3FC';
      kind = 'ballistic';
      gravity = 4.6;
      drag = 2.1;
      size = 1.8 + Math.random() * 1.2;
      sizeGrowth = -0.3;
      alpha = 0.9;
    } else if (haz === 'burning') {
      color = Math.random() > 0.4 ? '#F59E0B' : '#EF4444';
      kind = 'ember';
      gravity = -1.1;
      drag = 1.8;
      size = 1.8 + Math.random() * 1.0;
      sizeGrowth = -0.8;
      alpha = 0.92;
    } else if (haz === 'electrified') {
      color = Math.random() > 0.4 ? '#60A5FA' : '#FEF9C3';
      kind = 'spark';
      gravity = 0.4;
      drag = 3.5;
      size = 1.6 + Math.random() * 0.8;
      sizeGrowth = -1.2;
      alpha = 0.95;
      life = 0.18 + Math.random() * 0.12;
    } else if (haz === 'toxic') {
      color = Math.random() > 0.4 ? '#34D399' : '#10B981';
      kind = 'ballistic';
      gravity = 5.2;
      drag = 1.9;
      size = 2.0 + Math.random() * 1.0;
      alpha = 0.85;
    } else if (tex === 'floor_grime') {
      color = GRIME_DEBRIS_COLORS[(Math.random() * GRIME_DEBRIS_COLORS.length) | 0];
      kind = 'ballistic';
      gravity = 5.8;
      drag = 1.8;
      size = isSprinting ? 2.3 : 1.7;
      sizeGrowth = 0;
      alpha = isSprinting ? 0.78 : 0.6;
      vz = (isSprinting ? 1.05 : 0.55) + Math.random() * 0.4;
    } else if (
      tex === 'floor_metal_blue' ||
      tex === 'floor_metal_rust' ||
      tex === 'floor_grate_steel'
    ) {
      const sparkKick = isSprinting && Math.random() < 0.25;
      color = sparkKick
        ? '#F59E0B'
        : METAL_SCUFF_COLORS[(Math.random() * METAL_SCUFF_COLORS.length) | 0];
      kind = sparkKick ? 'spark' : 'ballistic';
      gravity = sparkKick ? 1.2 : 5.2;
      drag = 2.6;
      size = sparkKick ? 1.5 : 1.8;
      sizeGrowth = 0;
      alpha = sparkKick ? 0.92 : 0.55;
    } else if (tex === 'floor_vent_cyan' || tex === 'floor_lit_panel') {
      color = VENT_VAPOR_COLORS[(Math.random() * VENT_VAPOR_COLORS.length) | 0];
      kind = 'frost';
      gravity = -0.35;
      drag = 3.2;
      size = isSprinting ? 3.0 : 2.3;
      sizeGrowth = 1.8;
      alpha = isSprinting ? 0.48 : 0.34;
    }

    pushParticleCapped(list, {
      x: fx + (Math.random() - 0.5) * 0.08,
      y: fy + (Math.random() - 0.5) * 0.08,
      z: 0.06 + Math.random() * 0.05,
      vx: Math.cos(spreadA) * baseSp,
      vy: Math.sin(spreadA) * baseSp,
      vz,
      color,
      size,
      life,
      maxLife: life,
      kind,
      gravity,
      drag,
      jitter: kind === 'spark' ? 4.5 : 0.2,
      sizeGrowth,
      alpha,
    });
  }
}

export function stepParticles(list: ProjectileParticle[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const pt = list[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      list.splice(i, 1);
      continue;
    }

    const drag = pt.drag ?? 0;
    if (drag > 0) {
      const damp = Math.max(0, 1 - drag * dt);
      pt.vx *= damp;
      pt.vy *= damp;
      if (pt.kind === 'spark' || pt.kind === 'frost') {
        pt.vz *= damp;
      }
    }

    const jitter = pt.jitter ?? 0;
    if (jitter > 0) {
      pt.vx += (Math.random() - 0.5) * jitter * dt * 2;
      pt.vy += (Math.random() - 0.5) * jitter * dt * 2;
      if (pt.kind === 'spark') {
        pt.vz += (Math.random() - 0.5) * jitter * dt * 1.6;
      }
    }

    const gravity = pt.gravity ?? 6.5;
    pt.vz -= gravity * dt;

    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z = Math.max(0.05, Math.min(1.35, pt.z + pt.vz * dt));

    if (pt.sizeGrowth) {
      pt.size = Math.max(0.8, pt.size + pt.sizeGrowth * dt);
    }
  }
}

export function hasLineOfSight(
  sector: SectorDefinition,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist * 5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const gx = Math.floor(x0 + dx * t);
    const gy = Math.floor(y0 + dy * t);
    if (gx < 0 || gy < 0 || gx >= sector.width || gy >= sector.height) return false;
    const cell = sector.grid[gy][gx];
    if (cell.kind === 'wall') return false;
    if ((cell.kind === 'door' || cell.kind === 'gate') && cell.doorOpen < 0.75) {
      return false;
    }
    if (cell.kind === 'cover' && cell.coverHp > 0 && cell.coverHeight > 0.7) {
      return false;
    }
  }
  return true;
}

export function firePlayerWeapon(
  sector: SectorDefinition,
  player: PlayerCharacter,
  px: number,
  py: number,
  angle: number,
  particles: ProjectileParticle[]
): ShotOutcome {
  const weapon: Weapon = player.weapons[player.activeWeaponIndex];
  const outcome: ShotOutcome = {
    hitEvents: [],
    repShifts: {},
    creditsGained: 0,
    materialsGained: {},
  };

  const ballisticsMult = 1 + (player.attributes.ballistics - 2) * 0.08;
  const critChance = Math.min(0.45, player.attributes.neural * 0.04);
  const elemCol = getElementColor(weapon.element);

  for (let p = 0; p < weapon.pellets; p++) {
    const rayAngle = angle + (Math.random() - 0.5) * weapon.spread * 2;
    const rdx = Math.cos(rayAngle);
    const rdy = Math.sin(rayAngle);

    let hitWallDist = weapon.range;
    let hitCoverCell: { x: number; y: number; dist: number } | null = null;
    let hitFloorCell: { x: number; y: number } | null = null;

    // Step ray to check walls, destructible cover, and floor hazards
    const stepSize = 0.08;
    for (let d = 0.25; d < weapon.range; d += stepSize) {
      const rx = px + rdx * d;
      const ry = py + rdy * d;
      const gx = Math.floor(rx);
      const gy = Math.floor(ry);
      if (gx < 0 || gy < 0 || gx >= sector.width || gy >= sector.height) {
        hitWallDist = d;
        break;
      }
      const cell = sector.grid[gy][gx];
      if (cell.kind === 'wall' || ((cell.kind === 'door' || cell.kind === 'gate') && cell.doorOpen < 0.85)) {
        hitWallDist = d;
        spawnParticles(particles, rx, ry, 0.5, elemCol, 2, 1.5);
        break;
      }
      if (cell.kind === 'cover' && cell.coverHp > 0) {
        hitCoverCell = { x: gx, y: gy, dist: d };
        hitWallDist = d;
        spawnParticles(particles, rx, ry, 0.35, '#94A3B8', 4, 2.2);
        break;
      }
      if (cell.hazard !== 'none' && !hitFloorCell) {
        hitFloorCell = { x: gx, y: gy };
      }
    }

    // Check closest entity along ray before wall/cover
    let bestEnt: WorldEntity | null = null;
    let bestEntDist = hitWallDist;

    for (const ent of sector.entities) {
      if (ent.dead) continue;
      if (
        ent.kind === 'loot_ammo' ||
        ent.kind === 'loot_medkit' ||
        ent.kind === 'loot_scrap' ||
        ent.kind === 'terminal' ||
        ent.kind === 'vending'
      ) {
        continue;
      }
      const ex = ent.x - px;
      const ey = ent.y - py;
      const proj = ex * rdx + ey * rdy;
      if (proj <= 0.15 || proj >= bestEntDist) continue;
      const perpSq = ex * ex + ey * ey - proj * proj;
      const hitRadius = ent.kind === 'enemy_rat' ? 0.34 : 0.42;
      if (perpSq <= hitRadius * hitRadius) {
        bestEntDist = proj;
        bestEnt = ent;
      }
    }

    if (bestEnt) {
      const isCrit = Math.random() < critChance;
      let dmg = weapon.damage * ballisticsMult * (isCrit ? 1.5 : 1.0);

      // Elemental Combo Checks on Entities
      if (bestEnt.statusElement === 'cryo' && weapon.element === 'kinetic') {
        const bonus = player.perk === 'hollow_point' ? 1.85 : 1.5;
        dmg *= bonus;
        bestEnt.statusElement = null;
        bestEnt.statusTimer = 0;
        outcome.hitEvents.push({
          text: 'Cryo Shatter Combo',
          tone: 'combo',
        });
        spawnParticles(particles, bestEnt.x, bestEnt.y, 0.55, '#7DD3FC', 12, 3.8);
      } else if (
        bestEnt.statusElement === 'thermal' &&
        weapon.element === 'cryo'
      ) {
        dmg *= 1.45;
        bestEnt.statusElement = null;
        outcome.hitEvents.push({ text: 'Thermal Shock Combo', tone: 'combo' });
      } else if (
        bestEnt.statusElement === 'cryo' &&
        weapon.element === 'shock'
      ) {
        dmg *= 1.4;
        outcome.hitEvents.push({ text: 'Superconduct Arc', tone: 'combo' });
      }

      if (bestEnt.kind === 'npc' && !bestEnt.hostile) {
        bestEnt.hostile = true;
        if (bestEnt.faction) {
          outcome.repShifts[bestEnt.faction] =
            (outcome.repShifts[bestEnt.faction] || 0) - 25;
          outcome.hitEvents.push({
            text: `${bestEnt.name} turned hostile!`,
            tone: 'danger',
          });
        }
      }

      // If shooting an explosive/elemental barrel
      if (
        bestEnt.kind === 'barrel_fuel' ||
        bestEnt.kind === 'barrel_cryo' ||
        bestEnt.kind === 'barrel_shock'
      ) {
        bestEnt.hp -= dmg;
        spawnParticles(particles, bestEnt.x, bestEnt.y, 0.45, elemCol, 5, 2.5);
        if (bestEnt.hp <= 0) {
          bestEnt.dead = true;
          triggerBarrelDetonation(sector, bestEnt, particles, outcome);
        }
        continue;
      }

      bestEnt.hp -= dmg;
      bestEnt.alerted = true;
      bestEnt.hostile = true;
      if (weapon.element !== 'kinetic') {
        bestEnt.statusElement = weapon.element;
        bestEnt.statusTimer =
          weapon.element === 'cryo' && player.perk === 'cryo_shatter' ? 5.5 : 3.5;
      }

      const isFatalHit = bestEnt.hp <= 0 && !bestEnt.dead;
      const splatterCol = bestEnt.kind === 'enemy_droid' ? '#1E293B' : '#B91C1C';
      emitEntitySplatterDecals(sector, bestEnt, rdx, rdy, isFatalHit);
      spawnParticles(particles, bestEnt.x, bestEnt.y, 0.5, elemCol, 6, 2.5);
      spawnParticles(particles, bestEnt.x, bestEnt.y, 0.45, splatterCol, 4, 2.8);

      // Check floor hazard under entity for Shock + Coolant chain
      const egx = Math.floor(bestEnt.x);
      const egy = Math.floor(bestEnt.y);
      const underCell = sector.grid[egy]?.[egx];
      if (underCell && underCell.hazard === 'coolant' && weapon.element === 'shock') {
        triggerFloorReaction(sector, egx, egy, 'shock', player, particles, outcome);
      }

      if (bestEnt.hp <= 0 && !bestEnt.dead) {
        bestEnt.dead = true;
        outcome.creditsGained += 25;
        outcome.materialsGained.scrap = (outcome.materialsGained.scrap || 0) + 1;
        if (bestEnt.kind === 'enemy_droid') {
          outcome.materialsGained.microchip =
            (outcome.materialsGained.microchip || 0) + 1;
          outcome.materialsGained.arc_coil =
            (outcome.materialsGained.arc_coil || 0) + 1;
        } else if (bestEnt.kind === 'enemy_rat') {
          outcome.materialsGained.bio_gel =
            (outcome.materialsGained.bio_gel || 0) + 1;
        }
        if (bestEnt.faction) {
          outcome.repShifts[bestEnt.faction] =
            (outcome.repShifts[bestEnt.faction] || 0) - 8;
        }
        spawnParticles(particles, bestEnt.x, bestEnt.y, 0.45, splatterCol, 10, 3.2);
      }
    } else if (hitCoverCell) {
      const cell = sector.grid[hitCoverCell.y][hitCoverCell.x];
      const maxHp = Math.max(1, cell.coverMaxHp);
      const prevPct = cell.coverHp / maxHp;
      const prevStage = prevPct > 0.66 ? 0 : prevPct > 0.33 ? 1 : 2;

      let cDmg = weapon.damage * ballisticsMult;
      if (player.perk === 'hollow_point') cDmg *= 1.4;
      if (weapon.element === 'thermal' || weapon.archetype === 'shotgun') {
        cDmg *= 1.25;
      }
      cell.coverHp -= cDmg;
      cell.coverShake = 1.0;

      if (cell.coverHp <= 0) {
        cell.kind = 'empty';
        cell.coverHp = 0;
        cell.coverShake = 0;
        outcome.materialsGained.scrap = (outcome.materialsGained.scrap || 0) + 1;
        outcome.hitEvents.push({
          text: 'Cover Shattered (+1 Scrap)',
          tone: 'info',
        });
        spawnParticles(
          particles,
          hitCoverCell.x + 0.5,
          hitCoverCell.y + 0.5,
          0.45,
          '#CBD5E1',
          14,
          4.0
        );
      } else {
        const nextPct = cell.coverHp / maxHp;
        const nextStage = nextPct > 0.66 ? 0 : nextPct > 0.33 ? 1 : 2;
        if (nextStage > prevStage) {
          spawnParticles(
            particles,
            hitCoverCell.x + 0.5,
            hitCoverCell.y + 0.5,
            0.42,
            nextStage === 2 ? '#78716C' : '#94A3B8',
            8,
            2.8
          );
        }
      }
    }

    // Check elemental floor interactions
    if (hitFloorCell && weapon.element !== 'kinetic') {
      triggerFloorReaction(
        sector,
        hitFloorCell.x,
        hitFloorCell.y,
        weapon.element,
        player,
        particles,
        outcome
      );
    }
  }

  return outcome;
}

function triggerFloorReaction(
  sector: SectorDefinition,
  gx: number,
  gy: number,
  el: ElementType,
  player: PlayerCharacter,
  particles: ProjectileParticle[],
  outcome: ShotOutcome
): void {
  const cell = sector.grid[gy]?.[gx];
  if (!cell) return;

  if (cell.hazard === 'oil' && el === 'thermal') {
    cell.hazard = 'burning';
    cell.hazardTimer = 7;
    outcome.hitEvents.push({ text: 'Thermite Oil Ignition', tone: 'combo' });
    spawnParticles(particles, gx + 0.5, gy + 0.5, 0.2, '#F97316', 14, 3.6);
    damageEnemiesRadius(sector, gx + 0.5, gy + 0.5, 2.5, 48, 'thermal', particles);
  } else if (cell.hazard === 'coolant' && el === 'shock') {
    cell.hazard = 'electrified';
    cell.hazardTimer = 6;
    const bonus = player.perk === 'arc_conduit' ? 1.25 : 1.0;
    outcome.hitEvents.push({ text: 'Coolant Arc Overload', tone: 'combo' });
    spawnParticles(particles, gx + 0.5, gy + 0.5, 0.25, '#38BDF8', 14, 4.0);
    damageEnemiesRadius(
      sector,
      gx + 0.5,
      gy + 0.5,
      3.0,
      44 * bonus,
      'shock',
      particles
    );
  } else if (cell.hazard === 'coolant' && el === 'cryo') {
    cell.hazard = 'frozen';
    cell.hazardTimer = 8;
    outcome.hitEvents.push({ text: 'Flash Freeze Zone', tone: 'combo' });
  }
}

function triggerBarrelDetonation(
  sector: SectorDefinition,
  barrel: WorldEntity,
  particles: ProjectileParticle[],
  outcome: ShotOutcome
): void {
  const gx = Math.floor(barrel.x);
  const gy = Math.floor(barrel.y);
  const cell = sector.grid[gy]?.[gx];

  if (barrel.kind === 'barrel_fuel') {
    if (cell) {
      cell.hazard = 'burning';
      cell.hazardTimer = 8;
    }
    outcome.hitEvents.push({ text: 'Fuel Drum Detonated', tone: 'combo' });
    spawnParticles(particles, barrel.x, barrel.y, 0.5, '#F97316', 20, 4.8);
    damageEnemiesRadius(sector, barrel.x, barrel.y, 3.2, 68, 'thermal', particles);
    outcome.playerSplashes = outcome.playerSplashes || [];
    outcome.playerSplashes.push({
      element: 'thermal',
      x: barrel.x,
      y: barrel.y,
      radius: 3.2,
      maxDmg: 30,
    });
  } else if (barrel.kind === 'barrel_cryo') {
    if (cell) {
      cell.hazard = 'frozen';
      cell.hazardTimer = 9;
    }
    outcome.hitEvents.push({ text: 'Cryo Cylinder Ruptured', tone: 'combo' });
    spawnParticles(particles, barrel.x, barrel.y, 0.5, '#7DD3FC', 20, 4.4);
    damageEnemiesRadius(sector, barrel.x, barrel.y, 3.0, 45, 'cryo', particles);
    outcome.playerSplashes = outcome.playerSplashes || [];
    outcome.playerSplashes.push({
      element: 'cryo',
      x: barrel.x,
      y: barrel.y,
      radius: 3.0,
      maxDmg: 22,
    });
  } else if (barrel.kind === 'barrel_shock') {
    if (cell) {
      cell.hazard = 'electrified';
      cell.hazardTimer = 7;
    }
    outcome.hitEvents.push({ text: 'Capacitor Discharge', tone: 'combo' });
    spawnParticles(particles, barrel.x, barrel.y, 0.5, '#60A5FA', 20, 4.8);
    damageEnemiesRadius(sector, barrel.x, barrel.y, 3.4, 58, 'shock', particles);
    outcome.playerSplashes = outcome.playerSplashes || [];
    outcome.playerSplashes.push({
      element: 'shock',
      x: barrel.x,
      y: barrel.y,
      radius: 3.4,
      maxDmg: 28,
    });
  }
}

function damageEnemiesRadius(
  sector: SectorDefinition,
  cx: number,
  cy: number,
  radius: number,
  dmg: number,
  el: ElementType,
  particles: ProjectileParticle[]
): void {
  for (const e of sector.entities) {
    if (e.dead || e.kind.startsWith('loot_') || e.kind === 'terminal' || e.kind === 'vending') {
      continue;
    }
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d <= radius) {
      e.hp -= dmg * (1 - d / (radius * 1.4));
      e.statusElement = el;
      e.statusTimer = 3.5;
      e.hostile = true;
      e.alerted = true;
      if (!e.kind.startsWith('barrel_')) {
        const invD = 1 / Math.max(0.15, d);
        emitEntitySplatterDecals(
          sector,
          e,
          (e.x - cx) * invD,
          (e.y - cy) * invD,
          e.hp <= 0
        );
      }
      if (e.hp <= 0) {
        e.dead = true;
        spawnParticles(particles, e.x, e.y, 0.5, getElementColor(el), 10, 3.0);
      }
    }
  }
}

export const MAX_DECALS = 96;

function pushDecalCapped(sector: SectorDefinition, decal: SurfaceDecal): void {
  if (!sector.decals) sector.decals = [];
  if (sector.decals.length >= MAX_DECALS) {
    sector.decals.shift();
  }
  sector.decals.push(decal);
}

export function getEntitySplatterKind(kind: WorldEntity['kind']): DecalKind {
  return kind === 'enemy_droid' ? 'oil' : 'blood';
}

export function emitEntitySplatterDecals(
  sector: SectorDefinition,
  ent: WorldEntity,
  dirX: number,
  dirY: number,
  isFatal: boolean
): void {
  const len = Math.hypot(dirX, dirY) || 1;
  const rdx = dirX / len;
  const rdy = dirY / len;
  const kind = getEntitySplatterKind(ent.kind);

  // 1. Directional floor pool behind damaged target
  const floorDist = 0.28 + Math.random() * 0.56;
  const fx = ent.x + rdx * floorDist + (Math.random() - 0.5) * 0.22;
  const fy = ent.y + rdy * floorDist + (Math.random() - 0.5) * 0.22;
  const fgx = Math.floor(fx);
  const fgy = Math.floor(fy);
  const fCell = sector.grid[fgy]?.[fgx];
  if (fCell && fCell.kind !== 'wall') {
    pushDecalCapped(sector, {
      surface: 'floor',
      kind,
      tx: fgx,
      ty: fgy,
      x: fx,
      y: fy,
      dirX: rdx,
      dirY: rdy,
      radius: (isFatal ? 0.29 : 0.20) + Math.random() * 0.14,
      seed: (Math.random() * 1000) | 0,
    });
  }

  // Extra collapse stain directly under entity on lethal hit
  if (isFatal) {
    const ux = ent.x + (Math.random() - 0.5) * 0.14;
    const uy = ent.y + (Math.random() - 0.5) * 0.14;
    const ugx = Math.floor(ux);
    const ugy = Math.floor(uy);
    const uCell = sector.grid[ugy]?.[ugx];
    if (uCell && uCell.kind !== 'wall') {
      pushDecalCapped(sector, {
        surface: 'floor',
        kind,
        tx: ugx,
        ty: ugy,
        x: ux,
        y: uy,
        dirX: rdx,
        dirY: rdy,
        radius: 0.32 + Math.random() * 0.13,
        seed: (Math.random() * 1000) | 0,
      });
    }
  }

  // 2. Behind-target wall splatter trace (up to 2.2 tiles along shot vector)
  let mapX = Math.floor(ent.x);
  let mapY = Math.floor(ent.y);
  const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
  const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
  const stepX = rdx < 0 ? -1 : 1;
  const stepY = rdy < 0 ? -1 : 1;
  let sdx = rdx < 0 ? (ent.x - mapX) * ddx : (mapX + 1.0 - ent.x) * ddx;
  let sdy = rdy < 0 ? (ent.y - mapY) * ddy : (mapY + 1.0 - ent.y) * ddy;
  let side: 0 | 1 = 0;

  for (let step = 0; step < 8; step++) {
    if (sdx < sdy) {
      sdx += ddx;
      mapX += stepX;
      side = 0;
    } else {
      sdy += ddy;
      mapY += stepY;
      side = 1;
    }
    const hitDist = side === 0 ? sdx - ddx : sdy - ddy;
    if (hitDist > 2.2) break;
    if (mapX < 0 || mapY < 0 || mapX >= sector.width || mapY >= sector.height) break;

    const wCell = sector.grid[mapY][mapX];
    if (wCell.kind === 'wall') {
      let wallX = side === 0 ? ent.y + hitDist * rdy : ent.x + hitDist * rdx;
      wallX -= Math.floor(wallX);
      const baseV = ent.kind === 'enemy_rat' ? 0.68 : 0.48;
      const v = Math.max(0.24, Math.min(0.84, baseV + (Math.random() - 0.5) * 0.18));
      pushDecalCapped(sector, {
        surface: 'wall',
        kind,
        tx: mapX,
        ty: mapY,
        side,
        u: wallX,
        v,
        radU: (isFatal ? 0.19 : 0.13) + Math.random() * 0.10,
        radV: (isFatal ? 0.18 : 0.12) + Math.random() * 0.09,
        seed: (Math.random() * 1000) | 0,
      });
      break;
    }
  }
}

export function revealFogOfWar(
  sector: SectorDefinition,
  px: number,
  py: number,
  radius = 3
): boolean {
  const originX = Math.floor(px);
  const originY = Math.floor(py);
  const minX = Math.max(0, originX - radius);
  const maxX = Math.min(sector.width - 1, originX + radius);
  const minY = Math.max(0, originY - radius);
  const maxY = Math.min(sector.height - 1, originY + radius);
  const maxRange = radius + 0.35;
  let changed = false;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const cell = sector.grid[gy]?.[gx];
      if (!cell || cell.visited) continue;

      const dist = Math.hypot(gx - originX, gy - originY);
      if (dist > maxRange) continue;

      let visible = true;
      if (dist > 0.5) {
        const steps = Math.max(1, Math.ceil(dist * 5));
        const sx = originX + 0.5;
        const sy = originY + 0.5;
        const dx = (gx + 0.5 - sx) / steps;
        const dy = (gy + 0.5 - sy) / steps;
        for (let i = 1; i < steps; i++) {
          const ix = Math.floor(sx + dx * i);
          const iy = Math.floor(sy + dy * i);
          if ((ix === originX && iy === originY) || (ix === gx && iy === gy)) {
            continue;
          }
          const mid = sector.grid[iy]?.[ix];
          if (
            !mid ||
            mid.kind === 'wall' ||
            ((mid.kind === 'door' || mid.kind === 'gate') && mid.doorOpen < 0.6)
          ) {
            visible = false;
            break;
          }
        }
      }

      if (visible) {
        cell.visited = true;
        changed = true;
      }
    }
  }

  return changed;
}
