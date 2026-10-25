import * as React from "react";
import {
  AccountMenu,
  AccountMenuSection,
  AugiLogo,
  Button,
  Field,
  MetricReadout,
  NavRail,
  OrganizationThemeProvider,
  Panel,
  RangeField,
  SegmentedControl,
  Status,
  WorkspaceLinks,
  type NavRailItem,
} from "@heavy-rain/organization-ui";
import type { CameraDirectionId } from "@heavy-rain/organization-3d";
import {
  BASELINE_A_CONFIG,
  CHASSIS_PRESETS,
  MATERIALS,
  MATERIAL_LIST,
  PARAMETER_BOUNDS,
  compareChassisMetrics,
  computeChassisMetrics,
  formatDeflection,
  formatForce,
  formatGauge,
  formatLength,
  formatMass,
  formatStiffness,
  formatStress,
  formatTorque,
  validateParameter,
  type ChassisConfig,
  type LoadCaseId,
  type MaterialId,
  type NavSectionId,
  type UnitSystem,
} from "./model/chassisModel.ts";
import {
  createSnapshotRecord,
  loadSavedSnapshots,
  saveSnapshotsToStorage,
  type SavedStudySnapshot,
} from "./model/storage.ts";
import {
  AUGI_ACCOUNT_STORAGE_KEY,
  AUGI_PREFS_STORAGE_KEY,
  DEMO_ENGINEERS,
  WORKSPACE_URLS,
} from "./model/accounts.ts";
import { ChassisViewport } from "./three/ChassisViewport.tsx";
import type { TransportMode, ViewMode } from "./three/createSableAdapter.ts";
import { t } from "./copy/copy.ts";

type NumericParamKey =
  | "wheelbaseMm"
  | "trackWidthMm"
  | "wallGaugeMm"
  | "crossMemberCount"
  | "torsionTorqueKNm"
  | "bendingLoadKN";

function isEntryScreenRoute(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return path === "/login" || path.endsWith("/login") || params.get("login") === "1";
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in restricted browsers
  }
}

interface Prefs {
  unitSystem: UnitSystem;
  reducedMotion: boolean | null;
}

