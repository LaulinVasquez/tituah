import { parseClientMessage } from "@tituah/shared";
import type { MatchManager } from "./match-manager.js";
import type { Session } from "./session.js";

export class MessageHandler {
  constructor(private readonly matches: MatchManager) {}

  async handle(session: Session, raw: string): Promise<void> {
    const message = parseClientMessage(raw);
    if (!message) return;
    session.markSeen();

    switch (message.type) {
      case "join":
        try {
          await this.matches.join(
            session,
            message.name,
            message.idToken,
            message.stageId,
            message.playerCount,
          );
        } catch (error) {
          const text = error instanceof Error ? error.message : "Join failed";
          session.socket.send(
            JSON.stringify({
              type: "error",
              code: "join_failed",
              message: text,
            }),
          );
        }
        break;
      case "input":
        this.matches.handleInput(session, message.input);
        break;
      case "attack_start":
        this.matches.startAttack(session);
        break;
      case "attack_release":
        this.matches.releaseAttack(session);
        break;
      case "throw":
        this.matches.throw(session);
        break;
      case "running_four_slap":
        this.matches.runningFourSlap(session);
        break;
      case "ready":
        this.matches.ready(session);
        break;
    }
  }
}
