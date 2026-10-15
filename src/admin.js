/* ============================================================
   SciPool UG — Admin Dashboard Module
   Only usable by the admin account.
   ============================================================ */

import {
  setFeatured, setEditorPick, setAdminStatus, setAdminNotes,
  verifyUser, featureUser, suspendUser, setUserAdminNotes,
  listAllUsersWithStats, getInnovationsByAuthor,
  deleteInnovation, listUsers
} from "./data.js";

/* ============================================================
   STATE
   ============================================================ */

let adminState = {
  tab: "submissions",       // submissions | researchers | featured
  submissionsQuery: "",
  submissionsFilter: "all", // all | featured | pending | active | archived | rejected
  researchersQuery: "",
  researchersFilter: "all", // all | verified | featured | suspended | unverified
  cachedUsers: null,        // populated on demand
  currentInnovations: [],   // set by app.js before render
  adminEmail: "reaganmusoga@gmail.com"
};

/* ============================================================
   EXPORT: check if current user is admin
   ============================================================ */

export function isAdmin(user) {
  return !!(user && user.email === adminState.adminEmail);
}

/* ============================================================
   SETTER for app.js to hand in the innovations array
   ============================================================ */

export function setAdminInnovations(items) {
  adminState.currentInnovations = items;
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
    pending: all.filter(i => !i.adminStatus || i.adminStatus === "pending").length,
    archived: all.filter(i => i.adminStatus === "archived").length,
    rejected: all.filter(i => i.adminStatus === "rejected").length
  };

  el.innerHTML = `
    <div class="dash-kpis" style="margin-bottom:18px;">
      <div class="dash-kpi"><div class="k-lbl">Total</div><div class="k-val">${stats.total}</div></div>
      <div class="dash-kpi black"><div class="k-lbl">Featured</div><div class="k-val">${stats.featured}</div></div>
      <div class="dash-kpi red"><div class="k-lbl">Pending</div><div class="k-val">${stats.pending}</div></div>
      <div class="dash-kpi"><div class="k-lbl">Archived</div><div class="k-val">${stats.archived}</div></div>
    </div>

    <div class="browse-toolbar" style="margin-bottom:16px;">
      <div class="search-big">
        <input type="text" id="admin-sub-search" placeholder="Search by title, author, university, sector" value="${escapeAttr(adminState.submissionsQuery)}" />
      </div>
      <select id="admin-sub-filter">
        ${["all","featured","pending","active","archived","rejected"].map(f =>
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
  else if (f === "pending") list = list.filter(i => !i.adminStatus || i.adminStatus === "pending");
  else if (f === "active") list = list.filter(i => i.adminStatus === "active");
  else if (f === "archived") list = list.filter(i => i.adminStatus === "archived");
  else if (f === "rejected") list = list.filter(i => i.adminStatus === "rejected");

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--ink-faint);">No submissions match.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(i => `
    <tr data-id="${i.id}">
      <td>
        <button class="btn-tiny ${i.featured ? "yellow" : "outline"}" data-act="toggle-feature" data-id="${i.id}" type="button" title="${i.featured ? "Unfeature" : "Feature"}">
          ${i.featured ? "⭐ On" : "☆ Off"}
        </button>
      </td>
      <td>
        <strong style="color:var(--ink);">${escapeHtml(i.title || "")}</strong>
        ${i.editorPick ? '<span class="pill published" style="margin-left:6px; font-size:9px;">Editor pick</span>' : ""}
      </td>
      <td>${escapeHtml(i.author || "")}</td>
      <td>${escapeHtml(i.university || "")}</td>
      <td>${escapeHtml(i.sector || "")}</td>
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
        await setFeatured(id, !item?.featured);
        flash("Updated");
      } else if (act === "view") {
        window.openDrawer?.(id);
      } else if (act === "edit") {
        openManageSubmissionModal(id);
      }
    });
  });
}

function statusPill(status) {
  const s = status || "pending";
  const map = {
    pending: "background:#FFF4E5;color:#6b3d00;",
    active: "background:#E8F3E3;color:#1e3a0f;",
    archived: "background:#EEE;color:#555;",
    rejected: "background:#FFE5E9;color:#9B0A22;"
  };
  return `<span class="pill" style="${map[s] || map.pending}">${s}</span>`;
}

