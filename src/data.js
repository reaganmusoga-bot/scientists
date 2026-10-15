import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, increment, onSnapshot, limit
} from "firebase/firestore";
import { db } from "./firebase.js";
import { uploadToCloudinary } from "./cloudinary.js";
import { computeSHA256FromDataURL } from "./hash.js";
import { generateCertificate } from "./certificate.js";

/* ============================================================
   Verification code generator
   Format: SPUG-XXXX-XXXX
   Alphabet excludes 0, 1, O, I, L to avoid reading ambiguity.
   ============================================================ */
function generateVerificationCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SPUG-${code.slice(0, 4)}-${code.slice(4)}`;
}

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

  // ---------- 1. Hash each file individually ----------
  const filesMeta = [];
  const individualHashes = [];

  if (mediaArray && mediaArray.length > 0) {
    for (const item of mediaArray) {
      let fileHash = "hash-unavailable";
      try {
        fileHash = await computeSHA256FromDataURL(item.data);
        individualHashes.push(fileHash);
      } catch (err) {
        console.warn(`Hash failed for ${item.name}:`, err);
      }
      filesMeta.push({
        name: item.name || "attachment",
        size: item.size || 0,
        type: item.type || "",
        hash: fileHash
      });
    }
  }

  // ---------- 2. Compute a master hash (concatenation of all file hashes) ----------
  let masterHash = "no-file";
  if (individualHashes.length > 0) {
    const concat = individualHashes.join("|");
    const bytes = new TextEncoder().encode(concat);
    const buffer = await crypto.subtle.digest("SHA-256", bytes);
    const arr = Array.from(new Uint8Array(buffer));
    masterHash = arr.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- 3. Generate the public verification code ----------
  const verificationCode = generateVerificationCode();

  // ---------- 4. Upload media to Cloudinary ----------
  const media = await uploadInnovationMedia(id, mediaArray);

  // ---------- 5. Save to Firestore ----------
  await setDoc(newDocRef, {
    ...payload,
    hash: masterHash,
    hashAlgorithm: "SHA-256",
    hashComputedAt: new Date().toISOString(),
    verificationCode,
    files: filesMeta,
    fileCount: filesMeta.length,
    media,
    uid: uid || null,
    status: "Submitted",
    adminStatus: "submitted",
    views: 0, saves: 0, contacted: 0,
    createdAt: serverTimestamp()
  });

  // ---------- 6. Generate the PDF certificate ----------
  try {
    const now = new Date();
    const issuedDate = now.toISOString().slice(0, 10);
    const shortId = id.slice(-6).toUpperCase();

    const primary = filesMeta[0] || { name: "—", size: 0 };

    generateCertificate({
      title: payload.title || "—",
      author: payload.author || "—",
      email: payload.email || "—",
      university: payload.university || "—",
      department: payload.course || "—",
      fileName: primary.name,
      fileSize: primary.size,
      hash: masterHash,
      verificationCode,
      timestampAnchor: "SciPool UG Server Timestamp",
      anchoredAt: now.toISOString(),
      submissionId: id,
      verifyUrl: `https://scientists-mocha.vercel.app/verify?code=${verificationCode}`,
      issuedAt: now.toISOString(),
      certificateId: `CERT-${issuedDate}-${shortId}`
    });
  } catch (certErr) {
    console.warn("Certificate generation failed:", certErr);
  }

  return id;
}

export async function deleteInnovation(itemId) {
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
  // status: "active" | "pending" | "submitted" | "rejected" | "archived"
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
