import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export type ActionMenuItem = {
  label: string
  icon?: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
  hidden?: boolean
}

export const ActionMenu = ({
  items,
  align = 'right',
  trigger,
}: {
  items: ActionMenuItem[]
  align?: 'left' | 'right'
  trigger?: ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = items.filter((i) => !i.hidden)

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: 8, borderRadius: 8 }}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Actions"
      >
        {trigger ?? <Icon name="more" size={16} />}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: 6,
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            minWidth: 200,
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            zIndex: 60,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {visible.map((item, i) => {
            const itemStyle: CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              textAlign: 'left',
              color: item.destructive ? 'var(--red)' : 'var(--ink-2)',
              opacity: item.disabled ? 0.4 : 1,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.12s',
            }
            return (
              <button
                key={i}
                style={itemStyle}
                disabled={item.disabled}
                onMouseEnter={(e) => {
                  if (!item.disabled)
                    e.currentTarget.style.background = item.destructive
                      ? 'var(--red-soft)'
                      : 'var(--bg-softer)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
                onClick={() => {
                  if (item.disabled) return
                  setOpen(false)
                  item.onClick()
                }}
              >
                {item.icon && <Icon name={item.icon} size={14} />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