function loadPrefs(): Prefs {
  const raw = readStorage(AUGI_PREFS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return {
        unitSystem: parsed.unitSystem === "imperial" ? "imperial" : "metric",
        reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : null,
      };
    } catch {
      // fall through
    }
  }
  return { unitSystem: "metric", reducedMotion: null };
}

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function App() {
  const NAV_ITEMS: readonly NavRailItem[] = [
    { id: "chassis", label: t("nav.chassis") },
    { id: "torsion", label: t("nav.torsion") },
    { id: "materials", label: t("nav.materials") },
    { id: "compare", label: t("nav.compare") },
  ];

  const [showEntry, setShowEntry] = React.useState<boolean>(isEntryScreenRoute);
  const [engineerId, setEngineerId] = React.useState<string>(() => {
    const saved = readStorage(AUGI_ACCOUNT_STORAGE_KEY);
    return saved && DEMO_ENGINEERS.some((e) => e.id === saved) ? saved : DEMO_ENGINEERS[0].id;
  });
  const engineer = DEMO_ENGINEERS.find((e) => e.id === engineerId) ?? DEMO_ENGINEERS[0];

  const [prefs] = React.useState<Prefs>(loadPrefs);
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>(prefs.unitSystem);
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => prefs.reducedMotion ?? detectReducedMotion());

  const [activeNav, setActiveNav] = React.useState<NavSectionId>("chassis");
  const [config, setConfig] = React.useState<ChassisConfig>(() => ({ ...BASELINE_A_CONFIG }));
  const [draftInputs, setDraftInputs] = React.useState<Partial<Record<NumericParamKey, string>>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<NumericParamKey, string>>>({});

  // Viewport state
  const [viewMode, setViewMode] = React.useState<ViewMode>("solid");
  const [cutawayFraction, setCutawayFraction] = React.useState<number>(0.5);
  const [cameraPreset, setCameraPreset] = React.useState<CameraDirectionId>("isometric");
  const [resetCounter, setResetCounter] = React.useState<number>(0);
  const [transportMode, setTransportMode] = React.useState<TransportMode>("deformation");
  const [playing, setPlaying] = React.useState<boolean>(false);
  const [deformationAmp, setDeformationAmp] = React.useState<number>(20);
  const [explosionFactor, setExplosionFactor] = React.useState<number>(0);
  const [flightFactor, setFlightFactor] = React.useState<number>(0);
  const [showLoadVectors, setShowLoadVectors] = React.useState<boolean>(false);
  const [showBaselineGhost, setShowBaselineGhost] = React.useState<boolean>(false);
  const [selectedPartId, setSelectedPartId] = React.useState<string | null>(null);

  // Snapshots and status
  const [snapshots, setSnapshots] = React.useState<SavedStudySnapshot[]>(loadSavedSnapshots);
  const [snapshotNameInput, setSnapshotNameInput] = React.useState<string>("");
  const [statusKey, setStatusKey] = React.useState<string>("status.baselineLoaded");
  const [statusDetail, setStatusDetail] = React.useState<string>("");
  const [hasUnsavedEdits, setHasUnsavedEdits] = React.useState<boolean>(false);

  React.useEffect(() => {
    const onPop = () => setShowEntry(isEntryScreenRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  React.useEffect(() => {
    writeStorage(AUGI_PREFS_STORAGE_KEY, JSON.stringify({ unitSystem, reducedMotion }));
  }, [unitSystem, reducedMotion]);

  React.useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  const metrics = React.useMemo(() => computeChassisMetrics(config), [config]);
  const baselineMetrics = React.useMemo(
    () =>
      computeChassisMetrics({
        ...BASELINE_A_CONFIG,
        loadCase: config.loadCase,
        torsionTorqueKNm: config.torsionTorqueKNm,
        bendingLoadKN: config.bendingLoadKN,
      }),
    [config.loadCase, config.torsionTorqueKNm, config.bendingLoadKN]
  );
  const delta = React.useMemo(() => compareChassisMetrics(baselineMetrics, metrics), [baselineMetrics, metrics]);
  const activeMaterial = MATERIALS[config.materialId] ?? MATERIALS["al-6061-t6"];

  const markEdited = () => {
    setHasUnsavedEdits(true);
    setStatusKey("status.unsaved");
    setStatusDetail("");
  };

  const handleSelectNav = (id: string) => {
    const next = id as NavSectionId;
    setActiveNav(next);
    if ((next === "torsion" || next === "compare") && viewMode === "solid") setViewMode("xray");
    if (next === "compare") setShowBaselineGhost(true);
    if (next === "torsion") setShowLoadVectors(true);
    if (next === "chassis" && viewMode === "xray") setViewMode("cutaway");
  };

  // Keeps raw valid draft text so decimal typing such as 3.4 stays 3.4
  const handleNumericChange = (key: NumericParamKey, rawString: string) => {
    setDraftInputs((prev) => ({ ...prev, [key]: rawString }));
    const parsed = Number(rawString);
    const validationError =
      rawString.trim() === "" ? `${PARAMETER_BOUNDS[key].label} ${t("errors.numberRequired")}` : validateParameter(key, parsed, unitSystem);
    if (validationError) {
      setFieldErrors((prev) => ({ ...prev, [key]: validationError }));
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setConfig((prev) => ({ ...prev, id: "custom-candidate", name: "Custom Candidate", [key]: parsed }));
    markEdited();
  };

  const handleResetSingleParameter = (key: NumericParamKey) => {
    setDraftInputs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setConfig((prev) => ({ ...prev, [key]: PARAMETER_BOUNDS[key].default }));
  };

  const handleSelectPreset = (presetId: string) => {
    const found = CHASSIS_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setDraftInputs({});
    setFieldErrors({});
    setConfig({ ...found.config, loadCase: config.loadCase });
    setHasUnsavedEdits(false);
    setStatusKey("status.loaded");
    setStatusDetail(found.shortLabel);
  };

  const handleSelectMaterial = (materialId: MaterialId) => {
    setConfig((prev) => ({ ...prev, id: "custom-candidate", name: "Custom Candidate", materialId }));
    markEdited();
  };

  const handleSelectLoadCase = (loadCase: LoadCaseId) => setConfig((prev) => ({ ...prev, loadCase }));

  const handleResetView = () => {
    setCameraPreset("isometric");
    setResetCounter((c) => c + 1);
  };

  const handleResetToBaseline = () => {
    setDraftInputs({});
    setFieldErrors({});
    setConfig({ ...BASELINE_A_CONFIG });
    setExplosionFactor(0);
    setFlightFactor(0);
    setDeformationAmp(20);
    setPlaying(false);
    setShowBaselineGhost(false);
    setViewMode("solid");
    handleResetView();
    setHasUnsavedEdits(false);
    setStatusKey("status.restored");
    setStatusDetail("");
  };

  const handleSaveSnapshot = () => {
    const record = createSnapshotRecord(config, snapshotNameInput, "baseline-a");
    const next = [record, ...snapshots].slice(0, 12);
    setSnapshots(next);
    saveSnapshotsToStorage(next);
    setSnapshotNameInput("");
    setHasUnsavedEdits(false);
    setStatusKey("status.saved");
    setStatusDetail("");
  };

  const handleLoadSnapshot = (snap: SavedStudySnapshot) => {
    setDraftInputs({});
    setFieldErrors({});
    setConfig({ ...snap.config });
    setHasUnsavedEdits(false);
    setStatusKey("status.loaded");
    setStatusDetail(snap.label);
  };

  const handleDeleteSnapshot = (id: string) => {
    const next = snapshots.filter((s) => s.snapshotId !== id);
    setSnapshots(next);
    saveSnapshotsToStorage(next);
  };

  const handleTransportValue = (mode: TransportMode, value: number) => {
    if (mode === "deformation") setDeformationAmp(Math.round(value));
    else if (mode === "exploded") setExplosionFactor(value);
    else setFlightFactor(value);
  };

  const handleSelectEngineer = (id: string) => {
    setEngineerId(id);
    writeStorage(AUGI_ACCOUNT_STORAGE_KEY, id);
  };

  const openEntry = () => {
    window.history.pushState({}, "", "/login");
    setShowEntry(true);
  };

  const enterWorkspace = (event?: React.FormEvent) => {
    event?.preventDefault();
    writeStorage(AUGI_ACCOUNT_STORAGE_KEY, engineer.id);
    window.history.pushState({}, "", "/");
    setShowEntry(false);
  };

  const signedPct = (pct: number) => `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  const workspaceLinks = [
    { label: t("account.heavyRain"), href: WORKSPACE_URLS.heavyRain },
    { label: t("account.rookmere"), href: WORKSPACE_URLS.rookmere },
    { label: t("account.augi"), href: WORKSPACE_URLS.augi, current: true, onClick: (e: React.MouseEvent) => { e.preventDefault(); openEntry(); } },
  ];

  if (showEntry) {
    return (
      <OrganizationThemeProvider theme="augi" reducedMotion={reducedMotion} className="augi-entry-shell">
        <main className="augi-entry" aria-labelledby="augi-entry-title">
          <Panel className="augi-entry__card">
            <div className="augi-entry__brand">
              <AugiLogo size={28} />
              <span className="augi-brand__name">{t("app.org")}</span>
              <Status tone="estimate" label={t("entry.badge")} />
            </div>
            <h1 id="augi-entry-title" className="augi-entry__title">{t("app.vehicle")}</h1>
            <p className="augi-entry__subtitle">{t("entry.subtitle")}</p>
            <form className="augi-entry__form" onSubmit={enterWorkspace}>
              <Field label={t("entry.identityLabel")} htmlFor="augi-entry-engineer" helperText={t("entry.identityHint")}>
                <select
                  id="augi-entry-engineer"
                  className="org-field__select"
                  value={engineer.id}
                  onChange={(e) => handleSelectEngineer(e.target.value)}
                >
                  {DEMO_ENGINEERS.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} · {e.title}</option>
                  ))}
                </select>
              </Field>
              <Button type="submit" variant="primary">{t("entry.enter")}</Button>
            </form>
            <footer className="augi-entry__footer">
              <span className="org-account__eyebrow">{t("entry.switchLabel")}</span>
              <WorkspaceLinks ariaLabel={t("account.workspacesEyebrow")} links={workspaceLinks.map((l) => ({ ...l, onClick: undefined }))} />
            </footer>
          </Panel>
        </main>
      </OrganizationThemeProvider>
    );
  }

  const numericField = (key: NumericParamKey, label: string, format: (v: number) => string, accent: "control" | "stress" = "control") => (
    <div className="augi-param" key={key}>
      <RangeField
        label={label}
        min={PARAMETER_BOUNDS[key].min}
        max={PARAMETER_BOUNDS[key].max}
        step={PARAMETER_BOUNDS[key].step}
        value={config[key]}
        valueDisplay={format(config[key])}
        accent={accent}
        onChange={(e) => handleNumericChange(key, e.target.value)}
        error={fieldErrors[key]}
      />
      <div className="augi-param__inline">
        <input
          type="number"
          aria-label={label}
          className="org-field__input augi-param__input"
          value={draftInputs[key] ?? (key === "wallGaugeMm" ? config[key].toFixed(1) : String(config[key]))}
          step={PARAMETER_BOUNDS[key].step}
          onChange={(e) => handleNumericChange(key, e.target.value)}
        />
        <span className="augi-param__unit">{PARAMETER_BOUNDS[key].unitMetric}</span>
        {(fieldErrors[key] || config[key] !== PARAMETER_BOUNDS[key].default) && (
          <button type="button" className="augi-param__reset" onClick={() => handleResetSingleParameter(key)}>
            {t("params.resetParameter")}
          </button>
        )}
      </div>
    </div>
  );

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
          <span className="augi-brand__model">{t("app.model")}</span>
        </div>
        <div className="augi-topbar__right">
          <Status tone={hasUnsavedEdits ? "warning" : "neutral"} label={statusDetail ? `${t(statusKey)}: ${statusDetail}` : t(statusKey)} />
          <Button size="sm" variant="ghost" onClick={handleSaveSnapshot}>{t("actions.save")}</Button>
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
              <label htmlFor="augi-account-engineer" className="org-account__eyebrow">{t("account.switchEngineer")}</label>
              <select id="augi-account-engineer" className="org-field__select" value={engineer.id} onChange={(e) => handleSelectEngineer(e.target.value)}>
                {DEMO_ENGINEERS.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {e.title}</option>
                ))}
              </select>
            </AccountMenuSection>
            <AccountMenuSection eyebrow={t("account.preferencesEyebrow")}>
              <SegmentedControl
                ariaLabel={t("units.metric")}
                value={unitSystem}
                onChange={setUnitSystem}
                options={[
                  { value: "metric", label: t("units.metric") },
                  { value: "imperial", label: t("units.imperial") },
                ]}
              />
              <div className="augi-row">
                <Button size="sm" variant="secondary" aria-pressed={reducedMotion} onClick={() => setReducedMotion((v) => !v)}>
                  {reducedMotion ? t("units.reducedMotionOn") : t("units.reducedMotionOff")}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleResetToBaseline}>{t("actions.resetBaseline")}</Button>
              </div>
              <p className="augi-muted augi-note">{t("account.note")}</p>
            </AccountMenuSection>
            <AccountMenuSection eyebrow={t("account.workspacesEyebrow")}>
              <WorkspaceLinks ariaLabel={t("account.workspacesEyebrow")} links={workspaceLinks} />
            </AccountMenuSection>
          </AccountMenu>
        </div>
      </header>

      <main className="augi-main">
        <aside className="augi-left">
          <NavRail items={NAV_ITEMS} activeId={activeNav} onSelect={handleSelectNav} showDotMatrix ariaLabel={t("app.vehicle")} />
        </aside>

        <ChassisViewport
          config={config}
          unitSystem={unitSystem}
          viewMode={viewMode}
          cutawayFraction={cutawayFraction}
          transportMode={transportMode}
          playing={playing}
          deformationAmp={deformationAmp}
          explosionFactor={explosionFactor}
          flightFactor={flightFactor}
          showLoadVectors={showLoadVectors}
          showBaselineGhost={showBaselineGhost}
          reducedMotion={reducedMotion}
          cameraPreset={cameraPreset}
          resetCounter={resetCounter}
          selectedPartId={selectedPartId}
          onChangeViewMode={setViewMode}
          onSelectCameraPreset={setCameraPreset}
          onResetView={handleResetView}
          onToggleLoadVectors={() => setShowLoadVectors((v) => !v)}
          onToggleBaselineGhost={() => setShowBaselineGhost((v) => !v)}
          onTogglePlaying={() => setPlaying((v) => !v)}
          onChangeTransportMode={(mode) => { setTransportMode(mode); setPlaying(false); }}
          onChangeTransportValue={handleTransportValue}
          onSelectPart={setSelectedPartId}
        />

        <aside className="augi-right" aria-label={t("params.heading")}>
          <div className="augi-right__head">
            <h2 className="augi-right__title">{t("params.heading")}</h2>
            <SegmentedControl
              ariaLabel={t("params.loadTorsion")}
              value={config.loadCase}
              onChange={handleSelectLoadCase}
              options={[
                { value: "torsion", label: t("params.loadTorsion") },
                { value: "bending", label: t("params.loadBending") },
              ]}
            />
          </div>

          <Field label={t("params.preset")} htmlFor="augi-preset">
            <select
              id="augi-preset"
              className="org-field__select"
              value={CHASSIS_PRESETS.some((p) => p.id === config.id) ? config.id : "custom"}
              onChange={(e) => e.target.value !== "custom" && handleSelectPreset(e.target.value)}
            >
              {CHASSIS_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {!CHASSIS_PRESETS.some((p) => p.id === config.id) && <option value="custom">{t("params.custom")}</option>}
            </select>
          </Field>

          {numericField("wheelbaseMm", t("params.wheelbase"), (v) => formatLength(v, unitSystem))}
          {numericField("trackWidthMm", t("params.trackWidth"), (v) => formatLength(v, unitSystem))}
          {numericField("wallGaugeMm", t("params.wallGauge"), (v) => formatGauge(v, unitSystem))}
          <Field label={t("params.material")} htmlFor="augi-material" readout={`${activeMaterial.youngsModulusGPa} GPa`}>
            <select id="augi-material" className="org-field__select" value={config.materialId} onChange={(e) => handleSelectMaterial(e.target.value as MaterialId)}>
              {MATERIAL_LIST.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>

          <MetricReadout
            label={config.loadCase === "torsion" ? t("results.torsionalStiffness") : t("results.bendingStiffness")}
            disclosureLabel={t("results.conceptEstimate")}
            value={config.loadCase === "torsion" ? formatStiffness(metrics.torsionalStiffnessNmPerDeg, unitSystem) : `${metrics.bendingStiffnessKNPerMm.toFixed(1)} kN/mm`}
            sublabel={
              config.loadCase === "torsion"
                ? `${t("results.peakTwist")} ${metrics.peakTwistDeg.toFixed(2)} deg · ${t("results.sag")} ${formatDeflection(metrics.peakBendingDeflectionMm, unitSystem)}`
                : `${t("results.sag")} ${formatDeflection(metrics.peakBendingDeflectionMm, unitSystem)} · ${t("results.peakTwist")} ${metrics.peakTwistDeg.toFixed(2)} deg`
            }
            limitationNote={t("results.limitation")}
          />

          {/* Contextual section for the active left-nav item */}
          <div className="augi-context">
            {activeNav === "chassis" && (
              <Panel variant="inset" title={t("sections.chassisTitle")} className="augi-context__card">
                <RangeField
                  label={t("view.cutawayPlane")}
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(cutawayFraction * 100)}
                  valueDisplay={`${Math.round(cutawayFraction * 100)}%`}
                  onChange={(e) => { setCutawayFraction(Number(e.target.value) / 100); if (viewMode === "solid") setViewMode("cutaway"); }}
                />
                <RangeField
                  label={t("params.crossMembers")}
                  min={PARAMETER_BOUNDS.crossMemberCount.min}
                  max={PARAMETER_BOUNDS.crossMemberCount.max}
                  step={1}
                  value={config.crossMemberCount}
                  valueDisplay={`${config.crossMemberCount}`}
                  onChange={(e) => handleNumericChange("crossMemberCount", e.target.value)}
                />
                <div className="augi-kv org-tabular">
                  <div><span>{t("sections.wheelbase")}</span><strong>{formatLength(config.wheelbaseMm, unitSystem)}</strong></div>
                  <div><span>{t("sections.track")}</span><strong>{formatLength(config.trackWidthMm, unitSystem)}</strong></div>
                  <div><span>{t("sections.gauge")}</span><strong>{formatGauge(config.wallGaugeMm, unitSystem)}</strong></div>
                </div>
              </Panel>
            )}
            {activeNav === "torsion" && (
              <Panel variant="inset" title={t("sections.torsionTitle")} className="augi-context__card">
                {config.loadCase === "torsion"
                  ? numericField("torsionTorqueKNm", t("params.peakTorque"), (v) => formatTorque(v, unitSystem), "stress")
                  : numericField("bendingLoadKN", t("params.verticalLoad"), (v) => formatForce(v, unitSystem), "stress")}
                <div className="augi-kv org-tabular">
                  <div><span>{t("sections.bendingStiffness")}</span><strong>{metrics.bendingStiffnessKNPerMm.toFixed(1)} kN/mm</strong></div>
                  <div><span>{t("sections.midSag")}</span><strong>{formatDeflection(metrics.peakBendingDeflectionMm, unitSystem)}</strong></div>
                  <div><span>{t("sections.peakStress")}</span><strong>{formatStress(metrics.peakConceptStressMPa, unitSystem)} ({Math.round(metrics.yieldUtilizationRatio * 100)}% yield)</strong></div>
                  <div><span>{t("results.structuralMass")}</span><strong>{formatMass(metrics.structuralMassKg, unitSystem)}</strong></div>
                  <div><span>{t("results.stiffnessPerMass")}</span><strong>{Math.round(metrics.stiffnessToMassRatioNmDegPerKg)} Nm/(deg·kg)</strong></div>
                </div>
              </Panel>
            )}
            {activeNav === "materials" && (
              <Panel variant="inset" title={activeMaterial.shortLabel} subtitle={t("sections.materialsSubtitle")} className="augi-context__card">
                <div className="augi-kv org-tabular">
                  <div><span>{t("sections.youngs")}</span><strong>{activeMaterial.youngsModulusGPa} GPa</strong></div>
                  <div><span>{t("sections.shear")}</span><strong>{activeMaterial.shearModulusGPa} GPa</strong></div>
                  <div><span>{t("sections.density")}</span><strong>{activeMaterial.densityKgM3} kg/m³</strong></div>
                  <div><span>{t("sections.yield")}</span><strong>{activeMaterial.yieldStrengthMPa} MPa</strong></div>
                  <div><span>{t("sections.railsMass")}</span><strong>{formatMass(metrics.massBreakdown.sideRailsKg, unitSystem)}</strong></div>
                  <div><span>{t("sections.trayMass")}</span><strong>{formatMass(metrics.massBreakdown.batteryTrayEnclosureKg, unitSystem)}</strong></div>
                  <div><span>{t("sections.subframesMass")}</span><strong>{formatMass(metrics.massBreakdown.castSubframesKg, unitSystem)}</strong></div>
                </div>
                <p className="augi-muted augi-note">{activeMaterial.applicationNote}</p>
              </Panel>
            )}
            {activeNav === "compare" && (
              <Panel variant="inset" title={t("sections.compareTitle")} subtitle={t("sections.compareSubtitle")} className="augi-context__card">
                <div className="augi-kv org-tabular">
                  <div><span>{t("sections.stiffnessDelta")}</span><strong className={delta.stiffnessPctDiff >= 0 ? "augi-pos" : "augi-neg"}>{signedPct(delta.stiffnessPctDiff)}</strong></div>
                  <div><span>{t("sections.massDelta")}</span><strong className={delta.massKgDiff <= 0 ? "augi-pos" : "augi-warn"}>{delta.massKgDiff > 0 ? "+" : ""}{formatMass(delta.massKgDiff, unitSystem)} ({signedPct(delta.massPctDiff)})</strong></div>
                  <div><span>{t("sections.twistDelta")}</span><strong className={delta.twistDegDiff <= 0 ? "augi-pos" : "augi-neg"}>{delta.twistDegDiff > 0 ? "+" : ""}{delta.twistDegDiff.toFixed(2)} deg</strong></div>
                  <div><span>{t("sections.sagDelta")}</span><strong className={delta.bendingDeflectionMmDiff <= 0 ? "augi-pos" : "augi-neg"}>{delta.bendingDeflectionMmDiff > 0 ? "+" : ""}{formatDeflection(delta.bendingDeflectionMmDiff, unitSystem)}</strong></div>
                </div>
                <div className="augi-snapshots">
                  <span className="org-account__eyebrow">{t("sections.snapshots")} ({snapshots.length})</span>
                  <div className="augi-row">
                    <input
                      type="text"
                      className="org-field__input augi-snapshots__input"
                      placeholder={t("actions.snapshotPlaceholder")}
                      value={snapshotNameInput}
                      onChange={(e) => setSnapshotNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveSnapshot()}
                    />
                    <Button size="sm" variant="secondary" onClick={handleSaveSnapshot}>{t("actions.saveShort")}</Button>
                  </div>
                  {snapshots.slice(0, 4).map((snap) => (
                    <div key={snap.snapshotId} className="augi-row">
                      <button type="button" className="augi-snapshots__load org-tabular" onClick={() => handleLoadSnapshot(snap)}>
                        <span>{snap.label}</span>
                        <span className="augi-muted">{snap.config.materialId.replace("al-", "")}</span>
                      </button>
                      <button type="button" className="augi-snapshots__delete" aria-label={t("actions.deleteSnapshot")} onClick={() => handleDeleteSnapshot(snap.snapshotId)}>×</button>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </aside>
      </main>
    </OrganizationThemeProvider>
  );
}
