"use client";
import { useEffect, useRef } from "react";
import { COLS, ROWS } from "@/game/constants";
import { EngineOptions, PacmanEngine } from "@/game/engine";

interface Props { options: Omit<EngineOptions, "canvas">; onEngine: (e: PacmanEngine | null) => void }

/**
 * Hosts the <canvas> and owns the engine's lifetime. The engine renders itself with
 * requestAnimationFrame, so React never re-renders per frame. Remount (via `key`) for a new game.
 */
export default function GameCanvas({ options, onEngine }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef(options);
  const onEngineRef = useRef(onEngine);
  optionsRef.current = options;
  onEngineRef.current = onEngine;

  useEffect(() => {
    const wrap = wrapRef.current!, canvas = canvasRef.current!;
    const o = optionsRef.current;
    const engine = new PacmanEngine({
      ...o, canvas,
      onHud: (h) => optionsRef.current.onHud?.(h),
      onGameOver: (r) => optionsRef.current.onGameOver?.(r),
      onPauseChange: (p) => optionsRef.current.onPauseChange?.(p),
      onMuteChange: (m) => optionsRef.current.onMuteChange?.(m),
    });
    const fit = () => {
      const ts = Math.max(8, Math.floor(Math.min(wrap.clientWidth / COLS, wrap.clientHeight / ROWS)));
      engine.resize(ts, window.devicePixelRatio || 1);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    engine.start();
    onEngineRef.current(engine);
    return () => { ro.disconnect(); engine.destroy(); onEngineRef.current(null); };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 flex h-full w-full items-center justify-center p-2 pb-[calc(136px+env(safe-area-inset-bottom,0px))] md:pb-2">
      <canvas ref={canvasRef} className="block h-full w-full max-h-full max-w-full object-contain" aria-label="Pac-Man game board" role="img" />
    </div>
  );
}
