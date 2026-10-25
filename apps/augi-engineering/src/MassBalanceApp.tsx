import * as React from "react";
import {
  AccountMenu,
  AccountMenuSection,
  AugiLogo,
  Button,
  MetricReadout,
  OrganizationThemeProvider,
  Panel,
  RangeField,
  Status,
  WorkspaceLinks,
} from "@heavy-rain/organization-ui";
import { formatLength as formatSceneLength, type CameraDirectionId } from "@heavy-rain/organization-3d";
import {
  DEFAULT_SUBSYSTEMS,
  SUBSYSTEM_BOUNDS,
  computeMassBalance,
  formatKg,
  formatPercent,
  updateSubsystem,
  type Subsystem,
  type SubsystemId,
} from "./model/massBalance.ts";
import { AUGI_ACCOUNT_STORAGE_KEY, DEMO_ENGINEERS, WORKSPACE_URLS } from "./model/accounts.ts";
import { MassBalanceViewport } from "./three/MassBalanceViewport.tsx";
import { t } from "./copy/copy.ts";
import { tm, type MassCopyKey } from "./copy/massCopy.ts";

/** Scene state stays in meters; readouts show whole millimeters to match the labeled units. */
function formatMm(meters: number): string {
  return formatSceneLength(meters, "mm");
}

/** Fore-aft positions keep an explicit sign so forward and rearward offsets read apart. */
function formatSignedMm(meters: number): string {
  const text = formatMm(meters);
  return meters > 0 ? `+${text}` : text;
}

const PART_NAME_KEY: Record<SubsystemId, MassCopyKey> = {
  battery: "batteryPartName",
  body: "bodyPartName",
  frontDrive: "frontDrivePartName",
  rearDrive: "rearDrivePartName",
  cabin: "cabinPartName",
  payload: "payloadPartName",
  wheels: "wheelPartName",
};

const SABLE_HREF = "/";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * AUGI Sable subsystem mass and center-of-gravity ledger. Separate organization
 * app from the chassis study: fixed X-ray body, one subsystem list on the left,
 * the 3D stage with the CG marker in the center, and the selected subsystem's
 * mass and placement sliders with the vehicle totals on the right.
 */
