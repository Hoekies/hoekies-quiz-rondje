import { initializeApp, getApps } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use experimentalForceLongPolling on iOS.
// iOS Safari (and Chrome-on-iOS, which uses WebKit) aggressively throttles
// WebSocket connections inside browser tabs — causing 30-second delays on
// real-time Firestore updates. Long-polling uses plain HTTP requests, which
// are not subject to the same iOS background-connection throttling, giving
// near-instant updates on iPhone.
//
// initializeFirestore must only be called once per Firebase app instance.
// With Next.js the module is cached, but during hot-reload in development
// the same app instance may already have a Firestore attached — catch that.
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
} catch {
  db = getFirestore(app);
}
export { db };
export const auth = getAuth(app);
export const storage = getStorage(app);
