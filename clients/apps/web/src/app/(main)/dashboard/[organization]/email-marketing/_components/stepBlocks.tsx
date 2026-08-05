import { ReactNode } from 'react'
import {
  ActionStepValue,
  BranchStepValue,
  EmailStepValue,
  GoalStepValue,
  WaitStepValue,
} from './flow'
import { Icon } from './Icon'
import { Field, SegmentedControl, SelectField, Toggle } from './shared'

type Tone = {
  icon: string
  rail: string
  railText: string
  label: string
}

export const STEP_TONES: Record<
  'email' | 'wait' | 'branch' | 'action' | 'goal',
  Tone
> = {
  email: {
    icon: 'mail',
    rail: 'var(--ink)',
    railText: 'rgba(255,255,255,0.85)',
    label: 'Email',
  },
  wait: {
    icon: 'clock',
    rail: '#fff',
    railText: 'var(--indigo-2)',
    label: 'Wait',
  },
  branch: {
    icon: 'split',
    rail: 'var(--indigo-soft)',
    railText: 'var(--indigo-2)',
    label: 'Branch',
  },
  action: {
    icon: 'tag',
    rail: 'var(--green-soft)',
    railText: 'var(--green)',
    label: 'Action',
  },
  goal: {
    icon: 'target',
    rail: 'var(--ink)',
    railText: 'rgba(255,255,255,0.85)',
    label: 'Goal',
  },
}

const StepRail = ({
  type,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  type: keyof typeof STEP_TONES
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) => {
  const tone = STEP_TONES[type]
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        width: 56,
        flexShrink: 0,
        background: tone.rail,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0 16px',
        gap: 10,
        cursor: 'grab',
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.18)',
          color: tone.railText,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow:
            tone.rail === '#fff' ? '0 0 0 1px var(--line-2) inset' : 'none',
        }}
      >
        <Icon name={tone.icon} size={16} />
      </div>
      <div style={{ marginTop: 'auto', color: tone.railText, opacity: 0.7 }}>
        <Icon name="drag" size={14} />
      </div>
    </div>
  )
}

export const StepCard = ({
  type,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  onDuplicate,
  onMove,
  canMoveUp,
  canMoveDown,
  expanded,
  onToggleExpand,
  summary,
  title,
  children,
}: {
  type: keyof typeof STEP_TONES
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (dir: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
  expanded: boolean
  onToggleExpand: () => void
  summary?: string
  title: string
  children?: ReactNode
}) => {
  const tone = STEP_TONES[type]
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver(e)
      }}
      onDrop={onDrop}
      className="card"
      style={{
        overflow: 'hidden',
        borderColor: dragging ? 'var(--indigo)' : 'var(--line)',
        boxShadow: dragging
          ? '0 12px 28px -10px rgba(79,70,229,0.25)'
          : '0 1px 2px rgba(15,23,42,0.04)',
        opacity: dragging ? 0.6 : 1,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <StepRail
          type={type}
          dragging={dragging}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: expanded ? '1px solid var(--line)' : 'none',
              cursor: 'pointer',
            }}
            onClick={onToggleExpand}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}
              >
                {tone.label}
              </span>
              <span
                style={{
                  fontSize: 14.5,
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {title}
              </span>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              {summary && !expanded && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    marginRight: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summary}
                </span>
              )}
              <button
                type="button"
                className="btn-icon"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
                title="Move up"
              >
                <Icon name="arrow-up" size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
                title="Move down"
              >
                <Icon name="arrow-down" size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                onClick={onDuplicate}
                title="Duplicate"
              >
                <Icon name="copy" size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  color: 'var(--red)',
                }}
                onClick={onRemove}
                title="Remove"
              >
                <Icon name="trash" size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                onClick={onToggleExpand}
                title={expanded ? 'Collapse' : 'Expand'}
              >
                <Icon
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={12}
                />
              </button>
            </div>
          </div>
          {expanded && children}
        </div>
      </div>
    </div>
  )
}

