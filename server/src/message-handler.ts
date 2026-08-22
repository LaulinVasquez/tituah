import { parseClientMessage } from "@tituah/shared";
import type { MatchManager } from "./match-manager.js";
import type { Session } from "./session.js";

export class MessageHandler {
  constructor(private readonly matches: MatchManager) {}

  handle(session: Session, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) return;
    session.markSeen();

    switch (message.type) {
      case "join":
        this.matches.join(session, message.name);
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
    }
  }
}
