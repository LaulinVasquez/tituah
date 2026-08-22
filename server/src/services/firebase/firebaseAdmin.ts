import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "tituah-fbd2a";
const KEY_FILENAME = "tituah-fbd2a-firebase-adminsdk-fbsvc-ca0d3ca3a5.json";

function existingFile(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  return existsSync(candidate) ? candidate : undefined;
}

function findKeyWalkingUp(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const found = existingFile(path.join(current, "keys", KEY_FILENAME));
    if (found) return found;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function resolveCredentialPath(): string | undefined {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv) {
    const absolute = path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
    const found = existingFile(absolute);
    if (found) return found;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  return (
    findKeyWalkingUp(here) ??
    findKeyWalkingUp(process.cwd()) ??
    existingFile(path.join(os.homedir(), "keys", KEY_FILENAME))
  );
}

function createApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const credentialPath = resolveCredentialPath();
  if (!credentialPath) {
    throw new Error(
      "Firebase Admin credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or place the service account JSON in ../keys.",
    );
  }

  const serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8")) as Record<string, string>;
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: PROJECT_ID,
  });
}

let app: App | undefined;

export function getFirebaseAdminApp(): App {
  app ??= createApp();
  return app;
}

export function adminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

export async function verifyIdToken(idToken: string) {
  return adminAuth().verifyIdToken(idToken);
}