export function MassBalanceApp() {
  const engineerId = readStorage(AUGI_ACCOUNT_STORAGE_KEY);
  const engineer = DEMO_ENGINEERS.find((e) => e.id === engineerId) ?? DEMO_ENGINEERS[0];
  const [reducedMotion] = React.useState<boolean>(detectReducedMotion);

  const [parts, setParts] = React.useState<readonly Subsystem[]>(DEFAULT_SUBSYSTEMS);
  const [selectedId, setSelectedId] = React.useState<SubsystemId | null>("battery");
  const [cameraPreset, setCameraPreset] = React.useState<CameraDirectionId>("isometric");
  const [resetCounter, setResetCounter] = React.useState<number>(0);

  const metrics = React.useMemo(() => computeMassBalance(parts), [parts]);
  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const isDefault = parts === DEFAULT_SUBSYSTEMS;
  const partName = (id: SubsystemId) => tm(PART_NAME_KEY[id]);

  const handleChange = (id: SubsystemId, patch: Partial<Pick<Subsystem, "massKg" | "xM" | "yM">>) =>
    setParts((prev) => updateSubsystem(prev, id, patch));

  const handleResetView = () => {
    setCameraPreset("isometric");
    setResetCounter((c) => c + 1);
  };

  const handleResetAll = () => {
    setParts(DEFAULT_SUBSYSTEMS);
    handleResetView();
  };

  const workspaceLinks = [
    { label: t("account.heavyRain"), href: WORKSPACE_URLS.heavyRain },
    { label: t("account.rookmere"), href: WORKSPACE_URLS.rookmere },
    { label: t("account.augi"), href: WORKSPACE_URLS.augi, current: true },
  ];

  return (
    <OrganizationThemeProvider theme="augi" reducedMotion={reducedMotion} className="augi-root">
      <svg className="augi-topo" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="var(--org-contour-line)" strokeWidth="1">
          <path d="M-80 140 C 120 80, 290 210, 460 110 C 620 20, 790 60, 980 -40" />
          <path d="M-60 220 C 150 150, 330 290, 520 180 C 710 70, 880 140, 1120 20" />
          <path d="M-40 310 C 180 240, 360 360, 580 250 C 780 140, 960 210, 1240 80" />
          <path d="M980 940 C 1090 790, 1240 760, 1480 650" />
          <path d="M880 950 C 1030 740, 1210 690, 1490 560" />
          <path d="M770 960 C 960 690, 1180 620, 1510 470" />
          <ellipse cx="320" cy="190" rx="140" ry="78" transform="rotate(-14 320 190)" />
          <ellipse cx="1140" cy="720" rx="180" ry="96" transform="rotate(-18 1140 720)" />
        </g>
      </svg>

      <header className="augi-topbar">
        <div className="augi-brand">
          <AugiLogo size={22} />
          <span className="augi-brand__name">{t("app.org")}</span>
          <span className="augi-brand__model">{tm("appTitle")}</span>
        </div>
        <div className="augi-topbar__right">
          <Status tone="estimate" label={t("results.conceptEstimate")} />
          <a className="org-button org-button--ghost org-button--sm" href={SABLE_HREF}>{tm("openSableAction")}</a>
          <AccountMenu
            name={engineer.name}
            initials={engineer.initials}
            detail={engineer.title}
            badge={t("account.demoBadge")}
            dialogLabel={t("account.dialogLabel")}
          >
            <AccountMenuSection eyebrow={t("account.identityEyebrow")}>
              <strong>{engineer.name}</strong>
              <span className="augi-muted">{engineer.title} · {engineer.team}</span>
              <p className="augi-muted augi-note">{t("account.note")}</p>
            </AccountMenuSection>
            <AccountMenuSection eyebrow={t("account.workspacesEyebrow")}>
              <WorkspaceLinks ariaLabel={t("account.workspacesEyebrow")} links={workspaceLinks} />
            </AccountMenuSection>
          </AccountMenu>
        </div>
      </header>

      <main className="augi-main augi-mass-main">
        <aside className="augi-left augi-mass-left" aria-label={tm("partsLabel")}>
          <h2 className="augi-right__title augi-mass-left__title">{tm("partsLabel")}</h2>
          <ul className="augi-mass-list">
            {parts.map((p) => {
              const share = metrics.totalMassKg > 0 ? p.massKg / metrics.totalMassKg : 0;
              const active = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`augi-mass-item${active ? " augi-mass-item--active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setSelectedId(active ? null : p.id)}
                  >
                    <span className="augi-mass-item__row">
                      <span className={`augi-mass-item__swatch augi-mass-item__swatch--${p.id}`} aria-hidden="true" />
                      <span className="augi-mass-item__name">{partName(p.id)}</span>
                      <strong className="augi-mass-item__mass org-tabular">{formatKg(p.massKg)}</strong>
                    </span>
                    <span className="augi-mass-item__bar" aria-hidden="true">
                      <span className={`augi-mass-item__fill augi-mass-item__fill--${p.id}`} style={{ width: `${Math.round(share * 100)}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <MassBalanceViewport
          parts={parts}
          selectedId={selectedId}
          reducedMotion={reducedMotion}
          cameraPreset={cameraPreset}
          resetCounter={resetCounter}
          selectedLabel={selected ? partName(selected.id) : null}
          onSelectPart={setSelectedId}
          onSelectCameraPreset={setCameraPreset}
          onResetView={handleResetView}
        />

        <aside className="augi-right" aria-label={tm("selectedPartLabel")}>
          <div className="augi-right__head">
            <h2 className="augi-right__title">{selected ? partName(selected.id) : tm("selectedPartLabel")}</h2>
            <Button size="sm" variant="ghost" onClick={handleResetAll} disabled={isDefault}>{tm("resetAction")}</Button>
          </div>

          {selected ? (
            <Panel variant="inset" className="augi-context__card">
              <RangeField
                label={tm("massLabel")}
                min={SUBSYSTEM_BOUNDS[selected.id].massKg.min}
                max={SUBSYSTEM_BOUNDS[selected.id].massKg.max}
                step={SUBSYSTEM_BOUNDS[selected.id].massKg.step}
                value={selected.massKg}
                valueDisplay={formatKg(selected.massKg)}
                onChange={(e) => handleChange(selected.id, { massKg: Number(e.target.value) })}
              />
              <RangeField
                label={tm("positionLabel")}
                min={SUBSYSTEM_BOUNDS[selected.id].xM.min}
                max={SUBSYSTEM_BOUNDS[selected.id].xM.max}
                step={SUBSYSTEM_BOUNDS[selected.id].xM.step}
                value={selected.xM}
                valueDisplay={formatSignedMm(selected.xM)}
                onChange={(e) => handleChange(selected.id, { xM: Number(e.target.value) })}
              />
              <RangeField
                label={tm("heightLabel")}
                min={SUBSYSTEM_BOUNDS[selected.id].yM.min}
                max={SUBSYSTEM_BOUNDS[selected.id].yM.max}
                step={SUBSYSTEM_BOUNDS[selected.id].yM.step}
                value={selected.yM}
                valueDisplay={formatMm(selected.yM)}
                onChange={(e) => handleChange(selected.id, { yM: Number(e.target.value) })}
              />
              <p className="augi-muted augi-note">{tm("unitsNote")}</p>
            </Panel>
          ) : (
            <Panel variant="inset" className="augi-context__card">
              <p className="augi-muted augi-note">{tm("selectedPartLabel")}</p>
            </Panel>
          )}

          <MetricReadout
            label={tm("totalMassLabel")}
            disclosureLabel={t("results.conceptEstimate")}
            value={formatKg(metrics.totalMassKg)}
            sublabel={`${tm("frontShareLabel")} ${formatPercent(metrics.share.front)} · ${tm("rearShareLabel")} ${formatPercent(metrics.share.rear)}`}
            limitationNote={tm("conceptNote")}
          />

          <Panel variant="inset" className="augi-context__card">
            <div className="augi-kv org-tabular">
              <div><span>{tm("frontShareLabel")}</span><strong>{formatPercent(metrics.share.front)} · {formatKg(metrics.share.frontKg)}</strong></div>
              <div><span>{tm("rearShareLabel")}</span><strong>{formatPercent(metrics.share.rear)} · {formatKg(metrics.share.rearKg)}</strong></div>
              <div><span>{tm("cgPositionLabel")}</span><strong>{formatSignedMm(metrics.xM)}</strong></div>
              <div><span>{tm("cgHeightLabel")}</span><strong>{formatMm(metrics.yM)}</strong></div>
              <div><span>{t("params.wheelbase")}</span><strong>{formatMm(metrics.wheelbaseM)}</strong></div>
            </div>
          </Panel>
        </aside>
      </main>
    </OrganizationThemeProvider>
  );
}
