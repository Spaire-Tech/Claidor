import { describe, expect, test } from 'vitest';

import { SkinWorkflowKind } from '../../shared/skin/constants';
import {
  SkinPackKitBundle,
  SkinPackKitId,
  SkinPackKitMetadata,
  SkinPackSkillId,
} from '../../shared/skin/kit';
import {
  buildInstalledSkinPackKitRecord,
  buildSkinPackMarketplaceKit,
} from './skinPackKit';

describe('AI Skin Designer built-in kit', () => {
  test('publishes only the bundled skin creator skill', () => {
    const kit = buildSkinPackMarketplaceKit() as {
      id: string;
      name: { en: string; zh?: string };
      description: { en: string; zh?: string };
      icon: string;
      version: string;
      workflowKind: string;
      tryAsking: Array<{ en: string; zh?: string }>;
      skills: {
        bundle: string;
        list: Array<{
          id: string;
          name: { en: string; zh?: string };
        }>;
      };
      mcpServers: unknown[];
      connectors: unknown[];
    };

    expect(kit).toMatchObject({
      id: SkinPackKitId.BuiltIn,
      name: {
        en: 'Customize Swen',
      },
      description: {
        en: 'Describe the look you want. AI creates a custom backdrop and emblem, coordinates the interface colors, and applies it to Swen.',
      },
      icon: SkinPackKitMetadata.IconUrl,
      version: SkinPackKitMetadata.Version,
      workflowKind: SkinWorkflowKind.SkinPack,
      skills: {
        bundle: SkinPackKitBundle.BuiltIn,
        list: [{
          id: SkinPackSkillId.BuiltIn,
          name: {
            en: 'AI Appearance Designer',
          },
        }],
      },
      mcpServers: [],
      connectors: [],
    });
    expect(kit.version).toBe('0.3.0');
    expect(kit.tryAsking).toHaveLength(7);
    expect(kit.tryAsking.map(prompt => prompt.en)).toEqual([
      'Create a custom AI skin for Swen using {primary and accent colors} as the palette, centered on {theme or character}, set in {scene and mood}, and designed for {use case or purpose}. Generate a coordinated backdrop, emblem, and interface colors from this idea, then apply them to Swen.',
      'Turn Swen into a blue-and-white championship night: a legendary number 10 lifting the world trophy in golden confetti, full of passion, glory, and collectible fan-memento energy',
      'Turn Swen into a bright, airy red-and-gold prosperity theme with a dignified, welcoming East Asian God of Wealth as the main visual. Use generous ivory and warm-cream space, with vermilion, gold, auspicious clouds, and flowing golden lines as accents—festive and luxurious without feeling gaudy, for market analysis, investment research, and daily reviews',
      'Design a fan tribute look with a sea of red lights and refined East Asian stage aesthetics: a gentle young actor-singer silhouette, silver spotlights, and an elegant commemorative mood',
      'Turn Swen into a bright post-rain morning study with an orange cat: creamy white, pale wood, soft daylight, and green plants by the window, fresh, quiet, comforting, and suited to reading, learning, and everyday work',
      'Turn Swen into a deep-blue data and automation command center with abstract trend light trails, precise grids, and amber status lights, built for coding, analysis, market monitoring, and long-running tasks',
      'Create a bright cream-white and champagne-gold brand-studio look for content creators with airy daylight photography, lightweight editorial collage, and refined product displays—clean, polished, and suited to image, video, and ecommerce creation',
    ]);
    expect(kit.tryAsking[0].en.match(/\{[^}]+\}/g)).toHaveLength(4);
    expect(kit.tryAsking.every(prompt => prompt.zh === undefined)).toBe(true);
    expect(kit.skills.list).toHaveLength(1);
  });

  test('persists the trusted workflow marker with the fixed skill id', () => {
    const record = buildInstalledSkinPackKitRecord();

    expect(record).toMatchObject({
      id: SkinPackKitId.BuiltIn,
      version: SkinPackKitMetadata.Version,
      workflowKind: SkinWorkflowKind.SkinPack,
      skills: {
        skillIds: [SkinPackSkillId.BuiltIn],
      },
      mcpServers: [],
      connectors: [],
    });
  });
});
