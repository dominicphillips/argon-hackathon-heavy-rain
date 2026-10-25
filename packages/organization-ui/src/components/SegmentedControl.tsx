import * as React from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}

/** Compact exclusive choice (units, view mode, load case). Native buttons with aria-pressed. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  className = "",
  ...props
}: SegmentedControlProps<T>) {
  const classes = ["org-segmented", size === "md" ? "org-segmented--md" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} role="group" aria-label={ariaLabel} {...props}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`org-segmented__btn${opt.value === value ? " org-segmented__btn--active" : ""}`}
          aria-pressed={opt.value === value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
