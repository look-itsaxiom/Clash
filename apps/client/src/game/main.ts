import { Game as MainGame } from "./scenes/Game";
import { AUTO, Game, Scale, Types } from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./constants";

export { BOARD_HEIGHT, BOARD_WIDTH } from "./constants";

// Render the internal canvas at 2x the logical size so the browser DOWN-scales
// it to fit the page (sharp supersampling) instead of up-scaling a small canvas
// (which looks grainy). The scene lays everything out proportionally, so the
// exact backing resolution doesn't matter to the layout.
const SUPERSAMPLE = 2;

const config: Types.Core.GameConfig = {
    type: AUTO,
    parent: "game-container",
    backgroundColor: "#0b1020",
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: BOARD_WIDTH * SUPERSAMPLE,
        height: BOARD_HEIGHT * SUPERSAMPLE,
    },
    render: { antialias: true },
    scene: [MainGame],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
