from typing import Any, cast
from uuid import UUID

from polar.auth.models import AuthSubject
from polar.models import Benefit, Customer, Member, Organization, User

from ..base.service import BenefitServiceProtocol
from .properties import (
    BenefitCourseAccessProperties,
    BenefitGrantCourseAccessProperties,
)


class BenefitCourseAccessService(
    BenefitServiceProtocol[
        BenefitCourseAccessProperties, BenefitGrantCourseAccessProperties
    ]
):
    async def grant(
        self,
        benefit: Benefit,
        customer: Customer,
        grant_properties: BenefitGrantCourseAccessProperties,
        *,
        update: bool = False,
        attempt: int = 1,
        member: Member | None = None,
    ) -> BenefitGrantCourseAccessProperties:
        from polar.course.service import course_service

        properties = self._get_properties(benefit)
        course_id = UUID(properties["course_id"])

        # On course swap (requires_update returned True because the benefit's
        # course_id changed), the existing enrollment points at the OLD
        # course. Revoke it before enrolling in the new one — otherwise the
        # customer keeps access to the old course AND the new grant_properties
        # never gets refreshed.
        existing_enrollment_id = grant_properties.get("enrollment_id")
        if update and existing_enrollment_id:
            existing = await course_service.get_enrollment_by_id(
                self.session, UUID(existing_enrollment_id)
            )
            if existing is not None and existing.course_id == course_id:
                # Same course — already enrolled, nothing to do.
                return grant_properties
            if existing is not None:
                await course_service.revoke_enrollment(
                    self.session, existing.id
                )

        enrollment = await course_service.enroll_customer(
            self.session,
            course_id=course_id,
            customer=customer,
        )
        return {"enrollment_id": str(enrollment.id)}

    async def cycle(
        self,
        benefit: Benefit,
        customer: Customer,
        grant_properties: BenefitGrantCourseAccessProperties,
        *,
        attempt: int = 1,
        member: Member | None = None,
    ) -> BenefitGrantCourseAccessProperties:
        return grant_properties

    async def revoke(
        self,
        benefit: Benefit,
        customer: Customer,
        grant_properties: BenefitGrantCourseAccessProperties,
        *,
        attempt: int = 1,
        member: Member | None = None,
    ) -> BenefitGrantCourseAccessProperties:
        from polar.course.service import course_service

        enrollment_id_str = grant_properties.get("enrollment_id")
        if enrollment_id_str:
            await course_service.revoke_enrollment(
                self.session, UUID(enrollment_id_str)
            )
        return {}

    async def requires_update(
        self,
        benefit: Benefit,
        previous_properties: BenefitCourseAccessProperties,
    ) -> bool:
        properties = self._get_properties(benefit)
        return properties.get("course_id") != previous_properties.get("course_id")

    async def validate_properties(
        self,
        auth_subject: AuthSubject[User | Organization],
        properties: dict[str, Any],
    ) -> BenefitCourseAccessProperties:
        from polar.auth.models import is_organization, is_user
        from polar.course.service import course_service
        from polar.exceptions import SpaireRequestValidationError

        course_id_raw = properties.get("course_id")
        if not course_id_raw:
            raise SpaireRequestValidationError(
                [
                    {
                        "type": "value_error",
                        "loc": ("body", "properties", "course_id"),
                        "msg": "Course id is required",
                        "input": course_id_raw,
                    }
                ]
            )
        try:
            course_id = UUID(str(course_id_raw))
        except (TypeError, ValueError) as exc:
            raise SpaireRequestValidationError(
                [
                    {
                        "type": "value_error",
                        "loc": ("body", "properties", "course_id"),
                        "msg": "Invalid course id",
                        "input": course_id_raw,
                    }
                ]
            ) from exc

        course = await course_service.get_by_id(self.session, course_id)
        if course is None:
            raise SpaireRequestValidationError(
                [
                    {
                        "type": "value_error",
                        "loc": ("body", "properties", "course_id"),
                        "msg": "Course not found",
                        "input": course_id_raw,
                    }
                ]
            )

        # Same-org check: a benefit can only point at a course owned by the
        # same organization (for User subjects, an org they belong to).
        if is_organization(auth_subject):
            if course.organization_id != auth_subject.subject.id:
                raise SpaireRequestValidationError(
                    [
                        {
                            "type": "value_error",
                            "loc": ("body", "properties", "course_id"),
                            "msg": "Course does not belong to this organization",
                            "input": course_id_raw,
                        }
                    ]
                )
        elif is_user(auth_subject):
            from sqlalchemy import select

            from polar.models import UserOrganization

            stmt = select(UserOrganization).where(
                UserOrganization.user_id == auth_subject.subject.id,
                UserOrganization.organization_id == course.organization_id,
                UserOrganization.deleted_at.is_(None),
            )
            result = await self.session.execute(stmt)
            if result.first() is None:
                raise SpaireRequestValidationError(
                    [
                        {
                            "type": "value_error",
                            "loc": ("body", "properties", "course_id"),
                            "msg": "Course does not belong to this organization",
                            "input": course_id_raw,
                        }
                    ]
                )

        return cast(BenefitCourseAccessProperties, properties)
