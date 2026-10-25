import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Button,
  Field,
  MetricReadout,
  NavRail,
  OrganizationThemeProvider,
  Panel,
  RangeField,
  RookmereLogo,
  Status,
} from "@heavy-rain/organization-ui";
import { copy } from "../copy";
import type {
  PortfolioCompanyRow,
  RookmereEmployeeAccount,
  RookmereFeedbackItem,
} from "../types";

export interface RookmereVarianceAppProps {
  companies: PortfolioCompanyRow[];
  activeAccount: RookmereEmployeeAccount;
  accounts: readonly RookmereEmployeeAccount[];
  onSelectAccount: (employeeId: string) => void;
  onOpenEntryScreen: () => void;
  reducedMotion?: boolean;
  onToggleReducedMotion?: () => void;
  releaseVersion?: string;
  feedbackEntries: readonly RookmereFeedbackItem[];
  onSubmitFeedback?: (comment: string) => void;
}

type FundFilter = "all" | "fund_rm_iii" | "fund_rm_iv";
type CurrencyBasis = "reported" | "constant_fx";
type CoverageFilter = "all" | "full" | "watchlist";
type WorkbenchSection = "bridge" | "covenants" | "erp_mapping";

const NAV_ITEMS = [
  { id: "bridge", label: "Variance bridge" },
  { id: "covenants", label: "Covenant headroom" },
  { id: "erp_mapping", label: "ERP & FX mapping" },
] as const;

