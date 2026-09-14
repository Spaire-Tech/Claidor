import { useEffect, useRef } from 'react';

import { ChevronRightIcon, GearIcon, SignOutIcon, UsageIcon } from '../icons';
import { color, glass, line, radius, shadow, text } from '../tokens';
import { type Quota, usageLine } from './account';

export interface AccountMenuProps {
  quota: Quota | null | undefined;
  onSettings: () => void;
  onUsage?: () => void;
  onLogOut: () => void;
  onClose: () => void;
}

/**
 * The menu above the account row.
 *
 * Three of the canvas's six rows, and the three that do something:
 * usage, Settings, Log out. "Support" is not here because there is no
 * support URL in the app to point it at, and "Add account" is not here
 * because nothing in this app holds two accounts. Both would be exactly
 * the dead controls the founder has already objected to once.
 */
export function AccountMenu({
  quota, onSettings, onUsage, onLogOut, onClose,
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
        display: 'flex', alignItems: 'center', gap: 12, height: 44,
        padding: '0 12px', border: 'none', background: 'transparent',
        borderRadius: radius.row, cursor: onClick ? 'pointer' : 'default',
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
        position: 'absolute', left: 2, bottom: 56, width: 272, zIndex: 40,
        padding: 8, borderRadius: radius.modal,
        background: glass.background, backdropFilter: glass.blur,
        border: `1px solid ${glass.border}`,
        boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
    >
      {row(
        <UsageIcon size={17} />,
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
          {onUsage && <ChevronRightIcon size={13} style={{ color: color.faint }} />}
        </>,
      )}

      {/* The bar, only when there is a real number behind it. */}
      {usage.fraction !== undefined && (
        <div
          style={{
            height: 4, margin: '0 12px 6px', borderRadius: 999,
            background: color.fill, overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${usage.fraction * 100}%`, height: '100%',
              background: usage.spent ? color.warning : color.ink,
            }}
          />
        </div>
      )}

      {row(<GearIcon size={17} />, 'Settings', onSettings)}

      <div style={{ height: 1, margin: '7px 10px', background: line.hairline }} />

      {row(<SignOutIcon size={17} />, 'Log out', onLogOut)}
    </div>
  );
}
