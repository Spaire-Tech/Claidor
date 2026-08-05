import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.entitlements.exceptions import FeatureNotInPlanError
from polar.entitlements.tiers import TierKey
from polar.models import Organization, OrganizationCustomDomain
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus
from polar.organization_custom_domain import dns
from polar.organization_custom_domain.service import (
    DomainAlreadyInUse,
    InvalidDomain,
    NoDomainConfigured,
    normalize_and_validate_domain,
)
from polar.organization_custom_domain.service import (
    organization_custom_domain as custom_domain_service,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization


class TestNormalizeAndValidateDomain:
    def test_valid_subdomain(self) -> None:
        assert normalize_and_validate_domain("learn.creator.com") == "learn.creator.com"

    def test_normalizes_case_and_trailing_dot(self) -> None:
        assert (
            normalize_and_validate_domain("  Learn.Creator.COM. ")
            == "learn.creator.com"
        )

    def test_strips_scheme(self) -> None:
        assert (
            normalize_and_validate_domain("https://learn.creator.com")
            == "learn.creator.com"
        )

    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "creator.com",  # apex not supported in v1
            "learn.creator.com/path",
            "learn.creator.com:8080",
            "user@learn.creator.com",
            "learn .creator.com",
            "-learn.creator.com",
            "learn.creator.c0m1..",
            "learn.creator",  # numeric-less but only 2 labels
            "a" * 300 + ".creator.com",
        ],
    )
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(InvalidDomain):
            normalize_and_validate_domain(raw)

    def test_rejects_platform_domain(self) -> None:
        # Anything under the CNAME target's registrable parent is fenced off.
        parent = ".".join(settings.CUSTOM_DOMAIN_CNAME_TARGET.split(".")[-2:])
        with pytest.raises(InvalidDomain):
            normalize_and_validate_domain(f"learn.{parent}")


def _dns_responses(
    txt: list[str] | None = None, cname: list[str] | None = None
) -> "dict[str, list[str]]":
    return {"TXT": txt or [], "CNAME": cname or []}


def _mock_dns(mocker: MockerFixture, responses: dict[str, list[str]]) -> None:
    async def resolve(name: str, record_type: str) -> list[str]:
        return responses[record_type]

    mocker.patch(
        "polar.organization_custom_domain.service.dns.resolve", side_effect=resolve
    )


