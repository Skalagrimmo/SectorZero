import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialSectors,
  DIALOGUES,
  FACTION_INFO,
  INITIAL_MISSIONS,
  ORIGINS,
} from './data/worldData';
import {
  emitFootstepParticles,
  emitStatusParticles,
  firePlayerWeapon,
  hasLineOfSight,
  revealFogOfWar,
  spawnParticles,
  stepParticles,
} from './engine/combatPhysics';
import { GLESPresenter } from './engine/glesPresenter';
import { Raycaster25D } from './engine/raycaster';
import { spriteAtlas } from './engine/spriteAtlas';
import {
  cancelWeaponInspect,
  createWeaponMotionState,
  stepWeaponMotion,
  triggerWeaponDash,
  triggerWeaponInspect,
} from './engine/weaponMotion';
import {
  Attributes,
  CombatEventBanner,
  CraftingRecipe,
  DebuffElement,
  DialogueChoice,
  ElementType,
  FactionId,
  MaterialType,
  Mission,
  OriginId,
  PerkId,
  PlayerCharacter,
  PlayerDebuff,
  ProjectileParticle,
  SectorDefinition,
  WorldEntity,
} from './types/game';
import { CharacterCreatorModal } from './components/CharacterCreatorModal';
import { CraftingWorkbench } from './components/CraftingWorkbench';
import { DialogueOverlay } from './components/DialogueOverlay';
import { GameHUD } from './components/GameHUD';
import { LuaCodeStudio } from './components/LuaCodeStudio';
import { SectorMapOverlay } from './components/SectorMapOverlay';

type ActiveModal =
  | 'none'
  | 'creator'
  | 'crafting'
  | 'map'
  | 'lua'
  | 'dialogue';

function createDefaultPlayer(): PlayerCharacter {
  const o = ORIGINS.netrunner;
  return {
    name: 'Merc-09',
    origin: 'netrunner',
    perk: 'arc_conduit',
    attributes: { ballistics: 2, tech: 5, bio: 2, neural: 3 },
    hp: 105,
    maxHp: 105,
    shield: o.startArmor.maxShield + 20,
    maxShield: o.startArmor.maxShield + 20,
    stamina: 100,
    maxStamina: 100,
    credits: o.startCredits,
    xp: 0,
    level: 1,
    materials: {
      scrap: 5,
      microchip: 2,
      cryo_cell: 2,
      arc_coil: 2,
      bio_gel: 2,
      ceramic_plate: 2,
    },
    weapons: [{ ...o.startWeapon }],
    activeWeaponIndex: 0,
    armor: { ...o.startArmor },
    debuffs: [],
    dashCooldown: 0,
    dashMaxCooldown: 0.75,
    dashIframeActive: false,
  };
}

const DASH_STAMINA_COST = 28;
const DASH_DURATION = 0.18;
const DASH_IFRAME_DURATION = 0.24;
const DASH_COOLDOWN = 0.75;
const DASH_SPEED = 10.8;
const DOUBLE_TAP_WINDOW_MS = 240;

