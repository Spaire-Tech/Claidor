"""Convert the Claidor v1 design template to JSX.

The design (docs/design/claidor-v1-markup.html) is written in a small
template DSL rendered by the file's own runtime:

  {{ expr }}                     value interpolation
  sc-if value="{{ x }}"          conditional block (element vanishes)
  sc-for list="{{ xs }}" as="c"  repetition (element vanishes)
  sc-camel-on-click="{{ f }}"    onClick handler
  sc-camel-view-box="…"          viewBox (camelised attribute)
  style-hover="…"                hover style, applied by the runtime

This script performs a mechanical, reviewable translation to JSX against
the value object produced by the ported component logic (renderVals() in
docs/design/claidor-v1-app.jsx). Top-level template names resolve to
`v.<name>`; loop variables stay bare. Hover styles become generated CSS
classes so the output needs no runtime.

The output is generated code, committed for review but never hand-edited:
fidelity fixes go into this converter and the file is regenerated.
"""

import hashlib
import html as htmllib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKUP = ROOT / "docs/design/claidor-v1-markup.html"
LOGIC = ROOT / "docs/design/claidor-v1-app.jsx"
OUT_APP = ROOT / "clients/apps/web/src/components/ClaidorDesign/generated/App.tsx"
OUT_TSX = ROOT / "clients/apps/web/src/components/ClaidorDesign/generated/View.tsx"
OUT_CSS = ROOT / "clients/apps/web/src/components/ClaidorDesign/generated/hover.css"

VOID_TAGS = {"br", "hr", "img", "input", "meta", "link"}

ATTR_RENAMES = {
    "class": "className",
    "sc-camel-view-box": "viewBox",
    "sc-camel-on-click": "__onclick__",
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
    "autocomplete": "autoComplete",
    "spellcheck": "spellCheck",
    "rowspan": "rowSpan",
    "colspan": "colSpan",
}

hover_classes: dict[str, str] = {}


def css_prop_to_js(prop: str) -> str:
    parts = prop.strip().split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def scope_expr(expr: str, scope: set[str]) -> str:
    """Prefix top-level identifiers with v. unless they are loop vars."""
    expr = expr.strip()
    root = re.match(r"[A-Za-z_$][A-Za-z0-9_$]*", expr)
    if root and root.group(0) not in scope and root.group(0) not in (
        "true",
        "false",
        "null",
        "undefined",
    ):
        return "v." + expr
    return expr


def style_to_jsx(style: str, scope: set[str]) -> str:
    """style="a:b;c:{{ x }}" -> {{a:'b', c: x}} (template literal if mixed)."""
    entries = []
    for decl in style.split(";"):
        if ":" not in decl:
            continue
        prop, _, value = decl.partition(":")
        prop_js = css_prop_to_js(prop)
        if not prop_js:
            continue
        value = value.strip()
        parts = re.split(r"\{\{(.*?)\}\}", value)
        if len(parts) == 1:
            entries.append(f"{prop_js!r}: {value!r}")
        else:
            pieces = []
            for i, part in enumerate(parts):
                if i % 2 == 0:
                    if part:
                        pieces.append(part.replace("`", "\\`").replace("${", "\\${"))
                else:
                    pieces.append("${" + scope_expr(part, scope) + "}")
            only = re.fullmatch(r"\$\{(.*)\}", "".join(pieces), re.S)
            if only and len(parts) == 3 and not (parts[0] or parts[2]):
                entries.append(f"{prop_js!r}: {scope_expr(parts[1], scope)}")
            else:
                entries.append(f"{prop_js!r}: `" + "".join(pieces) + "`")
    return "{{" + ", ".join(entries) + "}}"


def hover_class_for(style: str) -> str:
    key = hashlib.sha1(style.encode()).hexdigest()[:8]
    name = f"dh-{key}"
    if name not in hover_classes:
        decls = []
        for decl in style.split(";"):
            if ":" in decl:
                prop, _, value = decl.partition(":")
                decls.append(f"{prop.strip()}: {value.strip()} !important")
        hover_classes[name] = "; ".join(decls)
    return name


def text_to_jsx(text: str, scope: set[str]) -> str:
    out = []
    for i, part in enumerate(re.split(r"\{\{(.*?)\}\}", text)):
        if i % 2 == 0:
            if part.strip() or (part and not part.isspace()):
                escaped = part.replace("{", "&#123;").replace("}", "&#125;")
                out.append(escaped)
            elif part:
                out.append(part)
        else:
            out.append("{" + scope_expr(part, scope) + "}")
    return "".join(out)


TAG_RE = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(/?)>", re.S)
ATTR_RE = re.compile(r'([a-zA-Z-]+)(?:="([^"]*)")?')


#: Assets that lived inside the design bundle, mapped to committed files.
BUNDLE_ASSETS = {
    "440a34b3-5c36-4045-8b0e-711e27ec85bb": "/claidor-mark.png",
}


