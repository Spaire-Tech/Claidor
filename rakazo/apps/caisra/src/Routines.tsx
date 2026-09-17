import type { Routine } from "@rakazo/contracts";
import {
  CAISRA_NO_TRIGGER,
  caisraRoutineCanFire,
  caisraRoutineSummary,
  caisraTriggerMenu,
  describeCronPreset,
  isOneShotRoutineCron,
  isOneShotRoutineCrons,
  presetFromCron,
} from "@rakazo/core";
import { Blob } from "./Blob.js";
import type { FixtureRun } from "./fixtures.js";
import { Switch } from "./Switch.js";
import "./routines.css";

/**
 * The routines of one agent.
 *
 * Designed against what the backend actually stores, not against the idea of a
 * cron job. Three things follow from `RoutineSchema` and `routines.update`:
 *
 *  - `crons` is an **array**. One routine can run at 7, at noon and at 6, and
 *    the screen has to show three schedules on one routine rather than pretend
 *    a routine is a schedule.
 *  - A schedule is not the only trigger. A webhook, a Git event and one message
 *    provider each fire the same routine, and a routine can have no schedule at
 *    all.
 *  - A routine with nothing to fire it is rejected by the server. So Save is
 *    off and the server's own sentence is on screen, rather than a save that
 *    fails after the fact.
 *
 * `@once` is shown as "One-time", which is what `formatCron` already calls it.
 */

export function Routines({
  agentId,
  agentName,
  routines,
  openId,
  runs,
  menuOpen,
  slackAvailable,
}: {
  agentId: string;
  agentName: string;
  routines: readonly Routine[];
  openId: string;
  runs: readonly FixtureRun[];
  menuOpen?: boolean;
  slackAvailable: boolean;
}) {
  const open = routines.find((routine) => routine.id === openId) ?? routines[0];

  return (
    <div className="routines">
      <header className="rhead">
        <Blob seed={agentId} size={28} />
        <span className="rhead__stack">
          <span className="rhead__name">{agentName}</span>
          <span className="rhead__sub">Routines</span>
        </span>
        <button type="button" className="routines__new">
          New routine
        </button>
      </header>

      <div className="routines__list">
        {routines.map((routine) => (
          <button
            type="button"
            key={routine.id}
            className={`routine ${routine.id === open?.id ? "routine--open" : ""}`}
          >
            <span className={`routine__state ${routine.active ? "" : "routine__state--paused"}`}>
              {routine.active ? "◷" : "❚❚"}
            </span>
            <span className="routine__stack">
              <span className="routine__name">{routine.name}</span>
              <span className="routine__summary">{caisraRoutineSummary(routine)}</span>
            </span>
          </button>
        ))}
      </div>

      {open ? (
        <Editor open={open} runs={runs} menuOpen={menuOpen} slackAvailable={slackAvailable} />
      ) : (
        <p className="empty">No routines yet. {agentName} will offer one when it sees a pattern.</p>
      )}
    </div>
  );
}

function Editor({
  open,
  runs,
  menuOpen,
  slackAvailable,
}: {
  open: Routine;
  runs: readonly FixtureRun[];
  menuOpen?: boolean;
  slackAvailable: boolean;
}) {
  const canFire = caisraRoutineCanFire(open);
  const menu = caisraTriggerMenu(open, { slackAvailable });

  return (
    <div className="editor">
      <div className="editor__bar">
        <span className="activerow">
          <Switch on={open.active} label="Active" />
          Active
        </span>
        <span className="editor__buttons">
          <button type="button" className="btn btn--ghost">
            Delete
          </button>
          <button type="button" className="btn btn--ghost">
            Test run
          </button>
        </span>
      </div>

      <div className="rfield">
        Name
        <span className="input">{open.name}</span>
      </div>

      <div className="rfield">
        What it should do
        <span className="input input--area">{open.prompt}</span>
      </div>

      <div className="rfield">
        <span className="rfield__row">
          When to run
          <span className="rfield__aside">{open.timezone}</span>
        </span>

        <div className="triggers">
          {open.crons.map((cron) => (
            <Schedule key={cron} cron={cron} />
          ))}
          {open.webhookEnabled ? (
            <Inbound
              title="When a webhook fires"
              detail={`https://api.caisra.com/hooks/${open.botId}/${open.id}`}
              mono
              note="Signed with a secret only this routine holds. Rotate it any time."
            />
          ) : null}
          {open.githubEnabled ? (
            <Inbound
              title="On a Git event"
              detail={`https://api.caisra.com/github/${open.botId}`}
              mono
              note="Add this as a webhook on the repository. Caisra checks the signature."
            />
          ) : null}
          {open.messageProvider ? (
            <Inbound
              title={`${open.messageProvider === "slack" ? "Slack" : open.messageProvider} message`}
              detail="Anyone in the channel can start it by writing to the agent."
            />
          ) : null}
          {isOneShotRoutineCrons(open.crons) && !open.lastRunAt ? (
            <div className="rfield rfield--tight">
              Run at
              <span className="input">18 September 2026, 09:00</span>
            </div>
          ) : null}
        </div>

        <div className="addwrap">
          <button type="button" className="add">
            + Add trigger
          </button>
          {menuOpen ? (
            <div className="menu">
              {menu.map((option) => (
                <div
                  key={option.id}
                  className={`menu__item ${option.available ? "" : "menu__item--off"}`}
                >
                  <span>{option.label}</span>
                  {option.why ? <span className="menu__why">{option.why}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {canFire ? null : <p className="warnline">{CAISRA_NO_TRIGGER}</p>}
      </div>

      <div className="editor__save">
        <button type="button" className="btn" disabled={!canFire}>
          Save
        </button>
      </div>

      <div className="rfield">
        Run history
        {runs.length === 0 ? (
          <div className="rfield__aside rfield__aside--own">No runs yet</div>
        ) : (
          <div className="runs">
            {runs.map((run) => (
              <div className="run" key={run.id}>
                <span className={`run__dot ${run.ok ? "" : "run__dot--bad"}`} />
                <span className="run__when">{run.when}</span>
                <span className="run__outcome">{run.outcome}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One schedule, described by the upstream's own preset reader.
 *
 * `@once` is not a cron and `presetFromCron` hands it back as an advanced
 * expression, which would put the literal `@once` on screen. It is a one-time
 * run and says so.
 */
function Schedule({ cron }: { cron: string }) {
  const { lead, detail } = isOneShotRoutineCron(cron)
    ? { lead: "One-time", detail: "" }
    : describeCronPreset(presetFromCron(cron));
  return (
    <div className="trigger">
      <span className="trigger__stack">
        <span className="trigger__title">{lead}</span>
        {detail ? <span className="trigger__detail">{detail}</span> : null}
      </span>
      <span className="trigger__x">✕</span>
    </div>
  );
}

function Inbound({
  title,
  detail,
  note,
  mono,
}: {
  title: string;
  detail: string;
  note?: string;
  /** True when the detail is an address to copy, false when it is a sentence. */
  mono?: boolean;
}) {
  return (
    <div className="trigger trigger--block">
      <span className="trigger__stack">
        <span className="trigger__title">{title}</span>
        <span className={`trigger__detail ${mono ? "trigger__detail--mono" : ""}`}>{detail}</span>
        {note ? <span className="trigger__note">{note}</span> : null}
      </span>
      <span className="trigger__x">✕</span>
    </div>
  );
}
