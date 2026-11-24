import { Weapon } from '../types/game';

export type WeaponState =
  | 'ready'
  | 'firing'
  | 'reloading'
  | 'equipping'
  | 'inspecting';

export interface WeaponArchetypeProfile {
  swayScale: number;
  recovery: number;
  bobMult: number;
  tiltScale: number;
  sprintDrop: number;
  recoilKickX: number;
  recoilKickY: number;
  inspectDuration: number;
}

export const WEAPON_INERTIA_PROFILES: Record<Weapon['archetype'], WeaponArchetypeProfile> = {
  pistol: {
    swayScale: 0.72,
    recovery: 16.5,
    bobMult: 0.78,
    tiltScale: 0.75,
    sprintDrop: 8.5,
    recoilKickX: 2.2,
    recoilKickY: 0.95,
    inspectDuration: 1.85,
  },
  smg: {
    swayScale: 0.92,
    recovery: 14.0,
    bobMult: 0.96,
    tiltScale: 0.95,
    sprintDrop: 10.5,
    recoilKickX: 3.0,
    recoilKickY: 1.0,
    inspectDuration: 2.05,
  },
  rifle: {
    swayScale: 1.12,
    recovery: 11.2,
    bobMult: 1.12,
    tiltScale: 1.12,
    sprintDrop: 13.0,
    recoilKickX: 4.0,
    recoilKickY: 1.15,
    inspectDuration: 2.35,
  },
  shotgun: {
    swayScale: 1.32,
    recovery: 9.2,
    bobMult: 1.28,
    tiltScale: 1.28,
    sprintDrop: 15.5,
    recoilKickX: 6.2,
    recoilKickY: 1.4,
    inspectDuration: 2.50,
  },
};

export interface WeaponMotionState {
  weaponState: WeaponState;
  lookVelX: number;
  lookVelY: number;
  swayX: number;
  swayY: number;
  strafeLean: number;
  moveBlend: number;
  sprintBlend: number;
  equipDip: number;
  reloadTimer: number;
  inspectProgress: number;
  inspectBlend: number;
  offsetX: number;
  offsetY: number;
  roll: number;
  scaleMult: number;
  inspectGlow: number;
  dashLean: number;
  dashDip: number;
}

export function createWeaponMotionState(): WeaponMotionState {
  return {
    weaponState: 'ready',
    lookVelX: 0,
    lookVelY: 0,
    swayX: 0,
    swayY: 0,
    strafeLean: 0,
    moveBlend: 0,
    sprintBlend: 0,
    equipDip: 0,
    reloadTimer: 0,
    inspectProgress: 0,
    inspectBlend: 0,
    offsetX: 0,
    offsetY: 0,
    roll: 0,
    scaleMult: 1.0,
    inspectGlow: 0,
    dashLean: 0,
    dashDip: 0,
  };
}

export function triggerWeaponInspect(wm: WeaponMotionState): void {
  if (wm.weaponState === 'ready') {
    wm.weaponState = 'inspecting';
    wm.inspectProgress = 0;
  } else if (wm.weaponState === 'inspecting') {
    wm.weaponState = 'ready';
  }
}

export function cancelWeaponInspect(
  wm: WeaponMotionState,
  nextState: WeaponState = 'ready'
): void {
  if (nextState !== 'inspecting') {
    wm.weaponState = nextState;
  }
}

export function triggerWeaponDash(
  wm: WeaponMotionState,
  dirStrafe: number,
  dirFwd: number
): void {
  if (wm.weaponState === 'inspecting') {
    wm.weaponState = 'ready';
  }
  const lean = Math.abs(dirStrafe) > 0.1 ? dirStrafe : dirFwd >= 0 ? 0.35 : -0.35;
  wm.dashLean = clamp(lean, -1, 1);
  wm.dashDip = 1.0;
}

