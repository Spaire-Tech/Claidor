import '@openuidev/react-ui/index.css';
import '@openuidev/thesys/styles.css';
import './cards.css';

import { type C1Action, chatLibrary, OpenUIC1Component } from '@openuidev/thesys';
import { useMemo } from 'react';

import { motion } from '../tokens';
import { ArtifactBlock } from './ArtifactBlock';
import type { CardItem } from './types';

/**
 * The answer cards, drawn: OpenUI's, whole.
 *
 * The founder, 17 September, after a first version in our own design:
 * *"i want it exactly like openui's. i'm talking about Trip itineraries,
 * restaurants etc... use their colors. use their style. perhaps keep our
 * font but thats it."* So the block is OpenUI's own chat renderer
 * (`OpenUIC1Component`, the component their assistant answers with)
 * over their chat library, with their stylesheet and their tokens.
 * Nothing here restyles a card. What is ours is the typeface
 * (`cards.css` points their font token at Switzer, the thread's face),
 * the width, and where a pressed button goes.
 *
 * **A button.** Their renderer hands us the action; one that continues
 * the conversation becomes the person's next message, its `context` if
 * the agent gave one, else the button's label. One that opens a URL is
 * opened by their renderer itself, in the browser. Anything else is
 * ignored: there is no tool call from inside a card in this app.
 *
 * **Pictures.** Their `Image` resolves a missing `src` from the `alt`
 * only when an image-search provider is mounted above it, and none is,
 * so a card with no picture draws no picture and calls nothing.
 * Verified in the harness: no request leaves the loopback.
 */

export interface CardHandlers {
  /** A pressed button: the label goes to the agent as the person's next message. */
  onMessage?: (message: string) => void;
}

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

export function CardBlock(
  { item, handlers }: { item: CardItem; handlers: CardHandlers },
): JSX.Element {
  // A deck or a report is our file card and OpenUI's viewer, not a card block.
  if (item.artifact) return <ArtifactBlock item={item} />;
  return <CardsBlock item={item} handlers={handlers} />;
}

/** The message a pressed button sends: its context when the agent gave one, else its label. */
export function messageOfAction(action: C1Action): string | undefined {
  if (action.type !== 'continue_conversation') return undefined;
  const context = action.params?.context;
  const message = (typeof context === 'string' && context.trim()) || action.humanFriendlyMessage?.trim();
  return message || undefined;
}

function CardsBlock(
  { item, handlers }: { item: CardItem; handlers: CardHandlers },
): JSX.Element {
  const onAction = useMemo(() => (action: C1Action) => {
    const message = messageOfAction(action);
    if (message) handlers.onMessage?.(message);
  }, [handlers]);

  return (
    <div
      data-card-block={item.id}
      className="caisra-cards"
      // As wide as the widest bubble (`ThreadItemView`), so the cards
      // sit in the conversation's column and not across the whole pane.
      style={{ width: '100%', maxWidth: 'min(80%, 680px)', padding: '4px 0 6px', animation: enter }}
    >
      <OpenUIC1Component
        content={item.program}
        library={chatLibrary}
        isStreaming={false}
        onAction={onAction}
      />
    </div>
  );
}
