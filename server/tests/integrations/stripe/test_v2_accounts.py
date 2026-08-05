"""Tests for Stripe v2 account creation and capability status handling."""

import uuid

import pytest
from pytest_mock import MockerFixture

from polar.account.service import AccountExternalIdDoesNotExist
from polar.account.service import account as account_service
from polar.enums import AccountType
from polar.integrations.stripe.service import V2AccountInfo, extract_v2_account_info
from polar.models import Account, Organization, User
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture


_PAYOUTS_MISSING = object()  # sentinel for "no payouts attribute"


def _make_mock_v2_account(
    *,
    id: str = "acct_v2_test123",
    contact_email: str | None = "test@example.com",
    country: str | None = "US",
    currency: str | None = "usd",
    entity_type: str | None = "individual",
    stripe_transfers_status: str = "pending",
    payouts_status: str | object = "pending",
    applied_configurations: list[str] | None = None,
    has_past_due_requirements: bool = False,
) -> object:
    """Build a mock v2 Account object with nested configuration."""

    class MockStatusDetail:
        def __init__(self) -> None:
            self.code = "determining_status"
            self.resolution = "provide_info"

    class MockStripeTransfers:
        def __init__(self, status: str) -> None:
            self.status = status
            self.status_details: list[MockStatusDetail] = []

    class MockPayouts:
        def __init__(self, status: str) -> None:
            self.status = status
            self.status_details: list[MockStatusDetail] = []

    class MockStripeBalance:
        def __init__(
            self, transfers_status: str, payouts_status: str | object
        ) -> None:
            self.stripe_transfers = MockStripeTransfers(transfers_status)
            if payouts_status is _PAYOUTS_MISSING:
                self.payouts = None
            else:
                self.payouts = MockPayouts(str(payouts_status))

    class MockCapabilities:
        def __init__(
            self, transfers_status: str, payouts_status: str
        ) -> None:
            self.stripe_balance = MockStripeBalance(
                transfers_status, payouts_status
            )

    class MockRecipient:
        def __init__(
            self, transfers_status: str, payouts_status: str
        ) -> None:
            self.applied = True
            self.capabilities = MockCapabilities(
                transfers_status, payouts_status
            )

    class MockConfiguration:
        def __init__(
            self, transfers_status: str, payouts_status: str
        ) -> None:
            self.recipient = MockRecipient(transfers_status, payouts_status)

    class MockIdentity:
        def __init__(self, country: str | None, entity_type: str | None) -> None:
            self.country = country
            self.entity_type = entity_type

    class MockDefaults:
        def __init__(self, currency: str | None) -> None:
            self.currency = currency

    class MockEntry:
        def __init__(self, past_due: bool) -> None:
            self.past_due_deadline = "2025-01-01" if past_due else None

    class MockRequirements:
        def __init__(self, has_past_due: bool) -> None:
            self.entries = [MockEntry(has_past_due)] if has_past_due else []

    class MockV2Account:
        def __init__(self) -> None:
            self.id = id
            self.contact_email = contact_email
            self.configuration = MockConfiguration(
                stripe_transfers_status, payouts_status
            )
            self.identity = MockIdentity(country, entity_type)
            self.defaults = MockDefaults(currency)
            self.requirements = MockRequirements(has_past_due_requirements)
            self.applied_configurations = applied_configurations or ["recipient"]
            self.object = "v2.core.account"

    return MockV2Account()


