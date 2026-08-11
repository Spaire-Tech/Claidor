"""Proposing a correction, applying it, and taking it back out.

The half of the product that *fixes* things. Everything else finds.

**A change is proposed, never applied.** A finding becomes a proposal the
moment anybody looks at it, and the proposal sits there — visible, with
both sides of the change on it — until a person presses a button. Nothing
in this file writes to a document without a decision recorded against a
name, and that is what « nothing leaves the firm without a banker
accepting it » means in code rather than in a sentence.

**Applying makes a new version; it never overwrites.** The deck the check
ran against stays exactly as it was, and the corrected deck is version 2 of
the same document. That is not caution about file handling — it is the
same rule the rest of the product runs on. A deal is versioned or it is a
snapshot, and « what moved since Tuesday » is the question this exists to
answer. It also makes reversal ordinary: the correction is written back
into the current version, producing a third, and every step is on the
record.

**Two places a correction can land, and they are not the same thing.**

*The deal's copy* is what the workspace corrects. The file is fetched,
written, ingested as a new version, and the check re-runs — so the finding
closes and anyone on the deal can download the corrected deck.

*The document open in Office* is what the panel corrects, through the host
itself, because the banker's own file is the one that gets sent and the
deal's copy is a copy. The server never sees those bytes; it records that
the decision was taken and where. The deal's copy is behind until they
upload what they saved, and the screen says so rather than pretending
otherwise.
"""

from datetime import UTC, datetime
from uuid import UUID

import structlog

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    Artifact,
    ArtifactKind,
    Correction,
    CorrectionState,
    CorrectionWhere,
    Finding,
    FindingKind,
)

from . import storage
from .repository import TieOutRepository
from .service import tieout
from .storage import FileNotKept
from .write import CannotWrite, Edit, replacement_for, write_deck, write_memo

log = structlog.get_logger()


class NotCorrectable(Exception):
    """This finding is not something writing into a document would fix.

    Always a sentence for a person. An audit finding is the honest case:
    « the total on Model!D31 skips a row » is a defect in a formula, and
    the fix is a decision about the model that belongs to whoever built it.
    """


