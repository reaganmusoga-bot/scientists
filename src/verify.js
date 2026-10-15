/* ============================================================
   SciPool UG — Public verification page
   Route: /verify or /verify?code=SPUG-XXXX-XXXX
   Visitor enters the code printed on their certificate.
   The page fetches the matching record and confirms it exists.
   ============================================================ */

import {
  collection, query, where, getDocs, limit
} from "firebase/firestore";
import { db } from "./firebase.js";

/* ---------- Helpers ---------- */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function normalizeCode(input) {
  if (!input) return "";
  const cleaned = String(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("SPUG") && cleaned.length === 12) {
    return `SPUG-${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return String(input).toUpperCase().trim();
}

/* ---------- Lookup ---------- */

async function findByCode(code) {
  const q = query(
    collection(db, "innovations"),
    where("verificationCode", "==", code),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/* ---------- Views ---------- */

function renderSearchForm(prefill = "") {
  return `
    <div class="verify-card">
      <div class="verify-header">
        <div class="verify-badge">SciPool UG</div>
        <div class="verify-status verify-status-pending">Awaiting code</div>
      </div>

      <h1 class="verify-title">Verify a certificate</h1>
      <p class="verify-author">
        Enter the Verification Code printed on your SciPool UG certificate.
      </p>

      <form id="verify-form" class="verify-form" autocomplete="off">
        <label for="verify-code-input" class="verify-label">Verification Code</label>
        <input
          type="text"
          id="verify-code-input"
          class="verify-input"
          placeholder="SPUG-XXXX-XXXX"
          value="${esc(prefill)}"
          maxlength="20"
          autocapitalize="characters"
          spellcheck="false"
        />
        <button type="submit" class="btn verify-submit">Verify</button>
      </form>

      <div id="verify-result" class="verify-result"></div>
    </div>
  `;
}

function renderVerified(record) {
  const anchoredAt =
    record.anchoredAt ||
    record.hashComputedAt ||
    (record.createdAt?.toDate?.().toISOString?.()) ||
    "—";

  return `
    <div class="verify-card">
      <div class="verify-header">
        <div class="verify-badge">SciPool UG</div>
        <div class="verify-status verify-status-ok">✅ Verified</div>
      </div>

      <div class="verify-hero-ok">
        <div class="verify-hero-icon">✅</div>
        <h1 class="verify-hero-title">VERIFIED</h1>
        <p class="verify-hero-sub">
          This is a genuine SciPool UG certificate.
        </p>
      </div>

      <dl class="verify-kv">
        <dt>Verification Code</dt>
        <dd><code>${esc(record.verificationCode)}</code></dd>

        <dt>Title</dt>
        <dd>${esc(record.title || "Untitled")}</dd>

        <dt>Author</dt>
        <dd>${esc(record.author || "—")}</dd>

        <dt>University</dt>
        <dd>${esc(record.university || "—")}</dd>

        <dt>Submission ID</dt>
        <dd><code>${esc(record.id)}</code></dd>

        <dt>SHA-256 Hash</dt>
        <dd><code class="verify-hash">${esc(record.hash || "—")}</code></dd>

        <dt>Anchored At</dt>
        <dd><code>${esc(anchoredAt)}</code></dd>

        <dt>Timestamp Anchor</dt>
        <dd>${esc(record.timestampAnchor || "SciPool UG Server Timestamp")}</dd>
      </dl>

      <div class="verify-note">
        This certificate was issued by SciPool UG for the submission shown above.
        The SHA-256 hash is the cryptographic fingerprint of the original file
        recorded at the moment of submission.
      </div>
    </div>
  `;
}

function renderNotFound(code) {
  return `
    <div class="verify-card">
      <div class="verify-header">
        <div class="verify-badge">SciPool UG</div>
        <div class="verify-status verify-status-fail">❌ Not found</div>
      </div>

      <div class="verify-hero-fail">
        <div class="verify-hero-icon">❌</div>
        <h1 class="verify-hero-title">NOT VERIFIED</h1>
        <p class="verify-hero-sub">
          No certificate matches the code <code>${esc(code)}</code>.
        </p>
      </div>

      <div style="text-align:center; margin-top:20px;">
        <button class="btn verify-back" id="verify-another" type="button">
          Try another code
        </button>
      </div>
    </div>
  `;
}

/* ---------- Main ---------- */

function getCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code") || "";
}

function initVerifyPage() {
  const container = document.getElementById("verify-content");
  if (!container) return;

  const initialCode = getCodeFromUrl();
  container.innerHTML = renderSearchForm(initialCode);

  const form = document.getElementById("verify-form");
  const input = document.getElementById("verify-code-input");
  const result = document.getElementById("verify-result");

  async function runLookup(codeRaw) {
    const code = normalizeCode(codeRaw);
    if (!code || code.length < 10) {
      result.innerHTML = `
        <div class="verify-fail">
          <div class="verify-fail-icon">⚠️</div>
          <h3>Enter a valid code</h3>
          <p>The code should look like <code>SPUG-XXXX-XXXX</code>.</p>
        </div>
      `;
      return;
    }

    result.innerHTML = `
      <div class="verify-checking">
        <div class="verify-spinner"></div>
        Looking up <code>${esc(code)}</code>…
      </div>
    `;

    try {
      const record = await findByCode(code);

      if (record) {
        container.innerHTML = renderVerified(record);
      } else {
        container.innerHTML = renderNotFound(code);
        // Only the not-found view gets a "try another" button
        const again = document.getElementById("verify-another");
        if (again) {
          again.addEventListener("click", () => {
            history.replaceState({}, "", "/verify");
            initVerifyPage();
          });
        }
      }
    } catch (err) {
      console.error("Lookup failed:", err);
      result.innerHTML = `
        <div class="verify-fail">
          <div class="verify-fail-icon">⚠️</div>
          <h3>Lookup error</h3>
          <p>${esc(err.message || "Something went wrong.")}</p>
        </div>
      `;
    }
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      runLookup(input.value);
    });
  }

  if (initialCode) {
    runLookup(initialCode);
  }
}

/* ---------- Bootstrap ---------- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVerifyPage);
} else {
  initVerifyPage();
}

window.addEventListener("popstate", initVerifyPage);
