import type { CaisraRow } from "@rakazo/core";
import { CaisraRowKind } from "@rakazo/core";
import "./thread.css";

/**
 * The conversation.
 *
 * Rows arrive already decided by `caisraRowFromBlock`, so nothing here inspects
 * a message block. That split is deliberate: which row a block becomes is a
 * product decision with a test on it, and this file only says what each row
 * looks like.
 */

export type ThreadRow = CaisraRow & { from?: "person" | "agent"; author?: string };

/** A bubble. The person's is accent on the right; an agent's is fill on the left. */
function Bubble({ row }: { row: Extract<ThreadRow, { kind: "text" }> }) {
  const mine = row.from === "person";
  return (
    <div className={`row ${mine ? "row--right" : "row--left"}`}>
      <div className={`bubble ${mine ? "bubble--mine" : "bubble--theirs"}`}>{row.text}</div>
    </div>
  );
}

/**
 * A centred grey line.
 *
 * Every exchange between agents lands here: a handoff, a peer message, a
 * message arriving from a channel. Giving each of those a bubble is what
 * buries the answer the person was waiting for once a team is working.
 */
function SystemLine({ text }: { text: string }) {
  return (
    <div className="row row--centre">
      <span className="system">{text}</span>
    </div>
  );
}

/** A working line, which goes away when the work ends. */
function Working({ text }: { text: string }) {
  return (
    <div className="row row--left">
      <span className="working">
        <span className="working__dot" />
        {text}
      </span>
    </div>
  );
}

/** A helper running inside this turn. Not a teammate: it leaves when the turn does. */
function Helper({ row }: { row: Extract<ThreadRow, { kind: "helper" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--quiet">
        <div className="card__title">
          {row.name}
          <span className={`pill pill--${row.status}`}>{row.status}</span>
        </div>
        <div className="card__body">{row.result ?? row.task}</div>
      </div>
    </div>
  );
}

/** A teammate that now exists, and can be opened. */
function Teammate({ row }: { row: Extract<ThreadRow, { kind: "teammate" }> }) {
  return (
    <div className="row row--left">
      <div className="card">
        <div className="card__title">{row.name} is in</div>
        {row.title ? <div className="card__body">{row.title}</div> : null}
        <button type="button" className="card__action">
          Open {row.name}
        </button>
      </div>
    </div>
  );
}

/** A question with tappable options, answered once. */
function Choice({ row }: { row: Extract<ThreadRow, { kind: "choice" }> }) {
  return (
    <div className="row row--left">
      <div className="card">
        <div className="card__title">{row.question}</div>
        <div className="choice__options">
          {row.options.map((option) => {
            const picked = row.answerId === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={`choice__option ${picked ? "choice__option--picked" : ""}`}
              >
                {option.letter ? <span className="choice__letter">{option.letter}</span> : null}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** An app offering to be connected, or already connected. */
function Connector({ row }: { row: Extract<ThreadRow, { kind: "connector" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--inline">
        <span className="card__title card__title--inline">{row.label}</span>
        {row.connected ? (
          <span className="connected">Connected</span>
        ) : (
          <button type="button" className="card__action card__action--inline">
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ row }: { row: ThreadRow }) {
  switch (row.kind) {
    case CaisraRowKind.Text:
      return <Bubble row={row} />;
    case CaisraRowKind.System:
      return <SystemLine text={row.text} />;
    case CaisraRowKind.Status:
      return <Working text={row.text} />;
    case CaisraRowKind.Helper:
      return <Helper row={row} />;
    case CaisraRowKind.Teammate:
      return <Teammate row={row} />;
    case CaisraRowKind.Choice:
      return <Choice row={row} />;
    case CaisraRowKind.Connector:
      return <Connector row={row} />;
    default:
      // Every other row kind is drawn by components ported from the desktop
      // build. Until those land, an undrawn row is visible as itself rather
      // than silently absent, because a gap in a thread is the one failure
      // this work exists to prevent.
      return (
        <div className="row row--centre">
          <span className="system system--todo">{row.kind}</span>
        </div>
      );
  }
}

export function Thread({ rows, title }: { rows: readonly ThreadRow[]; title: string }) {
  return (
    <div className="window">
      <header className="header">
        <span className="header__avatar" />
        <span className="header__name">{title}</span>
      </header>
      <div className="thread">
        {rows.map((row, index) => (
          // Fixtures are a fixed list, so the index is stable here.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture list
          <Row key={index} row={row} />
        ))}
      </div>
    </div>
  );
}