function formatEurCompact(amountEur: number): string {
  const abs = Math.abs(amountEur);
  const sign = amountEur < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}EUR ${(abs / 1_000_000).toFixed(2)}m`;
  }
  if (abs >= 1_000) {
    return `${sign}EUR ${Math.round(abs / 1_000)}k`;
  }
  return `${sign}EUR ${Math.round(abs)}`;
}

function formatSignedEurK(amountEur: number): string {
  const k = Math.round(amountEur / 1_000);
  if (k === 0) return "EUR 0k";
  return `${k > 0 ? "+" : "-"}EUR ${Math.abs(k)}k`;
}

export const RookmereVarianceApp: FC<RookmereVarianceAppProps> = ({
  companies,
  activeAccount,
  accounts,
  onSelectAccount,
  onOpenEntryScreen,
  reducedMotion = false,
  onToggleReducedMotion,
  releaseVersion = "1.0.0-rc1",
  feedbackEntries,
  onSubmitFeedback,
}) => {
  const [activeSection, setActiveSection] =
    useState<WorkbenchSection>("bridge");
  const [fundFilter, setFundFilter] = useState<FundFilter>("all");
  const [currencyBasis, setCurrencyBasis] =
    useState<CurrencyBasis>("reported");
  const [coverageFilter, setCoverageFilter] =
    useState<CoverageFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Interactive scenario parameters
  const [fxShockBps, setFxShockBps] = useState<number>(0);
  const [costStressBps, setCostStressBps] = useState<number>(0);
  const [covenantBuffer, setCovenantBuffer] = useState<number>(0.25);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    companies[0]?.companyId ?? "port_kelvion_flow",
  );
  const [feedbackDraft, setFeedbackDraft] = useState<string>("");
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Accessible Rookmere account menu state
  const [accountMenuOpen, setAccountMenuOpen] = useState<boolean>(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuControlRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    }
    function handlePointerDown(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        event.target instanceof Node &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [accountMenuOpen]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAccountMenuOpen(true);
      window.requestAnimationFrame(() => {
        firstMenuControlRef.current?.focus();
      });
    }
  }

  const computedRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return companies
      .map((row) => {
        const isNonEur = row.localCurrency !== "EUR";
        const fxMultiplier =
          currencyBasis === "constant_fx"
            ? 0
            : 1 + (isNonEur ? fxShockBps / 10_000 : 0);

        const baseFxImpact =
          currencyBasis === "constant_fx" ? 0 : row.fxTranslationImpactEur;
        const scenarioFxShockEur =
          currencyBasis === "constant_fx" || !isNonEur
            ? 0
            : Math.round(row.ebitdaActualEur * (fxShockBps / 10_000));
        const effectiveFxImpactEur = baseFxImpact + scenarioFxShockEur;

        const scenarioCostDeltaEur = Math.round(
          -row.revenueActualEur * (costStressBps / 10_000) * 0.35,
        );
        const effectiveCostImpactEur =
          row.costScrapImpactEur + scenarioCostDeltaEur;

        const scenarioEbitdaActualEur =
          row.ebitdaBudgetEur +
          row.volumeMixImpactEur +
          effectiveCostImpactEur +
          effectiveFxImpactEur;

        const scenarioRevenueActualEur = Math.round(
          row.revenueActualEur * (isNonEur ? fxMultiplier : 1),
        );

        const scenarioLtmEbitdaEur = Math.max(
          1_000_000,
          row.ltmEbitdaEur +
            (scenarioEbitdaActualEur - row.ebitdaActualEur) * 4,
        );
        const scenarioNetLeverage = Number(
          (row.netDebtEur / scenarioLtmEbitdaEur).toFixed(2),
        );
        const headroom = Number(
          (row.covenantMaxLeverage - scenarioNetLeverage).toFixed(2),
        );

        const covenantStatus: "positive" | "warning" | "critical" =
          headroom <= 0.05
            ? "critical"
            : headroom <= covenantBuffer
            ? "warning"
            : "positive";

        return {
          ...row,
          scenarioRevenueActualEur,
          scenarioEbitdaActualEur,
          effectiveFxImpactEur,
          effectiveCostImpactEur,
          scenarioNetLeverage,
          headroom,
          covenantStatus,
          ebitdaDeltaEur: scenarioEbitdaActualEur - row.ebitdaBudgetEur,
          ebitdaDeltaPct:
            ((scenarioEbitdaActualEur - row.ebitdaBudgetEur) /
              row.ebitdaBudgetEur) *
            100,
        };
      })
      .filter((row) => {
        if (fundFilter !== "all" && row.fundId !== fundFilter) {
          return false;
        }
        if (coverageFilter === "full" && row.detailLevel !== "full") {
          return false;
        }
        if (
          coverageFilter === "watchlist" &&
          row.covenantStatus === "positive"
        ) {
          return false;
        }
        if (query) {
          const haystack =
            `${row.name} ${row.fundShortCode} ${row.localCurrency} ${row.erpSystem} ${row.dealLead} ${row.subsector}`.toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }
        return true;
      });
  }, [
    companies,
    fundFilter,
    currencyBasis,
    coverageFilter,
    searchQuery,
    fxShockBps,
    costStressBps,
    covenantBuffer,
  ]);

  const totals = useMemo(() => {
    return computedRows.reduce(
      (acc, r) => {
        acc.revenueActual += r.scenarioRevenueActualEur;
        acc.revenueBudget += r.revenueBudgetEur;
        acc.ebitdaActual += r.scenarioEbitdaActualEur;
        acc.ebitdaBudget += r.ebitdaBudgetEur;
        acc.volumeMix += r.volumeMixImpactEur;
        acc.costScrap += r.effectiveCostImpactEur;
        acc.fxImpact += r.effectiveFxImpactEur;
        if (r.covenantStatus !== "positive") {
          acc.watchlistCount += 1;
        }
        return acc;
      },
      {
        revenueActual: 0,
        revenueBudget: 0,
        ebitdaActual: 0,
        ebitdaBudget: 0,
        volumeMix: 0,
        costScrap: 0,
        fxImpact: 0,
        watchlistCount: 0,
      },
    );
  }, [computedRows]);

  const selectedCompany =
    computedRows.find((r) => r.companyId === selectedCompanyId) ??
    computedRows[0] ??
    null;

  function handleResetScenario() {
    setFxShockBps(0);
    setCostStressBps(0);
    setCovenantBuffer(0.25);
    setCurrencyBasis("reported");
    setFundFilter("all");
    setCoverageFilter("all");
    setSearchQuery("");
  }

  function handleFeedbackSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = feedbackDraft.trim();
    if (!trimmed) return;
    onSubmitFeedback?.(trimmed);
    setFeedbackDraft("");
    setFeedbackNotice(
      "Change suggestion queued into next weekly Work intake batch.",
    );
  }

  // Waterfall bar geometry calculation
  const waterfallBars = useMemo(() => {
    const budget = totals.ebitdaBudget || 1;
    const volEnd = budget + totals.volumeMix;
    const costEnd = volEnd + totals.costScrap;
    const fxEnd = costEnd + totals.fxImpact;
    const actual = totals.ebitdaActual;

    const values = [budget, volEnd, costEnd, fxEnd, actual, 0];
    const maxVal = Math.max(...values, 1_000_000) * 1.12;

    const toY = (val: number) => {
      const ratio = Math.max(0, Math.min(1, val / maxVal));
      return 148 - ratio * 116;
    };

    return [
      {
        label: "Budget",
        valueText: formatEurCompact(budget),
        top: toY(budget),
        height: Math.max(4, 148 - toY(budget)),
        tone: "base",
      },
      {
        label: "Volume/Mix",
        valueText: formatSignedEurK(totals.volumeMix),
        top: toY(Math.max(budget, volEnd)),
        height: Math.max(4, Math.abs(toY(budget) - toY(volEnd))),
        tone: totals.volumeMix >= 0 ? "positive" : "negative",
      },
      {
        label: "Cost/Scrap",
        valueText: formatSignedEurK(totals.costScrap),
        top: toY(Math.max(volEnd, costEnd)),
        height: Math.max(4, Math.abs(toY(volEnd) - toY(costEnd))),
        tone: totals.costScrap >= 0 ? "positive" : "negative",
      },
      {
        label: "FX Trans.",
        valueText: formatSignedEurK(totals.fxImpact),
        top: toY(Math.max(costEnd, fxEnd)),
        height: Math.max(4, Math.abs(toY(costEnd) - toY(fxEnd))),
        tone: totals.fxImpact >= 0 ? "positive" : "negative",
      },
      {
        label: "Scenario",
        valueText: formatEurCompact(actual),
        top: toY(actual),
        height: Math.max(4, 148 - toY(actual)),
        tone: "total",
      },
    ];
  }, [totals]);

  return (
    <OrganizationThemeProvider
      theme="rookmere"
      reducedMotion={reducedMotion}
      className="rm-variance-app rm-variance-app--fullscreen"
    >
      {/* Top Organization App Bar (Rookmere branding only, no slash mark) */}
      <header className="rm-variance-app__topbar">
        <div className="rm-variance-app__brand">
          <RookmereLogo size={20} />
          <span className="rm-variance-app__org-name">ROOKMERE CAPITAL</span>
          <span className="rm-variance-app__dot" aria-hidden="true">
            ·
          </span>
          <span className="rm-variance-app__app-title">{copy.app.name}</span>
          <Status tone="estimate" label={`v${releaseVersion} · 2026-09`} />
        </div>

        <div className="rm-variance-app__top-actions">
          <Button variant="outline" size="sm" onClick={handleResetScenario}>
            Reset scenario
          </Button>

          {/* Accessible Rookmere Account Menu */}
          <div className="rm-account-menu" ref={accountMenuRef}>
            <button
              ref={accountTriggerRef}
              type="button"
              className={`rm-account-menu__trigger${
                accountMenuOpen ? " rm-account-menu__trigger--active" : ""
              }`}
              aria-expanded={accountMenuOpen}
              aria-haspopup="dialog"
              aria-controls="rm-account-popover"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              onKeyDown={handleTriggerKeyDown}
            >
              <span className="rm-account-menu__name">{activeAccount.name}</span>
              <span className="rm-account-menu__badge">{copy.account.badge}</span>
            </button>

            {accountMenuOpen && (
              <div
                id="rm-account-popover"
                className="rm-account-popover"
                role="dialog"
                aria-label={copy.account.dialogLabel}
              >
                <div className="rm-account-popover__section">
                  <span className="rm-account-popover__eyebrow">
                    {copy.account.identityEyebrow}
                  </span>
                  <strong className="rm-account-popover__identity">
                    {activeAccount.name}
                  </strong>
                  <span className="rm-account-popover__role">
                    {activeAccount.title} · {activeAccount.office}
                  </span>
                  <span className="rm-account-popover__scope">
                    {copy.account.scopePrefix} {activeAccount.permittedScope}
                  </span>

                  <label
                    htmlFor="rm-menu-account-select"
                    className="rm-account-popover__label"
                  >
                    {copy.account.switchLabel}
                  </label>
                  <select
                    ref={firstMenuControlRef}
                    id="rm-menu-account-select"
                    className="org-field__select"
                    value={activeAccount.employeeId}
                    onChange={(e) => onSelectAccount(e.target.value)}
                  >
                    {accounts.map((acc) => (
                      <option key={acc.employeeId} value={acc.employeeId}>
                        {acc.name} · {acc.title} ({acc.office})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rm-account-popover__section">
                  <span className="rm-account-popover__eyebrow">
                    {copy.account.statusEyebrow}
                  </span>
                  <p className="rm-account-popover__note">
                    {copy.account.statusNote}
                  </p>
                  <div className="rm-account-popover__row">
                    {onToggleReducedMotion && (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-pressed={reducedMotion}
                        onClick={onToggleReducedMotion}
                      >
                        {copy.account.reducedMotion.label}:{" "}
                        {reducedMotion
                          ? copy.account.reducedMotion.on
                          : copy.account.reducedMotion.off}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onOpenEntryScreen();
                      }}
                    >
                      {copy.account.entryScreen}
                    </Button>
                  </div>
                </div>

                <div className="rm-account-popover__section rm-account-popover__section--last">
                  <span className="rm-account-popover__eyebrow">
                    {copy.account.linksEyebrow}
                  </span>
                  <nav
                    aria-label="Workspace entry screens"
                    className="rm-account-popover__links"
                  >
                    <a
                      href="http://127.0.0.1:43170/login"
                      className="rm-account-popover__link"
                    >
                      <span>{copy.account.links.heavyRain}</span>
                      <code>127.0.0.1:43170/login</code>
                    </a>
                    <a
                      href="http://127.0.0.1:43173/login"
                      className="rm-account-popover__link"
                      onClick={(e) => {
                        e.preventDefault();
                        setAccountMenuOpen(false);
                        onOpenEntryScreen();
                      }}
                    >
                      <span>{copy.account.links.rookmere}</span>
                      <code>127.0.0.1:43173/login</code>
                    </a>
                    <a
                      href="http://127.0.0.1:43171/login"
                      className="rm-account-popover__link"
                    >
                      <span>{copy.account.links.augi}</span>
                      <code>127.0.0.1:43171/login</code>
                    </a>
                  </nav>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="rm-variance-app__body">
        <aside className="rm-variance-app__rail">
          <NavRail
            eyebrow="Rookmere Funds"
            items={NAV_ITEMS}
            activeId={activeSection}
            onSelect={(id) => setActiveSection(id as WorkbenchSection)}
            ariaLabel="Portfolio variance navigation"
          />
        </aside>

        <div className="rm-variance-app__content">
          <section className="rm-intro" aria-label={copy.intro.name}>
            <span className="rm-intro__portrait" aria-hidden="true" />
            <div className="rm-intro__text">
              <blockquote className="rm-intro__quote">
                <p>{copy.intro.quote}</p>
                <footer className="rm-intro__person">
                  <span className="rm-intro__name">{copy.intro.name}</span>
                  <span className="rm-intro__role">{copy.intro.role}</span>
                </footer>
              </blockquote>
              <p className="rm-intro__proposal">{copy.intro.proposal}</p>
              <p className="rm-intro__need">{copy.intro.need}</p>
            </div>
          </section>

          {/* Top Filter & Scenario Controls Row */}
          <Panel
            variant="inset"
            className="rm-variance-app__controls-panel"
          >
            <div className="rm-variance-app__controls-grid">
              <Field label="Fund scope" htmlFor="rm-fund-select">
                <select
                  id="rm-fund-select"
                  className="org-field__select"
                  value={fundFilter}
                  onChange={(e) =>
                    setFundFilter(e.target.value as FundFilter)
                  }
                >
                  <option value="all">
                    All Funds (RIG-III + RIG-IV · EUR 1.20bn)
                  </option>
                  <option value="fund_rm_iii">
                    RIG-III (EUR 480m · 4 companies)
                  </option>
                  <option value="fund_rm_iv">
                    RIG-IV (EUR 720m · 4 companies)
                  </option>
                </select>
              </Field>

              <Field label="Currency basis" htmlFor="rm-fx-select">
                <select
                  id="rm-fx-select"
                  className="org-field__select"
                  value={currencyBasis}
                  onChange={(e) =>
                    setCurrencyBasis(e.target.value as CurrencyBasis)
                  }
                >
                  <option value="reported">Reported EUR (Actual FX)</option>
                  <option value="constant_fx">
                    Constant Budget FX (Operational only)
                  </option>
                </select>
              </Field>

              <Field label="Coverage filter" htmlFor="rm-coverage-select">
                <select
                  id="rm-coverage-select"
                  className="org-field__select"
                  value={coverageFilter}
                  onChange={(e) =>
                    setCoverageFilter(e.target.value as CoverageFilter)
                  }
                >
                  <option value="all">All portfolio companies (8)</option>
                  <option value="full">Full trial-balance mapped (4)</option>
                  <option value="watchlist">
                    Covenant watchlist (≤ {covenantBuffer.toFixed(2)}x buffer)
                  </option>
                </select>
              </Field>

              <Field label="Filter company or ERP" htmlFor="rm-search-input">
                <input
                  id="rm-search-input"
                  type="search"
                  className="org-field__input"
                  placeholder="Kelvion, SEK, SAP, Visma..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </Field>

              <RangeField
                label="Non-EUR FX shock (SEK/NOK/GBP)"
                min={-500}
                max={500}
                step={25}
                value={fxShockBps}
                valueDisplay={`${fxShockBps > 0 ? "+" : ""}${fxShockBps} bps`}
                onChange={(e) => setFxShockBps(Number(e.target.value))}
              />

              <RangeField
                label="Input cost & scrap sensitivity"
                accent="stress"
                min={-200}
                max={300}
                step={25}
                value={costStressBps}
                valueDisplay={`${costStressBps > 0 ? "+" : ""}${costStressBps} bps`}
                onChange={(e) => setCostStressBps(Number(e.target.value))}
              />

              <RangeField
                label="Covenant headroom alert buffer"
                accent="stress"
                min={0.1}
                max={0.5}
                step={0.05}
                value={covenantBuffer}
                valueDisplay={`${covenantBuffer.toFixed(2)}x`}
                onChange={(e) => setCovenantBuffer(Number(e.target.value))}
              />
            </div>
          </Panel>

          {/* 3 Metric Readout Cards with inline scope disclosures */}
          <div className="rm-variance-app__metrics-row">
            <MetricReadout
              label="Monthly EBITDA (Scenario vs Budget)"
              value={formatEurCompact(totals.ebitdaActual)}
              sublabel={`${formatSignedEurK(
                totals.ebitdaActual - totals.ebitdaBudget,
              )} vs ${formatEurCompact(totals.ebitdaBudget)} budget`}
              disclosureLabel="Sample fixture"
              limitationNote="Synthetic monthly trial-balance rollup in EUR; read-only scope with 0 ERP journal writes."
            />
            <MetricReadout
              label="Operational vs FX Translation Split"
              value={formatSignedEurK(totals.volumeMix + totals.costScrap)}
              sublabel={`FX translation: ${formatSignedEurK(
                totals.fxImpact,
              )} (${
                currencyBasis === "constant_fx"
                  ? "Constant budget FX locked"
                  : `SEK/NOK/GBP ${fxShockBps >= 0 ? "+" : ""}${fxShockBps} bps`
              })`}
              disclosureLabel="EUR bridge"
              limitationNote="Separates operational volume/cost bridge from SEK (11.48), NOK (11.79), and GBP (0.84) translation."
            />
            <MetricReadout
              label="Maintenance Covenant Headroom"
              value={`${totals.watchlistCount} of ${computedRows.length} flagged`}
              sublabel={`Alert threshold: within ${covenantBuffer.toFixed(
                2,
              )}x of max net leverage`}
              disclosureLabel="LTM Net Debt / EBITDA"
              limitationNote="Unaudited monthly management pack leverage approximation; does not replace quarterly lender certificates."
            />
          </div>

          {/* Main Grid: Waterfall Bridge + Portfolio Ledger Table */}
          <div className="rm-variance-app__main-grid">
            <Panel
              title="Monthly EBITDA Bridge (EUR)"
              subtitle="Budget to scenario actual decomposition"
              className="rm-variance-app__waterfall-panel"
            >
              <svg
                viewBox="0 0 340 185"
                className="rm-variance-app__waterfall-svg"
                role="img"
                aria-label="Portfolio EBITDA variance waterfall chart"
              >
                <line
                  x1="20"
                  y1="148"
                  x2="324"
                  y2="148"
                  stroke="#DCDAD2"
                  strokeWidth="1"
                />
                {waterfallBars.map((bar, index) => {
                  const x = 28 + index * 58;
                  const fill =
                    bar.tone === "base" || bar.tone === "total"
                      ? "#16202A"
                      : bar.tone === "positive"
                      ? "#15803D"
                      : "#B91C1C";
                  return (
                    <g key={bar.label}>
                      <rect
                        x={x}
                        y={bar.top}
                        width="38"
                        height={bar.height}
                        rx="2"
                        fill={fill}
                      />
                      <text
                        x={x + 19}
                        y={Math.max(14, bar.top - 6)}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, monospace"
                        fill="#16202A"
                      >
                        {bar.valueText}
                      </text>
                      <text
                        x={x + 19}
                        y="166"
                        textAnchor="middle"
                        fontSize="10"
                        fill="#434E5B"
                      >
                        {bar.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {selectedCompany && (
                <div className="rm-variance-app__selected-driver">
                  <div className="rm-variance-app__selected-header">
                    <strong>{selectedCompany.name}</strong>
                    <span>
                      {selectedCompany.fundShortCode} ·{" "}
                      {selectedCompany.localCurrency} ·{" "}
                      {selectedCompany.erpSystem}
                    </span>
                  </div>
                  <p className="rm-variance-app__selected-text">
                    {selectedCompany.primaryVarianceDriver}
                  </p>
                  <div className="rm-variance-app__selected-meta">
                    <span>Deal lead: {selectedCompany.dealLead}</span>
                    <span>Finance: {selectedCompany.financeReviewer}</span>
                    <span>
                      FX:{" "}
                      {selectedCompany.localCurrency === "EUR"
                        ? "1.00 EUR"
                        : `${selectedCompany.fxRateActual} ${selectedCompany.localCurrency}/EUR (Bud ${selectedCompany.fxRateBudget})`}
                    </span>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title={
                activeSection === "covenants"
                  ? "Portfolio Net Leverage & Covenant Headroom Schedule"
                  : activeSection === "erp_mapping"
                  ? "ERP Trial-Balance Ingestion & FX Mapping Schedule"
                  : "Portfolio Company Monthly Variance Ledger (2026-09)"
              }
              subtitle="Click any portfolio company row to inspect ERP source mapping and variance driver"
              className="rm-variance-app__table-panel"
            >
              <div className="rm-variance-app__table-wrap">
                <table className="rm-variance-app__table org-tabular">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Fund / CCY</th>
                      <th>Rev vs Bud</th>
                      <th>EBITDA Actual</th>
                      <th>EBITDA Var</th>
                      <th>FX Impact</th>
                      <th>Net Lev / Cov</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedRows.map((row) => {
                      const isSelected =
                        selectedCompany?.companyId === row.companyId;
                      return (
                        <tr
                          key={row.companyId}
                          className={
                            isSelected ? "rm-variance-app__row--selected" : ""
                          }
                          onClick={() => setSelectedCompanyId(row.companyId)}
                        >
                          <td>
                            <button
                              type="button"
                              className="rm-variance-app__row-btn"
                              onClick={() =>
                                setSelectedCompanyId(row.companyId)
                              }
                            >
                              <span className="rm-variance-app__co-name">
                                {row.name}
                              </span>
                              <span className="rm-variance-app__co-erp">
                                {row.erpSystem}
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className="rm-variance-app__mono">
                              {row.fundShortCode} · {row.localCurrency}
                            </span>
                          </td>
                          <td>
                            <span className="rm-variance-app__mono">
                              {formatSignedEurK(
                                row.scenarioRevenueActualEur -
                                  row.revenueBudgetEur,
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="rm-variance-app__mono">
                              {formatEurCompact(row.scenarioEbitdaActualEur)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`rm-variance-app__mono ${
                                row.ebitdaDeltaEur >= 0
                                  ? "rm-variance-app__delta--pos"
                                  : "rm-variance-app__delta--neg"
                              }`}
                            >
                              {formatSignedEurK(row.ebitdaDeltaEur)} (
                              {row.ebitdaDeltaPct >= 0 ? "+" : ""}
                              {row.ebitdaDeltaPct.toFixed(1)}%)
                            </span>
                          </td>
                          <td>
                            <span className="rm-variance-app__mono">
                              {formatSignedEurK(row.effectiveFxImpactEur)}
                            </span>
                          </td>
                          <td>
                            <Status
                              tone={row.covenantStatus}
                              label={`${row.scenarioNetLeverage.toFixed(
                                2,
                              )}x / ${row.covenantMaxLeverage.toFixed(2)}x`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel
            title="Report issue or suggest change for next weekly cutoff"
            subtitle={`Submitting as ${activeAccount.name} (${activeAccount.title}) · Routes structured feedback into Heavy Rain Work queue`}
          >
            <form
              className="rm-variance-app__feedback-form"
              onSubmit={handleFeedbackSubmit}
            >
              <input
                type="text"
                className="org-field__input rm-variance-app__feedback-input"
                placeholder="Example: Add working-capital DSO/DPO aging columns for ThermaRail and Kelvion Flow..."
                value={feedbackDraft}
                onChange={(e) => setFeedbackDraft(e.target.value)}
              />
              <Button type="submit" variant="primary" size="sm">
                Report issue or suggest change
              </Button>
              {feedbackNotice && (
                <span className="rm-variance-app__feedback-notice">
                  {feedbackNotice}
                </span>
              )}
            </form>

            {feedbackEntries.length > 0 && (
              <ul className="rm-variance-app__feedback-list">
                {feedbackEntries.map((fb) => (
                  <li key={fb.id} className="rm-variance-app__feedback-item">
                    <div className="rm-variance-app__feedback-item-top">
                      <strong>
                        {fb.employeeName} ({fb.role})
                      </strong>
                      <span className="rm-variance-app__mono">
                        {fb.submittedAt}
                      </span>
                    </div>
                    <p>{fb.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </OrganizationThemeProvider>
  );
};
