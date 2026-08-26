import type { ClientMessage, ServerMessage } from "@tituah/shared";
import { parseServerMessage } from "@tituah/shared";

function defaultSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV) return "ws://localhost:8080/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const DEFAULT_URL = defaultSocketUrl();

export class GameSocket {
  private socket: WebSocket | null = null;
  private generation = 0;
  private readonly url: string;
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private readonly openListeners = new Set<() => void>();
  private readonly closeListeners = new Set<() => void>();

  constructor(url = DEFAULT_URL) {
    this.url = url;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.disconnect();
    const generation = this.generation;
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (generation !== this.generation) return;
      for (const listener of this.openListeners) listener();
    });

    socket.addEventListener("message", (event) => {
      if (generation !== this.generation) return;
      const message = parseServerMessage(String(event.data));
      if (!message) return;
      for (const listener of this.listeners) listener(message);
    });

    socket.addEventListener("close", () => {
      if (generation !== this.generation) return;
      for (const listener of this.closeListeners) listener();
    });
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  disconnect(): void {
    this.generation += 1;
    this.socket?.close();
    this.socket = null;
  }

  reconnect(): void {
    this.connect();
  }
}
