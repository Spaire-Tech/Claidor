'use client'

/**
 * New deal — the founder's SharePoint browser, wired to the connector.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `newOpen` sheet:
 * three states inside one modal — `ndBrowse` (crumbs and the folder
 * list), `ndConfirm` (one card per picked folder: files line, client
 * name, and the model choice when a folder holds more than one
 * workbook), `ndRunning` (the setup steps).
 *
 * Real mappings, named:
 *
 * - The design's crumb root « SharePoint » holds the document libraries;
 *   the connector's drives are exactly that, so the root rows are the
 *   drives and everything under them is `driveItems`.
 * - The design's folder sub-lines carry file counts it already knew;
 *   a live listing knows when a row changed and not how many files are
 *   inside it without opening it, so rows say « Edited … » from the
 *   store's own modified time. The counts appear on the confirm card,
 *   where the folder has actually been opened.
 * - The design dims template and stale folders it had marked; a live
 *   listing has no such mark, so only files Pierce cannot read are
 *   dimmed — that meaning is real (`readable` from the server).
 * - The model choice is honoured by the sync, not decoration: the
 *   non-chosen workbooks are skipped with a counted reason
 *   (`connected_folders.model_item_id`).
 * - Setup runs create → point → sync per picked folder; the design's
 *   three steps tick on a timer while that flies and the notes fill
 *   with the sync's real numbers when it lands, same pattern as the
 *   check screen. A folder that fails keeps its sentence on screen and
 *   the others still land — the design draws no failure state, so the
 *   sentence-in-place pattern is borrowed from the metadata panel.
 */

import { useEffect, useRef, useState } from 'react'
import { ApiError, Drive, DriveItem, TieOutApi } from '../api'
import { ink } from '../design'
import { iconOf, kindFor } from '../files'
import { ago } from './DealPage'

interface Crumb {
  name: string
  go: () => void
}

interface Pick {
  driveId: string
  item: DriveItem
}

