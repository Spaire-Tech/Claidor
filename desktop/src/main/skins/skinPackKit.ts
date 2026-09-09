import type {
  InstalledKitRecord,
  KitSkillMetadata,
} from '../../shared/kit/constants';
import {
  SkinPackKitBundle,
  SkinPackKitId,
  SkinPackKitMetadata,
  SkinPackSkillId,
} from '../../shared/skin/kit';

const SKIN_CREATOR_SKILL_METADATA: KitSkillMetadata = {
  id: SkinPackSkillId.BuiltIn,
  name: {
    en: 'AI Appearance Designer',
  },
  description: {
    en: 'Designs and applies coordinated Swen backgrounds, emblems, and interface colors.',
  },
};

const SKIN_PACK_STARTER_PROMPT = {
  en: 'Create a custom AI skin for Swen using {primary and accent colors} as the palette, centered on {theme or character}, set in {scene and mood}, and designed for {use case or purpose}. Generate a coordinated backdrop, emblem, and interface colors from this idea, then apply them to Swen.',
};

export function buildSkinPackMarketplaceKit(): Record<string, unknown> {
  return {
    id: SkinPackKitId.BuiltIn,
    name: {
      en: 'Customize Swen',
    },
    description: {
      en: 'Describe the look you want. AI creates a custom backdrop and emblem, coordinates the interface colors, and applies it to Swen.',
    },
    icon: SkinPackKitMetadata.IconUrl,
    author: 'Swen',
    version: SkinPackKitMetadata.Version,
    workflowKind: SkinPackKitMetadata.WorkflowKind,
    tryAsking: [
      SKIN_PACK_STARTER_PROMPT,
      {
        en: 'Turn Swen into a blue-and-white championship night: a legendary number 10 lifting the world trophy in golden confetti, full of passion, glory, and collectible fan-memento energy',
      },
      {
        en: 'Turn Swen into a bright, airy red-and-gold prosperity theme with a dignified, welcoming East Asian God of Wealth as the main visual. Use generous ivory and warm-cream space, with vermilion, gold, auspicious clouds, and flowing golden lines as accents—festive and luxurious without feeling gaudy, for market analysis, investment research, and daily reviews',
      },
      {
        en: 'Design a fan tribute look with a sea of red lights and refined East Asian stage aesthetics: a gentle young actor-singer silhouette, silver spotlights, and an elegant commemorative mood',
      },
      {
        en: 'Turn Swen into a bright post-rain morning study with an orange cat: creamy white, pale wood, soft daylight, and green plants by the window, fresh, quiet, comforting, and suited to reading, learning, and everyday work',
      },
      {
        en: 'Turn Swen into a deep-blue data and automation command center with abstract trend light trails, precise grids, and amber status lights, built for coding, analysis, market monitoring, and long-running tasks',
      },
      {
        en: 'Create a bright cream-white and champagne-gold brand-studio look for content creators with airy daylight photography, lightweight editorial collage, and refined product displays—clean, polished, and suited to image, video, and ecommerce creation',
      },
    ],
    skills: {
      bundle: SkinPackKitBundle.BuiltIn,
      list: [SKIN_CREATOR_SKILL_METADATA],
    },
    mcpServers: [],
    connectors: [],
  };
}

export function buildInstalledSkinPackKitRecord(): InstalledKitRecord {
  return {
    id: SkinPackKitId.BuiltIn,
    version: SkinPackKitMetadata.Version,
    installedAt: Date.now(),
    workflowKind: SkinPackKitMetadata.WorkflowKind,
    skills: {
      skillIds: [SkinPackSkillId.BuiltIn],
      metadata: {
        [SkinPackSkillId.BuiltIn]: SKIN_CREATOR_SKILL_METADATA,
      },
    },
    mcpServers: [],
    connectors: [],
  };
}
