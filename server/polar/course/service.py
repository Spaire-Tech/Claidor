import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import select

from polar.email_sequence.events import fire_event
from polar.email_subscriber.repository import EmailSubscriberRepository
from polar.entitlements.service import entitlements as entitlements_service
from polar.models.benefit import Benefit, BenefitType
from polar.models.course import Course
from polar.models.course_enrollment import CourseEnrollment
from polar.models.course_lesson import CourseLesson
from polar.models.course_lesson_progress import CourseLessonProgress
from polar.models.course_module import CourseModule
from polar.models.course_note import CourseNote
from polar.models.customer import Customer
from polar.models.lesson_comment import LessonComment
from polar.models.lesson_comment_like import LessonCommentLike
from polar.models.product_benefit import ProductBenefit
from polar.models.webhook_endpoint import WebhookEventType
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession
from polar.product.repository import ProductRepository
from polar.webhook.service import webhook as webhook_service

from .landing import merge_landing_overrides, validate_landing_overrides
from .repository import (
    CourseEnrollmentRepository,
    CourseLessonProgressRepository,
    CourseLessonRepository,
    CourseLessonWatchProgressRepository,
    CourseModuleRepository,
    CourseNoteRepository,
    CourseRepository,
    LessonCommentLikeRepository,
    LessonCommentRepository,
)
from .schemas import (
    CourseCreate,
    CourseLessonCreate,
    CourseLessonUpdate,
    CourseModuleCreate,
    CourseModuleUpdate,
    CourseUpdate,
)

log = logging.getLogger(__name__)


class EnrollmentProgressSummary(NamedTuple):
    completed_lessons: int
    started_lessons: int
    last_active_at: datetime | None


def _build_lesson(schema: CourseLessonCreate) -> CourseLesson:
    """Build a CourseLesson from a create schema, persisting every declared
    field (description, drip, comments_mode, thumbnails, etc.). Without this,
    fields silently drop on initial create and require a follow-up PATCH."""
    lesson = CourseLesson(
        title=schema.title,
        content_type=schema.content_type,
        content=schema.content,
        video_asset_id=schema.video_asset_id,
        duration_seconds=schema.duration_seconds,
        position=schema.position,
        is_free_preview=schema.is_free_preview,
        published=schema.published,
        description=schema.description,
        release_at=schema.release_at,
        drip_days=schema.drip_days,
        comments_mode=schema.comments_mode,
        thumbnail_url=schema.thumbnail_url,
    )
    # Attach a pre-staged Mux upload. The webhook resolves lessons by
    # mux_upload_id, so once Mux finishes the playback id will land on
    # this row automatically — no follow-up PATCH required.
    if schema.mux_upload_id:
        lesson.mux_upload_id = schema.mux_upload_id
        lesson.mux_status = "waiting"
        lesson.content_type = "video"
    return lesson


