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
 * wanting an API key says "Needs a key". `connections.ts` decides which,
 * and it is the only decision on this screen worth testing.
 *
 * What you have connected is lifted to the top, because four out of a
 * hundred and nine is otherwise a hunt.
 */
export function Connections(props: ConnectionsProps): JSX.Element {
  const groups = shelfGroups(props.query, props.connected);

  if (groups.length === 0) {
    return (
      <div style={{ padding: '18px 12px', fontSize: text.body, color: color.muted }}>
        Nothing by that name. The list has mail, files, meetings, money and about
        a hundred more — try the thing you would call it.
      </div>
    );
  }

  return (
    <>
      {groups.map(group => (
        <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              padding: '14px 12px 6px', fontSize: text.caption, color: color.muted,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}
          >
            {group.title}
          </div>
          {group.items.map(item => (
            <Row
              key={item.id}
              item={item}
              row={actionFor(item, props.connected, props.busyId)}
              failure={props.failure?.id === item.id ? props.failure.message : undefined}
              onConnect={props.onConnect}
              onDisconnect={props.onDisconnect}
            />
          ))}
        </div>
      ))}
    </>
  );
}

interface RowProps {
  item: ConnectionItem;
  row: RowAction;
  failure?: string;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}

function Row({ item, row, failure, onConnect, onDisconnect }: RowProps): JSX.Element {
  const connected = row.action === ConnectAction.Connected;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: radius.row,
      }}
    >
      <Logo item={item} />
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: text.emphasis, fontWeight: 500, letterSpacing: tracking.body }}>
          {item.name}
        </span>
        {item.line && (
          <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.4 }}>
            {item.line}
          </span>
        )}
        {failure && (
          <span style={{ fontSize: text.caption, color: color.danger, lineHeight: 1.4 }}>
            {failure}
          </span>
        )}
      </span>

      {row.pressable ? (
        <button
          type="button"
          onClick={() => (connected ? onDisconnect(item.id) : onConnect(item.id))}
          style={{
            flex: '0 0 auto', height: 32, padding: '0 16px', borderRadius: radius.pill,
            border: `1px solid ${connected ? 'transparent' : line.button}`,
            background: connected ? color.successFill : color.paper,
            color: connected ? color.success : color.ink,
            font: 'inherit', fontSize: text.small, cursor: 'pointer',
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
        <span style={{ flex: '0 0 auto', fontSize: text.small, color: color.faint }}>
          {row.label}
        </span>
      )}
    </div>
  );
}

/** The service's mark, or its initial when we have no file for it. */
function Logo({ item }: { item: ConnectionItem }): JSX.Element {
  const box: React.CSSProperties = {
    flex: '0 0 auto', width: 34, height: 34, borderRadius: radius.chip,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: color.paper, border: `1px solid ${line.hairline}`,
    boxShadow: shadow.flat, overflow: 'hidden',
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
          width={22}
          height={22}
          style={{ objectFit: 'contain' }}
        />
      </span>
    );
  }
  return (
    <span style={{ ...box, fontSize: text.body, fontWeight: 500, color: color.muted }}>
      {connectionMonogram(item.name)}
    </span>
  );
}
