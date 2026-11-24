import {
  Armor,
  Attributes,
  CraftingRecipe,
  DialogueGraph,
  FactionId,
  GridCell,
  Mission,
  OriginId,
  PerkId,
  SectorDefinition,
  SurfaceHazard,
  Weapon,
  WorldEntity,
} from '../types/game';

export const FACTION_INFO: Record<
  FactionId,
  { name: string; summary: string; accent: string }
> = {
  aegis: {
    name: 'Aegis Security',
    summary: 'Corporate peacekeeping force policing Transit Concourse and Checkpoint.',
    accent: '#06B6D4',
  },
  syndicate: {
    name: 'Rust Syndicate',
    summary: 'Underground salvagers, gunsmiths, and contraband brokers in the Alleyways.',
    accent: '#F59E0B',
  },
  helix: {
    name: 'Helix Bio-Collective',
    summary: 'Rogue lab technicians and bio-modders holding the Bio-Lab and Reactor.',
    accent: '#10B981',
  },
};

export const ORIGINS: Record<
  OriginId,
  {
    name: string;
    summary: string;
    bonusAttr: Partial<Attributes>;
    startRep: Record<FactionId, number>;
    startWeapon: Weapon;
    startArmor: Armor;
    startCredits: number;
  }
> = {
  breacher: {
    name: 'Tactical Breacher',
    summary: 'Ex-riot operator trained in cover destruction and close-quarters kinetic shock.',
    bonusAttr: { ballistics: 2, bio: 1 },
    startRep: { aegis: 15, syndicate: -5, helix: 0 },
    startWeapon: {
      id: 'w_breacher_sg',
      name: 'M40 Riot Breacher',
      archetype: 'shotgun',
      spriteId: 'weapon_shotgun',
      element: 'kinetic',
      damage: 14,
      fireRate: 1.4,
      magSize: 8,
      ammoInMag: 8,
      reserveAmmo: 32,
      spread: 0.12,
      pellets: 5,
      range: 9,
    },
    startArmor: {
      id: 'a_riot_vest',
      name: 'Riot Plate Carrier',
      defense: 22,
      maxShield: 40,
      resistElement: 'kinetic',
      speedMod: 0.96,
    },
    startCredits: 180,
  },
  netrunner: {
    name: 'Grid Splicer',
    summary: 'System infiltrator specializing in terminal overrides, arc weapons, and drone takedowns.',
    bonusAttr: { tech: 2, neural: 1 },
    startRep: { aegis: -5, syndicate: 15, helix: 5 },
    startWeapon: {
      id: 'w_arc_smg',
      name: 'VX-9 Arc Submachine',
      archetype: 'smg',
      spriteId: 'weapon_smg',
      element: 'shock',
      damage: 12,
      fireRate: 7.5,
      magSize: 28,
      ammoInMag: 28,
      reserveAmmo: 112,
      spread: 0.055,
      pellets: 1,
      range: 14,
    },
    startArmor: {
      id: 'a_wire_weave',
      name: 'Insulated Mesh Rig',
      defense: 14,
      maxShield: 55,
      resistElement: 'shock',
      speedMod: 1.05,
    },
    startCredits: 240,
  },
  bio_tech: {
    name: 'Cryo Chemist',
    summary: 'Containment specialist carrying pressurized cryo canisters and hardened hazmat liners.',
    bonusAttr: { bio: 2, tech: 1 },
    startRep: { aegis: 0, syndicate: -5, helix: 20 },
    startWeapon: {
      id: 'w_cryo_carbine',
      name: 'HLX-4 Cryo Carbine',
      archetype: 'rifle',
      spriteId: 'weapon_rifle',
      element: 'cryo',
      damage: 21,
      fireRate: 4.2,
      magSize: 20,
      ammoInMag: 20,
      reserveAmmo: 80,
      spread: 0.025,
      pellets: 1,
      range: 18,
    },
    startArmor: {
      id: 'a_haz_liner',
      name: 'Sealed Containment Suit',
      defense: 18,
      maxShield: 45,
      resistElement: 'toxin',
      speedMod: 1.0,
    },
    startCredits: 190,
  },
  fixer: {
    name: 'Syndicate Fixer',
    summary: 'Back-alley negotiator armed with an incendiary sidearm and high-leverage faction ties.',
    bonusAttr: { neural: 2, ballistics: 1 },
    startRep: { aegis: -10, syndicate: 25, helix: 5 },
    startWeapon: {
      id: 'w_thermite_pistol',
      name: '9mm Thermite Sidearm',
      archetype: 'pistol',
      spriteId: 'weapon_pistol',
      element: 'thermal',
      damage: 26,
      fireRate: 3.4,
      magSize: 12,
      ammoInMag: 12,
      reserveAmmo: 60,
      spread: 0.02,
      pellets: 1,
      range: 16,
    },
    startArmor: {
      id: 'a_street_coat',
      name: 'Kevlar Trench Coat',
      defense: 16,
      maxShield: 35,
      resistElement: 'thermal',
      speedMod: 1.08,
    },
    startCredits: 320,
  },
};

