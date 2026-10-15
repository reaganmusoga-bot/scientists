/* ============================================================
   SciPool UG — Admin Dashboard
   Submissions moderation, researcher management, featuring.
   ============================================================ */

import {
  setFeatured, setEditorPick, setAdminStatus, setAdminNotes,
  verifyUser, featureUser, suspendUser, setUserAdminNotes,
  listAllUsersWithStats, deleteInnovation, listUsers
} from "./data.js";
import {
  collection, query, where, getDocs, writeBatch, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase.js";

/* ============================================================
   STATE
   ============================================================ */

let adminState = {
  tab: "submissions",
  submissionsQuery: "",
  submissionsFilter: "all",
  researchersQuery: "",
  researchersFilter: "all",
  cachedUsers: null,
  currentInnovations: [],
  adminEmail: "reaganmusoga@gmail.com"
};

/* ============================================================
   EXPORTS
   ============================================================ */

export function isAdmin(user) {
  return !!(user && user.email === adminState.adminEmail);
}

export function setAdminInnovations(items) {
  adminState.currentInnovations = items;
}

/* ============================================================
   HELPERS
   ============================================================ */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function flash(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:var(--charcoal); color:var(--gold); padding:10px 22px;
    border-radius:24px; font-weight:800; font-size:13px; z-index:9999;
    box-shadow:0 8px 24px rgba(0,0,0,0.3); letter-spacing:0.5px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function openModalSafe(html) {
  if (typeof window.openModal === "function") {
    window.openModal(html);
  } else {
    console.error("window.openModal is not defined. Expose it in app.js.");
    alert("Modal system not available. Check console.");
  }
}

function closeModalSafe() {
  if (typeof window.closeModal === "function") {
    window.closeModal();
  }
}

/* ============================================================
   MAIN RENDER
   ============================================================ */

export function renderAdminDashboard() {
  const container = document.getElementById("view-admin");
  if (!container) return;

  container.innerHTML = `
    <div class="chapter-header" style="margin-bottom:22px;">
      <h2>Platform <span>Administration</span></h2>
      <p>Manage every submission, every researcher, and what gets featured on the homepage.</p>
    </div>

    <div class="tab-switch" id="admin-tabs">
      <button data-admin-tab="submissions" class="${adminState.tab === "submissions" ? "active" : ""}">📋 Submissions</button>
      <button data-admin-tab="researchers" class="${adminState.tab === "researchers" ? "active" : ""}">👥 Researchers</button>
      <button data-admin-tab="featured" class="${adminState.tab === "featured" ? "active" : ""}">⭐ Featured</button>
    </div>

    <div id="admin-tab-content"></div>
  `;

  container.querySelectorAll("[data-admin-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      adminState.tab = btn.dataset.adminTab;
      renderAdminDashboard();
    });
  });

  const content = document.getElementById("admin-tab-content");
  if (adminState.tab === "submissions") renderSubmissionsTab(content);
  else if (adminState.tab === "researchers") renderResearchersTab(content);
  else renderFeaturedTab(content);
}

/* ============================================================
   TAB 1: SUBMISSIONS
   ============================================================ */

