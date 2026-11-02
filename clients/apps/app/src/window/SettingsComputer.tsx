// Settings' Computer (mac/Simeon/SettingsPages.swift's
// `SettingsComputerPage`; the founder, 21 October 2026: "a computer tab, your
// computer - agent's computer"; 22 October: "bloated. filled with words", so
// each row is its name and its control, the dialogs saying the rest).
//
// The agents' computer (`AgentsComputerGroup`): how it is now (connected,
// being updated or recovered, out of reach), Update Simeon's Computer when
// one is offered (or queued, with Cancel), else its version; and Recover
// Simeon's Computer. Each asks first with the computer's own dialog, over
// Settings (step 5c's `askComputer`).
//
// The Mac's second group, "Your Computer" (how the agents may use this Mac,
// with the team's ceiling; hardware security keys; the commands allowed
// once), is about the Mac's own hands on the person's computer, which a
// browser doesn't have: it is left out, and comes back in the Windows app
// with the agent's hands on the PC.

import { RebuildWords } from '../core/computerRebuild'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { Glyph } from './ContextMenu'
import './SettingsComputer.css'
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsLine,
  SettingsPill,
} from './SettingsParts'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

export function SettingsComputerPage({ store }: { store: AppStore }) {
  useWatched(store)
  const model = useWindowModel()
  const rebuild = store.rebuild
  const busy = rebuild.lock.isLocked || rebuild.pendingKind !== undefined
  return (
    <div className="settings-page">
      <SettingsGroup
        title={t("Agents' Computer")}
        footer={rebuild.error}
        footerTint="var(--danger)"
      >
        <SettingsLine label={t("Simeon's Computer")}>
          <ComputerStatus store={store} />
        </SettingsLine>
        {rebuild.isUpdateQueued ? (
          <SettingsLine label={t('Update queued')} divided>
            <SettingsPill
              title={t('Cancel')}
              onClick={() => rebuild.cancelQueuedUpdate()}
            />
          </SettingsLine>
        ) : store.computerUpdateOffer !== undefined ? (
          <SettingsLine
            label={
              store.computerUpdateAvailable
                ? t('A new version is available')
                : t("Update Simeon's Computer")
            }
            divided
          >
            <SettingsPill
              title={t('Update')}
              disabled={busy}
              onClick={() => model.askComputer({ kind: 'update' })}
            />
          </SettingsLine>
        ) : (
          <SettingsLine label={t('Version')} divided>
            {store.computerUpdateAvailable ? (
              <span className="computer-version-new">
                {t('A new version is available')}
              </span>
            ) : (
              <span className="computer-up-to-date">
                <Glyph name="check" size={11} />
                {t('Up to date')}
              </span>
            )}
          </SettingsLine>
        )}
        <SettingsActionRow
          title={RebuildWords.recoverButton()}
          divided
          disabled={busy || !rebuild.canRecover}
          onClick={() =>
            model.askComputer({ kind: 'recover', fromSidebar: false })
          }
        />
      </SettingsGroup>
    </div>
  )
}

/**
 * How the computer is now (`status`): what is being done to it with a
 * spinner; "Can't reach it" in red when the agents' list couldn't be read
 * or two minutes went by without the connection (`escalation`); Connected
 * by the working green dot; else Connecting….
 */
function ComputerStatus({ store }: { store: AppStore }) {
  const rebuild = store.rebuild
  const kind = rebuild.lock.kind ?? rebuild.pendingKind
  if (kind !== undefined)
    return (
      <span className="computer-status">
        <span className="settings-spinner" aria-hidden="true" />
        <span className="computer-status-words">
          {RebuildWords.title(kind)}
        </span>
      </span>
    )
  if (store.rosterFailed || rebuild.escalation === 'unreachable')
    return (
      <span className="computer-status unreachable">{t("Can't reach it")}</span>
    )
  if (store.isLive)
    return (
      <span className="computer-status">
        <span className="computer-status-dot" aria-hidden="true" />
        {t('Connected')}
      </span>
    )
  return (
    <span className="computer-status">
      <span className="settings-spinner" aria-hidden="true" />
      {t('Connecting…')}
    </span>
  )
}
