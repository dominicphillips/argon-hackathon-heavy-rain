import * as React from "react";

export type OrganizationButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost";
export type OrganizationButtonSize = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: OrganizationButtonVariant;
  size?: OrganizationButtonSize;
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
      "org-button",
      `org-button--${variant}`,
      size === "sm" ? "org-button--sm" : "",
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