export const PERKS: Record<PerkId, { name: string; description: string }> = {
  hollow_point: {
    name: 'Structural Breacher',
    description: '+40% damage against destructible cover and frozen targets.',
  },
  arc_conduit: {
    name: 'Overcharge Conduit',
    description: 'Shock hits deal +25% chain damage on coolant and metal floors.',
  },
  cryo_shatter: {
    name: 'Brittle Fracture',
    description: 'Cryo slows enemies 50% longer and boosts shatter burst radius.',
  },
  silver_tongue: {
    name: 'Protocol Spoofer',
    description: '+1 effective Neural and Tech during dialogue and terminal checks.',
  },
  subdermal_mesh: {
    name: 'Subdermal Weave',
    description: '+20 maximum HP and faster shield recharge out of combat.',
  },
};

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_thermite_rifle',
    kind: 'weapon',
    name: 'Thermite Assault Rifle',
    description: 'High-velocity rifle firing magnesium rounds that ignite oil spills and melt armor.',
    element: 'thermal',
    minTech: 2,
    cost: { scrap: 4, microchip: 2, bio_gel: 1 },
    weaponTemplate: {
      name: 'Thermite Assault Rifle',
      archetype: 'rifle',
      spriteId: 'weapon_rifle',
      element: 'thermal',
      damage: 28,
      fireRate: 4.8,
      magSize: 24,
      ammoInMag: 24,
      reserveAmmo: 96,
      spread: 0.028,
      pellets: 1,
      range: 20,
      crafted: true,
    },
  },
  {
    id: 'craft_arc_shotgun',
    kind: 'weapon',
    name: 'Tesla Scattergun',
    description: 'Twin-coil breacher discharging arc pellets that vaporize security droids and shock puddles.',
    element: 'shock',
    minTech: 3,
    cost: { scrap: 4, arc_coil: 3, microchip: 1 },
    weaponTemplate: {
      name: 'Tesla Scattergun',
      archetype: 'shotgun',
      spriteId: 'weapon_shotgun',
      element: 'shock',
      damage: 16,
      fireRate: 1.6,
      magSize: 6,
      ammoInMag: 6,
      reserveAmmo: 30,
      spread: 0.11,
      pellets: 6,
      range: 10,
      crafted: true,
    },
  },
  {
    id: 'craft_cryo_smg',
    kind: 'weapon',
    name: 'Sub-Zero Hail SMG',
    description: 'Rapid-fire cryo injector that freezes targets solid, setting up lethal kinetic shatters.',
    element: 'cryo',
    minTech: 2,
    cost: { scrap: 3, cryo_cell: 3, microchip: 1 },
    weaponTemplate: {
      name: 'Sub-Zero Hail SMG',
      archetype: 'smg',
      spriteId: 'weapon_smg',
      element: 'cryo',
      damage: 15,
      fireRate: 8.2,
      magSize: 32,
      ammoInMag: 32,
      reserveAmmo: 128,
      spread: 0.05,
      pellets: 1,
      range: 14,
      crafted: true,
    },
  },
  {
    id: 'craft_toxin_pistol',
    kind: 'weapon',
    name: 'Viper Bio-Injector',
    description: 'Precision silenced pistol laced with mutagenic bio-toxin for stealth takedowns.',
    element: 'toxin',
    minTech: 2,
    cost: { scrap: 2, bio_gel: 3, microchip: 1 },
    weaponTemplate: {
      name: 'Viper Bio-Injector',
      archetype: 'pistol',
      spriteId: 'weapon_pistol',
      element: 'toxin',
      damage: 32,
      fireRate: 3.6,
      magSize: 14,
      ammoInMag: 14,
      reserveAmmo: 70,
      spread: 0.015,
      pellets: 1,
      range: 18,
      crafted: true,
    },
  },
  {
    id: 'craft_ceramic_rig',
    kind: 'armor',
    name: 'Reactive Ceramic Rig',
    description: 'Heavy layered plate carrier with high thermal shielding and reinforced trauma pads.',
    element: 'thermal',
    minTech: 2,
    cost: { ceramic_plate: 3, scrap: 4, bio_gel: 1 },
    armorTemplate: {
      name: 'Reactive Ceramic Rig',
      defense: 36,
      maxShield: 65,
      resistElement: 'thermal',
      speedMod: 0.96,
      crafted: true,
    },
  },
  {
    id: 'craft_faraday_exo',
    kind: 'armor',
    name: 'Faraday Exo-Harnesses',
    description: 'Lightweight conductive weave absorbing electrical arcs and boosting sprint agility.',
    element: 'shock',
    minTech: 3,
    cost: { arc_coil: 2, ceramic_plate: 2, microchip: 2 },
    armorTemplate: {
      name: 'Faraday Exo-Harnesses',
      defense: 28,
      maxShield: 85,
      resistElement: 'shock',
      speedMod: 1.1,
      crafted: true,
    },
  },
];

export const INITIAL_MISSIONS: Mission[] = [
  {
    id: 'm_concourse_override',
    title: 'Clear the Turnstile Blockade',
    faction: 'aegis',
    sectorId: 'concourse',
    minReputation: -10,
    summary: 'Rogue squatters and malfunctioning droids jammed the Transit Concourse security gate.',
    objectiveText: 'Speak with Officer Vance or hack the Concourse Terminal to restore gate power.',
    status: 'available',
    targetEntityId: 'npc_vance',
    rewardCredits: 160,
    rewardRep: { aegis: 20, syndicate: -10 },
    rewardMaterials: { scrap: 2, microchip: 2 },
  },
  {
    id: 'm_syndicate_caches',
    title: 'Salvage the Smuggler Stash',
    faction: 'syndicate',
    sectorId: 'alley',
    minReputation: 0,
    summary: 'Rust Syndicate runner Kira needs an operative to recover capacitor coils in the Alleyways.',
    objectiveText: 'Locate Kira in Rust Alleyways and neutralize the Aegis sweep squad.',
    status: 'available',
    targetEntityId: 'npc_kira',
    rewardCredits: 220,
    rewardRep: { syndicate: 25, aegis: -15 },
    rewardMaterials: { arc_coil: 3, scrap: 3 },
  },
  {
    id: 'm_helix_containment',
    title: 'Purge Bio-Lab Coolant Leak',
    faction: 'helix',
    sectorId: 'biolab',
    minReputation: 0,
    summary: 'Mutated lab specimens breached Sector 3 after a cryo line ruptured.',
    objectiveText: 'Meet Dr. Marrow in Helix Bio-Lab and clear the toxic specimen wing.',
    status: 'available',
    targetEntityId: 'npc_marrow',
    rewardCredits: 240,
    rewardRep: { helix: 25 },
    rewardMaterials: { cryo_cell: 3, bio_gel: 3 },
  },
  {
    id: 'm_aegis_vault',
    title: 'Checkpoint Override Key',
    faction: 'aegis',
    sectorId: 'checkpoint',
    minReputation: 25,
    summary: 'Trusted Aegis allies gain clearance to inspect the armored Corporate Checkpoint.',
    objectiveText: 'Unlock the Checkpoint Command Console (Requires Aegis Rep 25+).',
    status: 'locked',
    targetEntityId: 'term_checkpoint',
    rewardCredits: 340,
    rewardRep: { aegis: 25, syndicate: -10 },
    rewardMaterials: { ceramic_plate: 3, microchip: 2 },
  },
  {
    id: 'm_syndicate_heist',
    title: 'Siphon Reactor Capacitors',
    faction: 'syndicate',
    sectorId: 'reactor',
    minReputation: 30,
    summary: 'Syndicate high-value heist targeting the Sub-Level Reactor core relays.',
    objectiveText: 'Reach Sub-Level Reactor and divert power to Syndicate black-market grids.',
    status: 'locked',
    targetEntityId: 'term_reactor',
    rewardCredits: 450,
    rewardRep: { syndicate: 35, helix: -20 },
    rewardMaterials: { arc_coil: 4, ceramic_plate: 2 },
  },
  {
    id: 'm_helix_synthesis',
    title: 'Stabilize the Core Culture',
    faction: 'helix',
    sectorId: 'reactor',
    minReputation: 30,
    summary: 'Prevent a catastrophic thermal meltdown in the Sub-Level Reactor.',
    objectiveText: 'Stabilize the Reactor Cryo Manifold using Helix containment protocols.',
    status: 'locked',
    targetEntityId: 'term_reactor',
    rewardCredits: 420,
    rewardRep: { helix: 35, aegis: 10 },
    rewardMaterials: { bio_gel: 4, cryo_cell: 4 },
  },
];

