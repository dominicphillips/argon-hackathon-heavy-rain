import * as React from "react";

export type SystemButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type SystemButtonSize = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SystemButtonVariant;
  size?: SystemButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      type = "button",
      className = "",
      children,
      ...props
    },
    ref
  ) {
    const classes = [
      "hr-button",
      `hr-button--${variant}`,
      size === "sm" ? "hr-button--sm" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} type={type} className={classes} {...props}>
        {children}
      </button>
    );
  }
);
