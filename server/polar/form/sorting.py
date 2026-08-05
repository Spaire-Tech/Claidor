from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from polar.kit.sorting import Sorting, SortingGetter


class FormSortProperty(StrEnum):
    created_at = "created_at"
    title = "title"
    slug = "slug"


ListSorting = Annotated[
    list[Sorting[FormSortProperty]],
    Depends(SortingGetter(FormSortProperty, ["-created_at"])),
]
