/**
 * The letters in the sidebar's bottom-row circle, and the first name beside
 * it (docs/maties/design.md, section 3, row 5). Pure, so it can be tested.
 */
const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const isWordCharacter = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);

const getWords = (name: string): string[] => (
  collapseWhitespace(name)
    .split(' ')
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word.length > 0)
);

/** « Emma Watson » → « EW »; « emma » → « E »; an email → its first letter; nothing → « ». */
export const getPersonInitials = (name: string | null | undefined): string => {
  if (!name) return '';
  const local = name.includes('@') ? name.split('@')[0] : name;
  const words = getWords(local.replace(/[._-]+/g, ' '));
  if (words.length === 0) return '';
  const first = Array.from(words[0]).find(isWordCharacter) ?? '';
  const last = words.length > 1
    ? Array.from(words[words.length - 1]).find(isWordCharacter) ?? ''
    : '';
  return `${first}${last}`.toUpperCase();
};

/** « Emma Watson » → « Emma »; an email → the part before the @; nothing → the fallback. */
export const getPersonFirstName = (name: string | null | undefined, fallback: string): string => {
  if (!name) return fallback;
  const local = name.includes('@') ? name.split('@')[0] : name;
  const words = getWords(local);
  return words[0] ?? fallback;
};
