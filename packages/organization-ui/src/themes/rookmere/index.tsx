import * as React from "react";
import "./theme.css";

export { ROOKMERE_TOKENS, ROOKMERE_LOGO_PATH } from "./tokens";

export interface RookmereLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  title?: string;
}

/**
 * Rookmere Capital original geometric mark.
 * Canonical SVG file: __grounding/design/brand/rookmere-capital.svg
 */
export function RookmereLogo({
  size = 20,
  title = "Rookmere Capital",
  ...props
}: RookmereLogoProps) {
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
        d="M5 6H10V10H13.5V6H18.5V10H22V6H27V13H24.5V24H27V27H5V24H7.5V13H5V6ZM10.5 13V24H14.5V13H10.5ZM17.5 13V24H21.5V13H17.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