export const EmailStepBody = ({
  value,
  onChange,
  onOpenEditor,
}: {
  value: EmailStepValue
  onChange: (v: EmailStepValue) => void
  onOpenEditor: () => void
}) => {
  const upd = (patch: Partial<EmailStepValue>) =>
    onChange({ ...value, ...patch })
  return (
    <div
      style={{
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="From name">
          <input
            className="input"
            value={value.fromName}
            onChange={(e) => upd({ fromName: e.target.value })}
            placeholder="Your name"
          />
        </Field>
        <Field label="From email">
          <input
            className="input"
            value={value.fromEmail}
            onChange={(e) => upd({ fromEmail: e.target.value })}
            placeholder="hello@yoursite.com"
          />
        </Field>
      </div>
      <Field label="Subject line">
        <input
          className="input"
          value={value.subject}
          onChange={(e) => upd({ subject: e.target.value })}
          placeholder="A short, curious subject…"
        />
      </Field>
      <Field label="Preview text" hint="Shown after the subject in the inbox">
        <input
          className="input"
          value={value.preview}
          onChange={(e) => upd({ preview: e.target.value })}
          placeholder="One line that nudges them to open."
        />
      </Field>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 200px 200px',
          gap: 12,
        }}
      >
        <Field label="Template">
          <SelectField
            value={value.template}
            onChange={(t) => upd({ template: t as EmailStepValue['template'] })}
            options={[
              { id: 'blank', label: 'Blank' },
              { id: 'plain', label: 'Plain text letter' },
              { id: 'announcement', label: 'Announcement' },
              { id: 'product', label: 'Product showcase' },
              { id: 'digest', label: 'Newsletter digest' },
            ]}
          />
        </Field>
        <Field label="A/B test">
          <Toggle on={value.abTest} onChange={(v) => upd({ abTest: v })} />
        </Field>
        <Field label="Track clicks">
          <Toggle
            on={value.trackClicks}
            onChange={(v) => upd({ trackClicks: v })}
          />
        </Field>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 8,
          borderTop: '1px dashed var(--line)',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          <Icon
            name="check-circle"
            size={12}
            style={{
              verticalAlign: '-2px',
              marginRight: 6,
              color: 'var(--green)',
            }}
          />
          Sender authenticated · DKIM passing
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenEditor}
        >
          <Icon name="edit" size={11} />
          Open in editor
        </button>
      </div>
    </div>
  )
}

