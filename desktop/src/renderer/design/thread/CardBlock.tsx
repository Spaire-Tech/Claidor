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
import type { CardItem } from './types';

/**
 * The answer cards, drawn.
 *
 * OpenUI parses the block and hands each component its arguments; every
 * component here is ours, in the thread's own tokens, so a block reads
 * as part of the conversation and not as a web page dropped into it.
 * The founder: *"this should 100% be our design."*
 *
 * What the language can name is `shared/cards/library.ts`; this file is
 * only how each of those looks. A block that names something the
 * library does not have, or leaves a required argument out, draws what
 * it can and says nothing: the agent was told the rules, and a broken
 * card is not the person's problem to read.
 */

export interface CardHandlers {
  /** A pressed button or tile action: the label goes to the agent as the person's next message. */
  onMessage?: (message: string) => void;
}

type Props<S extends { props: z.ZodObject }> = z.infer<S['props']>;

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

/** A chip: the tag on a tile. */
const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
  borderRadius: radius.chip, background: color.successFill, color: color.success,
  fontSize: text.caption, fontWeight: 500, letterSpacing: tracking.body, whiteSpace: 'nowrap',
};

const card: CSSProperties = {
  borderRadius: radius.card, background: color.paper, border: `1px solid ${line.hairline}`,
  boxShadow: shadow.flat, overflow: 'hidden', display: 'flex', flexDirection: 'column',
};

const label: CSSProperties = { fontSize: text.caption, color: color.muted, lineHeight: 1.3 };
const muted: CSSProperties = { fontSize: text.small, color: color.muted, lineHeight: 1.4 };

function Picture({ src, alt, height }: { src: string; alt: string; height: number }): JSX.Element | null {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      style={{ display: 'block', width: '100%', height, objectFit: 'cover', background: color.fill }}
    />
  );
}

const TextView: ComponentRenderer<Props<typeof TextSpec>> = ({ props }) => {
  const tone = props.tone ?? 'body';
  const style: CSSProperties = tone === 'title'
    ? { fontSize: text.emphasis, fontWeight: 600, color: color.ink, letterSpacing: tracking.title, lineHeight: 1.3 }
    : tone === 'muted'
      ? { ...muted }
      : { fontSize: text.message, color: color.ink, lineHeight: 1.45 };
  return <div style={{ ...style, textWrap: 'pretty' }}>{props.text}</div>;
};

const TileView: ComponentRenderer<Props<typeof TileSpec>> = ({ props }) => {
  const trigger = useTriggerAction();
  const [hover, setHover] = useState(false);
  const image = cardImageUrl(props.image);
  return (
    <div style={{ ...card, width: 232, flex: '0 0 auto' }}>
      {image && <Picture src={image} alt={props.name} height={132} />}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto' }}>
        {props.tag && <span style={{ ...chip, alignSelf: 'flex-start' }}>{props.tag}</span>}
        <div style={{ fontSize: text.emphasis, fontWeight: 600, color: color.ink, lineHeight: 1.3, letterSpacing: tracking.title }}>
          {props.name}
        </div>
        {props.line && <div style={muted}>{props.line}</div>}
        {props.action && (
          <button
            type="button"
            onClick={() => { void trigger(`${props.action}: ${props.name}`); }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              marginTop: 6, height: 36, padding: '0 14px', borderRadius: radius.pill, border: 'none',
              background: hover ? color.inkHover : color.ink, color: color.paper, font: 'inherit',
              fontSize: text.body, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}
          >
            <span>{props.action}</span>
            <ChevronRightIcon size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

const MetricView: ComponentRenderer<Props<typeof MetricSpec>> = ({ props }) => (
  <div style={{ ...card, padding: '12px 14px', minWidth: 150, flex: '1 1 150px', gap: 4 }}>
    <div style={label}>{props.label}</div>
    <div style={{ fontSize: text.screenTitle, fontWeight: 600, color: color.ink, letterSpacing: tracking.screenTitle, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
      {props.value}
    </div>
    {props.note && <div style={muted}>{props.note}</div>}
  </div>
);

const FactView: ComponentRenderer<Props<typeof FactSpec>> = ({ props }) => (
  <div style={{ ...card, padding: '11px 14px', minWidth: 150, flex: '1 1 150px', gap: 2 }}>
    <div style={{ fontSize: text.body, fontWeight: 500, color: color.ink, lineHeight: 1.3 }}>{props.label}</div>
    <div style={muted}>{props.value}</div>
  </div>
);

const BannerView: ComponentRenderer<Props<typeof BannerSpec>> = ({ props }) => {
  const image = cardImageUrl(props.image);
  return (
    <div style={{ ...card, position: 'relative', minHeight: image ? 150 : undefined, background: image ? color.ink : color.fillRaised }}>
      {image && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Picture src={image} alt="" height={150} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(16,22,35,.10), rgba(16,22,35,.62))' }} />
        </div>
      )}
      <div style={{ position: 'relative', padding: '16px 18px', marginTop: image ? 'auto' : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: text.section, fontWeight: 600, letterSpacing: tracking.title, lineHeight: 1.25, color: image ? '#fff' : color.ink }}>
          {props.title}
        </div>
        {props.subtitle && (
          <div style={{ fontSize: text.small, lineHeight: 1.4, color: image ? 'rgba(255,255,255,.82)' : color.muted }}>{props.subtitle}</div>
        )}
      </div>
    </div>
  );
};

const TableView: ComponentRenderer<Props<typeof TableSpec>> = ({ props }) => (
  <div style={{ ...card, overflowX: 'auto' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: text.body, color: color.ink }}>
      <thead>
        <tr>
          {props.columns.map((column, index) => (
            <th key={index} style={{ textAlign: 'left', padding: '10px 14px', ...label, fontWeight: 500, borderBottom: `1px solid ${line.hairline}`, whiteSpace: 'nowrap' }}>
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
        font: 'inherit', fontSize: text.body, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {props.label}
    </button>
  );
};

const RowView: ComponentRenderer<Props<typeof RowSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'thin' }}>
    {props.children.map((child, index) => (
      <div key={index} style={{ display: 'contents' }}>{renderNode(child)}</div>
    ))}
  </div>
);

const GridView: ComponentRenderer<Props<typeof GridSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
    {props.children.map((child, index) => (
      <div key={index} style={{ display: 'contents' }}>{renderNode(child)}</div>
    ))}
  </div>
);

const StackView: ComponentRenderer<Props<typeof StackSpec>> = ({ props, renderNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {(props.title || props.subtitle) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {props.title && (
          <div style={{ fontSize: text.sidebarTitle, fontWeight: 600, color: color.ink, letterSpacing: tracking.title, lineHeight: 1.25, textWrap: 'balance' }}>
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
  const [errors, setErrors] = useState<readonly OpenUIError[]>([]);
  const onAction = useMemo(() => (event: ActionEvent) => {
    const message = event.humanFriendlyMessage.trim();
    if (message) handlers.onMessage?.(message);
  }, [handlers]);

  return (
    <div
      data-card-block={item.id}
      style={{
        // As wide as a long bubble, no wider: the block belongs to the
        // conversation column, and a Row scrolls inside it.
        maxWidth: 'min(100%, 640px)', padding: 14, borderRadius: radius.panel,
        background: color.fill, border: `1px solid ${line.hairline}`,
        marginTop: 6, animation: enter,
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
        // For the person, nothing loud: the agent wrote something the
        // library cannot draw. One quiet line, so the block is not a
        // silent blank.
        <div style={{ ...muted, marginTop: 8 }}>Part of this could not be shown.</div>
      )}
    </div>
  );
}
