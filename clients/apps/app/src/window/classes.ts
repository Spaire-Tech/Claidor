/**
 * A class list from its parts, the ones that are off left out. Written this
 * way rather than as one string because the formatter's Tailwind plugin
 * trims the space before a class added inside a `className` template
 * ("bubble theirs" + " short" became "bubble theirsshort").
 */
export const classes = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ')
