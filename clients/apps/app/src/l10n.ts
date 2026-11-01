// The screens' words, from the Mac app's catalogue
// (mac/Simeon/Localizable.xcstrings), as the Mac's SwiftUI views read it. How
// keys and translations work: `core/words.ts`. Every call takes its English
// as written, so `python3 scripts/check_translations.py` can find it in the
// catalogue.

import { keyedTranslator, translator } from './core/words'

export const t = translator('mac')
export const tk = keyedTranslator('mac')
