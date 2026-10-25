import * as React from "react";
import { Button, SegmentedControl } from "@heavy-rain/organization-ui";
import {
  useViewportRuntime,
  type CameraDirectionId,
  type ViewportRuntime,
} from "@heavy-rain/organization-3d";
import type { ChassisConfig, UnitSystem } from "../model/chassisModel.ts";
import { createSableAdapter, type SableAdapter, type SableSceneState, type TransportMode, type ViewMode } from "./createSableAdapter.ts";
import { FallbackSchematic } from "../components/FallbackSchematic.tsx";
import { AppOriginCard } from "../components/AppOriginCard.tsx";
import { t } from "../copy/copy.ts";

export interface ChassisViewportProps {
  config: ChassisConfig;
  unitSystem: UnitSystem;
  viewMode: ViewMode;
  cutawayFraction: number;
  transportMode: TransportMode;
  playing: boolean;
  deformationAmp: number;
  explosionFactor: number;
  flightFactor: number;
  showLoadVectors: boolean;
  showBaselineGhost: boolean;
  reducedMotion: boolean;
  cameraPreset: CameraDirectionId;
  resetCounter: number;
  onChangeViewMode: (mode: ViewMode) => void;
  onSelectCameraPreset: (preset: CameraDirectionId) => void;
  onResetView: () => void;
  onToggleLoadVectors: () => void;
  onToggleBaselineGhost: () => void;
  onTogglePlaying: () => void;
  onChangeTransportMode: (mode: TransportMode) => void;
  onChangeTransportValue: (mode: TransportMode, value: number) => void;
  onSelectPart: (partId: string | null) => void;
  selectedPartId: string | null;
}

const PRESETS: readonly CameraDirectionId[] = ["isometric", "side", "top", "front", "rear", "underbody"];

const PART_COPY_KEY: Record<string, string> = {
  "body-shell": "selection.bodyShell",
  greenhouse: "selection.greenhouse",
  seat: "selection.seat",
  dashboard: "selection.dashboard",
  wheel: "selection.wheel",
};

function toSceneState(p: ChassisViewportProps): SableSceneState {
  return {
    config: p.config,
    viewMode: p.viewMode,
    cutawayFraction: p.cutawayFraction,
    transportMode: p.transportMode,
    playing: p.playing && !p.reducedMotion,
    deformationAmp: p.deformationAmp,
    explosionFactor: p.explosionFactor,
    flightFactor: p.flightFactor,
    showLoadVectors: p.showLoadVectors,
    showBaselineGhost: p.showBaselineGhost,
    reducedMotion: p.reducedMotion,
  };
}

