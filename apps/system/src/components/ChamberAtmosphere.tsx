import { useState, type FC } from "react";

export interface ChamberAtmosphereProps {
  /** Dark footage behind the smoky build chamber; pale footage directly on the page while idle. */
  variant?: "dark" | "pale";
  reducedMotion?: boolean;
}

const SOURCES = {
  dark: { src: "/atmosphere/chamber-loop-dark.mp4", poster: "/atmosphere/chamber-poster-dark.jpg" },
  pale: { src: "/atmosphere/chamber-loop.mp4", poster: "/atmosphere/chamber-poster.jpg" },
} as const;

/** Generated looping atmosphere. Hides itself if the media is missing. */
export const ChamberAtmosphere: FC<ChamberAtmosphereProps> = ({ variant = "dark", reducedMotion = false }) => {
  const [failed, setFailed] = useState<"dark" | "pale" | null>(null);
  if (failed === variant) return null;
  const source = SOURCES[variant];
  return (
    <video
      key={variant}
      className={`hr-chamber-atmosphere hr-chamber-atmosphere--${variant}`}
      src={source.src}
      poster={source.poster}
      autoPlay={!reducedMotion}
      muted
      loop
      playsInline
      aria-hidden="true"
      onError={() => setFailed(variant)}
    />
  );
};
