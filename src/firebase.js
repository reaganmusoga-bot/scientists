import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBDhB_f5p6l4K3JySlzcy696F_MthJQdfc",
  authDomain: "scipool-13d0c.firebaseapp.com",
  projectId: "scipool-13d0c",
  storageBucket: "scipool-13d0c.firebasestorage.app",
  messagingSenderId: "751643317619",
  appId: "1:751643317619:web:206c3074278d8da6e5e106",
  measurementId: "G-M113J5G4J7"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics only initializes where supported (avoids errors during build)
isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});
