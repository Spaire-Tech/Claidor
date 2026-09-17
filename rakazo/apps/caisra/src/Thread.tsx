import type { CaisraRow } from "@rakazo/core";
import {
  CaisraFileKind,
  CaisraRowKind,
  caisraArtifactKind,
  caisraFileKind,
  caisraFileLogo,
  caisraFileSize,
  caisraFileWord,
} from "@rakazo/core";
import { useState } from "react";
import { Artifact } from "./Artifact.js";
import { Blob } from "./Blob.js";
import { Cards } from "./Cards.js";
import { Chart } from "./Chart.js";
import { FileRow } from "./FileRow.js";
import { monogram } from "./filemarks.js";
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

/**
 * An agent asking to connect something.
 *
 * The founder's onboarding card, in the thread: the service's mark, its name,
 * the catalogue's one line, and two pills.
 *
 * **The mark is the fork's, not ours.** `app_connect` carries a `logo`
 * address served by whichever provider holds the catalogue, and `connect`
 * carries an initial and a colour for a service that has none. Caisra ships no
 * service logos of its own: the catalogue behind these blocks runs to
 * thousands of apps, and forty-one bundled files was both more code and less
 * coverage than reading the field that was already there.
 */
function Connector({ row }: { row: Extract<ThreadRow, { kind: "connector" }> }) {
  // A dead address becomes a service with no mark, which the design already
  // draws, rather than the browser's broken-image glyph.
  const [broken, setBroken] = useState(false);
  return (
    <div className="row row--left">
      <div className="card card--connector">
        <span className="tile" style={row.colour ? { background: row.colour } : undefined}>
          {row.logo && !broken ? (
            <img src={row.logo} alt="" width={30} height={30} onError={() => setBroken(true)} />
          ) : (
            <span className={row.colour ? "tile__letter tile__letter--on-colour" : undefined}>
              {row.initial ?? monogram(row.label)}
            </span>
          )}
        </span>
        <span className="card__stack">
          <span className="card__title">{row.label}</span>
          {row.line ? <span className="card__body">{row.line}</span> : null}
        </span>
        {row.connected ? (
          <span className="connected">Connected</span>
        ) : (
          <span className="card__buttons card__buttons--inline">
            <button type="button" className="card__action card__action--ghost">
              Not now
            </button>
            <button type="button" className="card__action">
              Connect
            </button>
          </span>
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

/**
 * A file the agent made, as the whole message.
 *
 * Which mark it wears is `caisraFileKind`'s decision, in core and tested, so a
 * spreadsheet is a spreadsheet on every surface. Anything the design did not
 * draw keeps its extension rather than borrowing another file's icon.
 */
function Attachment({ row }: { row: Extract<ThreadRow, { kind: "attachment" }> }) {
  const kind = caisraFileKind(row.name, row.mimeType);
  const word = kind === CaisraFileKind.Image ? "Image" : (caisraFileWord(row.name) ?? "File");
  return (
    <div className="row row--left">
      <FileRow
        name={row.name}
        {...(row.size === undefined ? {} : { caption: caisraFileSize(row.size) })}
        {...(caisraFileLogo(kind) ? { logo: caisraFileLogo(kind) } : {})}
        word={word}
        onSave={() => undefined}
      />
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
    case CaisraRowKind.Answer: {
      // One language, two roots. A `SlideShow` or a `ReportView` is an
      // artifact — our file card, opening their viewer — and everything else
      // is answer cards.
      const artifact = caisraArtifactKind(row.program);
      return artifact ? (
        <Artifact program={row.program} kind={artifact} />
      ) : (
        <Cards program={row.program} />
      );
    }
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

/**
 * The conversation's header.
 *
 * The canvas centres the Text/Voice pill in it, with the agent on the left and
 * the tools on the right. Voice is drawn and not yet built; it is in the
 * design, so it is here, and pressing it is the one thing this screen cannot
 * do yet.
 */
function Header({
  title,
  subtitle,
  seed,
  mode,
  waiting,
}: {
  title: string;
  subtitle?: string;
  seed: string;
  mode: ThreadMode;
  waiting?: boolean;
}) {
  return (
    <header className="header">
      <Blob seed={seed} size={28} />
      <span className="header__stack">
        <span className="header__name">{title}</span>
        {/* A card is waiting on the person: the header says so rather than
            showing the typing dots, because nothing is happening until they
            answer. */}
        <span className="header__sub">{waiting ? "Waiting for you" : subtitle}</span>
      </span>
      <span className="modes">
        <span className={`modes__tab ${mode === ThreadMode.Text ? "modes__tab--on" : ""}`}>
          Text
        </span>
        <span className={`modes__tab ${mode === ThreadMode.Voice ? "modes__tab--on" : ""}`}>
          Voice
        </span>
      </span>
    </header>
  );
}

export const ThreadMode = {
  Text: "text",
  Voice: "voice",
} as const;
export type ThreadMode = (typeof ThreadMode)[keyof typeof ThreadMode];

export function Thread({
  rows,
  title,
  seed,
  subtitle,
  mode = ThreadMode.Text,
  waiting,
}: {
  rows: readonly ThreadRow[];
  title: string;
  seed: string;
  subtitle?: string;
  mode?: ThreadMode;
  waiting?: boolean;
}) {
  return (
    <>
      <Header
        title={title}
        seed={seed}
        mode={mode}
        {...(subtitle ? { subtitle } : {})}
        {...(waiting ? { waiting } : {})}
      />
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
