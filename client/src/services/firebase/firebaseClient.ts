import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { isNativeApp } from "../../config/runtime.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyBgBaqIVIbvbLMyBOYqg_OnO9sGAVixprU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "tituah-fbd2a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "tituah-fbd2a",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "tituah-fbd2a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "965364014807",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:965364014807:web:6b6854eb80f974311c1a92",
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  app ??= initializeApp(firebaseConfig);
  return app;
}

export function clientAuth(): Auth {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  if (isNativeApp()) {
    try {
      // Capacitor/WKWebView needs explicit persistence; getAuth() alone can stall sign-in.
      auth = initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence });
      return auth;
    } catch {
      // Already initialized in this JS context.
    }
  }
  auth = getAuth(firebaseApp);
  return auth;
}

export function clientDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
