import { startGameServer } from "./ws-server.js";

const port = Number(process.env.PORT ?? 8080);
startGameServer(port);
