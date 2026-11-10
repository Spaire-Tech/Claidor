// The model the agents use, on the composer (`ComposerModelMenu` in
// mac/Simeon/SettingsModels.swift; 9 November 2026, the founder: "the model
// chosen is on the composer. not on the setting app. ours will have the
// logo though", from Reason's): at the field's right before the microphone,
// the chosen model's mark and its name in the field's grey, at the field's
// size (the founder: "look at how unpropotionate it is"); then, on the
// person's own plan, how hard it thinks ("High ⌄", Reason's), its menu
// Light, Medium, High, Extra High, Max. Simeon's mark and "Simeon" while the
// agents use Simeon's models. The model's menu, as the window's menus look
// (`ContextMenu`), as Reason's: Simeon, then each connected provider with
// its models in a submenu, a tick at the end of the one in use and before
// the chosen model, then Add More…, which opens Settings › AI Models. The
// choice is the account's (`models/own`), for every agent.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { effortName, providerName, simeon } from '../core/aiModels'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import './ComposerModelMenu.css'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The providers' marks, bare (the Mac's `Providers/<provider>-mark`), and Simeon's (the menu bar's). */
const marks: Record<string, string> = {
  chatgpt: new URL('../assets/providers/chatgpt-mark.png', import.meta.url)
    .href,
  claude: new URL('../assets/providers/claude-mark.png', import.meta.url).href,
  grok: new URL('../assets/providers/grok-mark.png', import.meta.url).href,
  simeon: new URL('../assets/providers/simeon-mark.svg', import.meta.url).href,
}
/** The API key providers' marks (10 November 2026; NOTICE), bare, in the ink: `Providers/<provider>-mark`. */
const keyMarks = import.meta.glob<string>('../assets/providers/*-mark.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The marks drawn in their own colours, not the ink. */
const colouredMarks = new Set(['claude', 'bedrock', 'copilot'])

function markURL(provider: string): string | undefined {
  return marks[provider] ?? keyMarks[`../assets/providers/${provider}-mark.png`]
}

/**
 * A provider's mark, bare, as the composer shows it (`ProviderMark`; the
 * founder's "✳ Claude Opus 5.5", "⌘ Simeon"): ChatGPT's, Grok's and Simeon's
 * in the ink; Claude's, Amazon Bedrock's and GitHub Copilot's in their own
 * colours (10 November 2026, the founder's logos); no provider is Simeon's.
 */
export function ProviderMark({
  provider,
  side = 14,
}: {
  provider?: string
  side?: number
}) {
  const url = markURL(provider ?? 'simeon')
  if (url === undefined) return null
  const style = { width: side, height: side }
  if (provider !== undefined && colouredMarks.has(provider))
    return <img className="model-mark" src={url} alt="" style={style} />
  return (
    <span
      className="model-mark model-mark-ink"
      aria-hidden="true"
      style={{
        ...style,
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
      }}
    />
  )
}

export function ComposerModelMenu({ store }: { store: AppStore }) {
  const model = store.aiModels
  useWatched(model)
  const window = useWindowModel()
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const [effortMenu, setEffortMenu] = useState<{ x: number; y: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const effortButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!model.loaded) void model.load()
  }, [model])
  const inUse = model.chosenChoice?.provider
  const items: MenuLine[] = [
    {
      label: simeon,
      icon: <ProviderMark />,
      endCheck: inUse === undefined,
      action: () => void model.choose(undefined),
    },
    ...model.choices.map(
      (choice): MenuLine => ({
        label: providerName(choice.provider),
        icon: <ProviderMark provider={choice.provider} />,
        endCheck: inUse === choice.provider,
        submenu: choice.models.map((option) => ({
          label: option.name,
          checked: model.chosen === option.id,
          action: () => void model.choose(option.id),
        })),
      }),
    ),
    'separator',
    {
      label: t('Add More…'),
      bare: true,
      action: () => window.openSettings('models'),
    },
  ]
  const efforts: MenuLine[] = model.efforts.map((level) => ({
    label: effortName(level),
    checked: model.effort === level,
    action: () => void model.chooseEffort(level),
  }))
  const effort = model.effortName
  // Over the button, its foot 4 above it: the composer is at the window's foot.
  const over = (target: HTMLButtonElement | null) => {
    const box = target?.getBoundingClientRect()
    return box ? { x: box.left, y: box.top - 4 } : undefined
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="model-button"
        disabled={model.choosing}
        aria-label={t('Model')}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          setMenu(over(button.current))
        }}
      >
        <ProviderMark provider={inUse} side={13} />
        <span className="model-name">{model.composerName}</span>
        {effort === undefined && <Chevron />}
      </button>
      {effort !== undefined && (
        <button
          ref={effortButton}
          type="button"
          className="effort-button"
          disabled={model.choosing}
          aria-label={t('Thinking effort')}
          aria-haspopup="menu"
          aria-expanded={effortMenu !== undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            setEffortMenu(over(effortButton.current))
          }}
        >
          {effort}
          <Chevron />
        </button>
      )}
      {/* On the page's body: the field's glass (backdrop-filter) would be the menu's frame, and place it wrong. */}
      {menu &&
        createPortal(
          <ContextMenu
            items={items}
            at={menu}
            close={() => setMenu(undefined)}
            label={t('Model')}
            foot
          />,
          document.body,
        )}
      {effortMenu &&
        createPortal(
          <ContextMenu
            items={efforts}
            at={effortMenu}
            close={() => setEffortMenu(undefined)}
            label={t('Thinking effort')}
            foot
          />,
          document.body,
        )}
    </>
  )
}

/** The menus' chevron, 9 square, in the grey. */
function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2 3.5 5 6.5 8 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
