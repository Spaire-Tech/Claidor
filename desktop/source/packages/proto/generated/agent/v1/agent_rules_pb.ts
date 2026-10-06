/**
 * Complete generated 0.18 module recovered from byte-identical
 * macOS and Windows immutable artifact regions. Do not hand-edit.
 * Evidence: src/app/dist/electron-main/main.cjs:16755-16958
 * Region SHA-256: 511b47b721ec823d953960276ddeeedc610c9d45623cbe53333cae9609981f64
 * Atomic B1 exports: 6 messages + 1 enums = 7
 */
import { Message, proto3 } from "@bufbuild/protobuf";
import type { BinaryReadOptions, JsonReadOptions, JsonValue, MessageType, PartialMessage, PlainMessage } from "@bufbuild/protobuf";

type MutableMessageType<T extends Message<T>> = { -readonly [P in keyof MessageType<T>]: MessageType<T>[P] };

export type AgentRuleSource = 0 | 1 | 2;
var AgentRuleSource: {
  "UNSPECIFIED": 0;
  "TEAM": 1;
  "USER": 2;
  0: "UNSPECIFIED";
  1: "TEAM";
  2: "USER";
};
(function(AgentRuleSource2) {
  AgentRuleSource2[AgentRuleSource2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
  AgentRuleSource2[AgentRuleSource2["TEAM"] = 1] = "TEAM";
  AgentRuleSource2[AgentRuleSource2["USER"] = 2] = "USER";
})(AgentRuleSource! || (AgentRuleSource = {} as typeof AgentRuleSource));
proto3.util.setEnumType(AgentRuleSource, "agent.v1.AgentRuleSource", [
  { no: 0, name: "AGENT_RULE_SOURCE_UNSPECIFIED" },
  { no: 1, name: "AGENT_RULE_SOURCE_TEAM" },
  { no: 2, name: "AGENT_RULE_SOURCE_USER" }
]);
var AgentRuleTypeGlobal$Runtime = (() => class _AgentRuleTypeGlobal extends Message<_AgentRuleTypeGlobal> {
  constructor(data?: PartialMessage<_AgentRuleTypeGlobal>) {
    super();
    proto3.util.initPartial(data, this as _AgentRuleTypeGlobal);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRuleTypeGlobal {
    return new _AgentRuleTypeGlobal().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRuleTypeGlobal {
    return new _AgentRuleTypeGlobal().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRuleTypeGlobal {
    return new _AgentRuleTypeGlobal().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRuleTypeGlobal | PlainMessage<_AgentRuleTypeGlobal> | undefined | null, b2: _AgentRuleTypeGlobal | PlainMessage<_AgentRuleTypeGlobal> | undefined | null): boolean {
    return proto3.util.equals(_AgentRuleTypeGlobal as unknown as MessageType<_AgentRuleTypeGlobal>, a, b2);
  }
})();
export type AgentRuleTypeGlobal = InstanceType<typeof AgentRuleTypeGlobal$Runtime>;
var AgentRuleTypeGlobal: MessageType<AgentRuleTypeGlobal> = AgentRuleTypeGlobal$Runtime as unknown as MessageType<AgentRuleTypeGlobal>;
(AgentRuleTypeGlobal as MutableMessageType<AgentRuleTypeGlobal>).runtime = proto3;
(AgentRuleTypeGlobal as MutableMessageType<AgentRuleTypeGlobal>).typeName = "agent.v1.AgentRuleTypeGlobal";
(AgentRuleTypeGlobal as MutableMessageType<AgentRuleTypeGlobal>).fields = proto3.util.newFieldList(() => []);
var AgentRuleTypeFileGlobs$Runtime = (() => class _AgentRuleTypeFileGlobs extends Message<_AgentRuleTypeFileGlobs> {
  declare globs: string[];
  constructor(data?: PartialMessage<_AgentRuleTypeFileGlobs>) {
    super();
    this.globs = [];
    proto3.util.initPartial(data, this as _AgentRuleTypeFileGlobs);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRuleTypeFileGlobs {
    return new _AgentRuleTypeFileGlobs().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRuleTypeFileGlobs {
    return new _AgentRuleTypeFileGlobs().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRuleTypeFileGlobs {
    return new _AgentRuleTypeFileGlobs().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRuleTypeFileGlobs | PlainMessage<_AgentRuleTypeFileGlobs> | undefined | null, b2: _AgentRuleTypeFileGlobs | PlainMessage<_AgentRuleTypeFileGlobs> | undefined | null): boolean {
    return proto3.util.equals(_AgentRuleTypeFileGlobs as unknown as MessageType<_AgentRuleTypeFileGlobs>, a, b2);
  }
})();
export type AgentRuleTypeFileGlobs = InstanceType<typeof AgentRuleTypeFileGlobs$Runtime>;
var AgentRuleTypeFileGlobs: MessageType<AgentRuleTypeFileGlobs> = AgentRuleTypeFileGlobs$Runtime as unknown as MessageType<AgentRuleTypeFileGlobs>;
(AgentRuleTypeFileGlobs as MutableMessageType<AgentRuleTypeFileGlobs>).runtime = proto3;
(AgentRuleTypeFileGlobs as MutableMessageType<AgentRuleTypeFileGlobs>).typeName = "agent.v1.AgentRuleTypeFileGlobs";
(AgentRuleTypeFileGlobs as MutableMessageType<AgentRuleTypeFileGlobs>).fields = proto3.util.newFieldList(() => [
  { no: 1, name: "globs", kind: "scalar", T: 9, repeated: true }
]);
var AgentRuleTypeAgentFetched$Runtime = (() => class _AgentRuleTypeAgentFetched extends Message<_AgentRuleTypeAgentFetched> {
  declare description: string;
  constructor(data?: PartialMessage<_AgentRuleTypeAgentFetched>) {
    super();
    this.description = "";
    proto3.util.initPartial(data, this as _AgentRuleTypeAgentFetched);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRuleTypeAgentFetched {
    return new _AgentRuleTypeAgentFetched().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRuleTypeAgentFetched {
    return new _AgentRuleTypeAgentFetched().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRuleTypeAgentFetched {
    return new _AgentRuleTypeAgentFetched().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRuleTypeAgentFetched | PlainMessage<_AgentRuleTypeAgentFetched> | undefined | null, b2: _AgentRuleTypeAgentFetched | PlainMessage<_AgentRuleTypeAgentFetched> | undefined | null): boolean {
    return proto3.util.equals(_AgentRuleTypeAgentFetched as unknown as MessageType<_AgentRuleTypeAgentFetched>, a, b2);
  }
})();
export type AgentRuleTypeAgentFetched = InstanceType<typeof AgentRuleTypeAgentFetched$Runtime>;
var AgentRuleTypeAgentFetched: MessageType<AgentRuleTypeAgentFetched> = AgentRuleTypeAgentFetched$Runtime as unknown as MessageType<AgentRuleTypeAgentFetched>;
(AgentRuleTypeAgentFetched as MutableMessageType<AgentRuleTypeAgentFetched>).runtime = proto3;
(AgentRuleTypeAgentFetched as MutableMessageType<AgentRuleTypeAgentFetched>).typeName = "agent.v1.AgentRuleTypeAgentFetched";
(AgentRuleTypeAgentFetched as MutableMessageType<AgentRuleTypeAgentFetched>).fields = proto3.util.newFieldList(() => [
  {
    no: 1,
    name: "description",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  }
]);
var AgentRuleTypeManuallyAttached$Runtime = (() => class _AgentRuleTypeManuallyAttached extends Message<_AgentRuleTypeManuallyAttached> {
  constructor(data?: PartialMessage<_AgentRuleTypeManuallyAttached>) {
    super();
    proto3.util.initPartial(data, this as _AgentRuleTypeManuallyAttached);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRuleTypeManuallyAttached {
    return new _AgentRuleTypeManuallyAttached().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRuleTypeManuallyAttached {
    return new _AgentRuleTypeManuallyAttached().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRuleTypeManuallyAttached {
    return new _AgentRuleTypeManuallyAttached().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRuleTypeManuallyAttached | PlainMessage<_AgentRuleTypeManuallyAttached> | undefined | null, b2: _AgentRuleTypeManuallyAttached | PlainMessage<_AgentRuleTypeManuallyAttached> | undefined | null): boolean {
    return proto3.util.equals(_AgentRuleTypeManuallyAttached as unknown as MessageType<_AgentRuleTypeManuallyAttached>, a, b2);
  }
})();
export type AgentRuleTypeManuallyAttached = InstanceType<typeof AgentRuleTypeManuallyAttached$Runtime>;
var AgentRuleTypeManuallyAttached: MessageType<AgentRuleTypeManuallyAttached> = AgentRuleTypeManuallyAttached$Runtime as unknown as MessageType<AgentRuleTypeManuallyAttached>;
(AgentRuleTypeManuallyAttached as MutableMessageType<AgentRuleTypeManuallyAttached>).runtime = proto3;
(AgentRuleTypeManuallyAttached as MutableMessageType<AgentRuleTypeManuallyAttached>).typeName = "agent.v1.AgentRuleTypeManuallyAttached";
(AgentRuleTypeManuallyAttached as MutableMessageType<AgentRuleTypeManuallyAttached>).fields = proto3.util.newFieldList(() => []);
var AgentRuleType$Runtime = (() => class _AgentRuleType extends Message<_AgentRuleType> {
  declare type: { case: "global"; value: AgentRuleTypeGlobal } | { case: "fileGlobbed"; value: AgentRuleTypeFileGlobs } | { case: "agentFetched"; value: AgentRuleTypeAgentFetched } | { case: "manuallyAttached"; value: AgentRuleTypeManuallyAttached } | { case: undefined; value?: undefined };
  constructor(data?: PartialMessage<_AgentRuleType>) {
    super();
    this.type = { case: void 0 };
    proto3.util.initPartial(data, this as _AgentRuleType);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRuleType {
    return new _AgentRuleType().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRuleType {
    return new _AgentRuleType().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRuleType {
    return new _AgentRuleType().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRuleType | PlainMessage<_AgentRuleType> | undefined | null, b2: _AgentRuleType | PlainMessage<_AgentRuleType> | undefined | null): boolean {
    return proto3.util.equals(_AgentRuleType as unknown as MessageType<_AgentRuleType>, a, b2);
  }
})();
export type AgentRuleType = InstanceType<typeof AgentRuleType$Runtime>;
var AgentRuleType: MessageType<AgentRuleType> = AgentRuleType$Runtime as unknown as MessageType<AgentRuleType>;
(AgentRuleType as MutableMessageType<AgentRuleType>).runtime = proto3;
(AgentRuleType as MutableMessageType<AgentRuleType>).typeName = "agent.v1.AgentRuleType";
(AgentRuleType as MutableMessageType<AgentRuleType>).fields = proto3.util.newFieldList(() => [
  { no: 1, name: "global", kind: "message", T: AgentRuleTypeGlobal, oneof: "type" },
  { no: 2, name: "file_globbed", kind: "message", T: AgentRuleTypeFileGlobs, oneof: "type" },
  { no: 3, name: "agent_fetched", kind: "message", T: AgentRuleTypeAgentFetched, oneof: "type" },
  { no: 4, name: "manually_attached", kind: "message", T: AgentRuleTypeManuallyAttached, oneof: "type" }
]);
var AgentRule$Runtime = (() => class _AgentRule extends Message<_AgentRule> {
  declare fullPath: string;
  declare content: string;
  declare type?: AgentRuleType;
  declare source: AgentRuleSource;
  declare gitRemoteOrigin?: string;
  declare parseError?: string;
  declare environments: string[];
  declare disabledEnvironments: string[];
  declare plugin?: string;
  declare marketplace?: string;
  declare pluginId?: string;
  declare marketplaceId?: string;
  declare scopedTo: string[];
  declare frontmatter: string;
  declare isRequired?: boolean;
  constructor(data?: PartialMessage<_AgentRule>) {
    super();
    this.fullPath = "";
    this.content = "";
    this.source = AgentRuleSource.UNSPECIFIED;
    this.environments = [];
    this.disabledEnvironments = [];
    this.scopedTo = [];
    this.frontmatter = "";
    proto3.util.initPartial(data, this as _AgentRule);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _AgentRule {
    return new _AgentRule().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _AgentRule {
    return new _AgentRule().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _AgentRule {
    return new _AgentRule().fromJsonString(jsonString, options);
  }
  static equals(a: _AgentRule | PlainMessage<_AgentRule> | undefined | null, b2: _AgentRule | PlainMessage<_AgentRule> | undefined | null): boolean {
    return proto3.util.equals(_AgentRule as unknown as MessageType<_AgentRule>, a, b2);
  }
})();
export type AgentRule = InstanceType<typeof AgentRule$Runtime>;
var AgentRule: MessageType<AgentRule> = AgentRule$Runtime as unknown as MessageType<AgentRule>;
(AgentRule as MutableMessageType<AgentRule>).runtime = proto3;
(AgentRule as MutableMessageType<AgentRule>).typeName = "agent.v1.AgentRule";
(AgentRule as MutableMessageType<AgentRule>).fields = proto3.util.newFieldList(() => [
  {
    no: 1,
    name: "full_path",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  {
    no: 2,
    name: "content",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  { no: 3, name: "type", kind: "message", T: AgentRuleType },
  { no: 4, name: "source", kind: "enum", T: proto3.getEnumType(AgentRuleSource) },
  { no: 5, name: "git_remote_origin", kind: "scalar", T: 9, opt: true },
  { no: 6, name: "parse_error", kind: "scalar", T: 9, opt: true },
  { no: 7, name: "environments", kind: "scalar", T: 9, repeated: true },
  { no: 8, name: "disabled_environments", kind: "scalar", T: 9, repeated: true },
  { no: 9, name: "plugin", kind: "scalar", T: 9, opt: true },
  { no: 10, name: "marketplace", kind: "scalar", T: 9, opt: true },
  { no: 11, name: "plugin_id", kind: "scalar", T: 9, opt: true },
  { no: 12, name: "marketplace_id", kind: "scalar", T: 9, opt: true },
  { no: 13, name: "scoped_to", kind: "scalar", T: 9, repeated: true },
  {
    no: 14,
    name: "frontmatter",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  { no: 15, name: "is_required", kind: "scalar", T: 8, opt: true }
]);


export { AgentRuleSource, AgentRuleTypeGlobal, AgentRuleTypeFileGlobs, AgentRuleTypeAgentFetched, AgentRuleTypeManuallyAttached, AgentRuleType, AgentRule };
