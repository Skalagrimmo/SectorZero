import React, { useState } from 'react';
import JSZip from 'jszip';
import { LUA_PROJECT_FILES } from '../lua/luaProjectFiles';
import { SPRITE_SHEET_PATH } from '../engine/spriteAtlas';
import { Download, Copy, Check, Code2, Cpu, Smartphone } from 'lucide-react';

interface LuaCodeStudioProps {
  renderScale: 'native' | '480x270' | '320x180';
  onChangeRenderScale: (scale: 'native' | '480x270' | '320x180') => void;
  onClose: () => void;
}

export const LuaCodeStudio: React.FC<LuaCodeStudioProps> = ({
  renderScale,
  onChangeRenderScale,
  onClose,
}) => {
  const [selectedPath, setSelectedPath] = useState(LUA_PROJECT_FILES[0].path);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeFile =
    LUA_PROJECT_FILES.find((f) => f.path === selectedPath) ||
    LUA_PROJECT_FILES[0];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExportZip = async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      for (const file of LUA_PROJECT_FILES) {
        zip.file(file.path, file.content);
      }
      // Bundle the actual 1408x768 sprite sheet directly into assets/spritesheet.jpg
      const res = await fetch(SPRITE_SHEET_PATH);
      if (res.ok) {
        const blob = await res.blob();
        zip.file('assets/spritesheet.jpg', blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sector-zero-lua-gles2-android.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/82 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-[#131720] border border-white/12 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                LuaJIT + OpenGL ES 2.0 Android Codebase
              </h2>
              <p className="text-xs text-slate-400">
                LÖVE2D Android target · mediump GLSL ES shaders · Adreno 305 / Mali-400 compatible raycaster
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportZip}
              disabled={exporting}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Packaging Zip...' : 'Export Android Zip'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0">
          {/* File Sidebar + Legacy Android Resolution Preview Selector */}
          <div className="lg:col-span-4 border-r border-white/10 bg-[#0B0D11]/80 p-4 flex flex-col justify-between gap-4 overflow-y-auto">
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-400 px-2 pb-1">
                Project Modules
              </div>
              {LUA_PROJECT_FILES.map((file) => {
                const active = file.path === selectedPath;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      active
                        ? 'bg-cyan-500/15 border border-cyan-500/50 text-white'
                        : 'text-slate-300 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="font-mono font-medium">{file.path}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                      {file.summary}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Legacy Android GPU Resolution</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['320x180', '480x270', 'native'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onChangeRenderScale(mode)}
                    className={`px-2 py-1.5 rounded text-[11px] font-mono border transition-colors ${
                      renderScale === mode
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-[#131720] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === 'native' ? '640x360' : mode}
                  </button>
                ))}
              </div>

              <div className="rounded-lg overflow-hidden border border-white/10 bg-[#131720]">
                <img
                  src={SPRITE_SHEET_PATH}
                  alt="1408x768 sprite sheet atlas"
                  referrerPolicy="no-referrer"
                  className="w-full h-24 object-cover"
                />
                <div className="px-2.5 py-1.5 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Source Atlas</span>
                  <span className="font-mono tabular-nums">1408 × 768</span>
                </div>
              </div>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="lg:col-span-8 flex flex-col min-h-0 bg-[#0B0D11]">
            <div className="px-4 py-2.5 border-b border-white/8 flex items-center justify-between gap-3 bg-[#131720]/60">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>{activeFile.path}</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-1 rounded border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-5 text-xs font-mono text-slate-200 leading-relaxed overflow-auto flex-1">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
