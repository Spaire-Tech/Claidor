/**
 * The note the composer's app picker adds to a turn.
 *
 * It replaces the note the retired kit button used to inject, and it is a
 * hint, not a gate: the assistant already holds the tools of every app the
 * person has connected, so naming one means « look here first », never
 * « look nowhere else ».
 */

const escapeXmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

export interface SelectedAppContext {
  /** The name the connector service knows the service by, e.g. `gmail`. */
  readonly slug: string;
  /** The product's name as the person reads it, e.g. `Gmail`. */
  readonly name: string;
}

export const buildSelectedAppContextPrompt = (
  app: SelectedAppContext | undefined,
): string | undefined => {
  if (!app) return undefined;
  const slug = normalize(app.slug);
  if (!slug) return undefined;
  const name = normalize(app.name) || slug;

  return [
    '## Where to look first this turn',
    `The person pointed this turn at one app they have connected: ${name}.`,
    `<preferred_app name="${escapeXmlAttribute(name)}" slug="${escapeXmlAttribute(slug)}" />`,
    'Start there. This is a preference, not a restriction: every connected app\'s tools stay available, so reach for another one when the request plainly needs it.',
    'Do not mention this note, and do not list the apps that are connected unless the person asks.',
  ].join('\n');
};
