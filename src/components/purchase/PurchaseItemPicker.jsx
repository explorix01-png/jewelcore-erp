import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus } from "lucide-react";
import NewItemDialog from "@/components/inventory/NewItemDialog";

// Item picker for purchase stock entry — searches ItemMaster filtered by metal.
// Also supports creating a new item via NewItemDialog (creates ItemMaster + InventoryItem).
export default function PurchaseItemPicker({ open, onClose, onPick, metal }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const reload = () => {
    if (metal) {
      base44.entities.ItemMaster.filter({ is_active: true, metal_type: metal }, "-created_date", 500).then(setItems);
    } else {
      base44.entities.ItemMaster.filter({ is_active: true }, "-created_date", 500).then(setItems);
    }
  };

  useEffect(() => {
    if (open) { setQ(""); reload(); }
  }, [open, metal]);  

  const filtered = items.filter((it) => {
    const x = q.toLowerCase();
    return !x || it.item_name?.toLowerCase().includes(x) || it.item_code?.toLowerCase().includes(x);
  }).slice(0, 10);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("purchase.addStockItem")}</DialogTitle></DialogHeader>
          <div className="py-2">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("purchase.searchItem")} className="pl-9" autoFocus />
            </div>
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">{t("purchase.itemNotFound")}</p>
              ) : filtered.map((it) => (
                <button key={it.id} onClick={() => { onPick(it); onClose(); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex justify-between items-center">
                  <span><span className="font-medium">{it.item_name}</span> <span className="text-xs text-muted-foreground ml-2 font-mono">{it.item_code}</span></span>
                  <span className="flex gap-1">
                    {it.purity_display && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">{it.purity_display}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemOpen(true)}><Plus className="w-4 h-4 mr-1" /> {t("inv.newItemStock")}</Button>
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NewItemDialog
        open={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onDone={reload}
        onCreated={(rec) => { if (rec) { onPick(rec); onClose(); setNewItemOpen(false); } }}
        metal={metal}
      />
    </>
  );
}