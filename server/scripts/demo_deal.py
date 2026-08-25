"""The sales demo kit: a stranger's files in, the demo out, hands off.

`swens.md` § 7 fixes what a demo is: *« A prospect sends their own model
— ideally two versions of it — and Swens runs against it. The version
comparison shows what their own revision introduced. »* And what it
opens with: what nothing else can produce — a balance sheet that does
not balance, debt that does not clear, the delta between two of the
client's own versions — with the routine findings in the report and
never in the opening. Track H1's DONE test is the same sentence as an
operation: a stranger's two versions produce the demo, findings plus
delta, within a day, hands off.

This script is that operation. Point it at the files the prospect sent:

    uv run python -m scripts.demo_deal --name "Project Falcon" \\
        model_v1.xlsx model_v2.xlsx [--deck deck.pptx] [--memo memo.docx] \\
        [--client "Falcon Holdings"] [--brief falcon.md]

It builds the deal exactly as the product would have — same ingest, same
checks, same rows — so the workspace is ready to open the moment it
finishes: the deal page, the findings, the report sheet and the
marked-up model download are all live against what this seeded. Then it
prints the demo brief in the order § 7 dictates. With `--brief` the
same brief lands in a markdown file the founder can carry.

Two honesty rules, because a demo that overstates once is a prospect
lost twice:

- **Every number in the brief is read back from the stored rows and
  runs** — the same rows the screens read. Nothing is computed here
  that the product would not show.
- **The version delta is findings-by-fingerprint between the runs this
  script itself performed** (a fingerprint survives re-runs; a new one
  is a defect the revision introduced, a vanished one is a defect it
  repaired), plus the product's own cell-level diff. It is not the
  Watch (Track C) and the brief never calls it that.

Versions: every model file after the first is ingested as the next
version of the first one's lineage — under the first file's name,
because lineage follows the filename, and the brief says so when the
prospect's filenames differed.

Run as a module, not as a path: `scripts/platform.py` shadows the
standard library's `platform` when the script's own directory leads
`sys.path`, and SQLAlchemy imports it.
"""

import argparse
import asyncio
from pathlib import Path
from typing import Any

from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import (
    ArtifactKind,
    CheckKind,
    CheckStatus,
    Dossier,
    DossierMember,
    DossierRole,
    FindingSeverity,
    FindingState,
    Organization,
    User,
)
from polar.postgres import create_async_engine
from polar.tieout.analytics import ANALYTIC_RULE_NAMES
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import tieout


def _snapshot(findings: Any) -> dict[str, dict[str, str]]:
    """Open findings by fingerprint — the delta's raw material."""
    return {
        one.fingerprint: {
            "title": one.title,
            "severity": one.severity.value,
            "rule": one.rule,
            "where": one.location,
        }
        for one in findings
        if one.state is FindingState.open
    }


def _lead_lines(findings: Any) -> list[str]:
    """The opening findings, in § 7's order: the statement checks first.

    A balance sheet that does not balance or debt that does not clear is
    the demo's first sentence when one exists. Everything else waits.
    """
    lines: list[str] = []
    for one in findings:
        if one.state is not FindingState.open:
            continue
        if one.rule in ANALYTIC_RULE_NAMES and (one.severity is FindingSeverity.error):
            lines.append(f"{one.title} — {one.location}")
    return lines


