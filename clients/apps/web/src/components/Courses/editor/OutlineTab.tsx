'use client'

import {
  CourseLessonRead,
  CourseModuleRead,
  CourseRead,
  usePreviewAccess,
} from '@/hooks/queries/courses'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AddOutlined from '@mui/icons-material/AddOutlined'
import CardGiftcardOutlined from '@mui/icons-material/CardGiftcardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { useEffect, useMemo, useState } from 'react'
import { toast } from '../../Toast/use-toast'
import { LessonOptionsMenu, LessonOptionsPatch } from './LessonOptionsMenu'
import { PaywallRow } from './PaywallRow'
import { ScheduleEdits, ScheduleMenu } from './ScheduleMenu'

// The kinds of lesson the outline can create. Lives here (the live outline)
// now that the old ModuleCard that used to own it has been removed.
export type LessonContentType = 'text' | 'video' | 'quiz'

// Every lesson without a still wears the same flat navy placeholder — one
// color across the whole outline, no per-position variety.
const THUMB_PLACEHOLDER_COLOR = '#1F3A68'

function ThumbArt({
  thumbnailUrl,
  objectPosition,
}: {
  thumbnailUrl: string | null
  objectPosition?: string | null
}) {
  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: objectPosition ?? '50% 50%' }}
      />
    )
  }
  return (
    <div
      className="absolute inset-0 h-full w-full"
      style={{ backgroundColor: THUMB_PLACEHOLDER_COLOR }}
    />
  )
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  return `${m}m`
}

