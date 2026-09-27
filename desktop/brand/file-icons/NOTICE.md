# File icons and app logos

`file-icons/pdf.svg` is the PDF artwork the Word add-in already ships
(`clients/apps/word-addin/src/ui/fileIconAssets.ts`, vscode-icons, MIT
License, Copyright (c) 2016 Roberto Huertas). `word.webp`, `excel.webp` and
`powerpoint.webp` are the web app's icons (`clients/apps/web/public/icons/`),
the ones the founder chose on 27 September 2026, cut to 96 px.

`app-logos/` holds the logos an app name wears in a message and the
Connect apps tiles, listed with their colours in `app-logos/apps.json`:

- Gmail, Google Calendar, Drive, Docs, Sheets, Slides, Meet, Outlook and Zoom
  from the onboarding design (`docs/maties/design/onboarding/logos/`), cut to
  64 px; Drive and Docs stored uncompressed (the onboarding copies are gzip
  under an `.svg` name). Mailchimp from `frontend/runtime-assets/`. Word,
  Excel and PowerPoint as above.
- Every `si-*.svg` is from Simple Icons 13 (https://simpleicons.org),
  CC0 1.0, with the brand colour Simple Icons records for it.

The product names and logos are their owners' trademarks, used to identify
the app or file type.