export const DIALOGUES: Record<string, DialogueGraph> = {
  npc_vance: {
    id: 'npc_vance',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Officer Vance',
        faction: 'aegis',
        spriteId: 'enemy_guard_1',
        text: 'Hold it, contractor. The concourse shutter is locked down until we clear out the Syndicate scavengers and rogue droids past the fuel barrels.',
        choices: [
          {
            text: 'I will clear the concourse and restore Aegis control.',
            nextNodeId: 'accept',
            startMissionId: 'm_concourse_override',
            repDelta: { aegis: 5 },
          },
          {
            text: '[Tech 4] Give me the diagnostic cipher—I can bypass the jammed relay right now.',
            reqAttr: { attr: 'tech', min: 4 },
            nextNodeId: 'bypassed',
            completeMissionId: 'm_concourse_override',
            repDelta: { aegis: 15 },
            grantCredits: 120,
            unlockSectorDoor: { sectorId: 'concourse', x: 18, y: 10 },
          },
          {
            text: '[Neural 4] Drop the lockdown or I sell your patrol routes to the Syndicate.',
            reqAttr: { attr: 'neural', min: 4 },
            nextNodeId: 'extorted',
            repDelta: { aegis: -15, syndicate: 15 },
            grantCredits: 180,
            unlockSectorDoor: { sectorId: 'concourse', x: 18, y: 10 },
          },
          {
            text: 'Leave for now.',
            endDialogue: true,
          },
        ],
      },
      accept: {
        id: 'accept',
        speaker: 'Officer Vance',
        faction: 'aegis',
        spriteId: 'enemy_guard_1',
        text: 'Good. Use the crates for cover—careful, they splinter under heavy fire. Shoot the red fuel tanks if the droids bunch up, and hit the East Terminal once clear.',
        choices: [
          {
            text: 'Understood. Unlocking my tactical feed.',
            unlockSectorDoor: { sectorId: 'concourse', x: 18, y: 10 },
            endDialogue: true,
          },
        ],
      },
      bypassed: {
        id: 'bypassed',
        speaker: 'Officer Vance',
        faction: 'aegis',
        spriteId: 'enemy_guard_1',
        text: 'Clean splice. The transit shutter to Rust Alleyways is cycling open now. Keep your weapon ready—Syndicate shooters own the next block.',
        choices: [{ text: 'Moving out.', endDialogue: true }],
      },
      extorted: {
        id: 'extorted',
        speaker: 'Officer Vance',
        faction: 'aegis',
        spriteId: 'enemy_guard_1',
        text: 'Watch your back, mercenary. Here is the override and a hush payout, but Aegis remembers threats.',
        choices: [{ text: 'Smart choice.', endDialogue: true }],
      },
    },
  },

  npc_kira: {
    id: 'npc_kira',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Kira (Syndicate Fixer)',
        faction: 'syndicate',
        spriteId: 'npc_agent',
        text: 'You made it through the shutter. Aegis flooded the alley coolant pipes to trap our couriers. One spark on those puddles will fry everything standing in them.',
        choices: [
          {
            text: 'Count me in. I will secure the Syndicate capacitor stash.',
            nextNodeId: 'mission',
            startMissionId: 'm_syndicate_caches',
            repDelta: { syndicate: 10 },
          },
          {
            text: '[Ballistics 4] Sell me military-grade scrap and coils at cost.',
            reqAttr: { attr: 'ballistics', min: 4 },
            nextNodeId: 'trade',
            grantMaterials: { arc_coil: 2, scrap: 3 },
            repDelta: { syndicate: 5 },
          },
          {
            text: 'I need medical patching before pushing deeper.',
            nextNodeId: 'heal',
            healPlayer: 35,
          },
          {
            text: 'Step back.',
            endDialogue: true,
          },
        ],
      },
      mission: {
        id: 'mission',
        speaker: 'Kira (Syndicate Fixer)',
        faction: 'syndicate',
        spriteId: 'npc_agent',
        text: 'Sweep the south alleyways, grab the hardware crates, and open the eastern Bio-Lab breach door. Workbench schematics are synced to your rig.',
        choices: [
          {
            text: 'On it.',
            completeMissionId: 'm_syndicate_caches',
            unlockSectorDoor: { sectorId: 'alley', x: 18, y: 9 },
            endDialogue: true,
          },
        ],
      },
      trade: {
        id: 'trade',
        speaker: 'Kira (Syndicate Fixer)',
        faction: 'syndicate',
        spriteId: 'npc_agent',
        text: 'Respect. Someone who knows proper barrel rifling deserves real hardware. Take these coils and hit the crafting bench.',
        choices: [{ text: 'Thanks, Kira.', endDialogue: true }],
      },
      heal: {
        id: 'heal',
        speaker: 'Kira (Syndicate Fixer)',
        faction: 'syndicate',
        spriteId: 'npc_agent',
        text: 'Here—clean stim-patch, no Syndicate markup this time. Stay out of the electrified puddles.',
        choices: [{ text: 'Much appreciated.', endDialogue: true }],
      },
    },
  },

  npc_marrow: {
    id: 'npc_marrow',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Dr. Marrow',
        faction: 'helix',
        spriteId: 'npc_hazmat',
        text: 'Thank goodness—someone not mutated or shooting on sight. Our cryo tanks ruptured during the raid, and toxic rats are swarming the server racks.',
        choices: [
          {
            text: 'Tell me what Helix needs in the Reactor sub-level.',
            nextNodeId: 'brief',
            startMissionId: 'm_helix_containment',
            completeMissionId: 'm_helix_containment',
            repDelta: { helix: 20 },
          },
          {
            text: '[Bio 4] Let me inspect your serum samples—I can synthesize Bio-Gel here.',
            reqAttr: { attr: 'bio', min: 4 },
            nextNodeId: 'synth',
            grantMaterials: { bio_gel: 3, cryo_cell: 2 },
            healPlayer: 45,
          },
          {
            text: 'Not my problem.',
            endDialogue: true,
          },
        ],
      },
      brief: {
        id: 'brief',
        speaker: 'Dr. Marrow',
        faction: 'helix',
        spriteId: 'npc_hazmat',
        text: 'I have unlocked the Checkpoint & Reactor transit seals. Remember: Cryo freezes armored guards solid so your kinetic shots shatter them cleanly.',
        choices: [
          {
            text: 'I will keep the core intact.',
            unlockSectorDoor: { sectorId: 'biolab', x: 18, y: 10 },
            endDialogue: true,
          },
        ],
      },
      synth: {
        id: 'synth',
        speaker: 'Dr. Marrow',
        faction: 'helix',
        spriteId: 'npc_hazmat',
        text: 'Extraordinary field chemistry. Take these stabilized cryo cells and bio-gel canisters for your workbench.',
        choices: [{ text: 'Useful.', endDialogue: true }],
      },
    },
  },

  term_concourse: {
    id: 'term_concourse',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Transit Security Terminal',
        spriteId: 'prop_terminal_green',
        text: 'AEGIS TRANSIT OS // GATE_EAST_01 SEALED. Unauthorized override attempts will alert nearby Aegis security.',
        choices: [
          {
            text: '[Tech 3] Siphon maintenance credentials & open East Gate.',
            reqAttr: { attr: 'tech', min: 3 },
            nextNodeId: 'hacked',
            completeMissionId: 'm_concourse_override',
            unlockSectorDoor: { sectorId: 'concourse', x: 18, y: 10 },
            grantMaterials: { microchip: 2 },
          },
          {
            text: 'Force emergency manual release (Alerts Aegis).',
            nextNodeId: 'forced',
            repDelta: { aegis: -15, syndicate: 10 },
            completeMissionId: 'm_concourse_override',
            unlockSectorDoor: { sectorId: 'concourse', x: 18, y: 10 },
          },
          {
            text: 'Disconnect.',
            endDialogue: true,
          },
        ],
      },
      hacked: {
        id: 'hacked',
        speaker: 'Transit Security Terminal',
        spriteId: 'prop_terminal_green',
        text: 'Override accepted silently. East transit gate unsealed and spare microchips ejected from service tray.',
        choices: [{ text: 'Close terminal.', endDialogue: true }],
      },
      forced: {
        id: 'forced',
        speaker: 'Transit Security Terminal',
        spriteId: 'prop_terminal_green',
        text: 'WARNING: Manual breach logged. Gate unsealed. Aegis standing decreased.',
        choices: [{ text: 'Close terminal.', endDialogue: true }],
      },
    },
  },

  term_checkpoint: {
    id: 'term_checkpoint',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Aegis Armory Console',
        faction: 'aegis',
        spriteId: 'prop_terminal_atm',
        text: 'ARMORY VAULT TERMINAL // Authorized Aegis contractors may requisition ceramic plating and reactor access.',
        choices: [
          {
            text: 'Claim Aegis Armory Requisition & Complete Contract.',
            completeMissionId: 'm_aegis_vault',
            grantMaterials: { ceramic_plate: 3, scrap: 3 },
            grantCredits: 250,
            repDelta: { aegis: 20 },
            unlockSectorDoor: { sectorId: 'checkpoint', x: 18, y: 10 },
            endDialogue: true,
          },
          {
            text: 'Leave console.',
            endDialogue: true,
          },
        ],
      },
    },
  },

  term_reactor: {
    id: 'term_reactor',
    startNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        speaker: 'Sub-Level Reactor Core Interface',
        spriteId: 'prop_server_wide',
        text: 'CORE MANIFOLD CRITICAL // Route auxiliary power to Helix Containment Arrays or Syndicate Black-Market Grid.',
        choices: [
          {
            text: 'Stabilize Helix Containment Manifold (Helix Finale).',
            completeMissionId: 'm_helix_synthesis',
            repDelta: { helix: 35, aegis: 15, syndicate: -15 },
            grantCredits: 400,
            nextNodeId: 'helix_end',
          },
          {
            text: 'Divert Core Capacitors to Rust Syndicate (Syndicate Finale).',
            completeMissionId: 'm_syndicate_heist',
            repDelta: { syndicate: 35, helix: -25, aegis: -20 },
            grantCredits: 500,
            nextNodeId: 'syndicate_end',
          },
          {
            text: 'Step away.',
            endDialogue: true,
          },
        ],
      },
      helix_end: {
        id: 'helix_end',
        speaker: 'Sub-Level Reactor Core Interface',
        spriteId: 'prop_server_wide',
        text: 'Cryo loops stabilized across all five districts. Helix Bio-Collective celebrates your intervention—continue exploring or test new crafted builds.',
        choices: [{ text: 'Return to Sector.', endDialogue: true }],
      },
      syndicate_end: {
        id: 'syndicate_end',
        speaker: 'Sub-Level Reactor Core Interface',
        spriteId: 'prop_server_wide',
        text: 'Capacitor banks drained into underground relays. Rust Syndicate controls the block—continue roaming or craft top-tier hardware.',
        choices: [{ text: 'Return to Sector.', endDialogue: true }],
      },
    },
  },
};

