import React, { useState } from 'react';
import { FACTION_INFO, ORIGINS, PERKS } from '../data/worldData';
import { Attributes, OriginId, PerkId } from '../types/game';
import { Shield, Crosshair, Cpu, HeartPulse, Sparkles } from 'lucide-react';

interface CharacterCreatorModalProps {
  onStartGame: (config: {
    name: string;
    origin: OriginId;
    perk: PerkId;
    attributes: Attributes;
  }) => void;
  onCancel?: () => void;
}

const ORIGIN_KEYS: OriginId[] = ['breacher', 'netrunner', 'bio_tech', 'fixer'];
const PERK_KEYS: PerkId[] = [
  'hollow_point',
  'arc_conduit',
  'cryo_shatter',
  'silver_tongue',
  'subdermal_mesh',
];

export const CharacterCreatorModal: React.FC<CharacterCreatorModalProps> = ({
  onStartGame,
  onCancel,
}) => {
  const [name, setName] = useState('Merc-09');
  const [origin, setOrigin] = useState<OriginId>('netrunner');
  const [perk, setPerk] = useState<PerkId>('arc_conduit');
  const [allocated, setAllocated] = useState<Attributes>({
    ballistics: 2,
    tech: 3,
    bio: 2,
    neural: 2,
  });

  const maxPool = 10;
  const usedPool =
    allocated.ballistics + allocated.tech + allocated.bio + allocated.neural;
  const remaining = maxPool - usedPool;

  const originData = ORIGINS[origin];

  const totalAttrs: Attributes = {
    ballistics: allocated.ballistics + (originData.bonusAttr.ballistics || 0),
    tech: allocated.tech + (originData.bonusAttr.tech || 0),
    bio: allocated.bio + (originData.bonusAttr.bio || 0),
    neural: allocated.neural + (originData.bonusAttr.neural || 0),
  };

  const derivedHp =
    85 + totalAttrs.bio * 10 + (perk === 'subdermal_mesh' ? 20 : 0);
  const derivedShield = originData.startArmor.maxShield + totalAttrs.tech * 4;

  const adjustAttr = (key: keyof Attributes, delta: number) => {
    const current = allocated[key];
    if (delta > 0 && remaining <= 0) return;
    if (delta < 0 && current <= 1) return;
    if (delta > 0 && current >= 6) return;
    setAllocated((prev) => ({ ...prev, [key]: prev[key] + delta }));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B0D11]/92 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#131720] border border-white/10 rounded-xl shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Operative Customization
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Configure attributes, cybernetic perk, and starting faction alignment before entering Sector 01.
            </p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Resume Game
            </button>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Identity & Origin */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Callsign
              </label>
              <input
                type="text"
                maxLength={18}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0B0D11] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="Enter operative callsign"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">
                  Background Origin
                </span>
                <span className="text-xs text-amber-400 font-mono">
                  Starting Loadout & Faction Ties
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ORIGIN_KEYS.map((key) => {
                  const o = ORIGINS[key];
                  const active = origin === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOrigin(key)}
                      className={`text-left p-3.5 rounded-lg border transition-colors ${
                        active
                          ? 'bg-amber-500/10 border-amber-500/70 text-white'
                          : 'bg-[#0B0D11]/70 border-white/8 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="font-display font-semibold text-sm">
                        {o.name}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {o.summary}
                      </p>
                      <div className="mt-2.5 text-[11px] font-mono text-cyan-400">
                        {o.startWeapon.name} · {o.startWeapon.element}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-400 mb-2">
                Cybernetic Perk
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PERK_KEYS.map((pk) => {
                  const active = perk === pk;
                  return (
                    <button
                      key={pk}
                      type="button"
                      onClick={() => setPerk(pk)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        active
                          ? 'bg-cyan-500/10 border-cyan-500/70 text-white'
                          : 'bg-[#0B0D11]/70 border-white/8 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-xs font-semibold text-white">
                        {PERKS[pk].name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {PERKS[pk].description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Attributes & Derived Profile */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-[#0B0D11]/80 border border-white/10 rounded-xl p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-white">
                  Core Attributes
                </h3>
                <span className="text-xs font-mono tabular-nums text-amber-400">
                  {remaining} points unspent
                </span>
              </div>

              <div className="space-y-3">
                {(
                  [
                    {
                      key: 'ballistics',
                      label: 'Ballistics',
                      desc: 'Weapon damage & recoil control',
                      icon: Crosshair,
                    },
                    {
                      key: 'tech',
                      label: 'Tech / Engineering',
                      desc: 'Terminal hacking & crafting tier',
                      icon: Cpu,
                    },
                    {
                      key: 'bio',
                      label: 'Bio-Resilience',
                      desc: 'Max health & hazard resistance',
                      icon: HeartPulse,
                    },
                    {
                      key: 'neural',
                      label: 'Neural / Influence',
                      desc: 'Dialogue checks & crit rate',
                      icon: Sparkles,
                    },
                  ] as const
                ).map(({ key, label, desc, icon: Icon }) => {
                  const bonus = originData.bonusAttr[key] || 0;
                  const total = totalAttrs[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 py-2 border-b border-white/6 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{label}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {desc}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustAttr(key, -1)}
                          className="w-7 h-7 rounded border border-white/15 bg-[#131720] text-slate-200 hover:border-white/40 flex items-center justify-center font-mono text-sm"
                        >
                          -
                        </button>
                        <div className="w-12 text-center font-mono text-sm tabular-nums text-white">
                          {total}
                          {bonus > 0 && (
                            <span className="text-[10px] text-amber-400 ml-0.5">
                              +{bonus}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => adjustAttr(key, 1)}
                          className="w-7 h-7 rounded border border-white/15 bg-[#131720] text-slate-200 hover:border-white/40 flex items-center justify-center font-mono text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#131720] rounded-lg p-2.5 border border-white/6">
                  <div className="text-[11px] text-slate-400">Vitality</div>
                  <div className="font-mono text-sm font-semibold text-rose-400 tabular-nums mt-0.5">
                    {derivedHp} HP
                  </div>
                </div>
                <div className="bg-[#131720] rounded-lg p-2.5 border border-white/6">
                  <div className="text-[11px] text-slate-400">Shield</div>
                  <div className="font-mono text-sm font-semibold text-cyan-400 tabular-nums mt-0.5">
                    {derivedShield} SH
                  </div>
                </div>
                <div className="bg-[#131720] rounded-lg p-2.5 border border-white/6">
                  <div className="text-[11px] text-slate-400">Armor</div>
                  <div className="font-mono text-sm font-semibold text-amber-400 tabular-nums mt-0.5">
                    {originData.startArmor.defense}%
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  Initial Faction Standing
                </span>
                <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                  {(['aegis', 'syndicate', 'helix'] as const)
                    .map(
                      (fid) =>
                        `${FACTION_INFO[fid].name.split(' ')[0]} ${
                          originData.startRep[fid] >= 0 ? '+' : ''
                        }${originData.startRep[fid]}`
                    )
                    .join(' · ')}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onStartGame({
                    name: name.trim() || 'Merc-09',
                    origin,
                    perk,
                    attributes: totalAttrs,
                  })
                }
                className="w-full py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide transition-colors cursor-pointer"
              >
                Deploy Into Sector 01
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
