import React from 'react';
import { FACTION_INFO } from '../data/worldData';
import {
  Attributes,
  DialogueChoice,
  DialogueGraph,
  PlayerCharacter,
} from '../types/game';
import { MessageSquare, Lock, CheckCircle2 } from 'lucide-react';

interface DialogueOverlayProps {
  graph: DialogueGraph;
  nodeId: string;
  player: PlayerCharacter;
  onSelectChoice: (choice: DialogueChoice) => void;
  onClose: () => void;
}

export const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
  graph,
  nodeId,
  player,
  onSelectChoice,
  onClose,
}) => {
  const node = graph.nodes[nodeId];
  if (!node) return null;

  const getEffectiveAttr = (attr: keyof Attributes) => {
    let val = player.attributes[attr];
    if (
      player.perk === 'silver_tongue' &&
      (attr === 'neural' || attr === 'tech')
    ) {
      val += 1;
    }
    return val;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#131720] border border-white/12 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold text-white truncate">
                {node.speaker}
              </h3>
              <div className="text-xs text-slate-400">
                {node.faction
                  ? FACTION_INFO[node.faction].name
                  : 'Facility Network Interface'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            {node.text}
          </p>

          <div className="space-y-2.5 pt-2 border-t border-white/8">
            {node.choices.map((choice, idx) => {
              const req = choice.reqAttr;
              const currentAttr = req ? getEffectiveAttr(req.attr) : 99;
              const passes = !req || currentAttr >= req.min;

              return (
                <button
                  key={idx}
                  disabled={!passes}
                  onClick={() => onSelectChoice(choice)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors flex items-center justify-between gap-3 ${
                    passes
                      ? 'bg-[#0B0D11]/80 border-white/12 hover:border-amber-500/80 hover:bg-amber-500/10 text-slate-100 cursor-pointer'
                      : 'bg-[#0B0D11]/40 border-white/5 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span className="leading-snug">{choice.text}</span>
                  {req && (
                    <span
                      className={`font-mono text-[11px] shrink-0 flex items-center gap-1 ${
                        passes ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                    >
                      {passes ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                      {req.attr.toUpperCase()} {currentAttr}/{req.min}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
