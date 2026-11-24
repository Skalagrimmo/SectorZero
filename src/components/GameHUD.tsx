import React, { useRef } from 'react';
import {
  CombatEventBanner,
  DebuffElement,
  PlayerCharacter,
  PlayerDebuff,
  SectorDefinition,
} from '../types/game';
import { Crosshair, Flame, Snowflake, Zap, Biohazard } from 'lucide-react';

interface DebuffTheme {
  label: string;
  textClass: string;
  barClass: string;
  edgeRgba: string;
  coreRgba: string;
}

const DEBUFF_THEMES: Record<DebuffElement, DebuffTheme> = {
  thermal: {
    label: 'Thermal',
    textClass: 'text-amber-300',
    barClass: 'bg-amber-400',
    edgeRgba: 'rgba(239, 68, 68, 0.72)',
    coreRgba: 'rgba(245, 158, 11, 0.42)',
  },
  cryo: {
    label: 'Cryo',
    textClass: 'text-cyan-200',
    barClass: 'bg-cyan-300',
    edgeRgba: 'rgba(56, 189, 248, 0.68)',
    coreRgba: 'rgba(186, 230, 253, 0.36)',
  },
  shock: {
    label: 'Shock',
    textClass: 'text-sky-300',
    barClass: 'bg-sky-400',
    edgeRgba: 'rgba(59, 130, 246, 0.72)',
    coreRgba: 'rgba(254, 249, 195, 0.34)',
  },
  toxin: {
    label: 'Toxin',
    textClass: 'text-emerald-300',
    barClass: 'bg-emerald-400',
    edgeRgba: 'rgba(16, 185, 129, 0.70)',
    coreRgba: 'rgba(52, 211, 153, 0.35)',
  },
};

function getEffectiveDebuffIntensity(d: PlayerDebuff): number {
  const decay = 0.32 + 0.68 * Math.max(0, Math.min(1, d.timer / Math.max(0.1, d.maxTimer)));
  return Math.max(0, Math.min(1, d.intensity * decay));
}

function renderDebuffIcon(el: DebuffElement) {
  switch (el) {
    case 'thermal':
      return <Flame className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />;
    case 'cryo':
      return <Snowflake className="w-3 h-3 text-cyan-300 shrink-0" aria-hidden="true" />;
    case 'shock':
      return <Zap className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />;
    case 'toxin':
      return <Biohazard className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" />;
  }
}

interface GameHUDProps {
  player: PlayerCharacter;
  sector: SectorDefinition;
  angle: number;
  interactPrompt: string | null;
  events: CombatEventBanner[];
  touchMode: boolean;
  pointerLocked: boolean;
  onMoveStick: (dx: number, dy: number) => void;
  onLookStick: (dx: number, dy: number) => void;
  onFire: () => void;
  onReload: () => void;
  onInteract: () => void;
  onCycleWeapon: () => void;
  onSprintToggle?: (active: boolean) => void;
  onDash?: () => void;
  onRequestLock: () => void;
}

