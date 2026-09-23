// Test entry for tests/clay-faces.test.mjs: the component's exports plus a
// static render, so the drawing can be measured without a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingCharacter } from "../../frontend/src/recovered/features/onboarding/signed-in/character";
import type { OnboardingCharacterVisualProps } from "../../frontend/src/recovered/features/onboarding/signed-in/view";

export * from "../../frontend/src/recovered/features/onboarding/signed-in/character";
export function renderFace(props: OnboardingCharacterVisualProps): string {
  return renderToStaticMarkup(<OnboardingCharacter {...props} />);
}
