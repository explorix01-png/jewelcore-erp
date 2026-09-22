import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";

// Compact bulk-action toolbar. Only renders when one or more records are selected.
// Shows selection count, a clear button, and a delete button with loading state.
export function BulkActionBar({ selectedCount, onDelete, onClear, deleting, deleteLabel = "Delete Selected" }) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-amber-900">
          {selectedCount} selected
        </span>
        <button
          onClick={onClear}
          className="text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline flex items-center gap-0.5"
          disabled={deleting}
        >
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={deleting}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {deleting ? `Deleting ${selectedCount}...` : deleteLabel}
      </Button>
    </div>
  );
}

// Result dialog for bulk delete — shows deleted count and skipped records with reasons.
export function BulkDeleteResultDialog({ result, onClose }) {
  if (!result) return null;
  const { deleted, skipped } = result;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-3">Bulk Delete Result</h3>
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm"><strong>{deleted}</strong> record(s) deleted successfully</span>
          </div>
          {skipped.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm"><strong>{skipped.length}</strong> record(s) skipped (have dependencies)</span>
            </div>
          )}
        </div>
        {skipped.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-md border p-3 bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-2">Skipped records:</p>
            <ul className="space-y-1">
              {skipped.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium">{s.name || s.id}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}