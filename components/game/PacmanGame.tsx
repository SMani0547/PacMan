"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { DOWN, LEFT, RIGHT, UP, type DifficultyKey, type Vec } from "@/game/constants";
import type { GameResult, HudState, PacmanEngine } from "@/game/engine";
import { sound } from "@/game/sound";
import { ApiError, apiPost } from "@/lib/api";
import type { CompleteGameResponse, PlayerProfile } from "@/lib/types";
import GameCanvas from "./GameCanvas";
import { HudBar, HudLeft, HudRight } from "./GameHUD";
import GameOver, { SaveState } from "./GameOver";
import PauseMenu, { Confirm } from "./PauseMenu";

interface Props {
  player: PlayerProfile;
  difficulty: DifficultyKey;
  onExit: () => void;
  onLeaderboard: () => void;
  onPlayAgain: () => void;
  onProfile: (p: PlayerProfile) => void;
}

interface MobileDirectionButtonProps {
  dir: Vec;
  label: string;
  icon: typeof ArrowUp;
  onPress: (dir: Vec) => void;
  onRelease: (dir: Vec) => void;
}

function MobileDirectionButton({ dir, label, icon: Icon, onPress, onRelease }: MobileDirectionButtonProps) {
  const activePointerRef = useRef<number | null>(null);
  const releasePointer = (pointerId: number) => {
    if (activePointerRef.current !== pointerId) return;
    activePointerRef.current = null;
    onRelease(dir);
  };

  useEffect(() => () => {
    if (activePointerRef.current !== null) onRelease(dir);
  }, [dir, onRelease]);

  return (
    <button
      type="button"
      className="mobile-direction-button pointer-events-auto"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        if (activePointerRef.current !== null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointerRef.current = event.pointerId;
        onPress(dir);
      }}
      onPointerUp={(event) => releasePointer(event.pointerId)}
      onPointerCancel={(event) => releasePointer(event.pointerId)}
      onLostPointerCapture={(event) => releasePointer(event.pointerId)}
    >
      <Icon size={24} strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

/** React owns menus, HUD, save flow. The engine owns everything that changes 60 times per second. */
export default function PacmanGame({ player, difficulty, onExit, onLeaderboard, onPlayAgain, onProfile }: Props) {
  const engineRef = useRef<PacmanEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(sound.muted);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [showOver, setShowOver] = useState(false);
  const [save, setSave] = useState<SaveState>({ status: "saving" });
  const [showTouchControls, setShowTouchControls] = useState(false);

  const options = useMemo(() => ({
    difficulty, playerName: player.name.split(" ")[0].toUpperCase(), highScore: player.highScore,
    onHud: setHud,
    onGameOver: setResult,
    onPauseChange: (p: boolean) => { setPaused(p); if (!p) setConfirm(null); },
    onMuteChange: setMuted,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [difficulty]);

  const submit = useCallback(async (r: GameResult) => {
    setSave({ status: "saving" });
    try {
      const res = await apiPost<CompleteGameResponse>("/api/game/complete", r);
      onProfile(res.profile);
      setSave({ status: "saved", newHighScore: res.isNewHighScore });
    } catch (err) {
      setSave({ status: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }, [onProfile]);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
    setShowTouchControls(coarse);
    const onResize = () => setShowTouchControls(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!result) return;
    void submit(result);
    const t = setTimeout(() => setShowOver(true), 1600); // let "GAME OVER" sit on the board first
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const pressDir = useCallback((dir: Vec) => engineRef.current?.pressDir(dir), []);
  const releaseDir = useCallback((dir: Vec) => engineRef.current?.releaseDir(dir), []);
  const gamepadDirRef = useRef<Vec | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (!engineRef.current) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      const pad = typeof navigator !== "undefined" ? navigator.getGamepads?.()[0] : null;
      if (!pad) {
        if (gamepadDirRef.current) {
          releaseDir(gamepadDirRef.current);
          gamepadDirRef.current = null;
        }
        frame = window.requestAnimationFrame(tick);
        return;
      }

      const dpadMap = [
        { button: 12, dir: UP },
        { button: 13, dir: DOWN },
        { button: 14, dir: LEFT },
        { button: 15, dir: RIGHT },
      ] as const;
      const dpadActive = dpadMap.find(({ button }) => pad.buttons[button]?.pressed)?.dir ?? null;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const stickActive = Math.abs(x) > 0.45 || Math.abs(y) > 0.45
        ? (Math.abs(x) > Math.abs(y) ? (x >= 0 ? RIGHT : LEFT) : (y >= 0 ? DOWN : UP))
        : null;

      const nextDir = dpadActive ?? stickActive;
      if (gamepadDirRef.current && gamepadDirRef.current !== nextDir) {
        releaseDir(gamepadDirRef.current);
      }
      if (nextDir) {
        if (!gamepadDirRef.current || gamepadDirRef.current !== nextDir) {
          pressDir(nextDir);
        }
        gamepadDirRef.current = nextDir;
      } else if (gamepadDirRef.current) {
        releaseDir(gamepadDirRef.current);
        gamepadDirRef.current = null;
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pressDir, releaseDir]);

  const resume = () => engineRef.current?.resume();
  const doRestartLevel = () => { setConfirm(null); engineRef.current?.restartLevel(); };
  const doRestartGame = () => { setConfirm(null); setHud(null); engineRef.current?.restartGame(); };

  return (
    <div className="crt fixed inset-0 flex h-[100dvh] flex-col overflow-hidden bg-[#02030a]">
      {hud && <HudBar hud={hud} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {hud && <HudLeft hud={hud} />}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <GameCanvas options={options} onEngine={(e) => { engineRef.current = e; }} />
          {paused && !result && (
            <PauseMenu confirm={confirm} onConfirm={setConfirm} onResume={resume} onRestartLevel={doRestartLevel} onRestartGame={doRestartGame} onQuit={onExit} />
          )}
          {result && showOver && (
            <GameOver
              playerName={player.name} result={result} save={save}
              onRetry={() => void submit(result)}
              onPlayAgain={onPlayAgain} onLeaderboard={onLeaderboard} onMenu={onExit}
            />
          )}
        </div>
        {hud && <HudRight hud={hud} muted={muted} onMute={() => engineRef.current?.toggleMute()} onPause={() => engineRef.current?.pause()} />}
      </div>
      {showTouchControls && !result && !paused && (
        <>
          <div className="mobile-top-actions pointer-events-none absolute left-3 top-16 z-20 md:hidden">
            <button type="button" className="mobile-action pointer-events-auto" aria-label={paused ? "Resume" : "Pause"} onClick={() => { if (paused) engineRef.current?.resume(); else engineRef.current?.pause(); }}>
              {paused ? <Play size={18} strokeWidth={2.8} fill="currentColor" /> : <Pause size={18} strokeWidth={2.8} />}
            </button>
            <button type="button" className="mobile-action pointer-events-auto" aria-label={muted ? "Unmute" : "Mute"} onClick={() => engineRef.current?.toggleMute()}>
              {muted ? <VolumeX size={18} strokeWidth={2.8} /> : <Volume2 size={18} strokeWidth={2.8} />}
            </button>
          </div>
          <div className="mobile-direction-controls pointer-events-none absolute inset-x-0 bottom-[calc(8px+env(safe-area-inset-bottom,0px))] z-20 flex items-end justify-between px-[clamp(24px,8vw,64px)] md:hidden">
            <div className="mobile-direction-stack pointer-events-none flex flex-col gap-2" role="group" aria-label="Vertical movement controls">
              <MobileDirectionButton dir={UP} label="Move up" icon={ArrowUp} onPress={pressDir} onRelease={releaseDir} />
              <MobileDirectionButton dir={DOWN} label="Move down" icon={ArrowDown} onPress={pressDir} onRelease={releaseDir} />
            </div>
            <div className="mobile-direction-row pointer-events-none flex gap-2" role="group" aria-label="Horizontal movement controls">
              <MobileDirectionButton dir={LEFT} label="Move left" icon={ArrowLeft} onPress={pressDir} onRelease={releaseDir} />
              <MobileDirectionButton dir={RIGHT} label="Move right" icon={ArrowRight} onPress={pressDir} onRelease={releaseDir} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
