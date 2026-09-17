import "@openuidev/react-ui/index.css";
import "@openuidev/thesys/styles.css";
import "./cards.css";

import type { OpenUIError } from "@openuidev/lang-core";
import { Renderer } from "@openuidev/react-lang";
import { chatLibrary } from "@openuidev/thesys";
import { normaliseCardProgram } from "@rakazo/core";
import { useCallback, useMemo, useState } from "react";

/**
 * The answer cards, drawn: OpenUI's, whole.
 *
 * The founder, 17 September, after a first version in our own design: *"i want
 * it exactly like openui's. i'm talking about Trip itineraries, restaurants
 * etc... use their colors. use their style. perhaps keep our font but thats
 * it."* So the components, the colours and the layouts are theirs. What is
 * ours is the typeface, the width, the buttons, and where a pressed button
 * goes; `cards.css` holds those and says why for each.
 *
 * **Why `Renderer` and not `OpenUIC1Component`.** They draw the same thing:
 * the wrapper's whole body is a call to this `Renderer` with the text between
 * its `<content>` tags, or the whole string when there are none, which is our
 * case. The difference is what it forwards. The wrapper passes `response`,
 * `library`, `isStreaming`, `onAction`, `onStateUpdate` and `initialState` —
 * and **no error channel at all**. Rendering through it meant a card could
 * only ever fail silently, no matter what our code did. This calls the
 * renderer underneath it and takes `onError` as well.
 *
 * What the wrapper does that this deliberately does not: it rewrites a pressed
 * button into a base64 `User clicked: …` payload for their cloud's message
 * format. Caisra sends the person's own words instead (`messageOfAction`).
 */

/**
 * **A broken card must never shrink quietly.**
 *
 * The fault that cost the most, and it was mine twice. The parser knows
 * exactly what went wrong — an unknown component, a name that was never
 * defined, a stream that stopped mid-statement — and our renderer read the
 * tree and threw the errors away. One bad line in the middle of a twelve-part
 * answer deleted everything after it and told nobody, so the founder was the
 * only test that could catch it.
 *
 * OpenUI's own reliability guidance is to capture those errors and feed
 * precise ones back into a bounded correction. `onError` is built for exactly
 * that: structured, LLM-friendly, only the errors fixable by changing the
 * program, and called with `[]` once they are resolved. So they go up to
 * whatever can act on them — and until something does, they are drawn on the
 * card. A visible short answer is a bug report. An invisible one is a lie.
 */
export function Cards({
  program,
  onMessage,
  onErrors,
}: {
  program: string;
  onMessage?: (message: string) => void;
  /** Where a correction attempt hangs. Called with [] when the card is clean. */
  onErrors?: (errors: readonly OpenUIError[]) => void;
}) {
  const [errors, setErrors] = useState<readonly OpenUIError[]>([]);

  // The floor in front of the parser: the six names a model writes from
  // OpenUI's public docs, corrected to the ones this library has.
  const corrected = useMemo(() => normaliseCardProgram(program), [program]);
  if (corrected.corrected.length > 0) {
    console.info(
      `[Cards] corrected component names from OpenUI's other chat library: ${corrected.corrected.join(", ")}`,
    );
  }

  const onAction = useCallback(
    (action: unknown) => {
      const message = messageOfAction(action);
      if (message) onMessage?.(message);
    },
    [onMessage],
  );

  const onError = useCallback(
    (next: OpenUIError[]) => {
      setErrors(next);
      onErrors?.(next);
    },
    [onErrors],
  );

  // One listener for the whole block, in the capture phase: `error` does not
  // bubble, and the images are theirs to render, so there is nowhere else to
  // put it. `cards.css` collapses the frame of anything it marks, so a dead
  // address leaves a tidy card rather than a torn one.
  const onImageError = useCallback((event: React.SyntheticEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "IMG") target.setAttribute("data-broken", "true");
  }, []);

  return (
    <div className="row row--left">
      <div className="caisra-cards" onErrorCapture={onImageError}>
        <Renderer
          response={corrected.program}
          library={chatLibrary}
          isStreaming={false}
          onAction={onAction}
          onError={onError}
        />
        {errors.length > 0 ? <CardFault errors={errors} /> : null}
      </div>
    </div>
  );
}

/** What is missing, in the person's words, with the parser's own detail behind it. */
function CardFault({ errors }: { errors: readonly OpenUIError[] }) {
  return (
    <details className="cardfault">
      <summary>Part of this answer did not come through. I can ask for it again.</summary>
      <ul>
        {errors.map((error) => (
          <li key={`${error.code}-${error.message}`}>
            <span className="cardfault__code">{error.code}</span> {error.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The message a pressed suggestion sends: the context the agent gave, else the
 * button's own label. Anything unrecognised sends nothing — there is no tool
 * call from inside a card.
 */
export function messageOfAction(action: unknown): string | undefined {
  if (!action || typeof action !== "object") return undefined;
  const one = action as {
    humanFriendlyMessage?: unknown;
    params?: { context?: unknown };
  };
  const context = typeof one.params?.context === "string" ? one.params.context.trim() : "";
  if (context) return context;
  const label = typeof one.humanFriendlyMessage === "string" ? one.humanFriendlyMessage.trim() : "";
  return label || undefined;
}
