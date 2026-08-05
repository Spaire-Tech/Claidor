from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from polar.kit.sorting import Sorting, SortingGetter


class ClientInvoiceSortProperty(StrEnum):
    created_at = "created_at"
    status = "status"
    total_amount = "total_amount"
    due_date = "due_date"


ListSorting = Annotated[
    list[Sorting[ClientInvoiceSortProperty]],
    Depends(SortingGetter(ClientInvoiceSortProperty, ["-created_at"])),
]
