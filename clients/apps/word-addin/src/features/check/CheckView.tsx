import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { isCommunity } from "@/community/edition";
import { readDocumentText } from "@/office/document";
import { insertCommentAnchored } from "@/office/comments";
import { useAppNav } from "@/app/nav";
import { Banner, Button, Spinner } from "@/ui/primitives";
import { StatusGroup } from "@/ui/StatusGroup";
import { UpgradeGate } from "@/ui/UpgradeGate";
import { ViewHeader } from "@/ui/ViewHeader";
import { LocateIcon, WandIcon } from "@/ui/icons";
import type { StatusTone } from "@/ui/status";
import { applyFix, goTo, type FixResult, type GoToResult } from "@/claidor/goto";
import { readIgnored, writeIgnored } from "@/claidor/ignored";
import {
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  bySeverity,
  defectLabel,
  findingKey,
  fixFor,
  type Finding,
  type Review,
  type Severity,
} from "@/claidor/locate";
import { check, judge } from "@/claidor/redline";
import "./check.css";

/**
 * The Check panel.
 *
 * Reads the open document, sends the text to the Claidor engine and shows
 * what came back in four buckets. Two calls, not one: `/check` is arithmetic
 * and answers in milliseconds, `/judge` reads the whole document a window at
 * a time and takes tens of seconds. Running them together would make every
 * check as slow as the slowest, so the panel shows what it knows first and
 * offers the second as a deliberate act.
 *
 * Nothing is stored server-side. The text is read, checked and dropped.
 */

const TONE: Record<Severity, StatusTone> = {
  critical: "red",
  warning: "yellow",
  to_review: "neutral",
  ignored: "neutral",
};

/** Certainty is shown only when it is a qualification, never for `certain`. */
const CERTAINTY_LABEL: Record<string, string> = {
  probable: "Probable",
  suggested: "Suggested",
};

const CERTAINTY_TITLE: Record<string, string> = {
  probable:
    "Very likely a defect, but a legitimate reading exists. Worth a look rather than certain.",
  suggested:
    "Read by a model. Its quotes were checked against the document and its arithmetic recomputed, so the words are certainly there; whether they mean what the note says is your call.",
};

type State =
  | { status: "checking" }
  | { status: "ready"; review: Review; judged: boolean }
  | { status: "error"; error: string };

