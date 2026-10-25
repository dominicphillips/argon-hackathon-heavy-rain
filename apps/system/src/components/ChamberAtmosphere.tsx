import { useState, type FC } from "react";

/** Generated looping atmosphere behind the chamber. Hides itself if the media is missing. */
export const ChamberAtmosphere: FC<{ reducedMotion?: boolean }> = ({ reducedMotion = false }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <video
      className="hr-chamber-atmosphere"
      src="/atmosphere/chamber-loop.mp4"
      poster="/atmosphere/chamber-poster.jpg"
      autoPlay={!reducedMotion}
      muted
      loop
      playsInline
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
};
