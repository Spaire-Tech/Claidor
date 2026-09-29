from pydantic import Field

from simeon.customer_meter.schemas import CustomerMeterBase
from simeon.kit.schemas import IDSchema, TimestampedSchema
from simeon.meter.schemas import NAME_DESCRIPTION as METER_NAME_DESCRIPTION


class CustomerCustomerMeterMeter(IDSchema, TimestampedSchema):
    name: str = Field(description=METER_NAME_DESCRIPTION)


class CustomerCustomerMeter(CustomerMeterBase):
    meter: CustomerCustomerMeterMeter
