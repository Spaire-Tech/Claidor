import pytest
from pytest_mock import MockerFixture

from polar.organization_custom_domain.tasks import (
    custom_domain_deprovision,
    custom_domain_provision,
)


@pytest.mark.asyncio
class TestProvisioningTasks:
    async def test_provision_noop_when_unconfigured(
        self, mocker: MockerFixture
    ) -> None:
        add_domain_mock = mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.add_domain"
        )
        mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.is_configured",
            return_value=False,
        )

        await custom_domain_provision("learn.creator.com")

        add_domain_mock.assert_not_called()

    async def test_provision_attaches_domain(self, mocker: MockerFixture) -> None:
        add_domain_mock = mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.add_domain"
        )
        mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.is_configured",
            return_value=True,
        )

        await custom_domain_provision("learn.creator.com")

        add_domain_mock.assert_called_once_with("learn.creator.com")

    async def test_deprovision_detaches_domain(self, mocker: MockerFixture) -> None:
        remove_domain_mock = mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.remove_domain"
        )
        mocker.patch(
            "polar.organization_custom_domain.tasks.vercel_domains.is_configured",
            return_value=True,
        )

        await custom_domain_deprovision("learn.creator.com")

        remove_domain_mock.assert_called_once_with("learn.creator.com")