function renderSubmissionsTab(el) {
  const all = adminState.currentInnovations;
  const stats = {
    total: all.length,
    featured: all.filter(i => i.featured).length,
    pending: all.filter(i => !i.adminStatus || i.adminStatus === "pending" || i.adminStatus === "submitted").length,
    disputed: all.filter(i => i.adminStatus === "disputed").length,
    archived: all.filter(i => i.adminStatus === "archived").length
  };

  el.innerHTML = `
    <div class="dash-kpis" style="margin-bottom:18px;">
      <div class="dash-kpi"><div class="k-lbl">Total</div><div class="k-val">${stats.total}</div></div>
      <div class="dash-kpi black"><div class="k-lbl">Featured</div><div class="k-val">${stats.featured}</div></div>
      <div class="dash-kpi red"><div class="k-lbl">Pending</div><div class="k-val">${stats.pending}</div></div>
      <div class="dash-kpi red"><div class="k-lbl">Disputed</div><div class="k-val">${stats.disputed}</div></div>
    </div>

    <div class="browse-toolbar" style="margin-bottom:16px;">
      <div class="search-big">
        <input type="text" id="admin-sub-search" placeholder="Search by title, author, university, sector" value="${esc(adminState.submissionsQuery)}" />
      </div>
      <select id="admin-sub-filter">
        ${["all","featured","pending","active","disputed","archived","rejected"].map(f =>
          `<option value="${f}" ${adminState.submissionsFilter === f ? "selected" : ""}>${labelForFilter(f)}</option>`
        ).join("")}
      </select>
      <button class="btn btn-sm btn-outline" id="admin-export-sub" type="button">Export CSV</button>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Featured</th>
            <th>Title</th>
            <th>Author</th>
            <th>University</th>
            <th>Sector</th>
            <th>TRL</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-sub-tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById("admin-sub-search").addEventListener("input", e => {
    adminState.submissionsQuery = e.target.value;
    paintSubmissionRows();
  });
  document.getElementById("admin-sub-filter").addEventListener("change", e => {
    adminState.submissionsFilter = e.target.value;
    paintSubmissionRows();
  });
  document.getElementById("admin-export-sub").addEventListener("click", exportSubmissionsCSV);

  paintSubmissionRows();
}

function labelForFilter(f) {
  return {
    all: "All submissions",
    featured: "Featured only",
    pending: "Pending review",
    active: "Active",
    disputed: "Disputed ownership",
    archived: "Archived",
    rejected: "Rejected"
  }[f] || f;
}

function paintSubmissionRows() {
  const tbody = document.getElementById("admin-sub-tbody");
  if (!tbody) return;

  let list = adminState.currentInnovations.slice();

  const q = adminState.submissionsQuery.toLowerCase().trim();
  if (q) {
    list = list.filter(i =>
      ((i.title || "") + " " + (i.author || "") + " " + (i.university || "") + " " + (i.sector || ""))
        .toLowerCase().includes(q)
    );
  }
  const f = adminState.submissionsFilter;
  if (f === "featured") list = list.filter(i => i.featured);
  else if (f === "pending") list = list.filter(i => !i.adminStatus || i.adminStatus === "pending" || i.adminStatus === "submitted");
  else if (f === "active") list = list.filter(i => i.adminStatus === "active");
  else if (f === "disputed") list = list.filter(i => i.adminStatus === "disputed");
  else if (f === "archived") list = list.filter(i => i.adminStatus === "archived");
  else if (f === "rejected") list = list.filter(i => i.adminStatus === "rejected");

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--ink-faint);">No submissions match.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(i => `
    <tr data-id="${i.id}">
      <td>
        <button class="btn-tiny ${i.featured ? "yellow" : "outline"}" data-act="toggle-feature" data-id="${i.id}" type="button">
          ${i.featured ? "⭐ On" : "☆ Off"}
        </button>
      </td>
      <td>
        <strong style="color:var(--ink);">${esc(i.title || "")}</strong>
        ${i.editorPick ? '<span class="pill published" style="margin-left:6px; font-size:9px;">Editor pick</span>' : ""}
      </td>
      <td>${esc(i.author || "")}</td>
      <td>${esc(i.university || "")}</td>
      <td>${esc(i.sector || "")}</td>
      <td><span class="badge-trl">${i.trl || "?"}</span></td>
      <td>${statusPill(i.adminStatus)}</td>
      <td style="white-space:nowrap;">
        <button class="btn-tiny outline" data-act="view" data-id="${i.id}" type="button">View</button>
        <button class="btn-tiny black" data-act="edit" data-id="${i.id}" type="button">Manage</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "toggle-feature") {
        const item = adminState.currentInnovations.find(x => x.id === id);
        if (!item) return;
        const newVal = !item.featured;
        item.featured = newVal;
        btn.classList.toggle("yellow", newVal);
        btn.classList.toggle("outline", !newVal);
        btn.textContent = newVal ? "⭐ On" : "☆ Off";
        try {
          await setFeatured(id, newVal);
          flash(newVal ? "Featured" : "Unfeatured");
        } catch (err) {
          console.error(err);
          item.featured = !newVal;
          btn.classList.toggle("yellow", !newVal);
          btn.classList.toggle("outline", newVal);
          btn.textContent = !newVal ? "⭐ On" : "☆ Off";
          flash("Update failed");
        }
      } else if (act === "view") {
        if (typeof window.openDrawer === "function") window.openDrawer(id);
      } else if (act === "edit") {
        openManageSubmissionModal(id);
      }
    });
  });
}

