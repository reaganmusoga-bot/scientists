import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, onSnapshot, limit
} from "firebase/firestore";
import { db } from "./firebase.js";
import { getUserByEmail } from "./data.js";

export function convIdFor(a, b) {
  return [a, b].sort().join("::");
}

export async function ensureConversation(emailA, emailB) {
  const id = convIdFor(emailA, emailB);
  const r = doc(db, "conversations", id);
  const snap = await getDoc(r);
  if (!snap.exists()) {
    await setDoc(r, {
      participants: [emailA, emailB],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      readBy: { [emailA]: serverTimestamp(), [emailB]: serverTimestamp() }
    });
  }
  return id;
}

export async function sendMessage(fromEmail, toEmail, text) {
  if (!text?.trim()) return;
  const convId = await ensureConversation(fromEmail, toEmail);
  await addDoc(collection(db, "conversations", convId, "messages"), {
    from: fromEmail, to: toEmail,
    text: text.trim(),
    sentAt: serverTimestamp(),
    read: false
  });
  await updateDoc(doc(db, "conversations", convId), {
    lastMessageAt: serverTimestamp(),
    [`readBy.${fromEmail}`]: serverTimestamp()
  });
}

export function subscribeConversations(myEmail, cb) {
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", myEmail)
  );
  return onSnapshot(q, async snap => {
    const out = [];
    for (const d of snap.docs) {
      const c = d.data();
      const otherEmail = c.participants.find(p => p !== myEmail);
      const otherUser = await getUserByEmail(otherEmail);

      const lastSnap = await getDocs(query(
        collection(db, "conversations", d.id, "messages"),
        orderBy("sentAt", "desc"), limit(1)
      ));
      const lastMessage = lastSnap.empty ? null : lastSnap.docs[0].data();

      const unreadSnap = await getDocs(query(
        collection(db, "conversations", d.id, "messages"),
        where("to", "==", myEmail), where("read", "==", false)
      ));

      out.push({
        convId: d.id, otherEmail, otherUser,
        lastMessage,
        lastMessageAt: c.lastMessageAt?.toDate?.() || new Date(),
        unread: unreadSnap.size
      });
    }
    out.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    cb(out);
  }, err => console.warn("subscribeConversations error", err));
}

export function subscribeThread(convId, cb) {
  const q = query(
    collection(db, "conversations", convId, "messages"),
    orderBy("sentAt")
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function markThreadRead(convId, myEmail) {
  const msgs = await getDocs(query(
    collection(db, "conversations", convId, "messages"),
    where("to", "==", myEmail), where("read", "==", false)
  ));
  for (const m of msgs.docs) {
    await updateDoc(m.ref, { read: true });
  }
}

export async function deleteConversation(convId) {
  const msgs = await getDocs(collection(db, "conversations", convId, "messages"));
  for (const m of msgs.docs) await m.ref.delete();
  await doc(db, "conversations", convId).delete();
}

export function subscribeUnreadCount(myEmail, cb) {
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", myEmail)
  );
  return onSnapshot(q, async snap => {
    let total = 0;
    for (const d of snap.docs) {
      const u = await getDocs(query(
        collection(db, "conversations", d.id, "messages"),
        where("to", "==", myEmail), where("read", "==", false)
      ));
      total += u.size;
    }
    cb(total);
  });
}
