import { ReactNode } from 'react'
import { Icon } from './Icon'

// — Field wrapper: uppercase label + optional hint, used across the sequence form
export const Field = ({
  label,
  hint,
  optional,
  children,
}: {
  label?: string
  hint?: ReactNode
  optional?: boolean
  children: ReactNode
}) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {label && (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 7,
        }}
      >
        <label
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--ink-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </label>
        {optional && (
          <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
            Optional
          </span>
        )}
      </div>
    )}
    {children}
    {hint && (
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--ink-3)',
          marginTop: 7,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </div>
    )}
  </div>
)

// — Segmented control: pill row of 2-4 options with white-on-grey active pill
export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (next: T) => void
  options: { id: T; label: string }[]
}) => (
  <div
    style={{
      display: 'flex',
      background: 'var(--bg-softer)',
      padding: 3,
      borderRadius: 10,
      border: '1px solid var(--line)',
      width: 'fit-content',
    }}
  >
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        style={{
          padding: '7px 14px',
          fontSize: 13,
          borderRadius: 7,
          background: value === o.id ? '#fff' : 'transparent',
          color: value === o.id ? 'var(--ink)' : 'var(--ink-3)',
          boxShadow:
            value === o.id
              ? '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(15,23,42,0.04)'
              : 'none',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
)

// — Native-styled select wrapped with a chevron icon
export const SelectField = <T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | ''
  onChange: (next: T) => void
  options: { id: T; label: string }[]
  placeholder?: string
}) => (
  <div style={{ position: 'relative' }}>
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value as T)}
      className="input"
      style={{
        paddingRight: 36,
        appearance: 'none',
        WebkitAppearance: 'none',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        color: 'var(--ink-3)',
      }}
    >
      <Icon name="chevron-down" size={14} />
    </div>
  </div>
)

// — Section header + body card used across the new-sequence form
// — Section card: header (title + subtitle + optional status chip) over body.
// `num` is accepted as metadata so the parent's right-rail "On this page"
// nav can scroll to / mark sections complete, but the header itself doesn't
// render a number badge — the design's section cards are clean text only.
export const FormSection = ({
  num,
  title,
  subtitle,
  status,
  children,
}: {
  num?: string
  title: string
  subtitle?: string
  status?: 'complete' | 'progress' | 'warn'
  children: ReactNode
}) => (
  <section
    className="card"
    style={{ padding: 0, overflow: 'hidden' }}
    data-section={num}
  >
    <header
      style={{
        padding: '22px 28px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        background: 'linear-gradient(180deg, #fafafa 0%, #fff 100%)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }}>
            {subtitle}
          </div>
        )}
      </div>
      {status && (
        <span
          className={`chip ${status === 'complete' ? 'chip-success' : status === 'warn' ? 'chip-warn' : ''}`}
        >
          {status === 'complete' && (
            <>
              <Icon name="check" size={11} />
              Complete
            </>
          )}
          {status === 'warn' && (
            <>
              <Icon name="alert" size={11} />
              Needs review
            </>
          )}
          {status === 'progress' && (
            <>
              <span className="dot" />
              In progress
            </>
          )}
        </span>
      )}
    </header>
    <div style={{ padding: '24px 28px 28px' }}>{children}</div>
  </section>
)

// — Tile option: card-style radio used for trigger picker, audience, etc.
export const TileOption = ({
  active,
  onClick,
  icon,
  title,
  desc,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: string
  title: string
  desc?: string
  badge?: string | null
}) => {
  // Icon prop kept for API compatibility but the design's tile is text-only
  // with a corner radio dot. We reference it as `void icon` so the lint
  // doesn't flag it; callers can stop passing it whenever they like.
  void icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`option-card ${active ? 'is-active' : ''}`}
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-start',
        minHeight: 88,
        position: 'relative',
        textAlign: 'left',
      }}
    >
      <span
        className="option-card-radio"
        style={{ position: 'absolute', top: 14, right: 14 }}
      />
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 14,
            right: 36,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {badge}
        </span>
      )}
      <div style={{ paddingRight: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
          {title}
        </div>
        {desc && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--ink-3)',
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            {desc}
          </div>
        )}
      </div>
    </button>
  )
}

// — Settings row: label + hint on left, control on right
export const SettingRow = ({
  label,
  hint,
  control,
}: {
  label: string
  hint?: string
  control: ReactNode
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '4px 0',
    }}
  >
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{label}</div>
      {hint && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 3,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      )}
    </div>
    <div style={{ flexShrink: 0 }}>{control}</div>
  </div>
)

export const MetricTile = ({
  value,
  label,
  delta,
  deltaLabel,
  down,
  subtle,
}: {
  value: string
  label: string
  delta?: string
  deltaLabel?: string
  down?: boolean
  subtle?: boolean
}) => (
  <div className="card metric-tile" style={{ padding: 28 }}>
    <div className="metric-label" style={{ marginTop: 0, marginBottom: 18 }}>
      {label}
    </div>
    <div className="metric-value">{value}</div>
    {delta && (
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: subtle
            ? 'var(--ink-3)'
            : down
              ? 'var(--red)'
              : 'var(--indigo-2)',
        }}
      >
        {!subtle && (
          <Icon name={down ? 'trending-down' : 'trending-up'} size={13} />
        )}
        <span style={{ fontWeight: 500 }}>{delta}</span>
        {deltaLabel && (
          <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>
            {deltaLabel}
          </span>
        )}
      </div>
    )}
  </div>
)

export const Stat = ({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
}) => (
  <div>
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-4)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 17,
        fontWeight: 600,
        color: 'var(--ink)',
        letterSpacing: '-0.02em',
      }}
    >
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
        {sub}
      </div>
    )}
  </div>
)

export const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <div>
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-4)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 3,
      }}
    >
      {k}
    </div>
    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
      {v}
    </div>
  </div>
)

export const Toggle = ({
  on,
  onChange,
}: {
  on: boolean
  onChange: (next: boolean) => void
}) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    style={{
      width: 44,
      height: 26,
      borderRadius: 13,
      background: on ? 'var(--indigo)' : 'var(--line-2)',
      position: 'relative',
      transition: 'background 0.18s',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 3,
        left: on ? 21 : 3,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.18s',
      }}
    />
  </button>
)

export const Section = ({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: ReactNode
}) => (
  <div style={{ marginBottom: 36 }}>
    <h2 className="h2" style={{ marginBottom: 6 }}>
      {title}
    </h2>
    {sub ? (
      <p
        className="muted"
        style={{ fontSize: 14, marginBottom: 24, marginTop: 0 }}
      >
        {sub}
      </p>
    ) : (
      <div style={{ height: 24 }} />
    )}
    {children}
  </div>
)
