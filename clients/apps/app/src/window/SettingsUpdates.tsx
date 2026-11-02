// Settings › Updates in the Windows app (mac/Simeon/SettingsPages.swift,
// `SettingsUpdatesPage`; the founder, 21 October 2026: "an update tab for
// when updates are available"): this PC's Simeon, its version and whether a
// newer one is out (the updater looks quietly as the page opens; a dot
// beside Updates in Settings' list while one waits), Update Now, which
// installs it and opens Simeon again, and the two switches; then the agents'
// computer, with its own update, on Computer. Listed only in the Windows app
// (SettingsWindow.tsx): a web page is always the latest.
//
// The Mac names its group "Simeon for Mac"; neither catalogue has "Simeon
// for Windows", so the group is the app's own name, "Simeon" (the Mac
// catalogue's). Every other sentence is the Mac page's, none naming the Mac.

import { useEffect } from 'react'
import { displayLocale } from '../core/listTime'
import type { AppStore } from '../core/store'
import { versionLine } from '../core/usage'
import { desktop } from '../desktop/desktop'
import { checkedLine, desktopUpdates } from '../desktop/updates'
import { t } from '../l10n'
import {
  SettingsGroup,
  SettingsLine,
  SettingsLinkRow,
  SettingsPill,
  SettingsSwitch,
} from './SettingsParts'
import './SettingsUpdates.css'
import { useWatched } from './useStore'
import { type WindowModel, useWindowModel } from './windowModel'

/** Nothing to watch on the web (the page isn't listed there). */
const nothing = {
  subscribe: () => () => {},
  getVersion: () => 0,
}

export function SettingsUpdatesPage({ store }: { store: AppStore }) {
  useWatched(store)
  const updates = desktopUpdates()
  useWatched(updates ?? nothing)
  const model = useWindowModel()
  // The feed asked quietly as the page opens (`.task { updates.lookQuietly() }`).
  useEffect(() => {
    desktopUpdates()?.look()
  }, [])
  const host = desktop()
  if (!updates || !host) return null
  const state = updates.state
  const available = state?.available ?? false
  const found = state?.found ?? null
  const installing = state?.installing ?? false
  const checksAutomatically = state?.checksAutomatically ?? false
  return (
    <div className="settings-page">
      <SettingsGroup
        title={t('Simeon')}
        footer={
          state && !available
            ? t(
                "This build doesn't update itself. Released builds of Simeon check for updates on their own.",
              )
            : undefined
        }
      >
        <SettingsLine
          label={versionLine(host.facts.version)}
          detail={checkedLine(state, Date.now(), displayLocale())}
        >
          {state?.checking ? (
            <span className="updates-checking">
              <span className="settings-spinner" aria-hidden="true" />
              {t('Checking…')}
            </span>
          ) : found == null ? (
            <SettingsPill
              title={t('Check Now')}
              disabled={!available}
              onClick={() => updates.look()}
            />
          ) : null}
        </SettingsLine>
        {found != null && (
          <SettingsLine
            label={t`Simeon ${found} is available`}
            detail={t('Simeon relaunches to finish installing it.')}
            divided
          >
            <span className="updates-install">
              {installing && (
                <span className="settings-spinner" aria-hidden="true" />
              )}
              <SettingsPill
                title={t('Update Now')}
                disabled={installing}
                onClick={() => updates.install()}
              />
            </span>
          </SettingsLine>
        )}
        {available && (
          <>
            <SettingsSwitch
              label={t('Check for Updates Automatically')}
              divided
              on={checksAutomatically}
              onChange={(on) => updates.setChecksAutomatically(on)}
            />
            <SettingsSwitch
              label={t('Download Updates Automatically')}
              divided
              on={state?.downloadsAutomatically ?? false}
              onChange={(on) => updates.setDownloadsAutomatically(on)}
              disabled={!checksAutomatically}
            />
          </>
        )}
      </SettingsGroup>
      <SettingsGroup title={t("Agents' Computer")}>
        <SettingsLinkRow
          label={t("Simeon's Computer")}
          value={
            store.computerUpdateAvailable
              ? t('A new version is available')
              : undefined
          }
          onClick={() => model.showSettingsPage('computer')}
        />
      </SettingsGroup>
    </div>
  )
}

/**
 * Check for Updates… (the Mac's Simeon menu; in the Windows app the tray's,
 * 7c's, which sends `checkForUpdates`): Sparkle's own window on the Mac;
 * here Settings comes up on Updates (already so when 7c's page code opened
 * it: asked again, nothing changes) and the updater looks, again if the
 * page was already open, the page saying what it finds. Heard while the
 * window is signed in (Settings is there).
 */
export function useCheckForUpdates(model: WindowModel): void {
  useEffect(() => {
    const host = desktop()
    if (!host) return
    return host.on('checkForUpdates', () => {
      model.openSettings('updates')
      desktopUpdates()?.look()
    })
  }, [model])
}
