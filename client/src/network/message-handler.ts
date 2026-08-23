import { getStage, type ServerMessage } from "@tituah/shared";
import type { GameState } from "../game/game-state.js";
import type { InterpolationManager } from "../prediction/interpolation-manager.js";
import type { PredictionManager } from "../prediction/prediction-manager.js";

export class MessageHandler {
  constructor(
    private readonly state: GameState,
    private readonly prediction: PredictionManager,
    private readonly interpolation: InterpolationManager,
    private readonly onEvent: (message: ServerMessage) => void = () => undefined,
  ) {}

  handle(message: ServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.state.setLocalPlayer(message.playerId, message.matchId, message.player);
        break;
      case "player_joined":
        this.state.addRemoteName(message.playerId, message.name);
        break;
      case "match_started":
        this.prediction.setMap(getStage(message.snapshot.stageId));
        this.state.beginMatch(message.snapshot, message.yourId);
        this.prediction.reset(message.snapshot, message.yourId);
        this.interpolation.reset(message.snapshot);
        break;
      case "snapshot":
        this.state.applySnapshot(message.snapshot);
        this.prediction.reconcile(message.snapshot);
        this.interpolation.push(message.snapshot);
        break;
      case "player_hit":
        this.state.noteHit(message);
        break;
      case "player_respawn":
        this.state.noteRespawn(message);
        break;
      case "match_ended":
        this.state.endMatch(message.winnerId, message.scores);
        break;
      case "player_left":
        this.state.removePlayer(message.playerId);
        break;
      case "error":
        break;
    }
    this.onEvent(message);
  }
}
