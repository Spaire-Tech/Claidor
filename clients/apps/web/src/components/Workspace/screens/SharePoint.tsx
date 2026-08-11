'use client'

/**
 * SharePoint — the room the deal's files actually live in.
 *
 * The design draws a document library: a rail naming the site, a
 * breadcrumb, a ribbon, a header row, and files with a **sync status** at
 * the right edge. Every part of that is now real, and the status column is
 * the part that earns the screen — « Synced », « Stale », « Not read »
 * against what this deal actually holds.
 *
 * **Four states, and they are four different sentences.** No Microsoft
 * application on this server; nobody connected; connected but this deal is
 * not pointed at a folder yet; watching a folder. The first two are
 * `Waiting.tsx`, which says what is missing and where to go meanwhile —
 * this screen only draws once there is something true to draw.
 *
 * **The ribbon is only the actions that exist.** The design's has New,
 * Upload, Share and Automate on it, which are SharePoint's own and not
 * ours: drawing them would be furniture that does nothing on a screen
 * whose whole subject is whether the files are real. What is there is Sync
 * and what to do about the folder, in the ribbon's position and register.
 *
 * **The rail is the same substitution.** The design's is SharePoint's site
 * navigation — Home, Documents, Pages, Site contents, Recycle bin — none
 * of which this product can open. What goes in its place is the one list
 * that is navigable and true: the document libraries this account can
 * reach. The block above it keeps the design's avatar-and-two-lines, with
 * the connected account in it rather than the site, because the rail below
 * now spans several sites and « whose access is this » is the question the
 * screen can no longer answer anywhere else.
 */

import { useCallback, useEffect, useState } from 'react'

import type {
  ConnectedFolder,
  ConnectorState,
  Drive,
  DriveItem,
  TieOutApi,
} from '../api'
import { ApiError } from '../api'
import { Nothing } from '../Dense'
import { colour, size } from '../design'

/** What this deal holds against what the room holds, per file. */
type Sync = 'synced' | 'changed' | 'unread' | 'unreadable'

const STATUS: Record<Sync, { label: string; ink: string }> = {
  synced: { label: 'Synced', ink: colour.blue },
  //: The room has moved on and the deal has not. The design's own word
  //: and its amber, and the one row a banker should look at.
  changed: { label: 'Stale', ink: colour.warning },
  unread: { label: 'Not read', ink: colour.fainter },
  unreadable: { label: '—', ink: colour.fainter },
}

/** The design's, exactly — an amber folder at 17px in the name column. */
function Folder() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="#e8b23a"
      stroke="none"
      style={{ flex: '0 0 17px' }}
    >
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h7a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    </svg>
  )
}

const shortDate = (iso: string) => {
  if (!iso) return ''
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? ''
    : `${at.getDate()} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[at.getMonth()]}`
}

