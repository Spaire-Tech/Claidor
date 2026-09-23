# The agents' avatars

Twenty-one avatars the founder made with DiceBear's Adventurer style on
23 September 2026 (`adventurer-01.svg` … `adventurer-21.svg`, in the order
they were made). `measures.json` is Chromium's bounding box of every part,
written by `node scripts/import-avatars.mjs --measure`; the app's data module
`frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts` is
generated from both by `node scripts/import-avatars.mjs`.

## Licence

The drawings are a remix of "Adventurer" by Lisa Wischofsky
(https://www.figma.com/community/file/1184595184137881796), licensed under
CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), generated with
DiceBear (https://www.dicebear.com). Attribution is required wherever they
ship: the generated module carries the credit as `ADVENTURER_CREDIT`, and the
About dialog shows it under the copyright line.
