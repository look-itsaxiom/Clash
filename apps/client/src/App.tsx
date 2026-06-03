import { PhaserGame } from "./PhaserGame";
import { Lobby } from "./components/Lobby";
import { Hud } from "./components/Hud";
import { useClash } from "./hooks/useClash";
import "./ui.css";

function App() {
    const api = useClash();

    if (api.screen !== "game") {
        return (
            <div id="app">
                <Lobby api={api} />
            </div>
        );
    }

    return (
        <div id="app">
            <div className="board-wrap">
                <PhaserGame />
                <Hud api={api} />
            </div>
        </div>
    );
}

export default App;
