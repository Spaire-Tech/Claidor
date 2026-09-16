import {
  type ActionEvent,
  type ComponentRenderer,
  createLibrary,
  defineComponent,
  type OpenUIError,
  Renderer,
  useTriggerAction,
} from '@openuidev/react-lang';
import { type CSSProperties, useMemo, useState } from 'react';
import type { z } from 'zod/v4';

import {
  Banner as BannerSpec,
  Button as ButtonSpec,
  CARD_COMPONENTS,
  type CardComponentName,
  cardImageUrl,
  Fact as FactSpec,
  Grid as GridSpec,
  Metric as MetricSpec,
  Row as RowSpec,
  Stack as StackSpec,
  Table as TableSpec,
  Text as TextSpec,
  Tile as TileSpec,
} from '../../../shared/cards/library';
import { ChevronRightIcon } from '../icons';
import { color, line, motion, radius, shadow, text, tracking } from '../tokens';
import { ArtifactBlock } from './ArtifactBlock';
import type { CardItem } from './types';

/**
 * The answer cards, drawn.
 *
 * OpenUI parses the block and hands each component its arguments; every
 * component here is ours, in the thread's own tokens. What the language
 * can name is `shared/cards/library.ts`; this file is only how each of
 * those looks.
 *
 * **The look is the founder's four pictures of 17 September**, read
 * card by card after the first attempt put the whole block in a grey
 * bubble and drew no pictures (*"utterly terrible … do not put it in a
 * text box … AND I WANT THE PICTURES"*):
 *
 * - Nothing around the block. The title, the subtitle, any paragraph
 *   are plain text on the page; the cards sit on the page after them.
 * - The picture is the card. A Tile with a photo is the photo, edge to
 *   edge, the tag over it top left in a dark translucent pill with
 *   white text, and the name and line in a white box inset at the
 *   bottom in black text. An action is a black bar under them.
 * - The Banner is a wide photo with white title and subtitle on it.
 * - Metrics and Facts are white boxes: a bold label with a muted note
 *   under it, the figure at the right.
 *
 * A block that names something the library does not have draws what it
 * can and says one quiet line; the agent was told the rules, and a
 * broken card is not the person's problem to read.
 */

export interface CardHandlers {
  /** A pressed button or tile action: the label goes to the agent as the person's next message. */
  onMessage?: (message: string) => void;
}

type Props<S extends { props: z.ZodObject }> = z.infer<S['props']>;

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

/** The white box every card is made of. */
const box: CSSProperties = {
  borderRadius: radius.card, background: color.paper, border: `1px solid ${line.hairline}`,
  boxShadow: shadow.flat, overflow: 'hidden',
};

const muted: CSSProperties = { fontSize: text.small, color: color.muted, lineHeight: 1.4 };

/** Over a photo: white text with a little shadow so it reads on anything. */
const onPhoto: CSSProperties = { color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.35)' };

const TILE_WIDTH = 250;
const TILE_PHOTO = 232;

function Photo({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }): JSX.Element | null {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: color.fill, ...style }}
    />
  );
}

function ActionBar({ label, onPress }: { label: string; onPress: () => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 38, padding: '0 14px', borderRadius: radius.control, border: 'none', width: '100%',
        background: hover ? color.inkHover : color.ink, color: color.paper, font: 'inherit',
        fontSize: text.body, fontWeight: 500, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}
    >
      <span>{label}</span>
      <ChevronRightIcon size={12} />
    </button>
  );
}

const TextView: ComponentRenderer<Props<typeof TextSpec>> = ({ props }) => {
  const tone = props.tone ?? 'body';
  const style: CSSProperties = tone === 'title'
    ? { fontSize: text.emphasis, fontWeight: 600, color: color.ink, letterSpacing: tracking.title, lineHeight: 1.3 }
    : tone === 'muted'
      ? muted
      : { fontSize: text.message, color: color.ink, lineHeight: 1.5, maxWidth: 640 };
  return <div style={{ ...style, textWrap: 'pretty' }}>{props.text}</div>;
};

