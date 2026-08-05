from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, select

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
    RepositorySortingMixin,
    SortingClause,
)
from polar.models import UserOrganization
from polar.models.client_invoice import (
    ClientInvoice,
    ClientInvoiceLineItem,
    ClientInvoiceStatus,
)

from .sorting import ClientInvoiceSortProperty


class ClientInvoiceRepository(
    RepositorySortingMixin[ClientInvoice, ClientInvoiceSortProperty],
    RepositorySoftDeletionIDMixin[ClientInvoice, UUID],
    RepositorySoftDeletionMixin[ClientInvoice],
    RepositoryBase[ClientInvoice],
):
    model = ClientInvoice

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[ClientInvoice]]:
        statement = self.get_base_statement()

        if is_user(auth_subject):
            user = auth_subject.subject
            statement = statement.where(
                ClientInvoice.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == user.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                ClientInvoice.organization_id == auth_subject.subject.id
            )

        return statement

    async def get_by_stripe_invoice_id(
        self, stripe_invoice_id: str
    ) -> ClientInvoice | None:
        statement = self.get_base_statement().where(
            ClientInvoice.stripe_invoice_id == stripe_invoice_id
        )
        return await self.get_one_or_none(statement)

    async def get_all_by_organization(
        self,
        organization_id: UUID,
        *,
        status: ClientInvoiceStatus | None = None,
    ) -> Sequence[ClientInvoice]:
        statement = self.get_base_statement().where(
            ClientInvoice.organization_id == organization_id
        )
        if status is not None:
            statement = statement.where(ClientInvoice.status == status)
        return await self.get_all(statement)

    def get_sorting_clause(
        self, property: ClientInvoiceSortProperty
    ) -> SortingClause:
        match property:
            case ClientInvoiceSortProperty.created_at:
                return ClientInvoice.created_at
            case ClientInvoiceSortProperty.status:
                return ClientInvoice.status
            case ClientInvoiceSortProperty.total_amount:
                return ClientInvoice.total_amount
            case ClientInvoiceSortProperty.due_date:
                return ClientInvoice.due_date


class ClientInvoiceLineItemRepository(
    RepositoryBase[ClientInvoiceLineItem],
):
    model = ClientInvoiceLineItem

    async def get_all_by_invoice(
        self, client_invoice_id: UUID
    ) -> Sequence[ClientInvoiceLineItem]:
        statement = self.get_base_statement().where(
            ClientInvoiceLineItem.client_invoice_id == client_invoice_id
        )
        return await self.get_all(statement)