function statusPill(status) {
  const s = (status || "submitted").toLowerCase();
  const map = {
    submitted: "background:#FFF4E5;color:#6b3d00;",
    pending: "background:#FFF4E5;color:#6b3d00;",
    active: "background:#E8F3E3;color:#1e3a0f;",
    published: "background:#E8F3E3;color:#1e3a0f;",
    disputed: "background:#FFD9DF;color:#9B0A22;",
    archived: "background:#EEE;color:#555;",
    rejected: "background:#FFE5E9;color:#9B0A22;"
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="pill" style="${map[s] || map.submitted}">${label}</span>`;
}

async function openManageSubmissionModal(id) {
  const item = adminState.currentInnovations.find(x => x.id === id);
  if (!item) {
    console.warn("Manage: item not found", id);
    return;
  }

  const currentStatus = item.adminStatus || "submitted";
  const allowedStatuses = ["active", "pending", "submitted", "disputed", "archived", "rejected"];

  const html = `
    <h3>Manage submission</h3>
    <p style="color:var(--ink-soft); font-size:13px; margin-bottom:16px;">
      ${esc(item.title)} — <strong>${esc(item.author)}</strong> (${esc(item.university)})
    </p>

    <div class="section-label">Status</div>
    <div class="role-cards" style="grid-template-columns: repeat(3,1fr);">
      ${allowedStatuses.map(s => `
        <div class="role-card ${currentStatus === s ? "selected" : ""}" data-status="${s}" style="text-align:center;">
          <div class="role-name" style="font-size:12px;">${s.charAt(0).toUpperCase() + s.slice(1)}</div>
        </div>
      `).join("")}
    </div>

    <div class="section-label" style="margin-top:20px;">Promotions</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
      <button class="btn btn-sm ${item.featured ? "btn-black" : "btn-outline"}" id="m-toggle-featured" type="button">
        ${item.featured ? "⭐ Featured" : "☆ Feature"}
      </button>
      <button class="btn btn-sm ${item.editorPick ? "btn-black" : "btn-outline"}" id="m-toggle-editor" type="button">
        ${item.editorPick ? "🏆 Editor's pick" : "🏆 Mark Editor's pick"}
      </button>
    </div>

    <div class="section-label">Private admin notes (only you see this)</div>
    <textarea id="m-notes" style="min-height:100px;" placeholder="Internal notes...">${esc(item.adminNotes || "")}</textarea>

    <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-black" id="m-cancel" style="flex:1;" type="button">Cancel</button>
      <button class="btn btn-red" id="m-delete" style="flex:1;" type="button">Delete submission</button>
      <button class="btn" id="m-save" style="flex:2;" type="button">Save changes</button>
    </div>
  `;

  openModalSafe(html);

  let chosenStatus = currentStatus;
  document.querySelectorAll("#modal-content [data-status]").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#modal-content [data-status]").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      chosenStatus = card.dataset.status;
    });
  });

  document.getElementById("m-toggle-featured")?.addEventListener("click", async () => {
    const newVal = !item.featured;
    try {
      await setFeatured(id, newVal);
      item.featured = newVal;
      const btn = document.getElementById("m-toggle-featured");
      btn.className = `btn btn-sm ${newVal ? "btn-black" : "btn-outline"}`;
      btn.textContent = newVal ? "⭐ Featured" : "☆ Feature";
      flash(newVal ? "Featured" : "Unfeatured");
    } catch (err) {
      console.error(err);
      flash("Update failed");
    }
  });

  document.getElementById("m-toggle-editor")?.addEventListener("click", async () => {
    const newVal = !item.editorPick;
    try {
      await setEditorPick(id, newVal);
      item.editorPick = newVal;
      const btn = document.getElementById("m-toggle-editor");
      btn.className = `btn btn-sm ${newVal ? "btn-black" : "btn-outline"}`;
      btn.textContent = newVal ? "🏆 Editor's pick" : "🏆 Mark Editor's pick";
      flash(newVal ? "Marked as Editor's pick" : "Removed");
    } catch (err) {
      console.error(err);
      flash("Update failed");
    }
  });

  document.getElementById("m-cancel")?.addEventListener("click", closeModalSafe);

  document.getElementById("m-delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this submission permanently?")) return;
    try {
      await deleteInnovation(id);
      closeModalSafe();
      flash("Deleted");
    } catch (err) {
      console.error(err);
      flash("Delete failed");
    }
  });

  document.getElementById("m-save")?.addEventListener("click", async () => {
    try {
      await setAdminStatus(id, chosenStatus);
      await setAdminNotes(id, document.getElementById("m-notes").value);
      item.adminStatus = chosenStatus;
      item.adminNotes = document.getElementById("m-notes").value;
      closeModalSafe();
      flash("Saved");
    } catch (err) {
      console.error(err);
      flash("Save failed");
    }
  });
}

function exportSubmissionsCSV() {
  const list = adminState.currentInnovations;
  if (!list.length) { alert("Nothing to export."); return; }
  const rows = [["ID","Title","Author","Email","University","Sector","TRL","Status","Featured","EditorPick","VerificationCode"]];
  list.forEach(i => {
    rows.push([
      i.id,
      csvSafe(i.title), csvSafe(i.author), csvSafe(i.email),
      csvSafe(i.university), csvSafe(i.sector),
      i.trl || "",
      i.adminStatus || "submitted",
      i.featured ? "yes" : "no",
      i.editorPick ? "yes" : "no",
      i.verificationCode || ""
    ]);
  });
  downloadCSV(rows, "scipool-submissions.csv");
}

function csvSafe(v) {
  return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ============================================================
   TAB 2: RESEARCHERS
   ============================================================ */

async function renderResearchersTab(el) {
  el.innerHTML = `<div style="padding:40px; text-align:center; color:var(--ink-faint);">Loading researchers…</div>`;
  try {
    adminState.cachedUsers = await listAllUsersWithStats();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-warn">Could not load users: ${esc(e.message)}</div>`;
    return;
  }

  const users = adminState.cachedUsers;
  const stats = {
    total: users.length,
    verified: users.filter(u => u.verified).length,
    featured: users.filter(u => u.featured).length,
    suspended: users.filter(u => u.suspended).length
  };

  el.innerHTML = `
    <div class="dash-kpis" style="margin-bottom:18px;">
      <div class="dash-kpi"><div class="k-lbl">Registered</div><div class="k-val">${stats.total}</div></div>
      <div class="dash-kpi black"><div class="k-lbl">Verified</div><div class="k-val">${stats.verified}</div></div>
      <div class="dash-kpi red"><div class="k-lbl">Featured</div><div class="k-val">${stats.featured}</div></div>
      <div class="dash-kpi"><div class="k-lbl">Suspended</div><div class="k-val">${stats.suspended}</div></div>
    </div>

    <div class="browse-toolbar" style="margin-bottom:16px;">
      <div class="search-big">
        <input type="text" id="admin-user-search" placeholder="Search by name, email, university, role" value="${esc(adminState.researchersQuery)}" />
      </div>
      <select id="admin-user-filter">
        ${["all","verified","featured","unverified","suspended"].map(f =>
          `<option value="${f}" ${adminState.researchersFilter === f ? "selected" : ""}>${labelForUserFilter(f)}</option>`
        ).join("")}
      </select>
      <button class="btn btn-sm btn-outline" id="admin-export-users" type="button">Export CSV</button>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>University / Org</th>
            <th>Submissions</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-user-tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById("admin-user-search").addEventListener("input", e => {
    adminState.researchersQuery = e.target.value;
    paintResearcherRows();
  });
  document.getElementById("admin-user-filter").addEventListener("change", e => {
    adminState.researchersFilter = e.target.value;
    paintResearcherRows();
  });
  document.getElementById("admin-export-users").addEventListener("click", exportResearchersCSV);

  paintResearcherRows();
}

function labelForUserFilter(f) {
  return {
    all: "All researchers",
    verified: "Verified only",
    featured: "Featured only",
    unverified: "Unverified",
    suspended: "Suspended"
  }[f] || f;
}

function paintResearcherRows() {
  const tbody = document.getElementById("admin-user-tbody");
  if (!tbody || !adminState.cachedUsers) return;

  let list = adminState.cachedUsers.slice();

  const q = adminState.researchersQuery.toLowerCase().trim();
  if (q) {
    list = list.filter(u =>
      ((u.name || "") + " " + (u.email || "") + " " + (u.role || "") + " " +
       (u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || u.profile?.ministry || ""))
        .toLowerCase().includes(q)
    );
  }
  const f = adminState.researchersFilter;
  if (f === "verified") list = list.filter(u => u.verified);
  else if (f === "featured") list = list.filter(u => u.featured);
  else if (f === "unverified") list = list.filter(u => !u.verified);
  else if (f === "suspended") list = list.filter(u => u.suspended);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--ink-faint);">No researchers match.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => {
    const org = u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || u.profile?.ministry || "—";
    return `
      <tr data-uid="${u.uid}">
        <td>
          <strong style="color:var(--ink);">${esc(u.name || "")}</strong>
          ${u.featured ? '<span class="pill published" style="margin-left:6px; font-size:9px;">⭐</span>' : ""}
        </td>
        <td style="font-size:12px;">${esc(u.email || "")}</td>
        <td>${esc(u.role || "")}</td>
        <td style="font-size:12px;">${esc(org)}</td>
        <td>${u.submissionCount || 0}</td>
        <td>${userStatusPill(u)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-tiny black" data-act="manage" data-uid="${u.uid}" type="button">Manage</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.act === "manage") openManageUserModal(btn.dataset.uid);
    });
  });
}

