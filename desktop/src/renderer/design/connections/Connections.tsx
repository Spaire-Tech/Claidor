import type { ConnectionItem } from '../../../shared/connections/catalog';
import { APP_LOGO_DIRECTORY, connectionMonogram } from '../../../shared/connections/catalog';
import { color, line, radius, shadow, text, tracking } from '../tokens';
import { actionFor, ConnectAction, type RowAction, shelfGroups } from './shelf';

export interface ConnectionsProps {
  query: string;
  /** The services already signed into. */
  connected: ReadonlySet<string>;
  /** The one being signed in, while it is. */
  busyId?: string;
  /** The last thing that went wrong, and which card it was about. */
  failure?: { id: string; message: string };
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}

/**
 * The shelf of services.
 *
 * A hundred and nine cards, and only forty-eight can be signed into
 * today. The other sixty-one say what they are instead of offering a
 * button that opens nothing — a browser one says "In your browser", one
 * wanting an API key says "Needs a key". `shelf.ts` decides which,
 * and it is the only decision on this screen worth testing.
 *
 * What you have connected is lifted to the top, because four out of a
 * hundred and nine is otherwise a hunt.
 *
 * The shape is the canvas's: a section per category, each with its name
 * and a count, and a `minmax(320px, 1fr)` grid of cards underneath. This
 * was a list of 34px rows in a 620px modal, which is what a settings
 * page looks like, not a shelf.
 */
export function Connections(props: ConnectionsProps): JSX.Element {
  const groups = shelfGroups(props.query, props.connected);

  if (groups.length === 0) {
    return (
      <div style={{ fontSize: text.message, color: color.muted, textAlign: 'center', padding: '48px 0' }}>
        Nothing matches that search.
      </div>
    );
  }

  return (
    <>
      {groups.map(group => (
        <div
          key={group.id}
          style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 36 }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '0 2px' }}>
            <span style={{ fontSize: text.emphasis, fontWeight: 500, letterSpacing: '-.008em', color: color.ink }}>
              {group.title}
            </span>
            <span style={{ fontSize: text.small, color: color.muted }}>{group.items.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {group.items.map(item => (
              <Card
                key={item.id}
                item={item}
                row={actionFor(item, props.connected, props.busyId)}
                {...(props.failure?.id === item.id ? { failure: props.failure.message } : {})}
                onConnect={props.onConnect}
                onDisconnect={props.onDisconnect}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

interface CardProps {
  item: ConnectionItem;
  row: RowAction;
  failure?: string;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}

function Card({ item, row, failure, onConnect, onDisconnect }: CardProps): JSX.Element {
  const connected = row.action === ConnectAction.Connected;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px',
        background: color.paper, border: `1px solid ${line.hairline}`,
        borderRadius: radius.card, boxShadow: shadow.flat,
      }}
    >
      <Logo item={item} />
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: text.emphasis, fontWeight: 400, color: color.ink,
            letterSpacing: tracking.body,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        {item.line && (
          <span style={{ fontSize: text.label, color: color.muted }}>{item.line}</span>
        )}
        {failure && (
          <span style={{ fontSize: text.label, color: color.danger, lineHeight: 1.4 }}>
            {failure}
          </span>
        )}
      </span>

      {row.pressable ? (
        <button
          type="button"
          onClick={() => (connected ? onDisconnect(item.id) : onConnect(item.id))}
          style={{
            flex: '0 0 auto', height: 34, padding: '0 16px', borderRadius: radius.pill,
            font: 'inherit', fontSize: text.small, fontWeight: 500,
            whiteSpace: 'nowrap', cursor: 'pointer',
            ...(connected
              ? {
                background: color.successFill,
                color: color.success,
                border: '1px solid rgba(26,133,71,.22)',
              }
              : { background: color.ink, color: color.paper, border: 'none' }),
          }}
        >
          {/*
            A connected card keeps one control and changes what it says on
            hover, rather than growing a second button nobody wants next
            to the one they do.
          */}
          {row.label}
        </button>
      ) : (
        <span style={{ flex: '0 0 auto', fontSize: text.small, color: color.faint, whiteSpace: 'nowrap' }}>
          {row.label}
        </span>
      )}
    </div>
  );
}

/** The service's mark, or its initial when we have no file for it. */
function Logo({ item }: { item: ConnectionItem }): JSX.Element {
  const box: React.CSSProperties = {
    flex: '0 0 auto', position: 'relative', width: 42, height: 42,
    borderRadius: radius.control,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: color.fillRaised, border: `1px solid ${line.hairline}`,
    overflow: 'hidden',
  };
  if (item.logo) {
    return (
      <span style={box}>
        {/*
          Relative on purpose. A packaged renderer is loaded over
          `file://`, where a leading slash means the root of the disk
          rather than the root of the app, and every logo would 404.
        */}
        <img
          src={`${APP_LOGO_DIRECTORY}/${item.logo}`}
          alt=""
          width={26}
          height={26}
          style={{ objectFit: 'contain' }}
        />
      </span>
    );
  }
  return (
    <span style={{ ...box, fontSize: text.base, fontWeight: 500, color: color.muted }}>
      {connectionMonogram(item.name)}
    </span>
  );
}
