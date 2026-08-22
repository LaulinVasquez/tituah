import { WebSocketServer, type WebSocket } from "ws";
import { MatchManager } from "./match-manager.js";
import { MessageHandler } from "./message-handler.js";
import { Session } from "./session.js";

export function startGameServer(port = 8080): WebSocketServer {
  const matches = new MatchManager();
  const messages = new MessageHandler(matches);
  const sessions = new Map<WebSocket, Session>();

  const server = new WebSocketServer({ port });
  matches.start();

  server.on("connection", (socket) => {
    const session = new Session(crypto.randomUUID(), socket);
    sessions.set(socket, session);

    socket.on("message", (data) => {
      messages.handle(session, data.toString());
    });

    socket.on("close", () => {
      matches.leave(session);
      sessions.delete(socket);
    });

    socket.on("error", () => {
      matches.leave(session);
      sessions.delete(socket);
    });
  });

  console.log(`Tituah game server listening on ws://localhost:${port}`);
  return server;
}