class CourseService:
    async def get_by_id(self, session: AsyncSession, course_id: UUID) -> Course | None:
        repo = CourseRepository.from_session(session)
        return await repo.get_by_id(course_id)

    async def get_by_product(
        self, session: AsyncSession, product_id: UUID
    ) -> Course | None:
        repo = CourseRepository.from_session(session)
        statement = repo.get_by_product_statement(product_id)
        return await repo.get_one_or_none(statement)

    async def list_by_organization(
        self, session: AsyncSession, organization_id: UUID
    ) -> Sequence[Course]:
        repo = CourseRepository.from_session(session)
        statement = repo.get_by_organization_statement(organization_id)
        return await repo.get_all(statement)

    async def create(
        self, session: AsyncSession, create_schema: CourseCreate
    ) -> Course:
        repo = CourseRepository.from_session(session)

        course = Course(
            product_id=create_schema.product_id,
            organization_id=create_schema.organization_id,
            title=create_schema.title,
            course_type=create_schema.course_type,
            format=create_schema.format,
            paywall_enabled=create_schema.paywall_enabled,
            paywall_lesson_id=create_schema.paywall_lesson_id,
            paywall_position=create_schema.paywall_position,
            ai_generated=create_schema.ai_generated,
            hero_variant=create_schema.hero_variant,
            lesson_card_variant=create_schema.lesson_card_variant,
            trial_mode=create_schema.trial_mode,
            # AI-synthesised hero copy (under landing_overrides.ai_hero) and any
            # human edits — persisted so the public portal renders it.
            landing_overrides=create_schema.landing_overrides,
            description=create_schema.description,
            thumbnail_url=create_schema.thumbnail_url,
            thumbnail_object_position=create_schema.thumbnail_object_position,
            instructor_name=create_schema.instructor_name,
            instructor_bio=create_schema.instructor_bio,
            trailer_url=create_schema.trailer_url,
            sample=(
                create_schema.sample.model_dump(mode="json")
                if create_schema.sample is not None
                else None
            ),
            instructor_name_italic=create_schema.instructor_name_italic,
            instructor_name_bold=create_schema.instructor_name_bold,
            instructor_name_uppercase=create_schema.instructor_name_uppercase,
        )

        # Use provided modules or create implicit "Lessons" module
        modules_to_add = create_schema.modules
        if not modules_to_add:
            # Create implicit module for flat lesson structure
            modules_to_add = [
                CourseModuleCreate(
                    title="Lessons",
                    description=None,
                    position=0,
                    lessons=[],
                )
            ]

        # Drafts are free; the published_courses cap only applies once a
        # course actually goes live. A course can be created already-public
        # (e.g. AI generation that publishes its lessons), so enforce the
        # cap up front when any seed lesson is published. Counts the org's
        # *other* published courses — this one isn't persisted yet.
        will_be_published = any(
            lesson.published for module in modules_to_add for lesson in module.lessons
        )
        if will_be_published:
            current = await repo.count_published_by_organization(
                create_schema.organization_id
            )
            await entitlements_service.require_under_limit(
                session,
                create_schema.organization_id,
                "published_courses",
                current=current,
            )

        for mod_schema in modules_to_add:
            module = CourseModule(
                title=mod_schema.title,
                description=mod_schema.description,
                position=mod_schema.position,
                status=mod_schema.status,
                release_at=mod_schema.release_at,
                drip_days=mod_schema.drip_days,
            )
            for lesson_schema in mod_schema.lessons:
                module.lessons.append(_build_lesson(lesson_schema))
            course.modules.append(module)

        course = await repo.create(course, flush=True)
        # Refresh to avoid MissingGreenlet when selectin relationships are accessed
        await session.refresh(course, attribute_names=["modules"])

        # Wire the course up to a course_access benefit on its product, so
        # that the existing Order → enqueue_benefits_grants → grant_benefit
        # → BenefitCourseAccessService.grant pipeline actually enrolls every
        # customer who pays. Without this row the buy-flow silently never
        # creates a CourseEnrollment.
        await self._ensure_course_access_benefit(session, course)

        return course

    async def _ensure_course_access_benefit(
        self,
        session: AsyncSession,
        course: Course,
    ) -> Benefit | None:
        """Create + attach a course_access benefit to course.product if missing.

        Returns the benefit row (existing or freshly created), or None if
        the course has no product to attach to.
        """
        if course.product_id is None:
            return None

        # Already wired? Match on (organization, course_id property) so we
        # don't create duplicates if a benefit was created out-of-band.
        existing_stmt = select(Benefit).where(
            Benefit.type == BenefitType.course_access,
            Benefit.organization_id == course.organization_id,
            Benefit.deleted_at.is_(None),
            Benefit.properties["course_id"].astext == str(course.id),
        )
        result = await session.execute(existing_stmt)
        benefit = result.scalar_one_or_none()

        if benefit is None:
            title = course.title or "this course"
            benefit = Benefit(
                type=BenefitType.course_access,
                description=f"Access to {title}",
                is_tax_applicable=True,
                selectable=False,
                deletable=False,
                organization_id=course.organization_id,
                properties={"course_id": str(course.id)},
            )
            session.add(benefit)
            await session.flush()

        # Attach to the product if not already attached. The
        # product_benefits table is keyed on (product_id, benefit_id) so
        # the existence check is cheap and exact.
        existing_link_stmt = select(ProductBenefit).where(
            ProductBenefit.product_id == course.product_id,
            ProductBenefit.benefit_id == benefit.id,
        )
        link_result = await session.execute(existing_link_stmt)
        if link_result.scalar_one_or_none() is None:
            # Find the next order slot to satisfy UniqueConstraint(product_id, order).
            max_order_stmt = select(ProductBenefit.order).where(
                ProductBenefit.product_id == course.product_id
            )
            existing_orders = (await session.execute(max_order_stmt)).scalars().all()
            next_order = (max(existing_orders) + 1) if existing_orders else 0
            session.add(
                ProductBenefit(
                    product_id=course.product_id,
                    benefit_id=benefit.id,
                    order=next_order,
                )
            )
            await session.flush()

        return benefit

    async def update(
        self,
        session: AsyncSession,
        course: Course,
        update_schema: CourseUpdate,
    ) -> Course:
        repo = CourseRepository.from_session(session)
        update_dict = update_schema.model_dump(exclude_unset=True, mode="json")

        # Deep-merge landing_overrides onto whatever is already stored rather
        # than replacing the column wholesale. The editor PATCHes the whole
        # blob, so before this a stale or partial client snapshot (e.g. a
        # second tab, or a payload written before a concurrent AI job added
        # ai_hero) would silently wipe sibling keys. Merging makes those edits
        # converge instead of clobbering. An explicit `None` for a key inside
        # the patch deletes that key; sending `landing_overrides: null` clears
        # the whole blob (a deliberate full reset).
        if "landing_overrides" in update_dict:
            patch = update_dict["landing_overrides"]
            if patch is not None:
                update_dict["landing_overrides"] = validate_landing_overrides(
                    merge_landing_overrides(course.landing_overrides, patch)
                )

        # Validate the sample's lesson_id refers to a lesson on this course.
        # Falls back to disabling the sample silently if the lesson is gone
        # (e.g. the user deleted the episode the sample pointed at after
        # the editor staged the change).
        if "sample" in update_dict and update_dict["sample"] is not None:
            sample_dict = update_dict["sample"]
            lesson_id_str = sample_dict.get("lesson_id")
            lesson_ids = {
                str(lesson.id) for module in course.modules for lesson in module.lessons
            }
            if lesson_id_str not in lesson_ids:
                update_dict["sample"] = None

        course = await repo.update(course, update_dict=update_dict)

        # The builder edits the Course, but every surface outside it — the
        # storefront catalog, product cards, checkout, receipts — renders the
        # linked Product's name/description. Keep them in sync so a rename in
        # the builder doesn't leave the old title live everywhere else.
        # (Creation already seeds product.name from the course title; this
        # closes the same loop for later edits.)
        if course.product_id is not None and (
            "title" in update_dict or "description" in update_dict
        ):
            product_repo = ProductRepository.from_session(session)
            product = await product_repo.get_by_id(course.product_id)
            if product is not None:
                product_changed = False
                new_title = update_dict.get("title")
                if "title" in update_dict and new_title and new_title != product.name:
                    product.name = new_title
                    product_changed = True
                if (
                    "description" in update_dict
                    and update_dict["description"] != product.description
                ):
                    product.description = update_dict["description"]
                    product_changed = True
                if product_changed:
                    session.add(product)
                    await session.flush()
                    org_repo = OrganizationRepository.from_session(session)
                    organization = await org_repo.get_by_id(product.organization_id)
                    if organization is not None:
                        await webhook_service.send(
                            session,
                            organization,
                            WebhookEventType.product_updated,
                            product,
                        )

        return course

    async def add_module(
        self,
        session: AsyncSession,
        course: Course,
        create_schema: CourseModuleCreate,
    ) -> CourseModule:
        module_repo = CourseModuleRepository.from_session(session)

        # A new module seeded with published lessons can flip a draft course
        # live — enforce the published_courses cap in that case.
        if any(lesson.published for lesson in create_schema.lessons):
            await self._require_published_course_slot(
                session,
                course_id=course.id,
                organization_id=course.organization_id,
            )

        module = CourseModule(
            course_id=course.id,
            title=create_schema.title,
            description=create_schema.description,
            position=create_schema.position,
            status=create_schema.status,
            release_at=create_schema.release_at,
            drip_days=create_schema.drip_days,
        )

        for lesson_schema in create_schema.lessons:
            module.lessons.append(_build_lesson(lesson_schema))

        module = await module_repo.create(module, flush=True)
        # Refresh lessons so selectin access doesn't trigger MissingGreenlet
        await session.refresh(module, attribute_names=["lessons"])
        return module

    async def update_module(
        self,
        session: AsyncSession,
        module: CourseModule,
        update_schema: CourseModuleUpdate,
    ) -> CourseModule:
        module_repo = CourseModuleRepository.from_session(session)
        update_dict = update_schema.model_dump(exclude_unset=True)
        return await module_repo.update(module, update_dict=update_dict)

    async def get_module_by_id(
        self, session: AsyncSession, module_id: UUID
    ) -> CourseModule | None:
        module_repo = CourseModuleRepository.from_session(session)
        return await module_repo.get_by_id(module_id)

    async def delete_module(self, session: AsyncSession, module: CourseModule) -> None:
        module_repo = CourseModuleRepository.from_session(session)
        await module_repo.soft_delete(module)

    async def reorder_modules(
        self,
        session: AsyncSession,
        course: Course,
        ordered_ids: Sequence[UUID],
    ) -> Sequence[CourseModule]:
        """Reorder modules within a course by setting position to list index."""
        module_repo = CourseModuleRepository.from_session(session)
        existing_ids = {m.id for m in course.modules}
        if set(ordered_ids) != existing_ids:
            raise ValueError("ordered_ids must contain exactly the course's modules")
        by_id = {m.id: m for m in course.modules}
        for index, module_id in enumerate(ordered_ids):
            await module_repo.update(by_id[module_id], update_dict={"position": index})
        return [by_id[mid] for mid in ordered_ids]

    async def add_lesson(
        self,
        session: AsyncSession,
        module: CourseModule,
        create_schema: CourseLessonCreate,
    ) -> CourseLesson:
        lesson_repo = CourseLessonRepository.from_session(session)

        # Resolve the owning org through module.course_id so we can gate
        # against the tier's lessons-per-course limit.
        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(module.course_id)
        if course is not None:
            current = await lesson_repo.count_by_course(module.course_id)
            await entitlements_service.require_under_limit(
                session,
                course.organization_id,
                "lessons_per_course",
                current=current,
            )
            # Drip scheduling is Pro+. Block setting drip_days or
            # release_at on lessons for orgs without the feature.
            if (
                create_schema.drip_days is not None
                or create_schema.release_at is not None
            ):
                await entitlements_service.require_feature(
                    session, course.organization_id, "drip_scheduling"
                )

            # Adding an already-published lesson can flip a draft course
            # live — enforce the published_courses cap in that case.
            if create_schema.published:
                await self._require_published_course_slot(
                    session,
                    course_id=course.id,
                    organization_id=course.organization_id,
                )

        lesson = _build_lesson(create_schema)
        lesson.module_id = module.id
        return await lesson_repo.create(lesson, flush=True)

    async def _require_published_course_slot(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        organization_id: UUID,
    ) -> None:
        """Enforce the published_courses cap when a course is about to gain
        its *first* published lesson (draft -> published). A course that
        already has a published lesson doesn't consume a new slot, and draft
        courses are free, so the cap meters live courses — not created ones.
        """
        lesson_repo = CourseLessonRepository.from_session(session)
        if await lesson_repo.count_published_by_course(course_id) > 0:
            return
        course_repo = CourseRepository.from_session(session)
        current = await course_repo.count_published_by_organization(organization_id)
        await entitlements_service.require_under_limit(
            session, organization_id, "published_courses", current=current
        )

    async def update_lesson(
        self,
        session: AsyncSession,
        lesson: CourseLesson,
        update_schema: CourseLessonUpdate,
    ) -> CourseLesson:
        lesson_repo = CourseLessonRepository.from_session(session)
        update_dict = update_schema.model_dump(exclude_unset=True)

        # Block enabling drip scheduling on tiers that don't include it.
        # Clearing drip (None) is always allowed so creators on Free can
        # remove drip from a previously-Pro lesson after a downgrade.
        setting_drip = (
            update_dict.get("drip_days") is not None
            or update_dict.get("release_at") is not None
        )
        if setting_drip:
            organization_id = await lesson_repo.get_organization_id_for_lesson(
                lesson.id
            )
            if organization_id is not None:
                await entitlements_service.require_feature(
                    session, organization_id, "drip_scheduling"
                )

        # Publishing a lesson can flip its course from draft to live. Enforce
        # the published_courses cap on that transition (False/None -> True),
        # before the update lands. Unpublishing is always allowed.
        publishing = update_dict.get("published") is True and not lesson.published
        if publishing:
            resolved = await lesson_repo.get_course_and_org_for_lesson(lesson.id)
            if resolved is not None:
                course_id, organization_id = resolved
                await self._require_published_course_slot(
                    session,
                    course_id=course_id,
                    organization_id=organization_id,
                )

        return await lesson_repo.update(lesson, update_dict=update_dict)

    async def get_lesson_by_id(
        self, session: AsyncSession, lesson_id: UUID
    ) -> CourseLesson | None:
        lesson_repo = CourseLessonRepository.from_session(session)
        return await lesson_repo.get_by_id(lesson_id)

    def _enqueue_lesson_video_cleanup(self, lesson: CourseLesson) -> None:
        """Enqueue removal of whatever video work the lesson currently owns
        at the provider. A finished asset is deleted directly; an upload
        that hasn't produced an asset yet (still uploading, or mid-
        transcode) is resolved by the release worker, which cancels the
        upload or deletes the asset it eventually produced. Without the
        upload branch, replacing/removing a video while a previous upload
        was still processing orphaned that asset on Mux forever.
        """
        from polar.worker import enqueue_job

        asset_id = getattr(lesson, "mux_asset_id", None)
        upload_id = getattr(lesson, "mux_upload_id", None)
        if asset_id:
            enqueue_job("course.mux_delete_asset", asset_id=asset_id)
        elif upload_id:
            enqueue_job("course.mux_release_upload", upload_id=upload_id)

    async def _refund_lesson_video_quota(
        self, session: AsyncSession, lesson: CourseLesson
    ) -> None:
        """Give the org's video-hours quota back for a detached asset.

        The quota is only ever counted when an asset reaches `ready`
        (the webhook emits the positive event then), so refund exactly
        that case. Assets that errored, were never counted
        (quota_exceeded), or never finished carry no usage to refund.
        """
        from polar.quotas.producers import emit_video_uploaded

        if lesson.mux_status != "ready" or not lesson.duration_seconds:
            return
        lesson_repo = CourseLessonRepository.from_session(session)
        organization_id = await lesson_repo.get_organization_id_for_lesson(lesson.id)
        if organization_id is not None:
            emit_video_uploaded(
                session,
                organization_id=organization_id,
                duration_seconds=-int(lesson.duration_seconds),
            )

    async def _kick_assistant_rebuild(
        self, session: AsyncSession, lesson_id: UUID
    ) -> None:
        """Re-check the course's AI assistant after a transcript went away,
        so it stops quoting (and citing timestamps from) a removed video."""
        from polar.worker import enqueue_job

        lesson_repo = CourseLessonRepository.from_session(session)
        course_id = await lesson_repo.get_course_id_for_lesson(lesson_id)
        if course_id is not None:
            enqueue_job("course_assistant.maybe_build", course_id=course_id)

    async def clear_lesson_video(
        self, session: AsyncSession, lesson: CourseLesson
    ) -> CourseLesson:
        """Detach any video asset from a lesson and reset its content state.

        Fires the asset-cleanup job idempotently so a half-uploaded or
        ready asset is removed from the provider even if the user immediately
        re-uploads — the worker tolerates 404s on subsequent attempts.
        Also refunds the video-hours quota the asset consumed and drops the
        video's transcript so the Course Assistant rebuilds without it.
        """
        self._enqueue_lesson_video_cleanup(lesson)
        await self._refund_lesson_video_quota(session, lesson)

        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.update(
            lesson,
            update_dict={
                "mux_upload_id": None,
                "mux_asset_id": None,
                "mux_playback_id": None,
                "mux_status": None,
                "duration_seconds": None,
                "transcript": None,
                "transcript_status": None,
                "transcript_cues": None,
                "ai_autofill_status": None,
            },
        )
        await self._kick_assistant_rebuild(session, lesson.id)
        return lesson

    async def stage_lesson_video_replacement(
        self,
        session: AsyncSession,
        lesson: CourseLesson,
        *,
        upload_id: str,
    ) -> CourseLesson:
        """Point the lesson at a brand-new direct upload.

        Replacing is remove + attach in one step: the previous asset (or a
        still-processing previous upload) is cleaned up at the provider, its
        video-hours are refunded, and the stale playback/duration/transcript
        state is cleared so the editor shows the upload's real progress
        instead of the old video.
        """
        self._enqueue_lesson_video_cleanup(lesson)
        await self._refund_lesson_video_quota(session, lesson)

        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.update(
            lesson,
            update_dict={
                "mux_upload_id": upload_id,
                "mux_asset_id": None,
                "mux_playback_id": None,
                "mux_status": "waiting",
                "duration_seconds": None,
                "content_type": "video",
                "transcript": None,
                "transcript_status": None,
                "transcript_cues": None,
                # Fresh video, fresh AI draft: a cancel applied to the
                # previous upload must not stick to this one.
                "ai_autofill_status": None,
            },
        )
        await self._kick_assistant_rebuild(session, lesson.id)
        return lesson

    async def attach_ready_asset(
        self,
        session: AsyncSession,
        lesson: CourseLesson,
        *,
        asset_id: str,
        playback_id: str,
        duration: float | None,
    ) -> None:
        """Attach a finished Mux asset to its lesson.

        Shared by the `video.asset.ready` webhook and the stalled-upload
        reconcile cron (which recovers lessons whose webhook never arrived).
        Runs the definitive video-hours quota check with the real duration,
        requests auto-captions, seeds the transcript pipeline state, and
        counts the hours — exactly once, guarded by the ready transition.
        """
        from polar.organization.repository import OrganizationRepository
        from polar.quotas.definitions import QuotaKey
        from polar.quotas.producers import emit_video_uploaded
        from polar.quotas.service import quotas
        from polar.worker import enqueue_job

        from . import mux as mux_client

        lesson_repo = CourseLessonRepository.from_session(session)

        # Only emit on the first transition to ready, so retried webhooks
        # (or webhook + reconcile racing) don't double-count the same asset.
        previously_ready = lesson.mux_status == "ready"
        organization_id = (
            await lesson_repo.get_organization_id_for_lesson(lesson.id)
            if not previously_ready and duration
            else None
        )

        # Post-completion quota check: now that Mux has told us the real
        # duration, see if adding it would push the org past their
        # video-hours grace ceiling. The upload-initiate check was a
        # conservative estimate; this is the definitive value. If it
        # exceeds, flip the lesson to `quota_exceeded` instead of `ready`
        # and skip the count emit — the asset stays on Mux but the
        # customer-portal playback-url endpoint will refuse to mint a URL
        # for it until the creator upgrades or deletes other content.
        target_status = "ready"
        if organization_id is not None:
            org_repo = OrganizationRepository.from_session(session)
            organization = await org_repo.get_by_id(organization_id)
            if organization is not None:
                check = await quotas.check(
                    session,
                    organization.id,
                    QuotaKey.video_hours_hosted,
                    requested_storage_units=int(duration or 0),
                )
                if not check.allowed:
                    target_status = "quota_exceeded"
                    log.warning(
                        "course.upload.over_quota",
                        extra={
                            "organization_id": str(organization.id),
                            "lesson_id": str(lesson.id),
                            "duration_seconds": int(duration or 0),
                            "used": check.used,
                            "limit": check.limit,
                        },
                    )

        update: dict = {
            "mux_asset_id": asset_id,
            "mux_playback_id": playback_id,
            "mux_status": target_status,
        }
        if duration:
            update["duration_seconds"] = int(duration)
        await lesson_repo.update(lesson, update_dict=update)

        # Auto-generated captions: when the lesson keeps captions on (the
        # default; the lesson editor's Captions switch writes
        # content.captions=false to opt out), ask Mux to generate an
        # English subtitle track from the audio now that the asset is
        # ready. Best-effort and idempotent — a failure here must not fail
        # the caller (the asset is already playable).
        if target_status == "ready" and not previously_ready:
            captions_enabled = (lesson.content or {}).get("captions", True)
            # Drive the Course Assistant transcript pipeline: request
            # captions and record whether a transcript is coming
            # ("pending") or never will ("unavailable"). The
            # transcript-track webhook (or the reconcile cron) fetches the
            # VTT once Mux finishes generating it.
            transcript_status = "unavailable"
            if captions_enabled:
                try:
                    ok = await mux_client.request_auto_captions(asset_id)
                    transcript_status = "pending" if ok else "unavailable"
                except Exception:
                    log.exception(
                        "course.captions.request_failed",
                        extra={
                            "lesson_id": str(lesson.id),
                            "asset_id": asset_id,
                        },
                    )
                    # Optimistic: the track may still arrive; let the
                    # reconcile cron resolve it rather than giving up.
                    transcript_status = "pending"
            status_update: dict = {"transcript_status": transcript_status}
            # Queue the AI lesson draft behind the transcript — unless the
            # creator already clicked "I'll write it myself" while the video
            # was still transcoding, or the deployment has no AI configured
            # (the banner must never wait on something that can't happen).
            if lesson.ai_autofill_status != "cancelled":
                from polar.course_assistant.service import (
                    is_configured as assistant_is_configured,
                )

                if transcript_status == "pending" and assistant_is_configured():
                    status_update["ai_autofill_status"] = "pending"
                elif lesson.ai_autofill_status == "pending":
                    # No transcript will ever come for this asset.
                    status_update["ai_autofill_status"] = "failed"
            await lesson_repo.update(lesson, update_dict=status_update)
            if transcript_status == "unavailable":
                # This lesson will never yield a transcript, so it may be
                # the last thing the assistant build was waiting on.
                course_id = await lesson_repo.get_course_id_for_lesson(lesson.id)
                if course_id is not None:
                    enqueue_job("course_assistant.maybe_build", course_id=course_id)

        if (
            not previously_ready
            and duration
            and organization_id is not None
            and target_status == "ready"
        ):
            emit_video_uploaded(
                session,
                organization_id=organization_id,
                duration_seconds=int(duration),
            )

    async def delete_lesson(self, session: AsyncSession, lesson: CourseLesson) -> None:
        # Enqueue Mux cleanup before soft-delete so we still have the
        # asset/upload ids available, and refund the quota the asset was
        # consuming. The workers are idempotent (404 from Mux counts as
        # success), so a failed enqueue is safe to retry later.
        lesson_repo = CourseLessonRepository.from_session(session)
        self._enqueue_lesson_video_cleanup(lesson)
        await self._refund_lesson_video_quota(session, lesson)
        await lesson_repo.soft_delete(lesson)

    async def reorder_lessons(
        self,
        session: AsyncSession,
        module: CourseModule,
        ordered_ids: Sequence[UUID],
    ) -> Sequence[CourseLesson]:
        """Reorder lessons within a module by setting position to list index."""
        lesson_repo = CourseLessonRepository.from_session(session)
        existing_ids = {lesson.id for lesson in module.lessons}
        if set(ordered_ids) != existing_ids:
            raise ValueError("ordered_ids must contain exactly the module's lessons")
        by_id = {lesson.id: lesson for lesson in module.lessons}
        for index, lesson_id in enumerate(ordered_ids):
            await lesson_repo.update(by_id[lesson_id], update_dict={"position": index})
        return [by_id[lid] for lid in ordered_ids]

    # --- Enrollment ---

    async def enroll_customer(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        customer: Customer,
        product_id: UUID | None = None,
        fire_events: bool = True,
    ) -> CourseEnrollment:
        """Enroll a customer in a course.

        Idempotent: if an active enrollment already exists, return it.
        Soft-deleted enrollments are ignored by the lookup so a customer
        who was revoked can re-enroll cleanly. The partial unique index
        on (customer_id, course_id) where deleted_at IS NULL prevents
        duplicate active rows under concurrent grants — a losing
        transaction will surface as IntegrityError and the caller (a
        Dramatiq actor for benefit grant) will retry.

        `fire_events=False` skips the `course.enrolled` automation event —
        used when the instructor enrolls their own account via the preview
        flow, which must not trigger the org's email automations.
        """
        repo = CourseEnrollmentRepository.from_session(session)
        statement = repo.get_by_customer_and_course_statement(customer.id, course_id)
        existing = await repo.get_one_or_none(statement)
        if existing is not None:
            return existing

        # A previously revoked (soft-deleted) enrollment is resurrected
        # rather than replaced: progress, watch positions, comments and
        # notes are all keyed by enrollment_id, so a fresh row would
        # orphan them and a returning student would restart from 0%.
        # enrolled_at is kept from the original enrollment so drip
        # schedules don't restart.
        revoked = await repo.get_latest_revoked_for_customer_course(
            customer.id, course_id
        )
        if revoked is not None:
            update_dict: dict = {"deleted_at": None}
            if product_id is not None:
                update_dict["product_id"] = product_id
            enrollment = await repo.update(revoked, update_dict=update_dict)
            await session.flush()
            await self._fire_course_event(
                session,
                course_id=course_id,
                customer_id=customer.id,
                event_name="course.enrolled",
            )
            return enrollment

        enrollment = CourseEnrollment(
            customer_id=customer.id,
            course_id=course_id,
            product_id=product_id,
            enrolled_at=datetime.now(tz=UTC),
        )
        enrollment = await repo.create(enrollment, flush=True)
        if fire_events:
            await self._fire_course_event(
                session,
                course_id=course_id,
                customer_id=customer.id,
                event_name="course.enrolled",
            )
        return enrollment

    async def revoke_enrollment(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
    ) -> None:
        repo = CourseEnrollmentRepository.from_session(session)
        enrollment = await repo.get_by_id(enrollment_id)
        if enrollment is not None:
            await repo.soft_delete(enrollment)

    async def revoke_enrollment_and_entitlements(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
    ) -> None:
        """Instructor-initiated removal from the course editor.

        Soft-deleting the enrollment alone is not enough: the course-access
        benefit grant that created it stays granted, so any later re-grant
        of the customer's benefits (a subscription renewal, a benefit
        update, a product change) silently re-enrolls the student. Revoke
        those grants too, so removal actually revokes the entitlement.
        The grant strategy's own revoke() re-revokes the enrollment, which
        is an idempotent no-op.

        Known limit: a subscription status bounce (past_due → active) or
        an un-cancel re-runs the grant pipeline, which re-grants revoked
        grants by design — access restored with the subscription. The
        confirm dialog tells the instructor as much. Progress rows are
        intentionally kept, and re-enrollment resurrects the original
        enrollment row (see enroll_customer), so a returning student
        resumes where they left off.
        """
        # Local imports: the benefit strategy package imports this module,
        # so a top-level import would be circular.
        from polar.benefit.grant.repository import BenefitGrantRepository
        from polar.worker import enqueue_job

        repo = CourseEnrollmentRepository.from_session(session)
        enrollment = await repo.get_by_id(enrollment_id)
        if enrollment is None:
            return

        grant_repo = BenefitGrantRepository.from_session(session)
        grants = await grant_repo.list_granted_course_access(
            enrollment.customer_id, enrollment.course_id
        )
        for grant in grants:
            scope: dict[str, UUID] = {}
            if grant.subscription_id is not None:
                scope["subscription_id"] = grant.subscription_id
            if grant.order_id is not None:
                scope["order_id"] = grant.order_id
            if not scope:
                # The benefit.revoke task looks the grant up by scope, and
                # the scope comparator rejects an empty dict — enqueueing
                # would produce a task that crashes on every retry. Every
                # purchase path grants with a subscription or order scope,
                # so this only guards against irregular data.
                continue
            enqueue_job(
                "benefit.revoke",
                customer_id=grant.customer_id,
                benefit_id=grant.benefit_id,
                member_id=grant.member_id,
                **scope,
            )

        await repo.soft_delete(enrollment)

    async def list_enrollments_for_customer(
        self,
        session: AsyncSession,
        customer_id: UUID,
    ) -> Sequence[CourseEnrollment]:
        repo = CourseEnrollmentRepository.from_session(session)
        statement = repo.get_by_customer_statement(customer_id)
        return await repo.get_all(statement)

    async def list_enrollments_for_course(
        self,
        session: AsyncSession,
        course_id: UUID,
    ) -> Sequence[CourseEnrollment]:
        repo = CourseEnrollmentRepository.from_session(session)
        statement = repo.get_base_statement().where(
            CourseEnrollment.course_id == course_id
        )
        return await repo.get_all(statement)

    async def paginate_enrollments_for_course(
        self,
        session: AsyncSession,
        course_id: UUID,
        *,
        organization_id: UUID,
        limit: int,
        page: int,
        query: str | None = None,
    ) -> tuple[Sequence[CourseEnrollment], int]:
        repo = CourseEnrollmentRepository.from_session(session)
        statement = repo.get_students_for_course_statement(course_id, organization_id)
        if query:
            # Server-side search — the tab is paginated, so filtering the
            # loaded page client-side would miss students on other pages.
            statement = repo.apply_customer_search(statement, query)
        return await repo.paginate(statement, limit=limit, page=page)

    async def get_enrollment_progress_summaries(
        self,
        session: AsyncSession,
        enrollment_ids: Sequence[UUID],
    ) -> dict[UUID, "EnrollmentProgressSummary"]:
        """Per-enrollment progress rollup for the instructor's Customers tab,
        computed in two grouped queries over the given page of enrollments."""
        progress_repo = CourseLessonProgressRepository.from_session(session)
        watch_repo = CourseLessonWatchProgressRepository.from_session(session)
        completed = await progress_repo.completion_summary_by_enrollments(
            enrollment_ids
        )
        watched = await watch_repo.watch_summary_by_enrollments(enrollment_ids)

        summaries: dict[UUID, EnrollmentProgressSummary] = {}
        for eid in enrollment_ids:
            completed_count, last_completed = completed.get(eid, (0, None))
            started_count, last_watched = watched.get(eid, (0, None))
            last_active = max(
                (d for d in (last_completed, last_watched) if d is not None),
                default=None,
            )
            summaries[eid] = EnrollmentProgressSummary(
                completed_lessons=completed_count,
                started_lessons=started_count,
                last_active_at=last_active,
            )
        return summaries

    async def get_enrollment_by_id(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
    ) -> CourseEnrollment | None:
        repo = CourseEnrollmentRepository.from_session(session)
        return await repo.get_by_id(enrollment_id)

    async def get_enrollment_for_customer(
        self,
        session: AsyncSession,
        customer_id: UUID,
        course_id: UUID,
    ) -> CourseEnrollment | None:
        repo = CourseEnrollmentRepository.from_session(session)
        statement = repo.get_by_customer_and_course_statement(customer_id, course_id)
        return await repo.get_one_or_none(statement)

    # --- Progress ---

    async def mark_lesson_complete(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
    ) -> CourseLessonProgress:
        repo = CourseLessonProgressRepository.from_session(session)
        # Fetch INCLUDING soft-deleted rows: the (enrollment, lesson) unique
        # constraint counts them, so a dead row (e.g. residue of an old
        # progress reset) must be resurrected — a blind INSERT would violate
        # the constraint and the completion would silently never stick.
        existing = await repo.get_by_enrollment_and_lesson_including_deleted(
            enrollment_id, lesson_id
        )
        if existing is not None and existing.deleted_at is None:
            return existing
        if existing is not None:
            progress = await repo.update(
                existing,
                update_dict={
                    "deleted_at": None,
                    "completed_at": datetime.now(tz=UTC),
                },
                flush=True,
            )
        else:
            progress = await repo.create(
                CourseLessonProgress(
                    enrollment_id=enrollment_id,
                    lesson_id=lesson_id,
                    completed_at=datetime.now(tz=UTC),
                ),
                flush=True,
            )
        # A completed lesson is no longer "in progress" — drop the partial
        # watch position so started/completed counts don't double-count.
        watch_repo = CourseLessonWatchProgressRepository.from_session(session)
        watch = await watch_repo.get_one_or_none(
            watch_repo.get_by_enrollment_and_lesson_statement(enrollment_id, lesson_id)
        )
        if watch is not None:
            await watch_repo.soft_delete(watch)
        await self._fire_lesson_completion_events(
            session, enrollment_id=enrollment_id, lesson_id=lesson_id
        )
        return progress

    async def record_watch_progress(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
        fraction: float,
    ) -> None:
        """Persist a partial watch position (fraction of the lesson watched).

        Upserts the (enrollment, lesson) row with the latest position, so
        partial progress survives the student closing the tab and follows
        them across devices. Completed lessons are tracked separately in
        CourseLessonProgress.
        """
        fraction = min(1.0, max(0.0, fraction))
        repo = CourseLessonWatchProgressRepository.from_session(session)
        await repo.upsert_position(
            enrollment_id=enrollment_id,
            lesson_id=lesson_id,
            fraction=fraction,
            now=datetime.now(tz=UTC),
        )

    async def get_watch_positions_for_enrollment(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
        completed_lesson_ids: set[str],
    ) -> dict[str, float]:
        """{lesson_id: fraction} for lessons the student has started but
        not completed. The single definition of what counts as a partial
        position — served to the portal so progress follows the student
        across devices instead of living only in localStorage."""
        repo = CourseLessonWatchProgressRepository.from_session(session)
        watch_items = await repo.get_all(
            repo.get_by_enrollment_statement(enrollment_id)
        )
        return {
            str(w.lesson_id): w.fraction
            for w in watch_items
            if str(w.lesson_id) not in completed_lesson_ids and w.fraction > 0
        }

    async def reset_progress_for_enrollment(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
    ) -> None:
        """Wipe an enrollment's progress — completions AND partial watch
        positions — so the student starts the course from zero.

        HARD deletes, deliberately: both tables have a
        (enrollment_id, lesson_id) unique constraint that counts
        soft-deleted rows, so a soft-deleted completion would make the
        next mark-complete INSERT for that lesson violate the constraint
        and progress tracking would silently break after a reset.
        """
        progress_repo = CourseLessonProgressRepository.from_session(session)
        await progress_repo.hard_delete_by_enrollment(enrollment_id)
        watch_repo = CourseLessonWatchProgressRepository.from_session(session)
        await watch_repo.hard_delete_by_enrollment(enrollment_id)

    # --- Automation event firing ---

    async def _fire_course_event(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        customer_id: UUID,
        event_name: str,
        lesson_id: UUID | None = None,
    ) -> None:
        course = await CourseRepository.from_session(session).get_by_id(course_id)
        if course is None:
            return
        subscriber_repo = EmailSubscriberRepository.from_session(session)
        subscriber = await subscriber_repo.get_by_customer_and_organization(
            customer_id, course.organization_id
        )
        if subscriber is None:
            return
        await fire_event(
            session,
            organization_id=course.organization_id,
            subscriber_id=subscriber.id,
            event_name=event_name,
            course_id=course_id,
            lesson_id=lesson_id,
        )

        # Goal completion: a sequence whose builder goal is "Completes the
        # course" / "Finishes a lesson" exits the moment the subscriber hits
        # that event — even while parked mid-wait. complete_for_goal only
        # touches sequences whose trigger_config.goal_event.type matches, so
        # this is a no-op for every other sequence. Run it BEFORE the enrol
        # fan-out below so it never closes an enrolment created on this tick.
        goal_type = {
            "course.completed": "course_completed",
            "course.lesson_completed": "lesson_completed",
        }.get(event_name)
        if goal_type is not None:
            from polar.email_sequence.service import (
                email_sequence as sequence_service,
            )

            await sequence_service.complete_for_goal(
                session,
                course.organization_id,
                subscriber.id,
                goal_type=goal_type,
            )

        # Per-lesson automations use a dedicated "completes this lesson"
        # trigger: completing the lesson ENTERS the subscriber into any active
        # sequence scoped to it (whereas fire_event above only resumes
        # sequences already parked on an until-event wait).
        if event_name == "course.lesson_completed" and lesson_id is not None:
            from polar.email_sequence.service import (
                email_sequence as sequence_service,
            )
            from polar.models.email_sequence import EmailSequenceTriggerType

            await sequence_service.enroll_for_trigger(
                session,
                course.organization_id,
                EmailSequenceTriggerType.on_lesson_completed,
                subscriber.id,
                lesson_id=lesson_id,
            )

        # Course-lifecycle automations enter the subscriber when they cross a
        # milestone — and, crucially, the moment they ENROL. Scoped to this
        # course so an event here never enrols into another course's sequence.
        # fire_event above already resumes any sequence parked on an until-event
        # wait for these same events.
        #
        # The "Student enrols" builder trigger is persisted as `on_purchase`
        # (see clients automationTrigger.ts) but enrolling into a course is not
        # a purchase — without this mapping the authored welcome email had no
        # path to ever send. We scope the on_purchase fan-out to this course_id,
        # so it only matches the course's own enrol automations and never the
        # org-wide purchase sequences (which carry no course_id).
        from polar.models.email_sequence import EmailSequenceTriggerType

        milestone_trigger = {
            "course.enrolled": EmailSequenceTriggerType.on_purchase,
            "course.first_lesson_completed": (
                EmailSequenceTriggerType.on_first_lesson_completed
            ),
            "course.mid_checkpoint": (
                EmailSequenceTriggerType.on_course_progress_halfway
            ),
            "course.completed": EmailSequenceTriggerType.on_course_completed,
        }.get(event_name)
        if milestone_trigger is not None:
            from polar.email_sequence.service import (
                email_sequence as sequence_service,
            )

            await sequence_service.enroll_for_trigger(
                session,
                course.organization_id,
                milestone_trigger,
                subscriber.id,
                course_id=course_id,
            )

    async def _fire_lesson_completion_events(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
    ) -> None:
        """Fire automation events triggered by a lesson completion: the
        per-lesson event, plus derived events (first lesson, mid-course
        checkpoint, course complete) when their thresholds are crossed.
        """
        enrollment = await CourseEnrollmentRepository.from_session(session).get_by_id(
            enrollment_id
        )
        if enrollment is None:
            return

        progress_repo = CourseLessonProgressRepository.from_session(session)
        lesson_repo = CourseLessonRepository.from_session(session)
        completed_count = await progress_repo.count_by_enrollment(enrollment_id)
        total_count = await lesson_repo.count_by_course(enrollment.course_id)

        common = {
            "course_id": enrollment.course_id,
            "customer_id": enrollment.customer_id,
        }

        await self._fire_course_event(
            session,
            event_name="course.lesson_completed",
            lesson_id=lesson_id,
            **common,
        )

        if completed_count == 1:
            await self._fire_course_event(
                session, event_name="course.first_lesson_completed", **common
            )

        # course.module_completed — fires the first time an enrollment
        # has every (non-soft-deleted) lesson in a single module
        # completed. Used by the community milestone job (Chunk 6 in the
        # community module) and available to email_sequence flow_engine.
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is not None:
            module_total = await lesson_repo.count_by_module(lesson.module_id)
            if module_total > 0:
                module_completed = await progress_repo.count_by_enrollment_in_module(
                    enrollment_id, lesson.module_id
                )
                if module_completed >= module_total:
                    await self._fire_course_event(
                        session,
                        event_name="course.module_completed",
                        lesson_id=lesson_id,
                        **common,
                    )
                    # Forward to the community module so it can insert a
                    # milestone post (subject to community-enabled +
                    # milestones_enabled flags). Cross-module via the
                    # job queue so course/ stays free of community/
                    # imports.
                    from polar.worker import enqueue_job

                    enqueue_job(
                        "community.module_completed_listener",
                        course_id=enrollment.course_id,
                        customer_id=enrollment.customer_id,
                        lesson_id=lesson_id,
                    )

        if total_count > 0:
            prev_pct = (completed_count - 1) / total_count
            cur_pct = completed_count / total_count
            if prev_pct < 0.5 <= cur_pct:
                await self._fire_course_event(
                    session, event_name="course.mid_checkpoint", **common
                )
            if completed_count >= total_count:
                await self._fire_course_event(
                    session, event_name="course.completed", **common
                )

    async def get_progress_for_enrollment(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
    ) -> Sequence[CourseLessonProgress]:
        repo = CourseLessonProgressRepository.from_session(session)
        return await repo.get_all(repo.get_by_enrollment_statement(enrollment_id))

    # --- Lesson comments ---

    async def list_lesson_comments(
        self,
        session: AsyncSession,
        *,
        lesson_id: UUID,
    ) -> Sequence[LessonComment]:
        """List visible comments for a lesson, plus soft-deleted parents
        whose replies are still visible. The frontend renders deleted
        parents as tombstones so the reply tree stays reachable.
        """
        from polar.kit.comments import (
            find_orphan_parent_ids,
            merge_with_tombstones,
        )

        repo = LessonCommentRepository.from_session(session)
        statement = repo.get_by_lesson_statement(lesson_id).order_by(
            LessonComment.created_at.asc()
        )
        visible = list(await repo.get_all(statement))

        orphan_parent_ids = find_orphan_parent_ids(visible)
        if not orphan_parent_ids:
            return visible

        tombstones = await repo.get_tombstone_parents(lesson_id, orphan_parent_ids)
        return merge_with_tombstones(visible, tombstones)

    async def create_lesson_comment(
        self,
        session: AsyncSession,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
        content: str,
        parent_id: UUID | None = None,
    ) -> LessonComment:
        repo = LessonCommentRepository.from_session(session)
        if parent_id is not None:
            parent = await repo.get_by_id(parent_id)
            if parent is None or parent.lesson_id != lesson_id:
                raise ValueError("Invalid parent comment")
        comment = LessonComment(
            lesson_id=lesson_id,
            enrollment_id=enrollment_id,
            parent_id=parent_id,
            content=content,
        )
        return await repo.create(comment, flush=True)

    async def get_lesson_comment(
        self, session: AsyncSession, comment_id: UUID
    ) -> LessonComment | None:
        repo = LessonCommentRepository.from_session(session)
        return await repo.get_by_id(comment_id)

    async def delete_lesson_comment(
        self,
        session: AsyncSession,
        comment: LessonComment,
    ) -> None:
        repo = LessonCommentRepository.from_session(session)
        await repo.soft_delete(comment)

    async def toggle_lesson_comment_like(
        self,
        session: AsyncSession,
        *,
        comment: LessonComment,
        enrollment_id: UUID,
    ) -> tuple[bool, int]:
        """Toggle the requesting enrollment's heart on a comment.

        Returns (liked, likes) — the new liked state for this enrollment and
        the comment's total like count. The unique (comment, enrollment)
        constraint means a row can exist at most once, so a second call
        hard-deletes it: there is no way to double-like.
        """
        repo = LessonCommentLikeRepository.from_session(session)
        existing = await repo.get_like(comment.id, enrollment_id)
        if existing is not None:
            await session.delete(existing)
            await session.flush()
            liked = False
        else:
            await repo.create(
                LessonCommentLike(
                    lesson_comment_id=comment.id,
                    enrollment_id=enrollment_id,
                ),
                flush=True,
            )
            liked = True
        likes = await repo.count_for_comment(comment.id)
        return liked, likes

    async def get_lesson_comment_likes(
        self,
        session: AsyncSession,
        *,
        comment_ids: Sequence[UUID],
        enrollment_id: UUID,
    ) -> tuple[dict[UUID, int], set[UUID]]:
        """Bulk like data for a listing: (counts by comment id, set of
        comment ids the requesting enrollment has liked)."""
        repo = LessonCommentLikeRepository.from_session(session)
        counts = await repo.counts_for_comments(comment_ids)
        liked = await repo.liked_comment_ids(comment_ids, enrollment_id)
        return counts, liked

    async def toggle_lesson_comment_pin(
        self,
        session: AsyncSession,
        *,
        comment: LessonComment,
    ) -> bool:
        """Pin/unpin a comment, YouTube-style: at most one pinned comment
        per lesson, so pinning clears the pin on any sibling first.
        Returns the comment's new pinned state."""
        repo = LessonCommentRepository.from_session(session)
        if comment.pinned_at is not None:
            await repo.update(comment, update_dict={"pinned_at": None})
            return False
        await repo.clear_pins_for_lesson(comment.lesson_id)
        await repo.update(comment, update_dict={"pinned_at": datetime.now(tz=UTC)})
        return True

    async def toggle_instructor_heart(
        self,
        session: AsyncSession,
        *,
        comment: LessonComment,
    ) -> bool:
        """Toggle the single creator heart on a comment. Returns the new
        hearted state."""
        repo = LessonCommentRepository.from_session(session)
        hearted = comment.instructor_hearted_at is None
        await repo.update(
            comment,
            update_dict={
                "instructor_hearted_at": datetime.now(tz=UTC) if hearted else None
            },
        )
        return hearted

    # --- Flat lesson gating logic ---

    async def get_all_lessons_for_course(
        self, session: AsyncSession, course_id: UUID
    ) -> Sequence[CourseLesson]:
        """Get all lessons for a course, flattened across modules, ordered by position."""
        lesson_repo = CourseLessonRepository.from_session(session)
        statement = lesson_repo.get_by_course_statement(course_id)
        return await lesson_repo.get_all(statement)

    async def get_first_free_lesson(
        self, session: AsyncSession, course_id: UUID
    ) -> CourseLesson | None:
        """Get the first lesson marked as free preview (trailer) for a course."""
        lesson_repo = CourseLessonRepository.from_session(session)
        statement = (
            lesson_repo.get_by_course_statement(course_id)
            .where(CourseLesson.is_free_preview == True)
            .limit(1)
        )
        return await lesson_repo.get_one_or_none(statement)

    @staticmethod
    def _drip_unlock_at(
        release_at: datetime | None,
        drip_days: int | None,
        enrolled_at: datetime,
    ) -> datetime | None:
        """The moment a drip / scheduled-release gate opens, or None when
        there is no gate. A fixed ``release_at`` takes precedence over a
        relative ``drip_days``."""
        if release_at is not None:
            return release_at
        if drip_days is not None:
            return enrolled_at + timedelta(days=drip_days)
        return None

    def calculate_lesson_accessibility(
        self,
        lesson: CourseLesson,
        paywall_position: int | None,
        enrolled_at: datetime,
        now: datetime,
        *,
        global_lesson_index: int | None = None,
        module: CourseModule | None = None,
    ) -> tuple[bool, datetime | None]:
        """Calculate if a lesson is accessible for an enrolled customer.

        Returns (is_accessible, locked_until_timestamp).

        Paywall is intentionally NOT considered here: once a customer is
        enrolled, every lesson past the paywall is theirs. The
        ``paywall_position`` parameter is kept for call-site compatibility.
        The only gating left is the drip schedule (release_at / drip_days),
        which may be set on the LESSON and/or on its MODULE. The lesson is
        locked until BOTH gates have opened, so ``locked_until`` is the later
        of the two active unlock times. (When ``module`` is omitted only the
        lesson's own schedule is considered.)

        Free previews are always accessible regardless of drip.
        """
        del paywall_position, global_lesson_index  # enrolled → paywall n/a

        if lesson.is_free_preview:
            return True, None

        locks: list[datetime] = []
        lesson_unlock = self._drip_unlock_at(
            lesson.release_at, lesson.drip_days, enrolled_at
        )
        if lesson_unlock is not None and now < lesson_unlock:
            locks.append(lesson_unlock)
        if module is not None:
            module_unlock = self._drip_unlock_at(
                getattr(module, "release_at", None),
                getattr(module, "drip_days", None),
                enrolled_at,
            )
            if module_unlock is not None and now < module_unlock:
                locks.append(module_unlock)

        if locks:
            return False, max(locks)
        return True, None

    # ── Notes ────────────────────────────────────────────────────────────────

    async def get_lesson_note(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
        lesson_id: UUID,
    ) -> CourseNote | None:
        repo = CourseNoteRepository.from_session(session)
        stmt = repo.get_by_enrollment_and_lesson_statement(enrollment_id, lesson_id)
        return await repo.get_one_or_none(stmt)

    async def list_course_notes(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
    ) -> Sequence[CourseNote]:
        repo = CourseNoteRepository.from_session(session)
        stmt = repo.get_by_enrollment_statement(enrollment_id)
        return await repo.get_all(stmt)

    async def upsert_lesson_note(
        self,
        session: AsyncSession,
        enrollment_id: UUID,
        lesson_id: UUID,
        content: str,
    ) -> CourseNote:
        repo = CourseNoteRepository.from_session(session)
        stmt = repo.get_by_enrollment_and_lesson_statement(enrollment_id, lesson_id)
        existing = await repo.get_one_or_none(stmt)
        if existing is not None:
            return await repo.update(existing, {"content": content})
        return await repo.create(
            CourseNote(
                enrollment_id=enrollment_id,
                lesson_id=lesson_id,
                content=content,
            )
        )

    async def delete_lesson_note(
        self,
        session: AsyncSession,
        note: CourseNote,
    ) -> None:
        repo = CourseNoteRepository.from_session(session)
        await repo.soft_delete(note)


course_service = CourseService()