export function SharePoint({
  api,
  state,
  dealId,
  organizationId,
  folder,
  externals,
  onChanged,
}: {
  api: TieOutApi
  state: ConnectorState
  dealId: string
  organizationId: string
  /** Where this deal's files come from, or null if nobody has said. */
  folder: ConnectedFolder | null
  /**
   * The store's own id and content tag for every document already in the
   * deal. What turns « a file in a list » into « that one, and we have it
   * at this version » — which is the whole status column.
   */
  externals: Map<string, string>
  onChanged: () => void
}) {
  const [drives, setDrives] = useState<Drive[] | null>(null)
  const [drive, setDrive] = useState<string | null>(folder?.drive_id ?? null)
  //: Where in the library we are, as the path walked to get here. The
  //: design draws a breadcrumb and a breadcrumb needs names: a folder id
  //: on its own can say « you are somewhere » and not « you are here ».
  const [trail, setTrail] = useState<{ id: string; name: string }[]>(
    folder ? [{ id: folder.item_id, name: folder.name }] : [],
  )
  const at = trail.length ? trail[trail.length - 1].id : null
  const [items, setItems] = useState<DriveItem[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api
      .drives(organizationId)
      .then((found) => {
        if (!live) return
        setDrives(found)
        if (!drive && found.length) setDrive(found[0].id)
      })
      .catch((error) => live && setProblem(message(error)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  const load = useCallback(async () => {
    if (!drive) return
    setItems(null)
    try {
      setItems(await api.driveItems(organizationId, drive, at ?? undefined))
      setProblem(null)
    } catch (error) {
      setProblem(message(error))
      setItems([])
    }
  }, [api, organizationId, drive, at])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (what: () => Promise<unknown>) => {
    setBusy(true)
    setProblem(null)
    try {
      await what()
      onChanged()
    } catch (error) {
      setProblem(message(error))
    } finally {
      setBusy(false)
    }
  }

  const watching = folder?.drive_id === drive && folder?.item_id === at
  const here = drives?.find((one) => one.id === drive)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* The rail: the sites and libraries this person can reach. The
          design's own, with real drives in it. */}
      <div
        style={{
          flex: '0 1 176px',
          minWidth: 120,
          borderRight: `1px solid ${colour.rule}`,
          background: colour.wash,
          padding: '16px 8px',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 8px 14px',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 3,
              background: colour.blue,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {initials(state.connection?.account_name ?? 'M')}
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: colour.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {state.connection?.account_name || 'Microsoft'}
            </span>
            <span
              style={{ display: 'block', fontSize: 11, color: colour.faint }}
            >
              {state.connection?.status === 'active'
                ? 'Connected'
                : 'Reconnect needed'}
            </span>
          </span>
        </div>

        {/* The way out. A connection reads a firm's deal room through one
            person's credentials, and a product that can be connected and
            not disconnected is asking for a trust nobody agreed to. */}
        {state.connection && (
          <button
            onClick={() => act(() => api.disconnect(state.connection!.id))}
            disabled={busy}
            style={{
              display: 'block',
              border: 0,
              background: 'transparent',
              padding: '0 10px 14px',
              font: 'inherit',
              fontSize: 11,
              color: colour.faint,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Disconnect
          </button>
        )}

        {(drives ?? []).map((one) => (
          <button
            key={one.id}
            onClick={() => {
              setDrive(one.id)
              setTrail([])
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 0,
              padding: '7px 10px',
              borderRadius: 3,
              font: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
              color: colour.ink,
              background: one.id === drive ? colour.band : 'transparent',
              fontWeight: one.id === drive ? 600 : 400,
            }}
          >
            <span
              style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {one.owner || one.name}
            </span>
          </button>
        ))}
        {drives?.length === 0 && (
          <div style={{ padding: '0 10px', fontSize: 12, color: colour.faint }}>
            No libraries this account can reach.
          </div>
        )}
      </div>

      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 20px 10px',
          }}
        >
          <button
            onClick={() => setTrail([])}
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              font: 'inherit',
              fontSize: 16,
              fontWeight: 600,
              color: colour.ink,
              cursor: trail.length ? 'pointer' : 'default',
            }}
          >
            {here?.name || 'Documents'}
          </button>
          {trail.map((step, depth) => (
            <span
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 0,
              }}
            >
              <span style={{ color: colour.ruleHeavy }}>›</span>
              <button
                onClick={() => setTrail(trail.slice(0, depth + 1))}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  fontSize: 13,
                  color: colour.muted,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.name}
              </button>
            </span>
          ))}
        </div>

        {/* The ribbon, holding only what this product can actually do. */}
        <div
          className="ribbon"
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '0 14px 8px',
            fontSize: 13,
            color: colour.muted,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {!watching && at && (
            <Ribbon
              lead
              disabled={busy}
              onClick={() =>
                act(() =>
                  api.pointAt(dealId, { drive_id: drive!, item_id: at }),
                )
              }
            >
              Watch this folder
            </Ribbon>
          )}
          {folder && (
            <>
              <Ribbon
                lead
                disabled={busy}
                onClick={() => act(() => api.syncFolder(dealId))}
              >
                {busy ? 'Reading…' : 'Sync now'}
              </Ribbon>
              <Ribbon
                disabled={busy}
                onClick={() => act(() => api.stopWatching(dealId))}
              >
                Stop watching
              </Ribbon>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: colour.faint }}>
            {folder
              ? folder.last_synced_at
                ? `Watching ${folder.name} · last read ${shortDate(folder.last_synced_at)}`
                : `Watching ${folder.name} · never read`
              : 'This deal is not watching a folder yet'}
          </span>
        </div>

        {(problem || folder?.error) && (
          <div
            style={{
              flex: '0 0 auto',
              padding: '8px 20px',
              fontSize: size.small,
              color: colour.critical,
            }}
            role="alert"
          >
            {problem ?? folder?.error}
          </div>
        )}

        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            gap: 14,
            padding: '8px 20px',
            borderTop: `1px solid ${colour.rule}`,
            borderBottom: `1px solid ${colour.rule}`,
            fontSize: 11.5,
            color: colour.faint,
          }}
        >
          <span style={{ flex: '1 1 auto', minWidth: 120 }}>Name</span>
          <span style={{ flex: '0 0 88px' }}>Modified</span>
          <span style={{ flex: '0 0 106px' }}>Modified by</span>
          <span style={{ flex: '0 0 72px', textAlign: 'right' }}>Sync</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {items === null && (
            <div style={{ padding: 20 }}>
              <Nothing>Reading the library…</Nothing>
            </div>
          )}
          {items?.length === 0 && (
            <div style={{ padding: 20 }}>
              <Nothing>There is nothing in here.</Nothing>
            </div>
          )}
          {(items ?? []).map((item) => {
            const status = STATUS[syncOf(item, externals)]
            return (
              <div
                key={item.id}
                onClick={() =>
                  item.folder &&
                  setTrail([...trail, { id: item.id, name: item.name }])
                }
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  padding: '10px 20px',
                  borderBottom: `1px solid ${colour.washer}`,
                  fontSize: 13,
                  cursor: item.folder ? 'pointer' : 'default',
                }}
              >
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 120,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    overflow: 'hidden',
                  }}
                >
                  {item.folder ? (
                    <Folder />
                  ) : (
                    //: The design has a file-type icon here, one raster
                    //: per format. Those are assets this repository does
                    //: not hold, and a wrong icon on a file is worse than
                    //: none, so the column keeps its width and waits.
                    <span style={{ flex: '0 0 17px' }} />
                  )}
                  <span
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color:
                        item.folder || item.readable
                          ? colour.ink
                          : colour.faint,
                    }}
                  >
                    {item.name}
                  </span>
                </span>
                <span style={{ flex: '0 0 88px', color: colour.muted }}>
                  {shortDate(item.modified_at)}
                </span>
                <span
                  style={{
                    flex: '0 0 106px',
                    color: colour.muted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.modified_by}
                </span>
                <span
                  style={{
                    flex: '0 0 72px',
                    textAlign: 'right',
                    fontSize: 12,
                    color: status.ink,
                  }}
                >
                  {item.folder ? '' : status.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * What this deal holds of a file in the room.
 *
 * The whole status column, and it is a comparison rather than a claim: the
 * deal has this drive item at this content tag, or at a different one, or
 * not at all. « Synced » here means the bytes were read, not that somebody
 * pressed a button.
 */
function syncOf(item: DriveItem, externals: Map<string, string>): Sync {
  if (item.folder) return 'unread'
  if (!item.readable) return 'unreadable'
  if (!externals.has(item.id)) return 'unread'
  const held = externals.get(item.id) ?? ''
  //: A file read before the sync started recording tags has no tag to
  //: compare. « Synced » is the honest reading — the bytes were taken —
  //: and the next sync will record one either way.
  if (!held || !item.content_tag) return 'synced'
  return held === item.content_tag ? 'synced' : 'changed'
}

function Ribbon({
  children,
  onClick,
  disabled,
  lead,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  lead?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0,
        background: 'transparent',
        padding: '6px 10px',
        borderRadius: 3,
        font: 'inherit',
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        color: lead ? colour.blue : colour.muted,
        fontWeight: lead ? 600 : 400,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((one) => one[0]?.toUpperCase() ?? '')
    .join('') || 'M'

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'That did not work.'
