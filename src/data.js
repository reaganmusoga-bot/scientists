import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment, onSnapshot, limit
} from "firebase/firestore";
import { db } from "./firebase.js";
import { uploadToCloudinary } from "./cloudinary.js";
import { computeSHA256FromDataURL } from "./hash.js";
import { generateCertificate } from "./certificate.js";

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
    // m.data is a base64 data URL from the file input
    const blob = await (await fetch(m.data)).blob();
    const file = new File([blob], m.name, { type: m.type || "application/octet-stream" });
    const result = await uploadToCloudinary(file);
    uploaded.push({
      url: result.url,
      publicId: result.publicId,
      name: result.name,
      size: result.size,
      type: result.type,
      provider: "cloudinary"
    });
  }
  return uploaded;
}

export async function createInnovation(payload, mediaArray, uid) {
  const collRef = collection(db, "innovations");
  const newDocRef = doc(collRef);
  const id = newDocRef.id;

  // ---------- 1. Compute SHA-256 hash of the primary file (before upload) ----------
  let computedHash = "no-file";
  let primaryFileMeta = { name: "—", size: 0 };

  if (mediaArray && mediaArray.length > 0) {
    const primary = mediaArray[0];
    try {
      computedHash = await computeSHA256FromDataURL(primary.data);
      primaryFileMeta = {
        name: primary.name || "attachment",
        size: primary.size || 0
      };
    } catch (hashErr) {
      console.warn("SHA-256 computation failed:", hashErr);
      computedHash = "hash-unavailable";
    }
  }

  // ---------- 2. Upload media to Cloudinary ----------
  const media = await uploadInnovationMedia(id, mediaArray);

  // ---------- 3. Save to Firestore with hash fields attached ----------
  await setDoc(newDocRef, {
    ...payload,
    hash: computedHash,
    hashAlgorithm: "SHA-256",
    hashComputedAt: new Date().toISOString(),
    media,
    uid: uid || null,
    status: "Submitted",
    views: 0, saves: 0, contacted: 0,
    createdAt: serverTimestamp()
  });

  // ---------- 4. Generate and download the certificate ----------
  try {
    const now = new Date();
    const issuedDate = now.toISOString().slice(0, 10);
    const shortId = id.slice(-6).toUpperCase();

    generateCertificate({
      title: payload.title || "—",
      author: payload.author || "—",
      email: payload.email || "—",
      university: payload.university || "—",
      department: payload.course || "—",
      fileName: primaryFileMeta.name,
      fileSize: primaryFileMeta.size,
      hash: computedHash,
      timestampAnchor: "SciPool UG Server Timestamp",
      anchoredAt: now.toISOString(),
      submissionId: id,
      verifyUrl: `https://scientists-mocha.vercel.app/verify/${id}`,
      issuedAt: now.toISOString(),
      certificateId: `CERT-${issuedDate}-${shortId}`
    });
  } catch (certErr) {
    // Non-fatal — the submission is already saved
    console.warn("Certificate generation failed:", certErr);
  }

  return id;
}

export async function deleteInnovation(itemId) {
  // Cloudinary files are not auto-deleted here (would require a signed API call).
  // If you want cleanup later, add a Cloudinary destroy call via a Cloud Function.
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
/* ---------- Admin: innovations ---------- */

export async function setFeatured(itemId, featured) {
  await updateDoc(doc(db, "innovations", itemId), {
    featured: !!featured,
    featuredAt: featured ? serverTimestamp() : null
  });
}

export async function setEditorPick(itemId, editorPick) {
  await updateDoc(doc(db, "innovations", itemId), {
    editorPick: !!editorPick,
    editorPickAt: editorPick ? serverTimestamp() : null
  });
}

export async function setAdminStatus(itemId, status) {
  // status: "active" | "pending" | "rejected" | "archived"
  await updateDoc(doc(db, "innovations", itemId), { adminStatus: status });
}

export async function setAdminNotes(itemId, notes) {
  await updateDoc(doc(db, "innovations", itemId), { adminNotes: String(notes || "") });
}

export async function getInnovationsByAuthor(email) {
  const q = query(collection(db, "innovations"), where("email", "==", email));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ---------- Admin: users ---------- */

export async function verifyUser(uid, verified) {
  await updateDoc(doc(db, "users", uid), { verified: !!verified });
}

export async function featureUser(uid, featured) {
  await updateDoc(doc(db, "users", uid), {
    featured: !!featured,
    featuredAt: featured ? serverTimestamp() : null
  });
}

export async function suspendUser(uid, suspended) {
  await updateDoc(doc(db, "users", uid), { suspended: !!suspended });
}

export async function setUserAdminNotes(uid, notes) {
  await updateDoc(doc(db, "users", uid), { adminNotes: String(notes || "") });
}

export async function listAllUsersWithStats() {
  const usersSnap = await getDocs(collection(db, "users"));
  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
  const innovSnap = await getDocs(collection(db, "innovations"));
  const innovs = innovSnap.docs.map(d => d.data());
  return users.map(u => {
    const mine = innovs.filter(i => i.email === u.email);
    return {
      ...u,
      submissionCount: mine.length,
      avgTrl: mine.length ? (mine.reduce((s, i) => s + (i.trl || 0), 0) / mine.length).toFixed(1) : "–",
      lastSubmission: mine.length
        ? mine.map(i => i.createdAt?.toDate?.() || new Date(0)).sort((a, b) => b - a)[0]
        : null
    };
  }).sort((a, b) => b.submissionCount - a.submissionCount);
}
