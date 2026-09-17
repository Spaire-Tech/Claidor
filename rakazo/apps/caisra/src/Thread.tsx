import type { CaisraRow } from "@rakazo/core";
import { CaisraRowKind } from "@rakazo/core";
import { Blob } from "./Blob.js";
import { Chart } from "./Chart.js";
import "./thread.css";

/**
 * The conversation.
 *
 * Rows arrive already decided by `caisraRowFromBlock`, so nothing here reads a
 * message block. That split is deliberate: which row a block becomes is a
 * product decision with a test on it, and this file only says what a row looks
 * like.
 */

export type ThreadRow = CaisraRow & { from?: "person" | "agent"; author?: string };

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
 * message from a channel. Giving each a bubble is what buries the answer the
 * person was waiting for once a team is working.
 */
function SystemLine({ text }: { text: string }) {
  return (
    <div className="row row--centre">
      <span className="system">{text}</span>
    </div>
  );
}

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

function Teammate({ row }: { row: Extract<ThreadRow, { kind: "teammate" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--teammate">
        <Blob seed={row.botId} size={34} />
        <div className="card__stack">
          <div className="card__title">{row.name} is in</div>
          {row.title ? <div className="card__body">{row.title}</div> : null}
        </div>
        <button type="button" className="card__action card__action--inline">
          Open
        </button>
      </div>
    </div>
  );
}

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

function Connector({ row }: { row: Extract<ThreadRow, { kind: "connector" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--inline">
        <span className="logo">{row.label.slice(0, 1)}</span>
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

/** An answer card: the key/value lines the agent sent. */
function AnswerCard({ row }: { row: Extract<ThreadRow, { kind: "card" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--lines">
        {row.lines.map((line) => (
          <div className="line" key={`${line.k}-${line.v}`}>
            <span className="line__k">{line.k}</span>
            <span className="line__v">{line.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A file or image the agent made, as the whole message. */
function Attachment({ row }: { row: Extract<ThreadRow, { kind: "attachment" }> }) {
  const kind = row.mimeType.startsWith("image/")
    ? "Image"
    : row.name.split(".").pop()?.toUpperCase();
  return (
    <div className="row row--left">
      <div className="card card--inline">
        <span className="filetype">{kind}</span>
        <span className="card__title card__title--inline">{row.name}</span>
        <button type="button" className="card__action card__action--ghost">
          Save a copy
        </button>
      </div>
    </div>
  );
}

/**
 * An approval.
 *
 * The one warning colour in the design is spent here, because this is the card
 * where saying yes is hard to take back.
 */
function Approval({ row }: { row: Extract<ThreadRow, { kind: "auth" }> }) {
  return (
    <div className="row row--left">
      <div className="card card--approval">
        <div className="card__title">
          <span className="warn">▲</span>
          {row.title}
        </div>
        {row.detail ? <div className="card__body mono">{row.detail}</div> : null}
        {row.needsOAuth ? <div className="card__body">Sign-in opens in your browser.</div> : null}
        <div className="card__buttons">
          <button type="button" className="card__action">
            Authorise
          </button>
          <button type="button" className="card__action card__action--ghost">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** A masked field. What is typed never reaches the transcript. */
function Secret({ row }: { row: Extract<ThreadRow, { kind: "secret" }> }) {
  return (
    <div className="row row--left">
      <div className="card">
        <div className="card__title">{row.question}</div>
        <div className="secret">{row.answered ? "••••••••••••" : "••••••••••••"}</div>
        <div className="card__body">
          {row.answered ? "Saved. It never entered the conversation." : "Never shown in the chat."}
        </div>
      </div>
    </div>
  );
}

/** A cloud coding agent's run. */
function CloudAgent({ row }: { row: Extract<ThreadRow, { kind: "cloud_agent" }> }) {
  return (
    <div className="row row--left">
      <div className="card">
        <div className="card__title">
          {row.title}
          <span className={`pill pill--${row.status}`}>{row.status}</span>
        </div>
        {row.prUrl ? <div className="card__body mono">{row.prUrl}</div> : null}
      </div>
    </div>
  );
}

/** A taught skill waiting to be kept. */
function SkillDraft({ row }: { row: Extract<ThreadRow, { kind: "skill_draft" }> }) {
  return (
    <div className="row row--left">
      <div className="card">
        <div className="card__title">Keep this as a skill?</div>
        <div className="card__body">
          <strong>{row.name}</strong> — {row.goal}
        </div>
        <div className="card__buttons">
          <button type="button" className="card__action">
            Keep it
          </button>
          <button type="button" className="card__action card__action--ghost">
            Discard
          </button>
        </div>
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
    case CaisraRowKind.Card:
      return <AnswerCard row={row} />;
    case CaisraRowKind.Attachment:
      return <Attachment row={row} />;
    case CaisraRowKind.Auth:
      return <Approval row={row} />;
    case CaisraRowKind.Secret:
      return <Secret row={row} />;
    case CaisraRowKind.CloudAgent:
      return <CloudAgent row={row} />;
    case CaisraRowKind.SkillDraft:
      return <SkillDraft row={row} />;
    case CaisraRowKind.Chart:
      return <Chart block={row.block} />;
    default: {
      // Exhaustive by construction, the same way the mapping is: a row kind
      // added to `caisra-thread.ts` fails the build here rather than leaving a
      // silent gap in the thread, which is the failure this seam exists to
      // prevent.
      const undrawn: never = row;
      return undrawn;
    }
  }
}

function Composer({ name }: { name: string }) {
  return (
    <div className="composer">
      <button type="button" className="composer__plus" aria-label="Add">
        +
      </button>
      <span className="composer__field">Message {name}</span>
      <button type="button" className="composer__send" aria-label="Send">
        ↑
      </button>
    </div>
  );
}

export function Thread({
  rows,
  title,
  seed,
  subtitle,
}: {
  rows: readonly ThreadRow[];
  title: string;
  seed: string;
  subtitle?: string;
}) {
  return (
    <>
      <header className="header">
        <Blob seed={seed} size={28} />
        <span className="header__stack">
          <span className="header__name">{title}</span>
          {subtitle ? <span className="header__sub">{subtitle}</span> : null}
        </span>
      </header>
      <div className="thread">
        {rows.map((row, index) => (
          // A thread only ever grows at the end, so the position is the row's
          // identity. Rows carry no id of their own: one message block can
          // produce several, and none of them is addressable.
          <Row key={`${index}-${row.kind}`} row={row} />
        ))}
      </div>
      <Composer name={title} />
    </>
  );
}
