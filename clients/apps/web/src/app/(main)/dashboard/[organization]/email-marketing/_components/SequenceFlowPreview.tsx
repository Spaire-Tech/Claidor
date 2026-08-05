import { Fragment } from 'react'
import {
  ACTION_LABEL,
  BRANCH_FIELD_LABEL,
  StepNode,
  estimateDays,
} from './flow'
import { Icon } from './Icon'

const TRIGGER_META: Record<string, { label: string; icon: string }> = {
  on_subscribe: { label: 'On subscribe', icon: 'user' },
  on_purchase: { label: 'On purchase', icon: 'shopping-cart' },
  on_subscription_created: {
    label: 'Subscription started',
    icon: 'rotate',
  },
  on_subscription_cancelled: {
    label: 'Subscription cancelled',
    icon: 'x-circle',
  },
  on_form_submit: { label: 'Form submitted', icon: 'tag' },
  manual: { label: 'Manual / API', icon: 'mouse-pointer' },
}

// Tree-shaped flow_doc.steps: branches carry their own `yes` / `no` arrays
// of StepNodes (audit issue #7). The previous heuristic assumed branches'
// children sat at i+1/i+2 in the parent's array, which collapsed everything
// past the first child into "unrepresentable" — multi-step arms, nested
// branches, even a wait between a branch and its first arm step were lost.
// We now just walk the tree recursively.

export const SequenceFlowPreview = ({
  steps,
  name,
  trigger,
  onBack,
  onEdit,
  onActivate,
  compact,
}: {
  steps: StepNode[]
  name: string
  trigger: string
  onBack: () => void
  onEdit: () => void
  onActivate?: () => void
  compact?: boolean
}) => {
  const triggerObj = TRIGGER_META[trigger] ?? TRIGGER_META.manual
  // Count emails across the whole tree, including both arms of every branch.
  const totalEmails = ((): number => {
    let n = 0
    const visit = (nodes: StepNode[]) => {
      for (const node of nodes) {
        if (node.type === 'email') n += 1
        if (node.type === 'branch') {
          visit(node.yes)
          visit(node.no)
        }
      }
    }
    visit(steps)
    return n
  })()
  const totalDays = estimateDays(steps)

  return (
    <div className="fade-up" style={{ paddingBottom: compact ? 0 : 80 }}>
      {!compact && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="btn-icon"
              onClick={onBack}
              aria-label="Back"
            >
              <Icon name="arrow-left" size={16} />
            </button>
            <div>
              <div className="eyebrow">Flow preview</div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  marginTop: 4,
                }}
              >
                {name}
              </div>
              <div
                style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}
              >
                {totalEmails} email{totalEmails === 1 ? '' : 's'} · ~{totalDays}{' '}
                day{totalDays === 1 ? '' : 's'} · read-only visualisation
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onEdit}
            >
              <Icon name="edit" size={12} />
              Back to form
            </button>
            {onActivate && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onActivate}
              >
                <Icon name="zap" size={13} />
                Activate
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          padding: '40px 32px 32px',
          maxWidth: 880,
          margin: '0 auto',
          background: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 22px 12px 14px',
              background: 'var(--ink)',
              color: '#fff',
              borderRadius: 999,
              boxShadow: '0 8px 24px -10px rgba(0,0,0,0.3)',
              minWidth: 320,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={triggerObj.icon} size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10.5,
                  opacity: 0.7,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Trigger
              </div>
              <div style={{ fontSize: 15, marginTop: 1 }}>
                {triggerObj.label}
              </div>
            </div>
          </div>

          <FlowSubtree steps={steps} />
          {steps.length === 0 && <DashedLine height={28} />}

          <DashedLine height={28} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--ink)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 22px -8px rgba(0,0,0,0.3)',
              }}
            >
              <Icon name="check" size={20} strokeWidth={2} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: 'var(--ink)' }}>
                End of sequence
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}
              >
                Subscriber exits and can be enrolled in others.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DashedLine = ({ height = 24 }: { height?: number }) => (
  <div
    style={{
      width: 2,
      height,
      background:
        'repeating-linear-gradient(180deg, var(--indigo-line) 0, var(--indigo-line) 4px, transparent 4px, transparent 8px)',
    }}
  />
)

/**
 * Recursive renderer: walks the steps tree depth-first. Each non-branch
 * node renders as a single card or pill; each branch node renders as a
 * BranchSplit whose Yes / No children are themselves subtrees, so nested
 * branches and multi-step arms work without changes here.
 */
const FlowSubtree = ({
  steps,
  compact,
}: {
  steps: StepNode[]
  compact?: boolean
}) => (
  <>
    {steps.map((step) => (
      <Fragment key={step.id}>
        <DashedLine height={28} />
        {step.type === 'branch' ? (
          <BranchSplit branchStep={step} compact={compact} />
        ) : (
          <FlowNode step={step} compact={compact} />
        )}
      </Fragment>
    ))}
  </>
)

const FlowNode = ({ step, compact }: { step: StepNode; compact?: boolean }) => {
  if (step.type === 'email')
    return <EmailFlowCard step={step} compact={compact} />
  if (step.type === 'wait') return <WaitPill step={step} />
  if (step.type === 'action') return <ActionPill step={step} />
  if (step.type === 'goal') return <GoalPill step={step} />
  return null
}

