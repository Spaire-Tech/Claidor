from typing import Annotated

from pydantic import Field

from simeon.kit.schemas import EmptyStrToNone
from simeon.models.subscription import CustomerCancellationReason

from .. import forms


class CancelForm(forms.BaseForm):
    customer_cancellation_reason: Annotated[
        CustomerCancellationReason, Field(title="Customer cancellation reason")
    ]
    customer_cancellation_comment: Annotated[
        EmptyStrToNone, Field(default=None, title="Customer cancellation comment")
    ]
    revoke: Annotated[bool, Field(default=False, title="Cancel immediately")]
