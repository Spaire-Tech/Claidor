/**
 * Complete generated 0.18 module recovered from byte-identical
 * macOS and Windows immutable artifact regions. Do not hand-edit.
 * Evidence: src/app/dist/electron-main/main.cjs:16627-16754
 * Region SHA-256: 7da5db8d048cb083d81e13f72f0a828a110594896f34026b1e1c43ac212d031b
 * Atomic B1 exports: 2 messages + 1 enums = 3
 */
import { Message, proto3 } from "@bufbuild/protobuf";
import type { BinaryReadOptions, JsonReadOptions, JsonValue, MessageType, PartialMessage, PlainMessage } from "@bufbuild/protobuf";

type MutableMessageType<T extends Message<T>> = { -readonly [P in keyof MessageType<T>]: MessageType<T>[P] };

export type PackageType = 0 | 1 | 2 | 3 | 4;
var PackageType: {
  "UNSPECIFIED": 0;
  "SIMEON_PROJECT": 1;
  "SIMEON_PERSONAL": 2;
  "CLAUDE_SKILL": 3;
  "CLAUDE_PLUGIN": 4;
  0: "UNSPECIFIED";
  1: "SIMEON_PROJECT";
  2: "SIMEON_PERSONAL";
  3: "CLAUDE_SKILL";
  4: "CLAUDE_PLUGIN";
};
(function(PackageType2) {
  PackageType2[PackageType2["UNSPECIFIED"] = 0] = "UNSPECIFIED";
  PackageType2[PackageType2["SIMEON_PROJECT"] = 1] = "SIMEON_PROJECT";
  PackageType2[PackageType2["SIMEON_PERSONAL"] = 2] = "SIMEON_PERSONAL";
  PackageType2[PackageType2["CLAUDE_SKILL"] = 3] = "CLAUDE_SKILL";
  PackageType2[PackageType2["CLAUDE_PLUGIN"] = 4] = "CLAUDE_PLUGIN";
})(PackageType! || (PackageType = {} as typeof PackageType));
proto3.util.setEnumType(PackageType, "agent.v1.PackageType", [
  { no: 0, name: "PACKAGE_TYPE_UNSPECIFIED" },
  { no: 1, name: "PACKAGE_TYPE_SIMEON_PROJECT" },
  { no: 2, name: "PACKAGE_TYPE_SIMEON_PERSONAL" },
  { no: 3, name: "PACKAGE_TYPE_CLAUDE_SKILL" },
  { no: 4, name: "PACKAGE_TYPE_CLAUDE_PLUGIN" }
]);
var SimeonPackagePrompt$Runtime = (() => class _SimeonPackagePrompt extends Message<_SimeonPackagePrompt> {
  declare name: string;
  declare filePath: string;
  constructor(data?: PartialMessage<_SimeonPackagePrompt>) {
    super();
    this.name = "";
    this.filePath = "";
    proto3.util.initPartial(data, this as _SimeonPackagePrompt);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _SimeonPackagePrompt {
    return new _SimeonPackagePrompt().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _SimeonPackagePrompt {
    return new _SimeonPackagePrompt().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _SimeonPackagePrompt {
    return new _SimeonPackagePrompt().fromJsonString(jsonString, options);
  }
  static equals(a: _SimeonPackagePrompt | PlainMessage<_SimeonPackagePrompt> | undefined | null, b2: _SimeonPackagePrompt | PlainMessage<_SimeonPackagePrompt> | undefined | null): boolean {
    return proto3.util.equals(_SimeonPackagePrompt as unknown as MessageType<_SimeonPackagePrompt>, a, b2);
  }
})();
export type SimeonPackagePrompt = InstanceType<typeof SimeonPackagePrompt$Runtime>;
var SimeonPackagePrompt: MessageType<SimeonPackagePrompt> = SimeonPackagePrompt$Runtime as unknown as MessageType<SimeonPackagePrompt>;
(SimeonPackagePrompt as MutableMessageType<SimeonPackagePrompt>).runtime = proto3;
(SimeonPackagePrompt as MutableMessageType<SimeonPackagePrompt>).typeName = "agent.v1.SimeonPackagePrompt";
(SimeonPackagePrompt as MutableMessageType<SimeonPackagePrompt>).fields = proto3.util.newFieldList(() => [
  {
    no: 1,
    name: "name",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  {
    no: 2,
    name: "file_path",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  }
]);
var SimeonPackage$Runtime = (() => class _SimeonPackage extends Message<_SimeonPackage> {
  declare name: string;
  declare description: string;
  declare folderPath: string;
  declare enabled: boolean;
  declare parseError?: string;
  declare prompts: SimeonPackagePrompt[];
  declare readmeFilePath: string;
  declare packageType: PackageType;
  constructor(data?: PartialMessage<_SimeonPackage>) {
    super();
    this.name = "";
    this.description = "";
    this.folderPath = "";
    this.enabled = false;
    this.prompts = [];
    this.readmeFilePath = "";
    this.packageType = PackageType.UNSPECIFIED;
    proto3.util.initPartial(data, this as _SimeonPackage);
  }
  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): _SimeonPackage {
    return new _SimeonPackage().fromBinary(bytes, options);
  }
  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): _SimeonPackage {
    return new _SimeonPackage().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): _SimeonPackage {
    return new _SimeonPackage().fromJsonString(jsonString, options);
  }
  static equals(a: _SimeonPackage | PlainMessage<_SimeonPackage> | undefined | null, b2: _SimeonPackage | PlainMessage<_SimeonPackage> | undefined | null): boolean {
    return proto3.util.equals(_SimeonPackage as unknown as MessageType<_SimeonPackage>, a, b2);
  }
})();
export type SimeonPackage = InstanceType<typeof SimeonPackage$Runtime>;
var SimeonPackage: MessageType<SimeonPackage> = SimeonPackage$Runtime as unknown as MessageType<SimeonPackage>;
(SimeonPackage as MutableMessageType<SimeonPackage>).runtime = proto3;
(SimeonPackage as MutableMessageType<SimeonPackage>).typeName = "agent.v1.SimeonPackage";
(SimeonPackage as MutableMessageType<SimeonPackage>).fields = proto3.util.newFieldList(() => [
  {
    no: 1,
    name: "name",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  {
    no: 2,
    name: "description",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  {
    no: 3,
    name: "folder_path",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  {
    no: 4,
    name: "enabled",
    kind: "scalar",
    T: 8
    /* ScalarType.BOOL */
  },
  { no: 5, name: "parse_error", kind: "scalar", T: 9, opt: true },
  { no: 6, name: "prompts", kind: "message", T: SimeonPackagePrompt, repeated: true },
  {
    no: 7,
    name: "readme_file_path",
    kind: "scalar",
    T: 9
    /* ScalarType.STRING */
  },
  { no: 8, name: "package_type", kind: "enum", T: proto3.getEnumType(PackageType) }
]);


export { PackageType, SimeonPackagePrompt, SimeonPackage };
