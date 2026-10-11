// The emoji list the Mac's window uses, for ":" in the composer and "More
// emoji" on a message: emojibase's data and shortcodes (MIT), read from the
// window's own copy (clients/apps/web/public/app/assets: compact, messages,
// iamcal, emojibase) and laid out as the window lays them out (its `ayn`):
// each group but "components", each emoji and its skin tones, its id (its
// first shortcode, else its code), its name (capitalised), the character
// without a needless variation selector, its shortcodes, and the words
// search reads. Written to SimeonCore's resources (EmojiCatalog reads it).
//
//   node ios/scripts/make-emoji.mjs
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "clients/apps/web/public/app/assets");
const out = join(root, "ios/SimeonCore/Sources/SimeonCore/Resources");

const find = (prefix) => {
  const name = readdirSync(assets).find((file) => file.startsWith(`${prefix}-`) && file.endsWith(".js"));
  if (name == null) throw new Error(`no ${prefix}-*.js in ${assets}`);
  return join(assets, name);
};

// The window's modules, imported as they are (each exports its data as the default).
const work = mkdtempSync(join(tmpdir(), "simeon-emoji-"));
const load = async (prefix) => {
  const copy = join(work, `${prefix}.mjs`);
  copyFileSync(find(prefix), copy);
  return (await import(pathToFileURL(copy).href)).default;
};

try {
  const emojis = await load("compact");
  const messages = await load("messages");
  const iamcal = await load("iamcal");
  const emojibase = await load("emojibase");

  const list = (value) => (typeof value === "string" ? [value] : value ?? []);
  const shortcodes = (hexcode) => [...new Set([...list(iamcal[hexcode]), ...list(emojibase[hexcode])])];
  const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const native = (text) => text.replace(/(\p{Emoji_Presentation})️/gu, "$1");

  const byGroup = new Map();
  for (const emoji of emojis) {
    if (emoji.group == null) continue;
    if (!byGroup.has(emoji.group)) byGroup.set(emoji.group, []);
    for (const one of [emoji, ...(emoji.skins ?? [])]) {
      const codes = shortcodes(one.hexcode);
      const id = codes[0] ?? one.hexcode;
      const search = [one.label, id, ...codes, ...(one.tags ?? []), ...list(one.emoticon)].join(" ").toLowerCase();
      byGroup.get(emoji.group).push([id, capitalised(one.label), native(one.unicode), codes, search]);
    }
  }

  const categories = [];
  for (const group of messages.groups) {
    if (group.key === "component") continue;
    const items = byGroup.get(group.order);
    if (items == null || items.length === 0) continue;
    categories.push({ id: group.key, label: capitalised(group.message), emojis: items });
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "emoji.json"), JSON.stringify({ categories }));
  const count = categories.reduce((sum, category) => sum + category.emojis.length, 0);
  console.log(`emoji.json: ${categories.length} groups, ${count} emoji`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
