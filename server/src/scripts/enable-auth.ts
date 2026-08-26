import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "tituah-fbd2a";
const KEY_FILENAME = "tituah-fbd2a-firebase-adminsdk-fbsvc-ca0d3ca3a5.json";

function serviceAccountPath(): string | undefined {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const candidates = [
    path.resolve(process.cwd(), "../keys", KEY_FILENAME),
    path.resolve(process.cwd(), "../../keys", KEY_FILENAME),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function tokenFromFirebaseCli(): Promise<string | null> {
  try {
    const require = createRequire(import.meta.url);
    const toolsRoot = "/opt/homebrew/lib/node_modules/firebase-tools/lib";
    const { requireAuth } = require(`${toolsRoot}/requireAuth.js`) as {
      requireAuth: (options: Record<string, unknown>) => Promise<unknown>;
    };
    const apiv2 = require(`${toolsRoot}/apiv2.js`) as {
      getAccessToken: () => Promise<string>;
    };
    await requireAuth({ project: PROJECT_ID, projectId: PROJECT_ID });
    return apiv2.getAccessToken();
  } catch (error) {
    console.log(
      `Firebase CLI auth unavailable: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

async function tokenFromServiceAccount(): Promise<string | null> {
  const keyFile = serviceAccountPath();
  if (!keyFile) return null;
  const auth = new GoogleAuth({
    keyFile,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/firebase",
    ],
  });
  const token = await (await auth.getClient()).getAccessToken();
  return token.token ?? null;
}

async function main(): Promise<void> {
  const token = (await tokenFromFirebaseCli()) ?? (await tokenFromServiceAccount());
  if (!token) throw new Error("Could not obtain Google access token");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const enable = await fetch(
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/identitytoolkit.googleapis.com:enable`,
    { method: "POST", headers },
  );
  console.log(`Enable Identity Toolkit API: ${enable.status}`);

  const initialize = await fetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`,
    { method: "POST", headers },
  );
  console.log(`Initialize Auth: ${initialize.status} ${await initialize.text()}`);

  const config = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email,signIn.anonymous`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        signIn: {
          email: { enabled: true, passwordRequired: true },
          anonymous: { enabled: true },
        },
      }),
    },
  );
  const configBody = await config.json() as {
    signIn?: { email?: { enabled?: boolean }; anonymous?: { enabled?: boolean } };
    error?: { message?: string };
  };
  if (!config.ok) {
    throw new Error(`Auth config failed: ${config.status} ${configBody.error?.message ?? ""}`);
  }
  console.log(
    `Email/password: ${configBody.signIn?.email?.enabled === true ? "enabled" : "unknown"}`,
  );
  console.log(
    `Anonymous: ${configBody.signIn?.anonymous?.enabled === true ? "enabled" : "unknown"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