@pytest.mark.asyncio
class TestSetDomain:
    async def test_creates_pending_domain(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        enqueue_job_mock = mocker.patch(
            "polar.organization_custom_domain.service.enqueue_job"
        )

        custom_domain = await custom_domain_service.set_domain(
            session, organization, "learn.creator.com"
        )

        assert custom_domain.domain == "learn.creator.com"
        assert custom_domain.status == OrganizationCustomDomainStatus.pending
        assert custom_domain.verification_token
        assert custom_domain.verified_at is None
        enqueue_job_mock.assert_called_once_with(
            "organization_custom_domain.verify",
            custom_domain_id=custom_domain.id,
        )

    async def test_idempotent_same_domain(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        mocker.patch("polar.organization_custom_domain.service.enqueue_job")

        first = await custom_domain_service.set_domain(
            session, organization, "learn.creator.com"
        )
        token = first.verification_token
        second = await custom_domain_service.set_domain(
            session, organization, "LEARN.CREATOR.COM"
        )

        assert second.id == first.id
        assert second.verification_token == token

    async def test_replacing_domain_resets_verification(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        enqueue_job_mock = mocker.patch(
            "polar.organization_custom_domain.service.enqueue_job"
        )
        first = await custom_domain_service.set_domain(
            session, organization, "learn.creator.com"
        )
        first.status = OrganizationCustomDomainStatus.active
        token = first.verification_token

        second = await custom_domain_service.set_domain(
            session, organization, "courses.creator.com"
        )

        assert second.id == first.id
        assert second.domain == "courses.creator.com"
        assert second.status == OrganizationCustomDomainStatus.pending
        assert second.verification_token != token
        assert second.verified_at is None
        assert second.failure_count == 0
        # The replaced domain is detached from the hosting provider.
        enqueue_job_mock.assert_any_call(
            "organization_custom_domain.deprovision",
            domain="learn.creator.com",
        )

    async def test_conflict_with_other_organization(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        organization: Organization,
    ) -> None:
        mocker.patch("polar.organization_custom_domain.service.enqueue_job")
        other = await create_organization(save_fixture)
        await custom_domain_service.set_domain(session, other, "learn.creator.com")

        with pytest.raises(DomainAlreadyInUse):
            await custom_domain_service.set_domain(
                session, organization, "learn.creator.com"
            )

    async def test_entitlement_required(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        mocker.patch(
            "polar.organization_custom_domain.service.entitlements_service.require_feature",
            side_effect=FeatureNotInPlanError(
                "custom_storefront_domain", TierKey.starter
            ),
        )

        with pytest.raises(FeatureNotInPlanError):
            await custom_domain_service.set_domain(
                session, organization, "learn.creator.com"
            )


@pytest.mark.asyncio
class TestVerify:
    async def _create_domain(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> OrganizationCustomDomain:
        self.enqueue_job_mock = mocker.patch(
            "polar.organization_custom_domain.service.enqueue_job"
        )
        return await custom_domain_service.set_domain(
            session, organization, "learn.creator.com"
        )

    async def test_activates_when_records_installed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        custom_domain = await self._create_domain(mocker, session, organization)
        _mock_dns(
            mocker,
            _dns_responses(
                txt=[custom_domain.verification_token],
                cname=[settings.CUSTOM_DOMAIN_CNAME_TARGET],
            ),
        )

        result = await custom_domain_service.verify(session, custom_domain)

        assert result.txt_ok is True
        assert result.cname_ok is True
        assert custom_domain.status == OrganizationCustomDomainStatus.active
        assert custom_domain.verified_at is not None
        assert custom_domain.last_checked_at is not None
        assert custom_domain.failure_count == 0
        # Activation hands the domain to the TLS/hosting provider.
        self.enqueue_job_mock.assert_any_call(
            "organization_custom_domain.provision",
            domain=custom_domain.domain,
        )

        # Re-verifying an already-active domain must not re-provision.
        self.enqueue_job_mock.reset_mock()
        await custom_domain_service.verify(session, custom_domain)
        self.enqueue_job_mock.assert_not_called()

        # The denormalized column drives URL generation.
        assert organization.custom_domain == "learn.creator.com"
        assert (
            organization.storefront_url("/portal") == "https://learn.creator.com/portal"
        )

    async def test_demotion_clears_organization_custom_domain(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        custom_domain = await self._create_domain(mocker, session, organization)
        _mock_dns(
            mocker,
            _dns_responses(
                txt=[custom_domain.verification_token],
                cname=[settings.CUSTOM_DOMAIN_CNAME_TARGET],
            ),
        )
        await custom_domain_service.verify(session, custom_domain)
        assert organization.custom_domain == "learn.creator.com"

        _mock_dns(mocker, _dns_responses())
        for _ in range(settings.CUSTOM_DOMAIN_FAILURE_THRESHOLD):
            await custom_domain_service.verify(session, custom_domain)

        assert custom_domain.status == OrganizationCustomDomainStatus.failed
        # URL generation falls back to the platform host while down.
        assert organization.custom_domain is None
        assert organization.storefront_url("/portal").endswith(
            f"/{organization.slug}/portal"
        )

    async def test_stays_pending_when_txt_missing(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        custom_domain = await self._create_domain(mocker, session, organization)
        _mock_dns(
            mocker,
            _dns_responses(
                txt=["some-other-token"],
                cname=[settings.CUSTOM_DOMAIN_CNAME_TARGET],
            ),
        )

        result = await custom_domain_service.verify(session, custom_domain)

        assert result.txt_ok is False
        assert result.cname_ok is True
        assert custom_domain.status == OrganizationCustomDomainStatus.pending
        assert custom_domain.verified_at is None

    async def test_active_domain_demoted_after_threshold(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        custom_domain = await self._create_domain(mocker, session, organization)
        _mock_dns(
            mocker,
            _dns_responses(
                txt=[custom_domain.verification_token],
                cname=[settings.CUSTOM_DOMAIN_CNAME_TARGET],
            ),
        )
        await custom_domain_service.verify(session, custom_domain)
        assert custom_domain.status == OrganizationCustomDomainStatus.active

        # Records disappear: stays active until the failure threshold.
        _mock_dns(mocker, _dns_responses())
        for _ in range(settings.CUSTOM_DOMAIN_FAILURE_THRESHOLD - 1):
            await custom_domain_service.verify(session, custom_domain)
            assert custom_domain.status == OrganizationCustomDomainStatus.active

        await custom_domain_service.verify(session, custom_domain)
        assert custom_domain.status == OrganizationCustomDomainStatus.failed

        # Records restored: reactivates and resets the failure count.
        _mock_dns(
            mocker,
            _dns_responses(
                txt=[custom_domain.verification_token],
                cname=[settings.CUSTOM_DOMAIN_CNAME_TARGET],
            ),
        )
        await custom_domain_service.verify(session, custom_domain)
        assert custom_domain.status == OrganizationCustomDomainStatus.active
        assert custom_domain.failure_count == 0

    async def test_dns_error_leaves_state_untouched(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        custom_domain = await self._create_domain(mocker, session, organization)
        mocker.patch(
            "polar.organization_custom_domain.service.dns.resolve",
            side_effect=dns.DNSResolutionError(custom_domain.domain, "TXT", "boom"),
        )

        with pytest.raises(dns.DNSResolutionError):
            await custom_domain_service.verify(session, custom_domain)

        assert custom_domain.status == OrganizationCustomDomainStatus.pending
        assert custom_domain.last_checked_at is None


@pytest.mark.asyncio
class TestRemove:
    async def test_removes_domain(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        enqueue_job_mock = mocker.patch(
            "polar.organization_custom_domain.service.enqueue_job"
        )
        await custom_domain_service.set_domain(
            session, organization, "learn.creator.com"
        )

        organization.custom_domain = "learn.creator.com"
        await custom_domain_service.remove(session, organization.id)

        assert (
            await custom_domain_service.get_for_organization(session, organization.id)
            is None
        )
        # Removal detaches the domain from the hosting provider and clears
        # the denormalized column.
        enqueue_job_mock.assert_any_call(
            "organization_custom_domain.deprovision",
            domain="learn.creator.com",
        )
        assert organization.custom_domain is None

    async def test_no_domain_configured(
        self,
        session: AsyncSession,
        organization: Organization,
    ) -> None:
        with pytest.raises(NoDomainConfigured):
            await custom_domain_service.remove(session, organization.id)
