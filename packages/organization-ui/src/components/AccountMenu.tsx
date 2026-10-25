import * as React from "react";

export interface AccountMenuProps {
  /** Display name shown on the trigger. */
  name: string;
  /** Short initials for the avatar disc. */
  initials: string;
  /** Secondary line on the trigger (role, organization). */
  detail?: React.ReactNode;
  /** Small badge on the trigger, e.g. demo status. */
  badge?: React.ReactNode;
  /** Accessible label for the popover dialog. */
  dialogLabel: string;
  /** Popover content: identity, preferences, workspace links. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Account trigger with an accessible popover. Closes on Escape and outside clicks and
 * returns focus to the trigger. Apps compose the sections inside.
 */
export function AccountMenu({
  name,
  initials,
  detail,
  badge,
  dialogLabel,
  children,
  className = "",
}: AccountMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className={["org-account", className].filter(Boolean).join(" ")} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`org-account__trigger${open ? " org-account__trigger--open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="org-account__avatar" aria-hidden="true">{initials}</span>
        <span className="org-account__text">
          <span className="org-account__name">{name}</span>
          {detail && <span className="org-account__detail">{detail}</span>}
        </span>
        {badge && <span className="org-account__badge">{badge}</span>}
      </button>
      {open && (
        <div id={popoverId} className="org-account__popover" role="dialog" aria-label={dialogLabel}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface AccountMenuSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: React.ReactNode;
}

export function AccountMenuSection({ eyebrow, className = "", children, ...props }: AccountMenuSectionProps) {
  return (
    <div className={["org-account__section", className].filter(Boolean).join(" ")} {...props}>
      {eyebrow && <span className="org-account__eyebrow">{eyebrow}</span>}
      {children}
    </div>
  );
}

export interface WorkspaceLink {
  label: React.ReactNode;
  href: string;
  current?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface WorkspaceLinksProps {
  ariaLabel: string;
  links: readonly WorkspaceLink[];
}

/** Quiet list of workspace entry links (platform console and organization apps). */
export function WorkspaceLinks({ ariaLabel, links }: WorkspaceLinksProps) {
  return (
    <nav aria-label={ariaLabel} className="org-account__links">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="org-account__link"
          aria-current={link.current ? "page" : undefined}
          onClick={link.onClick}
        >
          <span>{link.label}</span>
          <code>{link.href.replace(/^https?:\/\//, "")}</code>
        </a>
      ))}
    </nav>
  );
}
