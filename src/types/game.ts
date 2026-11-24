export type ElementType = 'kinetic' | 'thermal' | 'cryo' | 'shock' | 'toxin';

export type DebuffElement = Exclude<ElementType, 'kinetic'>;

export interface PlayerDebuff {
  element: DebuffElement;
  intensity: number; // 0..1 normalized damage severity
  timer: number;     // remaining duration in seconds
  maxTimer: number;
}

export type FactionId = 'aegis' | 'syndicate' | 'helix';

export type OriginId = 'breacher' | 'netrunner' | 'bio_tech' | 'fixer';

export type PerkId =
  | 'hollow_point'
  | 'arc_conduit'
  | 'cryo_shatter'
  | 'silver_tongue'
  | 'subdermal_mesh';

export interface Attributes {
  ballistics: number; // 1-10: weapon damage & reload speed
  tech: number;       // 1-10: terminal hacking, crafting efficiency, shock bonus
  bio: number;        // 1-10: max HP, toxin/fire resistance, medkit potency
  neural: number;     // 1-10: dialogue persuasion, stamina, critical chance
}

export type MaterialType =
  | 'scrap'
  | 'microchip'
  | 'cryo_cell'
  | 'arc_coil'
  | 'bio_gel'
  | 'ceramic_plate';

export type MaterialsInventory = Record<MaterialType, number>;

export interface Weapon {
  id: string;
  name: string;
  archetype: 'pistol' | 'smg' | 'rifle' | 'shotgun';
  spriteId: string;
  element: ElementType;
  damage: number;
  fireRate: number;      // shots per second
  magSize: number;
  ammoInMag: number;
  reserveAmmo: number;
  spread: number;        // radians
  pellets: number;
  range: number;
  crafted?: boolean;
}

export interface Armor {
  id: string;
  name: string;
  defense: number;       // flat % mitigation up to 55%
  maxShield: number;
  resistElement: ElementType | 'none';
  speedMod: number;      // e.g. 1.0, 1.08, 0.94
  crafted?: boolean;
}

export interface PlayerCharacter {
  name: string;
  origin: OriginId;
  perk: PerkId;
  attributes: Attributes;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  maxStamina: number;
  credits: number;
  xp: number;
  level: number;
  materials: MaterialsInventory;
  weapons: Weapon[];
  activeWeaponIndex: number;
  armor: Armor;
  debuffs?: PlayerDebuff[];
  dashCooldown?: number;
  dashMaxCooldown?: number;
  dashIframeActive?: boolean;
}

export type SurfaceHazard =
  | 'none'
  | 'oil'
  | 'coolant'
  | 'burning'
  | 'electrified'
  | 'toxic'
  | 'frozen';

export type CellKind =
  | 'empty'
  | 'wall'
  | 'cover'
  | 'door'
  | 'gate';

export interface GridCell {
  kind: CellKind;
  wallTex: string;
  floorTex: string;
  ceilingTex: string;
  coverHp: number;
  coverMaxHp: number;
  coverHeight: number; // 0.55..0.9 for partial cover
  coverVisualScale?: number; // animated slump factor: 1.0 -> 0.88 -> 0.68
  coverShake?: number;       // 0..1 impact shake decay
  destructible: boolean;
  doorOpen: number;    // 0 = closed, 1 = open
  doorTargetOpen: number;
  doorLockedBy?: string; // mission or tech requirement
  gateToSector?: string;
  gateSpawnX?: number;
  gateSpawnY?: number;
  hazard: SurfaceHazard;
  hazardTimer: number;
  visited?: boolean;
}

export type EntityKind =
  | 'enemy_guard'
  | 'enemy_merc'
  | 'enemy_droid'
  | 'enemy_rat'
  | 'npc'
  | 'terminal'
  | 'vending'
  | 'barrel_fuel'
  | 'barrel_cryo'
  | 'barrel_shock'
  | 'loot_medkit'
  | 'loot_ammo'
  | 'loot_scrap';

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  name: string;
  x: number;
  y: number;
  spriteId: string;
  scale: number;
  faction?: FactionId;
  hp: number;
  maxHp: number;
  hostile: boolean;
  alerted: boolean;
  attackCooldown: number;
  statusElement?: ElementType | null;
  statusTimer: number;
  statusEmitAcc?: number;
  dialogueId?: string;
  interactLabel?: string;
  lootGranted?: boolean;
  dead?: boolean;
}

export type ParticleKind = 'ballistic' | 'ember' | 'frost' | 'spark';

export interface ProjectileParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  kind?: ParticleKind;
  gravity?: number;
  drag?: number;
  jitter?: number;
  sizeGrowth?: number;
  alpha?: number;
}

export type DecalKind = 'blood' | 'oil';

export interface SurfaceDecal {
  surface: 'floor' | 'wall';
  kind: DecalKind;
  tx: number;
  ty: number;
  // Floor splatter fields
  x?: number;
  y?: number;
  dirX?: number;
  dirY?: number;
  radius?: number;
  // Wall splatter fields
  side?: 0 | 1;
  u?: number;
  v?: number;
  radU?: number;
  radV?: number;
  seed: number;
}

export interface SectorDefinition {
  id: string;
  name: string;
  subtitle: string;
  controllingFaction: FactionId;
  ambientColor: [number, number, number];
  fogColor: [number, number, number];
  fogDensity: number;
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  spawnAngle: number;
  mapX: number; // for Open-World Map layout (0..100%)
  mapY: number;
  connections: string[];
  grid: GridCell[][];
  entities: WorldEntity[];
  decals?: SurfaceDecal[];
}

export interface DialogueChoice {
  text: string;
  nextNodeId?: string;
  reqAttr?: { attr: keyof Attributes; min: number };
  repDelta?: Partial<Record<FactionId, number>>;
  grantCredits?: number;
  grantMaterials?: Partial<MaterialsInventory>;
  startMissionId?: string;
  completeMissionId?: string;
  unlockSectorDoor?: { sectorId: string; x: number; y: number };
  healPlayer?: number;
  endDialogue?: boolean;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  faction?: FactionId;
  spriteId: string;
  text: string;
  choices: DialogueChoice[];
}

export interface DialogueGraph {
  id: string;
  startNodeId: string;
  nodes: Record<string, DialogueNode>;
}

export interface Mission {
  id: string;
  title: string;
  faction: FactionId;
  sectorId: string;
  minReputation: number;
  summary: string;
  objectiveText: string;
  status: 'locked' | 'available' | 'active' | 'completed';
  targetEntityId?: string;
  rewardCredits: number;
  rewardRep: Partial<Record<FactionId, number>>;
  rewardMaterials: Partial<MaterialsInventory>;
}

export interface CraftingRecipe {
  id: string;
  kind: 'weapon' | 'armor';
  name: string;
  description: string;
  element: ElementType | 'none';
  cost: Partial<MaterialsInventory>;
  minTech: number;
  weaponTemplate?: Omit<Weapon, 'id'>;
  armorTemplate?: Omit<Armor, 'id'>;
}

export interface CombatEventBanner {
  id: number;
  text: string;
  tone: 'info' | 'combo' | 'rep' | 'danger';
  ttl: number;
}
