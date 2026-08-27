import type { IncomingMessage, ServerResponse } from "node:http";
import { isFighterColor, isThrowableId, SPRITE_ASSET_IDS, type ItemSlot } from "@tituah/shared";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { itemsRepository } from "../repositories/items.repository.js";
import {
  createCatalogItem,
  createUserProfile,
  equipItem,
  getUserProfile,
  grantItemToUser,
  removeItemFromUser,
  unequipItem,
  updateCatalogItem,
} from "../services/firebase/game-data.js";
import { verifyIdToken } from "../services/firebase/firebaseAdmin.js";

const CORS_ORIGINS = new Set([
  "capacitor://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "ionic://localhost",
  "https://staging.tituah.samirrodriguez.click",
]);

interface AuthedUser {
  uid: string;
  email?: string;
  name?: string;
  admin: boolean;
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  try {
    const body = await readJson(req);
    const user = await optionalAuth(req);

    if (req.method === "POST" && url.pathname === "/api/session/ensure") {
      const tokenUser = user ?? (await requireAuth(req));
      const profile = await createUserProfile(tokenUser.uid, {
        displayName: stringField(body, "displayName") ?? tokenUser.name,
        username: stringField(body, "username"),
      });
      json(res, 200, { profile });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const tokenUser = await requireAuth(req, user);
      const profile = await getUserProfile(tokenUser.uid);
      json(res, 200, { profile });
      return true;
    }

    if (req.method === "PATCH" && url.pathname === "/api/me") {
      const tokenUser = await requireAuth(req, user);
      const profile = await createUserProfile(tokenUser.uid, {
        displayName: stringField(body, "displayName"),
        username: stringField(body, "username"),
      });
      const requestedColor = stringField(body, "baseAvatarId");
      if (requestedColor && !isFighterColor(requestedColor)) {
        throw new Error("Invalid fighter color");
      }
      const requestedThrowable = stringField(body, "throwableId");
      if (requestedThrowable && !isThrowableId(requestedThrowable)) {
        throw new Error("Invalid throwable");
      }
      const hasFaceAccessory = Object.prototype.hasOwnProperty.call(body, "faceAccessoryId");
      const requestedFace =
        hasFaceAccessory && (body as { faceAccessoryId?: unknown }).faceAccessoryId === null
          ? null
          : stringField(body, "faceAccessoryId");
      if (
        requestedFace != null &&
        requestedFace !== SPRITE_ASSET_IDS.sunglasses
      ) {
        throw new Error("Invalid face accessory");
      }
      const { usersRepository } = await import("../repositories/users.repository.js");
      await usersRepository.updateSafeProfile(tokenUser.uid, {
        displayName: stringField(body, "displayName") ?? profile.displayName,
        username: stringField(body, "username") ?? profile.username,
        baseAvatarId: requestedColor,
        throwableId: requestedThrowable,
        ...(hasFaceAccessory ? { faceAccessoryId: requestedFace } : {}),
      });
      json(res, 200, { profile: await getUserProfile(tokenUser.uid) });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/items") {
      await requireAuth(req, user);
      json(res, 200, { items: await itemsRepository.listEnabled() });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/me/inventory") {
      const tokenUser = await requireAuth(req, user);
      json(res, 200, { inventory: await inventoryRepository.list(tokenUser.uid) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/avatar/equip") {
      const tokenUser = await requireAuth(req, user);
      const itemId = requiredString(body, "itemId");
      const avatar = await equipItem(tokenUser.uid, itemId);
      json(res, 200, { avatar });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/avatar/unequip") {
      const tokenUser = await requireAuth(req, user);
      const slot = requiredString(body, "slot") as ItemSlot;
      const avatar = await unequipItem(tokenUser.uid, slot);
      json(res, 200, { avatar });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/items") {
      const tokenUser = await requireAdmin(req, user);
      void tokenUser;
      const item = await createCatalogItem(body as Parameters<typeof createCatalogItem>[0]);
      json(res, 200, { item });
      return true;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/items/")) {
      const tokenUser = await requireAdmin(req, user);
      void tokenUser;
      const itemId = url.pathname.slice("/api/admin/items/".length);
      await updateCatalogItem(itemId, body as Parameters<typeof updateCatalogItem>[1]);
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/grant") {
      await requireAdmin(req, user);
      const uid = requiredString(body, "uid");
      const itemId = requiredString(body, "itemId");
      const granted = await grantItemToUser(uid, itemId, "admin");
      json(res, 200, { granted });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/revoke") {
      await requireAdmin(req, user);
      await removeItemFromUser(requiredString(body, "uid"), requiredString(body, "itemId"));
      json(res, 200, { ok: true });
      return true;
    }

    json(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = message === "Unauthorized" || message === "Admin only" ? 401 : 400;
    json(res, status, { error: message });
  }
  return true;
}

function isAllowedOrigin(origin: string): boolean {
  if (CORS_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      (protocol === "http:" || protocol === "https:" || protocol === "capacitor:" || protocol === "ionic:")
    );
  } catch {
    return false;
  }
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
}

async function optionalAuth(req: IncomingMessage): Promise<AuthedUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return loadUser(header.slice("Bearer ".length));
}

async function requireAuth(req: IncomingMessage, user?: AuthedUser | null): Promise<AuthedUser> {
  if (user) return user;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return loadUser(header.slice("Bearer ".length));
}

async function requireAdmin(req: IncomingMessage, user?: AuthedUser | null): Promise<AuthedUser> {
  const tokenUser = await requireAuth(req, user);
  if (!tokenUser.admin) throw new Error("Admin only");
  return tokenUser;
}

async function loadUser(idToken: string): Promise<AuthedUser> {
  const decoded = await verifyIdToken(idToken);
  const profile = await getUserProfile(decoded.uid);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    admin: profile?.role === "admin",
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === "GET" || req.method === "OPTIONS") return {};
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
