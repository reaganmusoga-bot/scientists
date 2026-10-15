import { jsPDF } from "jspdf";

/**
 * Generates a timestamped certificate PDF for a research submission.
 * Triggers a browser download.
 */
export function generateCertificate(data) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const charcoal = [26, 20, 16];
  const gold = [245, 183, 0];
  const flagRed = [200, 16, 46];
  const ink = [43, 36, 25];
  const inkSoft = [90, 79, 68];
  const inkFaint = [138, 127, 115];
  const line = [229, 221, 208];

  // ---------- HEADER ----------
  doc.setFillColor(...charcoal);
  doc.rect(0, 0, PAGE_W, 34, "F");

  doc.setFillColor(...gold);
  doc.rect(0, 0, PAGE_W, 3, "F");

  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SciPool UG", MARGIN, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(
    "Presidential Initiative for Young Scientists  |  Inter University Young Scientists Consortium",
    MARGIN,
    23
  );

  doc.setFontSize(8);
  doc.setTextColor(245, 183, 0);
  doc.text("CERTIFICATE OF TIMESTAMPED EXISTENCE", MARGIN, 29);

  // ---------- VERIFICATION CODE — prominent ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...inkFaint);
  doc.text("VERIFICATION CODE", MARGIN, 46);

  doc.setFont("courier", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...charcoal);
  doc.text(data.verificationCode || "SPUG-XXXX-XXXX", MARGIN, 56);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...inkFaint);
  doc.text(
    "Anyone can verify this certificate at scipool.ug/verify using this code.",
    MARGIN,
    62
  );

  // Divider under the code
  doc.setDrawColor(...gold);
  doc.setLineWidth(1);
  doc.line(MARGIN, 66, PAGE_W - MARGIN, 66);

  // ---------- TITLE ----------
  let y = 78;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...ink);
  doc.text("This certifies that the following work", MARGIN, y);
  y += 6.5;
  doc.text("was submitted and cryptographically timestamped:", MARGIN, y);
  y += 11;

  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ---------- SUBMISSION DETAILS ----------
  const labelX = MARGIN;
  const valueX = MARGIN + 42;
  const lineHeight = 7.5;

  function addField(label, value, options = {}) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...inkFaint);
    doc.text(label, labelX, y);

    doc.setFont("helvetica", options.mono ? "courier" : "normal");
    doc.setFontSize(options.size || 11);
    doc.setTextColor(...ink);

    const lines = doc.splitTextToSize(String(value), CONTENT_W - 42);
    doc.text(lines, valueX, y);
    y += lineHeight * lines.length + 1.5;
  }

  addField("Title:", data.title);
  addField("Author:", data.author);
  addField("Email:", data.email);
  addField("University:", data.university);
  if (data.department && data.department !== "—") {
    addField("Department:", data.department);
  }

  y += 4;
  doc.setDrawColor(...line);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 9;

  // ---------- CRYPTOGRAPHIC PROOF ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...flagRed);
  doc.text("CRYPTOGRAPHIC PROOF", MARGIN, y);
  y += 8;

  addField("File Name:", data.fileName || "—", { size: 10 });
  addField("File Size:", `${Number(data.fileSize || 0).toLocaleString()} bytes`, { size: 10 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...inkFaint);
  doc.text("SHA-256 Hash:", labelX, y);

  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...ink);
  const hashLines = doc.splitTextToSize(data.hash || "—", CONTENT_W - 42);
  doc.text(hashLines, valueX, y);
  y += lineHeight * hashLines.length + 2;

  addField("Timestamp Anchor:", data.timestampAnchor || "SciPool UG Server Timestamp", { size: 10 });
  addField("Anchored At:", data.anchoredAt || "—", { size: 10, mono: true });
  addField("Submission ID:", data.submissionId || "—", { size: 10, mono: true });

  y += 4;
  doc.setDrawColor(...line);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 9;

  // ---------- VERIFICATION INSTRUCTIONS ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...flagRed);
  doc.text("HOW TO VERIFY THIS CERTIFICATE", MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...inkSoft);

  [
    "1.  Go to scipool.ug/verify",
    "2.  Enter the Verification Code shown at the top of this page.",
    "3.  The verify page will confirm this certificate is authentic.",
  ].forEach((lineText) => {
    doc.text(lineText, MARGIN, y);
    y += 5.5;
  });

  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...inkFaint);
  doc.text("Direct verification link:", MARGIN, y);
  y += 6;

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...flagRed);
  doc.text(data.verifyUrl || "https://scientists-mocha.vercel.app/verify", MARGIN, y);
  y += 11;

  // ---------- LEGAL NOTICE ----------
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...flagRed);
  doc.text("LEGAL NOTICE", MARGIN, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...inkSoft);

  const legalText =
    "This certificate provides cryptographic proof that the file identified above existed in its exact form at the timestamped moment. It is evidence of authorship priority. It is not a government-granted monopoly and does not replace formal registration with the Uganda Registration Services Bureau (URSB). For full legal ownership, register your work at copyright@ursb.go.ug.";

  const legalLines = doc.splitTextToSize(legalText, CONTENT_W);
  doc.text(legalLines, MARGIN, y);
  y += legalLines.length * 4.7 + 7;

  // ---------- ISSUANCE FOOTER ----------
  doc.setDrawColor(...line);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...inkFaint);
  doc.text("Issued by:", MARGIN, y);
  doc.text("Issued on:", MARGIN + 90, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...ink);
  doc.text("SciPool UG", MARGIN, y);
  doc.setFont("courier", "normal");
  doc.text(data.issuedAt || "—", MARGIN + 90, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...inkFaint);
  doc.text("Certificate ID:", MARGIN, y);
  doc.setFont("courier", "normal");
  doc.setTextColor(...ink);
  doc.text(data.certificateId || "—", MARGIN + 42, y);

  // ---------- BOTTOM BAR ----------
  doc.setFillColor(...charcoal);
  doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
  doc.setFillColor(...gold);
  doc.rect(0, PAGE_H - 12, PAGE_W, 1.5, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(200, 188, 172);
  doc.text(
    "This certificate was generated automatically and is valid without a handwritten signature.",
    MARGIN,
    PAGE_H - 5
  );
  doc.text("scipool.ug", PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });

  // ---------- SAVE ----------
  const filename = `SciPool_Certificate_${data.verificationCode || data.submissionId || "cert"}.pdf`;
  doc.save(filename);
}
