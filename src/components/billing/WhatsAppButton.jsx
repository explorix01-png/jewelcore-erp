import React, { useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import WhatsAppIcon from "@/components/billing/WhatsAppIcon";
import WhatsAppShareDialog from "@/components/billing/WhatsAppShareDialog";

// Reusable "Share on WhatsApp" button + dialog. Only the bill is required — the
// dialog loads its own finalized invoice data. Disabled for non-finalized bills.
export default function WhatsAppButton({ bill, variant = "outline", size = "default", label, className = "", showIcon = true, iconOnly = false, title }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const disabled = !bill || (bill.status && bill.status !== "finalized");
  return (
    <>
      <Button
        variant={variant}
        size={iconOnly ? "icon" : size}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
        title={title || t("whatsapp.share")}
      >
        {showIcon && <WhatsAppIcon className={iconOnly ? "w-4 h-4" : "w-4 h-4 mr-1.5"} />}
        {!iconOnly && (label || t("whatsapp.share"))}
      </Button>
      {open && <WhatsAppShareDialog bill={bill} onClose={() => setOpen(false)} />}
    </>
  );
}