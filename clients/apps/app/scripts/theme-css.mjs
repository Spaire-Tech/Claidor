// The chosen theme in the stylesheets (src/window/theme.ts). The window's
// dark colours are written once, under `@media (prefers-color-scheme:
// dark)`. This PostCSS step, run by Vite on every stylesheet, makes each of
// those rules follow a theme chosen in Settings too:
//
// - under the query, it applies unless Light was chosen
//   (`:root:not([data-theme="light"])`);
// - a copy outside the query applies when Dark was chosen
//   (`:root[data-theme="dark"]`).
//
// The condition is wrapped in `:where()`, so each rule weighs exactly what
// it weighed before and the cascade is unchanged. Write dark rules as
// before; nothing else is needed.

const query = /^\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/

/** A selector that applies only when `condition` holds on the page's root. */
export function scoped(selector, condition) {
  const s = selector.trim()
  // The root itself (`:root`, `html`): the condition on it, its weight kept.
  const root = /^(:root|html)(?![\w-])/.exec(s)
  if (root) {
    return `${root[1]}:where(${condition})${s.slice(root[1].length)}`
  }
  return `:where(:root${condition}) ${s}`
}

function scopeRules(container, condition) {
  container.walkRules((rule) => {
    // A keyframe's steps (`from`, `50%`) are not selectors.
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name))
      return
    rule.selectors = rule.selectors.map((selector) =>
      scoped(selector, condition),
    )
  })
}

export function themeCSS() {
  return {
    postcssPlugin: 'simeon-theme',
    AtRule: {
      media(atRule) {
        if (!query.test(atRule.params.trim())) return
        if (atRule.raws.simeonTheme) return
        atRule.raws.simeonTheme = true
        const chosen = atRule.clone()
        scopeRules(atRule, ':not([data-theme="light"])')
        scopeRules(chosen, '[data-theme="dark"]')
        atRule.after(chosen.nodes)
      },
    },
  }
}
themeCSS.postcss = true