class TestExtractV2AccountInfo:
    """Test the extract_v2_account_info helper function."""

    def test_extract_pending_account(self) -> None:
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="pending",
            payouts_status="pending",
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.id == "acct_v2_test123"
        assert info.email == "test@example.com"
        assert info.country == "US"
        assert info.currency == "usd"
        assert info.is_transfers_enabled is False
        assert info.is_payouts_enabled is False
        assert info.is_details_submitted is True  # recipient applied, no past due
        assert info.business_type == "individual"

    def test_extract_active_account(self) -> None:
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="active",
            payouts_status="active",
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_transfers_enabled is True
        assert info.is_payouts_enabled is True
        assert info.is_details_submitted is True

    def test_extract_restricted_account(self) -> None:
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="restricted",
            payouts_status="restricted",
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_transfers_enabled is False
        assert info.is_payouts_enabled is False

    def test_extract_with_past_due_requirements(self) -> None:
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="active",
            payouts_status="active",
            has_past_due_requirements=True,
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_details_submitted is False

    def test_extract_without_recipient_config(self) -> None:
        mock_account = _make_mock_v2_account(
            applied_configurations=[],
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_details_submitted is False

    def test_extract_payouts_missing_falls_back_to_transfers(self) -> None:
        """When payouts capability is not in the response, fall back to transfers status."""
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="active",
            payouts_status=_PAYOUTS_MISSING,
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_transfers_enabled is True
        assert info.is_payouts_enabled is True

    def test_extract_payouts_missing_pending_transfers(self) -> None:
        """When payouts is missing and transfers is pending, payouts should also be False."""
        mock_account = _make_mock_v2_account(
            stripe_transfers_status="pending",
            payouts_status=_PAYOUTS_MISSING,
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.is_transfers_enabled is False
        assert info.is_payouts_enabled is False

    def test_extract_none_fields(self) -> None:
        mock_account = _make_mock_v2_account(
            contact_email=None,
            country=None,
            currency=None,
            entity_type=None,
        )
        info = extract_v2_account_info(mock_account)  # type: ignore[arg-type]

        assert info.email is None
        assert info.country is None
        assert info.currency is None
        assert info.business_type is None


async def _create_account(
    save_fixture: SaveFixture,
    *,
    admin: User,
    stripe_id: str = "acct_v2_test123",
    status: Account.Status = Account.Status.ONBOARDING_STARTED,
) -> Account:
    account = Account(
        account_type=AccountType.stripe,
        status=status,
        admin_id=admin.id,
        stripe_id=stripe_id,
        country="US",
        currency="usd",
        is_details_submitted=False,
        is_charges_enabled=False,
        is_payouts_enabled=False,
    )
    await save_fixture(account)
    return account


@pytest.mark.asyncio
class TestV2AccountCreation:
    """Test account creation using the v2 API."""

    async def test_create_account_returns_v2_info(
        self, mocker: MockerFixture
    ) -> None:
        from polar.integrations.stripe.service import StripeService

        service = StripeService()

        mock_v2_account = _make_mock_v2_account(
            id="acct_new_v2",
            contact_email="new@example.com",
            country="SE",
            currency="sek",
            stripe_transfers_status="pending",
            payouts_status="pending",
        )

        mock_create = mocker.patch(
            "polar.integrations.stripe.service.stripe_client.v2.core.accounts.create_async",
            return_value=mock_v2_account,
        )

        from polar.account.schemas import AccountCreateForOrganization

        account_create = AccountCreateForOrganization(
            organization_id=uuid.uuid4(),
            account_type=AccountType.stripe,
            country="SE",
        )

        result = await service.create_account(account_create, name="Test Org")

        assert isinstance(result, V2AccountInfo)
        assert result.id == "acct_new_v2"
        assert result.email == "new@example.com"
        assert result.country == "SE"
        assert result.is_transfers_enabled is False
        assert result.is_payouts_enabled is False

        # Verify v2 create was called with correct params
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args
        params = call_kwargs.kwargs["params"]
        assert params["dashboard"] == "express"
        assert params["identity"]["country"] == "SE"
        assert params["configuration"]["merchant"]["capabilities"]["card_payments"]["requested"] is True
        assert params["configuration"]["recipient"]["capabilities"]["stripe_balance"]["stripe_transfers"]["requested"] is True
        assert params["display_name"] == "Test Org"


@pytest.mark.asyncio
class TestV2AccountUpdate:
    """Test updating internal account from v2 Stripe data."""

    async def test_update_account_from_stripe_v2(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        account = await _create_account(save_fixture, admin=user)

        active_v2_info = V2AccountInfo(
            id="acct_v2_test123",
            email="updated@example.com",
            country="US",
            currency="usd",
            is_details_submitted=True,
            is_transfers_enabled=True,
            is_payouts_enabled=True,
            business_type="individual",
            data={},
        )

        mocker.patch(
            "polar.integrations.stripe.service.StripeService.retrieve_v2_account",
            return_value=active_v2_info,
        )

        updated = await account_service.update_account_from_stripe(
            session, stripe_account_id="acct_v2_test123"
        )

        assert updated.email == "updated@example.com"
        assert updated.is_details_submitted is True
        assert updated.is_charges_enabled is True  # maps from transfers
        assert updated.is_payouts_enabled is True

    async def test_update_nonexistent_account_raises(
        self,
        session: AsyncSession,
        mocker: MockerFixture,
    ) -> None:
        with pytest.raises(AccountExternalIdDoesNotExist):
            await account_service.update_account_from_stripe(
                session, stripe_account_id="acct_nonexistent"
            )


@pytest.mark.asyncio
class TestV2CapabilityStatusTransitions:
    """Test capability status transitions via v2 webhook updates."""

    async def test_transition_pending_to_active(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """Simulate an account going from pending to active capabilities."""
        account = await _create_account(
            save_fixture,
            admin=user,
            status=Account.Status.ONBOARDING_STARTED,
        )
        assert account.is_charges_enabled is False
        assert account.is_payouts_enabled is False

        active_v2_info = V2AccountInfo(
            id="acct_v2_test123",
            email="test@example.com",
            country="US",
            currency="usd",
            is_details_submitted=True,
            is_transfers_enabled=True,
            is_payouts_enabled=True,
            business_type="individual",
            data={},
        )

        mocker.patch(
            "polar.integrations.stripe.service.StripeService.retrieve_v2_account",
            return_value=active_v2_info,
        )

        updated = await account_service.update_account_from_stripe(
            session, stripe_account_id="acct_v2_test123"
        )

        assert updated.is_charges_enabled is True
        assert updated.is_payouts_enabled is True
        assert updated.is_details_submitted is True

    async def test_transition_active_to_restricted(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """Simulate capabilities becoming restricted."""
        account = await _create_account(
            save_fixture,
            admin=user,
            status=Account.Status.ACTIVE,
        )
        account.is_charges_enabled = True
        account.is_payouts_enabled = True
        account.is_details_submitted = True
        await save_fixture(account)

        restricted_v2_info = V2AccountInfo(
            id="acct_v2_test123",
            email="test@example.com",
            country="US",
            currency="usd",
            is_details_submitted=True,
            is_transfers_enabled=False,
            is_payouts_enabled=False,
            business_type="individual",
            data={},
        )

        mocker.patch(
            "polar.integrations.stripe.service.StripeService.retrieve_v2_account",
            return_value=restricted_v2_info,
        )

        updated = await account_service.update_account_from_stripe(
            session, stripe_account_id="acct_v2_test123"
        )

        assert updated.is_charges_enabled is False
        assert updated.is_payouts_enabled is False