async function openManageSubmissionModal(id) {
  const item = adminState.currentInnovations.find(x => x.id === id);
  if (!item) return;

  const html = `
    <h3>Manage submission</h3>
    <p style="color:var(--ink-soft); font-size:13px; margin-bottom:16px;">${escapeHtml(item.title)}</p>

    <div class="section-label">Status</div>
    <div class="role-cards" style="grid-template-columns: repeat(2,1fr);">
      ${["active","pending","archived","rejected"].map(s => `
        <div class="role-card ${(item.adminStatus || "pending") === s ? "selected" : ""}" data-status="${s}" style="text-align:center;">
          <div class="role-name">${s.charAt(0).toUpperCase() + s.slice(1)}</div>
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
    <textarea id="m-notes" style="min-height:100px;" placeholder="Internal notes about this submission...">${escapeHtml(item.adminNotes || "")}</textarea>

    <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-black" id="m-cancel" style="flex:1;" type="button">Cancel</button>
      <button class="btn btn-red" id="m-delete" style="flex:1;" type="button">Delete submission</button>
      <button class="btn" id="m-save" style="flex:2;" type="button">Save changes</button>
    </div>
  `;

  window.openModal?.(html);

  let chosenStatus = item.adminStatus || "pending";
  document.querySelectorAll("#modal-content [data-status]").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#modal-content [data-status]").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      chosenStatus = card.dataset.status;
    });
  });

  document.getElementById("m-toggle-featured").addEventListener("click", async () => {
    const newVal = !item.featured;
    await setFeatured(id, newVal);
    item.featured = newVal;
    const btn = document.getElementById("m-toggle-featured");
    btn.className = `btn btn-sm ${newVal ? "btn-black" : "btn-outline"}`;
    btn.textContent = newVal ? "⭐ Featured" : "☆ Feature";
  });

  document.getElementById("m-toggle-editor").addEventListener("click", async () => {
    const newVal = !item.editorPick;
    await setEditorPick(id, newVal);
    item.editorPick = newVal;
    const btn = document.getElementById("m-toggle-editor");
    btn.className = `btn btn-sm ${newVal ? "btn-black" : "btn-outline"}`;
    btn.textContent = newVal ? "🏆 Editor's pick" : "🏆 Mark Editor's pick";
  });

  document.getElementById("m-cancel").addEventListener("click", () => window.closeModal?.());

  document.getElementById("m-delete").addEventListener("click", async () => {
    if (!confirm("Delete this submission permanently?")) return;
    await deleteInnovation(id);
    window.closeModal?.();
    flash("Deleted");
  });

  document.getElementById("m-save").addEventListener("click", async () => {
    await setAdminStatus(id, chosenStatus);
    await setAdminNotes(id, document.getElementById("m-notes").value);
    item.adminStatus = chosenStatus;
    item.adminNotes = document.getElementById("m-notes").value;
    window.closeModal?.();
    flash("Saved");
  });
}

function exportSubmissionsCSV() {
  const list = adminState.currentInnovations;
  if (!list.length) { alert("Nothing to export."); return; }
  const rows = [
    ["ID","Title","Author","Email","University","Sector","TRL","Status","Featured","EditorPick","Submitted"]
  ];
  list.forEach(i => {
    rows.push([
      i.id,
      csvSafe(i.title),
      csvSafe(i.author),
      csvSafe(i.email),
      csvSafe(i.university),
      csvSafe(i.sector),
      i.trl || "",
      i.adminStatus || "pending",
      i.featured ? "yes" : "no",
      i.editorPick ? "yes" : "no",
      i.createdAt?.toDate ? i.createdAt.toDate().toISOString() : ""
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
    el.innerHTML = `<div class="alert alert-warn">Could not load users: ${escapeHtml(e.message)}</div>`;
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
        <input type="text" id="admin-user-search" placeholder="Search by name, email, university, role" value="${escapeAttr(adminState.researchersQuery)}" />
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
            <th>Avg TRL</th>
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--ink-faint);">No researchers match.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => {
    const org = u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || u.profile?.ministry || "—";
    return `
      <tr data-uid="${u.uid}">
        <td>
          <strong style="color:var(--ink);">${escapeHtml(u.name || "")}</strong>
          ${u.featured ? '<span class="pill published" style="margin-left:6px; font-size:9px;">⭐ Featured</span>' : ""}
        </td>
        <td style="font-size:12px;">${escapeHtml(u.email || "")}</td>
        <td>${escapeHtml(u.role || "")}</td>
        <td style="font-size:12px;">${escapeHtml(org)}</td>
        <td>${u.submissionCount || 0}</td>
        <td>${u.avgTrl || "–"}</td>
        <td>${userStatusPill(u)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-tiny ${u.verified ? "saved" : "outline"}" data-act="verify" data-uid="${u.uid}" type="button" title="Verify">${u.verified ? "✓ Verified" : "Verify"}</button>
          <button class="btn-tiny ${u.featured ? "yellow" : "outline"}" data-act="feature" data-uid="${u.uid}" type="button" title="Feature">${u.featured ? "⭐" : "☆"}</button>
          <button class="btn-tiny black" data-act="manage" data-uid="${u.uid}" type="button">Manage</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      const act = btn.dataset.act;
      const user = adminState.cachedUsers.find(x => x.uid === uid);
      if (act === "verify") {
        await verifyUser(uid, !user.verified);
        user.verified = !user.verified;
        flash("Updated");
      } else if (act === "feature") {
        await featureUser(uid, !user.featured);
        user.featured = !user.featured;
        flash("Updated");
      } else if (act === "manage") {
        openManageUserModal(uid);
      }
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
  if (!user) return;

  const theirInnovations = adminState.currentInnovations.filter(i => i.email === user.email);

  const html = `
    <h3>Manage researcher</h3>
    <p style="color:var(--ink-soft); font-size:13px; margin-bottom:16px;">
      <strong>${escapeHtml(user.name || "")}</strong> · ${escapeHtml(user.email || "")} · ${escapeHtml(user.role || "")}
    </p>

    <div class="section-label">Account status</div>
    <div class="role-cards" style="grid-template-columns: repeat(2,1fr);">
      <div class="role-card ${user.verified ? "selected" : ""}" id="u-toggle-verified" style="text-align:center;">
        <div class="role-name">${user.verified ? "✓ Verified" : "Verify account"}</div>
      </div>
      <div class="role-card ${user.featured ? "selected" : ""}" id="u-toggle-featured" style="text-align:center;">
        <div class="role-name">${user.featured ? "⭐ Featured" : "Feature researcher"}</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px;">Submissions by this researcher (${theirInnovations.length})</div>
    <div style="max-height:200px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:8px; background:var(--cream);">
      ${theirInnovations.length
        ? theirInnovations.map(i => `
            <div style="padding:8px 6px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:8px; align-items:center;">
              <span style="font-size:13px;">${escapeHtml(i.title)}</span>
              <button class="btn-tiny outline" data-view="${i.id}" type="button" style="flex-shrink:0;">View</button>
            </div>`).join("")
        : '<p style="padding:10px; font-size:12px; color:var(--ink-faint);">No submissions yet.</p>'
      }
    </div>

    <div class="section-label" style="margin-top:20px;">Private admin notes</div>
    <textarea id="u-notes" style="min-height:80px;" placeholder="Internal notes...">${escapeHtml(user.adminNotes || "")}</textarea>

    <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-black" id="u-cancel" style="flex:1;" type="button">Close</button>
      <button class="btn ${user.suspended ? "" : "btn-red"}" id="u-suspend" style="flex:1;" type="button">
        ${user.suspended ? "Unsuspend" : "Suspend"}
      </button>
      <button class="btn" id="u-save" style="flex:2;" type="button">Save notes</button>
    </div>
  `;

  window.openModal?.(html);

  document.getElementById("u-toggle-verified").addEventListener("click", async () => {
    await verifyUser(uid, !user.verified);
    user.verified = !user.verified;
    document.getElementById("u-toggle-verified").classList.toggle("selected", user.verified);
    document.getElementById("u-toggle-verified").querySelector(".role-name").textContent = user.verified ? "✓ Verified" : "Verify account";
    paintResearcherRows();
  });

  document.getElementById("u-toggle-featured").addEventListener("click", async () => {
    await featureUser(uid, !user.featured);
    user.featured = !user.featured;
    document.getElementById("u-toggle-featured").classList.toggle("selected", user.featured);
    document.getElementById("u-toggle-featured").querySelector(".role-name").textContent = user.featured ? "⭐ Featured" : "Feature researcher";
    paintResearcherRows();
  });

  document.getElementById("u-suspend").addEventListener("click", async () => {
    if (!user.suspended && !confirm("Suspend this researcher? They will not be able to sign in.")) return;
    await suspendUser(uid, !user.suspended);
    user.suspended = !user.suspended;
    document.getElementById("u-suspend").className = `btn ${user.suspended ? "" : "btn-red"}`;
    document.getElementById("u-suspend").textContent = user.suspended ? "Unsuspend" : "Suspend";
    paintResearcherRows();
    flash("Updated");
  });

  document.getElementById("u-cancel").addEventListener("click", () => window.closeModal?.());
  document.getElementById("u-save").addEventListener("click", async () => {
    await setUserAdminNotes(uid, document.getElementById("u-notes").value);
    window.closeModal?.();
    flash("Notes saved");
  });

  document.querySelectorAll("#modal-content [data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.closeModal?.();
      setTimeout(() => window.openDrawer?.(btn.dataset.view), 150);
    });
  });
}

