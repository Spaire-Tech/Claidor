// The shared core's sentences (L10n.swift), from the core's catalogue
// (ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings). How
// keys and translations work: `words.ts`. Every call takes its English as
// written, so `python3 scripts/check_translations.py` can find it in the
// catalogue.

import { keyedTranslator, translator } from './words'

export const t = translator('core')
export const tk = keyedTranslator('core')