interface PickMeta {
  client: string
  /** The folder's files, listed when the pick was confirmed. */
  files: DriveItem[]
  spreadsheets: DriveItem[]
  /** The chosen model's item id; defaults to the first workbook. */
  modelId: string | null
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export const NewDeal = ({
  api,
  organizationId,
  onClose,
  onCreated,
}: {
  api: TieOutApi
  organizationId: string
  onClose: () => void
  /** Called once any deal has landed, so the list behind the sheet
   *  refreshes even if a later folder fails. */
  onCreated: () => void
}) => {
  const [step, setStep] = useState<'browse' | 'confirm' | 'running'>('browse')
  const [drives, setDrives] = useState<Drive[] | null>(null)
  const [drive, setDrive] = useState<Drive | null>(null)
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<DriveItem[] | null>(null)
  const [browseError, setBrowseError] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])
  const [meta, setMeta] = useState<Record<string, PickMeta>>({})
  const [listing, setListing] = useState(false)
  const [runStep, setRunStep] = useState(0)
  const [runDone, setRunDone] = useState(false)
  const [filesRead, setFilesRead] = useState(0)
  const [failures, setFailures] = useState<string[]>([])
  const alive = useRef(true)
  useEffect(() => {
    //: Re-armed on mount, not only initialised: StrictMode mounts,
    //: unmounts and mounts again, and a ref latched false by the first
    //: cleanup would silently drop every response for the sheet's life.
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    api
      .drives(organizationId)
      .then((found) => alive.current && setDrives(found))
      .catch(
        (problem) =>
          alive.current &&
          setBrowseError(
            problem instanceof ApiError
              ? problem.message
              : 'SharePoint could not be reached.',
          ),
      )
  }, [api, organizationId])

  useEffect(() => {
    if (drive === null) {
      setRows(null)
      return
    }
    let live = true
    setRows(null)
    api
      .driveItems(organizationId, drive.id, trail[trail.length - 1]?.id)
      .then((found) => live && setRows(found))
      .catch(
        (problem) =>
          live &&
          setBrowseError(
            problem instanceof ApiError
              ? problem.message
              : 'That folder could not be read.',
          ),
      )
    return () => {
      live = false
    }
  }, [api, organizationId, drive, trail])

  //: The design walks its three steps on a timer; the real work is one
  //: sequence of requests per folder, so the spinner walks while they
  //: fly and holds on the last step until they land.
  useEffect(() => {
    if (step !== 'running' || runDone) return
    const timer = setInterval(
      () => setRunStep((was) => Math.min(was + 1, 2)),
      1200,
    )
    return () => clearInterval(timer)
  }, [step, runDone])

  const crumbs: Crumb[] = [
    {
      name: 'SharePoint',
      go: () => {
        setDrive(null)
        setTrail([])
        setBrowseError('')
      },
    },
    ...(drive
      ? [
          {
            name: drive.name,
            go: () => {
              setTrail([])
              setBrowseError('')
            },
          },
        ]
      : []),
    ...trail.map((one, index) => ({
      name: one.name,
      go: () => setTrail(trail.slice(0, index + 1)),
    })),
  ]

  const picked = (item: DriveItem) =>
    picks.some((one) => one.item.id === item.id)

  const tick = (item: DriveItem) => {
    if (!item.folder || drive === null) return
    setPicks((was) =>
      was.some((one) => one.item.id === item.id)
        ? was.filter((one) => one.item.id !== item.id)
        : [...was, { driveId: drive.id, item }],
    )
  }

  const ready =
    step === 'browse'
      ? picks.length > 0 && !listing
      : step === 'confirm'
        ? picks.every((one) => (meta[one.item.id]?.client ?? '').trim() !== '')
        : true

  const toConfirm = async () => {
    setListing(true)
    try {
      const listed = await Promise.all(
        picks.map(async (one) => {
          const children = await api.driveItems(
            organizationId,
            one.driveId,
            one.item.id,
          )
          const files = children.filter((child) => !child.folder)
          const spreadsheets = files.filter(
            (child) => kindFor(child.name) === 'model',
          )
          return [
            one.item.id,
            {
              client: meta[one.item.id]?.client ?? '',
              files,
              spreadsheets,
              modelId:
                meta[one.item.id]?.modelId ?? spreadsheets[0]?.id ?? null,
            },
          ] as const
        }),
      )
      if (!alive.current) return
      setMeta(Object.fromEntries(listed))
      setStep('confirm')
    } catch (problem) {
      if (alive.current)
        setBrowseError(
          problem instanceof ApiError
            ? problem.message
            : 'That folder could not be read.',
        )
    } finally {
      if (alive.current) setListing(false)
    }
  }

  const create = async () => {
    setStep('running')
    setRunStep(0)
    setRunDone(false)
    const broken: string[] = []
    let read = 0
    let landed = false
    for (const one of picks) {
      const info = meta[one.item.id]!
      try {
        const deal = await api.createDeal(organizationId, {
          name: one.item.name,
          client_name: info.client.trim(),
        })
        await api.pointAt(deal.id, {
          drive_id: one.driveId,
          item_id: one.item.id,
          model_item_id: info.spreadsheets.length > 1 ? info.modelId : null,
        })
        const folder = await api.syncFolder(deal.id)
        read += Number(
          (folder.last_result as { read?: number } | null)?.read ?? 0,
        )
        landed = true
      } catch (problem) {
        broken.push(
          `${one.item.name} — ${
            problem instanceof ApiError
              ? problem.message
              : 'something went wrong setting it up'
          }`,
        )
      }
      if (!alive.current) return
    }
    setFilesRead(read)
    setFailures(broken)
    setRunStep(3)
    setRunDone(true)
    if (landed) onCreated()
  }

  const next = () => {
    if (!ready) return
    if (step === 'browse') void toConfirm()
    else if (step === 'confirm') void create()
    else onClose()
  }

  const back = () => {
    if (step === 'confirm') setStep('browse')
    else onClose()
  }

  const models = picks.reduce((total, one) => {
    const info = meta[one.item.id]
    if (!info) return total
    return total + (info.spreadsheets.length > 1 ? 1 : info.spreadsheets.length)
  }, 0)

  const steps = [
    {
      label: 'Syncing the folders',
      note: runDone ? plural(filesRead, 'file', 'files') : '',
    },
    {
      label: 'Reading the models',
      note: runDone ? plural(models, 'model', 'models') : '',
    },
    {
      label: 'Matching figures across the documents',
      note: runDone ? 'first pass' : '',
    },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(16,20,28,.3)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        padding: 24,
      }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'relative',
          width: 'min(520px,100%)',
          height: 'min(560px,86vh)',
          display: 'flex',
          flexDirection: 'column',
          background: '#f2f2f7',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,.3), 0 0 0 .5px rgba(0,0,0,.08)',
          overflow: 'hidden',
          animation: 'pcIn .16s ease both',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 14px',
            height: 52,
            background: 'rgba(255,255,255,.8)',
            backdropFilter: 'blur(20px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
            borderBottom: '.5px solid rgba(0,0,0,.12)',
          }}
        >
          <button
            onClick={back}
            style={{
              flex: '0 0 auto',
              minWidth: 72,
              textAlign: 'left',
              border: 0,
              background: 'transparent',
              font: 'inherit',
              fontSize: 15,
              color: ink.accent,
              cursor: 'pointer',
              padding: '6px 4px',
              borderRadius: 8,
            }}
          >
            {step === 'confirm'
              ? 'Back'
              : step === 'running'
                ? 'Close'
                : 'Cancel'}
          </button>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 590,
                letterSpacing: '-.012em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {step === 'browse'
                ? 'Choose folders'
                : step === 'confirm'
                  ? picks.length > 1
                    ? `${picks.length} new deals`
                    : 'New deal'
                  : 'Setting up'}
            </div>
          </div>
          <button
            onClick={next}
            style={{
              flex: '0 0 auto',
              minWidth: 72,
              textAlign: 'right',
              border: 0,
              background: 'transparent',
              font: 'inherit',
              fontSize: 15,
              fontWeight: 590,
              color: ready ? ink.accent : '#c4c4c9',
              cursor: ready ? 'pointer' : 'default',
              padding: '6px 4px',
              borderRadius: 8,
            }}
          >
            {step === 'browse'
              ? 'Next'
              : step === 'confirm'
                ? 'Create'
                : 'Done'}
          </button>
        </div>

        {step === 'browse' && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                padding: '11px 20px 8px',
                flexWrap: 'wrap',
              }}
            >
              {crumbs.map((crumb, index) => (
                <span
                  key={index}
                  style={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <button
                    onClick={crumb.go}
                    style={{
                      border: 0,
                      background: 'transparent',
                      font: 'inherit',
                      fontSize: 13,
                      fontWeight: index === crumbs.length - 1 ? 600 : 400,
                      color:
                        index === crumbs.length - 1 ? ink.primary : ink.accent,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 6,
                    }}
                  >
                    {crumb.name}
                  </button>
                  {index < crumbs.length - 1 && (
                    <svg
                      width="6"
                      height="11"
                      viewBox="0 0 9 15"
                      fill="none"
                      stroke="#c4c4c9"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
                    </svg>
                  )}
                </span>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                padding: '0 16px 18px',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {browseError !== '' && (
                  <div
                    style={{
                      padding: '14px 16px',
                      fontSize: 14,
                      color: '#3a3a3c',
                      lineHeight: 1.5,
                    }}
                  >
                    {browseError}
                  </div>
                )}
                {browseError === '' &&
                  drive === null &&
                  (drives ?? []).map((one, index) => (
                    <DriveRow
                      key={one.id}
                      drive={one}
                      first={index === 0}
                      onOpen={() => {
                        setDrive(one)
                        setTrail([])
                      }}
                    />
                  ))}
                {browseError === '' &&
                  drive !== null &&
                  (rows ?? []).map((one, index) => (
                    <ItemRow
                      key={one.id}
                      item={one}
                      first={index === 0}
                      on={picked(one)}
                      onTick={() => tick(one)}
                      onOpen={() =>
                        setTrail((was) => [
                          ...was,
                          { id: one.id, name: one.name },
                        ])
                      }
                    />
                  ))}
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: '16px 16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            {picks.map((one) => {
              const info = meta[one.item.id]!
              const counts = {
                sheets: info.spreadsheets.length,
                decks: info.files.filter(
                  (file) => kindFor(file.name) === 'deck',
                ).length,
              }
              const other = info.files.length - counts.sheets - counts.decks
              return (
                <div key={one.item.id}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#8a8a8e',
                      padding: '0 16px 6px',
                      letterSpacing: '-.005em',
                    }}
                  >
                    {one.item.name}
                  </div>
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 15px',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 15,
                          letterSpacing: '-.01em',
                        }}
                      >
                        Files
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: 'right',
                          fontSize: 15,
                          color: '#a1a1a6',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {`${plural(info.files.length, 'file', 'files')} · ${plural(
                          counts.sheets,
                          'spreadsheet',
                          'spreadsheets',
                        )}, ${plural(counts.decks, 'deck', 'decks')}, ${other} other`}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '0 15px',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 15,
                          letterSpacing: '-.01em',
                        }}
                      >
                        Client
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          borderTop: '.5px solid #e6e6ea',
                        }}
                      >
                        <input
                          value={info.client}
                          onChange={(event) =>
                            setMeta((was) => ({
                              ...was,
                              [one.item.id]: {
                                ...was[one.item.id]!,
                                client: event.target.value,
                              },
                            }))
                          }
                          placeholder="Required"
                          style={{
                            width: '100%',
                            border: 0,
                            background: 'transparent',
                            padding: '11px 0',
                            font: 'inherit',
                            fontSize: 15,
                            color: ink.primary,
                            textAlign: 'right',
                            outline: 'none',
                          }}
                        />
                      </span>
                    </div>
                    {info.spreadsheets.length > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                          padding: '0 15px',
                        }}
                      >
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 15,
                            letterSpacing: '-.01em',
                            padding: '11px 0',
                          }}
                        >
                          Model
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            borderTop: '.5px solid #e6e6ea',
                            padding: '5px 0 7px',
                          }}
                        >
                          {info.spreadsheets.map((sheet) => {
                            const on = info.modelId === sheet.id
                            return (
                              <button
                                key={sheet.id}
                                onClick={() =>
                                  setMeta((was) => ({
                                    ...was,
                                    [one.item.id]: {
                                      ...was[one.item.id]!,
                                      modelId: sheet.id,
                                    },
                                  }))
                                }
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  width: '100%',
                                  textAlign: 'right',
                                  border: 0,
                                  background: 'transparent',
                                  font: 'inherit',
                                  fontSize: 14.5,
                                  color: on ? ink.primary : '#8a8a8e',
                                  cursor: 'pointer',
                                  padding: '6px 0',
                                }}
                              >
                                <span
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {sheet.name}
                                </span>
                                <span
                                  style={{
                                    flex: '0 0 15px',
                                    display: 'flex',
                                    color: ink.accent,
                                  }}
                                >
                                  {on && (
                                    <svg
                                      width="15"
                                      height="15"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="5,12.5 10,17.5 19,6.5" />
                                    </svg>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {step === 'running' && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: '16px 16px 20px',
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {steps.map((one, index) => (
                <div
                  key={one.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '0 15px',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 17px',
                      width: 17,
                      height: 17,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {index < runStep && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={ink.clean}
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="5,12.5 10,17.5 19,6.5" />
                      </svg>
                    )}
                    {index === runStep && (
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          border: '2px solid rgba(21,23,27,.14)',
                          borderTopColor: ink.accent,
                          animation: 'pcSpin .8s linear infinite',
                        }}
                      />
                    )}
                    {index > runStep && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#d2d2d7',
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderTop: index === 0 ? '0' : '.5px solid #e6e6ea',
                      padding: '12px 0',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
                        letterSpacing: '-.01em',
                        color: index <= runStep ? ink.primary : ink.faint,
                      }}
                    >
                      {one.label}
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontSize: 14.5,
                        color: '#a1a1a6',
                      }}
                    >
                      {index < runStep ? one.note : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {failures.length > 0 && (
              //: No failure state is drawn; the sentence-in-place
              //: pattern is borrowed from the metadata panel. The other
              //: folders' deals have still landed.
              <div
                style={{
                  padding: '14px 16px 0',
                  fontSize: 13.5,
                  color: '#3a3a3c',
                  lineHeight: 1.5,
                }}
              >
                {failures.map((one) => (
                  <div key={one}>{one}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const DriveRow = ({
  drive,
  first,
  onOpen,
}: {
  drive: Drive
  first: boolean
  onOpen: () => void
}) => (
  <div style={{ display: 'flex', alignItems: 'stretch' }}>
    <button
      onClick={onOpen}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        textAlign: 'left',
        border: 0,
        background: 'transparent',
        font: 'inherit',
        cursor: 'pointer',
        padding: '0 0 0 15px',
      }}
    >
      <FolderGlyph fill="#5aa9f0" />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          borderTop: first ? '0' : '.5px solid #eceaec',
          padding: '11px 0',
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 15,
            letterSpacing: '-.01em',
            color: ink.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {drive.name}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            color: '#a1a1a6',
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {drive.owner}
        </span>
      </span>
    </button>
    <button
      onClick={onOpen}
      title="Open"
      style={{
        flex: '0 0 auto',
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        padding: '0 15px',
        display: 'flex',
        alignItems: 'center',
        color: '#c4c4c9',
      }}
    >
      <OpenChevron />
    </button>
  </div>
)

const ItemRow = ({
  item,
  first,
  on,
  onTick,
  onOpen,
}: {
  item: DriveItem
  first: boolean
  on: boolean
  onTick: () => void
  onOpen: () => void
}) => {
  const kind = kindFor(item.name)
  const dim = !item.folder && !item.readable
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <button
        onClick={onTick}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          font: 'inherit',
          cursor: item.folder ? 'pointer' : 'default',
          padding: '0 0 0 15px',
        }}
      >
        {item.folder ? (
          <FolderGlyph fill="#5aa9f0" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconOf(kind)}
            alt=""
            style={{
              flex: '0 0 19px',
              width: 19,
              height: 19,
              objectFit: 'contain',
              opacity: dim ? 0.55 : 1,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            borderTop: first ? '0' : '.5px solid #eceaec',
            padding: '11px 0',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 15,
              letterSpacing: '-.01em',
              color: dim ? ink.secondary : ink.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 12.5,
              color: '#a1a1a6',
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {`${item.folder ? 'Changed' : 'Edited'} ${ago(item.modified_at)}`}
          </span>
        </span>
        {on && (
          <span
            style={{
              flex: '0 0 auto',
              display: 'flex',
              padding: '0 6px 0 8px',
              color: ink.accent,
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="5,12.5 10,17.5 19,6.5" />
            </svg>
          </span>
        )}
      </button>
      {item.folder ? (
        <button
          onClick={onOpen}
          title="Open"
          style={{
            flex: '0 0 auto',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            padding: '0 15px',
            display: 'flex',
            alignItems: 'center',
            color: '#c4c4c9',
          }}
        >
          <OpenChevron />
        </button>
      ) : (
        <span style={{ flex: '0 0 auto', width: 38 }} />
      )}
    </div>
  )
}

const FolderGlyph = ({ fill }: { fill: string }) => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill={fill}
    style={{ flex: '0 0 21px' }}
  >
    <path d="M3 7.6a2 2 0 0 1 2-2h4.1l1.7 2h8.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

const OpenChevron = () => (
  <svg
    width="8"
    height="14"
    viewBox="0 0 9 15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
  </svg>
)
