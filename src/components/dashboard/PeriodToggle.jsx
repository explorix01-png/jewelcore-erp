import React from "react";

// Segmented control for switching a dashboard card between time periods.
// options: [{ key, label }]. `fullWidth` stretches the buttons evenly.
export default function PeriodToggle({ options, value, onChange, disabled = false, fullWidth = false, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 p-1 rounded-lg bg-muted/70 border border-border/60 ${
        fullWidth ? "w-full" : "self-start sm:self-auto"
      }`}
    >
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${fullWidth ? "flex-1" : ""} ${
              selected
                ? "bg-background text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
