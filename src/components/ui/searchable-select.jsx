import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Lightweight typeahead selector — case-insensitive match anywhere in the label.
// options: [{ value, label }]. value/onChange are the selected value (string).
// Does NOT allow creating new options — existing records only.
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "Search...",
  emptyText = "No matches",
  className,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const x = q.toLowerCase().trim();
    if (!x) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(x));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 opacity-50 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="relative p-2 border-b">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="h-8 w-full rounded-sm pl-8 pr-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground text-center">{emptyText}</p>
            ) : filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}