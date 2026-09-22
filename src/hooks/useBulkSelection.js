import { useState, useMemo, useCallback, useEffect } from "react";

// Reusable bulk selection hook that works with client-side pagination.
// "Select All" selects ALL records matching the current search/filter (not just current page).
// Selection persists across page changes.
// Pass the full filtered array (all matching records, not just the current page slice).
export function useBulkSelection(filteredItems, idKey = "id") {
  const [selectedIds, setSelectedIds] = useState(new Set());

  // All IDs in the current filtered result set
  const allFilteredIds = useMemo(
    () => filteredItems.map((item) => item[idKey]).filter(Boolean),
    [filteredItems, idKey]
  );

  // Reset selection when the filtered set changes identity (e.g., search/filter change,
  // data reload after delete). This prevents stale selections from a previous filter context.
  // We use a ref to track the previous filter signature (by ID set) and clear when it changes.
  const filterSignature = useMemo(() => allFilteredIds.join(","), [allFilteredIds]);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterSignature]);

  const isAllSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const isIndeterminate =
    selectedIds.size > 0 && !isAllSelected;

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        // Deselect all filtered
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        // Select all filtered (across all pages)
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [isAllSelected, allFilteredIds]);

  const toggleOne = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedArray: Array.from(selectedIds),
    selectedCount: selectedIds.size,
    isAllSelected,
    isIndeterminate,
    toggleAll,
    toggleOne,
    clear,
    isSelected,
  };
}