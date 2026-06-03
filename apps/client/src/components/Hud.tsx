import { useEffect, useState } from "react";
import { TURN_TIME_MS } from "@clash/shared";
import type { ClashApi } from "../hooks/useClash";

/** Ticks while a deadline is pending so the timer bar animates smoothly. */
function useCountdown(deadline: number | null, active: boolean): number {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!active || deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline, active]);
  if (deadline === null) return 1;
  return Math.max(0, Math.min(1, (deadline - Date.now()) / TURN_TIME_MS));
}

export function Hud({ api }: { api: ClashApi }) {
  const { view } = api;
  const selecting = view?.phase === "SELECTING";
  const youReady = Boolean(view?.you.selected);
  const remaining = useCountdown(api.deadline, Boolean(selecting));

  if (!view) return null;
  const finished = view.phase === "FINISHED";

  const outcome = finished
    ? view.draw
      ? { title: "Draw", tone: "draw" as const }
      : view.winnerId === view.you.id
        ? { title: "Victory!", tone: "win" as const }
        : { title: "Defeat", tone: "lose" as const }
    : null;

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-turn">Turn {view.turn}</div>
        {selecting && (
          <div className="timer">
            <div className="timer-fill" style={{ width: `${remaining * 100}%` }} />
          </div>
        )}
        <div className="hud-status">
          {!api.connected
            ? "Reconnecting…"
            : !view.opponent.connected
              ? `${view.opponent.name} disconnected`
              : youReady
                ? "Locked in — waiting…"
                : view.opponent.hasSelected
                  ? `${view.opponent.name} is ready!`
                  : "Choose your card"}
        </div>
      </div>

      {api.banner && <div className={`hud-banner banner-${api.banner.tone}`}>{api.banner.text}</div>}

      {api.lastResult && !finished && (
        <div className="turn-log">
          {api.lastResult.messages.map((m, i) => (
            <div key={i} className="turn-log-line">
              {m}
            </div>
          ))}
        </div>
      )}

      {outcome && (
        <div className="modal-backdrop">
          <div className={`modal outcome-${outcome.tone}`}>
            <h2>{outcome.title}</h2>
            <p>
              {view.you.name} {view.you.hearts}❤ — {view.opponent.hearts}❤ {view.opponent.name}
            </p>
            {api.rematchPending ? (
              <p className="muted">Waiting for {view.opponent.name} to accept…</p>
            ) : (
              <button className="btn btn-primary" onClick={api.rematch}>
                ⟳ Rematch
              </button>
            )}
            <button className="btn" onClick={api.leave}>
              Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