function userStatusPill(u) {
  if (u.suspended) return `<span class="pill" style="background:#FFE5E9;color:#9B0A22;">Suspended</span>`;
  if (u.verified) return `<span class="pill" style="background:#E8F3E3;color:#1e3a0f;">Verified</span>`;
  return `<span class="pill" style="background:#FFF4E5;color:#6b3d00;">Unverified</span>`;
}

async function openManageUserModal(uid) {
  const user = adminState.cachedUsers.find(x => x.uid === uid);
  if (!user) {
    console.warn("Manage: user not found", uid);
    return;
  }

  const theirInnovations = adminState.currentInnovations.filter(i => i.email === user.email);

  const html = `
    <h3>Manage researcher</h3>
    <p style="color:var(--ink-soft); font-size:13px; margin-bottom:16px;">
      <strong>${esc(user.name || "")}</strong> · ${esc(user.email || "")} · ${esc(user.role || "")}
    </p>

    <div class="section-label">Account status</div>
    <div class="role-cards" style="grid-template-columns: repeat(2,1fr);">
      <div class="role-card ${user.verified ? "selected" : ""}" id="u-toggle-verified" style="text-align:center; cursor:pointer;">
        <div class="role-name">${user.verified ? "✓ Verified" : "Verify account"}</div>
      </div>
      <div class="role-card ${user.featured ? "selected" : ""}" id="u-toggle-featured" style="text-align:center; cursor:pointer;">
        <div class="role-name">${user.featured ? "⭐ Featured" : "Feature researcher"}</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px;">Submissions by this researcher (${theirInnovations.length})</div>
    <div style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:8px; background:var(--cream);">
      ${theirInnovations.length
        ? theirInnovations.map(i => `
            <div style="padding:10px 8px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:8px; align-items:center;">
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700;">${esc(i.title)}</div>
                <div style="font-size:11px; color:var(--ink-faint);">TRL ${i.trl || "?"} · ${esc(i.sector || "")}</div>
              </div>
              <button class="btn-tiny outline" data-view="${i.id}" type="button" style="flex-shrink:0;">View</button>
            </div>`).join("")
        : '<p style="padding:10px; font-size:12px; color:var(--ink-faint);">No submissions yet.</p>'
      }
    </div>

    <div class="section-label" style="margin-top:20px;">Private admin notes</div>
    <textarea id="u-notes" style="min-height:80px;" placeholder="Internal notes...">${esc(user.adminNotes || "")}</textarea>

    <div class="section-label" style="margin-top:20px; color:var(--flag-red);">Danger zone</div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button class="btn btn-red" id="u-delete-research" type="button" ${theirInnovations.length === 0 ? "disabled style='opacity:0.5;'" : ""}>
        🗑️ Delete all research by this researcher (${theirInnovations.length})
      </button>
      <button class="btn ${user.suspended ? "btn-black" : "btn-red"}" id="u-suspend" type="button">
        ${user.suspended ? "✓ Unsuspend account" : "🚫 Suspend account"}
      </button>
    </div>

    <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-black" id="u-cancel" style="flex:1;" type="button">Close</button>
      <button class="btn" id="u-save" style="flex:2;" type="button">Save notes</button>
    </div>
  `;

  openModalSafe(html);

  document.getElementById("u-toggle-verified")?.addEventListener("click", async () => {
    try {
      await verifyUser(uid, !user.verified);
      user.verified = !user.verified;
      const el = document.getElementById("u-toggle-verified");
      el.classList.toggle("selected", user.verified);
      el.querySelector(".role-name").textContent = user.verified ? "✓ Verified" : "Verify account";
      paintResearcherRows();
      flash("Updated");
    } catch (err) {
      console.error(err);
      flash("Update failed");
    }
  });

  document.getElementById("u-toggle-featured")?.addEventListener("click", async () => {
    try {
      await featureUser(uid, !user.featured);
      user.featured = !user.featured;
      const el = document.getElementById("u-toggle-featured");
      el.classList.toggle("selected", user.featured);
      el.querySelector(".role-name").textContent = user.featured ? "⭐ Featured" : "Feature researcher";
      paintResearcherRows();
      flash("Updated");
    } catch (err) {
      console.error(err);
      flash("Update failed");
    }
  });

  document.getElementById("u-suspend")?.addEventListener("click", async () => {
    const isSuspending = !user.suspended;
    const msg = isSuspending
      ? "Suspend this researcher? They will not be able to sign in."
      : "Unsuspend this researcher? They will be able to sign in again.";
    if (!confirm(msg)) return;

    try {
      await suspendUser(uid, isSuspending);
      user.suspended = isSuspending;
      const btn = document.getElementById("u-suspend");
      btn.className = `btn ${isSuspending ? "btn-black" : "btn-red"}`;
      btn.textContent = isSuspending ? "✓ Unsuspend account" : "🚫 Suspend account";
      paintResearcherRows();
      flash(isSuspending ? "Account suspended" : "Account reactivated");
    } catch (err) {
      console.error(err);
      flash("Update failed");
    }
  });

  document.getElementById("u-delete-research")?.addEventListener("click", async () => {
    if (!theirInnovations.length) return;
    const confirmMsg = `Permanently delete ALL ${theirInnovations.length} submission(s) by ${user.name}?\n\nThis cannot be undone. Any certificates issued for these submissions will no longer verify.`;
    if (!confirm(confirmMsg)) return;
    if (!confirm("Are you absolutely sure? This is irreversible.")) return;

    try {
      const batch = writeBatch(db);
      theirInnovations.forEach(i => {
        batch.delete(doc(db, "innovations", i.id));
      });
      await batch.commit();

      // Update local cache
      adminState.currentInnovations = adminState.currentInnovations.filter(
        i => i.email !== user.email
      );
      flash(`Deleted ${theirInnovations.length} submission(s)`);
      closeModalSafe();
      renderAdminDashboard();
    } catch (err) {
      console.error(err);
      flash("Delete failed: " + err.message);
    }
  });

  document.getElementById("u-cancel")?.addEventListener("click", closeModalSafe);
  document.getElementById("u-save")?.addEventListener("click", async () => {
    try {
      await setUserAdminNotes(uid, document.getElementById("u-notes").value);
      closeModalSafe();
      flash("Notes saved");
    } catch (err) {
      console.error(err);
      flash("Save failed");
    }
  });

  document.querySelectorAll("#modal-content [data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModalSafe();
      setTimeout(() => {
        if (typeof window.openDrawer === "function") window.openDrawer(btn.dataset.view);
      }, 150);
    });
  });
}