function makeCell(
  kind: GridCell['kind'],
  wallTex: string,
  floorTex: string,
  ceilingTex: string,
  opts?: Partial<GridCell>
): GridCell {
  return {
    kind,
    wallTex,
    floorTex,
    ceilingTex,
    coverHp: opts?.coverHp ?? 0,
    coverMaxHp: opts?.coverMaxHp ?? 0,
    coverHeight: opts?.coverHeight ?? 1,
    destructible: opts?.destructible ?? false,
    doorOpen: opts?.doorOpen ?? 0,
    doorTargetOpen: opts?.doorTargetOpen ?? 0,
    doorLockedBy: opts?.doorLockedBy,
    gateToSector: opts?.gateToSector,
    gateSpawnX: opts?.gateSpawnX,
    gateSpawnY: opts?.gateSpawnY,
    hazard: opts?.hazard ?? 'none',
    hazardTimer: opts?.hazardTimer ?? 0,
    visited: opts?.visited ?? false,
  };
}

function buildGridFromAscii(
  ascii: string[],
  wallTheme: { main: string; alt: string; cover: string; floor: string; ceil: string },
  overrides?: Record<string, Partial<GridCell>>
): GridCell[][] {
  const h = ascii.length;
  const w = ascii[0].length;
  const grid: GridCell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < w; x++) {
      const ch = ascii[y][x];
      const key = `${x},${y}`;
      const ov = overrides?.[key];
      let cell: GridCell;

      if (ch === '#') {
        cell = makeCell('wall', wallTheme.main, wallTheme.floor, wallTheme.ceil);
      } else if (ch === 'B') {
        cell = makeCell('wall', wallTheme.alt, wallTheme.floor, wallTheme.ceil);
      } else if (ch === 'C') {
        cell = makeCell('cover', wallTheme.cover, wallTheme.floor, wallTheme.ceil, {
          destructible: true,
          coverHp: 60,
          coverMaxHp: 60,
          coverHeight: 0.62,
        });
      } else if (ch === 'S') {
        cell = makeCell('cover', 'wall_shutter_rust', wallTheme.floor, wallTheme.ceil, {
          destructible: true,
          coverHp: 90,
          coverMaxHp: 90,
          coverHeight: 0.78,
        });
      } else if (ch === 'D') {
        cell = makeCell('door', 'door_steel_rust', wallTheme.floor, wallTheme.ceil);
      } else if (ch === 'G') {
        cell = makeCell('gate', 'door_blue_locked', wallTheme.floor, wallTheme.ceil);
      } else {
        let hazard: SurfaceHazard = 'none';
        if (ch === '~') hazard = 'coolant';
        if (ch === 'o') hazard = 'oil';
        if (ch === 'x') hazard = 'toxic';
        cell = makeCell('empty', wallTheme.main, wallTheme.floor, wallTheme.ceil, { hazard });
      }

      if (ov) {
        cell = { ...cell, ...ov };
      }
      row.push(cell);
    }
    grid.push(row);
  }
  return grid;
}

