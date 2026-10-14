/* ============================================================
   SciPool UG — App Entry
   Progressive migration. This file will grow as we port UI.
   ============================================================ */

import {
  signUpUser, signInUser, signOutUser, onAuth,
  getUserProfile, sendResetEmail
} from "./auth.js";
import {
  subscribeInnovations, createInnovation, deleteInnovation,
  trackStat, subscribeSaved, addSaved, removeSaved,
  listUsers, getUserByEmail
} from "./data.js";
import {
  sendMessage, subscribeConversations, subscribeThread,
  markThreadRead, deleteConversation, subscribeUnreadCount,
  convIdFor, ensureConversation
} from "./messages.js";

/* ============================================================
   STATE
   ============================================================ */

let DB = [];                 // innovations cache
let SAVED_CACHE = [];        // saved innovation ids
let CURRENT_USER = null;     // Firestore user profile
let USERS_CACHE = [];        // all users (avatars, lookups)

let unsubConv = null;
let unsubThread = null;
let unsubUnread = null;
let unsubSaved = null;

let activeConvId = null;
let activeOtherEmail = null;

/* ============================================================
   BOOTSTRAP
   ============================================================ */

window.addEventListener("firebase-ready", () => {
  console.log("SciPool: Firebase ready, starting auth listener");

  onAuth(async (fbUser) => {
    if (fbUser) {
      console.log("SciPool: signed in as", fbUser.email);
      const profile = await getUserProfile(fbUser.uid);
      CURRENT_USER = profile;

      if (CURRENT_USER) {
        if (unsubSaved) unsubSaved();
        unsubSaved = subscribeSaved(CURRENT_USER.uid, ids => {
          SAVED_CACHE = ids;
          console.log("SciPool: saved list", SAVED_CACHE);
        });

        if (unsubUnread) unsubUnread();
        unsubUnread = subscribeUnreadCount(CURRENT_USER.email, total => {
          console.log("SciPool: unread messages", total);
          applyUnreadBadge(total);
        });

        USERS_CACHE = await listUsers();
      }
    } else {
      console.log("SciPool: signed out");
      CURRENT_USER = null;
      SAVED_CACHE = [];
      if (unsubSaved) { unsubSaved(); unsubSaved = null; }
      if (unsubUnread) { unsubUnread(); unsubUnread = null; }
    }
    updateAuthUI();
  });

  // Live innovations from Firestore
  subscribeInnovations(items => {
    DB = items;
    console.log("SciPool: innovations loaded", DB.length);
    paintHome();
    paintStats();
  });
});

/* ============================================================
   MINIMAL UI PAINTERS (placeholder until full UI ported)
   ============================================================ */

function paintStats() {
  const total = DB.length;
  const unis = new Set(DB.map(d => d.university)).size;
  const sectors = new Set(DB.map(d => d.sector)).size;
  const prot = DB.filter(d => d.hash).length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("snap-total", total);
  set("snap-universities", unis);
  set("snap-sectors", sectors);
  set("snap-protected", prot);
}

function paintHome() {
  const el = document.getElementById("home-featured");
  if (!el) return;
  if (!DB.length) {
    el.innerHTML = '<div class="empty"><span class="icon">🔬</span><p>No innovations yet.</p></div>';
    return;
  }
  el.innerHTML = DB.slice(0, 6).map(item => `
    <div class="card">
      <span class="tag yellow">${escapeHtml(item.sector || "")}</span>
      <h4>${escapeHtml(item.title || "")}</h4>
      <div class="meta"><strong>${escapeHtml(item.author || "")}</strong> from ${escapeHtml(item.university || "")}</div>
      <div class="abstract">${escapeHtml((item.abstract || "").slice(0, 140))}…</div>
      <div class="footer">
        <span class="badge-trl">TRL ${item.trl || "?"}</span>
        <span>${item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString("en-GB") : ""}</span>
      </div>
    </div>
  `).join("");
}

function updateAuthUI() {
  const btn = document.getElementById("open-auth");
  if (btn) btn.textContent = CURRENT_USER ? `Hi, ${CURRENT_USER.name.split(" ")[0]}` : "Sign In or Sign Up";
  document.body.classList.toggle("logged-in", !!CURRENT_USER);
}

function applyUnreadBadge(total) {
  const navBadge = document.getElementById("nav-msg-badge");
  const mobileBadge = document.getElementById("mobile-msg-badge");
  const hamburgerBadge = document.getElementById("hamburger-badge");
  [navBadge, mobileBadge].forEach(b => {
    if (b) {
      if (total > 0) { b.textContent = total > 9 ? "9+" : total; b.style.display = "inline-flex"; }
      else b.style.display = "none";
    }
  });
  if (hamburgerBadge) {
    if (total > 0) { hamburgerBadge.textContent = total > 9 ? "9+" : total; hamburgerBadge.classList.add("active"); }
    else hamburgerBadge.classList.remove("active");
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

// Expose a few things for inline onclick handlers in HTML
window.SciPool = {
  get state() { return { DB, SAVED_CACHE, CURRENT_USER, USERS_CACHE }; },
  signOut: async () => { await signOutUser(); },
  escapeHtml
};

console.log("SciPool: app.js loaded");
