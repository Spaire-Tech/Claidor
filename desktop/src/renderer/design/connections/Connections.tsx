import type { ConnectionItem } from '../../../shared/connections/catalog';
import { APP_LOGO_DIRECTORY, connectionMonogram } from '../../../shared/connections/catalog';
import { color, line, radius, shadow, text } from '../tokens';
import { actionFor, ConnectAction, type RowAction, shelfGroups } from './shelf';

export interface ConnectionsProps {
  query: string;
  /** The services already signed into. */
  connected: ReadonlySet<string>;
  /** The one being signed in, while it is. */
  busyId?: string;
  /** The last thing that went wrong, and which card it was about. */
  failure?: { id: string; message: string };
  /** The installed pill pressed: only the Connected group. */
  onlyConnected?: boolean;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}

/**
 * The shelf of services, as the canvas draws it.
 *
 * A section per category — its name at 15.5 and a count beside it — and
 * a `minmax(320px, 1fr)` grid of cards. A card is a 42px logo tile, the
 * name, a tag line under it when there is one, and a button on the
 * right: black "Connect", or green "Connected". That is the whole card;
 * there is no description line. The first build put one there, and put
 * grey statements where the button goes, and the founder said it was
 * "100% different" from what they drew. It was.
 *
 * What the canvas could not know is that most cards cannot sign in
 * today: a browser one, a local one, a channel, a vendor that wants a
 * client we have not registered. Those cards keep the canvas's shape
 * and use its tag-line slot for the fact — "In your browser", "On this
 * Mac", "Not yet" — and have no button, because a button that opens
 * nothing is the one thing worse than no button. `shelf.ts` decides
 * which, and it is the only decision on this screen worth testing.
 *
 * What you have connected is lifted to the top, because four out of a
 * hundred and thirty is otherwise a hunt.
 */
export function Connections(props: ConnectionsProps): JSX.Element {
  const groups = shelfGroups(props.query, props.connected, undefined, props.onlyConnected);

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
  const working = row.action === ConnectAction.Working;

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
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        {/*
          The canvas's tag line, 13.5 and muted, under the name. A card
          with a button has nothing to say here; a card without one says
          why — and while a sign-in runs, that it is running.
        */}
        {(!row.pressable) && (
          <span style={{ fontSize: text.label, color: color.muted }}>{row.label}</span>
        )}
        {failure && (
          <span style={{ fontSize: text.label, color: color.danger, lineHeight: 1.4 }}>
            {failure}
          </span>
        )}
      </span>

      {(row.pressable || working) && (
        <button
          type="button"
          disabled={working}
          onClick={() => (connected ? onDisconnect(item.id) : onConnect(item.id))}
          style={{
            flex: '0 0 auto', height: 34, padding: '0 16px', borderRadius: radius.pill,
            font: 'inherit', fontSize: text.small, fontWeight: 500,
            whiteSpace: 'nowrap', cursor: working ? 'default' : 'pointer',
            opacity: working ? 0.6 : 1,
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
            A connected card keeps one control, and pressing it
            disconnects, rather than growing a second button nobody wants
            next to the one they do.
          */}
          {working ? 'Connect' : row.label}
        </button>
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

/**
 * A small logo tile for the installed pill: 26px, radius 8, overlapping
 * the one before it by 7px, exactly as the canvas draws them.
 */
export function PillLogo({ item, first }: { item: ConnectionItem; first: boolean }): JSX.Element {
  const box: React.CSSProperties = {
    position: 'relative', width: 26, height: 26, flex: '0 0 auto', borderRadius: 8,
    background: color.paper, border: `1px solid ${line.hairline}`,
    boxShadow: '0 1px 2px rgba(16,22,35,.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...(first ? {} : { marginLeft: -7 }),
  };
  if (item.logo) {
    return (
      <span style={box}>
        <img src={`${APP_LOGO_DIRECTORY}/${item.logo}`} alt="" width={17} height={17} style={{ objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span style={{ ...box, fontSize: 11, fontWeight: 500, color: color.muted }}>
      {connectionMonogram(item.name)}
    </span>
  );
}
