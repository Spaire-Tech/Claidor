'use client'

import LockOutlined from '@mui/icons-material/LockOutlined'

export function PaywallRow({
  onEditSettings,
}: {
  onEditSettings?: () => void
}) {
  return (
    <div className="my-4 flex items-center gap-2.5 px-0.5">
      <div className="h-px flex-1 bg-gray-200" />
      <button
        onClick={onEditSettings}
        className="border-ce-accent-border bg-ce-accent-tint text-ce-accent hover:bg-ce-accent-tint-strong flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight transition-colors"
      >
        <LockOutlined sx={{ fontSize: 12 }} />
        Paywall · Edit
      </button>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}