export function CheckView() {
  const { navigate } = useAppNav();
  const [state, setState] = useState<State>({ status: "checking" });
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [judging, setJudging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const judgeAbort = useRef<AbortController | null>(null);

  // The community build has no Claidor backend, and the engine IS the
  // backend. Say so instead of failing on click.
  const community = isCommunity();

  const run = useCallback(async () => {
    setNote(null);
    setState({ status: "checking" });
    try {
      const text = await readDocumentText();
      const review = await check(text);
      setState({ status: "ready", review, judged: false });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    if (community) return;
    void run();
    // Dismissals live in the document, so they are read once per open, not
    // per check: re-running the engine must not resurrect them.
    void readIgnored()
      .then((saved) => saved && setIgnored(new Set(Object.keys(saved.keys))))
      .catch(() => {
        // A document with no dismissals is the normal case, and a part we
        // cannot read means findings show rather than hide. Both are fine.
      });
  }, [community, run]);

  useEffect(() => () => judgeAbort.current?.abort(), []);

  async function readForContradictions() {
    if (state.status !== "ready") return;
    setNote(null);
    setJudging(true);
    judgeAbort.current?.abort();
    const controller = new AbortController();
    judgeAbort.current = controller;
    try {
      const text = await readDocumentText();
      const extra = await judge(text, controller.signal);
      setState((s) =>
        s.status === "ready"
          ? {
              status: "ready",
              judged: true,
              review: {
                ...s.review,
                findings: [...s.review.findings, ...extra.findings].sort(
                  (a, b) => a.start - b.start,
                ),
                critical_count: s.review.critical_count + extra.critical_count,
                warning_count: s.review.warning_count + extra.warning_count,
                to_review_count: s.review.to_review_count + extra.to_review_count,
              },
            }
          : s,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote(errorMessage(e));
    } finally {
      setJudging(false);
    }
  }

  async function toggleIgnore(finding: Finding) {
    const key = findingKey(finding);
    const next = new Set(ignored);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setIgnored(next);
    try {
      await writeIgnored({
        savedAt: new Date().toISOString(),
        keys: Object.fromEntries([...next].map((k) => [k, ""])),
      });
    } catch (e) {
      // The bucket already moved on screen; say that it will not survive a
      // reopen rather than silently disagreeing with the document.
      setNote(`Dismissed here, but not saved into the document. ${errorMessage(e)}`);
    }
  }

  async function jumpTo(finding: Finding) {
    setNote(null);
    setNote(describeGoTo(await goTo(finding), finding));
  }

  async function fix(finding: Finding) {
    const replacement = fixFor(finding);
    if (!replacement) return;
    setNote(null);
    setNote(describeFix(await applyFix(finding, replacement), replacement));
  }

  async function commentOn(finding: Finding) {
    setNote(null);
    const result = await insertCommentAnchored(
      finding.literal,
      `${defectLabel(finding.defect)}: ${finding.note}`,
    );
    if (result === "not_found") setNote("Could not find that text to comment on.");
    else if (result === "unsupported_region")
      setNote("Word does not allow a comment in that location.");
  }

  function ask(finding: Finding) {
    navigate("assistant", {
      kind: "assistantAsk",
      prompt: `In the open contract: ${defectLabel(finding.defect)} — ${finding.note} Explain the risk and how to fix it.`,
      scope: "document",
      autoSend: true,
      documentOnly: true,
    });
  }

  const buckets = useMemo(
    () =>
      state.status === "ready"
        ? bySeverity(state.review.findings, ignored)
        : SEVERITY_ORDER.map((severity) => ({ severity, findings: [] as Finding[] })),
    [state, ignored],
  );

  const header = (
    <ViewHeader
      title="Check"
      info="Ten mechanical checks over the open document: defined terms, cross-references, numbering and house style. Every one of them is arithmetic on the text rather than a reading, so a finding is either right or a bug. Contradictions and miscalculations need a model and are a separate, slower pass."
      subtitle="Defined terms, cross-references, numbering, style."
      onRescan={community ? undefined : () => void run()}
      rescanning={state.status === "checking"}
    />
  );

  if (community) {
    return (
      <div className="stack check-view">
        {header}
        <UpgradeGate title="Check runs on the Claidor engine">
          These checks are computed server-side, not in the pane: ten of them,
          measured on real filings. There is no engine in the
          bring-your-own-key build to run them against. Defined terms and
          Cross-references, in Tools, work here and always will.
        </UpgradeGate>
      </div>
    );
  }

  if (state.status === "checking") {
    return (
      <div className="stack check-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Checking the document...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack check-view">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button
          variant="default"
          size="sm"
          onClick={() => void run()}
          style={{ alignSelf: "flex-start" }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { review, judged } = state;
  const shown = review.findings.length;

  return (
    <div className="stack check-view">
      {header}

      {/* The tally. Always four counts, always visible, computed from the
          same list the buckets render so they cannot disagree. */}
      <div className="check-tally" role="status">
        {buckets.map(({ severity, findings }) => (
          <span key={severity} className={`check-tally__cell check-tally__cell--${severity}`}>
            <span className="check-tally__count">{findings.length}</span>
            <span className="check-tally__label">{SEVERITY_LABEL[severity]}</span>
          </span>
        ))}
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        {review.characters.toLocaleString()} characters read.
      </p>

      {note && <Banner tone="warn">{note}</Banner>}

      {!judged && (
        <Button
          variant="default"
          size="sm"
          loading={judging}
          onClick={() => void readForContradictions()}
          style={{ alignSelf: "flex-start" }}
        >
          {judging ? "Reading the whole document..." : "Read for contradictions"}
        </Button>
      )}

      {shown === 0 ? (
        <Banner tone="success">
          Nothing found in {review.characters.toLocaleString()} characters.
        </Banner>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {buckets
            .filter((bucket) => bucket.findings.length > 0)
            .map(({ severity, findings }) => (
              <StatusGroup
                key={severity}
                tone={TONE[severity]}
                label={SEVERITY_LABEL[severity]}
                count={findings.length}
                defaultOpen={severity === "critical" || severity === "warning"}
              >
                {findings.map((finding) => (
                  <FindingCard
                    key={findingKey(finding)}
                    finding={finding}
                    dismissed={ignored.has(findingKey(finding))}
                    onGoTo={() => void jumpTo(finding)}
                    onFix={() => void fix(finding)}
                    onIgnore={() => void toggleIgnore(finding)}
                    onComment={() => void commentOn(finding)}
                    onAsk={() => ask(finding)}
                  />
                ))}
              </StatusGroup>
            ))}
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  dismissed,
  onGoTo,
  onFix,
  onIgnore,
  onComment,
  onAsk,
}: {
  finding: Finding;
  dismissed: boolean;
  onGoTo: () => void;
  onFix: () => void;
  onIgnore: () => void;
  onComment: () => void;
  onAsk: () => void;
}) {
  const replacement = fixFor(finding);
  const qualification = CERTAINTY_LABEL[finding.certainty];

  return (
    <div className="check-card">
      <div className="check-card__head">
        <span className="check-card__defect">{defectLabel(finding.defect)}</span>
        {qualification && (
          <span
            className={`check-card__flag check-card__flag--${finding.certainty}`}
            title={CERTAINTY_TITLE[finding.certainty]}
          >
            {qualification}
          </span>
        )}
      </div>

      {finding.term && <span className="check-card__term">{finding.term}</span>}
      <p className="check-card__note small">{finding.note}</p>

      {finding.context && <p className="check-card__context small">{finding.context}</p>}

      <div className="row check-card__actions">
        <Button variant="ghost" size="sm" onClick={onGoTo} title="Select it in the document">
          <LocateIcon size={13} /> Go to
        </Button>
        {replacement && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onFix}
            title={`Replace with "${replacement}" as a tracked change`}
          >
            <WandIcon size={13} /> Fix
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onComment} title="Add a Word comment here">
          Comment
        </Button>
        <Button variant="ghost" size="sm" onClick={onAsk} title="Ask the assistant about this">
          Ask
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onIgnore}
          title={dismissed ? "Put it back" : "Move it to Ignored"}
        >
          {dismissed ? "Restore" : "Ignore"}
        </Button>
      </div>
    </div>
  );
}

/** What to tell the reader after a jump. Every outcome says something. */
function describeGoTo(result: GoToResult, finding: Finding): string | null {
  switch (result.kind) {
    case "found":
      return result.approximate
        ? "That phrase runs across a line break, so this is the closest match rather than certainly the right one."
        : null;
    case "not_found":
      return `Could not find "${finding.literal}" in the document. It may have been edited since the check ran.`;
    case "moved":
      return `The document has changed: this was occurrence ${finding.occurrence} and there are now ${result.found}. Re-run the check.`;
    case "unsearchable":
      return "That span is too long for Word to search for. The note and the surrounding words are above.";
  }
}

function describeFix(result: FixResult, replacement: string): string | null {
  switch (result.kind) {
    case "applied":
      return null;
    case "untracked":
      return "Word would not turn change tracking on, so nothing was written. An untracked edit to an agreement is not what you want.";
    case "not_found":
      return `Could not find that text to replace with "${replacement}".`;
    case "moved":
      return "The document has changed since the check ran. Re-run it before applying fixes.";
    case "unsearchable":
      return "That span is too long for Word to search for, so it cannot be fixed from here.";
  }
}
