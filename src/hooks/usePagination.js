import { useState, useEffect, useMemo } from "react";

// Reusable client-side pagination hook.
// Pass the already-filtered+sorted array; returns the current page slice + controls.
// Auto-clamps page when items shrink (e.g., after deletion on the last page).
export function usePagination(items, defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp page to valid range for rendering (avoids flash of empty page)
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Fix state if out of range (e.g., after deleting the last record on the last page)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const setPageSize = (s) => {
    setPageSizeState(Number(s));
    setPage(1);
  };

  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = useMemo(
    () => items.slice(startIdx, endIdx),
    [items, startIdx, endIdx]
  );

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    startIdx: total === 0 ? 0 : startIdx + 1, // 1-based for display
    endIdx,
    pageItems,
  };
}