function LessonCard({
  lesson,
  position,
  locked,
  isSelected,
  isReorderable,
  canSchedule = true,
  allowSchedule = true,
  scheduleUpgradeTier,
  onSelect,
  onUpdate,
  onDelete,
}: {
  lesson: CourseLessonRead
  position: number
  locked: boolean
  isSelected: boolean
  isReorderable: boolean
  canSchedule?: boolean
  allowSchedule?: boolean
  scheduleUpgradeTier?: string
  onSelect: () => void
  onUpdate: (patch: LessonOptionsPatch) => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, disabled: !isReorderable })
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={onSelect}
      className={cardWrapperClass(isSelected, isDragging, menuOpen)}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl">
        <ThumbArt
          thumbnailUrl={lesson.thumbnail_url ?? null}
          objectPosition={lesson.thumbnail_object_position ?? null}
        />
        {/* Ep badge — fades out on hover so the drag handle can sit in the same spot. */}
        <div className="absolute top-[7px] left-2 z-10 text-[9px] font-semibold tracking-[0.07em] text-white/75 uppercase transition-opacity [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] group-hover:opacity-0">
          Ep {position}
        </div>
        {isReorderable && (
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder lesson"
            className="absolute top-[7px] left-2 z-20 flex h-[18px] w-[18px] cursor-grab items-center justify-center rounded-md bg-black/45 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          >
            <DragIndicatorOutlined
              sx={{ fontSize: 11 }}
              className="text-white"
            />
          </button>
        )}
        {/* Lock + Live share the top-right corner — render them in one flex
            row so a published lesson sitting behind the paywall doesn't stack
            the green "Live" pill on top of the lock glyph. */}
        {(locked || lesson.published) && (
          <div className="absolute top-[7px] right-2 z-10 flex items-center gap-1">
            {locked && (
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                <LockOutlined sx={{ fontSize: 10 }} className="text-white" />
              </span>
            )}
            {lesson.published && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.05em] text-green-700 uppercase">
                <span className="h-1 w-1 rounded-full bg-green-500" />
                Live
              </span>
            )}
          </div>
        )}
        {(lesson.drip_days != null || lesson.release_at) && (
          <div className="absolute bottom-[7px] left-2 z-10 flex items-center gap-1">
            {lesson.drip_days != null && (
              <span className="rounded-md bg-amber-500/90 px-1.5 py-[2px] text-[8.5px] font-bold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
                Drip {lesson.drip_days}d
              </span>
            )}
            {lesson.release_at && lesson.drip_days == null && (
              <span className="rounded-md bg-amber-500/90 px-1.5 py-[2px] text-[8.5px] font-bold tracking-[0.08em] text-white uppercase backdrop-blur-sm">
                Scheduled
              </span>
            )}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-transparent transition-colors group-hover:bg-black/15">
          <div className="flex h-8 w-8 scale-75 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-md transition-all group-hover:scale-100 group-hover:opacity-100">
            <PlayArrowRounded sx={{ fontSize: 16 }} className="text-gray-900" />
          </div>
        </div>
      </div>
      <div className="px-[11px] pt-[9px] pb-[11px]">
        <div className="mb-[5px] line-clamp-2 text-[11.5px] leading-[1.35] font-semibold tracking-tight text-gray-900">
          {lesson.title}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[3px] text-[10.5px] text-gray-400">
            <ScheduleOutlined sx={{ fontSize: 10 }} />
            {formatDuration(lesson.duration_seconds)}
          </div>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
              className="flex items-center rounded-md p-[2px_3px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Lesson options"
            >
              <MoreHorizOutlined sx={{ fontSize: 14 }} />
            </button>
            {menuOpen && (
              <LessonOptionsMenu
                lesson={lesson}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onClose={() => setMenuOpen(false)}
                canSchedule={canSchedule}
                allowSchedule={allowSchedule}
                upgradeTier={scheduleUpgradeTier}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function cardWrapperClass(
  selected: boolean,
  dragging: boolean = false,
  menuOpen: boolean = false,
): string {
  // No overflow-hidden on the outer — the lesson options menu pops below the
  // card and would otherwise be clipped. The thumbnail clips itself via
  // rounded-t-2xl on its own container.
  return [
    'group relative cursor-pointer rounded-2xl border bg-white transition-all',
    menuOpen ? 'z-40' : dragging ? 'z-30' : '',
    dragging
      ? 'shadow-[0_18px_50px_rgba(0,0,0,0.18),0_4px_10px_rgba(0,0,0,0.08)]'
      : 'shadow-[0_1px_4px_rgba(0,0,0,0.05),0_2px_10px_rgba(0,0,0,0.03)]',
    'hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(0,0,0,0.10),0_1px_4px_rgba(0,0,0,0.06)]',
    selected ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300',
  ].join(' ')
}

type LessonWithGlobalIndex = {
  lesson: CourseLessonRead
  module: CourseModuleRead
  globalIndex: number
}

type ModuleGroup = {
  module: CourseModuleRead
  items: LessonWithGlobalIndex[]
}

function groupByModule(items: LessonWithGlobalIndex[]): ModuleGroup[] {
  const groups: ModuleGroup[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (!last || last.module.id !== item.module.id) {
      groups.push({ module: item.module, items: [item] })
    } else {
      last.items.push(item)
    }
  }
  return groups
}

export function OutlineTab({
  course,
  selectedLessonId,
  onSelectLesson,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onReorderLessons,
  onMoveLesson,
  onEditPaywall,
  onAddModule,
  onRenameModule,
  onDeleteModule,
  canSchedule = true,
  scheduleUpgradeTier,
  onUpdateModuleSchedule,
  onToggleModuleBonus,
  episodic = false,
  onAddEpisode,
}: {
  course: CourseRead
  selectedLessonId: string | null
  onSelectLesson: (lessonId: string) => void
  onAddLesson: (
    module: CourseModuleRead,
    contentType: LessonContentType,
  ) => void
  onUpdateLesson: (lesson: CourseLessonRead, patch: LessonOptionsPatch) => void
  onDeleteLesson: (lesson: CourseLessonRead) => void
  onReorderLessons: (moduleId: string, orderedIds: string[]) => void
  /** Drag a lesson into another season: re-parent + reorder both seasons. */
  onMoveLesson?: (
    lessonId: string,
    fromModule: CourseModuleRead,
    toModule: CourseModuleRead,
    targetOrderedIds: string[],
    sourceOrderedIds: string[],
  ) => void
  onEditPaywall?: () => void
  onAddModule?: () => void
  onRenameModule?: (module: CourseModuleRead, title: string) => void
  onDeleteModule?: (module: CourseModuleRead) => void
  /** Toggle a season into a Bonus section (portal "Bonus Content" rail). */
  onToggleModuleBonus?: (module: CourseModuleRead) => void
  // Drip scheduling entitlement, threaded down to the per-lesson and
  // per-module schedule controls so they can show an upgrade hint instead of
  // silently failing the save.
  canSchedule?: boolean
  scheduleUpgradeTier?: string
  onUpdateModuleSchedule?: (
    module: CourseModuleRead,
    edits: ScheduleEdits,
  ) => void
  // Limited series: the single season container is invisible — no season
  // headers or season actions, episode vocabulary, and no release
  // scheduling (a limited series is complete at launch).
  episodic?: boolean
  onAddEpisode?: () => void
}) {
  const [query, setQuery] = useState('')
  const previewAccess = usePreviewAccess()

  const handlePreview = async () => {
    try {
      const { portal_url } = await previewAccess.mutateAsync(course.id)
      window.open(portal_url, '_blank', 'noopener,noreferrer')
    } catch {
      // Opening the portal without a session token would just land on the
      // sign-in screen — surface the failure instead.
      toast({ title: 'Could not open the preview. Please try again.' })
    }
  }

  const allLessons = useMemo<LessonWithGlobalIndex[]>(() => {
    const out: LessonWithGlobalIndex[] = []
    let i = 1
    for (const m of course.modules) {
      for (const l of m.lessons) {
        out.push({ lesson: l, module: m, globalIndex: i })
        i += 1
      }
    }
    return out
  }, [course.modules])

  const trimmed = query.trim().toLowerCase()
  const filtered = trimmed
    ? allLessons.filter((x) => x.lesson.title.toLowerCase().includes(trimmed))
    : allLessons

  const showPaywall =
    !trimmed &&
    course.paywall_enabled &&
    course.paywall_position !== null &&
    course.paywall_position !== undefined &&
    course.paywall_position >= 0

  // A lesson is in the Free Preview section if it sits before the paywall
  // position OR it's explicitly marked as a free preview (regardless of
  // position). The is_free_preview flag bypasses the paywall on the
  // customer side, so the editor needs to reflect the same grouping.
  const paywallAt = showPaywall
    ? Math.min(course.paywall_position!, filtered.length)
    : 0
  const freeItems = showPaywall
    ? filtered.filter(
        (x, i) => i < paywallAt || x.lesson.is_free_preview === true,
      )
    : filtered
  const paidItems = showPaywall
    ? filtered.filter(
        (x, i) => i >= paywallAt && x.lesson.is_free_preview !== true,
      )
    : []

  const freeGroups = useMemo(() => groupByModule(freeItems), [freeItems])
  const paidGroups = useMemo(() => groupByModule(paidItems), [paidItems])

  // Modules with no lessons still need to appear so instructors can rename
  // or delete them — without this, an empty new module is invisible.
  const emptyModules = useMemo(
    () =>
      course.modules
        .filter((m) => m.lessons.length === 0)
        .map((m): ModuleGroup => ({ module: m, items: [] })),
    [course.modules],
  )

  // With no paywall split (the common case) all seasons — including empty
  // ones — live in ONE drag context, in course order, so lessons can be
  // dragged between any pair of seasons and into an empty one. With the
  // paywall on, the free/paid split keeps its separate blocks.
  const mainGroups = useMemo(() => {
    if (showPaywall || trimmed || episodic) return freeGroups
    const byId = new Map(freeGroups.map((g) => [g.module.id, g]))
    return [...course.modules]
      .sort((a, b) => a.position - b.position)
      .map((m): ModuleGroup => byId.get(m.id) ?? { module: m, items: [] })
  }, [freeGroups, showPaywall, trimmed, episodic, course.modules])

  const showEmptyCourseState =
    !trimmed && allLessons.length === 0 && course.modules.length === 0

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 pt-7 pb-20">
      {/* Search + Preview */}
      <div className="flex items-center gap-3 pb-5">
        <div className="focus-within:border-ce-accent focus-within:ring-ce-accent-ring flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-[9px] shadow-sm transition-colors focus-within:ring-2">
          <SearchOutlined sx={{ fontSize: 14 }} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find lesson…"
            className="flex-1 border border-transparent bg-transparent text-[13px] tracking-tight text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewAccess.isPending}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-[9px] text-[13px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          title="Open the customer portal landing in a new tab"
        >
          <VisibilityOutlined sx={{ fontSize: 14 }} />
          {previewAccess.isPending ? 'Opening…' : 'Preview'}
        </button>
      </div>

      {showEmptyCourseState ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-gray-900">
            {episodic ? 'No episodes yet' : 'No seasons yet'}
          </p>
          <p className="max-w-[360px] text-[13px] text-gray-500">
            {episodic
              ? 'A limited series is complete at launch — every episode ready on day one. Add your first.'
              : 'Seasons group your lessons and set when they release. Create one to start building the outline.'}
          </p>
          {episodic
            ? onAddEpisode && (
                <button
                  type="button"
                  onClick={onAddEpisode}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-gray-800"
                >
                  <AddOutlined sx={{ fontSize: 14 }} />
                  Add first episode
                </button>
              )
            : onAddModule && (
                <button
                  type="button"
                  onClick={onAddModule}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-gray-800"
                >
                  <AddOutlined sx={{ fontSize: 14 }} />
                  Create first season
                </button>
              )}
        </div>
      ) : (
        <>
          {/* Section: Free preview (or All when searching) */}
          <SectionPill
            text={
              showPaywall ? 'Free Preview' : episodic ? 'Episodes' : 'Lessons'
            }
            count={freeItems.length}
          />
          <ModuleGroups
            groups={mainGroups}
            episodic={episodic}
            canSchedule={canSchedule}
            scheduleUpgradeTier={scheduleUpgradeTier}
            onUpdateModuleSchedule={onUpdateModuleSchedule}
            onToggleModuleBonus={onToggleModuleBonus}
            locked={false}
            isReorderable={!trimmed}
            selectedLessonId={selectedLessonId}
            onSelectLesson={onSelectLesson}
            onAddLesson={onAddLesson}
            onUpdateLesson={onUpdateLesson}
            onDeleteLesson={onDeleteLesson}
            onReorderLessons={onReorderLessons}
            onMoveLesson={onMoveLesson}
            onRenameModule={onRenameModule}
            onDeleteModule={onDeleteModule}
          />

          {showPaywall && <PaywallRow onEditSettings={onEditPaywall} />}

          {showPaywall && paidItems.length > 0 && (
            <>
              <SectionPill text="Members Only" count={paidItems.length} />
              <ModuleGroups
                groups={paidGroups}
                episodic={episodic}
                canSchedule={canSchedule}
                scheduleUpgradeTier={scheduleUpgradeTier}
                onUpdateModuleSchedule={onUpdateModuleSchedule}
                onToggleModuleBonus={onToggleModuleBonus}
                locked
                isReorderable={!trimmed}
                selectedLessonId={selectedLessonId}
                onSelectLesson={onSelectLesson}
                onAddLesson={onAddLesson}
                onUpdateLesson={onUpdateLesson}
                onDeleteLesson={onDeleteLesson}
                onReorderLessons={onReorderLessons}
                onMoveLesson={onMoveLesson}
                onRenameModule={onRenameModule}
                onDeleteModule={onDeleteModule}
              />
            </>
          )}

          {/* Seasons with no lessons — with no paywall they're already part
              of the main drag context above; with the paywall split they
              still render here so they stay visible. In a limited series the
              single container is invisible, so an empty one renders nothing. */}
          {!episodic && !trimmed && showPaywall && emptyModules.length > 0 && (
            <ModuleGroups
              groups={emptyModules}
              canSchedule={canSchedule}
              scheduleUpgradeTier={scheduleUpgradeTier}
              onUpdateModuleSchedule={onUpdateModuleSchedule}
              onToggleModuleBonus={onToggleModuleBonus}
              locked={false}
              isReorderable={false}
              selectedLessonId={selectedLessonId}
              onSelectLesson={onSelectLesson}
              onAddLesson={onAddLesson}
              onUpdateLesson={onUpdateLesson}
              onDeleteLesson={onDeleteLesson}
              onRenameModule={onRenameModule}
              onDeleteModule={onDeleteModule}
            />
          )}

          {!trimmed && (episodic ? onAddEpisode : onAddModule) && (
            <button
              type="button"
              onClick={episodic ? onAddEpisode : onAddModule}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-4 text-[13px] font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
            >
              <AddOutlined sx={{ fontSize: 16 }} />
              {episodic ? 'Add episode' : 'Add season'}
            </button>
          )}

          {trimmed && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-[13px] text-gray-500">
              No lessons match "{query}"
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Merge a reordered visible subset back into a module's full lesson order.
// Visible slots take the new order; lessons outside the visible range keep
// their positions.
function mergeVisibleOrder(
  fullIds: string[],
  visibleIds: string[],
  newVisible: string[],
): string[] {
  const visibleSet = new Set(visibleIds)
  let i = 0
  return fullIds.map((id) => (visibleSet.has(id) ? newVisible[i++] : id))
}

// Merge a target module's visible order — which now INCLUDES ids dragged in
// from another module — into its full lesson order. Existing lessons keep
// their relative slots; foreign ids are inserted where they sit among the
// visible ones.
function mergeVisibleWithInsert(
  fullIds: string[],
  newVisible: string[],
): string[] {
  const fullSet = new Set(fullIds)
  const slotSet = new Set(newVisible.filter((id) => fullSet.has(id)))
  const merged: string[] = []
  let vi = 0
  const flushForeign = () => {
    while (vi < newVisible.length && !slotSet.has(newVisible[vi])) {
      merged.push(newVisible[vi++])
    }
  }
  for (const id of fullIds) {
    if (slotSet.has(id)) {
      flushForeign()
      merged.push(newVisible[vi++])
    } else {
      merged.push(id)
    }
  }
  flushForeign()
  return merged
}

// Droppable target for a season with no (visible) lessons, so a card can be
// dragged INTO it. Outside a drag it's the empty-season hint.
function EmptySeasonDropZone({ moduleId }: { moduleId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `module:${moduleId}` })
  return (
    <div
      ref={setNodeRef}
      className={`mb-1 flex items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-[12.5px] transition-colors ${
        isOver
          ? 'border-ce-accent bg-ce-accent-tint text-ce-accent'
          : 'border-gray-200 bg-white text-gray-400'
      }`}
    >
      Drag a lesson here, or add one from the season menu
    </div>
  )
}

function ModuleGroups({
  groups,
  locked,
  isReorderable,
  selectedLessonId,
  onSelectLesson,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onReorderLessons,
  onMoveLesson,
  onRenameModule,
  onDeleteModule,
  canSchedule = true,
  scheduleUpgradeTier,
  onUpdateModuleSchedule,
  onToggleModuleBonus,
  episodic = false,
}: {
  groups: ModuleGroup[]
  locked: boolean
  isReorderable: boolean
  episodic?: boolean
  selectedLessonId: string | null
  onSelectLesson: (lessonId: string) => void
  onAddLesson?: (
    module: CourseModuleRead,
    contentType: LessonContentType,
  ) => void
  onUpdateLesson: (lesson: CourseLessonRead, patch: LessonOptionsPatch) => void
  onDeleteLesson: (lesson: CourseLessonRead) => void
  onReorderLessons?: (moduleId: string, orderedIds: string[]) => void
  /** Cross-season move (drag a lesson into another season). */
  onMoveLesson?: (
    lessonId: string,
    fromModule: CourseModuleRead,
    toModule: CourseModuleRead,
    targetOrderedIds: string[],
    sourceOrderedIds: string[],
  ) => void
  onRenameModule?: (module: CourseModuleRead, title: string) => void
  onDeleteModule?: (module: CourseModuleRead) => void
  onToggleModuleBonus?: (module: CourseModuleRead) => void
  canSchedule?: boolean
  scheduleUpgradeTier?: string
  onUpdateModuleSchedule?: (
    module: CourseModuleRead,
    edits: ScheduleEdits,
  ) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // One DndContext across ALL seasons in this block, so a lesson can be
  // dragged between them. Per-module id lists drive the render; during (and
  // just after) a drag an optimistic copy holds the live arrangement — it
  // stays applied until fresh server data arrives, so cards don't snap back
  // while a reorder round-trips.
  const visibleOrders = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const g of groups) m[g.module.id] = g.items.map((x) => x.lesson.id)
    return m
  }, [groups])
  const itemById = useMemo(() => {
    const m = new Map<string, LessonWithGlobalIndex>()
    for (const g of groups) for (const it of g.items) m.set(it.lesson.id, it)
    return m
  }, [groups])
  const moduleById = useMemo(() => {
    const m = new Map<string, CourseModuleRead>()
    for (const g of groups) m.set(g.module.id, g.module)
    return m
  }, [groups])

  const [orders, setOrders] = useState<Record<string, string[]> | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    // Fresh server data — drop the optimistic arrangement.
    setOrders(null)
  }, [visibleOrders])
  const liveOrders = orders ?? visibleOrders
  const containerOf = (id: string): string | undefined => {
    if (id.startsWith('module:')) return id.slice('module:'.length)
    return Object.keys(liveOrders).find((k) => liveOrders[k].includes(id))
  }

  const canReorder = isReorderable && !!onReorderLessons
  const crossSeason = canReorder && !!onMoveLesson && groups.length > 1

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setOrders(visibleOrders)
  }

  // Live cross-container move — this is what makes dragging between seasons
  // feel smooth: the card leaves one grid and joins the other while you drag.
  const handleDragOver = (e: DragOverEvent) => {
    if (!crossSeason) return
    const { active, over } = e
    if (!over) return
    const aid = String(active.id)
    const from = containerOf(aid)
    const to = containerOf(String(over.id))
    if (!from || !to || from === to) return
    setOrders((prev) => {
      const cur = prev ?? visibleOrders
      const next: Record<string, string[]> = { ...cur }
      next[from] = cur[from].filter((x) => x !== aid)
      const toArr = cur[to].filter((x) => x !== aid)
      const overIdx = toArr.indexOf(String(over.id))
      toArr.splice(overIdx >= 0 ? overIdx : toArr.length, 0, aid)
      next[to] = toArr
      return next
    })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    const aid = String(active.id)
    setActiveId(null)
    const cur = orders ?? visibleOrders
    const cont = Object.keys(cur).find((k) => cur[k].includes(aid))
    const originModuleId = itemById.get(aid)?.module.id
    if (!cont || !originModuleId) {
      setOrders(null)
      return
    }
    // Settle the within-container position from the drop target.
    let finalArr = cur[cont]
    if (over) {
      const oid = String(over.id)
      if (
        !oid.startsWith('module:') &&
        oid !== aid &&
        containerOf(oid) === cont
      ) {
        const from = finalArr.indexOf(aid)
        const to = finalArr.indexOf(oid)
        if (from >= 0 && to >= 0 && from !== to) {
          finalArr = arrayMove(finalArr, from, to)
        }
      }
    }
    setOrders({ ...cur, [cont]: finalArr })

    if (cont === originModuleId) {
      // Plain reorder within the season. The visible items may be a
      // paywall-split subset of the module's full lesson list — merge back
      // so out-of-range lessons keep their positions.
      const mod = moduleById.get(cont)
      if (!mod || !onReorderLessons) return
      const fullIds = mod.lessons.map((l) => l.id)
      const merged = mergeVisibleOrder(
        fullIds,
        visibleOrders[cont] ?? [],
        finalArr,
      )
      if (merged.some((id, i) => id !== fullIds[i])) {
        onReorderLessons(cont, merged)
      }
    } else {
      // Moved to another season.
      const fromMod = moduleById.get(originModuleId)
      const toMod = moduleById.get(cont)
      if (!fromMod || !toMod || !onMoveLesson) {
        setOrders(null)
        return
      }
      const sourceOrderedIds = fromMod.lessons
        .map((l) => l.id)
        .filter((id) => id !== aid)
      const targetOrderedIds = mergeVisibleWithInsert(
        toMod.lessons.map((l) => l.id),
        finalArr,
      )
      onMoveLesson(aid, fromMod, toMod, targetOrderedIds, sourceOrderedIds)
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setOrders(null)
  }

  if (groups.length === 0) return null

  const activeItem = activeId ? itemById.get(activeId) : null

  const groupsContent = (
    <div className="mb-6 flex flex-col gap-5">
      {groups.map((group) => {
        const ids = liveOrders[group.module.id] ?? []
        const items = ids
          .map((id) => itemById.get(id))
          .filter((x): x is LessonWithGlobalIndex => Boolean(x))
        const draggable = canReorder && (crossSeason || group.items.length > 1)
        const lessonGrid = (
          <LessonGrid>
            {items.map(({ lesson, globalIndex }) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                position={globalIndex}
                locked={locked}
                isReorderable={draggable}
                isSelected={selectedLessonId === lesson.id}
                canSchedule={canSchedule}
                allowSchedule={!episodic}
                scheduleUpgradeTier={scheduleUpgradeTier}
                onSelect={() => onSelectLesson(lesson.id)}
                onUpdate={(patch) => onUpdateLesson(lesson, patch)}
                onDelete={() => onDeleteLesson(lesson)}
              />
            ))}
          </LessonGrid>
        )

        return (
          <div key={group.module.id}>
            {/* Limited series: the single season container is invisible —
                episodes render as one flat grid with no header. */}
            {!episodic && (
              <ModuleHeader
                module={group.module}
                count={items.length}
                onAddLesson={
                  onAddLesson
                    ? () => onAddLesson(group.module, 'video')
                    : undefined
                }
                onRename={
                  onRenameModule
                    ? (title) => onRenameModule(group.module, title)
                    : undefined
                }
                onDelete={
                  onDeleteModule
                    ? () => onDeleteModule(group.module)
                    : undefined
                }
                canSchedule={canSchedule}
                scheduleUpgradeTier={scheduleUpgradeTier}
                onUpdateSchedule={
                  onUpdateModuleSchedule
                    ? (edits) => onUpdateModuleSchedule(group.module, edits)
                    : undefined
                }
                onToggleBonus={
                  onToggleModuleBonus
                    ? () => onToggleModuleBonus(group.module)
                    : undefined
                }
              />
            )}
            {items.length === 0 && crossSeason ? (
              <EmptySeasonDropZone moduleId={group.module.id} />
            ) : items.length === 0 ? (
              <div className="mb-1 flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-[12.5px] text-gray-400">
                No lessons yet — add one from the season menu
              </div>
            ) : draggable ? (
              <SortableContext items={ids} strategy={rectSortingStrategy}>
                {lessonGrid}
              </SortableContext>
            ) : (
              lessonGrid
            )}
          </div>
        )
      })}
    </div>
  )

  if (!canReorder) return groupsContent

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {groupsContent}
      {/* Floating copy of the dragged card — the in-grid original dims, the
          overlay follows the pointer, which is what keeps the drag smooth. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {activeItem ? (
          <div className="w-[272px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="relative aspect-video w-full overflow-hidden">
              <ThumbArt
                thumbnailUrl={activeItem.lesson.thumbnail_url ?? null}
                objectPosition={
                  activeItem.lesson.thumbnail_object_position ?? null
                }
              />
            </div>
            <div className="px-3 py-2.5 text-[13px] font-medium tracking-tight text-gray-900">
              {activeItem.lesson.title}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// "FEATURED"-style pill — borrowed from the Spaire space categories chips.
// White rounded chip with subtle border + shadow and dark uppercase text.
function SectionPill({ text, count }: { text: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 px-0.5">
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[11px] font-bold tracking-[0.18em] text-gray-700 uppercase shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.04)]">
        {text}
      </span>
      <span className="text-[11px] text-gray-400 tabular-nums">{count}</span>
    </div>
  )
}

// Module sub-header — small uppercase label, with inline rename + an
// action menu (add lesson, delete module) on the right. Keeps the
// modules visually subordinate to the Free Preview / Members Only chips
// above them.
function ModuleHeader({
  module: mod,
  count,
  onAddLesson,
  onRename,
  onDelete,
  onUpdateSchedule,
  onToggleBonus,
  canSchedule = true,
  scheduleUpgradeTier,
}: {
  module: CourseModuleRead
  count: number
  onAddLesson?: () => void
  onRename?: (title: string) => void
  onDelete?: () => void
  onUpdateSchedule?: (edits: ScheduleEdits) => void
  /** Toggle Bonus section (portal "Bonus Content" rail). */
  onToggleBonus?: () => void
  canSchedule?: boolean
  scheduleUpgradeTier?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(mod.title)

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === mod.title) {
      setDraft(mod.title)
      return
    }
    onRename?.(next)
  }

  return (
    <div className="mb-2.5 flex items-center gap-2 px-0.5">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onFocus={(e) => {
            // Place caret at the end so the user can keep typing.
            const v = e.currentTarget.value
            e.currentTarget.setSelectionRange(v.length, v.length)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') {
              setEditing(false)
              setDraft(mod.title)
            }
          }}
          // Grow with the title so the user can read the whole name. `ch` is
          // roughly the width of a character at the current font; we add a
          // small buffer plus the input's horizontal padding.
          style={{
            width: `calc(${
              Math.max(draft.length, mod.title.length, 8) + 2
            }ch + 1.25rem)`,
          }}
          className="focus:border-ce-accent focus:ring-ce-accent-ring rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-gray-700 uppercase focus:ring-2 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => onRename && setEditing(true)}
          disabled={!onRename}
          title={onRename ? 'Rename season' : undefined}
          className="group flex items-baseline gap-1.5 text-left disabled:cursor-default"
        >
          <span className="text-[11px] font-semibold tracking-[0.06em] text-gray-500 uppercase group-hover:text-gray-900">
            {mod.title}
          </span>
          {onRename && (
            <EditOutlined
              sx={{ fontSize: 11 }}
              className="text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
        </button>
      )}
      <span className="text-[11px] text-gray-400">{count}</span>
      {mod.is_bonus && (
        <span className="bg-ce-accent-tint text-ce-accent rounded-full px-1.5 py-[1px] text-[9.5px] font-bold tracking-[0.08em]">
          BONUS
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {onAddLesson && (
          <button
            type="button"
            onClick={onAddLesson}
            title="Add lesson to this season"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tracking-tight text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <AddOutlined sx={{ fontSize: 12 }} />
            Lesson
          </button>
        )}
        {onToggleBonus && (
          <button
            type="button"
            onClick={onToggleBonus}
            title={
              mod.is_bonus
                ? 'Turn back into a regular season'
                : 'Make this a Bonus section — shows in the portal\u2019s "Bonus Content" rail, unnumbered, doesn\u2019t count toward completion'
            }
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tracking-tight transition-colors ${
              mod.is_bonus
                ? 'text-ce-accent bg-ce-accent-tint'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <CardGiftcardOutlined sx={{ fontSize: 12 }} />
            Bonus
          </button>
        )}
        {onUpdateSchedule && (
          <ScheduleMenu
            module={mod}
            onSave={onUpdateSchedule}
            canSchedule={canSchedule}
            upgradeTier={scheduleUpgradeTier}
          />
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Delete "${mod.title}" and all of its lessons? This can't be undone.`,
                )
              )
                onDelete()
            }}
            title="Delete season"
            className="flex items-center rounded-md px-1.5 py-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <DeleteOutlineOutlined sx={{ fontSize: 13 }} />
          </button>
        )}
      </div>
    </div>
  )
}

function LessonGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {children}
    </div>
  )
}