const TileView: ComponentRenderer<Props<typeof TileSpec>> = ({ props }) => {
  const trigger = useTriggerAction();
  const image = cardImageUrl(props.image);
  const press = props.action ? () => { void trigger(`${props.action}: ${props.name}`); } : undefined;

  if (image) {
    // The picture is the card: photo edge to edge, the tag over it, the
    // words in a white box at the foot, the action as a bar under them.
    return (
      <div style={{ ...box, width: TILE_WIDTH, flex: '0 0 auto', position: 'relative', background: color.ink }}>
        <div style={{ height: TILE_PHOTO, position: 'relative' }}>
          <Photo src={image} alt={props.name} />
          {props.tag && (
            <span
              style={{
                position: 'absolute', top: 10, left: 10, height: 24, padding: '0 10px',
                display: 'inline-flex', alignItems: 'center', borderRadius: radius.pill,
                background: 'rgba(16,22,35,.55)', backdropFilter: 'blur(6px)',
                color: '#fff', fontSize: text.caption, fontWeight: 500, whiteSpace: 'nowrap',
              }}
            >
              {props.tag}
            </span>
          )}
          <div
            style={{
              position: 'absolute', left: 10, right: 10, bottom: 10, padding: '10px 12px',
              borderRadius: radius.field, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            <div style={{ fontSize: text.emphasis, fontWeight: 600, color: color.ink, lineHeight: 1.25, letterSpacing: tracking.title }}>
              {props.name}
            </div>
            {props.line && (
              <div style={{ ...muted, fontSize: text.caption, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {props.line}
              </div>
            )}
          </div>
        </div>
        {props.action && press && (
          <div style={{ padding: 8, background: color.paper }}>
            <ActionBar label={props.action} onPress={press} />
          </div>
        )}
      </div>
    );
  }

  // No picture: the words on white, the tag as a small chip, the action
  // as the same bar.
  return (
    <div style={{ ...box, width: TILE_WIDTH, flex: '0 0 auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {props.tag && (
        <span
          style={{
            alignSelf: 'flex-start', height: 22, padding: '0 9px', display: 'inline-flex', alignItems: 'center',
            borderRadius: radius.pill, background: color.fillStrong, color: color.muted,
            fontSize: text.caption, fontWeight: 500, whiteSpace: 'nowrap',
          }}
        >
          {props.tag}
        </span>
      )}
      <div style={{ fontSize: text.emphasis, fontWeight: 600, color: color.ink, lineHeight: 1.3, letterSpacing: tracking.title }}>
        {props.name}
      </div>
      {props.line && <div style={muted}>{props.line}</div>}
      {props.action && press && <div style={{ marginTop: 6 }}><ActionBar label={props.action} onPress={press} /></div>}
    </div>
  );
};

const MetricView: ComponentRenderer<Props<typeof MetricSpec>> = ({ props }) => (
  <div style={{ ...box, padding: '13px 16px', minWidth: 200, flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: text.body, fontWeight: 600, color: color.ink, lineHeight: 1.3 }}>{props.label}</div>
      {props.note && <div style={{ ...muted, fontSize: text.caption }}>{props.note}</div>}
    </div>
    <div style={{ fontSize: text.dialogTitle, fontWeight: 600, color: color.ink, letterSpacing: tracking.title, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {props.value}
    </div>
  </div>
);

const FactView: ComponentRenderer<Props<typeof FactSpec>> = ({ props }) => (
  <div style={{ ...box, padding: '12px 16px', minWidth: 180, flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div style={{ fontSize: text.body, fontWeight: 600, color: color.ink, lineHeight: 1.3 }}>{props.label}</div>
    <div style={muted}>{props.value}</div>
  </div>
);

const BannerView: ComponentRenderer<Props<typeof BannerSpec>> = ({ props }) => {
  const image = cardImageUrl(props.image);
  return (
    <div style={{ ...box, position: 'relative', height: image ? 210 : undefined, background: image ? color.ink : color.fillRaised, display: 'flex', alignItems: 'flex-end' }}>
      {image && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Photo src={image} alt="" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(16,22,35,0) 30%, rgba(16,22,35,.70))' }} />
        </div>
      )}
      <div style={{ position: 'relative', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        <div style={{ fontSize: text.sidebarTitle, fontWeight: 600, letterSpacing: tracking.title, lineHeight: 1.2, ...(image ? onPhoto : { color: color.ink }) }}>
          {props.title}
        </div>
        {props.subtitle && (
          <div style={{ fontSize: text.small, lineHeight: 1.4, ...(image ? { ...onPhoto, color: 'rgba(255,255,255,.88)' } : { color: color.muted }) }}>
            {props.subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

const TableView: ComponentRenderer<Props<typeof TableSpec>> = ({ props }) => (
  <div style={{ ...box, overflowX: 'auto' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: text.body, color: color.ink }}>
      <thead>
        <tr>
          {props.columns.map((column, index) => (
            <th key={index} style={{ textAlign: 'left', padding: '10px 14px', fontSize: text.caption, color: color.muted, fontWeight: 500, borderBottom: `1px solid ${line.hairline}`, whiteSpace: 'nowrap' }}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {props.columns.map((_, cellIndex) => (
              <td key={cellIndex} style={{ padding: '10px 14px', verticalAlign: 'top', lineHeight: 1.4, borderBottom: rowIndex === props.rows.length - 1 ? 'none' : `1px solid ${line.hairline}`, fontVariantNumeric: 'tabular-nums' }}>
                {row[cellIndex] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ButtonView: ComponentRenderer<Props<typeof ButtonSpec>> = ({ props }) => {
  const trigger = useTriggerAction();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void trigger(props.message ?? props.label); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        alignSelf: 'flex-start', height: 36, padding: '0 18px', borderRadius: radius.pill,
        border: `1px solid ${line.button}`, background: hover ? color.fill : color.paper, color: color.ink,
        font: 'inherit', fontSize: text.body, fontWeight: 500, cursor: 'pointer', boxShadow: shadow.flat,
      }}
    >
      {props.label}
    </button>
  );
};

const RowView: ComponentRenderer<Props<typeof RowSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'thin' }}>
    {props.children.map((child, index) => (
      <div key={index} style={{ display: 'contents' }}>{renderNode(child)}</div>
    ))}
  </div>
);

const GridView: ComponentRenderer<Props<typeof GridSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
    {props.children.map((child, index) => (
      <div key={index} style={{ display: 'contents' }}>{renderNode(child)}</div>
    ))}
  </div>
);

const StackView: ComponentRenderer<Props<typeof StackSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {(props.title || props.subtitle) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {props.title && (
          <div style={{ fontSize: text.section, fontWeight: 600, color: color.ink, letterSpacing: tracking.title, lineHeight: 1.25, textWrap: 'balance' }}>
            {props.title}
          </div>
        )}
        {props.subtitle && <div style={muted}>{props.subtitle}</div>}
      </div>
    )}
    {props.children.map((child, index) => (
      <div key={index} style={{ display: 'contents' }}>{renderNode(child)}</div>
    ))}
  </div>
);

const VIEWS: Record<CardComponentName, ComponentRenderer<any>> = {
  Stack: StackView,
  Banner: BannerView,
  Text: TextView,
  Row: RowView,
  Grid: GridView,
  Tile: TileView,
  Metric: MetricView,
  Fact: FactView,
  Table: TableView,
  Button: ButtonView,
};

/** The shared definitions, each with its view. Built once. */
export const CARD_VIEWS = createLibrary({
  components: CARD_COMPONENTS.map(one => defineComponent({
    name: one.name,
    props: one.props,
    description: one.description,
    component: VIEWS[one.name],
  })),
  root: 'Stack',
  id: 'caisra-cards',
});

export function CardBlock(
  { item, handlers }: { item: CardItem; handlers: CardHandlers },
): JSX.Element {
  // A deck or a report is OpenUI's own chip and view, not our cards.
  if (item.artifact) return <ArtifactBlock item={item} />;
  return <CardsBlock item={item} handlers={handlers} />;
}

function CardsBlock(
  { item, handlers }: { item: CardItem; handlers: CardHandlers },
): JSX.Element {
  const [errors, setErrors] = useState<readonly OpenUIError[]>([]);
  const onAction = useMemo(() => (event: ActionEvent) => {
    const message = event.humanFriendlyMessage.trim();
    if (message) handlers.onMessage?.(message);
  }, [handlers]);

  return (
    <div
      data-card-block={item.id}
      style={{
        // Nothing around it: the cards sit on the page, as wide as the
        // conversation column allows, and a Row scrolls inside that.
        width: '100%', maxWidth: 820, padding: '4px 0 6px', animation: enter,
      }}
    >
      <Renderer
        response={item.program}
        library={CARD_VIEWS}
        isStreaming={false}
        onAction={onAction}
        onError={setErrors}
      />
      {errors.length > 0 && (
        <div style={{ ...muted, marginTop: 8 }}>Part of this could not be shown.</div>
      )}
    </div>
  );
}
