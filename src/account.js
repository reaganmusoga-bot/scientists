/* ============================================================
   SciPool UG — Account deletion
   Handles self-service account deletion with the option to
   anonymize research (keep certificates valid) or delete it.
   ============================================================ */

import {
  collection, query, where, getDocs, doc,
  deleteDoc, writeBatch, serverTimestamp
} from "firebase/firestore";
import {
  deleteUser, EmailAuthProvider, reauthenticateWithCredential,
  signOut as fbSignOut
} from "firebase/auth";
import { auth, db } from "./firebase.js";

/* ---------- Count what will be affected ---------- */
export async function countUserData(uid, email) {
  const q = query(collection(db, "innovations"), where("email", "==", email));
  const snap = await getDocs(q);
  return {
    submissionCount: snap.size,
    submissions: snap.docs.map(d => ({ id: d.id, title: d.data().title || "Untitled" }))
  };
}

/* ---------- Reauthenticate (required by Firebase for deletion) ---------- */
export async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("No signed-in user");

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

/* ---------- Anonymize submissions (keep them, strip identity) ---------- */
async function anonymizeSubmissions(email) {
  const q = query(collection(db, "innovations"), where("email", "==", email));
  const snap = await getDocs(q);

  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, {
      author: "Anonymous Researcher",
      email: "__deleted__",
      uid: null,
      anonymizedAt: serverTimestamp()
    });
  });
  await batch.commit();

  return snap.size;
}

/* ---------- Delete submissions entirely ---------- */
async function deleteSubmissions(email) {
  const q = query(collection(db, "innovations"), where("email", "==", email));
  const snap = await getDocs(q);

  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();

  return snap.size;
}

/* ---------- Full account deletion ---------- */
export async function deleteAccount({ password, keepSubmissions }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  await reauthenticate(password);

  const email = user.email;
  const uid = user.uid;

  let affected = 0;
  if (keepSubmissions) {
    affected = await anonymizeSubmissions(email);
  } else {
    affected = await deleteSubmissions(email);
  }

  try {
    await deleteDoc(doc(db, "users", uid));
  } catch (e) {
    console.warn("Could not delete user profile:", e);
  }

  await deleteUser(user);

  try { await fbSignOut(auth); } catch (e) { /* ignore */ }

  return { affected, kept: keepSubmissions };
}