export const WaitStepBody = ({
  value,
  onChange,
}: {
  value: WaitStepValue
  onChange: (v: WaitStepValue) => void
}) => {
  const upd = (patch: Partial<WaitStepValue>) =>
    onChange({ ...value, ...patch })
  return (
    <div
      style={{
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Field label="Wait mode">
        <SegmentedControl
          value={value.mode}
          onChange={(m) => upd({ mode: m })}
          options={[
            { id: 'duration', label: 'Fixed duration' },
            { id: 'until-time', label: 'Until time of day' },
            { id: 'until-event', label: 'Until event' },
          ]}
        />
      </Field>
      {value.mode === 'duration' && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}
        >
          <Field label="Amount">
            <input
              className="input"
              type="number"
              min={1}
              value={value.amount}
              onChange={(e) => upd({ amount: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Unit">
            <SegmentedControl
              value={value.unit}
              onChange={(u) => upd({ unit: u })}
              options={[
                { id: 'min', label: 'Minutes' },
                { id: 'hour', label: 'Hours' },
                { id: 'day', label: 'Days' },
                { id: 'week', label: 'Weeks' },
              ]}
            />
          </Field>
        </div>
      )}
      {value.mode === 'until-time' && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Field label="Day offset">
            <SelectField
              value={value.dayOffset ?? 'next'}
              onChange={(d) =>
                upd({ dayOffset: d as WaitStepValue['dayOffset'] })
              }
              options={[
                { id: 'next', label: 'Next day' },
                { id: '+2', label: 'In 2 days' },
                { id: '+3', label: 'In 3 days' },
                { id: '+7', label: 'In 7 days' },
              ]}
            />
          </Field>
          <Field label="Time of day">
            <input
              className="input"
              type="time"
              value={value.time ?? '09:00'}
              onChange={(e) => upd({ time: e.target.value })}
            />
          </Field>
        </div>
      )}
      {value.mode === 'until-event' && (
        <Field
          label="Event name"
          hint="Wait until this event fires for the subscriber"
        >
          <SelectField
            value={value.event ?? 'module-1-started'}
            onChange={(ev) => upd({ event: ev })}
            options={[
              { id: 'module-1-started', label: 'Season 1 started' },
              { id: 'module-1-completed', label: 'Season 1 completed' },
              { id: 'product-purchased', label: 'Any product purchased' },
              { id: 'link-clicked', label: 'Email link clicked' },
            ]}
          />
        </Field>
      )}
    </div>
  )
}

export const BranchStepBody = ({
  value,
  onChange,
  productOptions,
  lessonOptions = [],
  moduleOptions = [],
  courseMode = false,
}: {
  value: BranchStepValue
  onChange: (v: BranchStepValue) => void
  productOptions: { id: string; label: string }[]
  // Lessons / modules of the course the sequence is linked to. Empty when
  // the editor isn't in course-mode — the course-progress options stay
  // hidden in that case to avoid offering branches that would never fire.
  lessonOptions?: { id: string; label: string }[]
  moduleOptions?: { id: string; label: string }[]
  courseMode?: boolean
}) => {
  const upd = (patch: Partial<BranchStepValue>) =>
    onChange({ ...value, ...patch })
  const conditionOptions = [
    { id: 'opened-prev', label: 'Opened previous email' },
    { id: 'clicked-prev', label: 'Clicked link in previous email' },
    { id: 'has-tag', label: 'Has tag' },
    { id: 'product-bought', label: 'Bought specific product' },
    { id: 'engagement', label: 'Engagement score' },
    ...(courseMode
      ? [
          { id: 'lesson-completed', label: 'Completed specific lesson' },
          { id: 'module-completed', label: 'Completed module' },
          { id: 'course-progress', label: 'Course progress %' },
          {
            id: 'course-completed-within',
            label: 'Completed course within X days',
          },
        ]
      : []),
  ]
  return (
    <div
      style={{
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Field label="Condition">
        <SelectField
          value={value.field}
          onChange={(f) => upd({ field: f as BranchStepValue['field'] })}
          options={conditionOptions}
        />
      </Field>
      {value.field === 'has-tag' && (
        <Field label="Tag">
          <SelectField
            value={value.tag ?? 'engaged'}
            onChange={(t) => upd({ tag: t })}
            options={[
              { id: 'engaged', label: 'engaged' },
              { id: 'vip', label: 'vip-customer' },
              { id: 'student', label: 'enrolled-student' },
              { id: 'podcast', label: 'podcast-listener' },
            ]}
          />
        </Field>
      )}
      {value.field === 'product-bought' && (
        <Field label="Product">
          <SelectField
            value={value.product ?? productOptions[0]?.id ?? ''}
            onChange={(p) => upd({ product: p })}
            options={productOptions}
          />
        </Field>
      )}
      {value.field === 'engagement' && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}
        >
          <Field label="Operator">
            <SelectField
              value={value.op ?? 'gte'}
              onChange={(o) => upd({ op: o as BranchStepValue['op'] })}
              options={[
                { id: 'gte', label: 'is at least' },
                { id: 'lte', label: 'is at most' },
                { id: 'eq', label: 'equals' },
              ]}
            />
          </Field>
          <Field label="Threshold (0–100)">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={value.threshold ?? 50}
              onChange={(e) =>
                upd({ threshold: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </Field>
        </div>
      )}
      {value.field === 'lesson-completed' && (
        <Field
          label="Lesson"
          hint="Yes path runs for subscribers who've marked this lesson complete"
        >
          {lessonOptions.length === 0 ? (
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--ink-4)',
                padding: '8px 10px',
                border: '1px dashed var(--line-2)',
                borderRadius: 8,
              }}
            >
              This course has no published lessons yet — add lessons to use this
              branch.
            </div>
          ) : (
            <SelectField
              value={value.lesson ?? lessonOptions[0]?.id ?? ''}
              onChange={(l) => upd({ lesson: l })}
              options={lessonOptions}
            />
          )}
        </Field>
      )}
      {value.field === 'module-completed' && (
        <Field
          label="Season"
          hint="Yes path runs once every published lesson in the season is complete"
        >
          {moduleOptions.length === 0 ? (
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--ink-4)',
                padding: '8px 10px',
                border: '1px dashed var(--line-2)',
                borderRadius: 8,
              }}
            >
              This course has no modules yet — add a module to use this branch.
            </div>
          ) : (
            <SelectField
              value={value.module ?? moduleOptions[0]?.id ?? ''}
              onChange={(m) => upd({ module: m })}
              options={moduleOptions}
            />
          )}
        </Field>
      )}
      {value.field === 'course-progress' && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}
        >
          <Field label="Operator">
            <SelectField
              value={(value.op as 'gte' | 'lte' | 'eq') ?? 'gte'}
              onChange={(o) => upd({ op: o as BranchStepValue['op'] })}
              options={[
                { id: 'gte', label: 'is at least' },
                { id: 'lte', label: 'is at most' },
                { id: 'eq', label: 'equals' },
              ]}
            />
          </Field>
          <Field label="Progress (% of course)">
            <SelectField
              value={String(value.threshold ?? 50)}
              onChange={(t) => upd({ threshold: Number(t) })}
              options={[
                { id: '25', label: '25%' },
                { id: '50', label: '50%' },
                { id: '75', label: '75%' },
                { id: '100', label: '100% (course complete)' },
              ]}
            />
          </Field>
        </div>
      )}
      {value.field === 'course-completed-within' && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}
        >
          <Field label="Completer type">
            <SelectField
              value={(value.op as 'within' | 'over') ?? 'within'}
              onChange={(o) => upd({ op: o as BranchStepValue['op'] })}
              options={[
                { id: 'within', label: 'Fast (finished within)' },
                { id: 'over', label: 'Slow (still not done after)' },
              ]}
            />
          </Field>
          <Field label="Days from enrolment">
            <input
              className="input"
              type="number"
              min={1}
              max={365}
              value={value.days ?? 7}
              onChange={(e) =>
                upd({ days: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </Field>
        </div>
      )}
      <div
        style={{
          background: 'var(--indigo-soft)',
          border: '1px solid var(--indigo-line)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 12.5,
          color: 'var(--indigo-2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <Icon name="info" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
        <div>
          Branch creates two paths: <strong>Yes</strong> and <strong>No</strong>
          . Add steps under each in the flow preview.
        </div>
      </div>
    </div>
  )
}

export const ActionStepBody = ({
  value,
  onChange,
  sequenceOptions,
}: {
  value: ActionStepValue
  onChange: (v: ActionStepValue) => void
  sequenceOptions: { id: string; label: string }[]
}) => {
  const upd = (patch: Partial<ActionStepValue>) =>
    onChange({ ...value, ...patch })
  return (
    <div
      style={{
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Field label="Action type">
        <SelectField
          value={value.action}
          onChange={(a) => upd({ action: a as ActionStepValue['action'] })}
          options={[
            { id: 'add-tag', label: 'Add tag to subscriber' },
            { id: 'remove-tag', label: 'Remove tag' },
            { id: 'update-field', label: 'Update custom field' },
            { id: 'enroll', label: 'Enroll in another sequence' },
            { id: 'webhook', label: 'Send webhook' },
            { id: 'notify', label: 'Notify team via Slack' },
          ]}
        />
      </Field>
      {(value.action === 'add-tag' || value.action === 'remove-tag') && (
        <Field label="Tag">
          <input
            className="input"
            value={value.tag ?? ''}
            onChange={(e) => upd({ tag: e.target.value })}
            placeholder="completed-onboarding"
          />
        </Field>
      )}
      {value.action === 'update-field' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <Field label="Field key">
            <input
              className="input"
              value={value.key ?? ''}
              onChange={(e) => upd({ key: e.target.value })}
              placeholder="favourite_module"
            />
          </Field>
          <Field
            label="New value"
            hint="Leave blank to clear the field for this subscriber."
          >
            <input
              className="input"
              value={value.value ?? ''}
              onChange={(e) => upd({ value: e.target.value })}
              placeholder="brand-foundations"
            />
          </Field>
        </div>
      )}
      {value.action === 'enroll' && (
        <Field label="Sequence">
          <SelectField
            value={value.sequence ?? sequenceOptions[0]?.id ?? ''}
            onChange={(s) => upd({ sequence: s })}
            options={sequenceOptions}
          />
        </Field>
      )}
      {value.action === 'webhook' && (
        <Field label="URL">
          <input
            className="input"
            value={value.url ?? ''}
            onChange={(e) => upd({ url: e.target.value })}
            placeholder="https://example.com/webhook"
          />
        </Field>
      )}
    </div>
  )
}

export const GoalStepBody = ({
  value,
  onChange,
}: {
  value: GoalStepValue
  onChange: (v: GoalStepValue) => void
}) => {
  return (
    <div
      style={{
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Field
        label="Goal event"
        hint="When this fires, the subscriber exits the sequence and is counted as a conversion"
      >
        <SelectField
          value={value.event}
          onChange={(ev) => onChange({ event: ev })}
          options={[
            { id: 'module-1-started', label: 'Season 1 started' },
            { id: 'module-1-completed', label: 'Season 1 completed' },
            { id: 'product-purchased', label: 'Product purchased' },
            { id: 'link-clicked', label: 'Specific link clicked' },
            { id: 'tag-added', label: 'Tag added' },
          ]}
        />
      </Field>
    </div>
  )
}
