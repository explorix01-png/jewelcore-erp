import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Download, Loader2, MessageCircle, Send, XCircle } from "lucide-react";
import WhatsAppIcon from "@/components/billing/WhatsAppIcon";
import { getFinalizedInvoiceData } from "@/lib/invoiceData";
import { generateInvoicePdfBlob, downloadBlob } from "@/lib/generateInvoicePdf";
import {
  normalizeIndianPhone,
  buildWhatsAppMessage,
  shareWhatsAppManual,
  sendWhatsAppViaCloudApi,
  getWhatsAppStatus,
} from "@/lib/whatsappShare";

export default function WhatsAppShareDialog({ bill, onClose }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [phone, setPhone] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [message, setMessage] = useState("");
  const [cloud, setCloud] = useState({ configured: false, enabled: false });
  const [pdfBlob, setPdfBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'sent'|'failed'|'manual', message }
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!bill) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getFinalizedInvoiceData(bill.id);
        if (cancelled) return;
        setInvoiceData(data);
        setCustomer(data.customer);
        const rawPhone = bill.customer_mobile || data.customer?.mobile || "";
        setPhone(normalizeIndianPhone(rawPhone));
        const fn = `${bill.bill_number || "Invoice"}.pdf`;
        setFileName(fn);
        const shopName = data.shop?.shop_name || "";
        const dateStr = new Date(bill.bill_date).toLocaleDateString("en-IN");
        const defaultMsg =
          (await getWhatsAppStatus()).default_message ||
          buildWhatsAppMessage({
            customer_name: bill.customer_name,
            shop_name: shopName,
            invoice_number: bill.bill_number,
            invoice_date: dateStr,
            grand_total: fmt(bill.total_amount),
          });
        if (cancelled) return;
        setMessage(defaultMsg);
        setCloud(await getWhatsAppStatus());
      } catch (e) {
        if (!cancelled) setStatus({ type: "failed", message: e.message || "Failed to load bill" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bill]);

  const generatePdf = async () => {
    setBusy(true);
    try {
      const blob = await generateInvoicePdfBlob(invoiceData);
      setPdfBlob(blob);
      return blob;
    } catch (e) {
      setStatus({ type: "failed", message: t("whatsapp.pdfFailed") });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!phone) return;
    setBusy(true);
    try {
      let blob = pdfBlob;
      if (!blob) blob = await generatePdf();
      if (!blob) { setBusy(false); return; }

      if (cloud.enabled && cloud.configured) {
        setStatus({ type: "pending", message: t("whatsapp.sending") });
        try {
          const res = await sendWhatsAppViaCloudApi({ bill, customer, phone, message, pdfBlob: blob, fileName });
          if (res?.success && res.status === "sent") {
            setStatus({ type: "sent", message: t("whatsapp.sent") });
          } else {
            setStatus({ type: "failed", message: res?.error || t("whatsapp.failed") });
          }
        } catch (e) {
          setStatus({ type: "failed", message: e.message || t("whatsapp.failed") });
        }
      } else {
        const res = await shareWhatsAppManual({ phone, message, pdfBlob: blob, fileName });
        if (res.shared) {
          setStatus({ type: "sent", message: t("whatsapp.sent") });
        } else if (res.cancelled) {
          setStatus(null);
        } else {
          setStatus({ type: "manual", message: t("whatsapp.attachHint") });
        }
      }
    } catch (e) {
      setStatus({ type: "failed", message: e.message || t("whatsapp.failed") });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    let blob = pdfBlob;
    if (!blob) blob = await generatePdf();
    if (blob) downloadBlob(blob, fileName);
  };

  if (!bill) return null;

  return (
    <Dialog open={!!bill} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <WhatsAppIcon className="w-5 h-5 text-emerald-700" />
            </div>
            <DialogTitle>{t("whatsapp.title")}</DialogTitle>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !phone ? (
          <div className="py-4 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="text-sm text-muted-foreground">{t("whatsapp.customerMobileRequired")}</p>
            {customer && (
              <Button asChild variant="outline">
                <Link to={`/customers/${customer.id}`}>{t("whatsapp.editCustomer")}</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("whatsapp.to")}</span><span className="font-medium">{bill.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("whatsapp.phone")}</span><span className="font-mono">+{phone}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("whatsapp.invoice")}</span><span className="font-mono">{bill.bill_number}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("whatsapp.total")}</span><span className="font-semibold">{fmt(bill.total_amount)}</span></div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {cloud.enabled && cloud.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> {t("whatsapp.cloudConfigured")}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground"><MessageCircle className="w-3.5 h-3.5" /> {t("whatsapp.cloudNotConfigured")}</span>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block">{t("whatsapp.message")}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} className="text-sm" />
            </div>

            {status && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                status.type === "sent" ? "bg-emerald-50 text-emerald-800" :
                status.type === "failed" ? "bg-red-50 text-red-800" :
                status.type === "pending" ? "bg-blue-50 text-blue-800" :
                "bg-amber-50 text-amber-800"
              }`}>
                {status.type === "sent" && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
                {status.type === "failed" && <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                {status.type === "pending" && <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />}
                {status.type === "manual" && <MessageCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>{status.message}</span>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={handleShare} disabled={busy || !phone}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                {busy ? t("whatsapp.processing") : t("whatsapp.generateAndShare")}
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={busy}>
                <Download className="w-4 h-4 mr-1" /> {t("whatsapp.downloadPdf")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}