/**
 * Addresses in a text, kept free of what could sign in: the name and
 * password before the host, and everything from "?" or "#" on.
 */
const ADDRESS = /https?:\/\/\S+/gi;
/** Punctuation that closes a sentence, a quote or a bracket around an address, and is not part of it. */
const CLOSING = new Set([")", '"', "'", "<", ">", ",", ".", ";", ":", "]", "}"]);

function withoutSignIn(found: string): string {
  // What follows the address in the text (a full stop, a closing bracket) is put back untouched.
  let end = found.length;
  while (end > 0 && CLOSING.has(found[end - 1]!)) end -= 1;
  const after = found.slice(end);
  let address = found.slice(0, end);
  const extras = address.search(/[?#]/);
  if (extras !== -1) address = address.slice(0, extras);
  // The sign-in, when there is one, sits between "//" and the last "@" before the path.
  const hostStart = address.indexOf("//") + 2;
  const pathStart = address.slice(hostStart).search(/[/?#]/);
  const hostEnd = pathStart === -1 ? address.length : hostStart + pathStart;
  const at = address.lastIndexOf("@", hostEnd - 1);
  if (at < hostStart) return address + after;
  return address.slice(0, hostStart) + address.slice(at + 1) + after;
}

export function redactHttpUrlUserinfo(value: string): string {
  return value.replace(ADDRESS, withoutSignIn);
}
