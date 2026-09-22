// The clay style definition ships as JSON (`@dicebear/styles/clay.json`,
// CC0 1.0). `source/tsconfig.json` does not resolve JSON modules, and the
// definition is validated by `new Style(...)` at runtime, so it is typed as
// unknown here rather than by its 60 KB of schema.
declare module "@dicebear/styles/clay.json" {
  const definition: unknown;
  export default definition;
}
