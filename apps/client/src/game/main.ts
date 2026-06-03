import { Game as MainGame } from "./scenes/Game";
import { AUTO, Game, Scale, Types } from "phaser";
import { SUPERSAMPLE, logicalBoardSize } from "./constants";

const initial = logicalBoardSize();

const config: Types.Core.GameConfig = {
    type: AUTO,
    parent: "game-container",
    backgroundColor: "#0b1020",
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: initial.width * SUPERSAMPLE,
        height: initial.height * SUPERSAMPLE,
    },
    render: { antialias: true },
    scene: [MainGame],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
