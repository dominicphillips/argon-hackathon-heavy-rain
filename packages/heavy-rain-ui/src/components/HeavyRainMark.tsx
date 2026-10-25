import * as React from "react";

export interface HeavyRainMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  title?: string;
}

/**
 * Heavy Rain original geometric brand mark.
 * Canonical SVG file: __grounding/design/brand/heavy-rain-mark.svg
 */
export function HeavyRainMark({
  size = 20,
  title = "Heavy Rain",
  ...props
}: HeavyRainMarkProps) {
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
      <path d="M10.5 5L5.5 20H9.25L14.25 5H10.5Z" fill="currentColor" />
      <path d="M18.25 5L13.25 20H17L22 5H18.25Z" fill="currentColor" />
      <path d="M26 5L21 20H24.75L29.75 5H26Z" fill="currentColor" />
      <rect x="4" y="24" width="24" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}
