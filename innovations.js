// innovations.js
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  deleteDoc, 
  query, 
  orderBy,
  where 
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

import { db } from "./firebase.js";

// Add a new innovation
export async function addInnovation(data) {
  try {
    const docRef = await addDoc(collection(db, "innovations"), {
      ...data,
      createdAt: new Date().toISOString()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get all innovations
export async function getAllInnovations() {
  try {
    const q = query(collection(db, "innovations"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, data: list };
  } catch (error) {
    return { success: false, error: error.message, data: [] };
  }
}

// Get one innovation
export async function getInnovation(id) {
  try {
    const docSnap = await getDoc(doc(db, "innovations", id));
    if (docSnap.exists()) {
      return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
    } else {
      return { success: false, error: "Not found" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Delete innovation
export async function deleteInnovation(id) {
  try {
    await deleteDoc(doc(db, "innovations", id));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