function exportResearchersCSV() {
  const list = adminState.cachedUsers || [];
  if (!list.length) { alert("Nothing to export."); return; }
  const rows = [["Name","Email","Role","Org","Submissions","AvgTRL","Verified","Featured","Suspended"]];
  list.forEach(u => {
    const org = u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || u.profile?.ministry || "";
    rows.push([
      csvSafe(u.name), csvSafe(u.email), csvSafe(u.role), csvSafe(org),
      u.submissionCount || 0, u.avgTrl || "",
      u.verified ? "yes" : "no", u.featured ? "yes" : "no", u.suspended ? "yes" : "no"
    ]);
  });
  downloadCSV(rows, "scipool-researchers.csv");
}

/* ============================================================
   TAB 3: FEATURED
   ============================================================ */

function renderFeaturedTab(el) {
  const all = adminState.currentInnovations;
  const featuredItems = all.filter(i => i.featured);
  const editorPicks = all.filter(i => i.editorPick);
  const featuredUsers = (adminState.cachedUsers || []).filter(u => u.featured);

  el.innerHTML = `
    <div class="alert alert-info">
      Featured items appear at the top of the homepage. Editor's picks get a special badge. Featured researchers appear in the "Featured Innovators" strip on the homepage.
    </div>

    <div class="section-header-row" style="margin-top:20px;">
      <h3 class="section-title">⭐ Featured innovations (${featuredItems.length})</h3>
    </div>
    ${renderFeaturedItemsList(featuredItems, "innovation")}

    <div class="section-header-row" style="margin-top:30px;">
      <h3 class="section-title">🏆 Editor's picks (${editorPicks.length})</h3>
    </div>
    ${renderFeaturedItemsList(editorPicks, "editor")}

    <div class="section-header-row" style="margin-top:30px;">
      <h3 class="section-title">👤 Featured researchers (${featuredUsers.length})</h3>
    </div>
    ${renderFeaturedUsersList(featuredUsers)}
  `;

  el.querySelectorAll("[data-unfeature]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.unfeature;
      try {
        await setFeatured(id, false);
        const item = adminState.currentInnovations.find(x => x.id === id);
        if (item) item.featured = false;
        renderAdminDashboard();
        flash("Unfeatured");
      } catch (err) {
        console.error(err);
        flash("Update failed");
      }
    });
  });
  el.querySelectorAll("[data-uneditor]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.uneditor;
      try {
        await setEditorPick(id, false);
        const item = adminState.currentInnovations.find(x => x.id === id);
        if (item) item.editorPick = false;
        renderAdminDashboard();
        flash("Removed");
      } catch (err) {
        console.error(err);
        flash("Update failed");
      }
    });
  });
  el.querySelectorAll("[data-unfeature-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.unfeatureUser;
      try {
        await featureUser(uid, false);
        const u = adminState.cachedUsers?.find(x => x.uid === uid);
        if (u) u.featured = false;
        renderAdminDashboard();
        flash("Unfeatured");
      } catch (err) {
        console.error(err);
        flash("Update failed");
      }
    });
  });
}

