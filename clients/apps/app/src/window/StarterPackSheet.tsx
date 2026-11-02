// A starter pack the website's Add to Simeon opened
// (mac/Simeon/StarterPackSheet.swift, 22 October 2026): read from Simeon
// Labs' server, shown, and added on Add (the store's `addAskedPack`). The Mac
// is opened on `simeon://app/v1/pack/add?id=<id>`; the web app on its own
// address with the pack's id (`?pack=<id>`), read once the window is up
// (signed in, past the first run, as the Mac keeps a link that came before
// then: `pendingPack`) and taken out of the address. Drawn by App.tsx.

import { type ReactNode, useEffect } from 'react'
import { faceById, faceURL } from '../core/faces'
import { displayLocale } from '../core/listTime'
import {
  type PackAsk,
  type PackMember,
  type StarterPack,
  addressWithoutPack,
  packInAddress,
} from '../core/starterPacks'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AppLogoTile } from './ConnectCards'
import { Sheet } from './Dialogs'
import './StarterPackSheet.css'
import { useWindowModel } from './windowModel'

/** The starter pack's sheet over the window, signed in (`StarterPackLayer`). */
export function StarterPackLayer({ store }: { store: AppStore }) {
  const model = useWindowModel()
  // The pack the address names, asked once; the address forgets it, so a reload doesn't ask again.
  useEffect(() => {
    const id = packInAddress(window.location.search)
    const without = addressWithoutPack(window.location.href)
    if (without) window.history.replaceState(window.history.state, '', without)
    if (id) store.askPack(id)
  }, [store])
  const ask = store.packAsk
  if (!ask) return null
  const added = ask.pack != null && store.packAgents(ask.pack).length > 0
  return (
    <StarterPackDialog
      key={ask.id}
      ask={ask}
      added={added}
      add={() => {
        // Add: the five in their folder and the first one's chat; a team already added only opens.
        void store.addAskedPack().then((agentId) => {
          if (agentId) model.choose(agentId)
        })
      }}
      close={() => store.closePack()}
    />
  )
}

/**
 * Return adds (keypad Enter too), from the sheet itself: a button or a link
 * in it that has the keys does its own (the products' sheet's way, 3d).
 */
function useReturnAdds(ready: boolean, add: () => void) {
  useEffect(() => {
    if (!ready) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
        return
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('.pack-sheet')) return
      if (target.closest('button, a[href], input, textarea, select')) return
      event.preventDefault()
      add()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [ready, add])
}

/**
 * The pack, in the connect consent's look (720 wide, the founder's "wider",
 * 23 October 2026; × at the top left): the five faces side by side, the
 * pack's name and what it is for; each agent with its face, name and job,
 * what it does and the apps it asks for; Add to Simeon across the foot in
 * the blue (Open "Coffee Shop Team" once added). Return adds; Escape, × or
 * a click beside it closes, unless it is adding.
 */
function StarterPackDialog({
  ask,
  added,
  add,
  close,
}: {
  ask: PackAsk
  added: boolean
  add: () => void
  close: () => void
}) {
  useReturnAdds(ask.pack != null, add)
  const pack = ask.pack
  let body: ReactNode
  if (pack) {
    body = (
      <>
        <div className="pack-content">
          <Content pack={pack} />
        </div>
        <div className="pack-foot">
          <button
            type="button"
            className="pack-add"
            disabled={ask.adding}
            aria-busy={ask.adding}
            onClick={add}
          >
            {ask.adding ? (
              <>
                <span className="pack-add-wheel" aria-hidden="true" />
                <span>{t('Adding…')}</span>
              </>
            ) : added ? (
              t`Open “${pack.folder}”`
            ) : (
              t('Add to Simeon')
            )}
          </button>
        </div>
      </>
    )
  } else if (ask.failure) {
    const words =
      'read' in ask.failure
        ? ask.failure.read
        : (ask.failure.added ?? t("Couldn't add the team. Try again."))
    body = (
      <div className="pack-state" role="alert">
        <div className="pack-failure-title">{t("Couldn't open this team")}</div>
        <div className="pack-failure-words">{words}</div>
      </div>
    )
  } else {
    body = (
      <div className="pack-state" aria-busy="true">
        <span className="pack-wheel" aria-hidden="true" />
      </div>
    )
  }
  return (
    <Sheet
      label={pack?.title ?? t('Starter team')}
      close={close}
      className="pack-sheet"
    >
      {body}
      <button
        type="button"
        className="pack-close glass-disc"
        title={t('Close')}
        aria-label={t('Close')}
        disabled={ask.adding}
        onClick={close}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.5 3.5l9 9M12.5 3.5l-9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Sheet>
  )
}

/** The faces, the pack's name and what it is for, then its agents. */
function Content({ pack }: { pack: StarterPack }) {
  const list = new Intl.ListFormat(displayLocale(), {
    style: 'long',
    type: 'conjunction',
  })
  return (
    <>
      <div className="pack-faces" aria-hidden="true">
        {pack.members.map((member) => (
          <Face key={member.name} member={member} side={56} />
        ))}
      </div>
      <div className="pack-title" role="heading" aria-level={2}>
        {pack.title}
      </div>
      {pack.summary !== '' && (
        <div className="pack-summary">{pack.summary}</div>
      )}
      <div className="pack-members">
        {pack.members.map((member) => (
          <div key={member.name} className="pack-member">
            <Face member={member} side={40} />
            <div className="pack-member-words">
              <div className="pack-member-head">
                <span className="pack-member-name">{member.name}</span>
                {member.title !== '' && (
                  <span className="pack-member-title">{member.title}</span>
                )}
              </div>
              <div className="pack-member-summary">{member.summary}</div>
              <div
                className="pack-apps"
                role="img"
                aria-label={list.format(member.apps.map((app) => app.name))}
              >
                {member.apps.map((app) => (
                  <span key={app.id} className="pack-app" title={app.name}>
                    <AppLogoTile name={app.name} side={20} id={app.id} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** A member's face (`AgentFaces`), or the first letter of its name on the wash. */
function Face({ member, side }: { member: PackMember; side: number }) {
  const face = faceById(member.face)
  const url = face ? faceURL(face) : undefined
  return (
    <span
      className="pack-face"
      style={{ width: side, height: side, fontSize: side * 0.42 }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" /> : (Array.from(member.name)[0] ?? '')}
    </span>
  )
}
