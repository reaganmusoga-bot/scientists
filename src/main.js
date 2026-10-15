import "./firebase.js";
import "./app.js";
import "./verify.js";

// Tell app.js that Firebase has been initialized
window.dispatchEvent(new Event("firebase-ready"));

// Expose the certificate generator for testing (optional)
import { generateCertificate } from "./certificate.js";
window.generateCertificate = generateCertificate;

/* ============================================================
   Route handling — /verify/:id
   Ensures the verify view shows instead of the homepage
   when the URL starts with /verify.
   ============================================================ */

window.__SCIPOOL_VERIFY_MODE__ = false;

function routeToVerifyIfNeeded() {
  const path = window.location.pathname;
  if (!path.startsWith("/verify")) {
    window.__SCIPOOL_VERIFY_MODE__ = false;
    return false;
  }

  window.__SCIPOOL_VERIFY_MODE__ = true;

  // Hide every view, show only the verify view
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById("view-verify");
  if (el) el.classList.add("active");

  // Hide sticky mobile CTA on verify pages
  const sticky = document.getElementById("mobile-sticky-cta");
  if (sticky) sticky.style.display = "none";

  return true;
}

// Run immediately
routeToVerifyIfNeeded();

// Re-run on browser back/forward
window.addEventListener("popstate", routeToVerifyIfNeeded);

// Also re-check after Firebase auth settles — this is the critical one,
// because app.js calls swapHomeView() when auth resolves.
window.addEventListener("firebase-ready", () => {
  setTimeout(routeToVerifyIfNeeded, 0);
});

// And once more after a short delay, as a safety net
setTimeout(routeToVerifyIfNeeded, 500);
