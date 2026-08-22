import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "tituah-fbd2a";
const KEY_FILENAME = "tituah-fbd2a-firebase-adminsdk-fbsvc-ca0d3ca3a5.json";

function resolveCredentialPath(): string | undefined {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const candidates = [
    path.resolve(process.cwd(), "../keys", KEY_FILENAME),
    path.resolve(process.cwd(), "../../keys", KEY_FILENAME),
    path.resolve(process.cwd(), "keys", KEY_FILENAME),
  ];
  return candidates.find((candidate) => existsSync(candidate));
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
