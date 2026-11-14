/**
 * Prompt trees: how an element is made from a type and its props, and how a
 * tree of elements, texts and lists becomes the text sent to a model.
 */
export const part = "packages/prompt-jsx";
export const modules = {
  runtime: "source/packages/prompt-jsx/jsx-runtime.ts",
  components: "source/packages/prompt-jsx/components.ts",
  render: "source/packages/prompt-jsx/render.ts",
};

/** Each case under its own words: what it gave back, or the error it threw. */
function table(cases) {
  const answers = {};
  for (const [words, ask] of cases) {
    if (Object.hasOwn(answers, words)) throw new Error(`two cases are named "${words}"`);
    try {
      answers[words] = ask();
    } catch (error) {
      answers[words] = { threw: error };
    }
  }
  return answers;
}

/** The part's makers and its renderer, with short hands for the elements the engine's prompts are made of. */
function kit({ runtime, render }) {
  const { jsx, jsxs, Fragment } = runtime;
  const { renderContent } = render;
  const made = (type) => (children, props) => jsx(type, { ...props, children });
  return {
    jsx,
    jsxs,
    Fragment,
    renderContent,
    /** An element written by hand, as a caller that does not go through `jsx` would write it. */
    byHand: (type, props) => ({ type, props }),
    p: made("p"),
    li: made("li"),
    ul: made("ul"),
    ol: made("ol"),
    pre: made("pre"),
    br: () => jsx("br", {}),
    h: (level, children) => jsx(`h${level}`, { children }),
    x: (tag, children, attributes) => jsx("x", { tag, ...attributes, children }),
    section: (title, children, attributes) => jsx("section", { title, ...attributes, children }),
    together: (children) => jsxs(Fragment, { children }),
    /** The text each node renders as, under the case's words. */
    texts: (cases) => table(cases.map(([words, node, options]) => [words, () => (options === undefined ? renderContent(node) : renderContent(node, options))])),
  };
}

