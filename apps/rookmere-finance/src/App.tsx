import { useEffect, useMemo, useState, type FC } from "react";
import {
  Button,
  Field,
  OrganizationThemeProvider,
  Panel,
  RookmereLogo,
  Status,
} from "@heavy-rain/organization-ui";
import {
  INITIAL_ROOKMERE_FEEDBACK,
  ROOKMERE_COMPANIES,
  ROOKMERE_DEMO_ACCOUNTS,
} from "./data/rookmereFixture";
import type { RookmereFeedbackItem } from "./types";
import { RookmereVarianceApp } from "./components/RookmereVarianceApp";
import { copy } from "./copy";

const ACCOUNT_STORAGE_KEY = "rookmere_finance_demo_account_v1";
const REDUCED_MOTION_STORAGE_KEY = "rookmere_finance_reduced_motion_v1";

function isEntryScreenRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return (
    path === "/login" ||
    path.endsWith("/login") ||
    params.get("login") === "1"
  );
}

function formatUtcNow(): string {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `2026-10-25 ${hh}:${mm} UTC`;
}

export const App: FC = () => {
  const [showEntryScreen, setShowEntryScreen] = useState<boolean>(() =>
    isEntryScreenRoute(),
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
        if (
          saved &&
          ROOKMERE_DEMO_ACCOUNTS.some((acc) => acc.employeeId === saved)
        ) {
          return saved;
        }
      } catch {
        // Ignore storage read errors in restricted environments
      }
    }
    return ROOKMERE_DEMO_ACCOUNTS[0].employeeId;
  });

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
        if (saved === "true" || saved === "false") {
          return saved === "true";
        }
      } catch {
        // Ignore storage read errors
      }
      if (typeof window.matchMedia === "function") {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
    }
    return false;
  });

  const [feedbackEntries, setFeedbackEntries] = useState<
    RookmereFeedbackItem[]
  >(() => [...INITIAL_ROOKMERE_FEEDBACK]);

  useEffect(() => {
    function handlePopState() {
      setShowEntryScreen(isEntryScreenRoute());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeAccount = useMemo(
    () =>
      ROOKMERE_DEMO_ACCOUNTS.find(
        (acc) => acc.employeeId === selectedEmployeeId,
      ) ?? ROOKMERE_DEMO_ACCOUNTS[0],
    [selectedEmployeeId],
  );

  function handleSelectAccount(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    try {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, employeeId);
    } catch {
      // Ignore storage write errors
    }
  }

  function handleToggleReducedMotion() {
    setReducedMotion((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }

  function handleEnterWorkspace(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, activeAccount.employeeId);
    } catch {
      // Ignore storage write errors
    }
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/");
    }
    setShowEntryScreen(false);
  }

  function handleOpenEntryScreen() {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/login");
    }
    setShowEntryScreen(true);
  }

  if (showEntryScreen) {
    return (
      <OrganizationThemeProvider
        theme="rookmere"
        reducedMotion={reducedMotion}
        className="rm-entry-shell"
      >
        <main className="rm-entry-stage" aria-labelledby="rm-entry-heading">
          <Panel variant="surface" className="rm-entry-card">
            <div className="rm-entry-card__brand">
              <RookmereLogo size={28} />
              <div>
                <span className="rm-entry-card__org">{copy.entry.org}</span>
                <p className="rm-entry-card__entity">
                  {copy.entry.entity}
                </p>
              </div>
              <Status tone="estimate" label={copy.entry.demoBadge} />
            </div>

            <h1 id="rm-entry-heading" className="rm-entry-card__title">
              {copy.entry.title}
            </h1>
            <p className="rm-entry-card__subtitle">{copy.entry.subtitle}</p>

            <form
              className="rm-entry-card__form"
              onSubmit={handleEnterWorkspace}
            >
              <Field
                label={copy.entry.employeeLabel}
                htmlFor="rm-entry-employee-select"
                helperText={copy.entry.employeeHint}
              >
                <select
                  id="rm-entry-employee-select"
                  className="org-field__select"
                  value={activeAccount.employeeId}
                  onChange={(e) => handleSelectAccount(e.target.value)}
                >
                  {ROOKMERE_DEMO_ACCOUNTS.map((acc) => (
                    <option key={acc.employeeId} value={acc.employeeId}>
                      {acc.name} — {acc.title} ({acc.office})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="rm-entry-card__identity-summary org-tabular">
                <div>
                  <span>{copy.entry.departmentLabel}</span>
                  <strong>{activeAccount.department}</strong>
                </div>
                <div>
                  <span>{copy.entry.scopeLabel}</span>
                  <strong>{activeAccount.permittedScope}</strong>
                </div>
              </div>

              <div className="rm-entry-card__actions">
                <Button type="submit" variant="primary" size="md">
                  {copy.entry.enterAction}
                </Button>
              </div>
            </form>

            <footer className="rm-entry-card__footer">
              <span className="rm-entry-card__footer-label">
                {copy.entry.switchLabel}
              </span>
              <nav
                aria-label="Workspace entry screens"
                className="rm-entry-card__links"
              >
                <a href="http://127.0.0.1:43170/login">
                  {copy.entry.links.heavyRain}
                </a>
                <a href="http://127.0.0.1:43173/login" aria-current="page">
                  {copy.entry.links.rookmere}
                </a>
                <a href="http://127.0.0.1:43171/login">
                  {copy.entry.links.augi}
                </a>
              </nav>
            </footer>
          </Panel>
        </main>
      </OrganizationThemeProvider>
    );
  }

  return (
    <RookmereVarianceApp
      companies={ROOKMERE_COMPANIES}
      activeAccount={activeAccount}
      accounts={ROOKMERE_DEMO_ACCOUNTS}
      onSelectAccount={handleSelectAccount}
      onOpenEntryScreen={handleOpenEntryScreen}
      reducedMotion={reducedMotion}
      onToggleReducedMotion={handleToggleReducedMotion}
      releaseVersion="1.0.0-rc1"
      feedbackEntries={feedbackEntries}
      onSubmitFeedback={(comment) => {
        setFeedbackEntries((prev) => [
          {
            id: `fb_rm_${Date.now()}`,
            employeeName: activeAccount.name,
            role: activeAccount.title,
            submittedAt: formatUtcNow(),
            comment,
          },
          ...prev,
        ]);
      }}
    />
  );
};
