import * as React from "react";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  readout?: React.ReactNode;
  helperText?: React.ReactNode;
  /** Alias of helperText. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  readout,
  helperText: helperTextProp,
  hint,
  error,
  className = "",
  children,
  ...props
}: FieldProps) {
  const helperText = helperTextProp ?? hint;
  const classes = ["org-field", className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      <div className="org-field__header">
        <label className="org-field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {readout !== undefined && (
          <span className="org-field__readout">{readout}</span>
        )}
      </div>
      {children}
      {helperText && !error && (
        <p className="org-field__helper">{helperText}</p>
      )}
      {error && (
        <p className="org-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface RangeFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  unit?: string;
  valueDisplay?: React.ReactNode;
  accent?: "control" | "stress";
  helperText?: React.ReactNode;
  error?: React.ReactNode;
}

export function RangeField({
  label,
  unit,
  valueDisplay,
  accent = "control",
  helperText,
  error,
  id,
  className = "",
  ...props
}: RangeFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  const formattedReadout =
    valueDisplay !== undefined
      ? valueDisplay
      : props.value !== undefined
      ? unit
        ? `${props.value} ${unit}`
        : String(props.value)
      : undefined;

  const rangeClasses = [
    "org-field__range",
    accent === "stress" ? "org-field__range--stress" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Field
      label={label}
      htmlFor={inputId}
      readout={formattedReadout}
      helperText={helperText}
      error={error}
      className={className}
    >
      <input
        id={inputId}
        type="range"
        className={rangeClasses}
        {...props}
      />
    </Field>
  );
}
