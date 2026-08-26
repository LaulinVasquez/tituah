import { clientAuth } from "./firebase/firebaseClient.js";

function apiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.DEV) return "http://localhost:8080";
  return "";
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = clientAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
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
}
