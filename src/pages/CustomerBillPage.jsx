import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/billCalc";
import { amountToWords } from "@/lib/amountToWords";
import { Spinner } from "@/components/ui/erp";
import { XCircle, ShieldCheck } from "lucide-react";

// Public customer-facing bill view — reachable via the QR code on the printed invoice.
// No authentication. No admin chrome. Only customer-safe finalized bill data is shown.
// Supplier info, purchase cost, internal IDs, profit/margin, and employee data are never exposed.
export default function CustomerBillPage() {
  const t = useT();
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getPublicBill", { token });
        if (res.data?.status === "cancelled") { setError("cancelled"); setData(res.data); }
        else if (!res.data?.success) { setError(res.data?.error || "not_found"); }
        else setData(res.data);
      } catch (e) { setError(e.message || "not_found"); }
      finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Spinner /></div>;

  if (error === "cancelled") {
    return <Shell><div className="text-center py-16"><XCircle className="w-12 h-12 mx-auto text-red-500 mb-3" /><h2 className="text-lg font-semibold">{t("customerBill.cancelled")}</h2><p className="text-sm text-muted-foreground mt-1">{data?.bill_number || ""}</p></div></Shell>;
  }
  if (error) {
    return <Shell><div className="text-center py-16"><XCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" /><h2 className="text-lg font-semibold">{t("customerBill.notFound")}</h2></div></Shell>;
  }

  const { shop, bill, items } = data;
  const isGst = bill.gst_enabled && bill.gst_mode !== "none";
  const isInter = bill.gst_mode === "inter";

  return (
    <Shell>
      <div className="text-center border-b pb-4 mb-4">
        {shop.logo_url && <img src={shop.logo_url} alt="logo" className="h-14 mx-auto mb-2" />}
        <h1 className="text-xl font-bold">{shop.name}</h1>
        {shop.address && <p className="text-xs text-muted-foreground">{shop.address}</p>}
        <p className="text-xs text-muted-foreground">{shop.mobile}{shop.gst_number ? ` · GSTIN: ${shop.gst_number}` : ""}</p>
      </div>

      <div className="flex flex-wrap justify-between gap-3 mb-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase">{t("customerBill.billNumber")}</p>
          <p className="font-mono font-semibold">{bill.bill_number}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase">{t("customerBill.date")}</p>
          <p>{new Date(bill.bill_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase">{t("billHistory.customer")}</p>
          <p className="font-medium">{bill.customer_name}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">{t("customerBill.item")}</th>
              <th className="text-center px-3 py-2">{t("customerBill.qty")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.grossWt")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.stoneWt")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.netWt")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.rate")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.making")}</th>
              <th className="text-right px-3 py-2">{t("customerBill.total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it, i) => {
              const qty = Number(it.quantity) || 0;
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.item_name}</p>
                    <p className="text-xs text-muted-foreground">{it.purity_display || ""}{it.metal_type ? ` · ${it.metal_type}` : ""}{it.hsn ? ` · HSN ${it.hsn}` : ""}</p>
                  </td>
                  <td className="text-center px-3 py-2">{qty}</td>
                  <td className="text-right px-3 py-2">{(Number(it.gross_weight) * qty).toFixed(3)}g</td>
                  <td className="text-right px-3 py-2">{(Number(it.stone_weight) * qty).toFixed(3)}g</td>
                  <td className="text-right px-3 py-2">{(Number(it.net_weight) * qty).toFixed(3)}g</td>
                  <td className="text-right px-3 py-2">₹{Number(it.rate_per_gram).toLocaleString("en-IN")}</td>
                  <td className="text-right px-3 py-2">{fmt(it.making_charge)}{it.making_charge_type === "percentage" ? "%" : ""}</td>
                  <td className="text-right px-3 py-2 font-semibold">{fmt(it.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-full max-w-xs space-y-1 text-sm">
          <Row label={t("invoice.subtotal")} value={fmt(bill.subtotal)} />
          {Number(bill.discount) > 0 && <Row label={t("customerBill.discount")} value={`−${fmt(bill.discount)}`} />}
          {Number(bill.other_charges) > 0 && <Row label={t("billing.otherCharges")} value={fmt(bill.other_charges)} />}
          {Number(bill.hallmarking_charge) > 0 && <Row label={t("invoice.hallmarking")} value={fmt(bill.hallmarking_charge)} />}
          {isGst && isInter && <Row label={t("invoice.igst")} value={fmt(bill.igst)} />}
          {isGst && !isInter && (<><Row label={t("invoice.cgst")} value={fmt(bill.cgst)} /><Row label={t("invoice.sgst")} value={fmt(bill.sgst)} /></>)}
          <div className="flex justify-between font-bold border-t pt-1.5 text-base"><span>{t("customerBill.grandTotal")}</span><span>{fmt(bill.total_amount)}</span></div>
          <Row label={t("customerBill.paid")} value={fmt(bill.paid_amount)} />
          {Number(bill.due_amount) > 0 && <div className="flex justify-between text-red-600 font-medium"><span>{t("customerBill.balance")}</span><span>{fmt(bill.due_amount)}</span></div>}
        </div>
      </div>

      <p className="text-xs italic text-muted-foreground mt-4 border-t pt-3"><strong>{t("invoice.amountInWords") || "Amount in Words"}:</strong> {amountToWords(bill.total_amount)}</p>

      <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-emerald-700">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Verified JewelCore Invoice</span>
      </div>
    </Shell>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></div>;
}

function Shell({ children }) {
  return <div className="min-h-screen bg-slate-50 py-8 px-4"><div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border p-6">{children}</div></div>;
}