export const scenarios = [
  // ---- Making elements -------------------------------------------------
  {
    name: "what the part exports: three makers of elements, five named components and their list, one renderer",
    run: ({ runtime, components, render }) => {
      const about = (made) => ({ name: made.name, parameters: made.length, hasPrototype: Object.hasOwn(made, "prototype") });
      const { builtinComponents } = components;
      return {
        jsx: about(runtime.jsx),
        jsxs: about(runtime.jsxs),
        Fragment: about(runtime.Fragment),
        System: about(components.System),
        User: about(components.User),
        Assistant: about(components.Assistant),
        Tool: about(components.Tool),
        Conversation: about(components.Conversation),
        renderContent: about(render.renderContent),
        namesInTheList: Object.keys(builtinComponents),
        theListHoldsTheExportsThemselves: Object.entries(builtinComponents).map(([name, made]) => made === (name === "Fragment" ? runtime.Fragment : components[name])),
        theListIsAPlainOpenObject: [Object.getPrototypeOf(builtinComponents) === Object.prototype, Object.isFrozen(builtinComponents)],
      };
    },
  },
  {
    name: "an element holds its type, its props with the children in them, and the children once more",
    run: (modules) => {
      const { jsx, jsxs } = kit(modules);
      function Greeting() {
        return "hello";
      }
      return table([
        ["a text as children becomes a list of one", () => jsx("p", { children: "text" })],
        ["a number as children becomes a list of one", () => jsx("p", { children: 7 })],
        ["a list of children stays a list", () => jsxs("p", { children: ["a", "b"] })],
        ["one element as children becomes a list of one", () => jsx("ul", { children: jsx("li", { children: "item" }) })],
        ["no children: the field is there, undefined", () => jsx("br", {})],
        ["props given as null", () => jsx("br", null)],
        ["props given as undefined", () => jsx("br", undefined)],
        ["no props given", () => jsx("br")],
        ["other props keep their order and the children come last", () => jsx("x", { tag: "rule", name: "/a.md" })],
        ["children given first stay first", () => jsx("section", { children: "c", title: "t", description: "d" })],
        ["children given in the middle stay in the middle", () => jsx("section", { title: "t", children: "c", description: "d" })],
        ["a function as type is kept as it is", () => jsx(Greeting, { to: "Ada" })],
        ["any value is taken as type: a number", () => jsx(7, {})],
        ["any value is taken as type: nothing", () => jsx(undefined, {})],
        ["jsxs makes the same element", () => jsxs("section", { title: "t", children: ["a", jsx("br", {})] })],
      ]);
    },
  },
  {
    name: "children that are nothing are left out: null, undefined, true, false and the empty text; zero, NaN, a space and inner lists stay",
    run: (modules) => {
      const { jsx, jsxs } = kit(modules);
      return table([
        ["nothings between texts are left out", () => jsxs("p", { children: ["a", null, "b", undefined, true, "c", false, "", "d"] }).children],
        ["zero, minus zero, NaN, a space, an empty list and a list of nothings stay", () => jsxs("p", { children: [0, -0, Number.NaN, " ", [], [null, "", false]] }).children],
        ["an object that is no element stays", () => jsxs("p", { children: [{}, { type: "br" }] }).children],
        ["only nothings: no children", () => jsxs("p", { children: [null, false, "", undefined, true] })],
        ["an empty list: no children", () => jsxs("p", { children: [] })],
        ["a lone true: no children", () => jsx("p", { children: true })],
        ["a lone space is a child", () => jsx("p", { children: " " })],
        ["a lone empty list is a child, in a list", () => jsxs("p", { children: [[]] }).children],
        ["a lone object is a child", () => jsx("p", { children: { any: "thing" } }).children],
      ]);
    },
  },
  {
    name: "children that are empty, zero, NaN, false or null give way to the arguments after the props, which jsxs never reads",
    run: (modules) => {
      const { jsx, jsxs } = kit(modules);
      return table([
        ["an empty text gives way to the argument after", () => jsx("li", { children: "" }, "the-key").children],
        ["zero gives way to the argument after", () => jsx("li", { children: 0 }, 3).children],
        ["zero with nothing after: no children", () => jsx("li", { children: 0 }).children],
        ["NaN with nothing after: no children", () => jsx("li", { children: Number.NaN }).children],
        ["false gives way, and the arguments after lose their nothings", () => jsx("li", { children: false }, "a", null, "b", "", true, 0, undefined).children],
        ["null gives way", () => jsx("li", { children: null }, 1, 2).children],
        ["no children in the props: the arguments after are the children", () => jsx("li", { title: "t" }, "a", "b")],
        ["no props: the arguments after are the children", () => jsx("li", null, "a", "b")],
        ["a list after the props stays one child", () => jsx("li", undefined, ["inner", "list"]).children],
        ["children that are there win over the arguments after", () => jsx("li", { children: "kept" }, "not read").children],
        ["an empty list of children wins too, and leaves none", () => jsx("li", { children: [] }, "not read").children],
        ["a list of nothings wins too, and leaves none", () => jsx("li", { children: [null, ""] }, "not read").children],
        ["jsxs with an empty text and an argument after: no children", () => jsxs("li", { children: "" }, "the-key").children],
        ["jsxs with children and an argument after", () => jsxs("li", { children: ["a"] }, "the-key").children],
        ["jsxs with no props' children and arguments after: no children", () => jsxs("li", {}, "a", "b").children],
      ]);
    },
  },
  {
    name: "the element's children and its props' children are one list, never the list given, and the props given are left as they were",
    run: (modules) => {
      const { jsx } = kit(modules);
      const given = ["a", null, "b"];
      const props = { title: "t", children: given };
      const made = jsx("section", props);
      const again = jsx("section", props);
      const bare = {};
      const empty = jsx("br", bare);
      const clean = ["a", "b"];
      const fromClean = jsx("p", { children: clean });
      return {
        theChildrenAreThePropsChildren: made.children === made.props.children,
        theChildrenAreTheListGiven: [made.children === given, fromClean.children === clean],
        thePropsAreThePropsGiven: made.props === props,
        theListGivenAfterwards: given,
        thePropsGivenAfterwards: [Object.keys(props), props.children === given],
        aSecondCallGivesTheSameList: again.children === made.children,
        keysOfTheElement: Object.keys(made),
        keysOfItsProps: Object.keys(made.props),
        withoutChildren: { element: Object.keys(empty), props: Object.keys(empty.props), given: Object.keys(bare) },
        nothingIsFrozen: [Object.isFrozen(made), Object.isFrozen(made.props), Object.isFrozen(made.children)],
      };
    },
  },
  {
    name: "props are copied field by field: getters are read, once for the children and once for the copy, symbols kept, hidden and inherited fields left, a __proto__ field followed",
    run: (modules) => {
      const { jsx } = kit(modules);
      const reads = [];
      const watched = {
        get title() {
          reads.push("title");
          return "t";
        },
        get children() {
          reads.push("children");
          return "c";
        },
        get name() {
          reads.push("name");
          return "n";
        },
      };
      const fromGetters = jsx("section", watched);
      const mark = Symbol.for("recorded mark");
      const hidden = Object.defineProperty({ shown: 1 }, "hidden", { value: 2, enumerable: false });
      const inherited = Object.create({ inherited: "x", children: "from above" });
      inherited.own = "y";
      const followed = jsx("section", JSON.parse('{"__proto__": {"reached": "through the copy"}, "title": "t"}'));
      return {
        getters: { reads, props: fromGetters.props, title: Object.getOwnPropertyDescriptor(fromGetters.props, "title") },
        symbol: jsx("p", { [mark]: "kept" }).props[mark],
        hidden: Object.keys(jsx("p", hidden).props),
        inherited: jsx("p", inherited),
        protoField: {
          keys: Object.keys(followed.props),
          ownField: Object.hasOwn(followed.props, "__proto__"),
          reached: followed.props.reached,
          stillAPlainObject: Object.getPrototypeOf(followed.props) === Object.prototype,
        },
      };
    },
  },
  {
    name: "props that are not an object: a text is copied letter by letter, a list item by item, a number or true gives none, and what is false counts as no props",
    run: (modules) => {
      const { jsx } = kit(modules);
      return table([
        ["a text", () => jsx("p", "abc")],
        ["a list", () => jsx("p", ["a", "b"])],
        ["a number", () => jsx("p", 7)],
        ["true", () => jsx("p", true)],
        ["zero", () => jsx("p", 0)],
        ["an empty text", () => jsx("p", "")],
        ["false, with arguments after", () => jsx("p", false, "a")],
      ]);
    },
  },
  {
    name: "Fragment makes an element named Fragment from its props, and reads no other argument",
    run: (modules) => {
      const { Fragment } = kit(modules);
      return table([
        ["a list of children", () => Fragment({ children: ["a", "b"] })],
        ["one child", () => Fragment({ children: "one" })],
        ["nothings left out", () => Fragment({ children: ["a", null, "", false, "b"] })],
        ["no children", () => Fragment({})],
        ["other props are kept", () => Fragment({ key: "k", children: "c" })],
        ["props given as null", () => Fragment(null)],
        ["no props", () => Fragment()],
        ["an argument after the props is not read", () => Fragment({ children: "" }, "after")],
      ]);
    },
  },
  {
    name: "each named component makes an element of its own name from its props; Conversation makes one whose type is Fragment itself",
    run: ({ components, runtime }) => {
      const { System, User, Assistant, Tool, Conversation } = components;
      const conversation = Conversation({ children: ["a", null, "b"] });
      return table([
        ["System", () => System({ name: "rules", children: "Be brief." })],
        ["User without children", () => User({})],
        ["Assistant, its nothings left out", () => Assistant({ children: ["a", null, "", "b"] })],
        ["Tool with its call id", () => Tool({ tool_call_id: "call_1", name: "search", children: "found" })],
        ["Conversation", () => conversation],
        ["Conversation's type is Fragment itself", () => conversation.type === runtime.Fragment],
        ["props given as null", () => [System(null), User(null), Assistant(null), Tool(null), Conversation(null)]],
        ["an argument after the props is not read", () => [System({ children: "" }, "after"), Conversation({ children: "" }, "after")]],
      ]);
    },
  },

  // ---- Rendering: plain values ------------------------------------------
  {
    name: "nothing renders as nothing; a text or a number alone renders as it is, spaces and all",
    run: (modules) => {
      const { texts } = kit(modules);
      return texts([
        ["null", null],
        ["undefined", undefined],
        ["true", true],
        ["false", false],
        ["an empty text", ""],
        ["a text", "Plain text."],
        ["a text with spaces around and runs of spaces inside", "  spaced   out  "],
        ["a text of lines", "\n\nfirst\n  second\n\n"],
        ["only spaces", "   "],
        ["zero", 0],
        ["minus zero", -0],
        ["a whole number", 42],
        ["a fraction", 1.5],
        ["a negative number", -3],
        ["a very large number", 1e21],
        ["NaN", Number.NaN],
        ["infinity", Number.POSITIVE_INFINITY],
      ]);
    },
  },
  {
    name: "a list of texts is one paragraph: runs of spaces become one space, the ends are trimmed, tabs and inner newlines stay",
    run: (modules) => {
      const { texts } = kit(modules);
      return texts([
        ["an empty list", []],
        ["an empty text", [""]],
        ["only spaces", ["   "]],
        ["one word", ["word"]],
        ["texts are joined with nothing between", ["a", "b", "c"]],
        ["spaces at the joints become one", ["a ", " b"]],
        ["runs of spaces inside become one, the ends are trimmed", ["  a   b    c  "]],
        ["tabs are kept", ["a\t\tb"]],
        ["a tab at the ends is trimmed", ["\ta\t"]],
        ["the indentation of a later line shrinks to one space", ["first\n    second\n        third"]],
        ["an empty line between lines is kept", ["first\n\nsecond"]],
        ["newlines at the start are trimmed", ["\n\nword"]],
        ["newlines at the end are cut", ["word\n\n"]],
        ["spaces before a last newline are trimmed", ["word   \n"]],
        ["spaces after a last newline are trimmed with it", ["word\n   "]],
        ["only a newline", ["\n"]],
        ["only newlines and spaces", [" \n \n "]],
        ["spaces that do not break are trimmed at the ends, kept inside", [" a  b "]],
        ["a text of several lines", ["Line one.\nLine two.\n", "Line three."]],
        ["carriage returns inside are kept", ["first\r\nsecond\r\n\r\nthird"]],
        ["a carriage return before the last newline is trimmed", ["word\r\n"]],
      ]);
    },
  },
  {
    name: "in a list, nothings are passed over, inner lists are opened however deep, numbers are written out",
    run: (modules) => {
      const { texts } = kit(modules);
      return texts([
        ["nothings between texts", ["a", null, undefined, true, false, "b"]],
        ["only nothings", [null, undefined, true, false]],
        ["numbers", ["step ", 1, " of ", 2.5]],
        ["zero is written", [0]],
        ["zero between texts", ["a", 0, "b"]],
        ["NaN is written", [Number.NaN]],
        ["inner lists", [["a", ["b", ["c"]]], "d"]],
        ["inner lists of nothings", [[null, [false, []]], []]],
        ["an empty text between texts", ["a", "", "b"]],
      ]);
    },
  },
  {
    name: "a gap in a list is read as nothing, wherever the list stands",
    run: (modules) => {
      const { texts, byHand } = kit(modules);
      const gapped = ["a"];
      gapped[2] = "b";
      return texts([
        ["alone", gapped],
        ["in a list", ["[", gapped, "]"]],
        ["as a paragraph's children", byHand("p", { children: gapped })],
        ["as pre's children", byHand("pre", { children: gapped })],
        ["as a dash list's children", byHand("ul", { children: gapped })],
        ["as a numbered list's children", byHand("ol", { children: gapped })],
        ["as an item's children", byHand("ul", { children: byHand("li", { children: gapped }) })],
        ["as a Conversation's children", byHand("Conversation", { children: gapped })],
        ["as a Fragment's children", ["[", byHand("Fragment", { children: gapped }), "]"]],
      ]);
    },
  },
  {
    name: "what is not a node is refused: an object without a type, a big number, a symbol, a function, a date",
    run: (modules) => {
      const { texts, jsx } = kit(modules);
      const things = [
        ["an empty object", {}],
        ["an object with props and no type", { props: { children: "text" } }],
        ["a big number", 10n],
        ["a symbol", Symbol("mark")],
        ["a function", () => "text"],
        ["a date", new Date(0)],
      ];
      return texts([
        ...things.map(([words, thing]) => [`${words}, alone`, thing]),
        ...things.map(([words, thing]) => [`${words}, in a list`, ["before", thing, "after"]]),
        ...things.map(([words, thing]) => [`${words}, in a paragraph`, jsx("p", { children: thing })]),
        ...things.map(([words, thing]) => [`${words}, in a list of items`, jsx("ul", { children: [thing] })]),
        ...things.map(([words, thing]) => [`${words}, in an item`, jsx("ul", { children: jsx("li", { children: [thing] }) })]),
        ...things.map(([words, thing]) => [`${words}, in a Conversation`, jsx("Conversation", { children: [thing] })]),
      ]);
    },
  },
  {
    name: "an element whose type is neither a name nor a function is refused, in the words of the place that meets it first",
    run: (modules) => {
      const { texts, byHand, jsx } = kit(modules);
      const types = [
        ["a number", 5],
        ["null", null],
        ["undefined", undefined],
        ["true", true],
        ["an object", {}],
        ["a symbol", Symbol("mark")],
        ["a list holding a heading's name", ["h2"]],
        ["a list holding a paragraph's name", ["p"]],
      ];
      const inherited = Object.create({ type: "br", props: {} });
      return texts([
        ...types.map(([words, type]) => [`${words}, alone`, byHand(type, { children: "text" })]),
        ...types.map(([words, type]) => [`${words}, in a list`, ["before", byHand(type, { children: "text" }), "after"]]),
        ...types.map(([words, type]) => [`${words}, in a list of items`, jsx("ul", { children: [byHand(type, { children: "text" })] })]),
        ...types.map(([words, type]) => [`${words}, in a Conversation`, jsx("Conversation", { children: [byHand(type, { children: "text" })] })]),
        ["a type that comes from the object's prototype counts, alone", inherited],
        ["a type that comes from the object's prototype counts, in a list", ["a", inherited, "b"]],
      ]);
    },
  },
  {
    name: "an element without props fails where its props are first read, and not where they are never read",
    run: (modules) => {
      const { texts, byHand, jsx } = kit(modules);
      const names = ["p", "h2", "x", "section", "ul", "ol", "li", "pre", "br", "Fragment", "System", "User", "Assistant", "Tool", "Conversation", "Widget"];
      return texts([
        ...names.map((name) => [`${name}, alone`, byHand(name)]),
        ...names.map((name) => [`${name}, with null for props`, byHand(name, null)]),
        ...names.map((name) => [`${name}, in a list`, ["a", byHand(name), "b"]]),
        ...names.map((name) => [`${name}, in a list of items`, jsx("ul", { children: [byHand(name)] })]),
        ...names.map((name) => [`${name}, in an item`, jsx("ul", { children: jsx("li", { children: ["a", byHand(name)] }) })]),
        ...names.map((name) => [`${name}, in pre`, jsx("pre", { children: ["a", byHand(name), "b"] })]),
        ...names.map((name) => [`${name}, in a Conversation`, jsx("Conversation", { children: ["a", byHand(name), "b"] })]),
        ["a function, called with the props that are not there", byHand((props) => `given ${String(props)}`)],
      ]);
    },
  },

  // ---- Rendering: each element alone -------------------------------------
  {
    name: "a paragraph is its children: written by hand its text is left as it is, made with jsx it is one paragraph",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, p, br } = kit(modules);
      return texts([
        ["by hand, a text", byHand("p", { children: "  spaced   out  " })],
        ["by hand, a number", byHand("p", { children: 12 })],
        ["by hand, nothing", byHand("p", {})],
        ["by hand, true", byHand("p", { children: true })],
        ["by hand, a list", byHand("p", { children: ["  spaced   ", "out  "] })],
        ["by hand, an element", byHand("p", { children: byHand("p", { children: "  inner  " }) })],
        ["with jsx, a text", jsx("p", { children: "  spaced   out  " })],
        ["with jsx, no children", jsx("p", {})],
        ["with jsx, texts and numbers", jsxs("p", { children: ["OS Version: ", "linux ", 6, ".", 18] })],
        ["with jsx, a line break inside", jsxs("p", { children: ["Workspace Paths:", br(), "- /a\n- /b"] })],
        ["a paragraph in a paragraph", p(p("inner"))],
        ["paragraphs in a paragraph, then text", p([p("one"), p("two"), "tail"])],
        ["other props change nothing", jsx("p", { title: "t", key: "k", children: "text" })],
        ["by hand: only the children in the props are read", { type: "p", props: { children: "from the props" }, children: ["from the element"] }],
      ]);
    },
  },
  {
    name: "a heading is one to six hashes, a space and its trimmed text; h0, h7 and H1 are no headings; a heading without text is nothing",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, h, p, br } = kit(modules);
      return texts([
        ...[1, 2, 3, 4, 5, 6].map((level) => [`level ${level}`, h(level, "Title")]),
        ...["h0", "h7", "h10", "h", "H1", "h1 ", "heading"].map((name) => [`"${name}" is no heading`, jsx(name, { children: "Title" })]),
        ...["h0", "h7", "H1"].map((name) => [`"${name}" in a list is no heading`, ["a", jsx(name, { children: "Title" })]]),
        ["no text", h(2)],
        ["only spaces, by hand", byHand("h2", { children: "   " })],
        ["only spaces, with jsx", h(2, "   ")],
        ["by hand: the ends are trimmed, the inside left", byHand("h2", { children: "  spaced   out  " })],
        ["with jsx: runs of spaces inside become one", h(2, "  spaced   out  ")],
        ["by hand, a number", byHand("h1", { children: 0 })],
        ["texts and a number", jsxs("h3", { children: ["Step ", 2, ": Form a plan"] })],
        ["a line break inside", jsxs("h2", { children: ["first", br(), "second"] })],
        ["paragraphs inside", jsxs("h2", { children: [p("first"), p("second")] })],
        ["a heading in a heading", h(1, h(2, "inner"))],
        ["between paragraphs", [p("before"), h(2, "Title"), p("after")]],
        ["an empty heading between paragraphs leaves no gap", [p("before"), h(2), p("after")]],
        ["after a text", ["intro", h(3, "Title")]],
      ]);
    },
  },
  {
    name: "a line break is a newline wherever it stands, whatever it is given",
    run: (modules) => {
      const { texts, byHand, jsx, br, p, h, li, ul, pre } = kit(modules);
      return texts([
        ["alone", br()],
        ["alone, by hand without props", byHand("br")],
        ["alone, with children", jsx("br", { children: "not shown" })],
        ["between texts", ["a", br(), "b"]],
        ["two between texts", ["a", br(), br(), "b"]],
        ["spaces around it stay, one each side", ["a   ", br(), "   b"]],
        ["in a paragraph", p(["a", br(), "b"])],
        ["in a heading", h(2, ["a", br(), "b"])],
        ["in an item", ul(li(["a", br(), "b"]))],
        ["in pre", pre(["a", br(), "b"])],
        ["as a list's only child", ul(br())],
        ["by hand with children, in pre", pre(["a", byHand("br", { children: "not shown" }), "b"])],
      ]);
    },
  },
  {
    name: "an x element is a tag: its tag or x, its attributes, its content between as it is, and no content closes it at once",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, x, p, br, li, ul } = kit(modules);
      return texts([
        ["a tag with content", x("agent_skill", "Writes release notes.", { fullPath: "/skills/notes/SKILL.md" })],
        ["a tag without content", x("agent_skill", undefined, { fullPath: "/skills/notes/SKILL.md" })],
        ["no tag: x", jsx("x", { children: "content" })],
        ["no tag, no content", jsx("x", {})],
        ["an empty tag: x", x("", "content")],
        ["zero as tag: x", x(0, "content")],
        ["null as tag: x", x(null, "content")],
        ["false as tag: x", x(false, "content")],
        ["a number as tag", x(5, "content")],
        ["true as tag", x(true, "content")],
        ["a tag with spaces and capitals is left as it is", x("My Tag", "content")],
        ["by hand, the content is left as it is", byHand("x", { tag: "t", children: "  spaced   out  " })],
        ["by hand, only spaces: no content", byHand("x", { tag: "t", children: "   " })],
        ["by hand, a newline only: no content", byHand("x", { tag: "t", children: "\n" })],
        ["by hand, a number", byHand("x", { tag: "t", children: 0 })],
        ["with jsx, the content is one paragraph", x("t", "  spaced   out  ")],
        ["with jsx, only spaces: no content", x("t", "   ")],
        ["several texts", jsxs("x", { tag: "always_applied_workspace_rule", name: "/repo/.rules/style.md", children: ["Use tabs.", ", glob pattern(s) for applicable files: *.ts, *.tsx"] })],
        ["lines of content keep their newlines", x("example", "git commit -m \"$(cat <<'EOF'\n   Commit message here.\n\n   EOF\n   )\"")],
        ["paragraphs inside", x("t", [p("one"), p("two")])],
        ["a line break inside", x("t", ["a", br(), "b"])],
        ["a list inside", x("t", ul([li("one"), li("two")]))],
        ["a tag in a tag", x("outer", x("inner", "content"))],
        ["an empty tag in a tag", x("outer", x("inner"))],
        ["the key is no attribute, the title is", jsx("x", { tag: "t", key: "k", title: "shown", children: "content" })],
        ["in a list, set apart as a block and trimmed", ["before", byHand("x", { tag: "t", children: "  inside  " }), "after"]],
        ["two in a row", [x("a", "one"), x("b", "two")]],
      ]);
    },
  },
  {
    name: "attributes are written in the order given: a text in quotes with its own quotes as &quot;, true as the bare name, and false, null and undefined left out",
    run: (modules) => {
      const { texts, jsx } = kit(modules);
      const every = {
        text: "plain",
        quoted: 'say "hi", then "bye"',
        marks: "a & b < c > d 'e'",
        number: 12,
        zero: 0,
        nan: Number.NaN,
        emptyText: "",
        yes: true,
        no: false,
        nothing: null,
        missing: undefined,
        list: ["a", "b"],
        emptyList: [],
        object: { a: 1 },
        ownWords: { toString: () => 'made "by" toString' },
        big: 10n,
        mark: Symbol("mark"),
        "data-with-dash": "dash",
        "with space": "space",
        "": "nameless",
        2: "two",
        1: "one",
        lines: "first\nsecond",
        key: "never shown",
      };
      return texts([
        ["every kind, on x with content", jsx("x", { tag: "t", ...every, title: "shown on x", children: "content" })],
        ["every kind, on x without content", jsx("x", { tag: "t", ...every, title: "shown on x" })],
        ["every kind, on a section with content", jsx("section", { title: "t", ...every, tag: "shown on a section", children: "content" })],
        ["every kind, on a section without content", jsx("section", { title: "t", ...every, tag: "shown on a section" })],
        ["only what is left out, on x", jsx("x", { no: false, nothing: null, missing: undefined, key: 1 })],
        ["only what is left out, on a section", jsx("section", { title: "t", no: false, nothing: null, missing: undefined, key: 1 })],
        ["true, false, then a text: one space between what is written", jsx("x", { first: true, second: false, third: "3" })],
        ["false first: no space before what follows", jsx("section", { title: "t", first: false, second: true })],
        ["a nameless attribute that is true is not written, on x", jsx("x", { "": true })],
        ["a nameless attribute that is true leaves no gap, on x", jsx("x", { before: true, "": true, after: "a", children: "content" })],
        ["a nameless attribute that is true leaves no gap, on a section", jsx("section", { title: "t", before: true, "": true, after: "a" })],
        ["a description, as the engine gives one", jsx("section", { title: "available_skills", description: "Skills the agent can use. Use the Read tool with the provided absolute path to fetch full contents.", children: "content" })],
      ]);
    },
  },
  {
    name: "a section is a tag named after its title, lower case with a dash for each run of white space, its content on lines of its own",
    run: (modules) => {
      const { texts, byHand, jsx, section, p, br, ul, li } = kit(modules);
      return texts([
        ...[
          ["a name with underscores", "user_info"],
          ["words", "Committing changes with git"],
          ["capitals", "MiXed CASE"],
          ["spaces around and runs inside", "  Padded   Title "],
          ["tabs and newlines", "Tabs\tand\nlines \n here"],
          ["a number", 5],
          ["an empty title", ""],
          ["null", null],
          ["true", true],
          ["a list", ["a b", "c"]],
          ["marks are left alone", "a<b>&\"c\""],
          ["a space that does not break is white space too", "a\u00a0b"],
        ].map(([words, title]) => [`title: ${words}`, section(title, "content")]),
        ["no title: the tag is named undefined", jsx("section", { children: "content" })],
        ["no title, no content", jsx("section", {})],
        ["no content", section("empty")],
        ["by hand, the content is left as it is between the lines", byHand("section", { title: "t", children: "  spaced   out  " })],
        ["by hand, only spaces: no content", byHand("section", { title: "t", children: "   " })],
        ["by hand, a number", byHand("section", { title: "t", children: 0 })],
        ["with jsx, the content is one paragraph", section("t", "  spaced   out  ")],
        ["paragraphs inside", section("t", [p("one"), p("two")])],
        ["a line break as the only content: no content", section("t", br())],
        ["a list inside", section("t", ul([li("one"), li("two")]))],
        ["a section in a section", section("outer", section("inner", "content"))],
        ["an empty section in a section", section("outer", section("inner"))],
        ["sections in a section, with text", section("outer", ["intro", section("first", "one"), section("second", "two"), "outro"])],
        ["the key is no attribute, the tag is", jsx("section", { title: "t", key: "k", tag: "shown", children: "content" })],
        ["in a list, set apart as a block", ["before", section("t", "inside"), "after"]],
        ["two in a row", [section("a", "one"), section("b", "two")]],
      ]);
    },
  },
  {
    name: "a section reads its title, then renders its children, then writes its attributes; an x element renders its children, then writes its attributes",
    run: (modules) => {
      const { jsx, renderContent } = kit(modules);
      const order = (type) => {
        const log = [];
        const saying = (words) => ({
          toString() {
            log.push(words);
            return words;
          },
        });
        const Child = () => {
          log.push("the child is called");
          return "content";
        };
        const text = renderContent(jsx(type, { first: saying("first attribute"), title: saying("The Title"), children: jsx(Child, {}), second: saying("second attribute") }));
        return { text, log };
      };
      return { section: order("section"), x: order("x") };
    },
  },
  {
    name: "pre keeps its text as it is, spaces and newlines, and of the elements in it only their text",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, Fragment, pre, p, br, li, ul, ol, x, section, h, together } = kit(modules);
      const Words = (props) => `  words for ${props.who}  `;
      const Wrapped = () => p("  from a component  ");
      const Nothing = () => null;
      return texts([
        ["a text, as it is", pre("  two  spaces\n\tand a tab  \n")],
        ["by hand, a text", byHand("pre", { children: "  as it is  " })],
        ["by hand, a number", byHand("pre", { children: 0 })],
        ["by hand, true", byHand("pre", { children: true })],
        ["no children", pre()],
        ["texts, numbers, nothings and inner lists run together", jsxs("pre", { children: ["a ", 1, [null, true, " b", ["c", false]], 0] })],
        ["a line break is a newline", pre(["a", br(), br(), "b"])],
        ["a Fragment by name", pre(["a", jsx("Fragment", { children: [" b ", br()] }), "c"])],
        ["a Fragment by function", pre(["a", together([" b ", br()]), "c"])],
        ["a Fragment without children", pre(["a", jsx(Fragment, {}), jsx("Fragment", {}), "c"])],
        ["a component that returns a text", pre(jsx(Words, { who: "Ada" }))],
        ["a component that returns an element", pre(["[", jsx(Wrapped, {}), "]"])],
        ["a component that returns nothing", pre(["[", jsx(Nothing, {}), "]"])],
        ["a paragraph gives its text, untouched", pre(byHand("p", { children: "  para  " }))],
        ["a tag gives its content, without the tag", pre(x("t", "tag text", { attribute: "lost" }))],
        ["a section gives its content, without the tag", pre(section("s", "section text"))],
        ["a heading gives its text, without the hashes", pre(h(2, "Head"))],
        ["items give their texts, without dashes or newlines", pre(ul([li("one"), li("two")]))],
        ["a numbered list gives its texts, without numbers", pre(ol([li("one"), li("two")]))],
        ["a message gives its content", pre(jsx("User", { children: "said" }))],
        ["a name the part does not know gives its children, and is not looked up", pre(jsx("Widget", { children: "inside" }))],
        ["pre in pre", pre(["a ", pre(" b "), " c"])],
        ["everything at once", pre(["x = 1", br(), p("  y = 2"), br(), x("t", ["  z", " = 3"])])],
        ["an object without a type", pre([{}])],
        ["a big number", pre([10n])],
      ]);
    },
  },
  {
    name: "pre among other nodes is a paragraph that is not trimmed, and counts as one even when empty",
    run: (modules) => {
      const { texts, pre, p } = kit(modules);
      return texts([
        ["after a text", ["Run:", pre("  npm test\n    --watch")]],
        ["between texts", ["a", pre("  code  "), "b"]],
        ["between paragraphs", [p("a"), pre("  code  "), p("b")]],
        ["ending in a newline: what follows is on the next line", [pre("code\n"), "b"]],
        ["ending in a newline, then a paragraph", [pre("code\n"), p("b")]],
        ["ending in two newlines", [pre("code\n\n"), "b"]],
        ["empty, between texts", ["a", pre(""), "b"]],
        ["empty, first", [pre(""), "b"]],
        ["empty, last", ["a", pre("")]],
        ["only spaces, between texts", ["a", pre("  "), "b"]],
        ["only spaces, first", [pre("  "), "b"]],
        ["only a newline, between texts", ["a", pre("\n"), "b"]],
        ["only a newline, first", [pre("\n"), "b"]],
        ["two newlines, between texts", ["a", pre("\n\n"), "b"]],
        ["two in a row", [pre(" a "), pre(" b ")]],
        ["alone in a list: its spaces stay", [pre("  code  ")]],
        ["alone in a list: newlines at its ends are cut with the whole's", [pre("\n\n  code\n\n")]],
        ["in a paragraph", p(["a", pre("  code  "), "b"])],
      ]);
    },
  },

  // ---- Rendering: paragraphs ----------------------------------------------
  {
    name: "blocks in a list are paragraphs, set apart by one empty line; empty blocks and stray spaces between blocks are dropped",
    run: (modules) => {
      const { texts, jsx, p, h, ul, ol, li, x, section, pre } = kit(modules);
      return texts([
        ["two paragraphs", [p("one"), p("two")]],
        ["text, a paragraph, text", ["before", p("inside"), "after"]],
        ["every kind of block", ["text", p("paragraph"), h(2, "Heading"), ul(li("item")), ol(li("numbered")), x("tag", "tagged"), section("part", "inside"), pre("as it is")]],
        ["the text before a block is closed as a paragraph of its own", ["a ", "b ", p("c"), " d", " e"]],
        ["empty paragraphs are dropped", [p("one"), p(), p("   "), p([null, false]), p("two")]],
        ["an empty heading and empty lists are dropped", [p("one"), h(2), ul(), ol(), ul(li()), p("two")]],
        ["an empty tag and an empty section are written", [p("one"), jsx("x", {}), section("s"), p("two")]],
        ["spaces between blocks are dropped", [p("one"), "   ", p("two")]],
        ["a tab between blocks is dropped", [p("one"), "\t", p("two")]],
        ["a newline text between blocks is kept as it is", [p("one"), "\n", p("two")]],
        ["a block's own ends are trimmed", [x("a", "one"), "  ", jsx("x", { tag: "b", children: "two" })]],
        ["one block alone", [p("one")]],
        ["only empty blocks", [p(), h(1), ul()]],
        ["a list in a list of blocks", [[p("one"), [p("two")]], p("three")]],
      ]);
    },
  },
  {
    name: "a text that ends in a newline takes what follows on the next line, with no empty line between",
    run: (modules) => {
      const { texts, p, br, x, section, ul, li, h } = kit(modules);
      return texts([
        ["a text, a line break, a paragraph", ["label:", br(), p("value")]],
        ["a text, two line breaks, a paragraph", ["label:", br(), br(), p("value")]],
        ["a text ending in a newline, a paragraph", ["label:\n", p("value")]],
        ["a text, a line break, a tag", ["label:", br(), x("t", "value")]],
        ["a text, a line break, a section", ["label:", br(), section("s", "value")]],
        ["a text, a line break, a list", ["items:", br(), ul([li("one"), li("two")])]],
        ["a text, a line break, a heading", ["above", br(), h(2, "Title")]],
        ["a paragraph that ends in a line break is trimmed first", [p(["label:", br()]), p("value")]],
        ["a paragraph, a line break, a text", [p("one"), br(), "two"]],
        ["a paragraph, a line break and a text, a paragraph", [p("one"), br(), "two", p("three")]],
        ["a text and a line break, then a text and a line break, then a paragraph", ["one", br(), "two", br(), p("three")]],
        ["spaces after the line break do not undo it", ["label:", br(), "  ", p("value")]],
        ["a text ending in a carriage return and a newline, a paragraph", ["label:\r\n", p("value")]],
        ["an empty paragraph still closes the text before it", ["a ", p(), " b"]],
        ["an empty paragraph between a text with a line break and spaces with one", ["a", br(), p(), " ", br(), p("b")]],
      ]);
    },
  },
  {
    name: "line breaks between blocks add to the empty line; at the very start and the very end newlines are cut, spaces are not",
    run: (modules) => {
      const { texts, p, br, section, together } = kit(modules);
      return texts([
        ["a line break between paragraphs", [p("one"), br(), p("two")]],
        ["two line breaks between paragraphs", [p("one"), br(), br(), p("two")]],
        ["a line break with spaces around between paragraphs", [p("one"), " ", br(), " ", p("two")]],
        ["a line break before the first paragraph", [br(), p("one")]],
        ["a line break after the last paragraph", [p("one"), br()]],
        ["line breaks before and after", [br(), br(), p("one"), br(), br()]],
        ["only a line break", [br()]],
        ["only line breaks", [br(), br(), br()]],
        ["a space, a line break, a space", [" ", br(), " "]],
        ["a line break, a space", [br(), " "]],
        ["a space, a line break, then a paragraph", [" ", br(), p("one")]],
        ["a paragraph, then a line break and a space", [p("one"), br(), " "]],
        ["line breaks before and between two sections", [p("intro"), br(), section("first", "one"), br()]],
        ["each repository after a line break, a second line break from the second on", [p("note"), together([false, br(), p("repo one"), "status one"]), together([br(), br(), p("repo two"), "status two"])]],
      ]);
    },
  },
  {
    name: "a Fragment's children stand where the Fragment stood, by name or by function, however deep",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, Fragment, together, p, br, section } = kit(modules);
      return texts([
        ["by function, texts between texts", ["a", together(["b", "c"]), "d"]],
        ["by name, texts between texts", ["a", jsx("Fragment", { children: ["b", "c"] }), "d"]],
        ["by function, without children", ["a", jsx(Fragment, {}), "b"]],
        ["by name, without children", ["a", jsx("Fragment", {}), "b"]],
        ["by hand, one child that is no list", ["a", byHand("Fragment", { children: "b" }), "c"]],
        ["by hand, null for children", ["a", byHand("Fragment", { children: null }), "c"]],
        ["Fragments in Fragments", ["a", together([together(["b", jsx("Fragment", { children: ["c", together(["d"])] })]), "e"]), "f"]],
        ["paragraphs in a Fragment are blocks of the list around", [p("one"), together([p("two"), p("three")]), p("four")]],
        ["a line break and a text in a Fragment join the paragraph around", jsxs("p", { children: ["Workspace Path: ", "/work", together([br(), "You are operating in a worktree."]), false && together([br(), "Never shown."])] })],
        ["alone, by function", together([p("one"), p("two")])],
        ["alone, by name", jsx("Fragment", { children: [p("one"), p("two")] })],
        ["alone, by function, without children", jsx(Fragment, {})],
        ["alone, by name, without children", jsx("Fragment", {})],
        ["alone, by hand, a text that is left as it is", byHand("Fragment", { children: "  spaced   out  " })],
        ["in a section", section("s", together([p("one"), together(["two"])]))],
      ]);
    },
  },
  {
    name: "a component is called with its props, and what it returns stands in its place",
    run: (modules) => {
      const { jsx, renderContent, p, br, together } = kit(modules);
      const given = [];
      const Echo = (props) => {
        given.push(props);
        return props.returns;
      };
      const Inner = () => "from the inner one";
      const returned = [
        ["a text", "  some   text  "],
        ["an empty text", ""],
        ["a number", 7],
        ["zero", 0],
        ["null", null],
        ["undefined", undefined],
        ["true", true],
        ["false", false],
        ["a list of texts", ["one ", "two"]],
        ["an empty list", []],
        ["a paragraph", p("in a paragraph")],
        ["a list of paragraphs", [p("one"), p("two")]],
        ["a text and a paragraph", ["text", p("paragraph")]],
        ["a line break", br()],
        ["a Fragment", together(["in a ", "Fragment"])],
        ["another component", jsx(Inner, {})],
        ["a list holding another component", ["[", jsx(Inner, {}), "]"]],
      ];
      const element = jsx(Echo, { returns: "text", other: 1, children: "a child" });
      return {
        alone: table(returned.map(([words, returns]) => [words, () => renderContent(jsx(Echo, { returns }))])),
        betweenTexts: table(returned.map(([words, returns]) => [words, () => renderContent(["before ", jsx(Echo, { returns }), " after"])])),
        inAParagraph: table(returned.map(([words, returns]) => [words, () => renderContent(p(["before ", jsx(Echo, { returns }), " after"]))])),
        calls: given.length,
        text: renderContent(element),
        itsPropsAreTheElementsOwn: given.at(-1) === element.props,
        propsOfTheLastCall: given.at(-1),
      };
    },
  },
  {
    name: "components in a list are all called before the list is rendered, those inside a block when the block is, each once",
    run: (modules) => {
      const { jsx, renderContent, p, ul, ol, li, x, section, pre, h, together } = kit(modules);
      const log = [];
      const named = (name, returns) =>
        jsx(() => {
          log.push(name);
          return returns;
        }, {});
      const text = renderContent([
        named("first", "1 "),
        p(named("in the paragraph", "2")),
        named("after the paragraph", named("returned by the one after the paragraph", "3 ")),
        ul(li(named("in the item", "4"))),
        together([named("in the Fragment", "5 "), jsx("Fragment", { children: named("in the Fragment by name", "6 ") })]),
        x("t", named("in the tag", "7")),
        section("s", [named("in the section", "8"), h(2, named("in the section's heading", "9"))]),
        ol([named("in the numbered list, no item", "10"), li(["11 ", named("in the numbered item", "12")])]),
        pre(named("in pre", "13")),
        jsx("User", { children: named("in the message", "14 ") }),
        [[named("in a list in the list", "15 ")]],
        named("last", "16"),
      ]);
      return { text, log };
    },
  },
  {
    name: "a component given as a function is called on its own element, with the element's props and nothing else, wherever it stands",
    run: (modules) => {
      const { jsx, renderContent, byHand, p, ul, ol, li, pre, x, section, h } = kit(modules);
      const seen = [];
      function Watched(...given) {
        const calledOn = this === undefined ? "nothing" : this.type === Watched && this.props === given[0] ? "its own element, whose props it is given" : "something else";
        seen.push({ where: given[0]?.where ?? "by hand, without props", calledOn, arguments: given.length });
        return "w";
      }
      const at = (where) => jsx(Watched, { where });
      const answers = table([
        ["alone", () => renderContent(at("alone"))],
        ["in a list", () => renderContent(["a", at("in a list")])],
        ["returned by a component in a list", () => renderContent(["a", jsx(() => at("returned by a component in a list"), {})])],
        ["returned by a component alone", () => renderContent(jsx(() => at("returned by a component alone"), {}))],
        ["in a paragraph", () => renderContent(p(at("in a paragraph")))],
        ["in a heading", () => renderContent(h(2, at("in a heading")))],
        ["in a Fragment by name", () => renderContent(jsx("Fragment", { children: at("in a Fragment by name") }))],
        ["in a tag", () => renderContent(x("t", at("in a tag")))],
        ["in a section", () => renderContent(section("s", at("in a section")))],
        ["in a dash list, outside the items", () => renderContent(ul([at("in a dash list, outside the items")]))],
        ["in a numbered list, outside the items", () => renderContent(ol([at("in a numbered list, outside the items")]))],
        ["in a dash item", () => renderContent(ul(li(at("in a dash item"))))],
        ["in a numbered item", () => renderContent(ol(li(at("in a numbered item"))))],
        ["returned by a component in an item", () => renderContent(ul(li(jsx(() => at("returned by a component in an item"), {}))))],
        ["in an item outside a list", () => renderContent(li(at("in an item outside a list")))],
        ["in pre", () => renderContent(pre(at("in pre")))],
        ["in a message", () => renderContent(jsx("User", { children: at("in a message") }))],
        ["in a Conversation", () => renderContent(jsx("Conversation", { children: [at("in a Conversation")] }))],
        ["returned by one of the caller's components", () => renderContent(jsx("Mine", {}), { components: { Mine: () => at("returned by one of the caller's components") } })],
        ["by hand without props, alone", () => renderContent(byHand(Watched))],
        ["by hand without props, in a list", () => renderContent(["a", byHand(Watched)])],
        ["by hand without props, in an item", () => renderContent(ul(li(byHand(Watched))))],
        ["by hand without props, in pre", () => renderContent(pre(byHand(Watched)))],
        ["by hand without props, in a Conversation", () => renderContent(jsx("Conversation", { children: [byHand(Watched)] }))],
      ]);
      return { answers, seen };
    },
  },

  // ---- Rendering: lists of items -----------------------------------------
  {
    name: "an item outside a list is a dash, a space and its content; several in a row run together",
    run: (modules) => {
      const { texts, byHand, jsx, li, p, ul } = kit(modules);
      return texts([
        ["alone", li("item")],
        ["alone, no children", li()],
        ["alone, by hand: its text is left as it is", byHand("li", { children: "  spaced   out  " })],
        ["alone, with jsx: its text is one paragraph", li("  spaced   out  ")],
        ["alone, a list inside is not indented", li(["text", ul(li("inner"))])],
        ["after a text", ["before ", li("item")]],
        ["two in a row", [li("one"), li("two")]],
        ["an empty one between texts", ["a", jsx("li", {}), "b"]],
        ["between paragraphs", [p("one"), li("item"), p("two")]],
        ["in a paragraph", p([li("one"), li("two")])],
      ]);
    },
  },
  {
    name: "a list of items is a dash, a space and the trimmed text of each item, one to a line; items without text are passed over",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, ul, li } = kit(modules);
      return texts([
        ["two items", ul([li("one"), li("two")])],
        ["one item, given alone", ul(li("only"))],
        ["one item, by hand, no list around it", byHand("ul", { children: byHand("li", { children: "only" }) })],
        ["no children", ul()],
        ["by hand, null for children", byHand("ul", { children: null })],
        ["by hand, an empty list", byHand("ul", { children: [] })],
        ["items without text are passed over", ul([li("one"), li(), li("   "), li([null, false]), li("\n"), li("two")])],
        ["only items without text", ul([li(), li("  ")])],
        ["an item's ends are trimmed", ul([li("  one  "), li("\ntwo\n")])],
        ["items in inner lists", jsxs("ul", { children: [[li("one"), [li("two")]], li("three")] })],
        ["nothings in inner lists are passed over", jsxs("ul", { children: [[null, li("one"), false, true, undefined], li("two")] })],
        ["items that may be absent, as the engine writes them", jsxs("ul", { children: [false && li("never"), true && li("shown"), li("always")] })],
        ["other props change nothing", jsx("ul", { title: "t", key: "k", children: [li("one")] })],
        ["after a text", ["The following are supported:", ul([li("one"), li("two")])]],
        ["a list alone in a list", [ul([li("one"), li("two")])]],
      ]);
    },
  },
  {
    name: "an item's text is its children joined as they are: runs of spaces stay, blocks run together, only the ends are trimmed",
    run: (modules) => {
      const { texts, jsx, jsxs, ul, li, p, br, x, h, section, pre, together } = kit(modules);
      const item = (children) => ul(jsxs("li", { children }));
      return texts([
        ["runs of spaces inside stay", item(["a    b"])],
        ["texts and numbers", item(["step ", 1, " of ", 2])],
        ["zero is written", item([0])],
        ["texts as the engine joins them", item(["NEVER skip hooks unless the user asks", "", " (requires force push)"])],
        ["nothings in inner lists are passed over", item([["a", null, false, ["b", undefined, true]], "c"])],
        ["a line break", item(["a", br(), "b"])],
        ["a tag", item(["see ", x("code", "x = 1"), " here"])],
        ["paragraphs run together", item([p("one"), p("two")])],
        ["a heading", item(["a ", h(2, "Title")])],
        ["a section", item(["a ", section("s", "inside")])],
        ["pre", item(["a", pre("  as it is  "), "b"])],
        ["an item in an item", item(["a ", li("inner")])],
        ["a message", item(["a ", jsx("User", { children: "said" })])],
        ["a Fragment by name", item([jsx("Fragment", { children: ["  a   b  ", "c"] })])],
        ["a Fragment by function", item([together(["  a   b  ", "c"])])],
        ["a Fragment by function holding a list: the list is text, not indented", item([together(["a", ul(li("inner"))])])],
        ["a name the part does not know", item(["a ", jsx("Widget", {})])],
      ]);
    },
  },
  {
    name: "what stands in a list without being an item gets a line of its own, trimmed; items in a Fragment or returned as a list run together",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, ul, ol, li, p, br, x, together } = kit(modules);
      const Item = (props) => jsx("li", { children: props.text });
      const Items = () => [jsx("li", { children: "one" }), jsx("li", { children: "two" })];
      const Nothing = () => null;
      const both = (words, children) => [
        [`a dash list: ${words}`, jsxs("ul", { children })],
        [`a numbered list: ${words}`, jsxs("ol", { children })],
      ];
      return texts([
        ...both("a text and numbers", ["  just text  ", 0, 12]),
        ...both("a paragraph", [p("  a paragraph  "), li("item")]),
        ...both("a tag", [x("t", "tagged"), li("item")]),
        ...both("a line break is passed over", [li("one"), br(), li("two")]),
        ...both("an empty text and spaces are passed over", ["", "   ", li("one")]),
        ...both("a list as a direct child starts at the edge", [li("one"), jsx("ul", { children: li("dash") }), jsx("ol", { children: li("number") }), li("two")]),
        ...both("items in a Fragment by function run together", [together([li("one"), li("two")]), li("three")]),
        ...both("items in a Fragment by name run together", [jsx("Fragment", { children: [li("one"), li("two")] }), li("three")]),
        ...both("a component that returns an item", [jsx(Item, { text: "one" }), jsx(Item, { text: "two" }), li("three")]),
        ...both("a component that returns a list of items", [jsx(Items, {}), li("three")]),
        ...both("a component that returns nothing", [jsx(Nothing, {}), li("one")]),
        ...both("a message", [jsx("User", { children: "said" }), li("one")]),
        ...both("a name the part does not know", [jsx("Widget", {})]),
        ["a dash list by hand: a text for children", byHand("ul", { children: "  just text  " })],
        ["a numbered list by hand: a text for children", byHand("ol", { children: "  just text  " })],
        ["a dash list by hand: zero for children", byHand("ul", { children: 0 })],
        ["a numbered list by hand: false for children", byHand("ol", { children: false })],
      ]);
    },
  },
  {
    name: "a list inside an item is indented under it, two spaces under a dash and three under a number, level after level",
    run: (modules) => {
      const { texts, ul, ol, li, p, br } = kit(modules);
      return texts([
        ["a dash list in a dash item", ul([li(["one", ul([li("inner one"), li("inner two")])]), li("two")])],
        ["three levels of dashes", ul(li(["one", ul(li(["two", ul(li("three"))]))]))],
        ["three levels of numbers", ol(li(["one", ol(li(["two", ol(li("three"))]))]))],
        ["dash, number, dash", ul(li(["one", ol(li(["two", ul(li("three"))]))]))],
        ["number, dash, number", ol(li(["one", ul(li(["two", ol(li("three"))]))]))],
        ["a numbered list in a dash item, as the engine writes its conditions", ul([li("NEVER update the config"), li(["ONLY amend when ALL conditions are met:", ol([li("The user asked for it"), li("The commit is yours"), li("It was not pushed")])]), li("Fix the issue and commit again")])],
        ["a dash list in a numbered item, as the engine writes its steps", ol([li(["Run these in parallel, each using the ", "Shell", " tool:", ul([li("git status"), li("git diff")])]), li(["Then run:", ul(li("git commit"))]), li("Check the result")])],
        ["two lists in one item", ul(li(["text", ul(li("dash")), ol(li("number"))]))],
        ["the text after an inner list joins the text before it", ul(li(["before", ul(li("inner")), " after"]))],
        ["an empty inner list is passed over", ul(li(["text", ul(), ol(), ul(li())]))],
        ["a dash item with only a list: the list alone, indented", ul([li(ul([li("inner one"), li("inner two")])), li("two")])],
        ["a dash item with spaces and a list", ul(li(["   ", ul(li("inner"))]))],
        ["a dash item with only a list, alone at the top: its indentation stays", ul(li(ul(li("inner"))))],
        ["a dash item with only a list, in a list of nodes: the first line's indentation is trimmed", [ul(li(ul([li("inner one"), li("inner two")])))]],
        ["what is no item in an inner list is indented like the items", ul(li(["text", ul(["  loose text  ", p("a paragraph"), li("item"), br()])]))],
        ["what is no item in an inner numbered list", ol(li(["text", ol(["  loose text  ", li("item")])]))],
        ["an inner item of several lines: only its first line is indented", ul(li(["text", ul(li(["first", br(), "second"]))]))],
      ]);
    },
  },
  {
    name: "a numbered list numbers from one the items that have something; what is no item is not numbered",
    run: (modules) => {
      const { texts, byHand, jsxs, ol, li, p } = kit(modules);
      return texts([
        ["three items", ol([li("one"), li("two"), li("three")])],
        ["one item, given alone", ol(li("only"))],
        ["one item, by hand, no list around it", byHand("ol", { children: byHand("li", { children: "only" }) })],
        ["no children", ol()],
        ["by hand, null for children", byHand("ol", { children: null })],
        ["items without text take no number", ol([li("one"), li(), li("   "), li([null]), li("two")])],
        ["only items without text", ol([li(), li("  ")])],
        ["an item's ends are trimmed", ol([li("  one  "), li("\ntwo\n")])],
        ["twelve items: the numbers grow, nothing else moves", ol(Array.from({ length: 12 }, (_, index) => li(`item ${index + 1}`)))],
        ["items in inner lists", jsxs("ol", { children: [[li("one"), [li("two")]], li("three")] })],
        ["what is no item is not numbered and takes no number", ol(["  loose text  ", li("one"), p("a paragraph"), 7, li("two")])],
        ["a numbered list directly in a numbered list starts again at one", ol([li("one"), ol([li("inner")]), li("two")])],
        ["after a text", ["Steps:", ol([li("one"), li("two")])]],
        ["an inner list under the tenth item is still three spaces in", ol([...Array.from({ length: 9 }, (_, index) => li(`item ${index + 1}`)), li(["ten", ol(li("inner"))])])],
      ]);
    },
  },
  {
    name: "a numbered item with only a list inside puts the list's first line beside its number and the other lines under it, three spaces further in, flat",
    run: (modules) => {
      const { texts, ul, ol, li } = kit(modules);
      return texts([
        ["one inner line", ol([li(ul(li("inner"))), li("two")])],
        ["two inner lines", ol([li(ul([li("inner one"), li("inner two")])), li("two")])],
        ["an inner numbered list", ol([li(ol([li("inner one"), li("inner two")])), li("two")])],
        ["deeper levels are flattened under the item", ol([li(ul([li("a"), li(["b", ul(li(["deep", ul(li("deeper"))]))]), li("c")])), li("two")])],
        ["two inner lists", ol(li([ul([li("dash one"), li("dash two")]), ol([li("number one"), li("number two")])]))],
        ["spaces count as no text", ol(li(["   ", ul([li("inner one"), li("inner two")])]))],
        ["an inner item of several lines", ol(li(ul([li("first\n      second line, far in"), li("next")])))],
        ["the item takes a number", ol([li(ul(li("inner"))), li(), li("after")])],
        ["one level in: lined up six spaces in", ol(li(["outer", ol([li(ul([li("inner one"), li("inner two")])), li("after")])]))],
        ["under a dash: lined up five spaces in", ul(li(["outer", ol(li(ul([li("inner one"), li("inner two")])))]))],
        ["two levels in, one inner line", ol(li(["outer", ol(li(ol(li("inner"))))]))],
        ["alone in a list of nodes", [ol(li(ul([li("inner one"), li("inner two")])))]],
      ]);
    },
  },
  {
    name: "a component inside an item: its text joins the item's, a list it returns is indented as the item's own, a list from two components deep is not",
    run: (modules) => {
      const { texts, jsx, ul, ol, li, p } = kit(modules);
      const Text = () => "from a component";
      const Zero = () => 0;
      const Nothing = () => null;
      const Empty = () => "";
      const Dashes = () => jsx("ul", { children: [jsx("li", { children: "inner one" }), jsx("li", { children: "inner two" })] });
      const Numbers = () => jsx("ol", { children: [jsx("li", { children: "inner one" }), jsx("li", { children: "inner two" })] });
      const NoItems = () => jsx("ul", {});
      const Paragraph = () => p("  a   paragraph  ");
      const TextAndList = () => ["text ", jsx(Dashes, {})];
      const TwoDeep = () => jsx(Dashes, {});
      const both = (words, children) => [
        [`under a dash: ${words}`, ul(li(children))],
        [`under a number: ${words}`, ol(li(children))],
      ];
      return texts([
        ...both("a text", ["see ", jsx(Text, {}), "."]),
        ...both("a number", ["count: ", jsx(Zero, {})]),
        ...both("nothing", ["a", jsx(Nothing, {}), jsx(Empty, {}), "b"]),
        ...both("only nothing", [jsx(Nothing, {})]),
        ...both("a dash list", ["text", jsx(Dashes, {})]),
        ...both("a numbered list", ["text", jsx(Numbers, {})]),
        ...both("only a list", [jsx(Dashes, {})]),
        ...both("an empty list", ["text", jsx(NoItems, {})]),
        ...both("a paragraph", ["text ", jsx(Paragraph, {})]),
        ...both("a text and a list, as a list", [jsx(TextAndList, {})]),
        ...both("a component that returns a list, two deep", ["text", jsx(TwoDeep, {})]),
      ]);
    },
  },

  // ---- Rendering: messages and named components -----------------------------
  {
    name: "System, User, Assistant and Tool render as their content; their name and tool call id are not written",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, p, ul, li } = kit(modules);
      const { System, User, Assistant, Tool } = modules.components;
      return texts([
        ["System by name", jsx("System", { children: "Be brief." })],
        ["User by name", jsx("User", { children: "Hello." })],
        ["Assistant by name", jsx("Assistant", { children: "Hi." })],
        ["Tool by name", jsx("Tool", { tool_call_id: "call_1", children: "found 3" })],
        ["System by function", jsx(System, { children: "Be brief." })],
        ["User by function", jsx(User, { children: "Hello." })],
        ["Assistant by function", jsx(Assistant, { children: "Hi." })],
        ["Tool by function", jsx(Tool, { tool_call_id: "call_1", children: "found 3" })],
        ...["System", "User", "Assistant", "Tool"].map((name) => [`${name} with a name`, jsx(name, { name: "someone", tool_call_id: "call_2", children: "content" })]),
        ...["System", "User", "Assistant", "Tool"].map((name) => [`${name} without children`, jsx(name, { name: "" })]),
        ["a name that is zero or an object changes nothing", [jsx("User", { name: 0, children: "a" }), jsx("User", { name: { any: "thing" }, children: "b" })]],
        ["the content is rendered as content: paragraphs", jsxs("User", { children: [p("one"), p("two")] })],
        ["the content is rendered as content: a list", jsx("Assistant", { children: ul([li("one"), li("two")]) })],
        ["with jsx, the content is one paragraph", jsx("User", { children: "  spaced   out  " })],
        ["by hand, the content is left as it is", byHand("User", { children: "  spaced   out  " })],
        ["by hand, a number", byHand("Tool", { children: 0 })],
        ["a message in a message", jsx("User", { children: jsx("System", { children: "inner" }) })],
      ]);
    },
  },
  {
    name: "a Conversation by name writes each message and each bare text on a line of its own, and nothing else",
    run: (modules) => {
      const { texts, byHand, jsx, jsxs, Fragment, p, h, ul, ol, li, x, section, pre, br, together } = kit(modules);
      const Returns = (props) => props.returns;
      const conversation = (children) => jsxs("Conversation", { children });
      return texts([
        ["messages", conversation([jsx("System", { children: "Be brief." }), jsx("User", { children: "Hello." }), jsx("Assistant", { children: "Hi." }), jsx("Tool", { tool_call_id: "call_1", name: "search", children: "found 3" })])],
        ["bare texts and numbers are lines too", conversation(["first", 2, jsx("User", { children: "third" }), 0])],
        ["nothings in inner lists are passed over", conversation([[null, "a", true, [false, "b", undefined]], "c"])],
        ["no children", jsx("Conversation", {})],
        ["by hand, one text", byHand("Conversation", { children: "  as it is  " })],
        ["by hand, null for children", byHand("Conversation", { children: null })],
        ["paragraphs, headings, lists, items, tags, sections, pre and line breaks are not written", conversation(["kept", p("paragraph"), h(1, "one"), h(6, "six"), ul(li("item")), ol(li("item")), li("item"), x("t", "tag"), section("s", "section"), pre("pre"), br(), "kept too"])],
        ["a message's content is content: blocks inside it are written", conversation([jsx("User", { children: [p("one"), p("two")] }), "after"])],
        ["an empty message is an empty line", conversation(["before", jsx("User", {}), "after"])],
        ["a Fragment by name: each child a line", conversation(["a", jsx("Fragment", { children: ["b", "c"] }), "d"])],
        ["a Fragment by function: each child a line", conversation(["a", together(["b", "c"]), "d"])],
        ["a Fragment without children", conversation(["a", jsx(Fragment, {}), jsx("Fragment", {}), "b"])],
        ["a Conversation in a Conversation", conversation(["a", conversation(["b", jsx("User", { children: "c" })]), "d"])],
        ["a component that returns a text", conversation(["a", jsx(Returns, { returns: "returned" })])],
        ["a component that returns a list", conversation(["a", jsx(Returns, { returns: ["one", null, jsx("User", { children: "two" })] })])],
        ["a component that returns a paragraph: not written", conversation(["a", jsx(Returns, { returns: p("lost") })])],
        ["a component that returns nothing", conversation(["a", jsx(Returns, { returns: null }), jsx(Returns, { returns: false }), "b"])],
        ["a name the part does not know", conversation(["a", jsx("Widget", {})])],
        ["between other nodes it is text in their paragraph", ["before ", conversation(["a", "b"]), " after"]],
      ]);
    },
  },
  {
    name: "Conversation and Fragment given as the functions themselves are rendered as content: blocks are kept and texts join",
    run: (modules) => {
      const { texts, jsx, jsxs, Fragment, p, ul, li } = kit(modules);
      const { Conversation } = modules.components;
      return texts([
        ["Conversation by function: paragraphs", jsxs(Conversation, { children: [p("one"), p("two")] })],
        ["Conversation by function: texts join", jsxs(Conversation, { children: ["a", "b"] })],
        ["Conversation by function: messages run together", jsxs(Conversation, { children: [jsx("System", { children: "Be brief." }), jsx("User", { children: "Hello." })] })],
        ["Conversation by function, without children", jsx(Conversation, {})],
        ["Conversation by function in a list", ["before", jsxs(Conversation, { children: [p("one"), "two"] }), "after"]],
        ["Conversation by name, the same children: paragraphs lost, texts on lines", jsxs("Conversation", { children: [p("one"), "a", "b"] })],
        ["Fragment by function: a list", jsxs(Fragment, { children: ["Steps:", ul([li("one"), li("two")])] })],
      ]);
    },
  },
  {
    name: "a message among other nodes is text in the paragraph it stands in",
    run: (modules) => {
      const { texts, jsx, p, section } = kit(modules);
      return texts([
        ["between texts", ["before ", jsx("User", { children: "said" }), " after"]],
        ["two in a row", [jsx("User", { children: "one" }), jsx("Assistant", { children: "two" })]],
        ["between paragraphs", [p("one"), jsx("User", { children: "said" }), p("two")]],
        ["an empty one between texts", ["a", jsx("User", {}), "b"]],
        ["an empty one between paragraphs", [p("one"), jsx("User", {}), p("two")]],
        ["one with paragraphs inside, between texts", ["before ", jsx("User", { children: [p("one"), p("two")] }), " after"]],
        ["in a section", section("s", [jsx("System", { children: "Be brief." })])],
        ["in a paragraph", p(["He said: ", jsx("User", { children: "hello" })])],
      ]);
    },
  },
  {
    name: "a name the part does not know is refused; a name every object has is found by mistake",
    run: (modules) => {
      const { texts, jsx, p, ul, li } = kit(modules);
      return texts([
        ["alone", jsx("Widget", { children: "inside" })],
        ["in a list", ["before", jsx("Widget", {}), "after"]],
        ["in a paragraph", p(jsx("Widget", {}))],
        ["in an item", ul(li(jsx("Widget", {})))],
        ["an empty name", jsx("", {})],
        ["the names are told apart by their capitals", [jsx("system", {})]],
        ["the name of a block in capitals", jsx("P", { children: "text" })],
        ["span", jsx("span", { children: "text" })],
        ['the name "toString"', jsx("toString", {})],
        ['the name "toString" in a list', ["a ", jsx("toString", {}), " b"]],
        ['the name "constructor"', jsx("constructor", {})],
        ['the name "valueOf"', jsx("valueOf", {})],
        ['the name "hasOwnProperty"', jsx("hasOwnProperty", {})],
        ['the name "__proto__"', jsx("__proto__", {})],
      ]);
    },
  },
  {
    name: "components of the caller's own are found by name and called with the props; what they return is read as messages, so blocks are lost",
    run: (modules) => {
      const { jsx, renderContent, p, ul, li, pre, together } = kit(modules);
      const calls = [];
      const components = {
        Greeting(props) {
          calls.push({ props, calledOnNothing: this === undefined });
          return `Hello ${props.to}!`;
        },
        Returns: (props) => props.returns,
        Twice: (props) => [jsx("Greeting", { to: props.to }), jsx("Greeting", { to: props.to })],
        NotAFunction: "just text",
      };
      const Inner = () => "from a function";
      const returned = [
        ["a text, left as it is", "  spaced   out  "],
        ["a number", 7],
        ["zero", 0],
        ["null", null],
        ["undefined", undefined],
        ["false", false],
        ["a list of texts: a line each", ["one", "two", 3]],
        ["a paragraph: lost", p("lost")],
        ["a list of paragraphs: lost", [p("lost"), p("lost too")]],
        ["a list of items: lost", ul(li("lost"))],
        ["a message with paragraphs: written", jsx("User", { children: [p("one"), p("two")] })],
        ["a Fragment by name with a paragraph and a text", jsx("Fragment", { children: [p("lost"), "kept"] })],
        ["a Fragment by function with a paragraph and a text", together([p("lost"), "kept"])],
        ["a component given as a function", jsx(Inner, {})],
        ["another of the caller's components", jsx("Greeting", { to: "again" })],
        ["an object that is no node", {}],
      ];
      const greeting = jsx("Greeting", { to: "Ada", children: "a child" });
      const cases = table([
        ["alone", () => renderContent(greeting, { components })],
        ["between texts", () => renderContent(["before ", jsx("Greeting", { to: "Ada" }), " after"], { components })],
        ["in a paragraph", () => renderContent(p(["She said: ", jsx("Greeting", { to: "Ada" })]), { components })],
        ["in an item", () => renderContent(ul(li(["She said: ", jsx("Greeting", { to: "Ada" })])), { components })],
        ["in a Conversation", () => renderContent(jsx("Conversation", { children: ["first", jsx("Greeting", { to: "Ada" })] }), { components })],
        ["in pre: not called, its children written", () => renderContent(pre(jsx("Greeting", { to: "Ada", children: "the children" })), { components })],
        ["one that returns two others", () => renderContent(jsx("Twice", { to: "Bo" }), { components })],
        ["one that is no function", () => renderContent(jsx("NotAFunction", {}), { components })],
        ["one that is not there", () => renderContent(jsx("Missing", {}), { components })],
        ...returned.map(([words, returns]) => [`it returns ${words}`, () => renderContent(jsx("Returns", { returns }), { components })]),
      ]);
      return { cases, calls: calls.length, firstCall: calls[0], itsPropsAreTheElementsOwn: calls[0].props === greeting.props };
    },
  },
  {
    name: "the caller's components can stand for Conversation and for no other name the part knows; they last one call and leave the part's list as it was",
    run: (modules) => {
      const { jsx, renderContent } = kit(modules);
      const { builtinComponents } = modules.components;
      const names = ["Conversation", "System", "User", "Assistant", "Tool", "Fragment", "p", "h2", "x", "section", "ul", "ol", "li", "pre", "br", "Widget"];
      const replaced = (name) => renderContent(jsx(name, { title: "t", children: "the element's own" }), { components: { [name]: () => "the caller's" } });
      const before = Object.keys(builtinComponents);
      const answers = table(names.map((name) => [name, () => replaced(name)]));
      // A component that renders a tree of its own, with components of its own, in the middle of another call.
      const Nested = () => `[${renderContent(jsx("Inner", {}), { components: { Inner: () => "inner" } })}]`;
      return {
        ...answers,
        "a call inside a call keeps its own components": table([
          ["the outer call's are still there afterwards", () => renderContent([jsx(Nested, {}), jsx("Outer", {})], { components: { Outer: () => " outer" } })],
          ["the inner call's are not the outer call's", () => renderContent([jsx(Nested, {}), jsx("Inner", {})], { components: { Outer: () => " outer" } })],
          ["the outer call's are not the inner call's", () => renderContent(jsx(() => renderContent(jsx("Outer", {})), {}), { components: { Outer: () => " outer" } })],
        ]),
        "Widget again, without the caller's components": table([["asked", () => renderContent(jsx("Widget", {}))]]).asked,
        "Conversation again, without the caller's components": renderContent(jsx("Conversation", { children: ["a", "b"] })),
        "the part's list afterwards": [Object.keys(builtinComponents), Object.keys(builtinComponents).join() === before.join(), builtinComponents.Conversation === modules.components.Conversation],
      };
    },
  },
  {
    name: "the caller's components are copied field by field into the names of one call: inherited ones are not found, hidden ones neither, a __proto__ field is followed",
    run: (modules) => {
      const { jsx, renderContent } = kit(modules);
      const inherited = Object.create({ Widget: () => "inherited" });
      const hidden = Object.defineProperty({}, "Widget", { value: () => "hidden", enumerable: false });
      const followed = Object.defineProperty({}, "__proto__", { value: { Widget: () => "through the copy" }, enumerable: true });
      const reads = [];
      const watched = {
        get Widget() {
          reads.push("Widget");
          return () => "from a getter";
        },
      };
      const twice = [renderContent([jsx("Widget", {}), " ", jsx("Widget", {})], { components: watched })];
      return {
        ...table([
          ["inherited", () => renderContent(jsx("Widget", {}), { components: inherited })],
          ["hidden", () => renderContent(jsx("Widget", {}), { components: hidden })],
          ["a __proto__ field", () => renderContent(jsx("Widget", {}), { components: followed })],
          ["a __proto__ field, and a name every object has", () => renderContent(jsx("toString", {}), { components: followed })],
          ["a __proto__ field, and the part's own Conversation", () => renderContent(jsx("Conversation", { children: ["a", "b"] }), { components: followed })],
          ["a list of functions: found by their place", () => renderContent(jsx("0", {}), { components: [() => "first of a list"] })],
        ]),
        "a getter is read once, when the call starts": { text: twice[0], reads },
      };
    },
  },
  {
    name: "options that are nothing, empty or without components change nothing",
    run: (modules) => {
      const { jsx, jsxs, renderContent, p } = kit(modules);
      const tree = [p("one"), jsxs("Conversation", { children: ["a", jsx("User", { children: "b" })] })];
      return table([
        ["no options", () => renderContent(tree)],
        ["undefined", () => renderContent(tree, undefined)],
        ["null", () => renderContent(tree, null)],
        ["an empty object", () => renderContent(tree, {})],
        ["components undefined", () => renderContent(tree, { components: undefined })],
        ["components null", () => renderContent(tree, { components: null })],
        ["components empty", () => renderContent(tree, { components: {} })],
        ["other fields", () => renderContent(tree, { anything: "else" })],
        ["a text", () => renderContent(tree, "options")],
        ["zero", () => renderContent(tree, 0)],
      ]);
    },
  },

  // ---- Trees shaped like the engine's own ----------------------------------
  {
    name: "like the engine: the person's computer and workspace, lines that may be absent, a component for the stores",
    run: (modules) => {
      const { jsx, jsxs, Fragment, renderContent } = kit(modules);
      const Stores = ({ stores }) =>
        jsxs("p", {
          children: [
            "Available persistent agent stores:",
            jsx("br", {}),
            stores.map((store) => `- ${store}`).join("\n"),
            jsx("br", {}),
            "Use normal file tools with these absolute paths. ",
            stores.length > 1 && 'When the user says "my store," use the first. ',
            "Only use stores listed here; omitted stores are unavailable.",
          ],
        });
      const UserInfo = ({ os, shell, paths, inWorktree, repoLine, terminals, stores, date }) =>
        jsxs("section", {
          title: "user_info",
          children: [
            jsxs("p", { children: ["OS Version: ", os] }),
            jsxs("p", { children: ["Shell: ", shell ?? "bash"] }),
            paths.length > 1
              ? jsxs("p", { children: ["Workspace Paths:", jsx("br", {}), paths.map((path) => `- ${path}`).join("\n")] })
              : paths.length === 1
                ? jsxs("p", {
                    children: [
                      "Workspace Path: ",
                      paths[0],
                      inWorktree && jsxs(Fragment, { children: [jsx("br", {}), "You are operating in a worktree, do not edit files outside of it."] }),
                      !repoLine && jsxs(Fragment, { children: [jsx("br", {}), "Do not search or edit non-primary worktrees."] }),
                    ],
                  })
                : jsx("p", { children: "Workspace Path: unknown" }),
            repoLine && jsxs("p", { children: ["Is directory a git repo: ", repoLine] }),
            terminals && jsxs("p", { children: ["Terminals folder: ", terminals] }),
            stores.length > 0 && jsx(Stores, { stores }),
            date !== undefined && jsxs("p", { children: ["Today's date: ", date] }),
            jsx("p", { children: "Note: Prefer using absolute paths over relative paths as tool call args when possible." }),
          ],
        });
      const info = (props) => renderContent(jsx(UserInfo, props));
      return {
        oneWorkspaceInAWorktree: info({ os: "darwin 25.1.0", shell: "zsh", paths: ["/Users/ada/work/app"], inWorktree: true, repoLine: "", terminals: "/Users/ada/.terminals", stores: [], date: "Friday Nov 13, 2026" }),
        severalWorkspacesAndStores: info({ os: "linux 6.18", shell: undefined, paths: ["/work/app", "/work/site"], inWorktree: false, repoLine: "Yes, at:\n- /work/app\n- /work/site", terminals: undefined, stores: ["/stores/me", "/stores/team (read-only)"], date: undefined }),
        nothingKnown: info({ os: "", shell: "bash", paths: [], inWorktree: false, repoLine: "No", terminals: "", stores: [], date: undefined }),
      };
    },
  },
  {
    name: "like the engine: the git status of each repository, a line break more from the second on, the status in a fence",
    run: (modules) => {
      const { jsx, jsxs, Fragment, renderContent } = kit(modules);
      const fenced = (status) => (status.trim() === "" ? "" : `\`\`\`\n${status.trim()}\n\`\`\``);
      const GitStatus = ({ note, repos }) =>
        jsxs("section", {
          title: "git_status",
          children: [
            jsx("p", { children: "This is the git status at the start of the conversation." }),
            note !== undefined && jsx("p", { children: note }),
            repos.map((repo, index) =>
              jsxs(Fragment, {
                children: [
                  index > 0 && jsx("br", {}),
                  jsx("br", {}),
                  jsxs("p", { children: ["Git repo: ", repo.path, repo.remote !== undefined && ` (remote: ${repo.remote})`] }),
                  repo.status !== undefined && fenced(repo.status),
                ],
              }),
            ),
          ],
        });
      const status = (props) => renderContent(jsx(GitStatus, props));
      return {
        noRepository: status({ repos: [] }),
        oneRepository: status({ repos: [{ path: "/work/app", status: "## main...origin/main\n M  src/index.ts\n??  notes.txt\n" }] }),
        twoRepositories: status({
          note: "This cloud workspace has multiple independent git repositories.",
          repos: [
            { path: "/work/app", remote: "github.com/acme/app", status: "## main\n M  a.ts" },
            { path: "/work/site", remote: "github.com/acme/site", status: "   " },
            { path: "/work/docs" },
          ],
        }),
      };
    },
  },
  {
    name: "like the engine: the skills on offer, a section in a section, each skill a tag with its path, a note for those left out",
    run: (modules) => {
      const { jsx, jsxs, renderContent } = kit(modules);
      const description = "Skills the agent can use. Use the Read tool with the provided absolute path to fetch full contents.";
      const items = (skills) => skills.map((skill) => jsx("x", { tag: "agent_skill", fullPath: skill.path, children: skill.description || undefined }));
      const Omitted = ({ directories, count }) => jsx("p", { children: `Additional skills omitted from this initial list (${count}). Directories containing omitted skills: ${directories.join(", ")}.` });
      const Layout = ({ skillItems, omittedNotice, raw }) => {
        if (raw) return jsxs("section", { title: "agent_skills", description, children: [skillItems, omittedNotice] });
        return jsxs("section", {
          title: "agent_skills",
          children: [
            jsxs("p", {
              children: [
                "When users ask you to perform tasks, check if any of the available skills below can help.",
                " To use a skill, read the skill file at the provided absolute path, then follow the instructions within.",
                " ",
                "When a skill is relevant, read and follow it IMMEDIATELY as your first action.",
                " ",
                omittedNotice !== undefined ? "Use the skills listed below. Additional skills may exist in the directories shown." : "Only use skills listed below.",
              ],
            }),
            jsx("br", {}),
            jsxs("section", { title: "available_skills", description, children: [skillItems, omittedNotice] }),
            jsx("br", {}),
          ],
        });
      };
      const skills = [
        { path: "/skills/release-notes/SKILL.md", description: "Writes release notes from merged pull requests.  Use when asked for a changelog." },
        { path: "/skills/no-words/SKILL.md", description: "" },
        { path: '/skills/with "quotes"/SKILL.md', description: "Handles paths with\n  quotes and lines." },
      ];
      const notice = jsx(Omitted, { directories: ["/skills", "/team/skills"], count: 4 });
      return {
        listed: renderContent(jsx(Layout, { skillItems: items(skills), omittedNotice: undefined, raw: false })),
        listedWithANote: renderContent(jsx(Layout, { skillItems: items(skills.slice(0, 1)), omittedNotice: notice, raw: false })),
        noneListedWithANote: renderContent(jsx(Layout, { skillItems: items([]), omittedNotice: notice, raw: false })),
        noneAtAll: renderContent(jsx(Layout, { skillItems: items([]), omittedNotice: undefined, raw: false })),
        raw: renderContent(jsx(Layout, { skillItems: items(skills), omittedNotice: notice, raw: true })),
        rawAndEmpty: renderContent(jsx(Layout, { skillItems: items([]), omittedNotice: undefined, raw: true })),
        theNoteAlone: renderContent(notice),
      };
    },
  },
  {
    name: "like the engine: rules as tags in a described section; a rule's text loses its runs of spaces, and an empty rule made with a key shows the key",
    run: (modules) => {
      const { jsx, jsxs, renderContent } = kit(modules);
      const Always = ({ rules }) =>
        jsx("section", {
          title: "always_applied_workspace_rules",
          description: "These are workspace-level rules that the agent must always follow.",
          children: rules.map((rule) => jsxs("x", { tag: "always_applied_workspace_rule", name: rule.path, children: [rule.content, rule.globs ? `, glob pattern(s) for applicable files: ${rule.globs.join(", ")}` : ""] })),
        });
      const UserRules = ({ custom, rules }) =>
        jsxs("section", {
          title: "user_rules",
          description: "These are rules set by the user that you should follow if appropriate.",
          children: [custom.map((rule, index) => jsx("x", { tag: "user_rule", children: rule }, index)), rules.map((rule) => jsx("x", { tag: "user_rule", children: rule }))],
        });
      const code = "Indent with four spaces:\n\n    if (ready) {\n        start();\n    }\n\nNever   use  tabs.\n";
      return {
        always: renderContent(jsx(Always, { rules: [{ path: "/repo/.rules/style.md", content: code, globs: ["*.ts", "*.tsx"] }, { path: "/repo/.rules/empty.md", content: "" }, { path: "/repo/.rules/short.md", content: "Be brief." }] })),
        alwaysWithoutRules: renderContent(jsx(Always, { rules: [] })),
        userRules: renderContent(jsx(UserRules, { custom: ["Answer in French.", "", "   "], rules: ["Prefer small commits.", ""] })),
        userRulesWithoutRules: renderContent(jsx(UserRules, { custom: [], rules: [] })),
      };
    },
  },
  {
    name: "like the engine: tasks that finished, a section each inside a notification, made with a key that shows only when a task has no lines",
    run: (modules) => {
      const { jsx, jsxs, renderContent } = kit(modules);
      const Completions = ({ completions }) =>
        jsxs("section", {
          title: "system_notification",
          children: [
            jsx("p", { children: completions.length === 1 ? "The following task has finished." : "The following tasks finished." }),
            completions.map((lines, index) => jsx("section", { title: "task", children: lines.join("\n") }, index)),
          ],
        });
      const shell = ["kind: shell", "status: success", "task_id: 41", "title: npm test", "detail: 12 passed,   0 failed\n  (see the log)", "output_path: /tmp/out.txt"];
      const agent = ["kind: subagent", "status: error", "task_id: 42", "title: Review the diff", "agent_id: a-7"];
      return {
        one: renderContent(jsx(Completions, { completions: [shell] })),
        two: renderContent(jsx(Completions, { completions: [shell, agent] })),
        aTaskWithoutLines: renderContent(jsx(Completions, { completions: [[], agent, []] })),
        none: renderContent(jsx(Completions, { completions: [] })),
      };
    },
  },
  {
    name: "like the engine: the sandbox described by components that return Fragments, with paragraphs and items that may be absent",
    run: (modules) => {
      const { jsx, jsxs, Fragment, renderContent } = kit(modules);
      const Allowlist = ({ network }) =>
        jsxs(Fragment, {
          children: [
            network.hasDefaults && jsx("p", { children: "The sandbox includes network access for common package managers and version control providers." }),
            network.entries.length > 0 && jsxs("p", { children: [network.hasDefaults ? "Additionally, the" : "The", " sandbox includes network access for the following domains:", " ", network.entries.join(", "), "."] }),
            jsx("p", { children: "For broader network access beyond the allowed domains, you may still need to request 'full_network' permissions." }),
          ],
        });
      const Body = ({ isReadonly, network }) => {
        const inside = network.hasDefaults || network.entries.length > 0;
        if (isReadonly) {
          return jsxs(Fragment, {
            children: [
              jsxs("p", { children: ["Your commands will run in a readonly sandbox.", inside ? "" : " Network access is disallowed by default."] }),
              inside && jsx(Allowlist, { network }),
              jsx("p", { children: "The required_permissions argument is used to request additional permissions:" }),
              jsx("ul", { children: jsx("li", { children: inside ? "full_network: Grants unrestricted network access beyond the allowed domains." : "full_network: Grants unrestricted network access." }) }),
            ],
          });
        }
        return jsxs(Fragment, {
          children: [
            jsx("p", { children: "By default, your commands will run in a sandbox." }),
            inside && jsx(Allowlist, { network }),
            jsx("p", { children: "The following permissions are supported:" }),
            jsxs("ul", {
              children: [
                !inside && jsx("li", { children: "full_network: Grants unrestricted network access to run a server or contact the internet." }),
                inside && jsx("li", { children: "full_network: Grants unrestricted network access." }),
                jsx("li", { children: "all: Disables the sandbox entirely." }),
              ],
            }),
            jsx("p", { children: "If you think a command failed due to sandbox restrictions, run it again with what you need." }),
          ],
        });
      };
      const Described = (props) => jsx("section", { title: "Sandboxing", children: jsx(Body, props) });
      const none = { hasDefaults: false, entries: [] };
      const defaults = { hasDefaults: true, entries: [] };
      const both = { hasDefaults: true, entries: ["example.com", "*.example.org"] };
      const entries = { hasDefaults: false, entries: ["example.com"] };
      return {
        asASection: renderContent(jsx(Described, { isReadonly: false, network: both })),
        asASectionReadonly: renderContent(jsx(Described, { isReadonly: true, network: none })),
        theBodyCalledAsAFunction: renderContent(Body({ isReadonly: false, network: none })),
        theBodyCalledAsAFunctionWithDefaults: renderContent(Body({ isReadonly: false, network: defaults })),
        theBodyCalledAsAFunctionReadonly: renderContent(Body({ isReadonly: true, network: entries })),
      };
    },
  },
  {
    name: "like the engine: the commit protocol, a numbered list in a dash list and dash lists in a numbered list, an example kept in a tag",
    run: (modules) => {
      const { jsx, jsxs, renderContent } = kit(modules);
      const scope = " (unless the rule says so)";
      const Committing = ({ shellToolName, scoped }) =>
        jsxs("section", {
          title: "Committing changes with git",
          children: [
            jsx("p", { children: "Only create commits when requested by the user. If unclear, ask first." }),
            jsx("p", { children: "Git Safety Protocol:" }),
            jsxs("ul", {
              children: [
                jsx("li", { children: "NEVER update the git config" }),
                jsxs("li", { children: ["NEVER skip hooks unless the user explicitly requests it", scoped ? scope : ""] }),
                jsxs("li", {
                  children: [
                    "Avoid git commit --amend. ONLY use --amend when ALL conditions are met:",
                    jsxs("ol", { children: [jsx("li", { children: "User explicitly requested amend" }), jsx("li", { children: "HEAD commit was created by you in this conversation" }), jsx("li", { children: 'Commit has NOT been pushed to remote (verify: git status shows "Your branch is ahead")' })] }),
                  ],
                }),
                jsxs("li", { children: ["CRITICAL: If you already pushed to remote, NEVER amend", scoped ? scope : "", " (requires force push)"] }),
              ],
            }),
            jsxs("ol", {
              children: [
                jsxs("li", {
                  children: [
                    "ALWAYS run the following shell commands in parallel, each using the ",
                    shellToolName,
                    " tool:",
                    jsxs("ul", { children: [jsx("li", { children: "Run a git status command to see all untracked files." }), jsx("li", { children: "Run a git diff command to see both staged and unstaged changes." })] }),
                  ],
                }),
                jsxs("li", { children: ["Run the following commands sequentially:", jsxs("ul", { children: [jsx("li", { children: "Add relevant untracked files to the staging area." }), jsx("li", { children: "Commit the changes with the message." })] })] }),
                jsx("li", { children: "If the commit fails due to pre-commit hook, fix the issue and create a NEW commit" }),
              ],
            }),
            jsx("p", { children: "In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:" }),
            jsx("x", { tag: "example", children: "git commit -m \"$(cat <<'EOF'\n   Commit message here.\n\n   EOF\n   )\"" }),
          ],
        });
      return {
        plain: renderContent(jsx(Committing, { shellToolName: "Shell", scoped: false })),
        scoped: renderContent(jsx(Committing, { shellToolName: "Bash", scoped: true })),
      };
    },
  },
  {
    name: "like the engine: reminders made of paragraphs in a Fragment, headings in a section, a paragraph shown only when asked",
    run: (modules) => {
      const { jsx, jsxs, Fragment, renderContent } = kit(modules);
      const Reminder = ({ toolName, quiet }) =>
        jsxs(Fragment, {
          children: [
            jsx("p", { children: "The user has engaged **Multitask Mode**." }),
            jsxs("p", { children: ["Delegate with the ", toolName, " tool, in the background."] }),
            !quiet && jsx("p", { children: "You will be notified when each task finishes." }),
          ],
        });
      const ComputerUse = ({ isSubagent }) =>
        jsxs("section", {
          title: "computer_use",
          children: [
            jsx("p", { children: "You have access to the `computer` tool which allows you to interact with the desktop." }),
            jsx("h2", { children: "When to Use Computer-Use" }),
            isSubagent ? jsxs("p", { children: ["Use the `computer` tool ", "directly", "."] }) : jsx("p", { children: "Hand desktop work to the computer-use subagent." }),
            jsxs("h3", { children: ["Step ", 2, ": Check the result"] }),
            jsxs("ul", { children: [jsx("li", { children: "Take a screenshot" }), isSubagent && jsx("li", { children: "Report what you saw" })] }),
          ],
        });
      const Suggestion = (props) =>
        jsxs("section", {
          title: "suggestion_mode",
          children: [
            jsx("p", { children: "[SUGGESTION MODE: Suggest what user might naturally type next.]" }),
            jsx("p", { children: "EXAMPLES:" }),
            jsxs("ul", { children: [jsxs("li", { children: ['User asked "fix the bug and run tests", bug is fixed →', " ", '"run the tests"'] }), jsx("li", { children: 'After code written → "Try it out"' })] }),
            jsx("p", { children: "Reply with ONLY suggestion, no quotes or explanation." }),
            props.isShort && jsx("p", { children: "IMPORTANT: Produce no more than 20 words of thinking tokens." }),
          ],
        });
      return {
        reminder: renderContent(Reminder({ toolName: "Task", quiet: false })),
        reminderQuiet: renderContent(Reminder({ toolName: "Task", quiet: true })),
        computerUse: renderContent(jsx(ComputerUse, { isSubagent: false })),
        computerUseForASubagent: renderContent(jsx(ComputerUse, { isSubagent: true })),
        suggestion: renderContent(jsx(Suggestion, { isShort: false })),
        suggestionShort: renderContent(jsx(Suggestion, { isShort: true })),
        aSectionFoundInAText: "before\n\n<available_subagent_types>\nexplore, shell\n</available_subagent_types>\n\nafter".includes(renderContent(jsx(() => jsx("section", { title: "available_subagent_types", children: jsx("p", { children: "explore, shell" }) }), {}))),
      };
    },
  },
];
