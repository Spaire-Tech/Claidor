// The model the agents use, on the composer (`ComposerModelMenu` in
// mac/Simeon/SettingsModels.swift; 9 November 2026, the founder: "the model
// chosen is on the composer. not on the setting app. ours will have the
// logo though", from Reason's): at the field's right before the microphone,
// the chosen model's mark, its name and a chevron; Simeon's mark and
// "Simeon" while the agents use Simeon's models. Its menu, as the window's
// menus look (`ContextMenu`), as Reason's: Simeon, then each connected
// provider with its models in a submenu, a tick at the end of the one in
// use and before the chosen model, then Add More…, which opens Settings ›
// AI Models. The choice is the account's (`models/own`), for every agent.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { providerName, simeon } from '../core/aiModels'
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
  simeon: new URL('../assets/providers/simeon-mark.svg', import.meta.url).href,
}

/**
 * A provider's mark, bare, as the composer shows it (`ProviderMark`; the
 * founder's "✳ Claude Opus 5.5", "⌘ Simeon"): ChatGPT's and Simeon's in the
 * ink, Claude's in its orange; no provider is Simeon's.
 */
export function ProviderMark({
  provider,
  side = 14,
}: {
  provider?: string
  side?: number
}) {
  const url = marks[provider ?? 'simeon']
  if (url === undefined) return null
  const style = { width: side, height: side }
  if (provider === 'claude')
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
  const button = useRef<HTMLButtonElement>(null)
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
          const box = button.current?.getBoundingClientRect()
          // Over the button, its foot 4 above it: the composer is at the window's foot.
          if (box) setMenu({ x: box.left, y: box.top - 4 })
        }}
      >
        <ProviderMark provider={inUse} />
        <span className="model-name">{model.composerName}</span>
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
      </button>
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
    </>
  )
}
