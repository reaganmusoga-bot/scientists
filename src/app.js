/* ============================================================
   SciPool UG — Full Application Logic
   Migrated from inline <script> to Firebase-aware modules.
   Includes: admin dashboard wiring, featured system.
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
  markThreadRead, deleteConversation, subscribeUnreadCount
} from "./messages.js";
import {
  isAdmin, renderAdminDashboard, setAdminInnovations
} from "./admin.js";

/* ============================================================
   CONSTANTS
   ============================================================ */

const UNIVERSITIES = [
  "Makerere University","Kyambogo University","Makerere University Business School",
  "Uganda Christian University","Mbarara University of Science and Technology",
  "Gulu University","Busitema University","Muni University","Kabale University",
  "Lira University","Soroti University","Other"
];

const UG_DISTRICTS = [
  "Kampala","Wakiso","Mukono","Jinja","Entebbe","Masaka","Mbarara","Gulu","Lira","Mbale",
  "Arua","Fort Portal","Soroti","Kabale","Hoima","Masindi","Kasese","Tororo","Iganga","Busia",
  "Nebbi","Apac","Moroto","Kotido","Kitgum","Adjumani","Yumbe","Moyo","Koboko","Nakasongola",
  "Other"
];

const SECTOR_ICONS = {
  "Health and Pharmaceuticals": "💊",
  "Medical Devices and Diagnostics": "🩺",
  "Biotechnology": "🧬",
  "Agriculture and Agro processing": "🌾",
  "Engineering and Manufacturing": "⚙️",
  "Renewable Energy": "☀️",
  "Robotics and Automation": "🤖",
  "ICT and Artificial Intelligence": "💻",
  "Environmental Technologies": "🌍",
  "Construction and Transport Tech": "🏗️"
};

const TRL_LABELS = {
  1: "Basic Research", 2: "Concept", 3: "Proof of Concept",
  4: "Lab Validated", 5: "Relevant Environment", 6: "Prototype Demo",
  7: "System Prototype", 8: "Qualified System", 9: "Proven in Market"
};

const ROLES = [
  { id: "Young Scientist", icon: "🔬", desc: "Student or early career researcher with an innovation to protect." },
  { id: "University Chapter", icon: "🎓", desc: "Representing a university IUYSC chapter or research office." },
  { id: "Industry / Investor", icon: "🏭", desc: "Looking to license, fund or manufacture innovations." },
  { id: "Government / Policy", icon: "🏛️", desc: "STI office, ministry, regulator or development partner." }
];

const VIEW_PERMISSIONS = {
  home: [],
  browse: [],
  about: [],
  submit: ["Young Scientist", "University Chapter", "Industry / Investor", "Government / Policy"],
  chapters: ["University Chapter"],
  admin: ["Government / Policy"],
  messages: ["Young Scientist", "University Chapter", "Industry / Investor", "Government / Policy"]
};

/* ============================================================
   STATE
   ============================================================ */

let DB = [];
let SAVED_CACHE = [];
let CURRENT_USER = null;
let USERS_CACHE = [];

let unsubConv = null;
let unsubThread = null;
let unsubUnread = null;
let unsubSaved = null;

let activeConvId = null;
let activeOtherEmail = null;
let currentChapter = "Makerere University";
let currentView = "home";
let browseState = { query: "", sector: "", university: "", trl: "", sort: "newest", savedOnly: false };
let selectedRole = "Young Scientist";
let signupAvatarData = null;
let editAvatarData = null;
let pendingMedia = [];

const MAX_MEDIA_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/* ============================================================
   HELPERS
   ============================================================ */

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function initialsFromName(name) {
  return (name || "").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function humanFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "🖼️";
  if (["mp4","mov","avi","webm","mkv"].includes(ext)) return "🎬";
  if (ext === "pdf") return "📄";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["ppt","pptx"].includes(ext)) return "📊";
  if (["xls","xlsx","csv"].includes(ext)) return "📈";
  return "📎";
}

function isImage(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  return ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
}

function formatMessageTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const now = new Date();
  const diff = now - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return min + " min ago";
  const hr = Math.floor(min / 60);
  if (hr < 24 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  const diffDays = Math.floor(diff / (24 * 3600 * 1000));
  if (diffDays < 7) return diffDays + "d ago";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatBubbleTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeader(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function canAccess(view) {
  const allowed = VIEW_PERMISSIONS[view];
  if (!allowed) return false;
  if (allowed.length === 0) return true;
  if (!CURRENT_USER) return false;
  // Admin bypasses role restriction
  if (view === "admin" && isAdmin(CURRENT_USER)) return true;
  return allowed.includes(CURRENT_USER.role);
}

function applyBodyRoleClasses() {
  document.body.classList.toggle("logged-in", !!CURRENT_USER);
  document.body.classList.remove("role-chapter", "role-government", "role-admin");
  if (CURRENT_USER) {
    if (CURRENT_USER.role === "University Chapter") document.body.classList.add("role-chapter");
    if (CURRENT_USER.role === "Government / Policy") document.body.classList.add("role-government");
    if (isAdmin(CURRENT_USER)) document.body.classList.add("role-admin");
  }
}

function getStat(itemId, field) {
  const item = DB.find(d => d.id === itemId);
  return item ? (item[field] || 0) : 0;
}

function isSaved(id) { return SAVED_CACHE.includes(id); }

/* ============================================================
   BOOTSTRAP
   ============================================================ */

window.addEventListener("firebase-ready", () => {
  onAuth(async (fbUser) => {
    if (fbUser) {
      const profile = await getUserProfile(fbUser.uid);
      CURRENT_USER = profile;
      if (CURRENT_USER) {
        if (unsubSaved) unsubSaved();
        unsubSaved = subscribeSaved(CURRENT_USER.uid, ids => {
          SAVED_CACHE = ids;
          updateSavedBanner();
          if (currentView === "browse") renderBrowse();
        });

        if (unsubUnread) unsubUnread();
        unsubUnread = subscribeUnreadCount(CURRENT_USER.email, total => applyUnreadBadge(total));

        USERS_CACHE = await listUsers();
        if (CURRENT_USER.role === "University Chapter" && CURRENT_USER.profile?.chapterUniversity) {
          currentChapter = CURRENT_USER.profile.chapterUniversity;
        }
      }
    } else {
      CURRENT_USER = null;
      SAVED_CACHE = [];
      USERS_CACHE = [];
      if (unsubSaved) { unsubSaved(); unsubSaved = null; }
      if (unsubUnread) { unsubUnread(); unsubUnread = null; }
    }
    updateAuthUI();
    swapHomeView();
  });

  subscribeInnovations(items => {
    DB = items;
    renderStats();
    renderPublicLanding();
    renderHome();
    renderBrowse();
    if (currentView === "admin") renderAdmin();
    renderChapterDashboard();
  });
});
subscribeInnovations(items => {
  DB = items;
  renderStats();
  renderPublicLanding();
  renderHome();
  renderBrowse();
  if (currentView === "admin") renderAdmin();
  renderChapterDashboard();
  updateUgCounter();   // ← ADD THIS LINE
});

/* ============================================================
   NAVIGATION
   ============================================================ */

function goTo(view) {
  if (!canAccess(view)) {
    if (!CURRENT_USER) {
      openModal(`
        <h3>Members only</h3>
        <div class="alert alert-info">
          The <strong>${escapeHtml(view.charAt(0).toUpperCase() + view.slice(1))}</strong> section is for SciPool UG members. Sign in or create a free account to continue.
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
          <button class="btn" onclick="closeModal(); openAuthModal('signin');" style="flex:1;" type="button">Sign In</button>
          <button class="btn btn-red" onclick="closeModal(); openAuthModal('signup');" style="flex:1;" type="button">Create Account</button>
        </div>
      `);
    } else {
      openModal(`
        <h3>Not available for your role</h3>
        <div class="alert alert-info">
          The <strong>${escapeHtml(view.charAt(0).toUpperCase() + view.slice(1))}</strong> section is only available to specific roles. You are signed in as <strong>${escapeHtml(CURRENT_USER.role)}</strong>.
        </div>
        <button class="btn" onclick="closeModal()" style="width:100%;" type="button">Close</button>
      `);
    }
    return;
  }

  currentView = view;
  document.querySelectorAll("nav button[data-view]").forEach(b => b.classList.remove("active"));
  document.querySelectorAll("#mobile-nav-list button").forEach(b => b.classList.remove("active"));
  const desktopBtn = document.querySelector(`nav button[data-view="${view}"]`);
  const mobileBtn = document.querySelector(`#mobile-nav-list button[data-view="${view}"]`);
  if (desktopBtn) desktopBtn.classList.add("active");
  if (mobileBtn) mobileBtn.classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  if (view === "home") {
    swapHomeView();
  } else {
    const el = document.getElementById("view-" + view);
    if (el) el.classList.add("active");
  }
  if (view === "browse") renderBrowse();
  if (view === "admin") renderAdmin();
  if (view === "chapters") renderChapterDashboard();
  if (view === "messages") renderMessages();
  const sticky = document.getElementById("mobile-sticky-cta");
  if (sticky) sticky.style.display = (view === "home" && !CURRENT_USER) ? "block" : "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================================================
   AUTH UI
   ============================================================ */

function updateAuthUI() {
  applyBodyRoleClasses();
  const wrap = document.getElementById("user-menu-wrap");
  const btn = document.getElementById("open-auth");
  const badge = document.getElementById("user-badge");
  const mobileAuthBlock = document.getElementById("mobile-auth-block");
  const mobileUserContainer = document.getElementById("mobile-user-section-container");

  if (CURRENT_USER) {
    const initials = initialsFromName(CURRENT_USER.name);
    const avatarHTML = CURRENT_USER.avatarUrl
      ? `<img src="${CURRENT_USER.avatarUrl}" alt="" />`
      : escapeHtml(initials);
    if (badge) badge.innerHTML = `<span class="badge-avatar">${avatarHTML}</span><span>${escapeHtml(CURRENT_USER.name.split(" ")[0])}</span><span class="chevron">▼</span>`;
    if (wrap) wrap.classList.add("active");
    if (btn) btn.style.display = "none";
    const ddAv = document.getElementById("dd-avatar");
    const ddName = document.getElementById("dd-name");
    const ddRole = document.getElementById("dd-role");
    const ddEmail = document.getElementById("dd-email");
    if (ddAv) ddAv.innerHTML = avatarHTML;
    if (ddName) ddName.textContent = CURRENT_USER.name;
    if (ddRole) ddRole.textContent = isAdmin(CURRENT_USER) ? CURRENT_USER.role + " · Admin" : CURRENT_USER.role;
    if (ddEmail) ddEmail.textContent = CURRENT_USER.email;
    if (mobileAuthBlock) mobileAuthBlock.style.display = "none";
    if (mobileUserContainer) mobileUserContainer.innerHTML = `
      <div class="mobile-user-section">
        <div class="mobile-user-header">
          <div class="m-avatar">${avatarHTML}</div>
          <div class="m-info">
            <div class="m-name">${escapeHtml(CURRENT_USER.name)}</div>
            <div class="m-role">${escapeHtml(CURRENT_USER.role)}${isAdmin(CURRENT_USER) ? " · Admin" : ""}</div>
            <div class="m-email">${escapeHtml(CURRENT_USER.email)}</div>
          </div>
        </div>
        <div class="mobile-user-actions">
          <button type="button" onclick="closeMobileNav(); setTimeout(() => openProfile(), 200);"><span class="m-icon">👤</span>View Profile</button>
          <button type="button" onclick="closeMobileNav(); setTimeout(() => openProfileEdit(), 200);"><span class="m-icon">✏️</span>Edit Profile</button>
          <button type="button" onclick="closeMobileNav(); setTimeout(() => goTo('messages'), 200);"><span class="m-icon">✉️</span>Messages</button>
          <button type="button" onclick="closeMobileNav(); setTimeout(() => { goTo('browse'); showSavedOnly(); }, 200);"><span class="m-icon">💾</span>My Shortlist</button>
          <button type="button" class="signout" onclick="closeMobileNav(); setTimeout(() => signOut(), 200);"><span class="m-icon">🚪</span>Sign Out</button>
        </div>
      </div>
    `;
  } else {
    if (wrap) wrap.classList.remove("active");
    if (btn) btn.style.display = "inline-block";
    closeUserDropdown();
    if (mobileAuthBlock) mobileAuthBlock.style.display = "block";
    if (mobileUserContainer) mobileUserContainer.innerHTML = "";
  }
  swapHomeView();
}

function swapHomeView() {
   if (window.__SCIPOOL_VERIFY_MODE__) return;   // 
  const publicHome = document.getElementById("view-home-public");
  const dashHome = document.getElementById("view-home-dashboard");
  if (!publicHome || !dashHome) return;
  const currentActive = document.querySelector(".view.active");
  if (currentActive && currentActive.id !== "view-home-public" && currentActive.id !== "view-home-dashboard") return;
  if (CURRENT_USER) {
    publicHome.classList.remove("active");
    dashHome.classList.add("active");
    renderDashboard();
    const sticky = document.getElementById("mobile-sticky-cta");
    if (sticky) sticky.style.display = "none";
  } else {
    publicHome.classList.add("active");
    dashHome.classList.remove("active");
    renderPublicLanding();
    const sticky = document.getElementById("mobile-sticky-cta");
    if (sticky) sticky.style.display = "block";
  }
}

/* ============================================================
   USER DROPDOWN + MOBILE NAV
   ============================================================ */

function openUserDropdown() {
  const dd = document.getElementById("user-dropdown");
  const badge = document.getElementById("user-badge");
  if (dd) dd.classList.add("open");
  if (badge) badge.classList.add("open");
}
function closeUserDropdown() {
  const dd = document.getElementById("user-dropdown");
  const badge = document.getElementById("user-badge");
  if (dd) dd.classList.remove("open");
  if (badge) badge.classList.remove("open");
}

function openMobileNav() {
  document.getElementById("mobile-nav-drawer")?.classList.add("active");
  document.getElementById("mobile-nav-overlay")?.classList.add("active");
  document.getElementById("hamburger-btn")?.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeMobileNav() {
  document.getElementById("mobile-nav-drawer")?.classList.remove("active");
  document.getElementById("mobile-nav-overlay")?.classList.remove("active");
  document.getElementById("hamburger-btn")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ============================================================
   LANDING + DASHBOARD
   ============================================================ */

function renderStats() {
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

function renderSectorsLanding() {
  const counts = {};
  DB.filter(d => d.visibility !== "private").forEach(d => {
    counts[d.sector] = (counts[d.sector] || 0) + 1;
  });
  const el = document.getElementById("landing-sectors");
  if (!el) return;
  el.innerHTML = Object.keys(SECTOR_ICONS).map(s => {
    const count = counts[s] || 0;
    return `
      <div class="sector-card" onclick="browseBySector('${escapeHtml(s)}')">
        <span class="sector-emoji">${SECTOR_ICONS[s]}</span>
        <div class="sector-name">${escapeHtml(s)}</div>
        <div class="sector-count">${count} innovation${count !== 1 ? "s" : ""}</div>
      </div>
    `;
  }).join("");
}
function browseBySector(sector) {
  browseState.sector = sector;
  browseState.savedOnly = false;
  goTo("browse");
}

function renderLandingPreview() {
  const preview = DB.filter(d => d.visibility === "public").slice(0, 6);
  const el = document.getElementById("landing-preview");
  if (!el) return;
  el.innerHTML = preview.map(item => {
    const ico = SECTOR_ICONS[item.sector] || "📌";
    return `
      <div class="card" style="pointer-events: none;">
        <span class="tag yellow">${ico} ${escapeHtml(item.sector)}</span>
        <h4>${escapeHtml(item.title)}</h4>
        <div class="meta"><strong>${escapeHtml(item.author)}</strong> from ${escapeHtml(item.university)}</div>
        <div class="abstract">${escapeHtml((item.abstract || "").slice(0, 120))}…</div>
        <div class="footer">
          <span class="badge-trl">TRL ${item.trl}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderPublicLanding() {
  renderSectorsLanding();
  renderLandingPreview();
  renderStats();
  renderFeaturedInnovators();
}

function renderDashboard() {
  if (!CURRENT_USER) return;
  const firstName = CURRENT_USER.name.split(" ")[0];
  const dashName = document.getElementById("dash-name");
  const dashRole = document.getElementById("dash-role");
  const dashGreet = document.getElementById("dash-greeting");
  if (dashName) dashName.textContent = firstName;
  if (dashRole) dashRole.textContent = isAdmin(CURRENT_USER) ? CURRENT_USER.role + " · Admin" : CURRENT_USER.role;

  const greetings = {
    "Young Scientist": "Your research matters. Submit it to SciPool UG, protect it, and get discovered by investors and industry.",
    "University Chapter": "Manage your university chapter. Track submissions, upload batches and compete on the national leaderboard.",
    "Industry / Investor": "Discover investment ready innovations from Uganda's brightest young scientists.",
    "Government / Policy": "National evidence for STI policy. Real time analytics on youth innovation across Uganda."
  };
  if (dashGreet) dashGreet.textContent = greetings[CURRENT_USER.role] || "Welcome to your SciPool UG dashboard.";

  const mySubs = DB.filter(d => d.email === CURRENT_USER.email).length;
  const investmentReady = DB.filter(d => d.trl >= 6).length;
  const myUniItems = CURRENT_USER.profile?.chapterUniversity
    ? DB.filter(d => d.university === CURRENT_USER.profile.chapterUniversity).length
    : 0;

  let kpis = [];
  if (CURRENT_USER.role === "Young Scientist") {
    kpis = [
      { lbl: "My submissions", val: mySubs, cls: "" },
      { lbl: "Innovations in SciPool", val: DB.length, cls: "red" },
      { lbl: "Investment ready", val: investmentReady, cls: "black" },
      { lbl: "Shortlist", val: SAVED_CACHE.length, cls: "" }
    ];
  } else if (CURRENT_USER.role === "University Chapter") {
    kpis = [
      { lbl: "Chapter submissions", val: myUniItems, cls: "" },
      { lbl: "Total in SciPool", val: DB.length, cls: "red" },
      { lbl: "Investment ready", val: investmentReady, cls: "black" },
      { lbl: "Shortlist", val: SAVED_CACHE.length, cls: "" }
    ];
  } else if (CURRENT_USER.role === "Industry / Investor") {
    kpis = [
      { lbl: "Innovations available", val: DB.length, cls: "" },
      { lbl: "Investment ready", val: investmentReady, cls: "red" },
      { lbl: "My shortlist", val: SAVED_CACHE.length, cls: "black" },
      { lbl: "Universities", val: new Set(DB.map(d => d.university)).size, cls: "" }
    ];
  } else {
    kpis = [
      { lbl: "National innovations", val: DB.length, cls: "" },
      { lbl: "Universities", val: new Set(DB.map(d => d.university)).size, cls: "red" },
      { lbl: "Investment ready", val: investmentReady, cls: "black" },
      { lbl: "Sectors", val: new Set(DB.map(d => d.sector)).size, cls: "" }
    ];
  }
  const kpiEl = document.getElementById("dash-kpis");
  if (kpiEl) {
    kpiEl.innerHTML = kpis.map(k => `
      <div class="dash-kpi ${k.cls}">
        <div class="k-lbl">${escapeHtml(k.lbl)}</div>
        <div class="k-val">${k.val}</div>
      </div>
    `).join("");
  }

  const actions = [];
  actions.push({ icon: "✉️", title: "Messages", desc: "Chat with other members", action: "goTo('messages')" });
  if (isAdmin(CURRENT_USER)) {
    actions.push({ icon: "🛡️", title: "Admin dashboard", desc: "Manage submissions, researchers, featured items", action: "goTo('admin')" });
  }
  if (CURRENT_USER.role === "Young Scientist") {
    actions.push({ icon: "🔬", title: "Submit new research", desc: "Protect and publish your work", action: "goTo('submit')" });
    actions.push({ icon: "🌐", title: "Browse the pool", desc: "See what peers are building", action: "goTo('browse')" });
  } else if (CURRENT_USER.role === "University Chapter") {
    actions.push({ icon: "🎓", title: "Chapter dashboard", desc: `${myUniItems} submission(s)`, action: "goTo('chapters')" });
    actions.push({ icon: "🌐", title: "Browse the pool", desc: "See national innovations", action: "goTo('browse')" });
  } else if (CURRENT_USER.role === "Industry / Investor") {
    actions.push({ icon: "💰", title: "Investment ready", desc: `${investmentReady} at TRL 6+`, action: "browseState.trl='6'; goTo('browse')" });
    actions.push({ icon: "🌐", title: "Browse all sectors", desc: "Explore the SciPool pipeline", action: "goTo('browse')" });
  } else {
    actions.push({ icon: "📊", title: "National analytics", desc: "View trends and reports", action: "goTo('admin')" });
    actions.push({ icon: "🌐", title: "Browse the pool", desc: "All public research", action: "goTo('browse')" });
  }
  const qaEl = document.getElementById("dash-quick-actions");
  if (qaEl) {
    qaEl.innerHTML = actions.map(a => `
      <button class="qa" onclick="${a.action}" type="button">
        <span class="qa-icon">${a.icon}</span>
        <div class="qa-title">${escapeHtml(a.title)}</div>
        <div class="qa-desc">${escapeHtml(a.desc)}</div>
      </button>
    `).join("");
  }
  renderHome();
}

/* ============================================================
   CARD / HOME
   ============================================================ */

function cardHTML(item) {
  const isProtected = item.visibility !== "public";
  const abstract = isProtected ? '<em style="color:var(--ink-faint);">Details protected.</em>' : escapeHtml(item.abstract || "");
  const ico = SECTOR_ICONS[item.sector] || "📌";
  const mediaCount = (item.media || []).length;
  const featureBadge = item.featured ? '<span class="pill" style="background:var(--gold);color:var(--charcoal);font-size:9px;margin-left:6px;">⭐ Featured</span>' : "";
  const editorBadge = item.editorPick ? '<span class="pill published" style="font-size:9px;margin-left:6px;">🏆 Editor pick</span>' : "";
  return `
    <div class="card">
      <span class="tag ${item.visibility === "public" ? "" : "yellow"}">${ico} ${escapeHtml(item.sector)}</span>
      <h4>${escapeHtml(item.title)}${featureBadge}${editorBadge}</h4>
      <div class="meta"><strong>${escapeHtml(item.author)}</strong> from ${escapeHtml(item.university)}</div>
      <div class="abstract">${abstract}</div>
      <div class="footer">
        <span class="badge-trl">TRL ${item.trl}</span>
        <span>${mediaCount ? `📎 ${mediaCount} file(s)` : ""}</span>
      </div>
      <div style="margin-top:12px;">
        <button class="btn btn-sm" style="width:100%;" onclick="openDrawer('${item.id}')" type="button">View details</button>
      </div>
    </div>
  `;
}

function renderHome() {
  const featured = DB.filter(d => d.featured && d.visibility === "public");
  const editorPicks = DB.filter(d => d.editorPick && !d.featured && d.visibility === "public");
  const rest = DB.filter(d => !d.featured && !d.editorPick && d.visibility === "public");
  const ordered = [...featured, ...editorPicks, ...rest].slice(0, 8);

  const el = document.getElementById("home-featured");
  if (!el) return;
  el.innerHTML = ordered.length
    ? ordered.map(cardHTML).join("")
    : '<div class="empty"><span class="icon">🔬</span><p>No innovations yet.</p></div>';

  renderFeaturedInnovators();
}

function renderFeaturedInnovators() {
  const publicHome = document.getElementById("view-home-public");
  const dashHome = document.getElementById("view-home-dashboard");
  const target = dashHome?.classList.contains("active") ? dashHome : publicHome;
  if (!target) return;

  let strip = document.getElementById("featured-innovators-strip");
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "featured-innovators-strip";
    strip.style.cssText = "margin: 32px 0;";
    target.appendChild(strip);
  }

  const featuredPeople = USERS_CACHE.filter(u => u.featured && !u.suspended);
  if (!featuredPeople.length) {
    strip.innerHTML = "";
    return;
  }

  strip.innerHTML = `
    <div class="section-header-row" style="margin-bottom:14px;">
      <h3 class="section-title">⭐ Featured Innovators</h3>
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:14px;">
      ${featuredPeople.slice(0, 8).map(u => {
        const initials = (u.name || "").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
        const avatarHTML = u.avatarUrl ? `<img src="${u.avatarUrl}" alt="" style="width:100%; height:100%; object-fit:cover;" />` : escapeHtml(initials);
        const org = u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || "SciPool Member";
        return `
          <div class="card" style="text-align:center; padding:20px 16px; align-items:center;">
            <div style="width:64px; height:64px; border-radius:50%; background:var(--charcoal); color:var(--gold); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; overflow:hidden; border:3px solid var(--gold); margin-bottom:10px;">
              ${avatarHTML}
            </div>
            <h4 style="margin-bottom:4px; font-size:14px;">${escapeHtml(u.name)}</h4>
            <div style="font-size:11px; color:var(--ink-faint); line-height:1.4;">${escapeHtml(org)}</div>
            <div style="font-size:10px; color:var(--flag-red); font-weight:800; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">${escapeHtml(u.role)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* ============================================================
   BROWSE
   ============================================================ */

function renderBrowseSidebars() {
  const counts = {};
  DB.filter(d => d.visibility !== "private").forEach(d => {
    counts[d.sector] = (counts[d.sector] || 0) + 1;
  });
  const sectorList = document.getElementById("sector-list");
  if (sectorList) {
    sectorList.innerHTML = `
      <li class="${browseState.sector === "" ? "active" : ""}" data-sector="">
        <span><span class="ico">📋</span>All sectors</span>
        <span class="count">${DB.filter(d => d.visibility !== "private").length}</span>
      </li>
      ${Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([s, c]) => `
        <li class="${browseState.sector === s ? "active" : ""}" data-sector="${escapeHtml(s)}">
          <span><span class="ico">${SECTOR_ICONS[s] || "📌"}</span>${escapeHtml(s.length > 22 ? s.slice(0,20) + "…" : s)}</span>
          <span class="count">${c}</span>
        </li>
      `).join("")}
    `;
    sectorList.querySelectorAll("li").forEach(li => {
      li.onclick = () => { browseState.sector = li.dataset.sector; browseState.savedOnly = false; renderBrowse(); };
    });
  }

  const uniCounts = {};
  DB.filter(d => d.visibility !== "private").forEach(d => {
    uniCounts[d.university] = (uniCounts[d.university] || 0) + 1;
  });
  const uniList = document.getElementById("uni-list");
  if (uniList) {
    uniList.innerHTML = `
      <li class="${browseState.university === "" ? "active" : ""}" data-uni="">
        <span><span class="ico">🎓</span>All universities</span>
        <span class="count">${DB.filter(d => d.visibility !== "private").length}</span>
      </li>
      ${Object.entries(uniCounts).sort((a,b) => b[1] - a[1]).map(([u, c]) => `
        <li class="${browseState.university === u ? "active" : ""}" data-uni="${escapeHtml(u)}">
          <span><span class="ico">🏛️</span>${escapeHtml(u.length > 22 ? u.slice(0,20) + "…" : u)}</span>
          <span class="count">${c}</span>
        </li>
      `).join("")}
    `;
    uniList.querySelectorAll("li").forEach(li => {
      li.onclick = () => { browseState.university = li.dataset.uni; browseState.savedOnly = false; renderBrowse(); };
    });
  }

  const trlList = document.getElementById("trl-list");
  if (trlList) {
    trlList.innerHTML = `
      <li class="${browseState.trl === "" ? "active" : ""}" data-trl="">
        <span><span class="ico">📊</span>All TRL levels</span>
      </li>
      ${[9,8,7,6,5,4,3,2,1].map(t => {
        const c = DB.filter(d => d.visibility !== "private" && d.trl === t).length;
        return `<li class="${browseState.trl === String(t) ? "active" : ""}" data-trl="${t}">
          <span><span class="ico">TRL ${t}</span> ${TRL_LABELS[t]}</span>
          <span class="count">${c}</span>
        </li>`;
      }).join("")}
    `;
    trlList.querySelectorAll("li").forEach(li => {
      li.onclick = () => { browseState.trl = li.dataset.trl; browseState.savedOnly = false; renderBrowse(); };
    });
  }
}

function renderTopInnovators() {
  const byAuthor = {};
  DB.forEach(d => {
    if (!byAuthor[d.author]) byAuthor[d.author] = { count: 0, uni: d.university, email: d.email };
    byAuthor[d.author].count += 1;
  });
  const top = Object.entries(byAuthor).map(([name, v]) => ({ name, ...v })).sort((a,b) => b.count - a.count).slice(0, 6);
  const el = document.getElementById("top-innovators");
  if (!el) return;
  el.innerHTML = top.map(t => {
    const u = USERS_CACHE.find(x => x.email === t.email);
    const avatarHTML = (u && u.avatarUrl)
      ? `<img src="${u.avatarUrl}" alt="" />`
      : escapeHtml(t.name.split(" ").map(n=>n[0]).join("").slice(0,2));
    return `
      <div class="top-innovator">
        <div class="avatar">${avatarHTML}</div>
        <div class="info">
          <div class="name">${escapeHtml(t.name)}</div>
          <div class="sub">${escapeHtml(t.uni)}</div>
        </div>
        <div class="badge-count">${t.count}</div>
      </div>
    `;
  }).join("");
}

function renderTrendingSectors() {
  const counts = {};
  DB.filter(d => d.visibility !== "private").forEach(d => {
    counts[d.sector] = (counts[d.sector] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const el = document.getElementById("trending-sectors");
  if (!el) return;
  el.innerHTML = sorted.map(([s, c], i) => `
    <div class="lb-row" style="padding:9px 0;">
      <div class="lb-rank">${i+1}</div>
      <div class="lb-info"><div class="lb-name" style="font-size:13px;">${SECTOR_ICONS[s] || "📌"} ${escapeHtml(s)}</div></div>
      <div class="lb-count">${c}</div>
    </div>
  `).join("");
}

function getFilteredResults() {
  let results = DB.filter(d => d.visibility !== "private");
  if (browseState.savedOnly) {
    results = results.filter(d => SAVED_CACHE.includes(d.id));
  }
  if (browseState.query) {
    const q = browseState.query.toLowerCase();
    results = results.filter(d =>
      ((d.title || "") + " " + (d.author || "") + " " + (d.abstract || "") + " " + (d.keywords || "") + " " + (d.university || "") + " " + (d.sector || "")).toLowerCase().includes(q)
    );
  }
  if (browseState.sector) results = results.filter(d => d.sector === browseState.sector);
  if (browseState.university) results = results.filter(d => d.university === browseState.university);
  if (browseState.trl) results = results.filter(d => String(d.trl) === browseState.trl);
  switch (browseState.sort) {
    case "trending":
      results.sort((a,b) => (getStat(b.id,"views")+getStat(b.id,"saves")*2+getStat(b.id,"contacted")*3) - (getStat(a.id,"views")+getStat(a.id,"saves")*2+getStat(a.id,"contacted")*3));
      break;
    case "trl": results.sort((a,b) => b.trl - a.trl); break;
    case "views": results.sort((a,b) => getStat(b.id,"views") - getStat(a.id,"views")); break;
    case "contacted": results.sort((a,b) => getStat(b.id,"contacted") - getStat(a.id,"contacted")); break;
    default:
      results.sort((a,b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });
  }
  return results;
}

function innCardHTML(item) {
  const isProtected = item.visibility !== "public";
  const views = getStat(item.id, "views");
  const saves = getStat(item.id, "saves");
  const saved = isSaved(item.id);
  const ico = SECTOR_ICONS[item.sector] || "📌";
  const abstract = isProtected ? "Details protected. Register as an investor and message the innovator through SciPool UG." : (item.abstract || "");
  const kwList = item.keywords ? item.keywords.split(",").map(k => k.trim()).filter(Boolean).slice(0, 5) : [];
  const trlHigh = item.trl >= 6;
  const featureBadge = item.featured ? '<span class="pill" style="background:var(--gold);color:var(--charcoal);">⭐ Featured</span>' : "";
  const editorBadge = item.editorPick ? '<span class="pill published">🏆 Editor pick</span>' : "";
  const authorUser = USERS_CACHE.find(u => u.email === item.email);
  const avatarHTML = (authorUser && authorUser.avatarUrl)
    ? `<img src="${authorUser.avatarUrl}" alt="" />`
    : escapeHtml((item.author || "?").split(" ").map(n=>n[0]).join("").slice(0,2));
  const hasMedia = (item.media || []).length > 0;

  return `
    <article class="inn-card ${isProtected ? "protected" : ""}" data-id="${item.id}">
      <div class="inn-card-body">
        <div class="inn-card-top">
          <span class="inn-sector-chip"><span class="ico">${ico}</span>${escapeHtml(item.sector)}</span>
          <div class="inn-badges">
            ${featureBadge}
            ${editorBadge}
            <span class="pill trl">TRL ${item.trl}</span>
            ${trlHigh ? '<span class="pill investment">Investment ready</span>' : ""}
            ${hasMedia ? '<span class="pill media">📎 Media</span>' : ""}
            ${isProtected ? '<span class="pill protected">Protected</span>' : ""}
          </div>
        </div>
        <h4 class="inn-title" onclick="openDrawer('${item.id}')">${escapeHtml(item.title)}</h4>
        <div class="inn-author-line">
          <div class="mini-avatar">${avatarHTML}</div>
          <div><strong>${escapeHtml(item.author)}</strong> from ${escapeHtml(item.university)}</div>
        </div>
        <p class="inn-abstract ${isProtected ? "protected-text" : ""}">${escapeHtml(abstract)}</p>
        ${kwList.length ? `<div class="inn-keywords">${kwList.map(k => `<span class="kw">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        <div class="inn-card-bottom">
          <div class="inn-stats">
            <span class="stat-item">Views <span class="n">${views}</span></span>
            <span class="stat-item">Saved <span class="n">${saves}</span></span>
          </div>
          <div class="inn-actions">
            <button class="btn-tiny ${saved ? "saved" : "outline"}" onclick="event.stopPropagation(); toggleSaved('${item.id}')" type="button">${saved ? "Saved" : "Save"}</button>
            <button class="btn-tiny yellow" onclick="event.stopPropagation(); openDrawer('${item.id}')" type="button">View</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderBrowse() {
  renderBrowseSidebars();
  renderTopInnovators();
  renderTrendingSectors();
  updateSavedBanner();
  const results = getFilteredResults();
  const countEl = document.getElementById("results-count");
  if (countEl) countEl.textContent = results.length;
  const parts = [];
  if (browseState.sector) parts.push(browseState.sector);
  if (browseState.university) parts.push(browseState.university);
  if (browseState.trl) parts.push("TRL " + browseState.trl);
  if (browseState.savedOnly) parts.push("Shortlist");
  const labelEl = document.getElementById("active-filters-label");
  if (labelEl) labelEl.textContent = parts.length ? "Filtered by " + parts.join(", ") : "";
  const container = document.getElementById("browse-results");
  if (!container) return;
  if (!results.length) {
    container.innerHTML = `<div class="browse-empty"><span class="icon">🔍</span><h4>No innovations match your filters</h4><p>Try clearing the filters or searching for a different keyword.</p><button class="btn btn-sm" onclick="document.getElementById('clear-filters').click()" type="button">Clear all filters</button></div>`;
    return;
  }
  container.innerHTML = results.map(innCardHTML).join("");
}

function updateSavedBanner() {
  const banner = document.getElementById("saved-banner");
  const countEl = document.getElementById("saved-count");
  if (countEl) countEl.textContent = SAVED_CACHE.length;
  if (banner) {
    if (SAVED_CACHE.length) banner.classList.remove("hidden");
    else banner.classList.add("hidden");
  }
}

function showSavedOnly() { browseState.savedOnly = true; renderBrowse(); }

async function toggleSaved(itemId) {
  if (!CURRENT_USER) { openAuthModal("signin"); return; }
  try {
    if (isSaved(itemId)) await removeSaved(CURRENT_USER.uid, itemId);
    else await addSaved(CURRENT_USER.uid, itemId);
  } catch (e) { console.error(e); }
}

/* ============================================================
   DRAWER
   ============================================================ */

function openDrawer(id) {
  const d = DB.find(x => x.id === id);
  if (!d) return;
  trackStat(id, "views");
  const isProtected = d.visibility !== "public";
  const saved = isSaved(id);
  const ico = SECTOR_ICONS[d.sector] || "📌";
  const authorUser = USERS_CACHE.find(u => u.email === d.email);
  const avatarHTML = (authorUser && authorUser.avatarUrl)
    ? `<img src="${authorUser.avatarUrl}" alt="" />`
    : escapeHtml((d.author || "?").split(" ").map(n=>n[0]).join("").slice(0,2));
  const media = d.media || [];
  const canMessage = CURRENT_USER && CURRENT_USER.email !== d.email;

  const titleEl = document.getElementById("drawer-title");
  const subEl = document.getElementById("drawer-subtitle");
  if (titleEl) titleEl.textContent = d.title;
  if (subEl) subEl.textContent = `${d.author} from ${d.university}`;

  const mediaSection = media.length ? `
    <div class="drawer-section">
      <h5>Media and attachments (${media.length})</h5>
      <div class="drawer-media-grid">
        ${media.map((m, i) => isImage(m.name)
          ? `<div class="drawer-media-item" onclick="window.open('${m.url}','_blank')">
               <img src="${m.url}" alt="${escapeHtml(m.name)}" />
               <div class="file-name">${escapeHtml(m.name)}</div>
             </div>`
          : `<div class="drawer-media-item" onclick="window.open('${m.url}','_blank')">
               <div class="file-icon">${getFileIcon(m.name)}</div>
               <div class="file-name">${escapeHtml(m.name)}</div>
             </div>`
        ).join("")}
      </div>
    </div>
  ` : "";

  const messageButton = canMessage ? `
    <button class="btn btn-sm btn-red" onclick="openCompose('${escapeHtml(d.email)}')" type="button">✉️ Message innovator</button>
  ` : "";

  const featureBadge = d.featured ? '<span class="pill" style="background:var(--gold);color:var(--charcoal);">⭐ Featured</span>' : "";
  const editorBadge = d.editorPick ? '<span class="pill published">🏆 Editor pick</span>' : "";

  const bodyEl = document.getElementById("drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    <div class="drawer-section">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${featureBadge}
        ${editorBadge}
        <span class="pill trl">TRL ${d.trl}, ${TRL_LABELS[d.trl] || ""}</span>
        ${d.trl >= 6 ? '<span class="pill investment">Investment ready</span>' : ""}
        ${isProtected ? '<span class="pill protected">Protected</span>' : '<span class="pill published">Public</span>'}
      </div>
      <span class="inn-sector-chip"><span class="ico">${ico}</span>${escapeHtml(d.sector)}</span>
    </div>
    <div class="drawer-section">
      <h5>Innovator</h5>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <div style="width:52px; height:52px; border-radius:50%; background: var(--charcoal); color: var(--gold); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; overflow:hidden; border:2px solid var(--flag-red); flex-shrink:0;">
          ${avatarHTML}
        </div>
        <div>
          <div style="font-weight:800; color:var(--ink); font-size:15px;">${escapeHtml(d.author)}</div>
          <div style="font-size:12px; color:var(--ink-soft);">${escapeHtml(d.course || d.university)}</div>
        </div>
      </div>
      <div class="drawer-kv">
        <span class="k">University</span><span class="v">${escapeHtml(d.university)}</span>
        <span class="k">Course</span><span class="v">${escapeHtml(d.course || "Not provided")}</span>
      </div>
    </div>
    <div class="drawer-section">
      <h5>Abstract</h5>
      <p>${isProtected ? "Details of this research are protected. Registered investors may request access through SciPool UG." : escapeHtml(d.abstract || "")}</p>
    </div>
    <div class="drawer-section">
      <h5>Readiness and status</h5>
      <div class="drawer-kv">
        <span class="k">TRL level</span><span class="v">TRL ${d.trl}</span>
        <span class="k">Status</span><span class="v">${escapeHtml(d.status || "Submitted")}</span>
      </div>
    </div>
    ${d.keywords ? `<div class="drawer-section"><h5>Keywords</h5><div class="inn-keywords">${d.keywords.split(",").map(k => `<span class="kw">${escapeHtml(k.trim())}</span>`).join("")}</div></div>` : ""}
    ${mediaSection}
    <div class="drawer-section">
      <h5>Proof of authorship, SHA 256</h5>
      <div class="hash" style="background:var(--cream); padding:12px; border-radius:8px; font-size:10px; word-break:break-all; color:var(--ink-soft);">${escapeHtml(d.hash || "Pending server hash")}</div>
    </div>
    <div class="drawer-actions">
      <button class="btn btn-sm ${saved ? "btn-black" : ""}" onclick="toggleSaved('${d.id}'); setTimeout(() => openDrawer('${d.id}'), 200);" type="button">
        ${saved ? "Saved to shortlist" : "Save to shortlist"}
      </button>
      ${messageButton}
    </div>
  `;
  document.getElementById("drawer")?.classList.add("active");
  document.getElementById("drawer-bg")?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("active");
  document.getElementById("drawer-bg")?.classList.remove("active");
  document.body.style.overflow = "";
}

/* ============================================================
   MODAL
   ============================================================ */

function openModal(html) {
  const content = document.getElementById("modal-content");
  const box = document.getElementById("modal-box");
  const bg = document.getElementById("modal-bg");
  if (content) content.innerHTML = html;
  if (box) box.classList.remove("modal-wide");
  if (bg) bg.classList.add("active");
  document.body.style.overflow = "hidden";
}
function openWideModal(html) {
  const content = document.getElementById("modal-content");
  const box = document.getElementById("modal-box");
  const bg = document.getElementById("modal-bg");
  if (content) content.innerHTML = html;
  if (box) box.classList.add("modal-wide");
  if (bg) bg.classList.add("active");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  document.getElementById("modal-bg")?.classList.remove("active");
  document.body.style.overflow = "";
}

/* ============================================================
   MEDIA UPLOAD
   ============================================================ */

async function handleFiles(files) {
  const incoming = Array.from(files);
  for (const f of incoming) {
    if (pendingMedia.length >= MAX_MEDIA_FILES) {
      alert(`You can upload up to ${MAX_MEDIA_FILES} files per submission.`);
      break;
    }
    if (f.size > MAX_FILE_SIZE) {
      alert(`File "${f.name}" is larger than 10MB.`);
      continue;
    }
    try {
      const data = await fileToBase64(f);
      pendingMedia.push({ name: f.name, size: f.size, type: f.type, data });
    } catch (err) {
      alert(`Could not read "${f.name}".`);
    }
  }
  renderMediaPreview();
}

function renderMediaPreview() {
  const el = document.getElementById("media-preview-list");
  if (!el) return;
  if (!pendingMedia.length) { el.innerHTML = ""; return; }
  el.innerHTML = pendingMedia.map((m, i) => {
    const preview = isImage(m.name) ? `<img src="${m.data}" alt="${escapeHtml(m.name)}" />` : getFileIcon(m.name);
    return `
      <div class="media-item">
        <button class="media-item-remove" onclick="removePendingMedia(${i})" type="button" aria-label="Remove">×</button>
        <div class="media-item-preview">${preview}</div>
        <div class="media-item-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
        <div class="media-item-size">${humanFileSize(m.size)}</div>
      </div>
    `;
  }).join("");
}
function removePendingMedia(i) { pendingMedia.splice(i, 1); renderMediaPreview(); }

/* ============================================================
   SUBMIT FORM
   ============================================================ */

async function handleSubmitForm(e) {
  e.preventDefault();
  if (!CURRENT_USER) {
    openModal(`
      <h3>Members only</h3>
      <div class="alert alert-info">Please sign in to submit research to SciPool UG.</div>
      <button class="btn" onclick="closeModal(); openAuthModal('signin');" style="width:100%;" type="button">Sign In</button>
    `);
    return;
  }
  const payload = {
    title: document.getElementById("f-title").value.trim(),
    author: CURRENT_USER.name,
    email: CURRENT_USER.email,
    university: document.getElementById("f-university").value,
    course: document.getElementById("f-course").value.trim(),
    sector: document.getElementById("f-sector").value,
    trl: parseInt(document.getElementById("f-trl").value),
    abstract: document.getElementById("f-abstract").value.trim(),
    keywords: document.getElementById("f-keywords").value.trim(),
    visibility: document.getElementById("f-visibility").value
  };
  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Uploading..."; }
  try {
    const mediaCount = pendingMedia.length;
    await createInnovation(payload, pendingMedia.slice(), CURRENT_USER.uid);
    pendingMedia = [];
    renderMediaPreview();
    e.target.reset();
    openModal(`
      <h3 style="color:var(--green);">Research added to SciPool UG</h3>
      <div class="alert alert-success">Your innovation has been timestamped.${mediaCount ? ` ${mediaCount} media file(s) attached.` : ""}</div>
      <p style="margin:14px 0;"><strong>Title.</strong> ${escapeHtml(payload.title)}</p>
      <button class="btn btn-black" onclick="closeModal()" style="width:100%;" type="button">Close</button>
    `);
  } catch (err) {
    console.error(err);
    alert("Submission failed: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

/* ============================================================
   AUTH MODAL
   ============================================================ */

function openAuthModal(tab = "signin") {
  selectedRole = "Young Scientist";
  signupAvatarData = null;
  openModal(`
    <div class="tab-switch">
      <button id="tab-signin" class="${tab === "signin" ? "active" : ""}" type="button">Sign In</button>
      <button id="tab-signup" class="${tab === "signup" ? "active" : ""}" type="button">Create Account</button>
    </div>
    <div id="auth-form-container"></div>
  `);
  document.getElementById("tab-signin").onclick = () => switchAuthTab("signin");
  document.getElementById("tab-signup").onclick = () => switchAuthTab("signup");
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.getElementById("tab-signin")?.classList.toggle("active", tab === "signin");
  document.getElementById("tab-signup")?.classList.toggle("active", tab === "signup");
  const c = document.getElementById("auth-form-container");
  if (!c) return;
  if (tab === "signin") {
    c.innerHTML = `
      <form id="signin-form">
        <div class="form-row"><label>Email <span class="req">*</span></label><input type="email" id="si-email" required autocomplete="email" /></div>
        <div class="form-row"><label>Password <span class="req">*</span></label><input type="password" id="si-password" required autocomplete="current-password" /></div>
        <button type="submit" class="btn" style="width:100%;">Sign in to SciPool UG</button>
      </form>
      <div style="text-align:center; margin-top:14px;">
        <button type="button" class="btn-link" id="forgot-link">Forgot password?</button>
      </div>
      <p style="margin-top:16px; font-size:12px; text-align:center; color:var(--ink-soft);">New to SciPool? <a href="#" onclick="switchAuthTab('signup'); return false;" style="color:var(--flag-red); font-weight:700;">Create an account</a></p>
    `;
    document.getElementById("signin-form").addEventListener("submit", handleSignIn);
    document.getElementById("forgot-link").addEventListener("click", startForgotPassword);
  } else {
    renderSignupForm();
  }
}

function renderSignupForm() {
  const c = document.getElementById("auth-form-container");
  if (!c) return;
  c.innerHTML = `
    <p style="font-size:13px; font-weight:700; margin-bottom:6px; color:var(--ink);">I am registering as a <span class="req">*</span></p>
    <div class="role-cards" id="role-cards">
      ${ROLES.map(r => `<div class="role-card ${r.id === selectedRole ? "selected" : ""}" data-role="${r.id}"><span class="role-icon">${r.icon}</span><div class="role-name">${r.id}</div><div class="role-desc">${r.desc}</div></div>`).join("")}
    </div>
    <form id="signup-form">
      <div class="avatar-upload">
        <div class="avatar-preview" id="avatar-preview" title="Add a profile picture">
          <span id="avatar-placeholder">📷</span>
        </div>
        <input type="file" id="signup-avatar-input" accept="image/*" style="display:none;" />
        <button type="button" class="avatar-upload-btn" id="avatar-upload-trigger">Add profile picture</button>
        <div class="avatar-upload-hint">Optional. Max 2MB.</div>
      </div>
      <div class="section-label">Personal information</div>
      <div class="form-row"><label>Full name <span class="req">*</span></label><input type="text" id="su-name" required autocomplete="name" /></div>
      <div class="two-col">
        <div class="form-row"><label>Email <span class="req">*</span></label><input type="email" id="su-email" required autocomplete="email" /></div>
        <div class="form-row"><label>Phone <span class="req">*</span></label><input type="tel" id="su-phone" required placeholder="+256 7XX XXX XXX" /></div>
      </div>
      <div class="two-col">
        <div class="form-row">
          <label>District <span class="req">*</span></label>
          <select id="su-district" required>
            <option value="">Select district</option>
            ${UG_DISTRICTS.map(d => `<option>${d}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Gender <span class="opt">(optional)</span></label>
          <select id="su-gender">
            <option value="">Prefer not to say</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </select>
        </div>
      </div>
      <div id="role-specific-fields"></div>
      <div class="section-label">Account security</div>
      <div class="two-col">
        <div class="form-row"><label>Password <span class="req">*</span></label><input type="password" id="su-password" required minlength="6" autocomplete="new-password" /></div>
        <div class="form-row"><label>Confirm <span class="req">*</span></label><input type="password" id="su-password2" required minlength="6" autocomplete="new-password" /></div>
      </div>
      <button type="submit" class="btn btn-red" style="width:100%;">Create my SciPool account</button>
    </form>
  `;

  document.querySelectorAll("#role-cards .role-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#role-cards .role-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedRole = card.dataset.role;
      renderRoleSpecificFields();
    });
  });

  const avatarInput = document.getElementById("signup-avatar-input");
  const avatarPreview = document.getElementById("avatar-preview");
  const avatarTrigger = document.getElementById("avatar-upload-trigger");
  avatarPreview.addEventListener("click", () => avatarInput.click());
  avatarTrigger.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert("Please choose an image under 2MB."); return; }
    try {
      const data = await fileToBase64(f);
      signupAvatarData = data;
      avatarPreview.innerHTML = `<img src="${data}" alt="" />`;
      avatarPreview.classList.add("has-image");
    } catch (err) { alert("Could not read that image."); }
  });

  renderRoleSpecificFields();
  document.getElementById("signup-form").addEventListener("submit", handleSignUp);
}

function renderRoleSpecificFields() {
  const c = document.getElementById("role-specific-fields");
  if (!c) return;
  if (selectedRole === "Young Scientist") {
    c.innerHTML = `
      <div class="section-label">Academic information</div>
      <div class="two-col">
        <div class="form-row">
          <label>University <span class="req">*</span></label>
          <select id="su-university" required>
            <option value="">Select university</option>
            ${UNIVERSITIES.map(u => `<option>${u}</option>`).join("")}
          </select>
        </div>
        <div class="form-row"><label>Course <span class="req">*</span></label><input type="text" id="su-course" required /></div>
      </div>
      <div class="two-col">
        <div class="form-row">
          <label>Year of study <span class="req">*</span></label>
          <select id="su-year" required>
            <option value="">Select year</option>
            <option>Year 1</option><option>Year 2</option><option>Year 3</option>
            <option>Year 4</option><option>Year 5</option>
            <option>Postgraduate</option><option>Recent graduate</option>
          </select>
        </div>
        <div class="form-row"><label>Student number <span class="opt">(optional)</span></label><input type="text" id="su-student-id" /></div>
      </div>
    `;
  } else if (selectedRole === "University Chapter") {
    c.innerHTML = `
      <div class="section-label">Chapter information</div>
      <div class="form-row">
        <label>University chapter <span class="req">*</span></label>
        <select id="su-chapter-uni" required>
          <option value="">Select university</option>
          ${UNIVERSITIES.map(u => `<option>${u}</option>`).join("")}
        </select>
      </div>
      <div class="two-col">
        <div class="form-row"><label>Position <span class="req">*</span></label><input type="text" id="su-position" required /></div>
        <div class="form-row"><label>Staff ID <span class="opt">(optional)</span></label><input type="text" id="su-staff-id" /></div>
      </div>
    `;
  } else if (selectedRole === "Industry / Investor") {
    c.innerHTML = `
      <div class="section-label">Organisation information</div>
      <div class="form-row"><label>Organisation name <span class="req">*</span></label><input type="text" id="su-org-name" required /></div>
      <div class="two-col">
        <div class="form-row">
          <label>Organisation type <span class="req">*</span></label>
          <select id="su-org-type" required>
            <option value="">Select</option>
            <option>Startup</option><option>SME</option><option>Corporate</option>
            <option>Investment firm</option><option>Development partner</option><option>Other</option>
          </select>
        </div>
        <div class="form-row"><label>Your role <span class="req">*</span></label><input type="text" id="su-job-title" required /></div>
      </div>
      <div class="two-col">
        <div class="form-row">
          <label>Sector of interest <span class="req">*</span></label>
          <select id="su-interest" required>
            <option value="">Select sector</option>
            ${Object.keys(SECTOR_ICONS).map(s => `<option>${s}</option>`).join("")}
          </select>
        </div>
        <div class="form-row"><label>Website <span class="opt">(optional)</span></label><input type="url" id="su-website" /></div>
      </div>
    `;
  } else if (selectedRole === "Government / Policy") {
    c.innerHTML = `
      <div class="section-label">Government information</div>
      <div class="form-row"><label>Ministry or agency <span class="req">*</span></label><input type="text" id="su-ministry" required /></div>
      <div class="two-col">
        <div class="form-row"><label>Position <span class="req">*</span></label><input type="text" id="su-gov-position" required /></div>
        <div class="form-row"><label>Official email <span class="opt">(optional)</span></label><input type="email" id="su-official-email" /></div>
      </div>
    `;
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const name = document.getElementById("su-name").value.trim();
  const email = document.getElementById("su-email").value.trim().toLowerCase();
  const phone = document.getElementById("su-phone").value.trim();
  const district = document.getElementById("su-district").value;
  const gender = document.getElementById("su-gender").value;
  const pw = document.getElementById("su-password").value;
  const pw2 = document.getElementById("su-password2").value;
  if (pw !== pw2) { alert("Passwords do not match."); return; }

  const profile = {};
  if (selectedRole === "Young Scientist") {
    profile.university = document.getElementById("su-university").value;
    profile.course = document.getElementById("su-course").value.trim();
    profile.yearOfStudy = document.getElementById("su-year").value;
    profile.studentId = document.getElementById("su-student-id").value.trim();
  } else if (selectedRole === "University Chapter") {
    profile.chapterUniversity = document.getElementById("su-chapter-uni").value;
    profile.position = document.getElementById("su-position").value.trim();
    profile.staffId = document.getElementById("su-staff-id").value.trim();
  } else if (selectedRole === "Industry / Investor") {
    profile.organisation = document.getElementById("su-org-name").value.trim();
    profile.orgType = document.getElementById("su-org-type").value;
    profile.jobTitle = document.getElementById("su-job-title").value.trim();
    profile.sectorInterest = document.getElementById("su-interest").value;
    profile.website = document.getElementById("su-website").value.trim();
  } else if (selectedRole === "Government / Policy") {
    profile.ministry = document.getElementById("su-ministry").value.trim();
    profile.govPosition = document.getElementById("su-gov-position").value.trim();
    profile.officialEmail = document.getElementById("su-official-email").value.trim();
  }

  try {
    await signUpUser({
      email, password: pw, name, phone, district, gender, role: selectedRole,
      profile, avatarDataUrl: signupAvatarData
    });
    signupAvatarData = null;
    closeModal();
    openModal(`
      <h3 style="color:var(--green);">Welcome to SciPool UG, ${escapeHtml(name.split(" ")[0])}</h3>
      <div class="alert alert-success">You are registered as <strong>${escapeHtml(selectedRole)}</strong>.</div>
      <button class="btn" onclick="closeModal()" style="width:100%;" type="button">Continue</button>
    `);
  } catch (err) {
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "An account with this email already exists.";
    if (err.code === "auth/weak-password") msg = "Password must be at least 6 characters.";
    alert(msg);
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById("si-email").value.trim().toLowerCase();
  const pw = document.getElementById("si-password").value;
  try {
    await signInUser(email, pw);
    closeModal();
  } catch (err) {
    alert("Invalid credentials. Please try again.");
  }
}

async function signOut() {
  await signOutUser();
  closeUserDropdown();
  closeModal();
  activeConvId = null;
  goTo("home");
}

function startForgotPassword() {
  openModal(`
    <h3>Reset your password</h3>
    <p style="font-size:14px; color:var(--ink-soft); margin-bottom:20px;">Enter your email and we'll send a reset link.</p>
    <form id="forgot-form">
      <div class="form-row"><label>Email</label><input type="email" id="fp-email" required /></div>
      <button type="submit" class="btn" style="width:100%;">Send reset email</button>
    </form>
    <p style="margin-top:16px; font-size:12px; text-align:center;">
      <a href="#" onclick="openAuthModal('signin'); return false;" style="color:var(--flag-red); font-weight:700;">Back to sign in</a>
    </p>
  `);
  document.getElementById("forgot-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await sendResetEmail(document.getElementById("fp-email").value.trim());
      openModal(`
        <h3 style="color:var(--green);">Check your inbox</h3>
        <div class="alert alert-success">A password reset link has been sent to your email.</div>
        <button class="btn" onclick="openAuthModal('signin')" style="width:100%;" type="button">Back to sign in</button>
      `);
    } catch (err) { alert("Could not send reset email. Check the address."); }
  });
}

/* ============================================================
   PROFILE
   ============================================================ */

function openProfile() {
  if (!CURRENT_USER) return;
  const p = CURRENT_USER.profile || {};
  const initials = initialsFromName(CURRENT_USER.name);
  const avatarHTML = CURRENT_USER.avatarUrl ? `<img src="${CURRENT_USER.avatarUrl}" alt="" />` : escapeHtml(initials);
  const roleDetails = [];
  if (CURRENT_USER.role === "Young Scientist") {
    roleDetails.push(["University", p.university]);
    roleDetails.push(["Course", p.course]);
    roleDetails.push(["Year", p.yearOfStudy]);
  } else if (CURRENT_USER.role === "University Chapter") {
    roleDetails.push(["Chapter", p.chapterUniversity]);
    roleDetails.push(["Position", p.position]);
  } else if (CURRENT_USER.role === "Industry / Investor") {
    roleDetails.push(["Organisation", p.organisation]);
    roleDetails.push(["Type", p.orgType]);
    roleDetails.push(["Role", p.jobTitle]);
    roleDetails.push(["Sector", p.sectorInterest]);
  } else if (CURRENT_USER.role === "Government / Policy") {
    roleDetails.push(["Ministry", p.ministry]);
    roleDetails.push(["Position", p.govPosition]);
  }
  const verifiedBadge = CURRENT_USER.verified ? '<span class="pill" style="background:#E8F3E3;color:#1e3a0f;margin-left:8px;">✓ Verified</span>' : "";
  const featuredBadge = CURRENT_USER.featured ? '<span class="pill" style="background:var(--gold);color:var(--charcoal);margin-left:6px;">⭐ Featured</span>' : "";
  openWideModal(`
    <h3>My SciPool account</h3>
    <div class="profile-header">
      <div class="profile-avatar-display">${avatarHTML}</div>
      <div>
        <div style="font-weight: 900; font-size: 18px; color: var(--ink);">${escapeHtml(CURRENT_USER.name)}${verifiedBadge}${featuredBadge}</div>
        <div style="font-size: 13px; color: var(--flag-red); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">${escapeHtml(CURRENT_USER.role)}${isAdmin(CURRENT_USER) ? " · Admin" : ""}</div>
      </div>
    </div>
    <div class="profile-section">
      <div class="section-label">Contact</div>
      <div class="profile-info-row"><div class="k">Email</div><div class="v">${escapeHtml(CURRENT_USER.email)}</div></div>
      ${CURRENT_USER.phone ? `<div class="profile-info-row"><div class="k">Phone</div><div class="v">${escapeHtml(CURRENT_USER.phone)}</div></div>` : ""}
      ${CURRENT_USER.district ? `<div class="profile-info-row"><div class="k">District</div><div class="v">${escapeHtml(CURRENT_USER.district)}</div></div>` : ""}
    </div>
    ${roleDetails.length ? `
      <div class="profile-section">
        <div class="section-label">${escapeHtml(CURRENT_USER.role)}</div>
        ${roleDetails.map(([k, v]) => v ? `<div class="profile-info-row"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>` : "").join("")}
      </div>
    ` : ""}
    <div style="margin-top: 24px; display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn" onclick="closeModal()" style="flex: 1;" type="button">Close</button>
      <button class="btn btn-red" onclick="closeModal(); signOut();" style="flex: 1;" type="button">Sign out</button>
    </div>
  `);
}

function openProfileEdit() {
  openModal(`<h3>Edit Profile</h3><p>Edit profile coming soon.</p><button class="btn" onclick="closeModal()" style="width:100%;">Close</button>`);
}

/* ============================================================
   MESSAGES
   ============================================================ */

function renderMessages() {
  if (!CURRENT_USER) return;
  if (unsubConv) unsubConv();
  unsubConv = subscribeConversations(CURRENT_USER.email, convs => {
    paintConversationList(convs);
  });
}

function paintConversationList(convs) {
  const myEmail = CURRENT_USER.email;
  const search = (document.getElementById("msg-search")?.value || "").toLowerCase().trim();
  const filtered = search
    ? convs.filter(c => (c.otherUser?.name || "").toLowerCase().includes(search))
    : convs;
  const list = document.getElementById("conversations-list");
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--ink-faint);">
        <div style="font-size: 48px; opacity: 0.4; margin-bottom: 12px;">✉️</div>
        <p style="font-size: 13px;">${search ? "No matches." : "No conversations yet. Click New."}</p>
      </div>`;
    return;
  }
  list.innerHTML = filtered.map(c => {
    const u = c.otherUser;
    const initials = u ? initialsFromName(u.name) : "?";
    const avatarHTML = (u && u.avatarUrl) ? `<img src="${u.avatarUrl}" alt="" />` : escapeHtml(initials);
    const preview = c.lastMessage ? (c.lastMessage.from === myEmail ? "You: " : "") + c.lastMessage.text : "No messages yet";
    return `
      <div class="conv-item ${c.unread > 0 ? "unread" : ""} ${c.convId === activeConvId ? "active" : ""}" data-conv-id="${c.convId}" data-other-email="${escapeHtml(c.otherEmail)}">
        <div class="conv-avatar">${avatarHTML}</div>
        <div class="conv-body">
          <div class="conv-top">
            <div class="conv-name">${escapeHtml(u ? u.name : c.otherEmail)}</div>
            <div class="conv-time">${formatMessageTime(c.lastMessageAt)}</div>
          </div>
          <div class="conv-role">${escapeHtml(u ? u.role : "")}</div>
          <div class="conv-preview">${escapeHtml(preview).slice(0, 80)}</div>
        </div>
        ${c.unread > 0 ? '<div class="conv-unread-dot"></div>' : ""}
      </div>
    `;
  }).join("");
  list.querySelectorAll(".conv-item").forEach(el => {
    el.addEventListener("click", () => openConversation(el.dataset.convId, el.dataset.otherEmail));
  });
}

async function openConversation(convId, otherEmail) {
  if (!CURRENT_USER) return;
  activeConvId = convId;
  activeOtherEmail = otherEmail;
  markThreadRead(convId, CURRENT_USER.email);
  const other = USERS_CACHE.find(u => u.email === otherEmail);
  const shell = document.getElementById("messages-shell");
  if (window.innerWidth <= 900) shell?.classList.add("thread-open");
  const empty = document.getElementById("messages-empty");
  const thread = document.getElementById("thread-container");
  if (empty) empty.style.display = "none";
  if (thread) thread.style.display = "flex";
  const initials = other ? initialsFromName(other.name) : "?";
  const avatarHTML = (other && other.avatarUrl) ? `<img src="${other.avatarUrl}" alt="" />` : escapeHtml(initials);
  const avEl = document.getElementById("thread-avatar");
  const nameEl = document.getElementById("thread-name");
  const roleEl = document.getElementById("thread-role");
  if (avEl) avEl.innerHTML = avatarHTML;
  if (nameEl) nameEl.textContent = other ? other.name : otherEmail;
  if (roleEl) roleEl.textContent = other ? other.role : "";
  if (unsubThread) unsubThread();
  unsubThread = subscribeThread(convId, msgs => paintThread(msgs, CURRENT_USER.email));
  setTimeout(() => document.getElementById("thread-input")?.focus(), 100);
}

function paintThread(msgs, myEmail) {
  const el = document.getElementById("thread-messages");
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: var(--ink-faint); font-size: 13px;">No messages yet. Say hello!</div>`;
    return;
  }
  let html = "";
  let lastDate = null;
  msgs.forEach(m => {
    const sentAt = m.sentAt?.toDate?.() || new Date();
    const dateStr = sentAt.toDateString();
    if (dateStr !== lastDate) {
      html += `<div class="msg-date-separator">${formatDateHeader(sentAt)}</div>`;
      lastDate = dateStr;
    }
    const isMine = m.from === myEmail;
    html += `
      <div class="msg-bubble ${isMine ? "mine" : "theirs"}">
        ${escapeHtml(m.text).replace(/\n/g, "<br/>")}
        <div class="msg-meta">${formatBubbleTime(sentAt)}${isMine ? " ✓" + (m.read ? "✓" : "") : ""}</div>
      </div>
    `;
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

async function sendCurrentThreadMessage() {
  if (!activeConvId || !CURRENT_USER || !activeOtherEmail) return;
  const input = document.getElementById("thread-input");
  const text = input.value.trim();
  if (!text) return;
  await sendMessage(CURRENT_USER.email, activeOtherEmail, text);
  input.value = "";
  input.style.height = "auto";
}

function openCompose(recipientEmail) {
  if (!CURRENT_USER) { openAuthModal("signin"); return; }
  const others = USERS_CACHE.filter(u => u.email !== CURRENT_USER.email);
  if (!others.length) {
    openModal(`<h3>No users to message yet</h3><p>Once other members join SciPool, you can message them here.</p><button class="btn" onclick="closeModal()" style="width:100%;">Close</button>`);
    return;
  }
  const list = others.map(u => {
    const initials = initialsFromName(u.name);
    const avatarHTML = u.avatarUrl ? `<img src="${u.avatarUrl}" alt="" />` : escapeHtml(initials);
    const selected = recipientEmail === u.email ? "selected" : "";
    return `
      <div class="user-select-item ${selected}" data-email="${escapeHtml(u.email)}">
        <div class="us-avatar">${avatarHTML}</div>
        <div class="us-info">
          <div class="us-name">${escapeHtml(u.name)}</div>
          <div class="us-meta">${escapeHtml(u.email)}</div>
          <div class="us-role">${escapeHtml(u.role)}</div>
        </div>
      </div>
    `;
  }).join("");
  openModal(`
    <h3>New message</h3>
    <form id="compose-form">
      <div class="form-row">
        <label>Send to <span class="req">*</span></label>
        <input type="text" id="compose-search" placeholder="Search users" style="margin-bottom: 8px;" />
        <div class="user-select-list" id="compose-user-list">${list}</div>
        <input type="hidden" id="compose-recipient" value="${recipientEmail ? escapeHtml(recipientEmail) : ""}" />
      </div>
      <div class="form-row">
        <label>Message <span class="req">*</span></label>
        <textarea id="compose-text" required style="min-height: 120px;"></textarea>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-black" onclick="closeModal()" style="flex: 1;">Cancel</button>
        <button type="submit" class="btn" style="flex: 2;">Send Message</button>
      </div>
    </form>
  `);
  const userList = document.getElementById("compose-user-list");
  userList.querySelectorAll(".user-select-item").forEach(el => {
    el.addEventListener("click", () => {
      userList.querySelectorAll(".user-select-item").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      document.getElementById("compose-recipient").value = el.dataset.email;
    });
  });
  document.getElementById("compose-search").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    userList.querySelectorAll(".user-select-item").forEach(el => {
      const match = el.querySelector(".us-name").textContent.toLowerCase().includes(q) ||
                    el.querySelector(".us-meta").textContent.toLowerCase().includes(q);
      el.style.display = match ? "" : "none";
    });
  });
  document.getElementById("compose-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const recipient = document.getElementById("compose-recipient").value;
    if (!recipient) { alert("Pick a recipient."); return; }
    const text = document.getElementById("compose-text").value;
    if (!text.trim()) { alert("Write a message."); return; }
    await sendMessage(CURRENT_USER.email, recipient, text);
    closeModal();
    goTo("messages");
    setTimeout(() => openConversation([CURRENT_USER.email, recipient].sort().join("::"), recipient), 300);
  });
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
   ADMIN + CHAPTERS
   ============================================================ */

function renderAdmin() {
  if (!CURRENT_USER || !isAdmin(CURRENT_USER)) {
    const el = document.getElementById("view-admin");
    if (el) el.innerHTML = `
      <div class="alert alert-warn" style="margin:20px;">
        <strong>Admin only.</strong> This dashboard is for platform administrators. You are signed in as ${escapeHtml(CURRENT_USER ? CURRENT_USER.email : "not signed in")}.
      </div>
    `;
    return;
  }
  setAdminInnovations(DB);
  renderAdminDashboard();
}

async function deleteItem(id) {
  if (!confirm("Delete this submission?")) return;
  await deleteInnovation(id);
}

function initChapterSelect() {
  const sel = document.getElementById("chapter-select");
  if (!sel) return;
  const unisInDB = [...new Set(DB.map(d => d.university))];
  const all = [...new Set([...UNIVERSITIES, ...unisInDB])].sort();
  sel.innerHTML = all.map(u => `<option ${u === currentChapter ? "selected" : ""}>${escapeHtml(u)}</option>`).join("");
  sel.onchange = () => { currentChapter = sel.value; renderChapterDashboard(); };
}

function renderChapterDashboard() {
  initChapterSelect();
  const items = DB.filter(d => d.university === currentChapter);
  const total = items.length;
  const sectors = new Set(items.map(d => d.sector)).size;
  const avgTrl = total ? (items.reduce((s,d) => s + d.trl, 0) / total).toFixed(1) : "N/A";
  const protectedCount = items.filter(d => d.hash).length;
  const kpiGrid = document.getElementById("chapter-kpis");
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi"><div class="kpi-label">Total submissions</div><div class="kpi-value">${total}</div></div>
      <div class="kpi red"><div class="kpi-label">Sectors</div><div class="kpi-value">${sectors}</div></div>
      <div class="kpi black"><div class="kpi-label">Average TRL</div><div class="kpi-value">${avgTrl}</div></div>
      <div class="kpi"><div class="kpi-label">IP protected</div><div class="kpi-value">${protectedCount}</div></div>
    `;
  }
  const tbody = document.getElementById("chapter-table");
  if (tbody) {
    tbody.innerHTML = !items.length
      ? `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--ink-faint);">No submissions from ${escapeHtml(currentChapter)} yet.</td></tr>`
      : items.slice().reverse().map(d => `
        <tr>
          <td>${d.createdAt?.toDate ? new Date(d.createdAt.toDate()).toLocaleDateString("en-GB") : ""}</td>
          <td><strong style="color:var(--ink);">${escapeHtml(d.title)}</strong></td>
          <td>${escapeHtml(d.author)}</td>
          <td>${escapeHtml(d.sector)}</td>
          <td><span class="badge-trl">${d.trl}</span></td>
          <td>${escapeHtml(d.status || "")}</td>
          <td><button class="btn btn-sm" onclick="openDrawer('${d.id}')" type="button">View</button></td>
        </tr>`).join("");
  }
  const byAuthor = {};
  items.forEach(d => {
    if (!byAuthor[d.author]) byAuthor[d.author] = { count: 0, sectors: new Set() };
    byAuthor[d.author].count += 1;
    byAuthor[d.author].sectors.add(d.sector);
  });
  const leaders = Object.entries(byAuthor).map(([name, v]) => ({ name, count: v.count, sectors: v.sectors.size })).sort((a,b) => b.count - a.count).slice(0,5);
  const lbUni = document.getElementById("lb-university-name");
  if (lbUni) lbUni.textContent = currentChapter;
  const lb = document.getElementById("chapter-leaderboard");
  if (lb) {
    lb.innerHTML = leaders.length
      ? leaders.map((l,i) => `<div class="lb-row"><div class="lb-rank">${i+1}</div><div class="lb-info"><div class="lb-name">${escapeHtml(l.name)}</div><div class="lb-sub">${l.sectors} sector${l.sectors!==1?"s":""}</div></div><div class="lb-count">${l.count}</div></div>`).join("")
      : '<p style="color:var(--ink-faint); font-size:13px;">No contributors yet.</p>';
  }
  const byUni = {};
  DB.forEach(d => {
    if (!byUni[d.university]) byUni[d.university] = { count: 0, trlSum: 0 };
    byUni[d.university].count += 1;
    byUni[d.university].trlSum += d.trl;
  });
  const national = Object.entries(byUni).map(([name, v]) => ({ name, count: v.count, avgTrl: (v.trlSum/v.count).toFixed(1) })).sort((a,b) => b.count - a.count);
  const nl = document.getElementById("national-leaderboard");
  if (nl) {
    nl.innerHTML = national.length
      ? national.map((u,i) => `<div class="lb-row"><div class="lb-rank">${i+1}</div><div class="lb-info"><div class="lb-name">${escapeHtml(u.name)}</div><div class="lb-sub">Avg TRL ${u.avgTrl}</div></div><div class="lb-count">${u.count}</div></div>`).join("")
      : '<p style="color:var(--ink-faint); font-size:13px;">No submissions yet.</p>';
  }
}

/* ============================================================
   EVENT WIRING
   ============================================================ */

function wireEvents() {
  document.querySelectorAll("nav button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => goTo(btn.dataset.view));
  });
  document.querySelectorAll("#mobile-nav-list button").forEach(btn => {
    btn.addEventListener("click", () => {
      closeMobileNav();
      setTimeout(() => goTo(btn.dataset.view), 200);
    });
  });
  document.getElementById("open-auth")?.addEventListener("click", (e) => { e.preventDefault(); openAuthModal("signin"); });
  document.getElementById("mobile-open-auth")?.addEventListener("click", () => {
    closeMobileNav();
    setTimeout(() => openAuthModal("signin"), 200);
  });

  document.getElementById("hamburger-btn")?.addEventListener("click", () => {
    const isOpen = document.getElementById("mobile-nav-drawer")?.classList.contains("active");
    isOpen ? closeMobileNav() : openMobileNav();
  });
  document.getElementById("mobile-nav-close")?.addEventListener("click", closeMobileNav);
  document.getElementById("mobile-nav-overlay")?.addEventListener("click", closeMobileNav);

  document.getElementById("user-badge")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = document.getElementById("user-dropdown");
    if (dd?.classList.contains("open")) closeUserDropdown();
    else openUserDropdown();
  });
  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("user-menu-wrap");
    if (wrap && !wrap.contains(e.target)) closeUserDropdown();
  });

  document.getElementById("modal-close")?.addEventListener("click", closeModal);
  document.getElementById("modal-bg")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-bg") closeModal();
  });
  document.getElementById("drawer-close")?.addEventListener("click", closeDrawer);
  document.getElementById("drawer-bg")?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDrawer(); closeModal(); closeMobileNav(); closeUserDropdown(); }
  });

  document.getElementById("search-input")?.addEventListener("input", e => {
    browseState.query = e.target.value;
    renderBrowse();
  });
  document.getElementById("sort-select")?.addEventListener("change", e => {
    browseState.sort = e.target.value;
    renderBrowse();
  });
  document.getElementById("clear-filters")?.addEventListener("click", () => {
    browseState = { query: "", sector: "", university: "", trl: "", sort: "newest", savedOnly: false };
    const si = document.getElementById("search-input"); if (si) si.value = "";
    const ss = document.getElementById("sort-select"); if (ss) ss.value = "newest";
    document.querySelectorAll(".mobile-chip").forEach(c => c.classList.remove("active"));
    document.querySelector('.mobile-chip[data-chip-type="all"]')?.classList.add("active");
    renderBrowse();
  });

  document.querySelectorAll(".mobile-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".mobile-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      browseState = { query: "", sector: "", university: "", trl: "", sort: "newest", savedOnly: false };
      const type = chip.dataset.chipType;
      if (type === "trl6") browseState.trl = "6";
      else if (type === "mak") browseState.university = "Makerere University";
      else if (type === "must") browseState.university = "Mbarara University of Science and Technology";
      else if (type === "busitema") browseState.university = "Busitema University";
      else if (type === "energy") browseState.sector = "Renewable Energy";
      else if (type === "health") browseState.sector = "Health and Pharmaceuticals";
      else if (type === "ict") browseState.sector = "ICT and Artificial Intelligence";
      renderBrowse();
    });
  });

  document.getElementById("submit-form")?.addEventListener("submit", handleSubmitForm);

  const mediaDrop = document.getElementById("media-drop");
  const mediaInput = document.getElementById("media-input");
  mediaDrop?.addEventListener("click", () => mediaInput.click());
  mediaDrop?.addEventListener("dragover", e => { e.preventDefault(); mediaDrop.classList.add("dragover"); });
  mediaDrop?.addEventListener("dragleave", () => mediaDrop.classList.remove("dragover"));
  mediaDrop?.addEventListener("drop", async e => {
    e.preventDefault();
    mediaDrop.classList.remove("dragover");
    await handleFiles(e.dataTransfer.files);
  });
  mediaInput?.addEventListener("change", async e => {
    await handleFiles(e.target.files);
    mediaInput.value = "";
  });

  document.getElementById("compose-new-btn")?.addEventListener("click", () => openCompose());
  document.getElementById("compose-new-btn-2")?.addEventListener("click", () => openCompose());
  document.getElementById("msg-search")?.addEventListener("input", renderMessages);
  document.getElementById("thread-send-btn")?.addEventListener("click", sendCurrentThreadMessage);
  document.getElementById("thread-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentThreadMessage();
    }
  });
  document.getElementById("thread-input")?.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 140) + "px";
  });
  document.getElementById("thread-delete-btn")?.addEventListener("click", async () => {
    if (!activeConvId) return;
    if (!confirm("Delete this conversation?")) return;
    await deleteConversation(activeConvId);
    activeConvId = null;
    document.getElementById("thread-container").style.display = "none";
    document.getElementById("messages-empty").style.display = "flex";
    document.getElementById("messages-shell")?.classList.remove("thread-open");
    renderMessages();
  });
  document.getElementById("thread-back-btn")?.addEventListener("click", () => {
    document.getElementById("messages-shell")?.classList.remove("thread-open");
    activeConvId = null;
    document.getElementById("thread-container").style.display = "none";
    document.getElementById("messages-empty").style.display = "flex";
  });

  document.getElementById("chapter-export")?.addEventListener("click", () => {
    const items = DB.filter(d => d.university === currentChapter);
    if (!items.length) { alert("Nothing to export."); return; }
    const lines = ["SciPool UG Chapter Report", `University: ${currentChapter}`, `Generated: ${new Date().toLocaleString("en-GB")}`, `Total: ${items.length}`, ""];
    items.forEach((d, i) => lines.push(`${i+1}. ${d.title}. By ${d.author}. TRL ${d.trl}`));
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SciPoolUG_Chapter_${currentChapter.replace(/\s+/g,"_")}.txt`;
    a.click();
  });
}

/* ============================================================
   EXPOSE FOR INLINE HANDLERS
   ============================================================ */

window.goTo = goTo;
window.openAuthModal = openAuthModal;
window.closeModal = closeModal;
window.openProfile = openProfile;
window.openProfileEdit = openProfileEdit;
window.signOut = signOut;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.toggleSaved = toggleSaved;
window.openCompose = openCompose;
window.closeUserDropdown = closeUserDropdown;
window.removePendingMedia = removePendingMedia;
window.showSavedOnly = showSavedOnly;
window.browseBySector = browseBySector;
window.switchAuthTab = switchAuthTab;
window.startForgotPassword = startForgotPassword;
window.deleteItem = deleteItem;
window.openMobileNav = openMobileNav;
window.closeMobileNav = closeMobileNav;
window.openUserDropdown = openUserDropdown;

/* ============================================================
   INIT
   ============================================================ */

function init() {
  wireEvents();
  updateAuthUI();
  renderStats();
  renderPublicLanding();
  renderBrowse();
  renderChapterDashboard();
  updateSavedBanner();
  applyUnreadBadge(0);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
/* ============================================================
   Uganda Map Hero Counter
   Updates the live innovation count shown under the map.
   ============================================================ */

function updateUgCounter() {
  const el = document.getElementById("ug-live-count");
  if (!el) return;
  const total = DB.length;
  animateNumber(el, total);
}

function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;
  const duration = 800;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// Call it whenever the DB updates. Add to the subscribeInnovations callback.
console.log("SciPool: app.js loaded (full version with admin)");
