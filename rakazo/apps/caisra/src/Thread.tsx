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
import { markFor, monogram } from "./marks.js";
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
          <span className={`statuschip statuschip--${row.status}`}>{row.status}</span>
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
  // Ours first, then the address the catalogue served, then the monogram.
  const mark = markFor(row.logo, row.provider, row.label);
  return (
    <div className="row row--left">
      <div className="card card--connector">
        <span className="tile" style={row.colour ? { background: row.colour } : undefined}>
          {mark && !broken ? (
            <img src={mark} alt="" width={30} height={30} onError={() => setBroken(true)} />
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
          <span className={`statuschip statuschip--${row.status}`}>{row.status}</span>
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
      <div className="composer__pill">
        <button type="button" className="composer__plus" aria-label="More">
          +
        </button>
        <span className="composer__field">Message {name}</span>
        {/* One control, two jobs: empty it is a microphone, with a draft an
            arrow. No dead button is ever shown. */}
        <button type="button" className="composer__send" aria-label="Speak">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0" />
            <path d="M12 18v3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** A 24×24 glyph off the canvas, stroked in the button's own colour. */
function Glyph({ d, size = 15, weight = 1.7 }: { d: string; size?: number; weight?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block" }}
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The conversation's header, laid out as the canvas draws it.
 *
 * Left: the agent's face at 23px and their name as a button with a chevron —
 * tapping the person you are talking to tells you about them, which is the
 * gesture Messages already teaches. Middle: the Text/Voice pill, pinned to the
 * centre of the bar. Right: three 27px round buttons, quiet at rest — find in
 * this conversation, share it, and the computer, behind which sits the whole
 * panel where you watch the agent work.
 *
 * An earlier pass drew a name over a subtitle on the left and the pill at the
 * end of the row, with none of the three buttons. That was written from memory
 * of the screenshot rather than from `MessagesShell.tsx`.
 */
function Header({
  title,
  seed,
  mode,
  waiting,
  typing,
}: {
  title: string;
  seed: string;
  mode: ThreadMode;
  waiting?: boolean;
  typing?: boolean;
}) {
  return (
    <header className="header">
      <Blob seed={seed} size={23} />
      <button type="button" className="header__name">
        <span>{title}</span>
        <span className="header__chevron">
          <Glyph d="M6 9.5l6 6 6-6" size={10.5} weight={2.2} />
        </span>
      </button>

      {/* A card is waiting on the person: the header says so rather than
          showing the dots, because nothing is happening until they answer.
          Otherwise, three small dots in place of the word "typing". */}
      {waiting ? <span className="header__waiting">Waiting for you</span> : null}
      {typing && !waiting ? (
        <span className="header__dots" role="status" aria-label="Working">
          {[0, 0.16, 0.32].map((delay) => (
            <span key={delay} className="header__dot" style={{ animationDelay: `${delay}s` }} />
          ))}
        </span>
      ) : null}

      <div className="modes">
        <button
          type="button"
          className={`modes__tab ${mode === ThreadMode.Text ? "modes__tab--on" : ""}`}
          aria-pressed={mode === ThreadMode.Text}
        >
          Text
        </button>
        <button
          type="button"
          className={`modes__tab ${mode === ThreadMode.Voice ? "modes__tab--on" : ""}`}
          aria-pressed={mode === ThreadMode.Voice}
        >
          Voice
        </button>
      </div>

      <span className="header__tools">
        <button type="button" className="header__tool" aria-label="Find in this conversation">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
        </button>
        <button type="button" className="header__tool" aria-label="Share this conversation">
          <Glyph d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" weight={1.8} />
        </button>
        {/* The computer. Behind it is the whole panel the app inherits: the
            agent's live browser, the files it has made, what it delegated. One
            icon, because the design says so. */}
        <button type="button" className="header__tool" aria-label="Watch the agent work">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <rect x="3" y="4" width="18" height="12" rx="2.5" />
            <path d="M9 20h6M12 16v4" />
          </svg>
        </button>
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
  mode = ThreadMode.Text,
  waiting,
  typing,
}: {
  rows: readonly ThreadRow[];
  title: string;
  seed: string;
  mode?: ThreadMode;
  waiting?: boolean;
  typing?: boolean;
}) {
  return (
    <>
      <Header
        title={title}
        seed={seed}
        mode={mode}
        {...(waiting ? { waiting } : {})}
        {...(typing ? { typing } : {})}
      />
      <div className="thread">
        {rows.map((row, index) => (
          // A thread only ever grows at the end, so the position is the row's
          // identity. Rows carry no id of their own: one message block can
          // produce several, and none of them is addressable.
          <Row key={`${index}-${row.kind}`} row={row} />
        ))}
      </div>

      {/*
        Voice: the canvas fades the bottom of the thread to white and floats the
        agent's face over it, above the composer. The canvas drew the face in a
        124px glass disc; the founder, 17 September, on seeing it: *"remove the
        circle in which the voice avatar is in. just have it there without it."*
        So the face alone. The composer stays where it is.
      */}
      {mode === ThreadMode.Voice ? (
        <div className="voice">
          <button type="button" className="voice__face" aria-label={`${title} is listening`}>
            <Blob seed={seed} size={96} />
          </button>
        </div>
      ) : null}

      <Composer name={title} />
    </>
  );
}
