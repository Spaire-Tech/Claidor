'use client'

import { CourseRead } from '@/hooks/queries/courses'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined'
import { cn } from '@spaire/ui/lib/utils'

export type TabId =
  | 'outline'
  | 'customize'
  | 'community'
  | 'automations'
  | 'settings'
  | 'auth'
  | 'pricing'
  | 'customers'

// The Course Assistant is configured from the Settings tab (a toggle), not a
// top-level tab of its own.
const TABS: { id: TabId; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'customize', label: 'Landing' },
  { id: 'community', label: 'Community' },
  { id: 'automations', label: 'Automations' },
  { id: 'settings', label: 'Settings' },
  { id: 'auth', label: 'Auth' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'customers', label: 'Customers' },
]

export function CourseHeader({
  course,
  activeTab,
  onTabChange,
  onAddContent,
  onBack,
}: {
  course: CourseRead
  organizationSlug: string
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  customersCount?: number
  offersCount?: number
  onAddContent?: () => void
  onBack?: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex flex-shrink-0 flex-col">
      {/* Topbar — back · centered title · CTA */}
      <div className="relative z-10 grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-gray-200 bg-gray-50/85 px-5 backdrop-blur">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="text-ce-accent flex items-center gap-0.5 py-1 text-[13px] tracking-tight transition-opacity hover:opacity-70"
          >
            <ChevronLeftOutlined sx={{ fontSize: 16 }} />
            Courses
          </button>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[13px] font-semibold tracking-tight text-gray-900">
            {course.title ?? 'Untitled Course'}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {activeTab === 'outline' && (
            <button
              onClick={onAddContent}
              className="bg-ce-accent flex items-center gap-1 rounded-full px-3.5 py-[5px] text-xs font-medium tracking-tight text-white transition-[filter] hover:brightness-110"
            >
              <AddOutlined sx={{ fontSize: 12 }} />
              Add lesson
            </button>
          )}
        </div>
      </div>

      {/* Tabs row — centered */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-gray-200 bg-white">
        {TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-[13px] tracking-tight transition-colors',
                active
                  ? 'border-ce-accent text-ce-accent font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-900',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
