import '@openuidev/react-ui/index.css';
import '@openuidev/thesys/styles.css';

import { Presentation, Report } from '@openuidev/thesys';
import { useState } from 'react';

import { ArtifactKind } from '../../../shared/artifacts/constants';
import type { CardItem } from './types';

/**
 * A deck or a report in the thread: OpenUI's chip, and OpenUI's
 * full-screen view when the chip is pressed.
 *
 * The founder, 17 September: *"i want my artifacts to look exactly like
 * open ui's. i want a complete replica here for the design."* So this
 * is their `Presentation` and `Report` (`@openuidev/thesys`, MIT) used
 * whole, in preview mode: the component draws its own chip with the
 * title on it, and on open portals the full deck or report over the app
 * with a backdrop, Escape and click-outside to close. Their stylesheet
 * and their design tokens come with it; nothing here restyles them.
 *
 * What is ours is only which one to draw, from the program's root
 * (`artifactKindOf`), and the open state.
 */
export function ArtifactBlock({ item }: { item: CardItem }): JSX.Element {
  const [open, setOpen] = useState(false);
  const shared = { response: item.program, isOpen: open, onOpenChange: setOpen } as const;
  return (
    <div data-artifact={item.artifact} data-card-block={item.id} style={{ width: '100%', maxWidth: 820 }}>
      {item.artifact === ArtifactKind.Presentation
        ? <Presentation {...shared} />
        : <Report {...shared} />}
    </div>
  );
}
