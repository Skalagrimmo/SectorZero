import React from 'react';
import { FACTION_INFO } from '../data/worldData';
import {
  FactionId,
  Mission,
  SectorDefinition,
} from '../types/game';
import { MapPin, Lock, CheckCircle2, Navigation } from 'lucide-react';

interface SectorMapOverlayProps {
  sectors: Record<string, SectorDefinition>;
  currentSectorId: string;
  playerX: number;
  playerY: number;
  unlockedSectors: string[];
  reputation: Record<FactionId, number>;
  missions: Mission[];
  onFastTravel: (sectorId: string) => void;
  onAcceptMission: (missionId: string) => void;
  onClose: () => void;
}

function getStandingLabel(rep: number): string {
  if (rep >= 40) return 'Allied';
  if (rep >= 15) return 'Trusted';
  if (rep > -20) return 'Neutral';
  if (rep > -50) return 'Distrusted';
  return 'Hostile';
}

export const SectorMapOverlay: React.FC<SectorMapOverlayProps> = ({
  sectors,
  currentSectorId,
  playerX,
  playerY,
  unlockedSectors,
  reputation,
  missions,
  onFastTravel,
  onAcceptMission,
  onClose,
}) => {
  const currentSector = sectors[currentSectorId];
  const sectorList = Object.values(sectors);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#131720] border border-white/12 rounded-xl shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              District Map & Faction Standing
            </h2>
            <p className="text-xs text-slate-400">
              Current location: {currentSector.name} · Reputation unlocks faction contracts and alters patrol hostility.
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Open-World 5-Sector Transit Graph + Local Grid Radar */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-[#0B0D11] border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-300">
                  Open-World Transit Network
                </span>
                <span className="text-[11px] text-slate-400">
                  Click unlocked sector node to fast-travel
                </span>
              </div>

              <div className="relative h-64 w-full rounded-lg bg-[#0E1219] border border-white/6 overflow-hidden">
                {/* Connection lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {sectorList.flatMap((sec) =>
                    sec.connections.map((targetId) => {
                      if (sec.id > targetId) return null;
                      const target = sectors[targetId];
                      if (!target) return null;
                      return (
                        <line
                          key={`${sec.id}-${targetId}`}
                          x1={`${sec.mapX}%`}
                          y1={`${sec.mapY}%`}
                          x2={`${target.mapX}%`}
                          y2={`${target.mapY}%`}
                          stroke="rgba(148,163,184,0.28)"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                      );
                    })
                  )}
                </svg>

                {/* Sector Nodes */}
                {sectorList.map((sec) => {
                  const isCurrent = sec.id === currentSectorId;
                  const unlocked = unlockedSectors.includes(sec.id);
                  const fac = FACTION_INFO[sec.controllingFaction];
                  return (
                    <button
                      key={sec.id}
                      disabled={!unlocked || isCurrent}
                      onClick={() => onFastTravel(sec.id)}
                      style={{
                        left: `${sec.mapX}%`,
                        top: `${sec.mapY}%`,
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-2 rounded-lg border text-left transition-colors min-w-[136px] ${
                        isCurrent
                          ? 'bg-amber-500/20 border-amber-500 text-white'
                          : unlocked
                          ? 'bg-[#131720] border-white/20 hover:border-cyan-400 text-slate-200 cursor-pointer'
                          : 'bg-[#0B0D11]/90 border-white/8 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-display font-semibold">
                        <span className="truncate">{sec.name}</span>
                        {isCurrent ? (
                          <Navigation className="w-3 h-3 text-amber-400 shrink-0" />
                        ) : !unlocked ? (
                          <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                        ) : (
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                        )}
                      </div>
                      <div
                        className="text-[10px] mt-0.5 truncate"
                        style={{ color: unlocked ? fac.accent : '#64748B' }}
                      >
                        {fac.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Local Sector Floorplan with Fog-of-War */}
            {(() => {
              let visitedCount = 0;
              const totalCount = currentSector.width * currentSector.height;
              for (let ry = 0; ry < currentSector.height; ry++) {
                const row = currentSector.grid[ry];
                for (let rx = 0; rx < currentSector.width; rx++) {
                  if (row[rx]?.visited) visitedCount++;
                }
              }
              const exploredPct = Math.round(
                (visitedCount / Math.max(1, totalCount)) * 100
              );

              return (
                <div className="bg-[#0B0D11] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-white">
                      {currentSector.name} Blueprint
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Explored tiles show walls, amber cover, cyan gates, and hazards · Unexplored sectors remain shrouded.
                    </p>
                    <div className="text-[11px] font-mono text-slate-300 mt-2 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span>
                        Explored {exploredPct}% ({visitedCount}/{totalCount})
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-400">
                        Coordinates: X {playerX.toFixed(1)} · Y {playerY.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div
                    className="grid gap-[1px] bg-[#131720] p-1.5 rounded-lg border border-white/10 shrink-0"
                    style={{
                      gridTemplateColumns: `repeat(${currentSector.width}, 6px)`,
                    }}
                  >
                    {currentSector.grid.flatMap((row, y) =>
                      row.map((cell, x) => {
                        const isPlayer =
                          Math.floor(playerX) === x && Math.floor(playerY) === y;
                        const isRevealed = Boolean(cell.visited) || isPlayer;

                        let color = (x + y) % 2 === 0 ? '#07090D' : '#0A0D14';
                        if (isRevealed) {
                          color = '#182030';
                          if (isPlayer) color = '#FFFFFF';
                          else if (cell.kind === 'wall') color = '#475569';
                          else if (cell.kind === 'cover') color = '#D97706';
                          else if (cell.kind === 'gate' || cell.kind === 'door')
                            color = '#06B6D4';
                          else if (
                            cell.hazard === 'coolant' ||
                            cell.hazard === 'electrified'
                          )
                            color = '#0E7490';
                          else if (
                            cell.hazard === 'oil' ||
                            cell.hazard === 'burning'
                          )
                            color = '#9A3412';
                          else if (cell.hazard === 'toxic') color = '#15803D';
                        }

                        return (
                          <div
                            key={`${x}-${y}`}
                            style={{ backgroundColor: color }}
                            className="w-[6px] h-[6px]"
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Right: Faction Reputation & Contracts */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-[#0B0D11] border border-white/10 rounded-xl p-4 space-y-3.5">
              <h3 className="text-xs font-medium text-slate-300">
                Faction Reputation
              </h3>
              {(['aegis', 'syndicate', 'helix'] as FactionId[]).map((fid) => {
                const info = FACTION_INFO[fid];
                const rep = reputation[fid];
                const pct = ((rep + 100) / 200) * 100;
                return (
                  <div key={fid} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">
                        {info.name}
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {getStandingLabel(rep)} ({rep >= 0 ? '+' : ''}
                        {rep})
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: info.accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-[#0B0D11] border border-white/10 rounded-xl p-4 space-y-3 max-h-[300px] overflow-y-auto">
              <h3 className="text-xs font-medium text-slate-300">
                Available & Faction-Gated Contracts
              </h3>
              <div className="space-y-2.5">
                {missions.map((m) => {
                  const fac = FACTION_INFO[m.faction];
                  const repOk = reputation[m.faction] >= m.minReputation;
                  const unlocked = m.status !== 'locked' || repOk;

                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-lg bg-[#131720] border border-white/8 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {m.title}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {m.status === 'completed' ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : !unlocked ? (
                            <span className="text-slate-500">
                              Rep {m.minReputation}+ req
                            </span>
                          ) : m.status === 'active' ? (
                            <span className="text-amber-400">Active</span>
                          ) : (
                            <span className="text-cyan-400">Open</span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {m.status === 'active' ? m.objectiveText : m.summary}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span
                          className="text-[10px]"
                          style={{ color: fac.accent }}
                        >
                          {fac.name} · {sectors[m.sectorId]?.name} · {m.rewardCredits} Cr
                        </span>
                        {unlocked && m.status === 'available' && (
                          <button
                            onClick={() => onAcceptMission(m.id)}
                            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 text-[11px] font-medium transition-colors"
                          >
                            Track Contract
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
