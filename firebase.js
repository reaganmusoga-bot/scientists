// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDhB_f5p6l4K3JySLzcy696F_MthJQdfc",
  authDomain: "scipool-13d0c.firebaseapp.com",
  projectId: "scipool-13d0c",
  storageBucket: "scipool-13d0c.firebasestorage.app",
  messagingSenderId: "751643317619",
  appId: "1:751643317619:web:206c3074278d8da6e5e106",
  measurementId: "G-M113J5G4J7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services we will use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
