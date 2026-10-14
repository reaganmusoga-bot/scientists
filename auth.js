// auth.js
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

// ================= SIGN UP =================
export async function firebaseSignUp(email, password, name, role, extraProfile = {}) {
  try {
    // 1. Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Update display name
    await updateProfile(user, { displayName: name });

    // 3. Save extra info in Firestore
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: name,
      email: email,
      role: role,
      profile: extraProfile,
      createdAt: new Date().toISOString()
    });

    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ================= SIGN IN =================
export async function firebaseSignIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ================= SIGN OUT =================
export async function firebaseSignOut() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ================= GET CURRENT USER DATA =================
export async function getCurrentUserData() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
          resolve({ ...docSnap.data(), uid: user.uid });
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}
