import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment, onSnapshot, limit
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase.js";

/* ---------- Innovations ---------- */

export async function loadInnovations() {
  const q = query(collection(db, "innovations"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeInnovations(cb) {
  const q = query(collection(db, "innovations"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.warn("subscribeInnovations error", err));
}

async function uploadInnovationMedia(itemId, mediaArray) {
  const uploaded = [];
  for (const m of mediaArray) {
    const blob = await (await fetch(m.data)).blob();
    const path = `innovations/${itemId}/${Date.now()}-${m.name}`;
    const r = ref(storage, path);
    await uploadBytes(r, blob, { contentType: m.type || "application/octet-stream" });
    const url = await getDownloadURL(r);
    uploaded.push({ url, name: m.name, size: m.size, type: m.type, path });
  }
  return uploaded;
}

export async function createInnovation(payload, mediaArray, uid) {
  const collRef = collection(db, "innovations");
  const newDocRef = doc(collRef);
  const id = newDocRef.id;

  const media = await uploadInnovationMedia(id, mediaArray);

  await setDoc(newDocRef, {
    ...payload,
    media,
    uid: uid || null,
    status: "Submitted",
    views: 0, saves: 0, contacted: 0,
    createdAt: serverTimestamp()
  });
  return id;
}

export async function deleteInnovation(itemId, media = []) {
  for (const m of media) {
    if (m.path) {
      try { await deleteObject(ref(storage, m.path)); } catch (e) { /* ignore */ }
    }
  }
  await deleteDoc(doc(db, "innovations", itemId));
}

export async function trackStat(itemId, field) {
  try {
    await updateDoc(doc(db, "innovations", itemId), { [field]: increment(1) });
  } catch (e) { console.warn("trackStat failed", e); }
}

/* ---------- Saved / Shortlist ---------- */

export async function loadSaved(uid) {
  const snap = await getDocs(collection(db, "users", uid, "saved"));
  return snap.docs.map(d => d.id);
}

export function subscribeSaved(uid, cb) {
  return onSnapshot(collection(db, "users", uid, "saved"), snap => {
    cb(snap.docs.map(d => d.id));
  });
}

export async function addSaved(uid, itemId) {
  await setDoc(doc(db, "users", uid, "saved", itemId), { savedAt: serverTimestamp() });
  await trackStat(itemId, "saves");
}

export async function removeSaved(uid, itemId) {
  await deleteDoc(doc(db, "users", uid, "saved", itemId));
  try {
    await updateDoc(doc(db, "innovations", itemId), { saves: increment(-1) });
  } catch (e) { /* ignore */ }
}

/* ---------- Users directory ---------- */

export async function listUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => d.data());
}

export async function getUserByEmail(email) {
  const q = query(collection(db, "users"), where("email", "==", email), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}
