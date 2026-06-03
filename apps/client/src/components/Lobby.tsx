import { useState } from "react";
import { CARDS, type CardId } from "@clash/shared";
import type { ClashApi } from "../hooks/useClash";

const RULES: CardId[] = ["ATTACK", "HEAVY_ATTACK", "DEFENSE", "HEAL", "RECHARGE"];

export function Lobby({ api }: { api: ClashApi }) {
  const [code, setCode] = useState("");
  const searching = api.screen === "searching";

  return (
    <div className="lobby">
      <h1 className="title">
        <span className="title-clash">CLASH</span>
        <span className="title-sub">a duel of nerve and timing</span>
      </h1>

      {api.banner && <div className={`banner banner-${api.banner.tone}`}>{api.banner.text}</div>}

      <div className="panel">
        <label className="field">
          <span>Your name</span>
          <input
            value={api.name}
            maxLength={16}
            placeholder="Challenger"
            onChange={(e) => api.setName(e.target.value)}
            disabled={searching}
          />
        </label>

        {!searching ? (
          <>
            <button className="btn btn-primary" onClick={api.queue} disabled={!api.connected}>
              ⚔️ Find a Match
            </button>

            <div className="divider">or play a friend</div>

            <button className="btn" onClick={api.createRoom} disabled={!api.connected}>
              ＋ Create Private Room
            </button>

            <form
              className="join-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) api.joinRoom(code.trim());
              }}
            >
              <input
                className="code-input"
                value={code}
                placeholder="CODE"
                maxLength={4}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button className="btn" type="submit" disabled={!api.connected || code.trim().length < 4}>
                Join
              </button>
            </form>
          </>
        ) : (
          <>
            {api.roomCode && (
              <div className="room-code">
                <span className="room-code-label">Room code</span>
                <span className="room-code-value">{api.roomCode}</span>
              </div>
            )}
            <div className="searching-spinner">Searching…</div>
            <button className="btn" onClick={api.cancel}>
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="rules">
        <h3>The deck — 7 cards each</h3>
        <ul>
          {RULES.map((id) => {
            const c = CARDS[id];
            return (
              <li key={id}>
                <span className="rule-emoji">{c.emoji}</span>
                <span className="rule-name">{c.name}</span>
                <span className="rule-desc">{c.description}</span>
              </li>
            );
          })}
        </ul>
        <p className="rules-foot">
          Both players reveal at once. Read your opponent, bait their defense, and land the finishing blow.
        </p>
      </div>
    </div>
  );
}
