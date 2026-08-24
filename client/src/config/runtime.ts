import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedOrigin(): URL | null {
  try {
    return new URL(window.location.origin);
  } catch {
    return null;
  }
}

function isLocalWebOrigin(origin: URL | null): boolean {
  if (!origin) return false;
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;
  return origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
}

function ensureEndpoint(name: "VITE_API_URL" | "VITE_WS_URL", value: string | undefined): string {
  if (value) return value;
  throw new Error(`${name} is required when running Tituah inside Capacitor.`);
}

function nativeEndpoint(name: "VITE_API_URL" | "VITE_WS_URL"): string | null {
  const explicit = trimEnv(import.meta.env[name]);
  return explicit ?? null;
}

export function apiBaseUrl(): string {
  const explicit = trimEnv(import.meta.env.VITE_API_URL);
  if (import.meta.env.DEV) return explicit ?? "http://localhost:8080";
  if (isNativeApp()) return ensureEndpoint("VITE_API_URL", explicit);
  return explicit ?? "";
}

export function socketUrl(): string {
  const explicit = trimEnv(import.meta.env.VITE_WS_URL);
  if (import.meta.env.DEV) return explicit ?? "ws://localhost:8080/ws";
  if (isNativeApp()) return nativeEndpoint("VITE_WS_URL") ?? "";

  if (explicit) return explicit;
  const origin = normalizedOrigin();
  if (isLocalWebOrigin(origin)) {
    return `${origin?.protocol === "https:" ? "wss:" : "ws:"}//${origin?.host}/ws`;
  }
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
}

export function requireSocketUrl(): string {
  const url = socketUrl();
  if (url) return url;
  return ensureEndpoint("VITE_WS_URL", undefined);
}

export function resolveAssetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  try {
    return new URL(normalized, `${window.location.origin}/`).toString();
  } catch {
    return path.startsWith("/") ? path : `/${normalized}`;
  }
}

export function prefersNativeTapHandling(): boolean {
  return isNativeApp() || navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches;
}

export function shouldUseNativeSafeArea(): boolean {
  return isNativeApp();
}
