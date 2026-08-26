import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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

export function getFirebaseApp(): FirebaseApp {
  app ??= initializeApp(firebaseConfig);
  return app;
}

export function clientAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function clientDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
