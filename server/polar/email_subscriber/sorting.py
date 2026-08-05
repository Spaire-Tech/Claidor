from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from polar.kit.sorting import Sorting, SortingGetter


class EmailSubscriberSortProperty(StrEnum):
    created_at = "created_at"
    email = "email"
    status = "status"


ListSorting = Annotated[
    list[Sorting[EmailSubscriberSortProperty]],
    Depends(SortingGetter(EmailSubscriberSortProperty, ["-created_at"])),
]
