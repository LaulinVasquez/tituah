import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { handleApiRequest } from "./http/api.js";
import { MatchManager } from "./match-manager.js";
import { MessageHandler } from "./message-handler.js";
import { Session } from "./session.js";

export function startGameServer(port = 8080): { close: () => void } {
  const matches = new MatchManager();
  const messages = new MessageHandler(matches);
  const sessions = new Map<WebSocket, Session>();

  const httpServer = createServer((req, res) => {
    void handleApiRequest(req, res).then((handled) => {
      if (handled) return;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("tituah");
    });
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  matches.start();

  wss.on("connection", (socket) => {
    const session = new Session(crypto.randomUUID(), socket);
    sessions.set(socket, session);

    socket.on("message", (data) => {
      void messages.handle(session, data.toString());
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

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Free it with: lsof -ti :${port} | xargs kill -9`,
      );
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(port, () => {
    console.log(`Tituah game server listening on http://localhost:${port}`);
    console.log(`WebSocket path ws://localhost:${port}/ws`);
  });

  return {
    close: () => {
      matches.stop();
      wss.close();
      httpServer.close();
    },
  };
}
