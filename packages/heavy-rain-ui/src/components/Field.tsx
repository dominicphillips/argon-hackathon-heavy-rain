import * as React from "react";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  readout?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  readout,
  error,
  className = "",
  children,
  ...props
}: FieldProps) {
  const classes = ["hr-field", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...props}>
      <div className="hr-field__header">
        <label className="hr-field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {readout !== undefined && (
          <span className="hr-field__readout">{readout}</span>
        )}
      </div>
      {children}
      {error && (
        <p className="hr-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface RangeFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  valueDisplay?: React.ReactNode;
  error?: React.ReactNode;
}

export function RangeField({
  label,
  valueDisplay,
  error,
  id,
  className = "",
  ...props
}: RangeFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      readout={valueDisplay ?? props.value}
      error={error}
      className={className}
    >
      <input
        id={inputId}
        type="range"
        className="hr-field__range"
        {...props}
      />
    </Field>
  );
}
