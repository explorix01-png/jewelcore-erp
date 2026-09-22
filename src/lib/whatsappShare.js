import { base44 } from "@/api/base44Client";

// Normalize an Indian mobile number to the WhatsApp wa.me format (digits only, no +).
//   9876543210      -> 919876543210
//   09876543210     -> 919876543210
//   +919876543210   -> 919876543210
//   919876543210    -> 919876543210
// Returns null if the number cannot be normalized to a valid Indian mobile.
export function normalizeIndianPhone(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[^\d]/g, "");
  if (s.length === 10 && /^[6-9]/.test(s)) return "91" + s;
  if (s.length === 11 && s.startsWith("0")) return "91" + s.slice(1);
  if (s.length === 12 && s.startsWith("91")) return s;
  if (s.length === 13 && s.startsWith("91")) return s.slice(0, 12);
  return null;
}

// Build the default professional invoice message. No internal IDs / tokens / URLs.
export function buildWhatsAppMessage({ customer_name, shop_name, invoice_number, invoice_date, grand_total, currency = "₹" }) {
  return [
    `Hello ${customer_name || "Customer"},`,
    ``,
    `Thank you for shopping with ${shop_name || "us"}.`,
    ``,
    `Your jewellery bill is ready.`,
    ``,
    `Invoice No: ${invoice_number || ""}`,
    `Invoice Date: ${invoice_date || ""}`,
    `Total Amount: ${currency}${grand_total}`,
    ``,
    `Please find your invoice attached.`,
    ``,
    `Thank you for choosing ${shop_name || "us"}.`,
  ].join("\n");
}

// Manual click-to-chat share: opens WhatsApp (app or web) with a pre-filled message
// and provides the PDF via native share (mobile) or download (desktop).
export async function shareWhatsAppManual({ phone, message, pdfBlob, fileName }) {
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message || "")}`;

  // Mobile: prefer the native share sheet so the PDF can be attached directly.
  if (pdfBlob && navigator.canShare) {
    const file = new File([pdfBlob], fileName, { type: "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Invoice", text: message || "" });
        return { shared: true, method: "native" };
      } catch (e) {
        if (e && e.name === "AbortError") return { shared: false, cancelled: true };
        // fall through to web fallback
      }
    }
  }

  // Desktop / fallback: open WhatsApp Web chat + download the PDF.
  window.open(waUrl, "_blank", "noopener,noreferrer");
  if (pdfBlob) {
    const { downloadBlob } = await import("@/lib/generateInvoicePdf");
    downloadBlob(pdfBlob, fileName);
  }
  return { shared: false, method: "web", fallback: true };
}

// Cloud API path: upload the generated PDF and ask the backend to send it via the
// WhatsApp Business Cloud API. Returns the backend result. If the API is not
// configured, the backend returns { configured: false } and the caller falls back.
export async function sendWhatsAppViaCloudApi({ bill, customer, phone, message, pdfBlob, fileName }) {
  if (!pdfBlob) throw new Error("PDF is required for Cloud API sending");
  const { file_url } = await base44.integrations.Core.UploadFile({ file: new File([pdfBlob], fileName, { type: "application/pdf" }) });
  const res = await base44.functions.invoke("manageWhatsApp", {
    action: "send",
    bill_id: bill.id,
    bill_number: bill.bill_number,
    customer_id: bill.customer_id,
    customer_name: bill.customer_name,
    phone,
    message,
    document_name: fileName,
    file_url,
  });
  return res.data;
}

// Fetch the WhatsApp configuration status (configured / not, enabled, default message).
export async function getWhatsAppStatus() {
  try {
    const res = await base44.functions.invoke("manageWhatsApp", { action: "getStatus" });
    return res.data;
  } catch { return { configured: false, enabled: false }; }
}