const EmailFlowCard = ({
  step,
  compact,
}: {
  step: Extract<StepNode, { type: 'email' }>
  compact?: boolean
}) => (
  <div
    style={{
      width: '100%',
      maxWidth: compact ? '100%' : 520,
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 14,
      boxShadow:
        '0 1px 2px rgba(15,23,42,0.04), 0 8px 22px -16px rgba(15,23,42,0.18)',
      overflow: 'hidden',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <div
        style={{
          width: 52,
          background: 'var(--ink)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: '14px 0',
          gap: 6,
        }}
      >
        <Icon name="mail" size={15} />
      </div>
      <div
        style={{
          flex: 1,
          padding: compact ? '12px 16px' : '16px 20px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--indigo-2)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 5,
          }}
        >
          Email
        </div>
        <div
          style={{
            fontSize: compact ? 14 : 15.5,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}
        >
          {step.value.subject || 'Untitled email'}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-3)',
            marginTop: 5,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {step.value.preview}
        </div>
      </div>
    </div>
  </div>
)

const WaitPill = ({ step }: { step: Extract<StepNode, { type: 'wait' }> }) => {
  const v = step.value
  const label =
    v.mode === 'duration'
      ? `Wait ${v.amount} ${v.unit}${v.amount > 1 ? 's' : ''}`
      : v.mode === 'until-time'
        ? `Wait until ${v.time}`
        : 'Wait until event'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 16px',
        background: '#fff',
        border: '1px solid var(--indigo-line)',
        color: 'var(--indigo-2)',
        borderRadius: 999,
        fontSize: 12.5,
        boxShadow: '0 4px 10px -4px rgba(79,70,229,0.18)',
      }}
    >
      <Icon name="clock" size={12} />
      {label}
    </div>
  )
}

const ActionPill = ({
  step,
}: {
  step: Extract<StepNode, { type: 'action' }>
}) => {
  const v = step.value
  const tag = v.tag ?? ''
  const label =
    v.action === 'add-tag'
      ? `Add tag · ${tag}`
      : v.action === 'remove-tag'
        ? `Remove tag · ${tag}`
        : v.action === 'enroll'
          ? 'Enrol in another sequence'
          : v.action === 'webhook'
            ? 'Send webhook'
            : (ACTION_LABEL[v.action] ?? 'Action')
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 16px',
        background: 'var(--green-soft)',
        color: 'var(--green)',
        borderRadius: 999,
        fontSize: 12.5,
      }}
    >
      <Icon name="tag" size={12} />
      {label}
    </div>
  )
}

const GoalPill = ({ step }: { step: Extract<StepNode, { type: 'goal' }> }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 18px',
      background: 'var(--ink)',
      color: '#fff',
      borderRadius: 999,
      fontSize: 12.5,
      boxShadow: '0 6px 14px -6px rgba(0,0,0,0.3)',
    }}
  >
    <Icon name="target" size={12} />
    Goal · {step.value.event || 'event'}
  </div>
)

const BranchSplit = ({
  branchStep,
  compact,
}: {
  branchStep: Extract<StepNode, { type: 'branch' }>
  compact?: boolean
}) => {
  const v = branchStep.value
  const yes = branchStep.yes
  const no = branchStep.no
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 20px',
          background: '#fff',
          border: '2px solid var(--indigo-line)',
          borderRadius: 14,
          color: 'var(--ink)',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'var(--indigo-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="split" size={14} style={{ color: 'var(--indigo-2)' }} />
        </div>
        <div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--indigo-2)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            Branch
          </div>
          <div style={{ fontSize: 14.5, marginTop: 3 }}>
            If {BRANCH_FIELD_LABEL[v.field] ?? v.field}
          </div>
        </div>
      </div>

      <DashedLine height={20} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          width: '100%',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '25%',
            right: '25%',
            height: 16,
            borderLeft: '2px solid var(--indigo-line)',
            borderRight: '2px solid var(--indigo-line)',
            borderBottom: '2px solid var(--indigo-line)',
            borderRadius: '0 0 12px 12px',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -16,
            left: '50%',
            width: 2,
            height: 16,
            background: 'var(--indigo-line)',
            transform: 'translateX(-50%)',
          }}
        />

        <BranchPath label="Yes" tone="success">
          {yes.length > 0 ? (
            <FlowSubtree steps={yes} compact={compact} />
          ) : (
            <EmptyBranch />
          )}
        </BranchPath>
        <BranchPath label="No" tone="muted">
          {no.length > 0 ? (
            <FlowSubtree steps={no} compact={compact} />
          ) : (
            <EmptyBranch />
          )}
        </BranchPath>
      </div>
    </div>
  )
}

const BranchPath = ({
  label,
  tone,
  children,
}: {
  label: 'Yes' | 'No'
  tone: 'success' | 'muted'
  children: React.ReactNode
}) => {
  const tones = {
    success: {
      bg: 'var(--green-soft)',
      color: 'var(--green)',
      border: 'rgba(26,122,62,0.25)',
    },
    muted: {
      bg: 'var(--bg-softer)',
      color: 'var(--ink-3)',
      border: 'var(--line-2)',
    },
  } as const
  const t = tones[tone]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 28,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 11,
          background: t.bg,
          color: t.color,
          border: `1px solid ${t.border}`,
          marginBottom: 14,
        }}
      >
        <Icon name={label === 'Yes' ? 'check' : 'x-circle'} size={10} />
        {label}
      </div>
      {children}
    </div>
  )
}

const EmptyBranch = () => (
  <div
    style={{
      padding: '12px 18px',
      border: '1px dashed var(--line-2)',
      borderRadius: 10,
      fontSize: 12,
      color: 'var(--ink-4)',
      background: '#fafafa',
    }}
  >
    No step configured
  </div>
)
