from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from simeon.kit.sorting import Sorting, SortingGetter


class AccountSortProperty(StrEnum):
    created_at = "created_at"


ListSorting = Annotated[
    list[Sorting[AccountSortProperty]],
    Depends(SortingGetter(AccountSortProperty, ["created_at"])),
]
