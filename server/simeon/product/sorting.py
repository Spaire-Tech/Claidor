from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from simeon.kit.sorting import Sorting, SortingGetter


class ProductSortProperty(StrEnum):
    created_at = "created_at"
    product_name = "name"  # `name` is a reserved word, so we use `product_name`
    price_amount_type = "price_amount_type"
    price_amount = "price_amount"


ListSorting = Annotated[
    list[Sorting[ProductSortProperty]],
    Depends(SortingGetter(ProductSortProperty, ["-created_at"])),
]
