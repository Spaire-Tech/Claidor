import type { Quota } from "@rakazo/core";
import { usageLine } from "@rakazo/core";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import "./account.css";

/**
 * The menu beside the dock's last button. All five of the canvas's rows.
 *
 * The founder's own note on this file is the reason it has five: an earlier
 * build dropped Support and Add account and wrote a comment justifying it — no
 * support URL to point at, no second account to hold — *"which was me
 * overruling the person who designed the screen, in a code comment, where they
 * would never see it."* The founder, on opening that build: *"Account menu
 * being a total joke."*
 *
 * Both rows do something real:
 *
 * - **Support** opens a mail draft with the version and platform already in it,
 *   because that is the first thing anybody is asked for and the last thing
 *   they think to include.
 * - **Add account** opens sign-in. This app holds one account at a time, so
 *   signing in as somebody else replaces the session, which is what a person
 *   means by adding an account to an app that has one. It is not a lie and it
 *   is not dead.
 *
 * It opens from the dock: the canvas puts it at `left: 76px; bottom: 0` of the
 * dock, a white card with the popover shadow, 272 wide.
 */

/** Where Support goes. One constant, because it is the one address nobody has confirmed. */
export const SUPPORT_ADDRESS = "support@claidor.com";

/**
 * The mail draft Support opens, with what support will ask for already in it.
 */
export function supportMailto({
  version,
  platform,
}: {
  version?: string;
  platform?: string;
} = {}): string {
  const body = [
    "",
    "",
    "---",
    `Version: ${version || "unknown"}`,
    `Platform: ${platform || "unknown"}`,
  ];
  const query = new URLSearchParams({ subject: "Caisra", body: body.join("\n") });
  // URLSearchParams writes a space as `+`, which a mail client shows literally.
  // Percent-escapes are what mailto: wants.
  return `mailto:${SUPPORT_ADDRESS}?${query.toString().replace(/\+/g, "%20")}`;
}

export function AccountMenu({
  quota,
  onSettings,
  onUsage,
  onSupport,
  onAddAccount,
  onLogOut,
  onClose,
}: {
  quota?: Quota | null;
  onSettings: () => void;
  onUsage?: () => void;
  onSupport: () => void;
  onAddAccount: () => void;
  onLogOut: () => void;
  onClose: () => void;
}) {
  const usage = usageLine(quota);
  const ref = useRef<HTMLDivElement>(null);

  // Escape and a click anywhere else, which is what every other menu on the
  // machine does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Stopped, or the shell's own Escape would also take the screen back.
        event.stopPropagation();
        onClose();
      }
    };
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    // Deferred, so the click that opened this does not immediately shut it.
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div className="accountmenu" role="menu" ref={ref}>
      <Row
        glyph={
          <Glyph>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 12l4-3" />
          </Glyph>
        }
        label={usage.title}
        {...(onUsage ? { onClick: onUsage } : {})}
        trailing={
          <>
            {usage.value ? (
              // The only place in this menu that is ever not grey: there is a
              // difference between "most of it is gone" and "it is gone", and
              // the second has to be readable at a glance.
              <span
                className={`accountmenu__value ${usage.spent ? "accountmenu__value--spent" : ""}`}
              >
                {usage.value}
              </span>
            ) : null}
            <Chevron />
          </>
        }
      />

      {/* The bar, only when there is a real number behind it. */}
      {usage.fraction !== undefined ? (
        <div className="accountmenu__track">
          <div
            className={`accountmenu__fill ${usage.spent ? "accountmenu__fill--spent" : ""}`}
            style={{ width: `${usage.fraction * 100}%` }}
          />
        </div>
      ) : null}

      <Row
        glyph={
          <Glyph>
            <rect x="4" y="3" width="16" height="18" rx="3" />
            <path d="M9 7h6" />
          </Glyph>
        }
        label="Support"
        onClick={onSupport}
        trailing={<Chevron />}
      />

      <Row
        glyph={
          <Glyph>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
          </Glyph>
        }
        label="Settings"
        onClick={onSettings}
      />

      <div className="accountmenu__divider" />

      <Row
        glyph={
          <Glyph>
            <circle cx="10" cy="8" r="3.4" />
            <path d="M3.5 20c.6-3.4 3.3-5.4 6.5-5.4M18 13v5M15.5 15.5h5" />
          </Glyph>
        }
        label="Add account"
        onClick={onAddAccount}
      />

      <Row
        glyph={
          <Glyph>
            <path d="M10 5H6a2 2 0 00-2 2v10a2 2 0 002 2h4" />
            <path d="M15 8l-3.5 4 3.5 4" />
            <path d="M11.5 12H20" />
          </Glyph>
        }
        label="Log out"
        onClick={onLogOut}
      />
    </div>
  );
}

function Row({
  glyph,
  label,
  onClick,
  trailing,
}: {
  glyph: ReactElement;
  label: string;
  onClick?: () => void;
  trailing?: ReactElement;
}) {
  return (
    <button type="button" className="accountmenu__row" onClick={onClick} disabled={!onClick}>
      {glyph}
      <span className="accountmenu__label">{label}</span>
      {trailing}
    </button>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15.5"
      height="15.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block" }}
    >
      {children}
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="accountmenu__chevron"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