export function createInitialSectors(): Record<string, SectorDefinition> {
  // 20x20 Sector 1: Transit Concourse
  const concourseAscii = [
    '####################',
    '#....B........B....#',
    '#..C....oooo....C..#',
    '#..................#',
    '#..BB..C....C..BB..#',
    '#..B............B..#',
    '#......~~~~........#',
    '#..................#',
    '#....S........S....#',
    '#..................#',
    '#..........C......G#',
    '#..................#',
    '#..BB....C.....BB..#',
    '#..B............B..#',
    '#......oooo........#',
    '#..C............C..#',
    '#.......S..........#',
    '#....B........B....#',
    '#.........G........#',
    '####################',
  ];

  const concourseGrid = buildGridFromAscii(
    concourseAscii,
    {
      main: 'wall_concrete_clean',
      alt: 'wall_graffiti_guads',
      cover: 'wall_brick_gray',
      floor: 'floor_concrete_a',
      ceil: 'floor_tile_dark',
    },
    {
      '18,10': {
        kind: 'gate',
        wallTex: 'door_blue_locked',
        doorLockedBy: 'm_concourse_override',
        gateToSector: 'alley',
        gateSpawnX: 2.5,
        gateSpawnY: 10.5,
      },
      '10,18': {
        kind: 'gate',
        wallTex: 'door_steel_rust',
        gateToSector: 'checkpoint',
        gateSpawnX: 10.5,
        gateSpawnY: 2.5,
      },
    }
  );

  // 20x20 Sector 2: Rust Alleyways
  const alleyAscii = [
    '####################',
    '#...B..........B...#',
    '#..C....~~~~....C..#',
    '#..................#',
    '#..SS..C....C..BB..#',
    '#..................#',
    '#....oooo..oooo....#',
    '#..................#',
    '#..C....S.......C..#',
    '#G................G#',
    '#..................#',
    '#....B......B......#',
    '#..C....~~~~....C..#',
    '#..................#',
    '#..BB..........SS..#',
    '#........C.........#',
    '#....oooo..........#',
    '#.............C....#',
    '#..................#',
    '####################',
  ];

  const alleyGrid = buildGridFromAscii(
    alleyAscii,
    {
      main: 'wall_brick_red',
      alt: 'wall_graffiti_red',
      cover: 'wall_shutter_rust',
      floor: 'floor_grime',
      ceil: 'floor_metal_rust',
    },
    {
      '1,9': {
        kind: 'gate',
        wallTex: 'door_steel_rust',
        gateToSector: 'concourse',
        gateSpawnX: 16.5,
        gateSpawnY: 10.5,
      },
      '18,9': {
        kind: 'gate',
        wallTex: 'door_blue_locked',
        doorLockedBy: 'm_syndicate_caches',
        gateToSector: 'biolab',
        gateSpawnX: 2.5,
        gateSpawnY: 10.5,
      },
    }
  );

  // 20x20 Sector 3: Helix Bio-Lab
  const biolabAscii = [
    '####################',
    '#....B........B....#',
    '#..C....xxxx....C..#',
    '#..................#',
    '#..BB..~~~~~~..BB..#',
    '#..................#',
    '#....C........C....#',
    '#..................#',
    '#......S....S......#',
    '#..................#',
    '#G................G#',
    '#..................#',
    '#..BB...xxxx...BB..#',
    '#..................#',
    '#....C........C....#',
    '#......~~~~........#',
    '#..C............C..#',
    '#.........G........#',
    '#..................#',
    '####################',
  ];

  const biolabGrid = buildGridFromAscii(
    biolabAscii,
    {
      main: 'wall_panel_blue',
      alt: 'wall_graffiti_blue',
      cover: 'wall_shutter_blue',
      floor: 'floor_vent_cyan',
      ceil: 'floor_lit_panel',
    },
    {
      '1,10': {
        kind: 'gate',
        wallTex: 'door_steel_rust',
        gateToSector: 'alley',
        gateSpawnX: 16.5,
        gateSpawnY: 9.5,
      },
      '18,10': {
        kind: 'gate',
        wallTex: 'door_blue_locked',
        doorLockedBy: 'm_helix_containment',
        gateToSector: 'reactor',
        gateSpawnX: 2.5,
        gateSpawnY: 10.5,
      },
      '10,17': {
        kind: 'gate',
        wallTex: 'door_locker',
        gateToSector: 'checkpoint',
        gateSpawnX: 15.5,
        gateSpawnY: 10.5,
      },
    }
  );

  // 20x20 Sector 4: Aegis Checkpoint
  const checkpointAscii = [
    '####################',
    '#.........G........#',
    '#..C............C..#',
    '#......oooo........#',
    '#..BB....S.....BB..#',
    '#..................#',
    '#....C........C....#',
    '#......~~~~........#',
    '#..................#',
    '#..S..........S....#',
    '#.................G#',
    '#..................#',
    '#..BB..C....C..BB..#',
    '#..................#',
    '#......oooo........#',
    '#..C............C..#',
    '#.........G........#',
    '#..................#',
    '#..................#',
    '####################',
  ];

  const checkpointGrid = buildGridFromAscii(
    checkpointAscii,
    {
      main: 'wall_concrete_cracked',
      alt: 'wall_panel_blue',
      cover: 'wall_brick_gray',
      floor: 'floor_metal_blue',
      ceil: 'floor_panel_trim',
    },
    {
      '10,1': {
        kind: 'gate',
        wallTex: 'door_steel_rust',
        gateToSector: 'concourse',
        gateSpawnX: 10.5,
        gateSpawnY: 16.5,
      },
      '18,10': {
        kind: 'gate',
        wallTex: 'door_locker',
        gateToSector: 'biolab',
        gateSpawnX: 10.5,
        gateSpawnY: 15.5,
      },
      '10,16': {
        kind: 'gate',
        wallTex: 'door_blue_locked',
        gateToSector: 'reactor',
        gateSpawnX: 10.5,
        gateSpawnY: 2.5,
      },
    }
  );

  // 20x20 Sector 5: Sub-Level Reactor
  const reactorAscii = [
    '####################',
    '#.........G........#',
    '#..C....~~~~....C..#',
    '#..................#',
    '#..SS..oooo..SS....#',
    '#..................#',
    '#....C........C....#',
    '#......xxxx........#',
    '#..................#',
    '#..B..........B....#',
    '#G.................#',
    '#..................#',
    '#..SS..~~~~..SS....#',
    '#..................#',
    '#....C....C........#',
    '#......oooo........#',
    '#..C............C..#',
    '#..................#',
    '#..................#',
    '####################',
  ];

  const reactorGrid = buildGridFromAscii(
    reactorAscii,
    {
      main: 'wall_vent_rust',
      alt: 'wall_shutter_rust',
      cover: 'wall_shutter_blue',
      floor: 'floor_grate_steel',
      ceil: 'floor_metal_rust',
    },
    {
      '10,1': {
        kind: 'gate',
        wallTex: 'door_blue_locked',
        gateToSector: 'checkpoint',
        gateSpawnX: 10.5,
        gateSpawnY: 14.5,
      },
      '1,10': {
        kind: 'gate',
        wallTex: 'door_steel_rust',
        gateToSector: 'biolab',
        gateSpawnX: 16.5,
        gateSpawnY: 10.5,
      },
    }
  );

  const mkEntity = (partial: Partial<WorldEntity> & Pick<WorldEntity, 'id' | 'kind' | 'name' | 'x' | 'y' | 'spriteId'>): WorldEntity => ({
    scale: 1,
    hp: 60,
    maxHp: 60,
    hostile: false,
    alerted: false,
    attackCooldown: 0,
    statusTimer: 0,
    ...partial,
  });

  return {
    concourse: {
      id: 'concourse',
      name: 'Transit Concourse',
      subtitle: 'Sector 01 · Aegis Perimeter',
      controllingFaction: 'aegis',
      ambientColor: [0.85, 0.9, 0.96],
      fogColor: [11, 14, 20],
      fogDensity: 0.08,
      width: 20,
      height: 20,
      spawnX: 3.5,
      spawnY: 10.5,
      spawnAngle: 0,
      mapX: 18,
      mapY: 36,
      connections: ['alley', 'checkpoint'],
      grid: concourseGrid,
      entities: [
        mkEntity({ id: 'npc_vance', kind: 'npc', name: 'Officer Vance', x: 4.8, y: 8.5, spriteId: 'enemy_guard_1', faction: 'aegis', hp: 140, maxHp: 140, dialogueId: 'npc_vance', interactLabel: 'Talk to Officer Vance' }),
        mkEntity({ id: 'term_concourse', kind: 'terminal', name: 'Transit Terminal', x: 16.5, y: 8.5, spriteId: 'prop_terminal_green', hp: 999, maxHp: 999, dialogueId: 'term_concourse', interactLabel: 'Access Security Terminal' }),
        mkEntity({ id: 'vend_1', kind: 'vending', name: 'Vending Unit', x: 2.5, y: 13.5, spriteId: 'prop_vending_red', scale: 1.15, hp: 120, maxHp: 120, interactLabel: 'Buy Stim-Soda (35 Cr)' }),
        mkEntity({ id: 'bar_c1', kind: 'barrel_fuel', name: 'Fuel Drum', x: 9.5, y: 5.5, spriteId: 'prop_trash_can', scale: 0.85, hp: 25, maxHp: 25 }),
        mkEntity({ id: 'bar_c2', kind: 'barrel_shock', name: 'Capacitor Crate', x: 10.5, y: 12.5, spriteId: 'cover_crate_ammo', scale: 0.85, hp: 30, maxHp: 30 }),
        mkEntity({ id: 'e_c_droid1', kind: 'enemy_droid', name: 'Rogue Sentinel', x: 12.5, y: 6.5, spriteId: 'enemy_droid_1', faction: 'helix', hp: 75, maxHp: 75, hostile: true }),
        mkEntity({ id: 'e_c_merc1', kind: 'enemy_merc', name: 'Tunnel Raider', x: 14.5, y: 13.5, spriteId: 'enemy_mercenary', faction: 'syndicate', hp: 65, maxHp: 65, hostile: true }),
        mkEntity({ id: 'e_c_rat1', kind: 'enemy_rat', name: 'Concourse Mutant Rat', x: 9.5, y: 15.5, spriteId: 'enemy_rat_1', scale: 0.65, hp: 30, maxHp: 30, hostile: true }),
        mkEntity({ id: 'loot_c_med', kind: 'loot_medkit', name: 'Trauma Kit', x: 6.5, y: 3.5, spriteId: 'obj_medkit', scale: 0.5, hp: 10, maxHp: 10, interactLabel: 'Take Trauma Kit' }),
        mkEntity({ id: 'loot_c_ammo', kind: 'loot_ammo', name: 'Ammo Box', x: 13.5, y: 16.5, spriteId: 'obj_ammo_red', scale: 0.55, hp: 10, maxHp: 10, interactLabel: 'Loot Ammo Crate' }),
      ],
    },
    alley: {
      id: 'alley',
      name: 'Rust Alleyways',
      subtitle: 'Sector 02 · Syndicate Territory',
      controllingFaction: 'syndicate',
      ambientColor: [1.0, 0.88, 0.78],
      fogColor: [18, 12, 10],
      fogDensity: 0.085,
      width: 20,
      height: 20,
      spawnX: 2.5,
      spawnY: 9.5,
      spawnAngle: 0,
      mapX: 48,
      mapY: 24,
      connections: ['concourse', 'biolab'],
      grid: alleyGrid,
      entities: [
        mkEntity({ id: 'npc_kira', kind: 'npc', name: 'Kira', x: 5.5, y: 7.5, spriteId: 'npc_agent', faction: 'syndicate', hp: 120, maxHp: 120, dialogueId: 'npc_kira', interactLabel: 'Speak with Kira' }),
        mkEntity({ id: 'vend_2', kind: 'vending', name: 'Black-Market Dispenser', x: 4.5, y: 16.5, spriteId: 'prop_vending_amber', scale: 1.15, hp: 120, maxHp: 120, interactLabel: 'Buy Scrap Pack (45 Cr)' }),
        mkEntity({ id: 'bar_a1', kind: 'barrel_shock', name: 'Arc Relay', x: 9.5, y: 2.5, spriteId: 'cover_server_rack', scale: 0.95, hp: 35, maxHp: 35 }),
        mkEntity({ id: 'bar_a2', kind: 'barrel_fuel', name: 'Oil Drum', x: 11.5, y: 6.5, spriteId: 'cover_dumpster_green', scale: 0.9, hp: 35, maxHp: 35 }),
        mkEntity({ id: 'e_a_guard1', kind: 'enemy_guard', name: 'Aegis Sweeper', x: 13.5, y: 5.5, spriteId: 'enemy_guard_2', faction: 'aegis', hp: 80, maxHp: 80, hostile: false }),
        mkEntity({ id: 'e_a_guard2', kind: 'enemy_guard', name: 'Aegis Enforcer', x: 14.5, y: 12.5, spriteId: 'enemy_guard_1', faction: 'aegis', hp: 85, maxHp: 85, hostile: false }),
        mkEntity({ id: 'e_a_rat1', kind: 'enemy_rat', name: 'Sewer Rat', x: 8.5, y: 14.5, spriteId: 'enemy_rat_2', scale: 0.65, hp: 35, maxHp: 35, hostile: true }),
        mkEntity({ id: 'loot_a_scrap', kind: 'loot_scrap', name: 'Salvage Crate', x: 16.5, y: 16.5, spriteId: 'obj_ammo_green', scale: 0.6, hp: 10, maxHp: 10, interactLabel: 'Salvage Components' }),
        mkEntity({ id: 'loot_a_med', kind: 'loot_medkit', name: 'Medkit', x: 11.5, y: 17.5, spriteId: 'obj_medkit', scale: 0.5, hp: 10, maxHp: 10, interactLabel: 'Take Medkit' }),
      ],
    },
    biolab: {
      id: 'biolab',
      name: 'Helix Bio-Lab',
      subtitle: 'Sector 03 · Containment Wing',
      controllingFaction: 'helix',
      ambientColor: [0.78, 0.98, 0.92],
      fogColor: [8, 18, 18],
      fogDensity: 0.08,
      width: 20,
      height: 20,
      spawnX: 2.5,
      spawnY: 10.5,
      spawnAngle: 0,
      mapX: 80,
      mapY: 36,
      connections: ['alley', 'checkpoint', 'reactor'],
      grid: biolabGrid,
      entities: [
        mkEntity({ id: 'npc_marrow', kind: 'npc', name: 'Dr. Marrow', x: 4.5, y: 7.5, spriteId: 'npc_hazmat', faction: 'helix', hp: 110, maxHp: 110, dialogueId: 'npc_marrow', interactLabel: 'Talk to Dr. Marrow' }),
        mkEntity({ id: 'bar_b1', kind: 'barrel_cryo', name: 'Cryo Cylinder', x: 9.5, y: 4.5, spriteId: 'prop_terminal_small', scale: 0.9, hp: 25, maxHp: 25 }),
        mkEntity({ id: 'e_b_droid1', kind: 'enemy_droid', name: 'Lab Security Mech', x: 13.5, y: 6.5, spriteId: 'enemy_droid_2', faction: 'aegis', hp: 95, maxHp: 95, hostile: true }),
        mkEntity({ id: 'e_b_rat1', kind: 'enemy_rat', name: 'Bio-Plague Rat', x: 10.5, y: 12.5, spriteId: 'enemy_rat_1', scale: 0.72, hp: 45, maxHp: 45, hostile: true }),
        mkEntity({ id: 'e_b_rat2', kind: 'enemy_rat', name: 'Bio-Plague Rat', x: 14.5, y: 14.5, spriteId: 'enemy_rat_2', scale: 0.72, hp: 45, maxHp: 45, hostile: true }),
        mkEntity({ id: 'loot_b_ammo', kind: 'loot_ammo', name: 'Ammo Supply', x: 15.5, y: 3.5, spriteId: 'obj_ammo_red', scale: 0.55, hp: 10, maxHp: 10, interactLabel: 'Loot Ammo Supply' }),
        mkEntity({ id: 'loot_b_scrap', kind: 'loot_scrap', name: 'Cryo Lab Parts', x: 6.5, y: 15.5, spriteId: 'obj_ammo_green', scale: 0.6, hp: 10, maxHp: 10, interactLabel: 'Collect Lab Parts' }),
      ],
    },
    checkpoint: {
      id: 'checkpoint',
      name: 'Aegis Checkpoint',
      subtitle: 'Sector 04 · Armored Vault',
      controllingFaction: 'aegis',
      ambientColor: [0.82, 0.88, 1.0],
      fogColor: [10, 12, 20],
      fogDensity: 0.08,
      width: 20,
      height: 20,
      spawnX: 10.5,
      spawnY: 2.5,
      spawnAngle: Math.PI / 2,
      mapX: 34,
      mapY: 70,
      connections: ['concourse', 'biolab', 'reactor'],
      grid: checkpointGrid,
      entities: [
        mkEntity({ id: 'term_checkpoint', kind: 'terminal', name: 'Armory Console', x: 6.5, y: 10.5, spriteId: 'prop_terminal_atm', scale: 1.0, hp: 999, maxHp: 999, dialogueId: 'term_checkpoint', interactLabel: 'Access Armory Console' }),
        mkEntity({ id: 'vend_4', kind: 'vending', name: 'Aegis Med-Dispenser', x: 14.5, y: 5.5, spriteId: 'prop_vending_blue', scale: 1.1, hp: 120, maxHp: 120, interactLabel: 'Buy Stim-Soda (35 Cr)' }),
        mkEntity({ id: 'bar_k1', kind: 'barrel_fuel', name: 'Volatile Drum', x: 9.5, y: 14.5, spriteId: 'cover_dumpster_blue', scale: 0.9, hp: 35, maxHp: 35 }),
        mkEntity({ id: 'e_k_merc1', kind: 'enemy_merc', name: 'Syndicate Sapper', x: 13.5, y: 13.5, spriteId: 'enemy_mercenary', faction: 'syndicate', hp: 90, maxHp: 90, hostile: false }),
        mkEntity({ id: 'e_k_droid1', kind: 'enemy_droid', name: 'Heavy Automaton', x: 10.5, y: 11.5, spriteId: 'enemy_droid_1', faction: 'aegis', hp: 115, maxHp: 115, hostile: false }),
        mkEntity({ id: 'loot_k_scrap', kind: 'loot_scrap', name: 'Ceramic Parts', x: 3.5, y: 16.5, spriteId: 'obj_ammo_green', scale: 0.6, hp: 10, maxHp: 10, interactLabel: 'Collect Ceramic Parts' }),
      ],
    },
    reactor: {
      id: 'reactor',
      name: 'Sub-Level Reactor',
      subtitle: 'Sector 05 · Core Facility',
      controllingFaction: 'helix',
      ambientColor: [1.0, 0.84, 0.72],
      fogColor: [18, 11, 9],
      fogDensity: 0.075,
      width: 20,
      height: 20,
      spawnX: 2.5,
      spawnY: 10.5,
      spawnAngle: 0,
      mapX: 74,
      mapY: 74,
      connections: ['biolab', 'checkpoint'],
      grid: reactorGrid,
      entities: [
        mkEntity({ id: 'term_reactor', kind: 'terminal', name: 'Reactor Core Manifold', x: 15.5, y: 10.5, spriteId: 'prop_server_wide', scale: 1.2, hp: 999, maxHp: 999, dialogueId: 'term_reactor', interactLabel: 'Operate Reactor Manifold' }),
        mkEntity({ id: 'bar_r1', kind: 'barrel_cryo', name: 'Core Cryo Tank', x: 11.5, y: 3.5, spriteId: 'prop_terminal_small', scale: 0.9, hp: 30, maxHp: 30 }),
        mkEntity({ id: 'bar_r2', kind: 'barrel_fuel', name: 'Plasma Fuel Cell', x: 10.5, y: 15.5, spriteId: 'cover_crate_ammo', scale: 0.85, hp: 30, maxHp: 30 }),
        mkEntity({ id: 'e_r_droid1', kind: 'enemy_droid', name: 'Core Defense Unit', x: 12.5, y: 8.5, spriteId: 'enemy_droid_2', faction: 'aegis', hp: 130, maxHp: 130, hostile: true }),
        mkEntity({ id: 'e_r_merc1', kind: 'enemy_merc', name: 'Syndicate Heavy', x: 13.5, y: 12.5, spriteId: 'enemy_mercenary', faction: 'syndicate', hp: 110, maxHp: 110, hostile: true }),
        mkEntity({ id: 'loot_r_med', kind: 'loot_medkit', name: 'Emergency Trauma Pack', x: 4.5, y: 16.5, spriteId: 'obj_medkit', scale: 0.55, hp: 10, maxHp: 10, interactLabel: 'Take Trauma Pack' }),
      ],
    },
  };
}
