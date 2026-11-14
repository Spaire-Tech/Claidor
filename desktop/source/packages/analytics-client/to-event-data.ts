/**
 * An analytics event's properties, as the typed values the server takes.
 */
import { EventData } from "../proto/generated/simeon/v1/analytics_pb.js";

export type AnalyticsEventProperties = Readonly<Record<string, unknown>>;

/**
 * The typed value for one property. The server has a value for texts,
 * numbers, truths and big whole numbers; a property of any other kind (null,
 * an object, a list, a function…) has none, and is left out of the event.
 * An ordinary number always goes as a double, whole or not.
 */
function typedValue(value: unknown): EventData | undefined {
  switch (typeof value) {
    case "string":
      return new EventData({ data: { case: "stringValue", value } });
    case "number":
      return new EventData({ data: { case: "doubleValue", value } });
    case "boolean":
      return new EventData({ data: { case: "boolValue", value } });
    case "bigint":
      return new EventData({ data: { case: "intValue", value } });
    default:
      return undefined;
  }
}

export function toEventData(props: AnalyticsEventProperties | null | undefined): Record<string, EventData> {
  // An ordinary object, filled key by key: a property named `__proto__` is
  // therefore not kept as a key (its value becomes what the record inherits from).
  const typed: Record<string, EventData> = {};
  if (!props) {
    return typed;
  }
  for (const [key, value] of Object.entries(props)) {
    const made = typedValue(value);
    if (made !== undefined) {
      typed[key] = made;
    }
  }
  return typed;
}
