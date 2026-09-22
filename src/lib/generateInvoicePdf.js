// A4 PDF generator for the jewellery invoice.
// Renders the SAME invoiceTemplate used by Print, so the PDF is identical to the
// printed invoice. Uses html2canvas + jsPDF. Returns a Blob (for download / share / upload).
// Values come only from finalized Bill + BillItem snapshots — no recalculation.
import { invoiceStyles, invoiceBody } from "@/lib/invoiceTemplate";

// Convert a remote image URL to a data URL so html2canvas can capture it
// without CORS tainting the canvas (the logo lives on a CDN).
async function urlToDataURL(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Generate the invoice PDF and return a Blob.
export async function generateInvoicePdfBlob(invoiceData) {
  const { bill, shop } = invoiceData;

  // Customer-facing QR (token-based, no internal IDs) — same as print.
  let qrDataUrl = "";
  if (bill.public_token) {
    try {
      const { default: QRCode } = await import("qrcode");
      qrDataUrl = await QRCode.toDataURL(`${window.location.origin}/bill/${bill.public_token}`, { margin: 1, width: 140 });
    } catch { /* QR failed */ }
  }

  // Pre-convert the logo to a data URL to avoid canvas CORS taint.
  let shopForRender = shop;
  if (shop?.logo_url && !shop.logo_url.startsWith("data:")) {
    const logoData = await urlToDataURL(shop.logo_url);
    if (logoData) shopForRender = { ...shop, logo_url: logoData };
  }

  const paperSize = shop?.invoice_paper_size || "A4";
  const isA5 = paperSize === "A5";
  const containerW = isA5 ? 559 : 794;   // 559px ≈ 148mm, 794px ≈ 210mm at 96dpi
  const styles = invoiceStyles(paperSize);
  const body = invoiceBody({ ...invoiceData, shop: shopForRender }, { qrDataUrl });

  // Offscreen container at the correct paper-width.
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${containerW}px;background:#ffffff;z-index:-1;`;
  container.innerHTML = `<style>${styles}</style><div class="invoice-page">${body}</div>`;
  document.body.appendChild(container);

  try {
    // Allow images/fonts to settle before capture.
    await new Promise((r) => setTimeout(r, 200));
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: containerW,
      windowWidth: containerW,
    });

    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF("p", "mm", isA5 ? "a5" : "a4");
    const pageW = isA5 ? 148 : 210;
    const pageH = isA5 ? 210 : 297;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

// Trigger a browser download of a blob.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}