def parse_attrs(raw: str) -> list[tuple[str, str | None]]:
    return [
        (m.group(1), BUNDLE_ASSETS.get(m.group(2), m.group(2)))
        for m in ATTR_RE.finditer(raw)
    ]


class Node:
    def __init__(self, tag: str, attrs: list[tuple[str, str | None]]):
        self.tag = tag
        self.attrs = attrs
        self.children: list["Node | str"] = []


def parse(fragment: str) -> list["Node | str"]:
    root = Node("__root__", [])
    stack = [root]
    pos = 0
    for m in TAG_RE.finditer(fragment):
        text = fragment[pos : m.start()]
        if text:
            stack[-1].children.append(htmllib.unescape(text))
        pos = m.end()
        closing, tag, rawattrs, selfclose = m.groups()
        if closing:
            while len(stack) > 1 and stack[-1].tag != tag:
                stack.pop()
            if len(stack) > 1:
                stack.pop()
        else:
            node = Node(tag, parse_attrs(rawattrs))
            stack[-1].children.append(node)
            if not selfclose and tag not in VOID_TAGS:
                stack.append(node)
    tail = fragment[pos:]
    if tail:
        stack[-1].children.append(htmllib.unescape(tail))
    return root.children


def emit(node, scope: set[str], indent: int) -> str:
    pad = "  " * indent
    if isinstance(node, str):
        rendered = text_to_jsx(node, scope)
        return pad + rendered if rendered.strip() else ""

    attrs = dict(node.attrs)

    if node.tag == "sc-if":
        cond = re.search(r"\{\{(.*?)\}\}", attrs.get("value") or "")
        expr = scope_expr(cond.group(1), scope) if cond else "false"
        inner = children_jsx(node, scope, indent + 1)
        return f"{pad}{{({expr}) ? (\n{pad}  <>\n{inner}\n{pad}  </>\n{pad}) : null}}"

    if node.tag == "sc-for":
        lst = re.search(r"\{\{(.*?)\}\}", attrs.get("list") or "")
        var = attrs.get("as") or "item"
        expr = scope_expr(lst.group(1), scope) if lst else "[]"
        inner = children_jsx(node, scope | {var}, indent + 1)
        return (
            f"{pad}{{({expr}).map(({var}, {var}Idx) => (\n"
            f"{pad}  <Fragment key={{{var}Idx}}>\n{inner}\n{pad}  </Fragment>\n"
            f"{pad}))}}"
        )

    if node.tag in ("helmet", "x-dc", "script", "noscript"):
        if node.tag == "x-dc":
            return children_jsx(node, scope, indent)
        return ""

    parts = []
    classes = []
    for name, value in node.attrs:
        if value is None:
            # Bare boolean attribute (multiple, disabled…) → JSX boolean.
            parts.append(ATTR_RENAMES.get(name, name))
            continue
        if name == "style":
            parts.append(f"style={style_to_jsx(value, scope)}")
        elif name == "style-hover":
            classes.append(hover_class_for(value))
        elif name == "class":
            classes.append(value)
        elif name == "sc-camel-on-click":
            m = re.search(r"\{\{(.*?)\}\}", value)
            if m:
                parts.append(f"onClick={{{scope_expr(m.group(1), scope)}}}")
        elif name in ("sc-camel-on-input", "sc-camel-on-key-down", "sc-camel-on-change"):
            event = {
                "sc-camel-on-input": "onInput",
                "sc-camel-on-change": "onChange",
                "sc-camel-on-key-down": "onKeyDown",
            }[name]
            m = re.search(r"\{\{(.*?)\}\}", value)
            if m:
                parts.append(f"{event}={{{scope_expr(m.group(1), scope)}}}")
        elif name == "sc-camel-value":
            m = re.search(r"\{\{(.*?)\}\}", value)
            if m:
                parts.append(f"value={{{scope_expr(m.group(1), scope)}}}")
        elif name == "sc-camel-ref":
            m = re.search(r"\{\{(.*?)\}\}", value)
            if m:
                parts.append(f"ref={{{scope_expr(m.group(1), scope)}}}")
        else:
            react_name = ATTR_RENAMES.get(name, name)
            if react_name == "__onclick__":
                continue
            if "{{" in value:
                m = re.fullmatch(r"\{\{(.*?)\}\}", value.strip())
                if m:
                    parts.append(f"{react_name}={{{scope_expr(m.group(1), scope)}}}")
                else:
                    pieces = []
                    for i, part in enumerate(re.split(r"\{\{(.*?)\}\}", value)):
                        if i % 2 == 0:
                            pieces.append(part.replace("`", "\\`"))
                        else:
                            pieces.append("${" + scope_expr(part, scope) + "}")
                    parts.append(f"{react_name}={{`" + "".join(pieces) + "`}}")
            else:
                parts.append(f'{react_name}="{value}"')

    if classes:
        parts.append(f'className="{" ".join(classes)}"')

    attrstr = (" " + " ".join(parts)) if parts else ""
    if node.tag in VOID_TAGS or not node.children:
        return f"{pad}<{node.tag}{attrstr} />"
    inner = children_jsx(node, scope, indent + 1)
    return f"{pad}<{node.tag}{attrstr}>\n{inner}\n{pad}</{node.tag}>"


