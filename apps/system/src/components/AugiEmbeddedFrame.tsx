import { useState, type FC } from "react";
import {
  AugiLogo,
  Button,
  MetricReadout,
  OrganizationThemeProvider,
  Panel,
  Status,
} from "@heavy-rain/organization-ui";
import type { AugiConfigSummary } from "../types";
import catalogCopy from "../copy/catalog.json";

const appName = catalogCopy.app_augi_sable_chassis_3d.name;

export interface AugiEmbeddedFrameProps {
  configs: AugiConfigSummary[];
  externalUrl?: string;
  inlineDisclosure: string;
  mode?: "embedded" | "fullscreen";
  reducedMotion?: boolean;
  isObscured?: boolean;
  onExitFullscreen?: () => void;
}

export const AugiEmbeddedFrame: FC<AugiEmbeddedFrameProps> = ({
  configs,
  externalUrl,
  inlineDisclosure,
  mode = "embedded",
  reducedMotion = false,
  isObscured = false,
  onExitFullscreen,
}) => {
  const [selectedConfigId, setSelectedConfigId] = useState<string>(
    configs[1]?.configId ?? "cfg_sable_b_cell_to_body_hybrid",
  );
  const [showTableCompanion, setShowTableCompanion] = useState<boolean>(false);
  // The backend fixture may omit the URL; the live frame must still load.
  const appUrl = externalUrl || "http://127.0.0.1:43171";

  const activeConfig =
    configs.find((c) => c.configId === selectedConfigId) ?? configs[0];

  return (
    <OrganizationThemeProvider
      theme="augi"
      reducedMotion={reducedMotion}
      className={`augi-embed-frame augi-embed-frame--${mode}`}
    >
      <header className="augi-embed-frame__topbar">
        <div className="augi-embed-frame__brand">
          <AugiLogo size={20} />
          <span className="augi-embed-frame__org-name">AUGI</span>
          <span className="augi-embed-frame__divider" aria-hidden="true">
            |
          </span>
          <span className="augi-embed-frame__title">{appName}</span>
          <Status
            tone="estimate"
            label="Concept estimate"
          />
        </div>
        <div className="augi-embed-frame__actions">
          {configs.map((cfg) => (
            <Button
              key={cfg.configId}
              variant={
                activeConfig?.configId === cfg.configId
                  ? "primary"
                  : "secondary"
              }
              size="sm"
              onClick={() => setSelectedConfigId(cfg.configId)}
            >
              {cfg.code}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTableCompanion((prev) => !prev)}
          >
            {showTableCompanion ? "Show 3D frame" : "Compare SABLE-A/B/C"}
          </Button>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={isObscured ? -1 : undefined}
            className="org-button org-button--primary org-button--sm augi-embed-frame__open-link"
          >
            Open app
          </a>
          {mode === "fullscreen" && onExitFullscreen && (
            <Button variant="secondary" size="sm" onClick={onExitFullscreen}>
              Back to Heavy Rain System
            </Button>
          )}
        </div>
      </header>

      <div className="augi-embed-frame__stage">
        {!showTableCompanion ? (
          <div className="augi-embed-frame__iframe-shell">
            <iframe
              src={appUrl}
              title={`AUGI ${appName}`}
              className="augi-embed-frame__iframe"
              loading="eager"
              tabIndex={isObscured ? -1 : undefined}
            />
          </div>
        ) : (
          <div className="augi-embed-frame__comparator">
            <Panel
              title="AUGI Sable Gate C2 Concept Architecture Comparison"
              subtitle={inlineDisclosure}
            >
              <div className="augi-embed-frame__table-wrap">
                <table className="rm-variance-app__table org-tabular">
                  <thead>
                    <tr>
                      <th>Configuration</th>
                      <th>Wheelbase / Track</th>
                      <th>Wall Gauge & Material</th>
                      <th>Lower BIW Mass</th>
                      <th>Torsional Stiffness K_t</th>
                      <th>Bending Stiffness K_b</th>
                      <th>Parts / SPRs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((cfg) => (
                      <tr
                        key={cfg.configId}
                        className={
                          activeConfig?.configId === cfg.configId
                            ? "rm-variance-app__row--selected"
                            : ""
                        }
                        onClick={() => setSelectedConfigId(cfg.configId)}
                      >
                        <td>
                          <strong>{cfg.code}</strong> · {cfg.name}
                        </td>
                        <td className="rm-variance-app__mono">
                          {cfg.wheelbaseMm} / {cfg.frontTrackMm} mm
                        </td>
                        <td>
                          {cfg.wallGaugeMm.toFixed(1)} mm · {cfg.materialLabel}
                        </td>
                        <td className="rm-variance-app__mono">
                          {cfg.structuralMassKg.toFixed(1)} kg
                        </td>
                        <td className="rm-variance-app__mono">
                          {cfg.torsionalStiffnessKnmDeg.toFixed(1)} kN·m/deg (
                          {cfg.twistAt18KnmDeg.toFixed(3)} deg @ 18 kN·m)
                        </td>
                        <td className="rm-variance-app__mono">
                          {cfg.bendingStiffnessKnMm.toFixed(1)} kN/mm (
                          {cfg.midspanSagMm.toFixed(2)} mm sag)
                        </td>
                        <td className="rm-variance-app__mono">
                          {cfg.partCount} parts
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        {activeConfig && (
          <div className="augi-embed-frame__metrics">
            <MetricReadout
              label={`${activeConfig.code} · Torsional Stiffness`}
              value={`${activeConfig.torsionalStiffnessKnmDeg.toFixed(
                1,
              )} kN·m/deg`}
              sublabel={`Peak twist ${activeConfig.twistAt18KnmDeg.toFixed(
                3,
              )} deg @ 18 kN·m couple · 1st mode ~${activeConfig.firstModeHz.toFixed(
                1,
              )} Hz`}
              disclosureLabel="Concept estimate"
              limitationNote="Closed-box Bredt-Batho analytical approximation; non-certified concept study (no FEA or crashworthiness claim)."
            />
            <MetricReadout
              label={`${activeConfig.code} · Lower Chassis Mass`}
              value={`${activeConfig.structuralMassKg.toFixed(1)} kg`}
              sublabel={`${activeConfig.partCount} lower-body parts · CoG Z-height ${activeConfig.cogZMm.toFixed(
                0,
              )} mm`}
              disclosureLabel="Concept estimate"
              limitationNote={`Wheelbase ${activeConfig.wheelbaseMm} mm, gauge ${activeConfig.wallGaugeMm.toFixed(
                1,
              )} mm (${activeConfig.materialLabel}).`}
            />
            <MetricReadout
              label={`${activeConfig.code} · Vertical Bending`}
              value={`${activeConfig.bendingStiffnessKnMm.toFixed(1)} kN/mm`}
              sublabel={`Mid-span sag ${activeConfig.midspanSagMm.toFixed(
                2,
              )} mm @ 32 kN load`}
              disclosureLabel="Concept estimate"
              limitationNote="Euler-Bernoulli composite rail approximation; visual 3D deflection scaled 45x–60x."
            />
          </div>
        )}
      </div>
    </OrganizationThemeProvider>
  );
};