function renderFeaturedItemsList(items, kind) {
  if (!items.length) {
    return `<p style="color:var(--ink-faint); font-size:13px; padding:12px 0;">Nothing ${kind === "editor" ? "marked as editor's pick" : "featured"} yet.</p>`;
  }
  return `
    <div class="feed-list">
      ${items.map(i => `
        <div class="inn-card" style="border-left-color: var(--gold);">
          <div class="inn-card-body">
            <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">
              <div style="flex:1; min-width:0;">
                <h4 style="margin-bottom:6px; font-size:15px;">${esc(i.title)}</h4>
                <div style="font-size:12px; color:var(--ink-soft);">${esc(i.author)} · ${esc(i.university)}</div>
              </div>
              <button class="btn-tiny btn-red" ${kind === "editor" ? `data-uneditor="${i.id}"` : `data-unfeature="${i.id}"`} type="button">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFeaturedUsersList(users) {
  if (!users.length) {
    return `<p style="color:var(--ink-faint); font-size:13px; padding:12px 0;">No featured researchers yet.</p>`;
  }
  return `
    <div class="feed-list">
      ${users.map(u => `
        <div class="inn-card" style="border-left-color: var(--flag-red);">
          <div class="inn-card-body">
            <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">
              <div style="flex:1; min-width:0;">
                <h4 style="margin-bottom:6px; font-size:15px;">${esc(u.name)}</h4>
                <div style="font-size:12px; color:var(--ink-soft);">${esc(u.email)} · ${esc(u.role)}</div>
              </div>
              <button class="btn-tiny btn-red" data-unfeature-user="${u.uid}" type="button">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
