from typing import Literal

from pydantic.json_schema import SkipJsonSchema

from polar.kit.schemas import Schema
from polar.models.benefit import BenefitType

from ..base.schemas import (
    BenefitBase,
    BenefitSubscriberBase,
)


class BenefitCourseAccessProperties(Schema):
    """
    Properties for a benefit of type `course_access`.

    The benefit is internal plumbing — it's created automatically when a
    course is published, and its grant handler enrolls the buying
    customer in the course. The only configuration is which course it
    points at.
    """

    course_id: str


class BenefitCourseAccessSubscriberProperties(Schema):
    """No subscriber-facing properties — the customer just gets enrolled."""


class BenefitCourseAccess(BenefitBase):
    """
    A benefit of type `course_access`.

    Created by the courses module on course publish so that purchasing
    the underlying product triggers a CourseEnrollment via the standard
    benefit-grant pipeline. Not user-managed: `selectable=false`,
    `deletable=false`.
    """

    type: Literal[BenefitType.course_access]
    properties: BenefitCourseAccessProperties
    is_tax_applicable: SkipJsonSchema[bool]


class BenefitCourseAccessSubscriber(BenefitSubscriberBase):
    type: Literal[BenefitType.course_access]
    properties: BenefitCourseAccessSubscriberProperties
