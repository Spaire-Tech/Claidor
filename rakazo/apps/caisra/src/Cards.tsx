import "@openuidev/react-ui/index.css";
import "@openuidev/thesys/styles.css";
import "./cards.css";

import { type C1Action, chatLibrary, OpenUIC1Component } from "@openuidev/thesys";
import { useCallback, useMemo } from "react";

/**
 * The answer cards, drawn: OpenUI's, whole.
 *
 * The founder, 17 September, after a first version in our own design: *"i want
 * it exactly like openui's. i'm talking about Trip itineraries, restaurants
 * etc... use their colors. use their style. perhaps keep our font but thats
 * it."* So the block is OpenUI's own chat renderer — `OpenUIC1Component`, the
 * component their assistant answers with — over their chat library, with their
 * stylesheet and their tokens. Nothing here restyles a card. What is ours is
 * the typeface, the width, the buttons, and where a pressed button goes;
 * `cards.css` holds those and says why for each.
 *
 * **A button.** Their renderer hands us the action. One that continues the
 * conversation becomes the person's next message — its `context` when the
 * agent gave one, else the button's label. One that opens a URL is opened by
 * their renderer itself. Anything else is ignored: there is no tool call from
 * inside a card.
 *
 * **Pictures.** Their `Image` resolves a missing `src` from the `alt` through a
 * React context whose Provider the package never renders and does not export,
 * so their renderer cannot find a picture on its own: a card with no `src`
 * draws none and calls nothing. Every picture is therefore one the agent found
 * and put in the program.
 *
 * Two of their layouts fail badly when an address is dead — `ImageTextLarge`
 * attaches no error handler and would show the browser's broken-image glyph in
 * a 180px box. The listener below marks any image that fails to load and
 * `cards.css` collapses its frame, so a picture that 404s or refuses a hotlink
 * leaves a tidy card rather than a torn one. It is in the capture phase
 * because `error` does not bubble and the images are theirs to render.
 */

/** The message a pressed button sends: its context when given, else its label. */
export function messageOfAction(action: C1Action): string | undefined {
  if (action.type !== "continue_conversation") return undefined;
  const context = action.params?.context;
  const message =
    (typeof context === "string" && context.trim()) || action.humanFriendlyMessage?.trim();
  return message || undefined;
}

export function Cards({
  program,
  onMessage,
}: {
  program: string;
  onMessage?: (message: string) => void;
}) {
  const onAction = useMemo(
    () => (action: C1Action) => {
      const message = messageOfAction(action);
      if (message) onMessage?.(message);
    },
    [onMessage],
  );

  const onError = useCallback((event: React.SyntheticEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "IMG") target.setAttribute("data-broken", "true");
  }, []);

  return (
    <div className="row row--left">
      <div className="caisra-cards" onErrorCapture={onError}>
        <OpenUIC1Component
          content={program}
          library={chatLibrary}
          isStreaming={false}
          onAction={onAction}
        />
      </div>
    </div>
  );
}
