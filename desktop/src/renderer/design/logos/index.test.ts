import { describe, expect, test } from 'vitest';

import { bundledLogoSlugs, logoMonogram, logoSlug, logoUrl } from './index';

/**
 * The catalogue as the canvas lists it — nine categories, the services in
 * each. Kept here rather than imported because it is the design's list,
 * and this test exists to say how much of it we can actually draw.
 */
const CATALOGUE: readonly string[] = [
  'Gmail', 'Outlook', 'Google Calendar', 'Apple Calendar',
  'WhatsApp', 'iMessage', 'Slack', 'Microsoft Teams', 'Telegram', 'Discord',
  'Google Drive', 'Google Docs', 'Google Sheets', 'Google Slides', 'OneDrive',
  'Word', 'Excel', 'PowerPoint', 'Dropbox', 'Notion', 'Apple Notes',
  'Todoist', 'Apple Reminders', 'Google Tasks', 'Trello', 'Asana', 'Monday',
  'Zoom', 'Google Meet', 'Fathom', 'Otter',
  'Canva', 'Figma', 'Adobe Express', 'YouTube Studio',
  'Stripe', 'PayPal', 'QuickBooks', 'Xero', 'Shopify', 'Amazon Seller',
  'HubSpot', 'Salesforce', 'Pipedrive', 'Intercom', 'Calendly',
  'GitHub', 'GitLab', 'Linear', 'Jira', 'Supabase', 'Vercel',
];

describe('logoSlug', () => {
  test('matches how the extracted files are named', () => {
    expect(logoSlug('Google Calendar')).toBe('google-calendar');
    expect(logoSlug('Apple Calendar')).toBe('apple-calendar');
    expect(logoSlug('YouTube Studio')).toBe('youtube-studio');
    expect(logoSlug('  Gmail  ')).toBe('gmail');
  });
});

describe('logoUrl', () => {
  test('resolves the logos we ship', () => {
    for (const name of ['Gmail', 'Outlook', 'Zoom', 'Excel', 'Google Drive']) {
      expect(logoUrl(name), name).toBeTruthy();
    }
  });

  test('returns nothing rather than reaching for a third party', () => {
    // The point of the whole module. A service we have no file for gets
    // the monogram, not a request to DuckDuckGo or Google.
    expect(logoUrl('Some Service We Do Not Ship')).toBeUndefined();
  });

  test('every bundled file is reachable by its service name', () => {
    const reachable = CATALOGUE.map(logoSlug);
    // A file whose name does not match its service is a file that never
    // draws. The extracted apple-calendar-mac was exactly that until it
    // was renamed, and this is what caught it.
    for (const slug of bundledLogoSlugs()) {
      expect(reachable, slug).toContain(slug);
    }
  });
});

describe('the catalogue', () => {
  test('every service either has a logo or a monogram, and none is blank', () => {
    for (const name of CATALOGUE) {
      const drawn = logoUrl(name) ?? logoMonogram(name);
      expect(drawn, name).toBeTruthy();
    }
  });

  test('records which logos are still missing', () => {
    // Not a failure: the remaining files are brand assets with their own
    // licensing, and which ones we ship is the founder's call. This exists
    // so the number is visible and shrinks deliberately rather than by
    // accident. Update it when logos are added.
    const missing = CATALOGUE.filter(name => !logoUrl(name));
    expect(missing).toEqual([
      'WhatsApp',
      'Slack',
      'Microsoft Teams',
      'Telegram',
      'Discord',
      'Dropbox',
      'Notion',
      'Todoist',
      'Google Tasks',
      'Trello',
      'Asana',
      'Monday',
      'Otter',
      'Canva',
      'Figma',
      'Adobe Express',
      'YouTube Studio',
      'Stripe',
      'PayPal',
      'QuickBooks',
      'Xero',
      'Shopify',
      'Amazon Seller',
      'HubSpot',
      'Salesforce',
      'Pipedrive',
      'Intercom',
      'Calendly',
      'GitHub',
      'GitLab',
      'Linear',
      'Jira',
      'Supabase',
      'Vercel',
    ]);
  });
});