class TieOutWritingService:
    # --- proposing ------------------------------------------------------

    async def propose(
        self,
        session: AsyncSession,
        *,
        finding: Finding,
        user_id: UUID,
    ) -> Correction:
        """The change this finding implies, written down and not applied.

        Idempotent by the finding's fingerprint: asking twice returns the
        proposal that already exists rather than making a second one, so a
        screen can propose on open without spending anything, and a banker
        who has already accepted does not get a fresh proposal offered
        underneath the correction they made.
        """
        repository = TieOutRepository.from_session(session)
        existing = await repository.correction_for(
            finding.dossier_id, finding.fingerprint
        )
        if existing is not None:
            return existing

        artifact = await self._writable_artifact(session, finding)
        return await repository.save_correction(
            Correction(
                dossier_id=finding.dossier_id,
                fingerprint=finding.fingerprint,
                artifact_id=artifact.id,
                lineage_id=artifact.lineage_id,
                anchor=finding.anchor or {},
                page=finding.page,
                location=finding.location,
                before=finding.printed,
                after=replacement_for(finding.printed, finding.expected),
                source=str(
                    (finding.evidence or {}).get("source")
                    or (finding.evidence or {}).get("ref")
                    or ""
                ),
                state=CorrectionState.proposed,
                proposed_by_id=user_id,
            )
        )

    async def _writable_artifact(
        self, session: AsyncSession, finding: Finding
    ) -> Artifact:
        """The document this correction would be written into.

        Three refusals, all of them things a screen has to be able to say.
        """
        if finding.kind is not FindingKind.drift:
            raise NotCorrectable(
                "This is a defect in the model rather than a figure printed "
                "in a deliverable, so there is nothing to correct in a "
                "document — the model's own author decides what it should say."
            )
        if not finding.expected:
            raise NotCorrectable(
                "This finding does not say what the figure should read, so "
                "there is nothing to write."
            )

        repository = TieOutRepository.from_session(session)
        artifact = (
            await repository.get_artifact(finding.artifact_id)
            if finding.artifact_id
            else None
        )
        if artifact is None:
            raise NotCorrectable(
                "The document this figure was printed in is no longer in the deal."
            )
        if artifact.kind is ArtifactKind.message:
            # And it never will be. Reading mail is a read scope; editing
            # somebody's draft from a server is not, and a product that
            # rewrites outgoing email is one nobody would connect twice.
            # The add-in does it, in their own compose window, on their
            # own press — which is the same split as a deck: the server
            # writes the deal's copy, the panel writes theirs.
            raise NotCorrectable(
                "A message is corrected in Outlook, not here. Open the "
                "draft with the Pierce add-in and the corrected sentence "
                "goes in as you press it."
            )
        if artifact.kind not in (ArtifactKind.deck, ArtifactKind.memo):
            raise NotCorrectable(
                f"A {artifact.kind.value} is not written into by this — a "
                "figure is corrected where it is published."
            )
        return artifact

    # --- deciding -------------------------------------------------------

    async def reject(
        self, session: AsyncSession, *, correction: Correction, user_id: UUID
    ) -> Correction:
        """« Keep ». The deck is right and the proposal is not taken.

        The finding is *not* dismissed by this. « The deck stands » and
        « stop telling me about this » are different sentences, and a
        banker who says the first and gets the second stops being told
        about a figure they only meant to leave alone for now.
        """
        return await self._decide(
            session, correction, user_id, CorrectionState.rejected
        )

    async def reopen(
        self, session: AsyncSession, *, correction: Correction, user_id: UUID
    ) -> Correction:
        """Undo a « Keep », or try again after a write that was refused.

        Refused on a correction that was applied to the deal's copy: that
        file has changed, and putting the proposal back on the table would
        say it had not. `reverse` is the word for that, and it writes.
        """
        if correction.state in (CorrectionState.applied, CorrectionState.reversed):
            raise NotCorrectable(
                "This one has already been written. Undo puts the old figure "
                "back into the document rather than tearing up the note."
            )
        return await self._decide(
            session, correction, user_id, CorrectionState.proposed
        )

    async def record_in_document(
        self, session: AsyncSession, *, correction: Correction, user_id: UUID
    ) -> Correction:
        """The panel wrote it into the document open in front of somebody.

        The bytes never come here. What is recorded is that the change was
        made, by whom, and that it was made in *their* copy — so the deal
        can say « the deck in this room is one version behind » instead of
        claiming a correction it does not hold.
        """
        correction.where = CorrectionWhere.document
        return await self._decide(session, correction, user_id, CorrectionState.applied)

    async def _decide(
        self,
        session: AsyncSession,
        correction: Correction,
        user_id: UUID,
        state: CorrectionState,
    ) -> Correction:
        correction.state = state
        correction.decided_by_id = user_id
        correction.decided_at = datetime.now(UTC)
        correction.error = None
        repository = TieOutRepository.from_session(session)
        return await repository.save_correction(correction)

    # --- writing --------------------------------------------------------

    async def apply(
        self,
        session: AsyncSession,
        *,
        correction: Correction,
        user_id: UUID,
    ) -> Correction:
        """Write it into the deal's copy, and make that a new version.

        **The finding is not marked fixed, and that is not an oversight.**
        This re-runs the check, which rebuilds every finding from scratch,
        and a drift that has been corrected is simply not among them any
        more — because the deck agrees with the model now. Writing « fixed »
        onto the old row would be writing onto a row that is about to be
        deleted, and would record as a decision what is a measurement.
        """
        return await self._write(
            session,
            correction=correction,
            user_id=user_id,
            before=correction.before,
            after=correction.after,
            state=CorrectionState.applied,
        )

    async def reverse(
        self,
        session: AsyncSession,
        *,
        correction: Correction,
        user_id: UUID,
    ) -> Correction:
        """Put the document back, by writing the old figure over the new.

        The same operation with its two sides swapped, which is the whole
        argument of `writing-pptx.md`: we hold both sides of every change,
        so a format with no revision model still gets a reversible edit.

        A correction the panel made in somebody's own copy cannot be
        reversed from here — those bytes are on their machine — so this
        refuses and says which document to open.
        """
        if correction.where is CorrectionWhere.document:
            raise NotCorrectable(
                "This was accepted in the copy open in Office, not in the "
                "deal's. Undo it there, in the panel."
            )
        return await self._write(
            session,
            correction=correction,
            user_id=user_id,
            before=correction.after,
            after=correction.before,
            state=CorrectionState.reversed,
        )

    async def _write(
        self,
        session: AsyncSession,
        *,
        correction: Correction,
        user_id: UUID,
        before: str,
        after: str,
        state: CorrectionState,
    ) -> Correction:
        repository = TieOutRepository.from_session(session)

        #: Written into the version in force, not the one the correction
        #: was proposed against. Somebody who uploads a new deck and then
        #: accepts a correction means the deck they have, and applying it
        #: to a superseded version would produce a version 3 of a document
        #: whose version 2 nobody has seen.
        artifact = await repository.latest_of_lineage(correction.lineage_id)
        if artifact is None:
            return await self._failed(
                repository,
                correction,
                user_id,
                "The document this figure was printed in is no longer in the deal.",
            )

        try:
            payload = storage.fetch(artifact)
        except FileNotKept as problem:
            return await self._failed(repository, correction, user_id, str(problem))

        edit = Edit(
            page=correction.page,
            anchor=correction.anchor or {},
            before=before,
            after=after,
        )
        writer = write_memo if artifact.kind is ArtifactKind.memo else write_deck
        try:
            written = writer(payload, [edit])
        except CannotWrite as problem:
            return await self._failed(repository, correction, user_id, str(problem))

        #: The corrected file goes back in through the front door: the same
        #: ingest an upload uses, so it is read by the same reader, gets a
        #: version, and is a document of this deal in every way. A
        #: correction that produced rows some other path had written would
        #: be a second definition of what a deck is.
        produced = await tieout.ingest(
            session,
            dossier_id=artifact.dossier_id,
            kind=artifact.kind,
            filename=artifact.filename,
            payload=written,
            user_id=user_id,
            file_id=artifact.file_id,
        )

        correction.wrote_artifact_id = produced.id
        correction.where = CorrectionWhere.file
        correction.error = None
        decided = await self._decide(session, correction, user_id, state)

        # The deal's answer has changed, so it is re-answered — the same
        # unconditional re-check an upload does, and for the same reason:
        # a document that moved changes what is true about the ones it was
        # checked against, not only about itself.
        await tieout.run_tieout(
            session, dossier_id=artifact.dossier_id, user_id=user_id
        )

        log.info(
            "tieout.correction.written",
            correction=str(correction.id),
            artifact=str(produced.id),
            state=state.value,
        )
        return decided

    async def _failed(
        self,
        repository: TieOutRepository,
        correction: Correction,
        user_id: UUID,
        reason: str,
    ) -> Correction:
        """A write that did not happen, on the record with its reason.

        Not raised. « It failed and here is why » is a state of the
        correction that the screen has to keep showing — a banker who
        pressed Accept and saw a toast disappear has no way to find out
        whether the deck was changed.
        """
        correction.state = CorrectionState.failed
        correction.error = reason
        correction.decided_by_id = user_id
        correction.decided_at = datetime.now(UTC)
        return await repository.save_correction(correction)


writing = TieOutWritingService()

__all__ = ["NotCorrectable", "TieOutWritingService", "writing"]