def children_jsx(node, scope, indent) -> str:
    out = [emit(child, scope, indent) for child in node.children]
    return "\n".join(o for o in out if o)


def main() -> None:
    src = MARKUP.read_text()
    # The saved markup is already the page fragment, rooted at <x-dc>.
    content = re.sub(r"<script.*?</script>", "", src, flags=re.S)
    content = re.sub(r"<!--.*?-->", "", content, flags=re.S)
    # The design's own stylesheet (tokens, dark set, scrollbars) travels
    # with the port, scoped to the mount root instead of :root.
    styles = re.findall(r"<style>(.*?)</style>", content, re.S)
    design_css = "\n".join(styles)
    # The bundled @font-face blocks point at bundle-internal uuids; the app
    # loads Source Serif 4 itself (next/font), so map the family instead.
    design_css = re.sub(r"@font-face\s*\{[^}]*\}", "", design_css)
    design_css = design_css.replace(":root", ".claidor-design")
    design_css = design_css.replace(
        "html[data-claidor-dark]", "html[data-claidor-dark] .claidor-design"
    )
    design_css = design_css.replace("'Source Serif 4'", "var(--font-claidor-serif)")
    content = re.sub(r"<style>.*?</style>", "", content, flags=re.S)
    content = re.sub(r"<helmet>.*?</helmet>", "", content, flags=re.S)
    nodes = parse(content)
    jsx = children_jsx(Node("__root__", []).__class__("__root__", []), set(), 0)
    root = Node("__root__", [])
    root.children = nodes
    jsx = children_jsx(root, set(), 3)
    jsx = jsx.replace("'Source Serif 4'", "var(--font-claidor-serif)")

    OUT_TSX.parent.mkdir(parents=True, exist_ok=True)
    OUT_TSX.write_text(
        "// GENERATED by dev/design_port/convert.py — do not edit by hand.\n"
        "// Fidelity fixes belong in the converter; regenerate after.\n"
        "// @ts-nocheck\n"
        "/* eslint-disable */\n"
        "import { Fragment } from 'react'\n"
        "import './hover.css'\n\n"
        "// eslint-disable-next-line @typescript-eslint/no-explicit-any\n"
        "export const DesignView = ({ v }: { v: any }) => {\n"
        "  return (\n"
        "    <>\n" + jsx + "\n    </>\n  )\n}\n"
    )
    css = "\n".join(
        f".{name}:hover {{ {decls}; }}" for name, decls in sorted(hover_classes.items())
    )
    neutralize = """
/* Host neutralization: the surrounding app ships @tailwindcss/forms,
   which gives every input a border, its own padding and a blue focus
   ring. None of that exists in the design's own page, so none of it may
   reach the design's fields; the design styles its fields inline. */
.claidor-design input,
.claidor-design textarea,
.claidor-design select,
.claidor-design button {
  appearance: none;
  -webkit-appearance: none;
  background: none;
  border: none;
  margin: 0;
  padding: 0;
  font: inherit;
  line-height: inherit;
  color: inherit;
  border-radius: 0;
  box-shadow: none;
}
.claidor-design input:focus,
.claidor-design textarea:focus,
.claidor-design select:focus,
.claidor-design button:focus,
.claidor-design input:focus-visible,
.claidor-design textarea:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  --tw-ring-shadow: 0 0 #0000 !important;
  --tw-ring-offset-shadow: 0 0 #0000 !important;
  border-color: inherit;
}
"""
    OUT_CSS.write_text(
        "/* GENERATED by dev/design_port/convert.py. Design stylesheet with\n"
        "   :root re-scoped to .claidor-design, then hover styles compiled\n"
        "   from style-hover attributes. */\n"
        + design_css
        + "\n"
        + neutralize
        + "\n"
        + css
        + "\n"
    )
    # Logic emission retired: components/ClaidorDesign/logic.tsx is
    # maintained code now (it diverges from the design file exactly where
    # screens get wired to the real backend). Only the View is generated.
    # (App.tsx emission removed — logic.tsx is maintained.)
    print(f"wrote {OUT_TSX} ({OUT_TSX.stat().st_size} bytes)")
    print(f"wrote {OUT_CSS} ({len(hover_classes)} hover classes)")


if __name__ == "__main__":
    main()