const COMPASS_LABELS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export const GameHUD: React.FC<GameHUDProps> = ({
  player,
  sector,
  angle,
  interactPrompt,
  events,
  touchMode,
  pointerLocked,
  onMoveStick,
  onLookStick,
  onFire,
  onReload,
  onInteract,
  onCycleWeapon,
  onSprintToggle,
  onDash,
  onRequestLock,
}) => {
  const activeWeapon = player.weapons[player.activeWeaponIndex];
  const normAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const compassIdx = Math.round((normAngle / (Math.PI * 2)) * 8) % 8;

  const leftTouchRef = useRef<{ id: number; sx: number; sy: number } | null>(
    null
  );
  const rightTouchRef = useRef<{ id: number; sx: number; sy: number } | null>(
    null
  );

  const renderElementIcon = () => {
    switch (activeWeapon.element) {
      case 'thermal':
        return <Flame className="w-3.5 h-3.5 text-amber-400" />;
      case 'cryo':
        return <Snowflake className="w-3.5 h-3.5 text-cyan-300" />;
      case 'shock':
        return <Zap className="w-3.5 h-3.5 text-sky-400" />;
      case 'toxin':
        return <Biohazard className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Crosshair className="w-3.5 h-3.5 text-slate-300" />;
    }
  };

  const activeDebuffs = (player.debuffs ?? [])
    .filter((d) => d.timer > 0.02 && d.intensity > 0.02)
    .map((d) => ({ debuff: d, eff: getEffectiveDebuffIntensity(d) }))
    .sort((a, b) => b.eff - a.eff);
  const dominant = activeDebuffs[0];
  const secondary = activeDebuffs[1];

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* Intensity-Scaled Elemental Debuff Perimeter Vignette Overlay */}
      {dominant && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 transition-opacity duration-150"
          style={{
            opacity: 0.16 + dominant.eff * 0.68,
            background: `radial-gradient(ellipse at center, transparent ${Math.round(
              72 - dominant.eff * 24
            )}%, ${DEBUFF_THEMES[dominant.debuff.element].coreRgba} ${Math.round(
              88 - dominant.eff * 12
            )}%, ${DEBUFF_THEMES[dominant.debuff.element].edgeRgba} 100%)`,
          }}
        />
      )}
      {dominant && dominant.eff >= 0.3 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 animate-pulse motion-reduce:animate-none"
          style={{
            opacity: dominant.eff * 0.34,
            boxShadow: `inset 0 0 ${Math.round(36 + dominant.eff * 76)}px ${
              DEBUFF_THEMES[dominant.debuff.element].edgeRgba
            }`,
          }}
        />
      )}
      {secondary && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 transition-opacity duration-150"
          style={{
            opacity: secondary.eff * 0.42,
            boxShadow: `inset 0 0 ${Math.round(28 + secondary.eff * 52)}px ${
              DEBUFF_THEMES[secondary.debuff.element].edgeRgba
            }`,
          }}
        />
      )}
      {player.dashIframeActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 transition-opacity duration-100"
          style={{
            boxShadow: 'inset 0 0 42px rgba(34, 211, 238, 0.34)',
          }}
        />
      )}
      {/* Slim Top Compass Strip (Diegetic minimal edge) */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <div className="px-3 py-1 rounded bg-black/45 backdrop-blur-xs border border-white/8 flex items-center gap-3 text-[11px] font-mono text-slate-300">
          <span className="text-amber-400 font-semibold">
            {COMPASS_LABELS[compassIdx]}
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-200">{sector.name}</span>
        </div>
        {!pointerLocked && !touchMode && (
          <button
            onClick={onRequestLock}
            className="pointer-events-auto mt-1 px-3 py-1 rounded bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-[11px] font-semibold transition-colors cursor-pointer"
          >
            Click Viewport to Lock Aim (WASD + Mouse · Space/2xTap Dash · E Interact · R Reload)
          </button>
        )}
      </div>

      {/* Diegetic Event Feed (Elemental reactions, cover shattered, rep shifts) */}
      <div className="absolute top-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {events.slice(0, 3).map((ev) => (
          <div
            key={ev.id}
            className={`px-3 py-1 rounded text-xs font-medium backdrop-blur-xs border ${
              ev.tone === 'combo'
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                : ev.tone === 'rep'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : ev.tone === 'danger'
                ? 'bg-rose-500/25 border-rose-400/60 text-rose-200'
                : 'bg-black/50 border-white/10 text-slate-200'
            }`}
          >
            {ev.text}
          </div>
        ))}
      </div>

      {/* Center Minimal Reticle + Contextual Interaction Prompt */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-5 h-5 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-white/90" />
          <div className="absolute top-0 w-[1px] h-1.5 bg-white/55" />
          <div className="absolute bottom-0 w-[1px] h-1.5 bg-white/55" />
          <div className="absolute left-0 h-[1px] w-1.5 bg-white/55" />
          <div className="absolute right-0 h-[1px] w-1.5 bg-white/55" />
        </div>
        {interactPrompt && (
          <div className="absolute translate-y-8 px-3 py-1 rounded bg-black/65 border border-amber-400/40 text-xs font-medium text-amber-200">
            [E] {interactPrompt}
          </div>
        )}
      </div>

      {/* Slim Bottom-Left Edge Bars (Active Elemental Debuffs + HP + Shield + Stamina) */}
      <div className="absolute bottom-5 left-5 w-48 space-y-2">
        {activeDebuffs.length > 0 && (
          <div
            role="status"
            aria-label="Active elemental debuffs"
            className="space-y-1.5 pb-1.5 border-b border-white/10"
          >
            {activeDebuffs.slice(0, 3).map(({ debuff, eff }) => {
              const theme = DEBUFF_THEMES[debuff.element];
              const pct = Math.round(eff * 100);
              return (
                <div key={debuff.element} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className={`flex items-center gap-1.5 font-medium ${theme.textClass}`}>
                      {renderDebuffIcon(debuff.element)}
                      <span>{theme.label}</span>
                    </span>
                    <span className="text-slate-200">
                      {pct}% · {debuff.timer.toFixed(1)}s
                    </span>
                  </div>
                  <div className="h-[2px] w-full bg-white/15 overflow-hidden">
                    <div
                      className={`h-full ${theme.barClass} transition-all duration-100`}
                      style={{
                        width: `${Math.max(6, pct)}%`,
                        opacity: 0.55 + eff * 0.45,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-200 mb-0.5">
            <span>Vitality</span>
            <span>
              {Math.ceil(player.hp)} / {player.maxHp}
            </span>
          </div>
          <div className="h-[3px] w-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all duration-150"
              style={{
                width: `${Math.max(0, (player.hp / player.maxHp) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-300 mb-0.5">
            <span>Shield</span>
            <span>
              {Math.ceil(player.shield)} / {player.maxShield}
            </span>
          </div>
          <div className="h-[2px] w-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-150"
              style={{
                width: `${Math.max(
                  0,
                  (player.shield / Math.max(1, player.maxShield)) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="h-[1.5px] w-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-amber-400/85 transition-all duration-100"
              style={{
                width: `${Math.max(
                  0,
                  (player.stamina / Math.max(1, player.maxStamina)) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {(() => {
          const dashCd = player.dashCooldown ?? 0;
          const dashMax = player.dashMaxCooldown ?? 0.75;
          const isCooling = dashCd > 0.02;
          const hasStamina = player.stamina >= 28;
          const isEvading = Boolean(player.dashIframeActive);
          const fillPct = isCooling
            ? Math.max(0, Math.min(100, ((dashMax - dashCd) / Math.max(0.01, dashMax)) * 100))
            : 100;
          return (
            <div className="pt-0.5">
              <div className="flex justify-between text-[11px] font-mono tabular-nums mb-0.5">
                <span
                  className={
                    isEvading
                      ? 'text-cyan-300 font-medium'
                      : isCooling || !hasStamina
                      ? 'text-slate-400'
                      : 'text-slate-300'
                  }
                >
                  Dash
                </span>
                <span
                  className={
                    isEvading
                      ? 'text-cyan-300 font-medium'
                      : isCooling
                      ? 'text-cyan-200/80'
                      : hasStamina
                      ? 'text-slate-400'
                      : 'text-amber-400/85'
                  }
                >
                  {isEvading
                    ? 'Evade'
                    : isCooling
                    ? `${dashCd.toFixed(1)}s`
                    : hasStamina
                    ? 'Ready · Space'
                    : 'Low Stamina'}
                </span>
              </div>
              <div className="h-[2px] w-full bg-white/12 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    isEvading
                      ? 'bg-cyan-300'
                      : isCooling
                      ? 'bg-cyan-400/75'
                      : hasStamina
                      ? 'bg-cyan-400'
                      : 'bg-amber-400/45'
                  }`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Slim Bottom-Right Weapon + Element + Ammo */}
      <div className="absolute bottom-5 right-5 text-right space-y-1">
        <div className="flex items-center justify-end gap-2 text-xs font-display font-semibold text-white">
          {renderElementIcon()}
          <span>{activeWeapon.name}</span>
        </div>
        <div className="font-mono text-lg font-bold tabular-nums text-white leading-none">
          {activeWeapon.ammoInMag}
          <span className="text-xs font-normal text-slate-400 ml-1.5">
            / {activeWeapon.reserveAmmo}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400 capitalize">
          {activeWeapon.element} · {player.credits} Cr
        </div>
      </div>

      {/* Optional Mobile / Legacy Android Dual-Stick Touch Overlay */}
      {touchMode && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-16 flex items-end justify-between px-5 pb-2">
          {/* Left Move Pad */}
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              leftTouchRef.current = {
                id: e.pointerId,
                sx: e.clientX,
                sy: e.clientY,
              };
            }}
            onPointerMove={(e) => {
              if (!leftTouchRef.current || leftTouchRef.current.id !== e.pointerId)
                return;
              const dx = Math.max(-1, Math.min(1, (e.clientX - leftTouchRef.current.sx) / 36));
              const dy = Math.max(-1, Math.min(1, (e.clientY - leftTouchRef.current.sy) / 36));
              onMoveStick(dx, dy);
            }}
            onPointerUp={() => {
              leftTouchRef.current = null;
              onMoveStick(0, 0);
            }}
            className="w-28 h-28 rounded-full border border-white/20 bg-black/35 backdrop-blur-xs flex items-center justify-center text-[11px] font-mono text-slate-300 touch-none"
          >
            MOVE
          </div>

          {/* Right Look & Action Buttons */}
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-2">
              <button
                onClick={onInteract}
                className="min-w-[48px] min-h-[44px] px-3 rounded-lg bg-cyan-500/25 border border-cyan-400/50 text-xs font-semibold text-cyan-200"
              >
                Use
              </button>
              <button
                onClick={onReload}
                className="min-w-[48px] min-h-[44px] px-3 rounded-lg bg-white/10 border border-white/20 text-xs font-semibold text-white"
              >
                Reload
              </button>
              <button
                onClick={onCycleWeapon}
                className="min-w-[48px] min-h-[44px] px-3 rounded-lg bg-white/10 border border-white/20 text-xs font-semibold text-white"
              >
                Swap
              </button>
              <button
                onPointerDown={() => onSprintToggle?.(true)}
                onPointerUp={() => onSprintToggle?.(false)}
                onPointerCancel={() => onSprintToggle?.(false)}
                className="min-w-[48px] min-h-[44px] px-3 rounded-lg bg-amber-500/20 border border-amber-400/45 text-xs font-semibold text-amber-200"
              >
                Sprint
              </button>
              <button
                onPointerDown={() => onDash?.()}
                disabled={(player.dashCooldown ?? 0) > 0.02 || player.stamina < 28}
                className="min-w-[48px] min-h-[44px] px-3 rounded-lg bg-cyan-500/25 border border-cyan-400/55 text-xs font-semibold text-cyan-200 disabled:opacity-45 tabular-nums"
              >
                {(player.dashCooldown ?? 0) > 0.02
                  ? `${(player.dashCooldown ?? 0).toFixed(1)}s`
                  : 'Dash'}
              </button>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onPointerDown={onFire}
                className="w-16 h-16 rounded-full bg-amber-500/80 border border-amber-300 text-xs font-bold text-slate-950 active:scale-95"
              >
                FIRE
              </button>
              <div
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  rightTouchRef.current = {
                    id: e.pointerId,
                    sx: e.clientX,
                    sy: e.clientY,
                  };
                }}
                onPointerMove={(e) => {
                  if (
                    !rightTouchRef.current ||
                    rightTouchRef.current.id !== e.pointerId
                  )
                    return;
                  const dx = (e.clientX - rightTouchRef.current.sx) / 40;
                  const dy = (e.clientY - rightTouchRef.current.sy) / 40;
                  onLookStick(dx, dy);
                }}
                onPointerUp={() => {
                  rightTouchRef.current = null;
                  onLookStick(0, 0);
                }}
                className="w-24 h-24 rounded-full border border-white/20 bg-black/35 backdrop-blur-xs flex items-center justify-center text-[11px] font-mono text-slate-300 touch-none"
              >
                AIM
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