export function ChassisViewport(props: ChassisViewportProps) {
  const {
    config, unitSystem, viewMode, cutawayFraction, transportMode, playing, deformationAmp,
    explosionFactor, flightFactor, showLoadVectors, showBaselineGhost, reducedMotion,
    cameraPreset, resetCounter, onChangeViewMode, onSelectCameraPreset, onResetView,
    onToggleLoadVectors, onToggleBaselineGhost, onTogglePlaying, onChangeTransportMode,
    onChangeTransportValue, onSelectPart, selectedPartId,
  } = props;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [forceSchematic, setForceSchematic] = React.useState(false);
  const adapterRef = React.useRef<SableAdapter | null>(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const { runtimeRef, error: webglError } = useViewportRuntime(canvasRef, containerRef, {
    enabled: !forceSchematic,
    fovDeg: 30,
    fitMargin: 1.08,
    minDistance: 1.2,
    maxDistance: 40,
    reducedMotion,
    toneMappingExposure: 1.04,
    createAdapter: () => {
      const adapter = createSableAdapter(toSceneState(propsRef.current));
      adapter.onTransportValue = (mode, value) => propsRef.current.onChangeTransportValue(mode, value);
      adapterRef.current = adapter;
      return adapter;
    },
    onReady: (runtime: ViewportRuntime) => {
      runtime.fitBounds(adapterRef.current?.vehicleRoot, { direction: propsRef.current.cameraPreset, animate: false });
      runtime.setContinuous(propsRef.current.playing);
    },
  });

  // Push state into the scene whenever visual props change
  React.useEffect(() => {
    const adapter = adapterRef.current;
    const runtime = runtimeRef.current;
    if (!adapter || !runtime) return;
    adapter.setState(toSceneState(props));
    runtime.setReducedMotion(reducedMotion);
    runtime.setContinuous(playing && !reducedMotion);
    runtime.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, viewMode, cutawayFraction, transportMode, playing, deformationAmp, explosionFactor, flightFactor, showLoadVectors, showBaselineGhost, reducedMotion]);

  // Camera preset and reset: aspect-aware fit of the whole vehicle
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
    const hit = runtime.pick(e.clientX, e.clientY, adapter.vehicleRoot);
    onSelectPart(hit?.partId ?? null);
  };

  const transportValue =
    transportMode === "deformation" ? deformationAmp : transportMode === "exploded" ? explosionFactor * 100 : flightFactor * 100;
  const transportMin = transportMode === "deformation" ? 1 : 0;
  const transportMax = transportMode === "deformation" ? 40 : 100;
  const transportReadout =
    transportMode === "deformation" ? `${deformationAmp}x` : `${Math.round(transportValue)}%`;

  return (
    <section className="augi-stage" aria-label={t("app.vehicle")}>
      <AppOriginCard className="augi-stage__origin" />

      <header className="augi-stage__header">
        <SegmentedControl
          ariaLabel={t("view.solid")}
          size="md"
          value={viewMode}
          onChange={onChangeViewMode}
          options={[
            { value: "solid", label: t("view.solid") },
            { value: "cutaway", label: t("view.cutaway") },
            { value: "xray", label: t("view.xray") },
          ]}
        />
      </header>

      <div
        ref={containerRef}
        className="augi-stage__canvas-wrap"
        tabIndex={0}
        role="application"
        aria-label={t("app.vehicle")}
        onKeyDown={handleKeyDown}
      >
        {webglError || forceSchematic ? (
          <FallbackSchematic
            config={config}
            unitSystem={unitSystem}
            cameraPreset="isometric"
            explosionFactor={explosionFactor}
            showBodySilhouette={viewMode !== "xray"}
            showBaselineGhost={showBaselineGhost}
            reason={webglError ?? undefined}
          />
        ) : (
          <canvas ref={canvasRef} className="augi-stage__canvas" onClick={handleClick} />
        )}

        {/* Compact viewport toolbar */}
        <div className="augi-stage__toolbar" role="toolbar" aria-label={t("camera.viewLabel")}>
          <select
            className="augi-stage__select"
            aria-label={t("camera.viewLabel")}
            value={cameraPreset}
            onChange={(e) => onSelectCameraPreset(e.target.value as CameraDirectionId)}
          >
            {PRESETS.map((id) => (
              <option key={id} value={id}>{t(`camera.${id}`)}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={onResetView}>{t("camera.reset")}</Button>
          <details className="augi-stage__more">
            <summary className="org-button org-button--ghost org-button--sm" aria-label={t("camera.more")}>⋯</summary>
            <div className="augi-stage__more-menu">
              <label><input type="checkbox" checked={showLoadVectors} onChange={onToggleLoadVectors} /> {t("layers.loadVectors")}</label>
              <label><input type="checkbox" checked={showBaselineGhost} onChange={onToggleBaselineGhost} /> {t("layers.baselineGhost")}</label>
              {!webglError && (
                <label><input type="checkbox" checked={forceSchematic} onChange={() => setForceSchematic((v) => !v)} /> {t("layers.blueprint")}</label>
              )}
            </div>
          </details>
        </div>

        {/* Selected part and animation scale notes */}
        <div className="augi-stage__notes" aria-live="polite">
          {selectedPartId && (
            <span className="augi-stage__chip">
              <span className="augi-stage__chip-eyebrow">{t("selection.eyebrow")}</span>
              {t(PART_COPY_KEY[selectedPartId] ?? "selection.bodyShell")}
            </span>
          )}
          {transportMode === "deformation" && (
            <span className="augi-stage__chip augi-stage__chip--amp">{deformationAmp}x · {t("transport.amplification")}</span>
          )}
          {transportMode === "flight" && (
            <span className="augi-stage__chip">{t("transport.flightNote")}</span>
          )}
        </div>
      </div>

      {/* Bottom transport strip */}
      <footer className="augi-transport" aria-label={t("transport.deformation")}>
        <Button
          size="sm"
          variant={playing && !reducedMotion ? "primary" : "secondary"}
          onClick={onTogglePlaying}
          disabled={reducedMotion}
          title={reducedMotion ? t("transport.staticPose") : undefined}
        >
          {reducedMotion ? t("transport.staticPose") : playing ? t("transport.pause") : t("transport.play")}
        </Button>
        <input
          type="range"
          className="augi-transport__slider"
          aria-label={t(`transport.${transportMode}`)}
          min={transportMin}
          max={transportMax}
          step={1}
          value={Math.round(transportValue)}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChangeTransportValue(transportMode, transportMode === "deformation" ? v : v / 100);
          }}
        />
        <span className="augi-transport__readout org-tabular">{transportReadout}</span>
        <select
          className="augi-stage__select"
          aria-label={t("transport.deformation")}
          value={transportMode}
          onChange={(e) => onChangeTransportMode(e.target.value as TransportMode)}
        >
          <option value="deformation">{t("transport.deformation")}</option>
          <option value="exploded">{t("transport.exploded")}</option>
          <option value="flight">{t("transport.flight")}</option>
        </select>
      </footer>
    </section>
  );
}
