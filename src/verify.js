/* ============================================================
   SciPool UG — Public verification page
   Route: /verify/:id
   Loads a single innovation doc and lets a visitor confirm
   the SHA-256 hash of an uploaded file against the record.
   ============================================================ */

import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { computeSHA256 } from "./hash.js";

/**
 * Detect the submission ID from the URL.
 * Supports both:
 *   /verify/abc123
 *   /verify?id=abc123   (fallback)
 */
function getSubmissionIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/verify\/([^/?#]+)/);
  if (match && match[1]) return decodeURIComponent(match[1]);

  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

/**
 * Escape HTML entities — safe rendering.
 */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Build and inject the verification UI into #view-verify
 * (or a dedicated container — we'll add one to index.html).
 */
async function initVerifyPage() {
  const container = document.getElementById("verify-content");
  if (!container) {
    console.warn("verify-content container not found");
    return;
  }

  const submissionId = getSubmissionIdFromUrl();

  // ---------- No ID in URL ----------
  if (!submissionId) {
    container.innerHTML = `
      <div class="verify-card verify-error">
        <h2>No certificate ID provided</h2>
        <p>This page verifies a SciPool UG certificate. Please use the exact link printed on your certificate.</p>
        <a href="/" class="btn">Return to SciPool UG</a>
      </div>
    `;
    return;
  }

  // ---------- Loading state ----------
  container.innerHTML = `
    <div class="verify-card verify-loading">
      <div class="verify-spinner"></div>
      <p>Looking up certificate <code>${esc(submissionId)}</code>…</p>
    </div>
  `;

  // ---------- Load the Firestore record ----------
  let record = null;
  try {
    const snap = await getDoc(doc(db, "innovations", submissionId));
    if (snap.exists()) {
      record = { id: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.error("Failed to load record:", err);
  }

  if (!record) {
    container.innerHTML = `
      <div class="verify-card verify-error">
        <h2>Certificate not found</h2>
        <p>No record exists for ID <code>${esc(submissionId)}</code>. This certificate may have been issued by a different platform, or the record has been removed.</p>
        <a href="/" class="btn">Return to SciPool UG</a>
      </div>
    `;
    return;
  }

  // ---------- Render the record ----------
  const anchoredAt = record.anchoredAt || record.hashComputedAt || record.createdAt?.toDate?.().toISOString?.() || "—";
  const storedHash = record.hash || "no-hash";

  container.innerHTML = `
    <div class="verify-card">
      <div class="verify-header">
        <div class="verify-badge">SciPool UG</div>
        <div class="verify-status verify-status-pending" id="verify-status">Awaiting file</div>
      </div>

      <h1 class="verify-title">${esc(record.title || "Untitled")}</h1>
      <div class="verify-author">${esc(record.author || "—")} · ${esc(record.university || "—")}</div>

      <dl class="verify-kv">
        <dt>Submission ID</dt><dd><code>${esc(record.id)}</code></dd>
        <dt>SHA-256 Hash</dt><dd><code class="verify-hash">${esc(storedHash)}</code></dd>
        <dt>Anchored At</dt><dd><code>${esc(anchoredAt)}</code></dd>
        <dt>Timestamp Anchor</dt><dd>${esc(record.timestampAnchor || "SciPool UG Server Timestamp")}</dd>
      </dl>

      <div class="verify-action">
        <h3>Verify this file</h3>
        <p>Upload the original file to confirm it matches the hash recorded above.</p>
        <label class="verify-drop" id="verify-drop">
          <input type="file" id="verify-file-input" />
          <span class="verify-drop-icon">📎</span>
          <span class="verify-drop-text">Click to choose a file, or drag it here</span>
        </label>
        <div class="verify-result" id="verify-result"></div>
      </div>
    </div>
  `;

  // ---------- Wire up the file input ----------
  const fileInput = document.getElementById("verify-file-input");
  const dropZone = document.getElementById("verify-drop");
  const resultBox = document.getElementById("verify-result");
  const statusBox = document.getElementById("verify-status");

  async function handleFile(file) {
    if (!file) return;

    resultBox.innerHTML = `<div class="verify-checking"><div class="verify-spinner"></div> Computing SHA-256…</div>`;
    statusBox.className = "verify-status verify-status-pending";
    statusBox.textContent = "Checking…";

    try {
      const uploadedHash = await computeSHA256(file);

      if (uploadedHash.toLowerCase() === String(storedHash).toLowerCase()) {
        resultBox.innerHTML = `
          <div class="verify-ok">
            <div class="verify-ok-icon">✅</div>
            <h3>Verified</h3>
            <p>This file is <strong>authentic and unchanged</strong> since it was submitted to SciPool UG.</p>
            <code class="verify-small-hash">${esc(uploadedHash)}</code>
          </div>
        `;
        statusBox.className = "verify-status verify-status-ok";
        statusBox.textContent = "Verified";
      } else {
        resultBox.innerHTML = `
          <div class="verify-fail">
            <div class="verify-fail-icon">❌</div>
            <h3>Mismatch</h3>
            <p>This file does <strong>not</strong> match the record. It has been modified, or it is a different file.</p>
            <div class="verify-hash-compare">
              <div><strong>Expected:</strong> <code>${esc(storedHash)}</code></div>
              <div><strong>Got:</strong> <code>${esc(uploadedHash)}</code></div>
            </div>
          </div>
        `;
        statusBox.className = "verify-status verify-status-fail";
        statusBox.textContent = "Mismatch";
      }
    } catch (err) {
      console.error("Verification failed:", err);
      resultBox.innerHTML = `
        <div class="verify-fail">
          <div class="verify-fail-icon">⚠️</div>
          <h3>Could not read the file</h3>
          <p>${esc(err.message || "Unknown error")}</p>
        </div>
      `;
    }
  }

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  });

  // Drag and drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("verify-drop-active");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("verify-drop-active");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("verify-drop-active");
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  });
}

// Auto-init when the script loads AND the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVerifyPage);
} else {
  initVerifyPage();
}

// Re-run if the user navigates within the SPA (path changes)
window.addEventListener("popstate", initVerifyPage);
