import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { CoworkErrorI18nKey } from '../common/coworkErrorClassify';
import { getLanguage, setLanguage, t } from './i18n';

/**
 * The sentence somebody reads when their month runs out.
 *
 * **Why this test exists, in one line:** the string was fixed once, in the
 * wrong dictionary, and nobody noticed for a week because the fix was real
 * and the founder still saw NetEase's words.
 *
 * The chain, so it is not re-derived next time. Our server counts credits
 * against `DESKTOP_MONTHLY_CREDITS` and answers 402 with code 40200
 * (`polar/desktop/service.py`). `coworkErrorClassify.ts` matches `4020[0-2]`
 * to `QuotaExhausted`. `openclawRuntimeAdapter.ts` then localises that key
 * through **`main/i18n.ts`** and stores the result as the message text. The
 * renderer's `classifyError` only rewrites text that is still raw — by then
 * it is not, and the pattern no longer matches the English sentence anyway
 * — so the renderer's copy never gets a turn on this path.
 *
 * Which means our own quota limit was telling the founder to go and buy
 * credits from NetEase, with a link to NetEase's pricing page.
 *
 * Both copies are checked here, and the check is on the source text rather
 * than on an import, because the renderer's dictionary pulls in
 * `configService` and with it the whole IPC layer. A dictionary is a string
 * table; reading it as one is the cheaper truth.
 */

const HERE = __dirname;
const MAIN_I18N = join(HERE, 'i18n.ts');
const RENDERER_I18N = join(HERE, '..', 'renderer', 'services', 'i18n.ts');

const source = (path: string): string => readFileSync(path, 'utf8');

/** The half of the sentence that matters: where to go instead. */
const ESCAPE_HATCH_EN = 'You can keep working now by using your own provider key — Settings → Models.';
const ESCAPE_HATCH_ZH = '你可以在「设置 → 模型」中填入自己的 API Key 继续使用。';

const QUOTA_KEYS = [
  CoworkErrorI18nKey.QuotaExhausted,
  CoworkErrorI18nKey.FreeQuotaExhausted,
] as const;

describe('the quota message, in both dictionaries', () => {
  for (const path of [MAIN_I18N, RENDERER_I18N]) {
    const name = path.includes('renderer') ? 'renderer' : 'main';

    test(`${name}: no error string sends anybody to another company's pricing page`, () => {
      expect(source(path)).not.toContain('youdao.com/portal');
    });

    test(`${name}: nothing still says "upgrade your plan"`, () => {
      // Upstream's wording for upstream's product. Ours is a monthly
      // allowance that resets, which is a different fact about a different
      // account, and the two are not interchangeable copy.
      expect(source(path).toLowerCase()).not.toContain('upgrade your plan');
    });

    test(`${name}: both languages name the way out`, () => {
      const text = source(path);
      expect(text).toContain(ESCAPE_HATCH_EN);
      expect(text).toContain(ESCAPE_HATCH_ZH);
    });
  }
});

describe('what the main process actually hands to a message', () => {
  const withLanguage = <T,>(language: 'en' | 'zh', run: () => T): T => {
    const before = getLanguage();
    setLanguage(language);
    try {
      return run();
    } finally {
      setLanguage(before);
    }
  };

  for (const key of QUOTA_KEYS) {
    test(`${key}, in English`, () => {
      const message = withLanguage('en', () => t(key));
      expect(message).toContain(ESCAPE_HATCH_EN);
      expect(message).not.toMatch(/youdao|lobsterai/i);
      // A markdown link here used to render as punctuation in the thread.
      // `SystemLine` parses its runs now, so this is no longer fatal — but
      // an IM channel gets the same string and does not, so the sentence
      // stays plain on purpose.
      expect(message).not.toMatch(/\]\(/);
    });

    test(`${key}, in Chinese`, () => {
      const message = withLanguage('zh', () => t(key));
      expect(message).toContain(ESCAPE_HATCH_ZH);
      expect(message).not.toMatch(/youdao|lobsterai/i);
      expect(message).not.toMatch(/\]\(/);
    });
  }

  test('the expired-login line no longer names somebody else\'s product', () => {
    for (const language of ['en', 'zh'] as const) {
      const message = withLanguage(language, () => t(CoworkErrorI18nKey.LobsterAILoginExpired));
      expect(message).not.toMatch(/lobsterai/i);
    }
  });
});
