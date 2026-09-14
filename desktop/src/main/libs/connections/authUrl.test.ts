import { describe, expect, test } from 'vitest';

import { failureLine, findAuthorizationUrl, readCallback, saysAuthorized } from './authUrl';

/** What `openclaw mcp login` actually prints, shape for shape. */
const LOGIN_OUTPUT = [
  'Open this URL to authorize "connection-gmail":',
  'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=abc.apps'
  + '&redirect_uri=http%3A%2F%2F127.0.0.1%3A8989%2Foauth%2Fcallback&code_challenge=xyz'
  + '&code_challenge_method=S256&scope=https%3A%2F%2Fmail.google.com%2F',
  'After approval, run openclaw mcp login connection-gmail --code <code>.',
].join('\n');

describe('finding the URL to open', () => {
  test('it finds the authorization URL in the engine\'s output', () => {
    const found = findAuthorizationUrl(LOGIN_OUTPUT);
    expect(found).toContain('accounts.google.com');
    expect(new URL(found!).searchParams.get('code_challenge_method')).toBe('S256');
  });

  test('a docs link in the same output is not mistaken for it', () => {
    // The fault this guards is opening the wrong window: the first https
    // on the page is not necessarily the one that signs anybody in.
    const noisy = [
      'See https://docs.example.com/mcp/oauth for background.',
      LOGIN_OUTPUT,
    ].join('\n');
    expect(findAuthorizationUrl(noisy)).toContain('accounts.google.com');
  });

  test('a URL with nowhere to come back to is not an authorization URL', () => {
    expect(findAuthorizationUrl('https://example.com/auth?client_id=abc')).toBeNull();
  });

  test('trailing punctuation is not part of the address', () => {
    const line = 'Open (https://id.example.com/auth?response_type=code&redirect_uri=x).';
    expect(findAuthorizationUrl(line)).toBe('https://id.example.com/auth?response_type=code&redirect_uri=x');
  });

  test('output with no URL at all is null, not a guess', () => {
    expect(findAuthorizationUrl('MCP OAuth credentials saved for "connection-gmail".')).toBeNull();
  });

  test('plain http is refused', () => {
    // An authorization request over http would put the code on the wire.
    expect(findAuthorizationUrl('http://id.example.com/auth?response_type=code&redirect_uri=x'))
      .toBeNull();
  });
});

describe('reading the redirect', () => {
  test('it takes the code', () => {
    expect(readCallback('/oauth/callback?code=4%2F0Ab&state=xyz'))
      .toEqual({ code: '4/0Ab', state: 'xyz' });
  });

  test('a refusal is reported in the service\'s words, not as a hang', () => {
    // Somebody who pressed Cancel should be told so, not left watching a
    // spinner until something times out.
    expect(readCallback('/oauth/callback?error=access_denied&error_description=The+user+said+no'))
      .toEqual({ error: 'The user said no' });
  });

  test('an error with no description still says something', () => {
    expect(readCallback('/oauth/callback?error=server_error').error).toBe('server_error');
  });

  test('a redirect carrying neither is an error, not an empty success', () => {
    expect(readCallback('/oauth/callback').error).toBeTruthy();
    expect(readCallback('/oauth/callback').code).toBeUndefined();
  });
});

describe('did the login finish', () => {
  test('the engine says so in a sentence', () => {
    expect(saysAuthorized('MCP OAuth credentials saved for "connection-gmail".')).toBe(true);
  });

  test('printing a URL is not finishing', () => {
    // Both runs exit 0. The exit code cannot tell them apart, which is
    // the whole reason this function exists.
    expect(saysAuthorized(LOGIN_OUTPUT)).toBe(false);
  });
});

describe('what went wrong', () => {
  test('the engine\'s own last word is used', () => {
    const output = 'Loading config...\nMCP server "connection-x" is not configured with auth: "oauth".';
    expect(failureLine(output)).toBe('MCP server "connection-x" is not configured with auth: "oauth".');
  });

  test('silence invents nothing', () => {
    expect(failureLine('   \n\n  ')).toBe('');
  });
});
