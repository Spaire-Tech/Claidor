import pytest
from pydantic import TypeAdapter, ValidationError

from polar.benefit.strategies.course_access.properties import (
    BenefitGrantCourseAccessProperties,
)

adapter = TypeAdapter(BenefitGrantCourseAccessProperties)


class TestBenefitGrantCourseAccessProperties:
    def test_empty_properties_valid(self) -> None:
        """
        Regression: on the very first grant the previous grant properties are an
        empty dict (the grant is created with `properties={}`). This dict is sent
        through the `benefit_grant.created` webhook payload, so it must validate.

        Before adding `total=False`, `enrollment_id` was a required key and the
        empty dict failed validation, raising deep inside the `benefit.grant`
        task. That rolled back the enrollment and made the task retry forever.
        """
        assert adapter.validate_python({}) == {}

    def test_with_enrollment_id(self) -> None:
        properties = {"enrollment_id": "enrollment-123"}
        assert adapter.validate_python(properties) == properties

    def test_with_null_enrollment_id(self) -> None:
        properties = {"enrollment_id": None}
        assert adapter.validate_python(properties) == properties

    def test_unknown_key_rejected(self) -> None:
        with pytest.raises(ValidationError):
            adapter.validate_python({"enrollment_id": 123})
