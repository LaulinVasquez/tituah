import { Capacitor } from "@capacitor/core";

/** Hosted backend used when Capacitor builds have no explicit VITE_* URLs. */
const NATIVE_API_DEFAULT = "https://staging.tituah.samirrodriguez.click";
const NATIVE_WS_DEFAULT = "wss://staging.tituah.samirrodriguez.click/ws";

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

export function apiBaseUrl(): string {
  const explicit = trimEnv(import.meta.env.VITE_API_URL);
  if (import.meta.env.DEV) return explicit ?? "http://localhost:8080";
  if (isNativeApp()) return explicit ?? NATIVE_API_DEFAULT;
  return explicit ?? "";
}

export function socketUrl(): string {
  const explicit = trimEnv(import.meta.env.VITE_WS_URL);
  if (import.meta.env.DEV) return explicit ?? "ws://localhost:8080/ws";
  if (isNativeApp()) return explicit ?? NATIVE_WS_DEFAULT;

  if (explicit) return explicit;
  const origin = normalizedOrigin();
  if (isLocalWebOrigin(origin)) {
    return `${origin?.protocol === "https:" ? "wss:" : "ws:"}//${origin?.host}/ws`;
  }
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
}

export function requireSocketUrl(): string {
  return socketUrl();
}

export function resolveAssetUrl(path: string): string {
  if (/^(https?:|capacitor:|ionic:|data:|blob:)/i.test(path)) {
    try {
      const url = new URL(path);
      // Vite can emit hostless capacitor://assets/... in WKWebView; force localhost.
      if ((url.protocol === "capacitor:" || url.protocol === "ionic:") && !url.hostname) {
        return `${url.protocol}//localhost${url.pathname}${url.search}${url.hash}`;
      }
      return path;
    } catch {
      return path;
    }
  }
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
