import { useState, type FC } from "react";
import {
  Button,
  MetricReadout,
  OrganizationThemeProvider,
  Panel,
  RookmereLogo,
  Status,
} from "@heavy-rain/organization-ui";
import type { PortfolioCompanyRow } from "../types";

export interface RookmereEmbeddedFrameProps {
  companies: PortfolioCompanyRow[];
  externalUrl?: string;
  mode?: "embedded" | "fullscreen";
  reducedMotion?: boolean;
  releaseVersion?: string;
  isObscured?: boolean;
  onExitFullscreen?: () => void;
}

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

export const RookmereEmbeddedFrame: FC<RookmereEmbeddedFrameProps> = ({
  companies,
  externalUrl = "http://127.0.0.1:43173",
  mode = "embedded",
  reducedMotion = false,
  releaseVersion = "1.0.0-rc1",
  isObscured = false,
  onExitFullscreen,
}) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    companies[0]?.companyId ?? "port_kelvion_flow",
  );
  const [showTableCompanion, setShowTableCompanion] = useState<boolean>(false);

  const activeCompany =
    companies.find((c) => c.companyId === selectedCompanyId) ?? companies[0];

  const totals = companies.reduce(
    (acc, row) => {
      acc.ebitdaActual += row.ebitdaActualEur;
      acc.ebitdaBudget += row.ebitdaBudgetEur;
      acc.operationalDelta += row.volumeMixImpactEur + row.costScrapImpactEur;
      acc.fxImpact += row.fxTranslationImpactEur;
      if (row.covenantMaxLeverage - row.netLeverageRatio <= 0.25) {
        acc.watchlistCount += 1;
      }
      return acc;
    },
    {
      ebitdaActual: 0,
      ebitdaBudget: 0,
      operationalDelta: 0,
      fxImpact: 0,
      watchlistCount: 0,
    },
  );

  return (
    <OrganizationThemeProvider
      theme="rookmere"
      reducedMotion={reducedMotion}
      className={`augi-embed-frame rm-embed-frame augi-embed-frame--${mode}`}
    >
      <header className="augi-embed-frame__topbar">
        <div className="augi-embed-frame__brand">
          <RookmereLogo size={20} />
          <span className="augi-embed-frame__org-name">ROOKMERE CAPITAL</span>
          <span className="augi-embed-frame__divider" aria-hidden="true">
            ·
          </span>
          <span className="augi-embed-frame__title">
            Portfolio Variance Workbench
          </span>
          <Status tone="estimate" label={`v${releaseVersion} · 2026-09`} />
        </div>
        <div className="augi-embed-frame__actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTableCompanion((prev) => !prev)}
          >
            {showTableCompanion
              ? "Show live frame"
              : "Compare 8 companies"}
          </Button>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={isObscured ? -1 : undefined}
            className="org-button org-button--primary org-button--sm augi-embed-frame__open-link"
          >
            Open app (127.0.0.1:43173)
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
              src={externalUrl}
              title="Rookmere Capital Portfolio Variance Workbench (http://127.0.0.1:43173)"
              className="augi-embed-frame__iframe"
              loading="eager"
              tabIndex={isObscured ? -1 : undefined}
            />
          </div>
        ) : (
          <div className="augi-embed-frame__comparator">
            <Panel
              title="Rookmere Portfolio Monthly Variance Ledger (2026-09)"
              subtitle="Synthetic monthly trial-balance rollup in EUR across RIG-III (EUR 480m) and RIG-IV (EUR 720m); read-only scope with 0 ERP writes."
            >
              <div className="augi-embed-frame__table-wrap">
                <table className="rm-variance-app__table org-tabular">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Fund / CCY</th>
                      <th>ERP System</th>
                      <th>EBITDA Actual</th>
                      <th>EBITDA Var</th>
                      <th>FX Impact</th>
                      <th>Net Lev / Cov</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((row) => {
                      const deltaEur =
                        row.ebitdaActualEur - row.ebitdaBudgetEur;
                      return (
                        <tr
                          key={row.companyId}
                          className={
                            activeCompany?.companyId === row.companyId
                              ? "rm-variance-app__row--selected"
                              : ""
                          }
                          onClick={() => setSelectedCompanyId(row.companyId)}
                        >
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td className="rm-variance-app__mono">
                            {row.fundShortCode} · {row.localCurrency}
                          </td>
                          <td>{row.erpSystem}</td>
                          <td className="rm-variance-app__mono">
                            {formatEurCompact(row.ebitdaActualEur)}
                          </td>
                          <td className="rm-variance-app__mono">
                            {formatSignedEurK(deltaEur)}
                          </td>
                          <td className="rm-variance-app__mono">
                            {formatSignedEurK(row.fxTranslationImpactEur)}
                          </td>
                          <td className="rm-variance-app__mono">
                            {row.netLeverageRatio.toFixed(2)}x /{" "}
                            {row.covenantMaxLeverage.toFixed(2)}x
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        <div className="augi-embed-frame__metrics">
          <MetricReadout
            label="Monthly EBITDA (Actual vs Budget)"
            value={formatEurCompact(totals.ebitdaActual)}
            sublabel={`${formatSignedEurK(
              totals.ebitdaActual - totals.ebitdaBudget,
            )} vs ${formatEurCompact(totals.ebitdaBudget)} budget`}
            disclosureLabel="Sample fixture"
            limitationNote="Synthetic monthly trial-balance rollup in EUR; read-only scope with 0 ERP journal writes."
          />
          <MetricReadout
            label="Operational vs FX Translation Split"
            value={formatSignedEurK(totals.operationalDelta)}
            sublabel={`FX translation: ${formatSignedEurK(
              totals.fxImpact,
            )} across SEK, NOK, and GBP`}
            disclosureLabel="EUR bridge"
            limitationNote="Separates operational volume/cost bridge from SEK (11.48), NOK (11.79), and GBP (0.84) translation."
          />
          <MetricReadout
            label="Maintenance Covenant Headroom"
            value={`${totals.watchlistCount} of ${companies.length} flagged`}
            sublabel={
              activeCompany
                ? `${activeCompany.name}: ${activeCompany.netLeverageRatio.toFixed(2)}x / ${activeCompany.covenantMaxLeverage.toFixed(2)}x`
                : "Alert threshold within 0.25x of max net leverage"
            }
            disclosureLabel="LTM Net Debt / EBITDA"
            limitationNote="Unaudited monthly management pack leverage approximation; does not replace quarterly lender certificates."
          />
        </div>
      </div>
    </OrganizationThemeProvider>
  );
};
