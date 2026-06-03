import { Game as MainGame } from "./scenes/Game";
import { AUTO, Game, Scale, Types } from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./constants";

export { BOARD_HEIGHT, BOARD_WIDTH } from "./constants";

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    parent: "game-container",
    backgroundColor: "#0b1020",
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
    },
    scene: [MainGame],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
