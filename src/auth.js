import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase.js";

export async function uploadAvatar(uid, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const r = ref(storage, `avatars/${uid}/profile.jpg`);
  await uploadBytes(r, blob, { contentType: blob.type || "image/jpeg" });
  return await getDownloadURL(r);
}

export async function signUpUser({
  email, password, name, phone, district, gender, role, profile, avatarDataUrl
}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  let avatarUrl = null;
  if (avatarDataUrl) avatarUrl = await uploadAvatar(uid, avatarDataUrl);

  await setDoc(doc(db, "users", uid), {
    uid, name, email, phone, district, gender,
    role, profile, avatarUrl,
    joinedAt: serverTimestamp()
  });

  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

export async function signInUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  return await fbSignOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function sendResetEmail(email) {
  return await sendPasswordResetEmail(auth, email);
}
