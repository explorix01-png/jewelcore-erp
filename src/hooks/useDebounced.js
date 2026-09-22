import { useState, useEffect } from "react";

// Debounces a rapidly-changing value (e.g., search input).
// Returns the debounced value that only updates after `delay` ms of no change.
// This prevents triggering expensive filter/search recalculations on every keystroke.
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}