function getElementTint(el: ElementType): [number, number, number] {
  switch (el) {
    case 'thermal':
      return [1.0, 0.62, 0.25];
    case 'cryo':
      return [0.42, 0.85, 1.0];
    case 'shock':
      return [0.45, 0.72, 1.0];
    case 'toxin':
      return [0.35, 0.92, 0.55];
    default:
      return [1.0, 0.88, 0.68];
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raycasterRef = useRef<Raycaster25D | null>(null);
  const presenterRef = useRef<GLESPresenter | null>(null);

  const [atlasLoaded, setAtlasLoaded] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('creator');
  const [touchMode, setTouchMode] = useState(false);
  const [renderScale, setRenderScale] = useState<'native' | '480x270' | '320x180'>('480x270');
  const [pointerLocked, setPointerLocked] = useState(false);

  const [player, setPlayer] = useState<PlayerCharacter>(createDefaultPlayer);
  const [sectors, setSectors] = useState<Record<string, SectorDefinition>>(() => {
    const init = createInitialSectors();
    revealFogOfWar(init.concourse, init.concourse.spawnX, init.concourse.spawnY, 3);
    return init;
  });
  const [currentSectorId, setCurrentSectorId] = useState('concourse');
  const [unlockedSectors, setUnlockedSectors] = useState<string[]>(['concourse']);
  const [reputation, setReputation] = useState<Record<FactionId, number>>({
    aegis: -5,
    syndicate: 15,
    helix: 5,
  });
  const [missions, setMissions] = useState<Mission[]>(INITIAL_MISSIONS);

  const [dialogueState, setDialogueState] = useState<{
    graphId: string;
    nodeId: string;
  } | null>(null);

  const [interactPrompt, setInteractPrompt] = useState<string | null>(null);
  const [hudAngle, setHudAngle] = useState(0);
  const [events, setEvents] = useState<CombatEventBanner[]>([]);

  // High-frequency mutable simulation state inside refs for 60 FPS loop
  const simRef = useRef({
    px: 3.5,
    py: 10.5,
    angle: 0,
    pitch: 0,
    bobPhase: 0,
    bobOffset: 0,
    lastStepIndex: 0,
    lastRevealTileX: -1,
    lastRevealTileY: -1,
    stamina: 100,
    touchSprint: false,
    recoil: 0,
    muzzleFlash: 0,
    damageFlash: 0,
    fireCooldown: 0,
    time: 0,
    lastWeaponIndex: 0,
    weaponMotion: createWeaponMotionState(),
    particles: [] as ProjectileParticle[],
    keys: new Set<string>(),
    moveStick: { x: 0, y: 0 },
    lookStick: { x: 0, y: 0 },
    mouseDown: false,
    outOfCombatTimer: 0,
    hazardTick: 0,
    debuffs: [] as PlayerDebuff[],
    dotAcc: 0,
    dashTimer: 0,
    dashIframeTimer: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirY: 0,
    dashFovOffset: 0,
    lastMoveTap: {} as Record<string, number>,
  });

  const playerRef = useRef(player);
  playerRef.current = player;

  const sectorsRef = useRef(sectors);
  sectorsRef.current = sectors;

  const currentSectorIdRef = useRef(currentSectorId);
  currentSectorIdRef.current = currentSectorId;

  const reputationRef = useRef(reputation);
  reputationRef.current = reputation;

  const activeModalRef = useRef(activeModal);
  activeModalRef.current = activeModal;

  const missionsRef = useRef(missions);
  missionsRef.current = missions;

  const pushEvent = useCallback(
    (text: string, tone: CombatEventBanner['tone'] = 'info') => {
      setEvents((prev) => [
        { id: Date.now() + Math.random(), text, tone, ttl: 3.2 },
        ...prev.slice(0, 4),
      ]);
    },
    []
  );

  // Sync mission availability and faction hostility whenever reputation changes
  const applyReputationShift = useCallback(
    (deltas: Partial<Record<FactionId, number>>) => {
      const next = { ...reputationRef.current };
      for (const [k, v] of Object.entries(deltas)) {
        const fid = k as FactionId;
        if (!v) continue;
        next[fid] = Math.max(-100, Math.min(100, next[fid] + v));
        pushEvent(
          `${FACTION_INFO[fid].name} ${v > 0 ? '+' : ''}${v} Rep`,
          'rep'
        );
      }

      reputationRef.current = next;
      setReputation(next);

      setMissions((ms) =>
        ms.map((m) => {
          if (m.status === 'locked' && next[m.faction] >= m.minReputation) {
            return { ...m, status: 'available' };
          }
          return m;
        })
      );

      setSectors((secs) => {
        const updated = { ...secs };
        for (const secId of Object.keys(updated)) {
          for (const ent of updated[secId].entities) {
            if (
              ent.faction &&
              ent.kind !== 'npc' &&
              !ent.alerted &&
              !ent.dead
            ) {
              ent.hostile = next[ent.faction] < -20;
            }
          }
        }
        return updated;
      });
    },
    [pushEvent]
  );

  // Load sprite sheet once & initialize renderer
  useEffect(() => {
    let mounted = true;
    spriteAtlas
      .load()
      .then(() => {
        if (mounted) setAtlasLoaded(true);
      })
      .catch(() => {
        if (mounted) setAtlasLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const dims =
      renderScale === '320x180'
        ? [320, 180]
        : renderScale === '480x270'
        ? [480, 270]
        : [640, 360];
    if (!raycasterRef.current) {
      raycasterRef.current = new Raycaster25D(dims[0], dims[1]);
    } else {
      raycasterRef.current.resize(dims[0], dims[1]);
    }
    if (!presenterRef.current) {
      presenterRef.current = new GLESPresenter(canvasRef.current);
    }
  }, [renderScale, atlasLoaded]);

  const handleStartNewCharacter = (config: {
    name: string;
    origin: OriginId;
    perk: PerkId;
    attributes: Attributes;
  }) => {
    const o = ORIGINS[config.origin];
    const maxHp =
      85 +
      config.attributes.bio * 10 +
      (config.perk === 'subdermal_mesh' ? 20 : 0);
    const maxShield = o.startArmor.maxShield + config.attributes.tech * 4;

    const freshSectors = createInitialSectors();
    revealFogOfWar(
      freshSectors.concourse,
      freshSectors.concourse.spawnX,
      freshSectors.concourse.spawnY,
      3
    );
    setSectors(freshSectors);
    setCurrentSectorId('concourse');
    setUnlockedSectors(['concourse']);
    setMissions(INITIAL_MISSIONS);
    setReputation({ ...o.startRep });

    simRef.current.px = freshSectors.concourse.spawnX;
    simRef.current.py = freshSectors.concourse.spawnY;
    simRef.current.angle = freshSectors.concourse.spawnAngle;
    simRef.current.pitch = 0;
    simRef.current.bobPhase = 0;
    simRef.current.lastStepIndex = 0;
    simRef.current.lastRevealTileX = Math.floor(freshSectors.concourse.spawnX);
    simRef.current.lastRevealTileY = Math.floor(freshSectors.concourse.spawnY);
    simRef.current.stamina = 100;
    simRef.current.lastWeaponIndex = 0;
    simRef.current.weaponMotion = createWeaponMotionState();
    simRef.current.particles = [];
    simRef.current.debuffs = [];
    simRef.current.dotAcc = 0;
    simRef.current.dashTimer = 0;
    simRef.current.dashIframeTimer = 0;
    simRef.current.dashCooldown = 0;
    simRef.current.dashFovOffset = 0;
    simRef.current.lastMoveTap = {};

    setPlayer({
      name: config.name,
      origin: config.origin,
      perk: config.perk,
      attributes: config.attributes,
      hp: maxHp,
      maxHp,
      shield: maxShield,
      maxShield,
      stamina: 100,
      maxStamina: 100,
      credits: o.startCredits,
      xp: 0,
      level: 1,
      materials: {
        scrap: 5,
        microchip: 2,
        cryo_cell: 2,
        arc_coil: 2,
        bio_gel: 2,
        ceramic_plate: 2,
      },
      weapons: [{ ...o.startWeapon }],
      activeWeaponIndex: 0,
      armor: { ...o.startArmor },
      debuffs: [],
      dashCooldown: 0,
      dashMaxCooldown: DASH_COOLDOWN,
      dashIframeActive: false,
    });

    setActiveModal('none');
    pushEvent('Deployed to Transit Concourse · Explore or speak to Vance', 'info');
  };

  const handleReload = useCallback(() => {
    const p = playerRef.current;
    const cur = p.weapons[p.activeWeaponIndex];
    if (!cur || cur.magSize - cur.ammoInMag <= 0 || cur.reserveAmmo <= 0) return;

    cancelWeaponInspect(simRef.current.weaponMotion, 'reloading');
    simRef.current.weaponMotion.reloadTimer = 0.65;

    setPlayer((prev) => {
      const weapons = [...prev.weapons];
      const w = { ...weapons[prev.activeWeaponIndex] };
      const need = w.magSize - w.ammoInMag;
      if (need <= 0 || w.reserveAmmo <= 0) return prev;
      const take = Math.min(need, w.reserveAmmo);
      w.ammoInMag += take;
      w.reserveAmmo -= take;
      weapons[prev.activeWeaponIndex] = w;
      return { ...prev, weapons };
    });
  }, []);

  const applyDamageToPlayer = useCallback(
    (rawDmg: number, element?: ElementType, silentDot = false) => {
      if (!silentDot && simRef.current.dashIframeTimer > 0) {
        return;
      }
      if (!silentDot) {
        simRef.current.damageFlash = 1.0;
      }
      simRef.current.outOfCombatTimer = 0;
      setPlayer((prev) => {
        const elMult =
          element && element !== 'kinetic' && prev.armor.resistElement === element
            ? 0.45
            : 1.0;
        const mitigated = rawDmg * elMult * (1 - prev.armor.defense / 100);
        let shield = prev.shield;
        let hp = prev.hp;
        if (shield > 0) {
          const absorb = Math.min(shield, mitigated);
          shield -= absorb;
          hp -= mitigated - absorb;
        } else {
          hp -= mitigated;
        }
        if (hp <= 0) {
          const sec = sectorsRef.current[currentSectorIdRef.current];
          simRef.current.px = sec.spawnX;
          simRef.current.py = sec.spawnY;
          simRef.current.debuffs = [];
          simRef.current.dotAcc = 0;
          simRef.current.dashTimer = 0;
          simRef.current.dashIframeTimer = 0;
          simRef.current.dashCooldown = 0;
          pushEvent('Trauma Emergency Stabilized at Sector Entry', 'danger');
          return {
            ...prev,
            hp: Math.floor(prev.maxHp * 0.75),
            shield: prev.maxShield,
            debuffs: [],
            dashCooldown: 0,
            dashIframeActive: false,
          };
        }
        return { ...prev, hp, shield };
      });
    },
    [pushEvent]
  );

  const inflictPlayerDebuff = useCallback(
    (element: DebuffElement, rawDamage: number, duration: number) => {
      if (simRef.current.dashIframeTimer > 0) {
        return;
      }
      const p = playerRef.current;
      const resistMult = p.armor.resistElement === element ? 0.38 : 1.0;
      const bioMult =
        element === 'thermal' || element === 'toxin'
          ? Math.max(0.65, 1 - (p.attributes.bio - 2) * 0.05)
          : 1.0;
      const effectiveDmg = rawDamage * resistMult * bioMult;
      const gain = Math.max(0.2, Math.min(1.0, effectiveDmg / 18));

      const list = simRef.current.debuffs;
      const existing = list.find((d) => d.element === element);
      if (existing) {
        existing.intensity = Math.min(
          1.0,
          Math.max(existing.intensity * 0.72 + gain * 0.58, gain)
        );
        existing.maxTimer = Math.max(existing.maxTimer, duration);
        existing.timer = duration;
      } else {
        list.push({
          element,
          intensity: gain,
          timer: duration,
          maxTimer: duration,
        });
      }

      setPlayer((prev) => ({
        ...prev,
        debuffs: list.map((d) => ({ ...d })),
      }));
    },
    []
  );

  const triggerTacticalDash = useCallback(
    (dirFwd?: number, dirStrafe?: number) => {
      if (activeModalRef.current !== 'none') return;
      const sim = simRef.current;
      if (sim.dashCooldown > 0 || sim.dashTimer > 0 || sim.stamina < DASH_STAMINA_COST) {
        return;
      }

      let fwd = dirFwd ?? 0;
      let strafe = dirStrafe ?? 0;
      if (dirFwd === undefined && dirStrafe === undefined) {
        if (sim.keys.has('KeyW') || sim.keys.has('ArrowUp')) fwd += 1;
        if (sim.keys.has('KeyS') || sim.keys.has('ArrowDown')) fwd -= 1;
        if (sim.keys.has('KeyD')) strafe += 1;
        if (sim.keys.has('KeyA')) strafe -= 1;
        fwd -= sim.moveStick.y;
        strafe += sim.moveStick.x;
        if (Math.hypot(fwd, strafe) < 0.1) {
          fwd = 1;
          strafe = 0;
        }
      }

      const len = Math.hypot(fwd, strafe) || 1;
      const nfwd = fwd / len;
      const nstrafe = strafe / len;
      const cosA = Math.cos(sim.angle);
      const sinA = Math.sin(sim.angle);

      sim.dashDirX = cosA * nfwd - sinA * nstrafe;
      sim.dashDirY = sinA * nfwd + cosA * nstrafe;
      sim.stamina = Math.max(0, sim.stamina - DASH_STAMINA_COST);
      sim.dashTimer = DASH_DURATION;
      sim.dashIframeTimer = DASH_IFRAME_DURATION;
      sim.dashCooldown = DASH_COOLDOWN;

      triggerWeaponDash(sim.weaponMotion, nstrafe, nfwd);
      spawnParticles(sim.particles, sim.px, sim.py, 0.2, '#22D3EE', 5, 2.4);

      const sec = sectorsRef.current[currentSectorIdRef.current];
      const cell = sec?.grid[Math.floor(sim.py)]?.[Math.floor(sim.px)];
      emitFootstepParticles(sim.particles, sim.px, sim.py, sim.angle, cell, true, 1);

      setPlayer((prev) => ({
        ...prev,
        stamina: sim.stamina,
        dashCooldown: DASH_COOLDOWN,
        dashMaxCooldown: DASH_COOLDOWN,
        dashIframeActive: true,
      }));
    },
    []
  );

  const handleFire = useCallback(() => {
    const sim = simRef.current;
    if (sim.fireCooldown > 0 || activeModalRef.current !== 'none') return;
    const p = playerRef.current;
    const w = p.weapons[p.activeWeaponIndex];
    if (!w || w.ammoInMag <= 0) {
      if (w && w.reserveAmmo > 0) handleReload();
      else pushEvent('Out of Ammo — Loot crates or buy from vending units', 'danger');
      return;
    }

    cancelWeaponInspect(sim.weaponMotion, 'firing');
    sim.fireCooldown = 1 / w.fireRate;
    sim.recoil = 1.0;
    sim.muzzleFlash = 1.0;
    sim.outOfCombatTimer = 0;

    setPlayer((prev) => {
      const weapons = [...prev.weapons];
      const cur = { ...weapons[prev.activeWeaponIndex] };
      cur.ammoInMag = Math.max(0, cur.ammoInMag - 1);
      weapons[prev.activeWeaponIndex] = cur;
      return { ...prev, weapons };
    });

    const sec = sectorsRef.current[currentSectorIdRef.current];
    const outcome = firePlayerWeapon(
      sec,
      p,
      sim.px,
      sim.py,
      sim.angle,
      sim.particles
    );

    if (outcome.playerSplashes) {
      for (const sp of outcome.playerSplashes) {
        const d = Math.hypot(sim.px - sp.x, sim.py - sp.y);
        if (d <= sp.radius) {
          const falloff = Math.max(0.18, 1 - d / (sp.radius * 1.15));
          const blastDmg = sp.maxDmg * falloff;
          applyDamageToPlayer(blastDmg, sp.element);
          inflictPlayerDebuff(sp.element, blastDmg, 3.8);
        }
      }
    }

    for (const ev of outcome.hitEvents) {
      pushEvent(ev.text, ev.tone);
    }
    if (Object.keys(outcome.repShifts).length > 0) {
      applyReputationShift(outcome.repShifts);
    }
    if (
      outcome.creditsGained > 0 ||
      Object.keys(outcome.materialsGained).length > 0
    ) {
      setPlayer((prev) => {
        const mats = { ...prev.materials };
        for (const [mk, mv] of Object.entries(outcome.materialsGained)) {
          mats[mk as MaterialType] += mv || 0;
        }
        return {
          ...prev,
          credits: prev.credits + outcome.creditsGained,
          materials: mats,
        };
      });
    }
  }, [
    applyDamageToPlayer,
    applyReputationShift,
    handleReload,
    inflictPlayerDebuff,
    pushEvent,
  ]);

  const enterSector = useCallback(
    (targetId: string, spawnX?: number, spawnY?: number) => {
      const target = sectorsRef.current[targetId];
      if (!target) return;
      setCurrentSectorId(targetId);
      setUnlockedSectors((prev) =>
        prev.includes(targetId) ? prev : [...prev, targetId]
      );
      const nextX = spawnX ?? target.spawnX;
      const nextY = spawnY ?? target.spawnY;
      revealFogOfWar(target, nextX, nextY, 3);
      simRef.current.px = nextX;
      simRef.current.py = nextY;
      simRef.current.lastRevealTileX = Math.floor(nextX);
      simRef.current.lastRevealTileY = Math.floor(nextY);
      simRef.current.angle = target.spawnAngle;
      simRef.current.particles = [];
      pushEvent(`Entered ${target.name}`, 'info');
    },
    [pushEvent]
  );

  // Detect interactable in front of player (NPCs, terminals, gates, loot, vending)
  const findInteractable = useCallback(():
    | { type: 'entity'; entity: WorldEntity; label: string }
    | { type: 'gate'; gx: number; gy: number; toSector: string; sx?: number; sy?: number; lockedBy?: string; label: string }
    | null => {
    const sim = simRef.current;
    const sec = sectorsRef.current[currentSectorIdRef.current];
    const rdx = Math.cos(sim.angle);
    const rdy = Math.sin(sim.angle);

    // 1. Check nearby entities in front cone
    let bestEnt: WorldEntity | null = null;
    let bestDist = 2.1;
    for (const e of sec.entities) {
      if (e.dead || !e.interactLabel) continue;
      const d = Math.hypot(e.x - sim.px, e.y - sim.py);
      if (d < bestDist) {
        const dot = ((e.x - sim.px) / d) * rdx + ((e.y - sim.py) / d) * rdy;
        if (dot > 0.6) {
          bestDist = d;
          bestEnt = e;
        }
      }
    }
    if (bestEnt) {
      return {
        type: 'entity',
        entity: bestEnt,
        label: bestEnt.interactLabel!,
      };
    }

    // 2. Check gate / door directly ahead
    for (let d = 0.6; d <= 1.85; d += 0.25) {
      const gx = Math.floor(sim.px + rdx * d);
      const gy = Math.floor(sim.py + rdy * d);
      const cell = sec.grid[gy]?.[gx];
      if (cell && (cell.kind === 'gate' || cell.kind === 'door') && cell.gateToSector) {
        const dest = sectorsRef.current[cell.gateToSector];
        return {
          type: 'gate',
          gx,
          gy,
          toSector: cell.gateToSector,
          sx: cell.gateSpawnX,
          sy: cell.gateSpawnY,
          lockedBy: cell.doorLockedBy,
          label: cell.doorLockedBy
            ? `Sealed Gate to ${dest?.name || cell.gateToSector} (Access Terminal or Talk)`
            : `Transit to ${dest?.name || cell.gateToSector}`,
        };
      }
    }
    return null;
  }, []);

  const handleInteract = useCallback(() => {
    if (activeModalRef.current !== 'none') return;
    const hit = findInteractable();
    if (!hit) return;

    if (hit.type === 'gate') {
      if (hit.lockedBy) {
        pushEvent('Transit seal locked — Override terminal or talk to sector contact', 'danger');
        return;
      }
      enterSector(hit.toSector, hit.sx, hit.sy);
      return;
    }

    const ent = hit.entity;
    if (ent.dialogueId && DIALOGUES[ent.dialogueId]) {
      if (document.pointerLockElement) document.exitPointerLock();
      setDialogueState({
        graphId: ent.dialogueId,
        nodeId: DIALOGUES[ent.dialogueId].startNodeId,
      });
      setActiveModal('dialogue');
      return;
    }

    if (ent.kind === 'loot_medkit') {
      ent.dead = true;
      const healAmt = 30 + playerRef.current.attributes.bio * 4;
      setPlayer((prev) => ({
        ...prev,
        hp: Math.min(prev.maxHp, prev.hp + healAmt),
      }));
      pushEvent(`Trauma Kit applied (+${healAmt} HP)`, 'info');
    } else if (ent.kind === 'loot_ammo') {
      ent.dead = true;
      setPlayer((prev) => {
        const weapons = prev.weapons.map((w) => ({
          ...w,
          reserveAmmo: w.reserveAmmo + w.magSize * 2,
        }));
        return { ...prev, weapons };
      });
      pushEvent('Ammo Resupplied', 'info');
    } else if (ent.kind === 'loot_scrap') {
      ent.dead = true;
      setPlayer((prev) => ({
        ...prev,
        materials: {
          ...prev.materials,
          scrap: prev.materials.scrap + 3,
          arc_coil: prev.materials.arc_coil + 1,
          cryo_cell: prev.materials.cryo_cell + 1,
          ceramic_plate: prev.materials.ceramic_plate + 1,
        },
      }));
      pushEvent('Salvaged Crafting Components', 'info');
    } else if (ent.kind === 'vending') {
      if (playerRef.current.credits < 35) {
        pushEvent('Insufficient Credits (35 Cr needed)', 'danger');
        return;
      }
      setPlayer((prev) => ({
        ...prev,
        credits: prev.credits - 35,
        hp: Math.min(prev.maxHp, prev.hp + 25),
        materials: {
          ...prev.materials,
          scrap: prev.materials.scrap + 2,
        },
      }));
      pushEvent('Purchased Stim-Soda & Scrap (-35 Cr, +25 HP)', 'info');
    }
  }, [enterSector, findInteractable, pushEvent]);

  const handleDialogueChoice = (choice: DialogueChoice) => {
    if (choice.repDelta) {
      applyReputationShift(choice.repDelta);
    }
    if (choice.grantCredits || choice.grantMaterials || choice.healPlayer) {
      setPlayer((prev) => {
        const mats = { ...prev.materials };
        if (choice.grantMaterials) {
          for (const [k, v] of Object.entries(choice.grantMaterials)) {
            mats[k as MaterialType] += v || 0;
          }
        }
        return {
          ...prev,
          credits: prev.credits + (choice.grantCredits || 0),
          hp: Math.min(prev.maxHp, prev.hp + (choice.healPlayer || 0)),
          materials: mats,
        };
      });
    }
    if (choice.unlockSectorDoor) {
      const { sectorId, x, y } = choice.unlockSectorDoor;
      const cell = sectorsRef.current[sectorId]?.grid[y]?.[x];
      if (cell) {
        cell.doorLockedBy = undefined;
        cell.doorOpen = 0;
        if (cell.gateToSector) {
          setUnlockedSectors((prev) =>
            prev.includes(cell.gateToSector!)
              ? prev
              : [...prev, cell.gateToSector!]
          );
        }
        pushEvent('Sector Transit Gate Unlocked', 'combo');
      }
    }
    if (choice.startMissionId) {
      setMissions((ms) =>
        ms.map((m) =>
          m.id === choice.startMissionId && m.status === 'available'
            ? { ...m, status: 'active' }
            : m
        )
      );
    }
    if (choice.completeMissionId) {
      const mObj = missionsRef.current.find(
        (m) => m.id === choice.completeMissionId
      );
      if (mObj && mObj.status !== 'completed') {
        setMissions((ms) =>
          ms.map((m) =>
            m.id === choice.completeMissionId ? { ...m, status: 'completed' } : m
          )
        );
        if (mObj.rewardRep) applyReputationShift(mObj.rewardRep);
        setPlayer((prev) => {
          const mats = { ...prev.materials };
          for (const [k, v] of Object.entries(mObj.rewardMaterials)) {
            mats[k as MaterialType] += v || 0;
          }
          return {
            ...prev,
            credits: prev.credits + mObj.rewardCredits,
            materials: mats,
          };
        });
        pushEvent(`Contract Completed: ${mObj.title}`, 'combo');
      }
    }

    if (choice.endDialogue || !choice.nextNodeId) {
      setDialogueState(null);
      setActiveModal('none');
    } else if (dialogueState) {
      setDialogueState({
        ...dialogueState,
        nodeId: choice.nextNodeId,
      });
    }
  };

  const handleCraft = (recipe: CraftingRecipe) => {
    setPlayer((prev) => {
      if (prev.attributes.tech < recipe.minTech) return prev;
      const mats = { ...prev.materials };
      for (const [k, need] of Object.entries(recipe.cost)) {
        if ((mats[k as MaterialType] || 0) < (need || 0)) return prev;
        mats[k as MaterialType] -= need || 0;
      }

      if (recipe.kind === 'weapon' && recipe.weaponTemplate) {
        const newWep = {
          ...recipe.weaponTemplate,
          id: `${recipe.id}_${Date.now()}`,
        };
        const weapons = [...prev.weapons, newWep];
        pushEvent(`Crafted & Equipped ${newWep.name}`, 'combo');
        return {
          ...prev,
          materials: mats,
          weapons,
          activeWeaponIndex: weapons.length - 1,
        };
      }

      if (recipe.kind === 'armor' && recipe.armorTemplate) {
        const newArmor = {
          ...recipe.armorTemplate,
          id: `${recipe.id}_${Date.now()}`,
        };
        const newMaxShield = newArmor.maxShield + prev.attributes.tech * 4;
        pushEvent(`Crafted & Equipped ${newArmor.name}`, 'combo');
        return {
          ...prev,
          materials: mats,
          armor: newArmor,
          maxShield: newMaxShield,
          shield: newMaxShield,
        };
      }

      return prev;
    });
  };

  // Input & Pointer-Lock Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      simRef.current.keys.add(code);

      if (code === 'KeyE') {
        handleInteract();
      } else if (code === 'KeyR') {
        handleReload();
      } else if (code === 'KeyI' && activeModalRef.current === 'none') {
        triggerWeaponInspect(simRef.current.weaponMotion);
      } else if (code === 'Space' && activeModalRef.current === 'none') {
        e.preventDefault();
        if (!e.repeat) {
          triggerTacticalDash();
        }
      } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
        const idx = parseInt(code.replace('Digit', ''), 10) - 1;
        setPlayer((prev) =>
          idx < prev.weapons.length ? { ...prev, activeWeaponIndex: idx } : prev
        );
      } else if (code === 'Tab') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        const sec = sectorsRef.current[currentSectorIdRef.current];
        if (sec) {
          revealFogOfWar(sec, simRef.current.px, simRef.current.py, 3);
        }
        setActiveModal((m) => (m === 'map' ? 'none' : 'map'));
      } else if (code === 'KeyC' && activeModalRef.current !== 'creator') {
        if (document.pointerLockElement) document.exitPointerLock();
        setActiveModal((m) => (m === 'crafting' ? 'none' : 'crafting'));
      }

      if (!e.repeat && activeModalRef.current === 'none') {
        let tapSlot: string | null = null;
        let df = 0;
        let ds = 0;
        if (code === 'KeyW' || code === 'ArrowUp') {
          tapSlot = 'fwd+';
          df = 1;
        } else if (code === 'KeyS' || code === 'ArrowDown') {
          tapSlot = 'fwd-';
          df = -1;
        } else if (code === 'KeyA') {
          tapSlot = 'strafe-';
          ds = -1;
        } else if (code === 'KeyD') {
          tapSlot = 'strafe+';
          ds = 1;
        }
        if (tapSlot) {
          const nowMs = performance.now();
          const prevTap = simRef.current.lastMoveTap[tapSlot] ?? 0;
          if (nowMs - prevTap <= DOUBLE_TAP_WINDOW_MS) {
            simRef.current.lastMoveTap[tapSlot] = 0;
            triggerTacticalDash(df, ds);
          } else {
            simRef.current.lastMoveTap[tapSlot] = nowMs;
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keys.delete(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvasRef.current) {
        simRef.current.angle += e.movementX * 0.0024;
        simRef.current.pitch = Math.max(
          -0.28,
          Math.min(0.28, simRef.current.pitch - e.movementY * 0.0014)
        );
        simRef.current.weaponMotion.lookVelX += e.movementX * 0.35;
        simRef.current.weaponMotion.lookVelY += e.movementY * 0.25;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (
        e.button === 0 &&
        activeModalRef.current === 'none' &&
        document.pointerLockElement === canvasRef.current
      ) {
        simRef.current.mouseDown = true;
        handleFire();
      }
    };

    const onMouseUp = () => {
      simRef.current.mouseDown = false;
    };

    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [handleFire, handleInteract, handleReload, triggerTacticalDash]);

  // Main 60 FPS Simulation + Raycast + GLES Shader Presentation Loop
  useEffect(() => {
    if (!atlasLoaded) return;
    let rafId = 0;
    let last = performance.now();
    let hudSyncAcc = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      sim.time += dt;
      sim.fireCooldown = Math.max(0, sim.fireCooldown - dt);
      sim.recoil = Math.max(0, sim.recoil - dt * 6);
      sim.muzzleFlash = Math.max(0, sim.muzzleFlash - dt * 11);
      sim.damageFlash = Math.max(0, sim.damageFlash - dt * 3.5);

      const sec = sectorsRef.current[currentSectorIdRef.current];
      const p = playerRef.current;

      if (activeModalRef.current === 'none' && sec) {
        // Automatic fire if mouse held
        if (sim.mouseDown && sim.fireCooldown <= 0) {
          handleFire();
        }

        // Player Movement, Shift Sprint & Collision
        const cosA = Math.cos(sim.angle);
        const sinA = Math.sin(sim.angle);
        let moveFwd = 0;
        let moveStrafe = 0;

        let turnDelta = 0;
        if (sim.keys.has('KeyW') || sim.keys.has('ArrowUp')) moveFwd += 1;
        if (sim.keys.has('KeyS') || sim.keys.has('ArrowDown')) moveFwd -= 1;
        if (sim.keys.has('KeyD')) moveStrafe += 1;
        if (sim.keys.has('KeyA')) moveStrafe -= 1;
        if (sim.keys.has('ArrowLeft')) {
          sim.angle -= 2.2 * dt;
          turnDelta -= 2.2 * dt * 115;
        }
        if (sim.keys.has('ArrowRight')) {
          sim.angle += 2.2 * dt;
          turnDelta += 2.2 * dt * 115;
        }

        // Virtual touch sticks
        moveFwd -= sim.moveStick.y;
        moveStrafe += sim.moveStick.x;
        sim.angle += sim.lookStick.x * 2.4 * dt;
        turnDelta += sim.lookStick.x * 2.4 * dt * 115;
        sim.weaponMotion.lookVelX += turnDelta;

        // Active elemental debuff decay & tactical modifiers (cryo slow, shock stamina drag, thermal/toxin DoT)
        let cryoEff = 0;
        let shockEff = 0;
        let thermalEff = 0;
        let toxinEff = 0;
        for (let di = sim.debuffs.length - 1; di >= 0; di--) {
          const deb = sim.debuffs[di];
          deb.timer -= dt;
          if (deb.timer <= 0) {
            sim.debuffs.splice(di, 1);
            continue;
          }
          const eff =
            deb.intensity * (0.32 + 0.68 * Math.min(1, deb.timer / Math.max(0.1, deb.maxTimer)));
          if (deb.element === 'cryo') cryoEff = Math.max(cryoEff, eff);
          else if (deb.element === 'shock') shockEff = Math.max(shockEff, eff);
          else if (deb.element === 'thermal') thermalEff = Math.max(thermalEff, eff);
          else if (deb.element === 'toxin') toxinEff = Math.max(toxinEff, eff);
        }

        if (thermalEff > 0 || toxinEff > 0) {
          sim.dotAcc += (thermalEff * 4.8 + toxinEff * 3.6) * dt;
          if (sim.dotAcc >= 0.85) {
            const dotAmt = sim.dotAcc;
            sim.dotAcc = 0;
            applyDamageToPlayer(
              dotAmt,
              thermalEff >= toxinEff ? 'thermal' : 'toxin',
              true
            );
          }
        } else {
          sim.dotAcc = 0;
        }

        sim.dashTimer = Math.max(0, sim.dashTimer - dt);
        sim.dashIframeTimer = Math.max(0, sim.dashIframeTimer - dt);
        sim.dashCooldown = Math.max(0, sim.dashCooldown - dt);

        const isDashing = sim.dashTimer > 0;
        const reducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const targetFov = (isDashing ? 0.068 : 0) * (reducedMotion ? 0.25 : 1.0);
        sim.dashFovOffset += (targetFov - sim.dashFovOffset) * (1 - Math.exp(-18 * dt));
        if (!isDashing && Math.abs(sim.dashFovOffset) < 0.0005) {
          sim.dashFovOffset = 0;
        }

        const wantsMove = Math.abs(moveFwd) + Math.abs(moveStrafe) > 0.05;
        const wantsSprint =
          sim.keys.has('ShiftLeft') ||
          sim.keys.has('ShiftRight') ||
          sim.touchSprint;
        const isSprinting = !isDashing && wantsMove && wantsSprint && sim.stamina > 2;

        if (isSprinting) {
          const drainRate = 26 / (1 + p.attributes.neural * 0.05);
          sim.stamina = Math.max(0, sim.stamina - drainRate * dt);
        } else if (!isDashing) {
          const shockRegenMult = 1 - shockEff * 0.45;
          sim.stamina = Math.min(p.maxStamina, sim.stamina + 18 * shockRegenMult * dt);
        }

        const sprintMult = isSprinting ? 1.52 : 1.0;
        const cryoSlowMult = 1 - cryoEff * 0.28;
        const speed = 3.6 * p.armor.speedMod * sprintMult * cryoSlowMult * dt;

        const vx = isDashing
          ? sim.dashDirX * DASH_SPEED * cryoSlowMult * dt
          : (cosA * moveFwd - sinA * moveStrafe) * speed;
        const vy = isDashing
          ? sim.dashDirY * DASH_SPEED * cryoSlowMult * dt
          : (sinA * moveFwd + cosA * moveStrafe) * speed;
        const margin = 0.24;

        const canStep = (nx: number, ny: number) => {
          const checkPts = [
            [nx - margin, ny - margin],
            [nx + margin, ny - margin],
            [nx - margin, ny + margin],
            [nx + margin, ny + margin],
          ];
          for (const [cx, cy] of checkPts) {
            const gx = Math.floor(cx);
            const gy = Math.floor(cy);
            if (gx < 0 || gy < 0 || gx >= sec.width || gy >= sec.height) return false;
            const cell = sec.grid[gy][gx];
            if (cell.kind === 'wall') return false;
            if (cell.kind === 'cover' && cell.coverHp > 0) return false;
            if ((cell.kind === 'door' || cell.kind === 'gate') && cell.doorOpen < 0.75)
              return false;
          }
          return true;
        };

        const oldPx = sim.px;
        const oldPy = sim.py;
        if (canStep(sim.px + vx, sim.py)) sim.px += vx;
        if (canStep(sim.px, sim.py + vy)) sim.py += vy;

        const tileX = Math.floor(sim.px);
        const tileY = Math.floor(sim.py);
        if (tileX !== sim.lastRevealTileX || tileY !== sim.lastRevealTileY) {
          sim.lastRevealTileX = tileX;
          sim.lastRevealTileY = tileY;
          revealFogOfWar(sec, sim.px, sim.py, 3);
        }

        const movedDist = Math.hypot(sim.px - oldPx, sim.py - oldPy);
        const isMoving = !isDashing && movedDist > 0.0008;
        if (isMoving) {
          sim.bobPhase += dt * (isSprinting ? 16.5 : 10.5);
          sim.bobOffset = Math.sin(sim.bobPhase) * (isSprinting ? 4.8 : 3.2);
          const stepIdx = Math.floor(sim.bobPhase / Math.PI);
          if (stepIdx !== sim.lastStepIndex) {
            sim.lastStepIndex = stepIdx;
            const footCell = sec.grid[Math.floor(sim.py)]?.[Math.floor(sim.px)];
            emitFootstepParticles(
              sim.particles,
              sim.px,
              sim.py,
              sim.angle,
              footCell,
              isSprinting,
              stepIdx % 2 === 0 ? 1 : -1
            );
          }
        } else {
          sim.bobOffset *= 0.85;
        }

        if (p.activeWeaponIndex !== sim.lastWeaponIndex) {
          sim.lastWeaponIndex = p.activeWeaponIndex;
          sim.weaponMotion.equipDip = 1.0;
          cancelWeaponInspect(sim.weaponMotion, 'equipping');
        }

        stepWeaponMotion(
          sim.weaponMotion,
          {
            archetype: p.weapons[p.activeWeaponIndex]?.archetype ?? 'rifle',
            time: sim.time,
            bobPhase: sim.bobPhase,
            moveStrafe,
            isMoving,
            isSprinting,
            recoil: sim.recoil,
            fireCooldown: sim.fireCooldown,
            reducedMotion,
          },
          dt
        );

        // Surface hazard timers & player floor damage + elemental debuff buildup
        sim.hazardTick += dt;
        const playerCell = sec.grid[Math.floor(sim.py)]?.[Math.floor(sim.px)];
        if (sim.hazardTick >= 0.6) {
          sim.hazardTick = 0;
          if (playerCell) {
            if (playerCell.hazard === 'burning') {
              applyDamageToPlayer(7, 'thermal');
              inflictPlayerDebuff('thermal', 7, 3.2);
            } else if (playerCell.hazard === 'electrified') {
              applyDamageToPlayer(8, 'shock');
              inflictPlayerDebuff('shock', 8, 2.6);
            } else if (playerCell.hazard === 'toxic') {
              applyDamageToPlayer(5, 'toxin');
              inflictPlayerDebuff('toxin', 5, 3.6);
            } else if (playerCell.hazard === 'frozen') {
              applyDamageToPlayer(2.5, 'cryo');
              inflictPlayerDebuff('cryo', 6, 3.0);
            } else if (playerCell.hazard === 'coolant') {
              inflictPlayerDebuff('cryo', 3.6, 2.2);
            }
          }
        }

        // Animate destructible cover slump & hit impact shake
        for (let gy = 0; gy < sec.height; gy++) {
          const row = sec.grid[gy];
          for (let gx = 0; gx < sec.width; gx++) {
            const cell = row[gx];
            if (cell.kind !== 'cover' || cell.coverHp <= 0) continue;
            if (cell.coverShake && cell.coverShake > 0) {
              cell.coverShake = Math.max(0, cell.coverShake - dt * 5.2);
            }
            const hpPct = cell.coverHp / Math.max(1, cell.coverMaxHp);
            const targetScale = hpPct > 0.66 ? 1.0 : hpPct > 0.33 ? 0.88 : 0.68;
            const curScale = cell.coverVisualScale ?? 1.0;
            if (Math.abs(curScale - targetScale) > 0.002) {
              cell.coverVisualScale =
                curScale + (targetScale - curScale) * Math.min(1, dt * 10);
            } else {
              cell.coverVisualScale = targetScale;
            }
          }
        }

        // Update Enemy AI & Elemental Statuses
        for (const ent of sec.entities) {
          if (ent.dead) continue;
          if (ent.statusTimer > 0 && ent.statusElement) {
            ent.statusTimer = Math.max(0, ent.statusTimer - dt);
            ent.statusEmitAcc = (ent.statusEmitAcc ?? 0) + dt;
            const emitRate =
              ent.statusElement === 'shock'
                ? 0.07
                : ent.statusElement === 'thermal'
                ? 0.09
                : ent.statusElement === 'cryo'
                ? 0.11
                : 0.25;
            if (ent.statusEmitAcc >= emitRate) {
              ent.statusEmitAcc = 0;
              if (
                ent.statusElement === 'thermal' ||
                ent.statusElement === 'cryo' ||
                ent.statusElement === 'shock'
              ) {
                emitStatusParticles(sim.particles, ent, ent.statusElement);
              }
            }
            if (ent.statusElement === 'thermal' || ent.statusElement === 'toxin') {
              ent.hp -= dt * 6;
              if (ent.hp <= 0) {
                ent.dead = true;
                spawnParticles(sim.particles, ent.x, ent.y, 0.45, '#EF4444', 8, 2.5);
                continue;
              }
            }
          } else {
            ent.statusElement = null;
            ent.statusEmitAcc = 0;
          }

          if (!ent.hostile) continue;
          if (ent.statusElement === 'shock' && ent.statusTimer > 2.2) continue; // brief stun

          const dx = sim.px - ent.x;
          const dy = sim.py - ent.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 11 && hasLineOfSight(sec, ent.x, ent.y, sim.px, sim.py)) {
            ent.alerted = true;
          }
          if (!ent.alerted) continue;

          const slowMult = ent.statusElement === 'cryo' ? 0.45 : 1.0;
          const desiredDist = ent.kind === 'enemy_rat' ? 0.85 : 3.2;
          if (dist > desiredDist && dist < 14) {
            const step = (ent.kind === 'enemy_rat' ? 2.1 : 1.35) * slowMult * dt;
            const nx = ent.x + (dx / dist) * step;
            const ny = ent.y + (dy / dist) * step;
            const c = sec.grid[Math.floor(ny)]?.[Math.floor(nx)];
            if (c && c.kind === 'empty') {
              ent.x = nx;
              ent.y = ny;
            }
          }

          ent.attackCooldown = Math.max(0, ent.attackCooldown - dt);
          const attackRange = ent.kind === 'enemy_rat' ? 1.25 : 8.5;
          if (
            dist <= attackRange &&
            ent.attackCooldown <= 0 &&
            hasLineOfSight(sec, ent.x, ent.y, sim.px, sim.py)
          ) {
            ent.attackCooldown = ent.kind === 'enemy_rat' ? 1.0 : 1.45;
            const rawDmg = ent.kind === 'enemy_droid' ? 14 : ent.kind === 'enemy_rat' ? 8 : 11;
            const attackElement: ElementType =
              ent.statusElement && ent.statusElement !== 'kinetic' && ent.statusTimer > 0
                ? ent.statusElement
                : ent.kind === 'enemy_droid'
                ? 'shock'
                : ent.kind === 'enemy_rat'
                ? 'toxin'
                : 'kinetic';
            applyDamageToPlayer(rawDmg, attackElement);
            if (attackElement !== 'kinetic') {
              inflictPlayerDebuff(
                attackElement,
                rawDmg,
                attackElement === 'toxin' ? 3.4 : 2.8
              );
            }
            spawnParticles(sim.particles, ent.x, ent.y, 0.55, '#F87171', 3, 2.0);
          }
        }

        // Shield passive recharge out of combat
        sim.outOfCombatTimer += dt;
        if (sim.outOfCombatTimer > 3.5 && p.shield < p.maxShield) {
          const regen = (p.perk === 'subdermal_mesh' ? 10 : 5) * dt;
          setPlayer((prev) => ({
            ...prev,
            shield: Math.min(prev.maxShield, prev.shield + regen),
          }));
        }
      }

      // Particle Physics (Embers, Frost Mist, Shock Sparks, Debris)
      stepParticles(sim.particles, dt);

      // Render 2.5D Raycast Frame & Present via GLSL ES 2.0 Shader
      if (raycasterRef.current && presenterRef.current && sec) {
        const activeWeapon = p.weapons[p.activeWeaponIndex];
        const imgData = raycasterRef.current.render({
          px: sim.px,
          py: sim.py,
          angle: sim.angle,
          pitch: sim.pitch,
          bobOffset: sim.bobOffset,
          weaponSwayX: sim.weaponMotion.offsetX,
          weaponSwayY: sim.weaponMotion.offsetY,
          weaponRoll: sim.weaponMotion.roll,
          weaponScale: sim.weaponMotion.scaleMult,
          weaponInspectGlow: sim.weaponMotion.inspectGlow,
          recoil: sim.recoil,
          muzzleFlash: sim.muzzleFlash,
          time: sim.time,
          sector: sec,
          weapon: activeWeapon,
          particles: sim.particles,
          targetEntityId: null,
          fovOffset: sim.dashFovOffset,
        });

        presenterRef.current.present(imgData, {
          muzzleFlash: sim.muzzleFlash,
          damageFlash: sim.damageFlash,
          lowHpFactor: p.hp < 32 ? (32 - p.hp) / 32 : 0,
          elementTint: getElementTint(activeWeapon.element),
          time: sim.time,
          retroDither: renderScale === 'native' ? 0 : 1,
          dashIframe: Math.min(1, sim.dashIframeTimer / 0.16),
        });
      }

      // Periodic lightweight HUD state sync (~12 Hz)
      hudSyncAcc += dt;
      if (hudSyncAcc >= 0.08) {
        hudSyncAcc = 0;
        setHudAngle(sim.angle);
        const staminaChanged = Math.abs(playerRef.current.stamina - sim.stamina) >= 0.8;
        const debuffsActive =
          sim.debuffs.length > 0 || (playerRef.current.debuffs?.length ?? 0) > 0;
        const dashCdChanged =
          Math.abs((playerRef.current.dashCooldown ?? 0) - sim.dashCooldown) >= 0.04;
        const iframeNow = sim.dashIframeTimer > 0;
        const iframeChanged = Boolean(playerRef.current.dashIframeActive) !== iframeNow;
        if (staminaChanged || debuffsActive || dashCdChanged || iframeChanged) {
          setPlayer((prev) => ({
            ...prev,
            stamina: staminaChanged ? sim.stamina : prev.stamina,
            debuffs: debuffsActive ? sim.debuffs.map((d) => ({ ...d })) : prev.debuffs,
            dashCooldown: sim.dashCooldown,
            dashMaxCooldown: DASH_COOLDOWN,
            dashIframeActive: iframeNow,
          }));
        }
        const inter = findInteractable();
        setInteractPrompt(inter ? inter.label : null);
        setEvents((prev) =>
          prev
            .map((ev) => ({ ...ev, ttl: ev.ttl - 0.08 }))
            .filter((ev) => ev.ttl > 0)
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    applyDamageToPlayer,
    atlasLoaded,
    findInteractable,
    handleFire,
    inflictPlayerDebuff,
    pushEvent,
    renderScale,
  ]);

  const requestLock = () => {
    if (canvasRef.current && activeModal === 'none' && !touchMode) {
      canvasRef.current.requestPointerLock?.();
    }
  };

  const openModal = (modal: ActiveModal) => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (modal === 'map') {
      const sec = sectorsRef.current[currentSectorIdRef.current];
      if (sec) {
        revealFogOfWar(sec, simRef.current.px, simRef.current.py, 3);
      }
    }
    setActiveModal(modal);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0B0D11] overflow-hidden select-none">
      {/* Clean 3-Zone Top Bar */}
      <header className="fixed top-0 inset-x-0 z-30 h-12 px-5 bg-[#0B0D11]/80 backdrop-blur-md border-b border-white/8 flex items-center justify-between gap-8">
        <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Sector Zero
        </span>

        <nav className="flex items-center gap-5 text-xs font-medium text-slate-300 overflow-x-auto">
          <button
            onClick={() => openModal('creator')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Character
          </button>
          <button
            onClick={() => openModal('crafting')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Crafting
          </button>
          <button
            onClick={() => openModal('map')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sector Map
          </button>
          <button
            onClick={() => setTouchMode((t) => !t)}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              touchMode ? 'text-amber-400' : 'hover:text-white'
            }`}
          >
            {touchMode ? 'Touch Controls: On' : 'Touch Controls'}
          </button>
        </nav>

        <div className="shrink-0">
          <button
            onClick={() => openModal('lua')}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-xs font-semibold text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Lua &amp; GLES Code
          </button>
        </div>
      </header>

      {/* Full-Viewport 2.5D Raycasted + GLES 2.0 Shader Canvas */}
      <canvas
        ref={canvasRef}
        onClick={requestLock}
        className="w-full h-full block cursor-crosshair"
      />

      {!atlasLoaded && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#0B0D11] text-sm text-slate-300 font-mono">
          Extracting 1408×768 Sprite Sheet Atlas...
        </div>
      )}

      {/* Minimal Diegetic Gameplay HUD */}
      {atlasLoaded && activeModal === 'none' && (
        <GameHUD
          player={player}
          sector={sectors[currentSectorId]}
          angle={hudAngle}
          interactPrompt={interactPrompt}
          events={events}
          touchMode={touchMode}
          pointerLocked={pointerLocked}
          onMoveStick={(dx, dy) => {
            simRef.current.moveStick = { x: dx, y: dy };
          }}
          onLookStick={(dx, dy) => {
            simRef.current.lookStick = { x: dx, y: dy };
          }}
          onFire={handleFire}
          onReload={handleReload}
          onInteract={handleInteract}
          onCycleWeapon={() =>
            setPlayer((prev) => ({
              ...prev,
              activeWeaponIndex:
                (prev.activeWeaponIndex + 1) % prev.weapons.length,
            }))
          }
          onSprintToggle={(active) => {
            simRef.current.touchSprint = active;
          }}
          onDash={() => triggerTacticalDash()}
          onRequestLock={requestLock}
        />
      )}

      {/* RPG Modals & Lua Code Studio */}
      {activeModal === 'creator' && (
        <CharacterCreatorModal
          onStartGame={handleStartNewCharacter}
          onCancel={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'dialogue' && dialogueState && (
        <DialogueOverlay
          graph={DIALOGUES[dialogueState.graphId]}
          nodeId={dialogueState.nodeId}
          player={player}
          onSelectChoice={handleDialogueChoice}
          onClose={() => {
            setDialogueState(null);
            setActiveModal('none');
          }}
        />
      )}

      {activeModal === 'crafting' && (
        <CraftingWorkbench
          player={player}
          onCraft={handleCraft}
          onEquipWeapon={(idx) =>
            setPlayer((prev) => ({ ...prev, activeWeaponIndex: idx }))
          }
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'map' && (
        <SectorMapOverlay
          sectors={sectors}
          currentSectorId={currentSectorId}
          playerX={simRef.current.px}
          playerY={simRef.current.py}
          unlockedSectors={unlockedSectors}
          reputation={reputation}
          missions={missions}
          onFastTravel={(secId) => {
            enterSector(secId);
            setActiveModal('none');
          }}
          onAcceptMission={(mId) => {
            setMissions((ms) =>
              ms.map((m) => (m.id === mId ? { ...m, status: 'active' } : m))
            );
            pushEvent('Contract Tracked', 'info');
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'lua' && (
        <LuaCodeStudio
          renderScale={renderScale}
          onChangeRenderScale={setRenderScale}
          onClose={() => setActiveModal('none')}
        />
      )}
    </div>
  );
}
