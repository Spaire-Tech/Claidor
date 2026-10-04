# The Spaire sign-in, kept for the redesign

A private copy of the web app's sign-in and sign-up as they were under the
Spaire name (commit `7693b505`, 5 August 2026), taken on 4 October 2026 when
the founder asked to bring that sign-in back and redesign from it.

Nothing here is compiled or routed: the folder sits outside `src/`, which is
all `tsconfig.json` includes. The files are reference, read side by side with
the live pages:

| Here                                                      | Live page today                                            |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `login.page.tsx`                                          | `src/app/(main)/login/page.tsx`                            |
| `signup.page.tsx`                                         | `src/app/(main)/signup/page.tsx`                           |
| `Login.tsx`, `LoginCodeForm.tsx`, `GoogleLoginButton.tsx` | `src/components/Auth/` (the same files, renamed to Simeon) |
| `SpaireLogotype.tsx`                                      | the mark is `src/components/Brand/LogoIcon.tsx` now        |

The live pages carry the same layout as these: one card, the mark, "Welcome
back to …", a line about the product, Google, then an email code. What
changed between then and now is the name, the mark and the line. The earlier
product's line in these files ("Turn what you know into a Masterclass") is
that product's, not Simeon's.

Sign-in has no limit: any email can sign in or sign up, through Google or an
email code (`server/simeon/user/service.py`, `get_by_email_or_create`, creates
the account on first sign-in; nothing checks a list or a domain).
