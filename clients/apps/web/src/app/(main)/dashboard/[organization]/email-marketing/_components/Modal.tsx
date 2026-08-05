import { ReactNode, useEffect } from 'react'
import { Icon } from './Icon'

export const Modal = ({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: number
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.32)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h3 className="h3">{title}</h3>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: 6, borderRadius: 8 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x-circle" size={18} />
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}