async def demo(
    name: str,
    client: str | None,
    model_paths: list[Path],
    deck_path: Path | None,
    memo_path: Path | None,
    brief_path: Path | None,
) -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    out: list[str] = []

    def say(line: str = "") -> None:
        print(line)
        out.append(line)

    async with sessionmaker() as session:
        # `.unique()` because these models eager-load collections, so one
        # entity arrives as several rows.
        user = (
            (await session.execute(select(User).order_by(User.created_at).limit(1)))
            .scalars()
            .unique()
            .first()
        )
        organization = (
            (
                await session.execute(
                    select(Organization).order_by(Organization.created_at).limit(1)
                )
            )
            .scalars()
            .unique()
            .first()
        )
        if user is None or organization is None:
            print("no user or organization in this database — sign up once first")
            return

        deal = (
            (
                await session.execute(
                    select(Dossier).where(
                        Dossier.name == name, Dossier.deleted_at.is_(None)
                    )
                )
            )
            .scalars()
            .unique()
            .first()
        )
        if deal is None:
            deal = Dossier(
                organization_id=organization.id,
                name=name,
                client_name=client,
                created_by_id=user.id,
            )
            session.add(deal)
            await session.flush()
            session.add(
                DossierMember(
                    dossier_id=deal.id, user_id=user.id, role=DossierRole.lead
                )
            )
            await session.flush()
            print(f"created deal {deal.id} — {name}")
        else:
            print(f"reusing deal {deal.id} — {name}")

        repository = TieOutRepository.from_session(session)

        # --- the first version, and its own findings ---------------------

        model_name = model_paths[0].name
        first = await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.model,
            filename=model_name,
            payload=model_paths[0].read_bytes(),
            user_id=user.id,
        )
        print(
            f"  {model_name:<32} v{first.version}  {first.status.value:<10} "
            f"{first.counts or first.error}"
        )
        if first.error:
            # An unreadable model is the whole demo failing; say it in the
            # reader's own words and stop rather than demoing an empty deal.
            print(f"stopping: the model could not be read — {first.error}")
            await session.commit()
            await engine.dispose()
            return

        await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        before = _snapshot(await repository.findings_of(deal.id))

        # --- the revision, and what it did -------------------------------

        delta: dict[str, Any] | None = None
        cell_diff: dict[str, Any] | None = None
        current_model = first
        for later in model_paths[1:]:
            if later.name != model_name:
                say(
                    f"note: {later.name} ingested as the next version of "
                    f"{model_name} — lineage follows the filename"
                )
            current_model = await tieout.ingest(
                session,
                dossier_id=deal.id,
                kind=ArtifactKind.model,
                filename=model_name,
                payload=later.read_bytes(),
                user_id=user.id,
            )
            print(
                f"  {later.name:<32} v{current_model.version}  "
                f"{current_model.status.value:<10} "
                f"{current_model.counts or current_model.error}"
            )

        if current_model.version > first.version:
            await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
            after = _snapshot(await repository.findings_of(deal.id))
            delta = {
                "from": first.version,
                "to": current_model.version,
                "introduced": [after[fp] for fp in after.keys() - before.keys()],
                "repaired": [before[fp] for fp in before.keys() - after.keys()],
                "standing": len(after.keys() & before.keys()),
            }
            cell_diff = await tieout.model_diff(
                session, dossier_id=deal.id, artifact_id=current_model.id
            )

        # --- the deliverables, reconciled --------------------------------

        for path, kind in (
            (deck_path, ArtifactKind.deck),
            (memo_path, ArtifactKind.memo),
        ):
            if path is None:
                continue
            artifact = await tieout.ingest(
                session,
                dossier_id=deal.id,
                kind=kind,
                filename=path.name,
                payload=path.read_bytes(),
                user_id=user.id,
            )
            print(
                f"  {path.name:<32} v{artifact.version}  "
                f"{artifact.status.value:<10} {artifact.counts or artifact.error}"
            )

        tie = None
        if deck_path or memo_path:
            tie = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        await session.commit()

        # --- the brief, in the order § 7 dictates -------------------------

        findings = await repository.findings_of(deal.id)
        latest_summary: dict[str, Any] = {}
        latest = await repository.latest_run(deal.id, CheckKind.audit)
        if latest is not None and latest.status is CheckStatus.done:
            latest_summary = dict(latest.summary or {})

        say()
        say(f"# The demo — {name}")
        say()

        leads = _lead_lines(findings)
        if leads:
            say("## Open with these (nothing else can produce them)")
            for line in leads[:6]:
                say(f"- {line}")
            say()

        if delta is not None:
            say(f"## Their own revision, v{delta['from']} → v{delta['to']}")
            say(
                f"- introduced {len(delta['introduced'])} finding(s), "
                f"repaired {len(delta['repaired'])}, "
                f"{delta['standing']} standing"
            )
            for one in delta["introduced"][:6]:
                say(f"  - new: {one['title']} — {one['where']}")
            for one in delta["repaired"][:4]:
                say(f"  - repaired: {one['title']} — {one['where']}")
            if cell_diff is not None:
                say(
                    f"- cells changed {len(cell_diff['changed'])}, "
                    f"added {cell_diff['added']}, removed {cell_diff['removed']}"
                    + (
                        "; changes that strand deck figures listed first"
                        if any(one["stale_figures"] for one in cell_diff["changed"])
                        else ""
                    )
                )
                for one in cell_diff["changed"][:5]:
                    stale = (
                        f"  ({one['stale_figures']} deck figure(s) now stale)"
                        if one["stale_figures"]
                        else ""
                    )
                    say(
                        f"  - {one['name'] or one['ref']}: {one['was']} → "
                        f"{one['now']}{stale}"
                    )
            say()

        if tie is not None:
            say("## The deck against the model")
            if tie.status is CheckStatus.done:
                summary = dict(tie.summary or {})
                say(
                    f"- {summary.get('reconciled', 0)} figures reconciled: "
                    f"{summary.get('agreeing', 0)} agreeing, "
                    f"{summary.get('drifting', 0)} drifting, "
                    f"{summary.get('unlinked', 0)} unlinked"
                )
                drifts = [
                    one
                    for one in findings
                    if one.kind.value in ("drift", "stale")
                    and one.state is FindingState.open
                ]
                for one in drifts[:6]:
                    say(
                        f"  - p{one.page} {one.printed} should read "
                        f"{one.expected} — {one.location[:60]}"
                    )
            else:
                say(f"- tie-out did not finish: {tie.error}")
            say()

        say("## The rest of the report (never the opening)")
        open_count = sum(1 for one in findings if one.state is FindingState.open)
        errors = latest_summary.get("errors")
        smells = latest_summary.get("smells")
        if errors is not None:
            say(
                f"- audit: {errors} error(s), {smells} smell(s) across "
                f"{latest_summary.get('cells', 0)} cells in "
                f"{latest_summary.get('models', 0)} model(s); "
                f"{open_count} finding(s) open in the workspace"
            )
        abstentions = latest_summary.get("abstentions") or []
        if abstentions:
            say(
                f"- said honestly, not skipped silently — {len(abstentions)} abstention(s):"
            )
            for one in abstentions[:4]:
                say(f"  - {one.get('rule')}: {one.get('why')}")
        if latest_summary.get("values_only"):
            say(
                "- this model is a values-pasted copy: the statement checks "
                "read it, the construction rules are nearly blind — the "
                "brief says so and so should the demo"
            )
        rules_off = latest_summary.get("rules_off") or []
        if rules_off:
            say(
                f"- rules switched off by house rules, on the record: {', '.join(rules_off)}"
            )
        say()

        say("## Where to click")
        say(f"- deal: {name} ({deal.id}) — Projects → {name}")
        marked = sum(
            1
            for one in findings
            if one.state is FindingState.open
            and (one.anchor or {}).get("kind") == "cell"
        )
        if marked:
            say(
                f"- the marked-up model download is live ({marked} finding(s) "
                "will be coloured in place)"
            )
        say("- the report sheet prints from the Overview's « Read the full report »")

    await engine.dispose()

    if brief_path is not None:
        brief_path.write_text("\n".join(out) + "\n", encoding="utf-8")
        print(f"\nbrief written to {brief_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a sales demo from a prospect's own files."
    )
    parser.add_argument(
        "models", nargs="+", type=Path, help="model .xlsx, oldest first"
    )
    parser.add_argument(
        "--name", required=True, help="deal name, e.g. 'Project Falcon'"
    )
    parser.add_argument("--client", default=None, help="client name shown on the deal")
    parser.add_argument(
        "--deck", type=Path, default=None, help="deck .pptx to reconcile"
    )
    parser.add_argument(
        "--memo", type=Path, default=None, help="memo .docx to reconcile"
    )
    parser.add_argument(
        "--brief", type=Path, default=None, help="write the brief here as markdown"
    )
    arguments = parser.parse_args()
    for path in [*arguments.models, arguments.deck, arguments.memo]:
        if path is not None and not path.is_file():
            parser.error(f"{path} is not a file")
    asyncio.run(
        demo(
            arguments.name,
            arguments.client,
            arguments.models,
            arguments.deck,
            arguments.memo,
            arguments.brief,
        )
    )


if __name__ == "__main__":
    main()
