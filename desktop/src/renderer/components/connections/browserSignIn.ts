/**
 * Signing in to a connected app inside the assistant's own browser.
 *
 * A connection and a browser sign-in are two different doors to the same
 * service, and neither knows about the other: the connection is the access
 * Claidor holds, the browser is the assistant's own and keeps what it is
 * given. Because that browser keeps its own profile, the person signs in
 * there once per service and never again, which is the fact the card says
 * out loud (see the managed « Seeing A Connected App » instructions in
 * `src/main/libs/openclawConfigSync.ts`, which the assistant follows when it
 * offers the same thing mid-conversation).
 *
 * Only an account card that is connected makes the offer. A `Browser` card is
 * a browser session and nothing else, so there is no first door to contradict
 * and nothing on the card to explain; a `Local` card never opens a page at
 * all.
 */
import { BrowserDisplayMode } from '@shared/browserWebAccess/constants';
import { type ConnectionItem, ConnectionKind } from '@shared/connections/catalog';

import { ConnectionCardState } from './connectionState';

/**
 * Where each service the catalogue can connect lives on the web: the page the
 * assistant's browser is sent to, which is also where that service asks for
 * the sign-in. A service missing here makes no offer rather than a guess.
 */
export const APP_WEB_ADDRESSES: Readonly<Record<string, string>> = {
  asana: 'https://app.asana.com',
  calendly_v2: 'https://calendly.com/event_types/user/me',
  canva: 'https://www.canva.com',
  dropbox: 'https://www.dropbox.com/home',
  fathom: 'https://fathom.video',
  figma: 'https://www.figma.com/files',
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  gmail: 'https://mail.google.com',
  google_calendar: 'https://calendar.google.com',
  google_docs: 'https://docs.google.com/document',
  google_drive: 'https://drive.google.com',
  google_meet: 'https://meet.google.com',
  google_sheets: 'https://docs.google.com/spreadsheets',
  google_slides: 'https://docs.google.com/presentation',
  google_tasks: 'https://tasks.google.com',
  hubspot: 'https://app.hubspot.com',
  intercom: 'https://app.intercom.com',
  jira: 'https://id.atlassian.com/login',
  linear: 'https://linear.app',
  microsoft_onedrive: 'https://onedrive.live.com',
  microsoft_outlook: 'https://outlook.office.com/mail',
  microsoft_teams: 'https://teams.microsoft.com',
  monday: 'https://auth.monday.com/auth/login_monday',
  notion: 'https://www.notion.so',
  paypal: 'https://www.paypal.com/signin',
  pipedrive: 'https://app.pipedrive.com',
  quickbooks: 'https://qbo.intuit.com',
  salesforce_rest_api: 'https://login.salesforce.com',
  shopify: 'https://admin.shopify.com',
  slack_v2: 'https://app.slack.com/client',
  stripe: 'https://dashboard.stripe.com',
  supabase: 'https://supabase.com/dashboard',
  todoist: 'https://app.todoist.com/app',
  trello: 'https://trello.com',
  vercel_token_auth: 'https://vercel.com',
  zoom: 'https://zoom.us/signin',
};

/** The page to open for a card, when the card is one we know an address for. */
export const appWebAddress = (item: ConnectionItem): string | undefined => (
  item.kind === ConnectionKind.Account ? APP_WEB_ADDRESSES[item.appSlug] : undefined
);

/**
 * Whether a card offers the sign-in: an account this person has connected,
 * and an address to send the browser to.
 */
export const offersBrowserSignIn = (
  item: ConnectionItem,
  state: ConnectionCardState,
): boolean => (
  state === ConnectionCardState.Connected && Boolean(appWebAddress(item))
);

/** What became of the offer once it was taken. */
export const BrowserSignInOutcome = {
  /** The page is in the panel inside the app; whatever covers it must move. */
  InApp: 'in-app',
  /** The page is in the assistant's own window, already in front. */
  OwnWindow: 'own-window',
  /** Nothing opened; the card says so rather than pretending. */
  Failed: 'failed',
} as const;
export type BrowserSignInOutcome = typeof BrowserSignInOutcome[keyof typeof BrowserSignInOutcome];

/**
 * Put the service's page in front of the person, in the browser the assistant
 * itself works in. Which browser that is, only the main process knows, so it
 * reports back where the page landed.
 */
export const openBrowserSignIn = async (
  url: string,
  sessionId: string | null,
): Promise<BrowserSignInOutcome> => {
  try {
    const response = await window.electron.openclaw.browser.openAgentPage({
      url,
      ...(sessionId ? { sessionId } : {}),
    });
    if (!response.success) return BrowserSignInOutcome.Failed;
    return response.displayMode === BrowserDisplayMode.InApp
      ? BrowserSignInOutcome.InApp
      : BrowserSignInOutcome.OwnWindow;
  } catch (error) {
    console.warn('[Connections] The assistant browser could not open the page', error);
    return BrowserSignInOutcome.Failed;
  }
};
