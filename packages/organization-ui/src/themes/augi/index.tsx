import * as React from "react";
import "./theme.css";

export { AUGI_TOKENS, AUGI_LOGO_PATH } from "./tokens";

export interface AugiLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  title?: string;
}

/**
 * AUGI original geometric mark.
 * Canonical SVG file: __grounding/design/brand/augi-mark.svg
 */
export function AugiLogo({
  size = 20,
  title = "AUGI",
  ...props
}: AugiLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      {...props}
    >
      <title>{title}</title>
      <path
        d="M10 5H22L28 16L22 27H10L4 16L10 5ZM11.8 8L7.4 16L11.8 24H20.2L24.6 16L20.2 8H11.8Z"
        fill="currentColor"
      />
      <rect x="2" y="14.75" width="28" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="14.75" y="10" width="2.5" height="12" rx="0.75" fill="currentColor" />
    </svg>
  );
}
