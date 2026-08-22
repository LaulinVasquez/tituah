import "./styles.css";
import { GameClient } from "./game/game-client.js";

const canvas = document.querySelector("#game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing game canvas");
}

const client = new GameClient();
void client.start(canvas);
