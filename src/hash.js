/* ============================================================
   SciPool UG — SHA-256 file hashing
   Uses the browser's built-in Web Crypto API (no library needed).
   Produces a hex-encoded 64-character hash — the same algorithm
   used for the tamper-proof certificate record.
   ============================================================ */

/**
 * Compute the SHA-256 hash of a File or Blob.
 * @param {File|Blob} file - The file to hash
 * @returns {Promise<string>} - 64-char hex string
 */
export async function computeSHA256(file) {
  if (!file) throw new Error("No file provided to computeSHA256");

  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Compute the SHA-256 hash of a base64 data URL.
 * Your app stores pending media as base64 data URLs before upload,
 * so this variant avoids converting back to a Blob first.
 * @param {string} dataUrl - e.g. "data:application/pdf;base64,JVBERi0..."
 * @returns {Promise<string>}
 */
export async function computeSHA256FromDataURL(dataUrl) {
  if (!dataUrl) throw new Error("No data URL provided");

  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid data URL");

  const base64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
