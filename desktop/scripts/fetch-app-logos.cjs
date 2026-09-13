#!/usr/bin/env node
/**
 * Writes the brand marks of the connections catalogue
 * (src/shared/connections/catalog.ts) into public/logos/apps as coloured
 * SVG files, taken from the `simple-icons` npm package (CC0) so nothing is
 * fetched at run time. The founder's own logo files sit in the same folder
 * under their own names and are not touched.
 *
 * Run once after changing the list below, then commit the output:
 *   node scripts/fetch-app-logos.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'logos', 'apps');

/** simple-icons slugs; the file is `<slug>.svg`. */
const SLUGS = [
  'airbnb',
  'asana',
  'bookingdotcom',
  'calendly',
  'discord',
  'doordash',
  'dropbox',
  'facebook',
  'figma',
  'github',
  'gitlab',
  'googletasks',
  'hubspot',
  'instagram',
  'intercom',
  'jira',
  'linear',
  'notion',
  'paypal',
  'quickbooks',
  'shopify',
  'signal',
  'stripe',
  'supabase',
  'telegram',
  'tiktok',
  'todoist',
  'trello',
  'vercel',
  'whatsapp',
  'x',
  'xero',
  'youtube',
  'youtubestudio',
];

const escapeXml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const renderIcon = (icon) => [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${icon.hex}" role="img">`,
  `<title>${escapeXml(icon.title)}</title>`,
  `<path d="${icon.path}"/>`,
  '</svg>',
  '',
].join('\n');

const main = () => {
  const icons = require('simple-icons');
  const bySlug = new Map(Object.values(icons).map((icon) => [icon.slug, icon]));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const missing = [];
  for (const slug of SLUGS) {
    const icon = bySlug.get(slug);
    if (!icon) {
      missing.push(slug);
      continue;
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, `${slug}.svg`), renderIcon(icon));
  }

  console.log(`[logos] wrote ${SLUGS.length - missing.length} files to ${path.relative(process.cwd(), OUTPUT_DIR)}`);
  if (missing.length > 0) {
    console.error(`[logos] not in simple-icons: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
};

main();
