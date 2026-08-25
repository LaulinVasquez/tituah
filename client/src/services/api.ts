import { clientAuth } from "./firebase/firebaseClient.js";
import { apiBaseUrl } from "../config/runtime.js";

const REQUEST_TIMEOUT_MS = 12_000;

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = clientAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Game server did not respond (${apiBaseUrl() || "same-origin"}). Check VITE_API_URL / network.`,
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
