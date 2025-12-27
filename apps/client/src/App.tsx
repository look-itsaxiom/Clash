import { useRef, useState } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { ClashGameState } from "@clash/shared";

function App() {
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [gameState, setGameState] = useState<ClashGameState | null>(null);

    const handleGameStateUpdate = (newGameState: ClashGameState) => {
        setGameState(newGameState);
    };

    return (
        <div id="app">
            <PhaserGame
                ref={phaserRef}
                onGameStateUpdate={handleGameStateUpdate}
            />
            <div
                style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    color: "#00ff00",
                    padding: "15px",
                    borderRadius: "5px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    maxWidth: "400px",
                    maxHeight: "90vh",
                    overflow: "auto",
                    border: "2px solid #00ff00",
                }}
            >
                <h3 style={{ margin: "0 0 10px 0", color: "#00ff00" }}>
                    Debug: Game State
                </h3>
                <pre
                    style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}
                >
                    {gameState
                        ? JSON.stringify(gameState, null, 2)
                        : "No game state yet"}
                </pre>
            </div>
        </div>
    );
}

export default App;

