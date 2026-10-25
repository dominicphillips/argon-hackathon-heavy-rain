import * as React from "react";
import { Button } from "@heavy-rain/organization-ui";
import { useViewportRuntime, type CameraDirectionId, type ViewportRuntime } from "@heavy-rain/organization-3d";
import { SUBSYSTEM_IDS, type Subsystem, type SubsystemId } from "../model/massBalance.ts";
import { createMassBalanceAdapter, type MassBalanceAdapter } from "./createMassBalanceAdapter.ts";
import { t } from "../copy/copy.ts";
import { tm } from "../copy/massCopy.ts";
import { AppOriginCard } from "../components/AppOriginCard.tsx";
import massOrigin from "../copy/mass-origin.json";

export interface MassBalanceViewportProps {
  parts: readonly Subsystem[];
  selectedId: SubsystemId | null;
  reducedMotion: boolean;
  cameraPreset: CameraDirectionId;
  resetCounter: number;
  selectedLabel: string | null;
  onSelectPart: (id: SubsystemId | null) => void;
  onSelectCameraPreset: (preset: CameraDirectionId) => void;
  onResetView: () => void;
}

const PRESETS: readonly CameraDirectionId[] = ["isometric", "side", "top", "front", "rear", "underbody"];

function isSubsystemId(id: string | null): id is SubsystemId {
  return id !== null && (SUBSYSTEM_IDS as readonly string[]).includes(id);
}

/**
 * Center stage for the mass ledger: the Sable body in fixed X-ray view with
 * subsystem envelopes and the center-of-gravity marker. Orbit, pan, zoom, camera
 * presets, and reset reuse the shared viewport runtime.
 */
export function MassBalanceViewport(props: MassBalanceViewportProps) {
  const { parts, selectedId, reducedMotion, cameraPreset, resetCounter, selectedLabel, onSelectPart, onSelectCameraPreset, onResetView } = props;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const adapterRef = React.useRef<MassBalanceAdapter | null>(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const { runtimeRef, error: webglError } = useViewportRuntime(canvasRef, containerRef, {
    fovDeg: 30,
    fitMargin: 1.08,
    minDistance: 1.2,
    maxDistance: 40,
    reducedMotion,
    toneMappingExposure: 1.04,
    createAdapter: () => {
      const p = propsRef.current;
      const adapter = createMassBalanceAdapter({ parts: p.parts, selectedId: p.selectedId, reducedMotion: p.reducedMotion });
      adapterRef.current = adapter;
      return adapter;
    },
    onReady: (runtime: ViewportRuntime) => {
      runtime.fitBounds(adapterRef.current?.vehicleRoot, { direction: propsRef.current.cameraPreset, animate: false });
      runtime.setContinuous(false);
    },
  });

  React.useEffect(() => {
    const adapter = adapterRef.current;
    const runtime = runtimeRef.current;
    if (!adapter || !runtime) return;
    adapter.setState({ parts, selectedId, reducedMotion });
    runtime.setReducedMotion(reducedMotion);
    runtime.invalidate();
  }, [parts, selectedId, reducedMotion, runtimeRef]);

  React.useEffect(() => {
    const runtime = runtimeRef.current;
    const adapter = adapterRef.current;
    if (!runtime || !adapter) return;
    runtime.fitBounds(adapter.vehicleRoot, { direction: cameraPreset, animate: true });
  }, [cameraPreset, resetCounter, runtimeRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (e.key === "r" || e.key === "R") {
      onResetView();
      e.preventDefault();
      return;
    }
    if (runtime.handleKeyDown(e.nativeEvent)) e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    const adapter = adapterRef.current;
    if (!runtime || !adapter) return;
    const hit = runtime.pick(e.clientX, e.clientY, adapter.markersRoot);
    onSelectPart(isSubsystemId(hit?.partId ?? null) ? (hit!.partId as SubsystemId) : null);
  };

  return (
    <section className="augi-stage augi-mass-stage" aria-label={tm("appTitle")}>
      <AppOriginCard persona={massOrigin} className="augi-stage__origin" />

      <div
        ref={containerRef}
        className="augi-stage__canvas-wrap"
        tabIndex={0}
        role="application"
        aria-label={tm("appTitle")}
        onKeyDown={handleKeyDown}
      >
        {webglError ? (
          <div className="augi-fallback-stage">
            <p className="augi-fallback-notice">{t("errors.webgl")}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="augi-stage__canvas" onClick={handleClick} />
        )}

        <div className="augi-stage__toolbar" role="toolbar" aria-label={tm("cameraLabel")}>
          <select
            className="augi-stage__select"
            aria-label={tm("cameraLabel")}
            value={cameraPreset}
            onChange={(e) => onSelectCameraPreset(e.target.value as CameraDirectionId)}
          >
            {PRESETS.map((id) => (
              <option key={id} value={id}>{t(`camera.${id}`)}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={onResetView}>{t("camera.reset")}</Button>
        </div>

        <div className="augi-stage__notes" aria-live="polite">
          {selectedLabel && (
            <span className="augi-stage__chip">
              <span className="augi-stage__chip-eyebrow">{tm("selectedPartLabel")}</span>
              {selectedLabel}
            </span>
          )}
          <span className="augi-stage__chip augi-mass-chip--axes">
            <span className="augi-stage__chip-eyebrow">+X · +Y</span>
            {t("camera.front")} · {t("camera.top")}
          </span>
        </div>
      </div>
    </section>
  );
}
