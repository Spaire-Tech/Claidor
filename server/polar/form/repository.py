from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import joinedload, selectinload

from polar.auth.models import (
    AuthSubject,
    Organization,
    User,
    is_organization,
    is_user,
)
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionMixin,
)
from polar.models import Form, FormSubmission, UserOrganization
from polar.models.form import FormStatus


class FormRepository(
    RepositorySoftDeletionMixin[Form],
    RepositoryBase[Form],
):
    model = Form

    def _with_relations(self, statement: Select[tuple[Form]]) -> Select[tuple[Form]]:
        return statement.options(
            selectinload(Form.attached_custom_fields),
            joinedload(Form.file),
        )

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[Form]]:
        statement = self._with_relations(self.get_base_statement())

        if is_user(auth_subject):
            statement = statement.where(
                Form.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == auth_subject.subject.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                Form.organization_id == auth_subject.subject.id,
            )

        return statement

    async def get_readable_by_id(
        self, auth_subject: AuthSubject[User | Organization], id: UUID
    ) -> Form | None:
        statement = self.get_readable_statement(auth_subject).where(Form.id == id)
        return await self.get_one_or_none(statement)

    async def get_published_by_id(self, id: UUID) -> Form | None:
        """Public lookup used by the anonymous render + submit paths."""
        statement = self._with_relations(
            self.get_base_statement().where(
                Form.id == id,
                Form.status == FormStatus.published,
            )
        )
        return await self.get_one_or_none(statement)

    async def list_published_by_organization(
        self, organization_id: UUID
    ) -> Sequence[Form]:
        """Published forms for an org, used to render the public Space."""
        statement = self._with_relations(
            self.get_base_statement().where(
                Form.organization_id == organization_id,
                Form.status == FormStatus.published,
            )
        ).order_by(Form.created_at.desc())
        return await self.get_all(statement)

    async def get_with_file_by_id(self, id: UUID) -> Form | None:
        """Lookup for the delivery worker — independent of publish status so a
        submission already accepted still gets its file."""
        statement = self._with_relations(self.get_base_statement().where(Form.id == id))
        return await self.get_one_or_none(statement)

    async def get_by_organization_and_slug(
        self, organization_id: UUID, slug: str
    ) -> Form | None:
        # Include soft-deleted forms: the (organization_id, slug) unique
        # constraint counts deleted rows too, so the slug-collision check must
        # see them — otherwise re-using a deleted form's slug hits the DB
        # constraint instead of getting a fresh suffix.
        statement = self.get_base_statement(include_deleted=True).where(
            Form.organization_id == organization_id,
            Form.slug == slug,
        )
        return await self.get_one_or_none(statement)


class FormSubmissionRepository(
    RepositorySoftDeletionMixin[FormSubmission],
    RepositoryBase[FormSubmission],
):
    model = FormSubmission
