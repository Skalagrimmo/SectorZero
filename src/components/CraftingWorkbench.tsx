import React, { useState } from 'react';
import { CRAFTING_RECIPES } from '../data/worldData';
import {
  CraftingRecipe,
  MaterialType,
  PlayerCharacter,
} from '../types/game';
import { Wrench, Shield, Crosshair, Check } from 'lucide-react';

interface CraftingWorkbenchProps {
  player: PlayerCharacter;
  onCraft: (recipe: CraftingRecipe) => void;
  onEquipWeapon: (index: number) => void;
  onClose: () => void;
}

const MATERIAL_LABELS: Record<MaterialType, string> = {
  scrap: 'Scrap Metal',
  microchip: 'Microchips',
  cryo_cell: 'Cryo Cells',
  arc_coil: 'Arc Coils',
  bio_gel: 'Bio-Gel',
  ceramic_plate: 'Ceramic Plates',
};

export const CraftingWorkbench: React.FC<CraftingWorkbenchProps> = ({
  player,
  onCraft,
  onEquipWeapon,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'weapon' | 'armor'>('all');

  const recipes = CRAFTING_RECIPES.filter((r) =>
    filter === 'all' ? true : r.kind === filter
  );

  const canCraft = (r: CraftingRecipe) => {
    if (player.attributes.tech < r.minTech) return false;
    for (const [k, need] of Object.entries(r.cost)) {
      if ((player.materials[k as MaterialType] || 0) < (need || 0)) {
        return false;
      }
    }
    return true;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#131720] border border-white/12 rounded-xl shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wrench className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Field Crafting Workbench
              </h2>
              <p className="text-xs text-slate-400">
                Tech Level {player.attributes.tech} · {player.credits} Credits · Armor {player.armor.name} ({player.armor.defense}% def)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>

        {/* Salvage Material Inventory Strip */}
        <div className="px-6 py-3 bg-[#0B0D11]/70 border-b border-white/8 grid grid-cols-3 sm:grid-cols-6 gap-3">
          {(Object.keys(MATERIAL_LABELS) as MaterialType[]).map((mat) => (
            <div key={mat} className="flex flex-col">
              <span className="text-[11px] text-slate-400 truncate">
                {MATERIAL_LABELS[mat]}
              </span>
              <span className="font-mono text-sm font-semibold text-white tabular-nums">
                {player.materials[mat]}
              </span>
            </div>
          ))}
        </div>

        <div className="p-6 space-y-6">
          {/* Active Weapons Arsenal */}
          <div>
            <h3 className="text-xs font-medium text-slate-400 mb-2.5">
              Equipped Arsenal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {player.weapons.map((w, idx) => {
                const active = idx === player.activeWeaponIndex;
                return (
                  <button
                    key={w.id}
                    onClick={() => onEquipWeapon(idx)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      active
                        ? 'bg-amber-500/10 border-amber-500/70 text-white'
                        : 'bg-[#0B0D11]/70 border-white/8 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">
                        {w.name}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                      {w.element} · {w.damage * w.pellets} dmg · {w.ammoInMag}/{w.reserveAmmo}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Tabs + Recipes */}
          <div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <h3 className="text-xs font-medium text-slate-400">
                Modular Schematics
              </h3>
              <div className="flex items-center gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
                {(['all', 'weapon', 'armor'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                      filter === tab
                        ? 'bg-[#1C2230] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? 'All Schematics' : `${tab}s`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recipes.map((r) => {
                const ready = canCraft(r);
                const techOk = player.attributes.tech >= r.minTech;
                return (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl bg-[#0B0D11]/80 border border-white/10 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-display font-semibold text-sm text-white">
                          {r.kind === 'weapon' ? (
                            <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Shield className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                          <span>{r.name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-cyan-400">
                          {r.element}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                        {r.description}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-white/8 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                        {Object.entries(r.cost)
                          .map(
                            ([k, v]) =>
                              `${MATERIAL_LABELS[k as MaterialType].split(' ')[0]} ${
                                player.materials[k as MaterialType]
                              }/${v}`
                          )
                          .join(' · ')}
                        {!techOk && (
                          <span className="text-rose-400 ml-2">
                            Tech {r.minTech} req
                          </span>
                        )}
                      </div>
                      <button
                        disabled={!ready}
                        onClick={() => onCraft(r)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          ready
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Assemble
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