function exportResearchersCSV() {
  const list = adminState.cachedUsers || [];
  if (!list.length) { alert("Nothing to export."); return; }
  const rows = [["Name","Email","Role","Org","Submissions","AvgTRL","Verified","Featured","Suspended","Joined"]];
  list.forEach(u => {
    const org = u.profile?.university || u.profile?.chapterUniversity || u.profile?.organisation || u.profile?.ministry || "";
    rows.push([
      csvSafe(u.name), csvSafe(u.email), csvSafe(u.role), csvSafe(org),
      u.submissionCount || 0, u.avgTrl || "",
      u.verified ? "yes" : "no", u.featured ? "yes" : "no", u.suspended ? "yes" : "no",
      u.joinedAt?.toDate ? u.joinedAt.toDate().toISOString() : ""
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
      await setFeatured(id, false);
      const item = adminState.currentInnovations.find(x => x.id === id);
      if (item) item.featured = false;
      renderAdminDashboard();
      flash("Unfeatured");
    });
  });
  el.querySelectorAll("[data-uneditor]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.uneditor;
      await setEditorPick(id, false);
      const item = adminState.currentInnovations.find(x => x.id === id);
      if (item) item.editorPick = false;
      renderAdminDashboard();
      flash("Removed from Editor's picks");
    });
  });
  el.querySelectorAll("[data-unfeature-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.unfeatureUser;
      await featureUser(uid, false);
      const u = adminState.cachedUsers?.find(x => x.uid === uid);
      if (u) u.featured = false;
      renderAdminDashboard();
      flash("Unfeatured researcher");
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
                <h4 style="margin-bottom:6px; font-size:15px;">${escapeHtml(i.title)}</h4>
                <div style="font-size:12px; color:var(--ink-soft);">${escapeHtml(i.author)} · ${escapeHtml(i.university)}</div>
              </div>
              <button class="btn-tiny btn-red" ${kind === "editor" ? `data-uneditor="${i.id}"` : `data-unfeature="${i.id}"`} type="button">
                Remove
              </button>
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
                <h4 style="margin-bottom:6px; font-size:15px;">${escapeHtml(u.name)}</h4>
                <div style="font-size:12px; color:var(--ink-soft);">${escapeHtml(u.email)} · ${escapeHtml(u.role)}</div>
              </div>
              <button class="btn-tiny btn-red" data-unfeature-user="${u.uid}" type="button">Remove</button>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ============================================================
   UTILITIES
   ============================================================ */

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
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
  setTimeout(() => el.remove(), 1800);
}
