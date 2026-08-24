import "./styles.css";
import { GameClient } from "./game/game-client.js";

if (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches) {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("selectstart", (event) => event.preventDefault());
}

const canvas = document.querySelector("#game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing game canvas");
}

const client = new GameClient();
void client.start(canvas).catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("Failed to start Tituah", error.message, error.stack);
    return;
  }
  console.error("Failed to start Tituah", error);
});
