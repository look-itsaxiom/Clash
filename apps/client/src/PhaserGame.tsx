import { forwardRef, useLayoutEffect, useRef } from "react";
import StartGame from "./game/main";

export interface IRefPhaserGame {
  game: Phaser.Game | null;
}

/**
 * Mounts the Phaser game exactly once for the lifetime of the board and tears it
 * down on unmount. All gameplay communication happens over the EventBus, so this
 * component intentionally stays tiny.
 */
export const PhaserGame = forwardRef<IRefPhaserGame>(function PhaserGame(_props, ref) {
  const game = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame("game-container");
      if (typeof ref === "function") ref({ game: game.current });
      else if (ref) ref.current = { game: game.current };
    }
    return () => {
      game.current?.destroy(true);
      game.current = null;
    };
  }, [ref]);

  return <div id="game-container" className="game-container" />;
});