export interface WeaponMotionInput {
  archetype: Weapon['archetype'];
  time: number;
  bobPhase: number;
  moveStrafe: number;
  isMoving: boolean;
  isSprinting: boolean;
  recoil: number;
  fireCooldown?: number;
  reducedMotion?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function evaluateInspectPose(
  archetype: Weapon['archetype'],
  t: number,
  motionScale: number
): { x: number; y: number; roll: number; zoom: number; glow: number } {
  const env = smoothstep(0, 0.16, t) * (1 - smoothstep(0.84, 1.0, t));
  const glow = env * (0.55 + 0.45 * Math.sin(t * Math.PI * 4));
  let x = 0;
  let y = 0;
  let roll = 0;
  let zoom = 0;

  if (archetype === 'pistol') {
    // Nimble wrist flip & side cant
    x = (-22 * env + Math.sin(t * Math.PI * 2) * 6.5) * motionScale;
    y = (-11 * env - Math.sin(t * Math.PI * 3) * 2.5) * motionScale;
    roll = (-0.28 * Math.sin(t * Math.PI) + 0.16 * Math.sin(t * Math.PI * 2.5)) * motionScale;
    zoom = 0.12 * env;
  } else if (archetype === 'smg') {
    // Arc-capacitor rock & mag-well tilt
    x = (-24 * env + Math.sin(t * Math.PI * 2) * 4.5) * motionScale;
    y = (-12 * env + Math.cos(t * Math.PI * 2) * 3.0) * motionScale;
    roll = (-0.24 * env + 0.12 * Math.sin(t * Math.PI * 3)) * motionScale;
    zoom = 0.14 * env;
  } else if (archetype === 'rifle') {
    // Broadside tactical sweep across lower viewport
    x = (-38 * env + Math.sin(t * Math.PI * 1.5) * 7.5) * motionScale;
    y = (-14 * env + Math.sin(t * Math.PI * 2) * 3.2) * motionScale;
    roll = (-0.22 * env - 0.06 * Math.sin(t * Math.PI * 2)) * motionScale;
    zoom = 0.10 * env;
  } else {
    // Shotgun heavy lift + mid-cycle chamber check impulse
    const pump = Math.exp(-Math.pow((t - 0.52) / 0.085, 2));
    x = (-30 * env + pump * 5.5) * motionScale;
    y = (-16 * env + pump * 5.5) * motionScale;
    roll = (-0.19 * env + pump * 0.09) * motionScale;
    zoom = 0.13 * env;
  }

  return { x, y, roll, zoom, glow };
}

export function stepWeaponMotion(
  wm: WeaponMotionState,
  input: WeaponMotionInput,
  dt: number
): void {
  const profile = WEAPON_INERTIA_PROFILES[input.archetype] ?? WEAPON_INERTIA_PROFILES.rifle;
  const motionScale = input.reducedMotion ? 0.28 : 1.0;

  // State machine interrupt & completion transitions
  if (input.isSprinting && wm.weaponState === 'inspecting') {
    wm.weaponState = 'ready';
  }
  if (wm.weaponState === 'reloading') {
    wm.reloadTimer = Math.max(0, wm.reloadTimer - dt);
    if (wm.reloadTimer <= 0) {
      wm.weaponState = 'ready';
    }
  } else if (wm.weaponState === 'equipping') {
    if (wm.equipDip <= 0.04) {
      wm.weaponState = 'ready';
    }
  } else if (wm.weaponState === 'firing') {
    if ((input.fireCooldown ?? 0) <= 0 && input.recoil <= 0.08) {
      wm.weaponState = 'ready';
    }
  } else if (wm.weaponState === 'inspecting') {
    wm.inspectProgress += dt / profile.inspectDuration;
    if (wm.inspectProgress >= 1.0) {
      wm.inspectProgress = 1.0;
      wm.weaponState = 'ready';
    }
  }

  const targetInspect = wm.weaponState === 'inspecting' ? 1.0 : 0.0;
  const blendRate = targetInspect > wm.inspectBlend ? 10.5 : 16.5;
  wm.inspectBlend += (targetInspect - wm.inspectBlend) * (1 - Math.exp(-blendRate * dt));
  if (wm.inspectBlend < 0.002 && targetInspect === 0) {
    wm.inspectBlend = 0;
  }

  // Apply accumulated look impulse counter to turn direction, then clear
  const impulseX = -wm.lookVelX * 0.22 * profile.swayScale * motionScale;
  const impulseY = -wm.lookVelY * 0.16 * profile.swayScale * motionScale;
  wm.lookVelX = 0;
  wm.lookVelY = 0;

  const decay = Math.exp(-profile.recovery * dt);
  wm.swayX = clamp((wm.swayX + impulseX) * decay, -18, 18);
  wm.swayY = clamp((wm.swayY + impulseY) * decay, -12, 12);

  // Smooth locomotion, sprint posture, and lateral strafe lean
  const blendAlpha = 1 - Math.exp(-11.5 * dt);
  const targetMove = input.isMoving ? 1.0 : 0.0;
  const targetSprint = input.isMoving && input.isSprinting ? 1.0 : 0.0;
  const targetStrafe = input.isMoving ? clamp(input.moveStrafe, -1, 1) : 0.0;

  wm.moveBlend += (targetMove - wm.moveBlend) * blendAlpha;
  wm.sprintBlend += (targetSprint - wm.sprintBlend) * blendAlpha;
  wm.strafeLean += (targetStrafe - wm.strafeLean) * (1 - Math.exp(-10 * dt));

  if (wm.equipDip > 0) {
    wm.equipDip = Math.max(0, wm.equipDip - dt * (profile.recovery * 0.34));
  }
  if (Math.abs(wm.dashLean) > 0.001) {
    wm.dashLean *= Math.exp(-9.5 * dt);
    if (Math.abs(wm.dashLean) < 0.002) wm.dashLean = 0;
  }
  if (wm.dashDip > 0) {
    wm.dashDip = Math.max(0, wm.dashDip - dt * 5.2);
  }

  // Idle breathing (attenuates during active movement)
  const idleFactor = (1 - wm.moveBlend * 0.55) * motionScale;
  const breathX = Math.cos(input.time * 0.95) * 0.95 * idleFactor;
  const breathY = Math.sin(input.time * 1.9) * 1.45 * idleFactor;

  // Step-synced figure-8 stride bob (footplants occur at bobPhase = k*PI where |sin| = 0)
  const strideAmpX = (4.3 + wm.sprintBlend * 2.5) * profile.bobMult * wm.moveBlend * motionScale;
  const strideAmpY = (3.6 + wm.sprintBlend * 2.8) * profile.bobMult * wm.moveBlend * motionScale;
  const fig8X = Math.cos(input.bobPhase) * strideAmpX;
  const fig8Y = (1 - Math.abs(Math.sin(input.bobPhase))) * strideAmpY;

  // Strafe lag, sprint lower-cant, equip rise, reload dip, dash tilt, and recoil horizontal kick
  const strafeOffsetX = -wm.strafeLean * 4.8 * profile.swayScale * motionScale;
  const sprintOffsetX = wm.sprintBlend * 4.4 * motionScale;
  const sprintOffsetY = wm.sprintBlend * profile.sprintDrop * motionScale;
  const equipOffsetY = wm.equipDip * wm.equipDip * 26;
  const reloadPhase = wm.reloadTimer > 0 ? Math.sin(clamp(wm.reloadTimer / 0.65, 0, 1) * Math.PI) : 0;
  const reloadOffsetY = reloadPhase * 18;
  const reloadRoll = reloadPhase * 0.14;
  const dashOffsetX = -wm.dashLean * 12.5 * motionScale;
  const dashOffsetY = wm.dashDip * 9.0 * motionScale;
  const dashRoll = -wm.dashLean * 0.14 * profile.tiltScale * motionScale;
  const recoilOffsetX = input.recoil * profile.recoilKickX;

  const combatX = breathX + fig8X + wm.swayX + strafeOffsetX + sprintOffsetX + recoilOffsetX + dashOffsetX;
  const combatY = breathY + fig8Y + wm.swayY + sprintOffsetY + equipOffsetY + reloadOffsetY + dashOffsetY;

  const combatRoll = clamp(
    (-wm.strafeLean * 0.042 +
      Math.cos(input.bobPhase) * 0.022 * wm.moveBlend -
      (wm.swayX / 18) * 0.048 -
      wm.sprintBlend * 0.055) *
      profile.tiltScale *
      motionScale +
      input.recoil * 0.032 +
      reloadRoll +
      dashRoll,
    -0.22,
    0.22
  );

  if (wm.inspectBlend > 0.001) {
    const pose = evaluateInspectPose(input.archetype, wm.inspectProgress, motionScale);
    const b = wm.inspectBlend;
    const combatAtten = 1 - b * 0.72;
    wm.offsetX = combatX * combatAtten + pose.x * b;
    wm.offsetY = combatY * combatAtten + pose.y * b;
    wm.roll = clamp(combatRoll * combatAtten + pose.roll * b, -0.36, 0.36);
    wm.scaleMult = 1.0 + pose.zoom * b;
    wm.inspectGlow = pose.glow * b;
  } else {
    wm.offsetX = combatX;
    wm.offsetY = combatY;
    wm.roll = combatRoll;
    wm.scaleMult = 1.0;
    wm.inspectGlow = 0;
  }
}
