import { useEffect, useRef } from 'react';

import {
  AddAccountIcon,
  ChevronRightIcon,
  GearIcon,
  SignOutIcon,
  SupportIcon,
  UsageIcon,
} from '../icons';
import { color, line, motion, radius, shadow, text } from '../tokens';
import { type Quota, usageLine } from './account';

export interface AccountMenuProps {
  quota: Quota | null | undefined;
  onSettings: () => void;
  onUsage?: () => void;
  onSupport: () => void;
  onAddAccount: () => void;
  onLogOut: () => void;
  onClose: () => void;
}

/**
 * The menu beside the dock's last button. All five of the canvas's rows.
 *
 * It used to have three. I dropped Support and Add account and wrote a
 * comment justifying it — no support URL to point at, no second account
 * to hold — which was me overruling the person who designed the screen,
 * in a code comment, where they would never see it. The founder, on
 * opening the app: "Account menu being a total joke."
 *
 * Both rows are here and both do something real:
 *
 *  - **Support** opens a mail draft, with the app version and platform
 *    already in it, because the first thing anybody is asked for is what
 *    they are running. The address is one constant in `account.ts`.
 *  - **Add account** opens the browser sign-in. This app holds one
 *    account at a time, so signing in as somebody else replaces the
 *    session — which is what a person means by adding an account to an
 *    app that has one. It is not a lie and it is not dead.
 *
 * Since 17 September it opens from the dock, not the sidebar: the canvas
 * puts it at `left:76px; bottom:0` of the dock, a white card with the
 * popover shadow, 272 wide.
 */
export function AccountMenu({
  quota, onSettings, onUsage, onSupport, onAddAccount, onLogOut, onClose,
}: AccountMenuProps): JSX.Element {
  const usage = usageLine(quota);
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape and on a click anywhere else, which is what every
  // other menu on the machine does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Deferred, so the click that opened this does not immediately shut it.
    const timer = window.setTimeout(
      () => document.addEventListener('mousedown', onDown),
      0,
    );
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  const row = (
    icon: JSX.Element,
    label: string,
    onClick: (() => void) | undefined,
    trailing?: JSX.Element,
  ): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 36,
        padding: '0 10px', border: 'none', background: 'transparent',
        borderRadius: radius.input, cursor: onClick ? 'pointer' : 'default',
        font: 'inherit', color: color.muted, width: '100%',
      }}
    >
      {icon}
      <span style={{ flex: '1 1 auto', textAlign: 'left', fontSize: text.body, color: color.ink }}>
        {label}
      </span>
      {trailing}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'absolute', left: 76, bottom: 0, width: 272, zIndex: 40,
        padding: 6, borderRadius: radius.menu,
        background: color.paper, border: `1px solid ${line.field}`,
        boxShadow: shadow.popover,
        display: 'flex', flexDirection: 'column', gap: 4,
        animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
      }}
    >
      {row(
        <UsageIcon size={15.5} />,
        usage.title,
        onUsage,
        <>
          {usage.value && (
            <span
              style={{
                fontSize: text.small,
                // The only place in this menu that is ever not grey: there
                // is a difference between "most of it is gone" and "it is
                // gone", and the second one has to be readable at a glance.
                color: usage.spent ? color.warning : color.muted,
              }}
            >
              {usage.value}
            </span>
          )}
          <ChevronRightIcon size={12} style={{ color: color.chevron }} />
        </>,
      )}

      {/* The bar, only when there is a real number behind it. */}
      {usage.fraction !== undefined && (
        <div
          style={{
            height: 4, margin: '0 12px 6px', borderRadius: radius.pill,
            background: color.fill, overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${usage.fraction * 100}%`, height: '100%',
              background: usage.spent ? color.warning : color.accent,
            }}
          />
        </div>
      )}

      {row(
        <SupportIcon size={15.5} />,
        'Support',
        onSupport,
        <ChevronRightIcon size={12} style={{ color: color.chevron }} />,
      )}

      {row(<GearIcon size={15.5} />, 'Settings', onSettings)}

      <div style={{ height: 1, margin: '7px 10px', background: color.divider }} />

      {row(<AddAccountIcon size={15.5} />, 'Add account', onAddAccount)}

      {row(<SignOutIcon size={15.5} />, 'Log out', onLogOut)}
    </div>
  );
}
