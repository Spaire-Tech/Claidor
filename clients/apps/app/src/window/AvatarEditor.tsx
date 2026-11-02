// The avatar editor (mac/Simeon/AvatarEditor.swift, the window's `c3n`):
// what the pencil on the pane's avatar opens, and New Agent's face. Its
// tabs: Faces (the founder's clay faces, Woman or Man, Shuffle, the voice),
// Generate (a picture drawn from words, for the person's credits) and Upload
// (a picture of one's own: chosen, dropped or pasted); then the crop, in a
// canvas, saved as the 256-pixel PNG the Mac makes. For a new agent it
// changes an AgentDraft instead, and nothing reaches the computer until
// Create. Closing it while a picture is drawn still saves the picture when
// it comes, cropped in its middle, as on the Mac.

import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AgentDraft } from '../core/agentDraft'
import {
  type VoiceChoice,
  defaultVoiceId,
  keptVoice,
} from '../core/agentVoices'
import { AvatarCrop, avatarEditorWords } from '../core/avatarCrop'
import { middleCut } from '../core/connectCards'
import {
  type AgentFace,
  facePool,
  faceURL,
  simeonFace,
  wornFace,
} from '../core/faces'
import { type Agent, chiefOfStaff, makeAgent } from '../core/models'
import { plainProblem } from '../core/plainWords'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentPicture } from './AgentMark'
import './AvatarEditor.css'
import { classes } from './classes'
import { ContextMenu } from './ContextMenu'
import { somethingOver } from './Dialogs'
import { useWatched } from './useStore'

// MARK: The model

export type EditorTab = 'faces' | 'generate' | 'upload'

/** A picture being cropped: drawn down to 1024 at most, its crop, and the line under the stage for a file or a paste. */
interface Candidate {
  image: HTMLCanvasElement
  crop: AvatarCrop
  fileLine?: string
}

/** The words of what went wrong, without the plumbing's (`h$n`). */
function words(error: unknown): string {
  const fallback = t('Couldn’t change the avatar. Try again in a little while.')
  const said = error instanceof Error ? error.message : String(error)
  return plainProblem(said, fallback) || fallback
}

/** A picture's bytes made a picture to draw; undefined when they are none the browser can read. */
async function decoded(data: Blob): Promise<ImageBitmap | undefined> {
  try {
    return await createImageBitmap(data)
  } catch {
    return undefined
  }
}

/** The picture drawn down to 1024 on its longest side (`Amt`, `BUe`). */
function fitted(source: ImageBitmap): HTMLCanvasElement | undefined {
  const size = AvatarCrop.fitted(source.width, source.height)
  if (!(size.width >= 1 && size.height >= 1)) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const pen = canvas.getContext('2d')
  if (!pen) return undefined
  pen.imageSmoothingEnabled = true
  pen.imageSmoothingQuality = 'high'
  pen.drawImage(source, 0, 0, size.width, size.height)
  return canvas
}

/** The crop as a 256 × 256 PNG (`nR`). */
async function exported(candidate: Candidate): Promise<Uint8Array | undefined> {
  const side = AvatarCrop.output
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const pen = canvas.getContext('2d')
  if (!pen) return undefined
  pen.imageSmoothingEnabled = true
  pen.imageSmoothingQuality = 'high'
  const rect = candidate.crop.rect
  pen.drawImage(
    candidate.image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    side,
    side,
  )
  const blob = await new Promise<Blob | null>((done) =>
    canvas.toBlob(done, 'image/png'),
  )
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

/**
 * The editor's state (`AvatarEditorModel`), kept apart from the screen so
 * the window's keys reach it (Escape closes it; ⌘V pastes a picture into
 * Upload). One for each opening under the pane's avatar; New Agent's sheet
 * keeps its own while it is open, wrapped round its draft.
 */
export class AvatarEditorModel {
  private listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  readonly agentId: string
  readonly isGroup: boolean
  tab: EditorTab
  prompt = ''
  candidate?: Candidate
  generating = false
  saving = false
  error?: string
  /** The gender Faces shows, once the person picks one; until then the agent's face's. */
  gender?: string
  dragOver = false
  /** The voices' list, open under its field (Escape and a click elsewhere close it first). */
  voiceMenu?: { x: number; y: number; width: number }
  /** A new agent's look (New Agent): what the editor changes when there is no agent yet. */
  draft?: AgentDraft
  /** Bumped by every tab switch and Restart: a picture drawn or read before it is thrown away. */
  private generation = 0
  /** Closed while generating: the picture is saved when it arrives. */
  private closed = false
  private exporting = false

  constructor(agentId: string, isGroup: boolean, draft?: AgentDraft) {
    this.agentId = agentId
    this.isGroup = isGroup
    this.tab = isGroup ? 'upload' : 'faces'
    this.draft = draft
  }

  static forDraft(draft: AgentDraft): AvatarEditorModel {
    return new AvatarEditorModel('', false, draft)
  }

  /** The agent as the editor draws it: the draft wearing its face or picture, else the agent. */
  shown(agent: Agent | undefined, store: AppStore): Agent {
    return (
      this.draft?.agent(store.agents) ??
      agent ??
      makeAgent({ id: this.agentId, name: '' })
    )
  }

  setDraft(draft: AgentDraft): void {
    this.draft = draft
    this.changed()
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt
    this.changed()
  }

  setGender(gender: string): void {
    this.gender = gender
    this.changed()
  }

  setDragOver(over: boolean): void {
    if (this.dragOver === over) return
    this.dragOver = over
    this.changed()
  }

  setCrop(crop: AvatarCrop): void {
    if (!this.candidate) return
    this.candidate = { ...this.candidate, crop }
    this.changed()
  }

  openVoiceMenu(at: { x: number; y: number; width: number }): void {
    this.voiceMenu = at
    this.changed()
  }

  closeVoiceMenu(): void {
    if (!this.voiceMenu) return
    this.voiceMenu = undefined
    this.changed()
  }

  /** A tab (`X`): the picture, the generating and the error go; the prompt stays. */
  choose(next: EditorTab): void {
    if (next === this.tab) return
    this.tab = next
    this.generation += 1
    this.candidate = undefined
    this.generating = false
    this.error = undefined
    this.changed()
  }

  closeNow(): void {
    this.closed = true
    this.voiceMenu = undefined
  }

  /** Opened again (New Agent keeps its editor): a picture generated from now shows in it. */
  reopen(): void {
    this.closed = false
  }

  // Faces

  /** A face put on at once (the store's `wearFace`: the picture, the face kept, a voice of its gender when it changes). */
  wear(face: AgentFace, store: AppStore): void {
    if (this.draft)
      return this.changeDraft(store, (draft, voices) =>
        draft.wear(face, store.agents, voices),
      )
    this.run(() => store.wearFace(this.agentId, face))
  }

  /** Shuffle: the next face of `gender` no other agent wears. */
  shuffle(gender: string, store: AppStore): void {
    if (this.draft)
      return this.changeDraft(store, (draft, voices) =>
        draft.shuffle(gender, store.agents, voices),
      )
    this.run(() => store.shuffleFace(this.agentId, gender))
  }

  /** Reset face: back to the face the agent was given. */
  reset(store: AppStore): void {
    this.gender = undefined
    this.changed()
    if (this.draft)
      return this.changeDraft(store, (draft, voices) =>
        draft.reset(store.agents, voices),
      )
    this.run(() => store.resetFace(this.agentId))
  }

  /** The draft changed with the voices listed (a face of the other gender brings a voice of its own). */
  private changeDraft(
    store: AppStore,
    edit: (draft: AgentDraft, voices: VoiceChoice[]) => AgentDraft,
  ): void {
    void (async () => {
      const voices = await store.voices()
      if (!this.draft) return
      this.setDraft(edit(this.draft, voices))
    })()
  }

  private run(change: () => Promise<unknown>): void {
    if (this.saving) return
    this.saving = true
    this.error = undefined
    this.changed()
    void (async () => {
      try {
        await change()
      } catch (error) {
        this.error = words(error)
      }
      this.saving = false
      this.changed()
    })()
  }

  // Pictures

  /** A file from Browse files or a drop: read, checked, drawn down, cropped in its middle. */
  async take(file: File, fromDrop: boolean): Promise<void> {
    this.error = undefined
    this.changed()
    const problem = fromDrop ? AvatarCrop.sizeProblem(file.size) : undefined
    if (problem) {
      this.error = problem
      this.changed()
      return
    }
    const ticket = this.generation
    let data: ArrayBuffer
    try {
      data = await file.arrayBuffer()
    } catch {
      if (ticket !== this.generation) return
      this.error = avatarEditorWords.unreadable()
      this.changed()
      return
    }
    const image = await decoded(new Blob([data]))
    if (ticket !== this.generation) {
      image?.close()
      return
    }
    if (!image) {
      this.error = fromDrop
        ? avatarEditorWords.unloadable()
        : avatarEditorWords.notAnImage()
      this.changed()
      return
    }
    this.takeImage(image, file.name)
  }

  /**
   * ⌘V (`u3n`): the clipboard's first picture into Upload; with none,
   * Upload all the same. A file copied keeps its name; a picture copied
   * (which a browser names "image.png") is a "Pasted image".
   */
  paste(files: readonly File[]): void {
    if (this.tab !== 'upload') this.choose('upload')
    const file = files.find((one) => one.type.startsWith('image/'))
    if (!file) return
    const ticket = this.generation
    void (async () => {
      const image = await decoded(file)
      if (!image) return
      if (ticket !== this.generation) {
        image.close()
        return
      }
      this.error = undefined
      this.takeImage(
        image,
        file.name && file.name !== 'image.png'
          ? file.name
          : avatarEditorWords.pastedName(),
      )
    })()
  }

  private takeImage(image: ImageBitmap, name?: string): void {
    const canvas = fitted(image)
    image.close()
    if (!canvas) {
      this.error = avatarEditorWords.unloadable()
      this.changed()
      return
    }
    this.candidate = {
      image: canvas,
      crop: new AvatarCrop(canvas.width, canvas.height),
      fileLine:
        name === undefined
          ? undefined
          : `${name} · ${canvas.width}×${canvas.height}`,
    }
    this.changed()
  }

  /** Generate (`l3n`): the picture asked for; closed meanwhile, saved at once in its middle; another tab meanwhile, thrown away. */
  async generate(store: AppStore): Promise<void> {
    const text = this.prompt.trim()
    if (text === '' || this.generating) return
    this.generating = true
    this.error = undefined
    this.changed()
    const ticket = this.generation
    try {
      const bytes = await store.generateAvatarImage(text)
      if (ticket !== this.generation) return
      const image = await decoded(new Blob([bytes as BlobPart]))
      const canvas = image && fitted(image)
      image?.close()
      if (ticket !== this.generation) return
      this.generating = false
      if (!canvas) {
        this.error = t('Image generation returned no picture.')
        this.changed()
        return
      }
      const candidate: Candidate = {
        image: canvas,
        crop: new AvatarCrop(canvas.width, canvas.height),
      }
      if (this.closed) {
        const png = await exported(candidate)
        if (png) {
          if (this.draft) this.setDraft(this.draft.withPicture(png))
          else
            await store.setAvatarImage(this.agentId, png).catch(() => {
              // Closed: there is no one to tell.
            })
        }
      } else {
        this.candidate = candidate
      }
      this.changed()
    } catch (error) {
      if (ticket !== this.generation) return
      this.generating = false
      this.error = words(error)
      this.changed()
    }
  }

  /** Restart: back to the drop zone or the prompt (its words kept). */
  restart(): void {
    this.generation += 1
    this.candidate = undefined
    this.error = undefined
    this.changed()
  }

  /** Set avatar: the crop as a 256-pixel PNG (`jUe`), saved, then the editor closes. */
  async setPicture(store: AppStore, close: () => void): Promise<void> {
    const candidate = this.candidate
    if (!candidate || this.saving || this.exporting) return
    this.exporting = true
    const png = await exported(candidate)
    this.exporting = false
    if (!png) {
      this.error = avatarEditorWords.exportFailed()
      this.changed()
      return
    }
    if (this.draft) {
      this.draft = this.draft.withPicture(png)
      this.candidate = undefined
      this.changed()
      close()
      return
    }
    this.saving = true
    this.error = undefined
    this.changed()
    try {
      await store.setAvatarImage(this.agentId, png)
      this.saving = false
      this.changed()
      close()
    } catch (error) {
      this.error = words(error)
      this.saving = false
      this.changed()
    }
  }
}

// MARK: The popover

/** Whether the keys are in a field that takes words (its own Escape and paste come first). */
function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * The editor under the pane's avatar (`AvatarEditorPopover` as AgentPane
 * hosts it): 294 wide (the page's width when narrower), 6 under the avatar
 * and centred on it, over the page. Escape closes it whatever has the keys,
 * unless an alert or a sheet is over the window (the voices' list goes
 * first); a click outside it, but for the avatar's own button, closes it;
 * ⌘V outside a field pastes a picture into Upload.
 */
export function AvatarEditorPopover({
  store,
  agent,
  width,
  close,
}: {
  store: AppStore
  agent: Agent
  width: number
  close: () => void
}) {
  const [model] = useState(() => new AvatarEditorModel(agent.id, agent.isGroup))
  useEffect(() => () => model.closeNow(), [model])
  const box = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (somethingOver()) return
      event.preventDefault()
      event.stopPropagation()
      if (model.voiceMenu) model.closeVoiceMenu()
      else latest.current()
    }
    const paste = (event: ClipboardEvent) => {
      if (somethingOver() || isField(event.target)) return
      event.preventDefault()
      model.paste([...(event.clipboardData?.files ?? [])])
    }
    const down = (event: MouseEvent) => {
      if (somethingOver() || model.voiceMenu) return
      const target = event.target
      if (target instanceof Node && box.current?.contains(target)) return
      if (target instanceof Element && target.closest('.avatar-trigger')) return
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    document.addEventListener('paste', paste)
    document.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('paste', paste)
      document.removeEventListener('mousedown', down, true)
    }
  }, [model])
  return (
    <div
      ref={box}
      className="avatar-editor-place"
      style={{ width, left: `calc(50% - ${width / 2}px)` }}
    >
      <AvatarEditorCard
        store={store}
        agent={agent}
        model={model}
        width={width}
        chrome
        close={close}
      />
    </div>
  )
}

/**
 * The editor's card (`AvatarEditorPopover`'s body): round 16, the raised
 * ground, a hairline edge and a soft shadow (none inside New Agent's
 * popover, which draws its own); its head the tabs (Faces, Generate,
 * Upload; a group has no Faces) and Reset, a hairline under it; its body
 * padded 12, 240 high at the least, the error under it in red.
 */
export function AvatarEditorCard({
  store,
  agent,
  model,
  width,
  chrome,
  close,
}: {
  store: AppStore
  agent: Agent
  model: AvatarEditorModel
  width: number
  chrome: boolean
  close: () => void
}) {
  useWatched(model)
  const reset = model.draft
    ? avatarEditorWords.resetDraft(model.draft)
    : avatarEditorWords.reset(agent)
  const tabs: [EditorTab, string][] = [
    ['generate', avatarEditorWords.generate()],
    ['upload', avatarEditorWords.upload()],
  ]
  if (!agent.isGroup) tabs.unshift(['faces', avatarEditorWords.faces()])
  let body: ReactNode
  switch (model.tab) {
    case 'faces':
      body = (
        <FacesTab
          agent={model.shown(agent, store)}
          model={model}
          store={store}
        />
      )
      break
    case 'generate':
      body = <GenerateTab model={model} store={store} close={close} />
      break
    case 'upload':
      body = <UploadTab model={model} store={store} close={close} />
      break
  }
  return (
    <div
      className={classes('avatar-editor', chrome && 'chrome')}
      style={{ width }}
      role="group"
      aria-label={t('Edit agent avatar')}
    >
      <div className="editor-head">
        <div className="editor-tabs">
          {tabs.map(([tab, title]) => (
            <EditorTabButton
              key={tab}
              title={title}
              chosen={model.tab === tab}
              choose={() => model.choose(tab)}
            />
          ))}
        </div>
        {reset !== undefined && (
          <button
            type="button"
            className="editor-reset"
            title={reset}
            aria-label={reset}
            disabled={model.saving}
            onClick={() => model.reset(store)}
          >
            {t('Reset')}
          </button>
        )}
      </div>
      <div className="editor-rule" />
      <div className="editor-body">
        {body}
        {model.error !== undefined && (
          <div className="editor-error" role="alert">
            {model.error}
          </div>
        )}
      </div>
    </div>
  )
}

/** A tab (26 high, round 8, 13): the chosen one in the ink on the grey, the others grey, the grey under the pointer. */
function EditorTabButton({
  title,
  chosen,
  choose,
}: {
  title: string
  chosen: boolean
  choose: () => void
}) {
  return (
    <button
      type="button"
      className={classes('editor-tab', chosen && 'chosen')}
      aria-pressed={chosen}
      onClick={choose}
    >
      {title}
    </button>
  )
}

/** The popover's buttons (30 high, round 10, 13): the dark one (Set avatar, Generate) and the grey one (Restart, Browse files, Shuffle). */
function EditorButton({
  title,
  primary,
  wide = true,
  disabled,
  onClick,
}: {
  title: string
  primary: boolean
  wide?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes(
        'editor-button',
        primary ? 'primary' : 'secondary',
        wide && 'wide',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

// MARK: Faces

/**
 * Faces (the founder, 12 October 2026: the clay characters, no colours):
 * Woman and Man with Shuffle beside them; the gender's faces, five a row
 * (44-point cells, 8 apart), the one worn ringed, each put on at a click;
 * then Voice. The Chief of Staff can always go back to Simeon's own face; no
 * one else is offered it.
 */
function FacesTab({
  agent,
  model,
  store,
}: {
  agent: Agent
  model: AvatarEditorModel
  store: AppStore
}) {
  const gender = model.gender ?? avatarEditorWords.gender(agent)
  const worn = wornFace(agent)
  const isChief = chiefOfStaff(store.agents)?.id === agent.id
  const simeon = simeonFace()
  const faces = [
    ...(isChief && simeon && gender === simeon.gender ? [simeon] : []),
    ...facePool.filter((face) => face.gender === gender),
  ]
  const rows: AgentFace[][] = []
  for (let at = 0; at < faces.length; at += 5)
    rows.push(faces.slice(at, at + 5))
  return (
    <div className="faces-tab">
      <div className="faces-gender">
        <div className="editor-tabs">
          <EditorTabButton
            title={avatarEditorWords.woman()}
            chosen={gender === 'female'}
            choose={() => model.setGender('female')}
          />
          <EditorTabButton
            title={avatarEditorWords.man()}
            chosen={gender === 'male'}
            choose={() => model.setGender('male')}
          />
        </div>
        <EditorButton
          title={avatarEditorWords.shuffle()}
          primary={false}
          wide={false}
          disabled={model.saving}
          onClick={() => model.shuffle(gender, store)}
        />
      </div>
      <div className="faces-grid" role="group" aria-label={t('Faces')}>
        {rows.map((row, at) => (
          <div key={at} className="faces-row">
            {row.map((face) => (
              <button
                key={face.id}
                type="button"
                className={classes('face-cell', face.id === worn?.id && 'worn')}
                aria-label={
                  face.gender === 'female'
                    ? t("A woman's face")
                    : t("A man's face")
                }
                aria-pressed={face.id === worn?.id}
                disabled={model.saving}
                onClick={() => model.wear(face, store)}
              >
                <AgentPicture url={faceURL(face)} size={36} />
              </button>
            ))}
          </div>
        ))}
      </div>
      <VoicePicker agent={agent} editor={model} store={store} />
    </div>
  )
}

/** Plays a voice's sample, one at a time (`SamplePlayer`); a sample the browser can't play is let go. */
function useSamplePlayer() {
  const audio = useRef<HTMLAudioElement>(undefined)
  const [playing, setPlaying] = useState<string>()
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set())
  const stop = () => {
    audio.current?.pause()
    audio.current = undefined
    setPlaying(undefined)
  }
  useEffect(
    () => () => {
      audio.current?.pause()
      audio.current = undefined
    },
    [],
  )
  const play = (url: string, id: string) => {
    stop()
    const player = new Audio(url)
    audio.current = player
    setPlaying(id)
    const gone = () => {
      if (audio.current !== player) return
      audio.current = undefined
      setPlaying(undefined)
    }
    const failed = () => {
      gone()
      setRefused((was) => new Set([...was, id]))
    }
    player.addEventListener('ended', gone)
    player.addEventListener('error', failed)
    player.play().catch((error: unknown) => {
      // Stopped before it started is no failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
      failed()
    })
  }
  return { playing, refused, play, stop }
}

/**
 * Voice (`VoicePicker`): "Voice" (12, semibold, grey), then the voice's
 * field across the row and a 30-point play button that plays the voice's
 * sample (stops it when it plays). A small spinner while the voices load;
 * hidden when there are none (calls off). A pick is saved at once; refused,
 * it goes back and says "Couldn’t save the voice." A new agent's voice
 * follows its face until one is picked, and a pick changes only the draft.
 */
function VoicePicker({
  agent,
  editor,
  store,
}: {
  agent: Agent
  editor: AvatarEditorModel
  store: AppStore
}) {
  const [voices, setVoices] = useState<VoiceChoice[]>([])
  const [loaded, setLoaded] = useState(false)
  const [chosen, setChosen] = useState<string>()
  const [note, setNote] = useState<string>()
  const player = useSamplePlayer()
  const agentId = agent.id
  const voiceId = useRef(agent.voiceId)
  useLayoutEffect(() => {
    voiceId.current = agent.voiceId
  })
  // The list as soon as it comes, on the agent's voice while it is listed; then the voice settled for it.
  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await store.voices()
      if (!alive) return
      if (list.length === 0) {
        setVoices([])
        setLoaded(true)
        return
      }
      if (editor.draft) {
        setChosen(editor.draft.voice(store.agents, list) ?? list[0]!.id)
        setVoices(list)
        setLoaded(true)
        return
      }
      const kept = keptVoice(voiceId.current, list) ?? defaultVoiceId
      setChosen(list.some((voice) => voice.id === kept) ? kept : list[0]!.id)
      setVoices(list)
      const own = (await store.ensureVoice(agentId)) ?? defaultVoiceId
      if (!alive) return
      if (list.some((voice) => voice.id === own)) setChosen(own)
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [agentId, editor, store])
  // The agent's voice changed under the field (a face of the other gender
  // brought one of its gender): the field shows it. The Mac's keeps the old
  // name until the editor is opened again (docs/web-app/PROGRESS.md).
  const [seenVoice, setSeenVoice] = useState(agent.voiceId)
  if (!editor.draft && agent.voiceId !== seenVoice) {
    setSeenVoice(agent.voiceId)
    const kept = keptVoice(agent.voiceId, voices)
    if (
      kept !== undefined &&
      kept !== chosen &&
      voices.some((voice) => voice.id === kept)
    )
      setChosen(kept)
  }
  const current =
    editor.draft && voices.length > 0
      ? (editor.draft.voice(store.agents, voices) ?? chosen)
      : chosen
  const pick = (id: string) => {
    if (editor.draft) {
      editor.setDraft(editor.draft.pickVoice(id))
      setChosen(id)
      return
    }
    if (id === chosen) return
    const was = chosen
    setChosen(id)
    setNote(undefined)
    store.setAgentVoice(agentId, id).catch(() => {
      setChosen(was)
      setNote(avatarEditorWords.voiceNotSaved())
    })
  }
  // No voices (calls off): nothing in its place, as the Mac's empty stack.
  if (loaded && voices.length === 0) return <div className="voice-picker" />
  const voice = voices.find((one) => one.id === current)
  const sample =
    voice?.sample?.startsWith('https://') && !player.refused.has(voice.id)
      ? voice.sample
      : undefined
  const playing = player.playing !== undefined && player.playing === voice?.id
  return (
    <div className="voice-picker">
      <div className="voice-title">{t('Voice')}</div>
      {note !== undefined && <div className="voice-note">{note}</div>}
      {voices.length === 0 ? (
        <div className="voice-loading" aria-label={t('Loading voices')}>
          <span className="editor-spinner" />
        </div>
      ) : (
        <div className="voice-row">
          <VoiceMenu
            voices={voices}
            chosen={current}
            editor={editor}
            pick={pick}
          />
          <button
            type="button"
            className="voice-play"
            disabled={sample === undefined}
            aria-label={
              voice
                ? playing
                  ? t`Stop ${voice.name}`
                  : t`Play ${voice.name}`
                : t('Play')
            }
            onClick={() => {
              if (!voice || !sample) return
              if (playing) player.stop()
              else player.play(sample, voice.id)
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              {playing ? (
                <rect x="1.5" y="1.5" width="9" height="9" rx="1.6" />
              ) : (
                <path d="M3 1.6v8.8c0 .7.8 1.1 1.4.7l6.6-4.4c.5-.3.5-1.1 0-1.4L4.4.9C3.8.5 3 .9 3 1.6Z" />
              )}
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The voice's field (the founder, 12 October 2026): the row's width, 30
 * high, round 10, in the popover's grey (darker under the pointer), the
 * chosen voice's name at the left and the up-down chevrons at the right. A
 * click opens the voices under it, the chosen one ticked.
 */
function VoiceMenu({
  voices,
  chosen,
  editor,
  pick,
}: {
  voices: VoiceChoice[]
  chosen?: string
  editor: AvatarEditorModel
  pick: (id: string) => void
}) {
  const name = voices.find((voice) => voice.id === chosen)?.name ?? ''
  const menu = editor.voiceMenu
  // Pressed while the list was open: the list's own dismissal (on the press) closed it, and the click doesn't open it again.
  const pressedOpen = useRef(false)
  return (
    <>
      <button
        type="button"
        className="voice-field"
        aria-label={t`Voice, ${name}`}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onPointerDown={() => {
          pressedOpen.current = editor.voiceMenu !== undefined
        }}
        onClick={(event) => {
          const wasOpen = pressedOpen.current
          pressedOpen.current = false
          if (editor.voiceMenu) {
            editor.closeVoiceMenu()
            return
          }
          if (wasOpen) return
          const rect = event.currentTarget.getBoundingClientRect()
          editor.openVoiceMenu({
            x: rect.left,
            y: rect.bottom + 4,
            width: rect.width,
          })
        }}
      >
        <span className="voice-name">{name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2.6 3.9 5 1.6l2.4 2.3M2.6 6.1 5 8.4l2.4-2.3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {menu && (
        <div
          className="voice-menu"
          style={{ ['--voice-menu-width' as string]: `${menu.width}px` }}
        >
          <ContextMenu
            items={voices.map((voice) => ({
              label: voice.name,
              checked: voice.id === chosen,
              action: () => pick(voice.id),
            }))}
            at={{ x: menu.x, y: menu.y }}
            label={t('Voice')}
            close={() => editor.closeVoiceMenu()}
          />
        </div>
      )}
    </>
  )
}

// MARK: Generate

/**
 * Generate: a 150-point field ("Describe your avatar…", 14) and Generate
 * under it (⌘Return in the field too, Control-Return elsewhere). While it
 * draws: the words on one line, a grey disc pulsing, and "Generating…".
 * Then the crop.
 */
function GenerateTab({
  model,
  store,
  close,
}: {
  model: AvatarEditorModel
  store: AppStore
  close: () => void
}) {
  if (model.candidate)
    return <CropView model={model} store={store} close={close} />
  if (model.generating)
    return (
      <div className="generate-tab">
        <div className="generate-line">
          {model.prompt.split(/\s+/).filter(Boolean).join(' ')}
        </div>
        <div
          className="generate-pulse"
          role="img"
          aria-label={t('Generating avatar')}
        />
        <EditorButton
          title={t('Generating…')}
          primary={false}
          disabled
          onClick={() => {}}
        />
      </div>
    )
  return (
    <div className="generate-tab">
      <textarea
        className="generate-field"
        value={model.prompt}
        placeholder={t('Describe your avatar…')}
        aria-label={t('Describe your avatar')}
        onChange={(event) => model.setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void model.generate(store)
          }
        }}
      />
      <EditorButton
        title={t('Generate')}
        primary
        disabled={model.prompt.trim() === ''}
        onClick={() => void model.generate(store)}
      />
    </div>
  )
}

// MARK: Upload

/**
 * Upload: a dashed drop zone ("Drag, drop, or paste an image", "or",
 * Browse files), blue while a file is over it; the browser's own file
 * chooser for Browse files, pictures only; then the crop.
 */
function UploadTab({
  model,
  store,
  close,
}: {
  model: AvatarEditorModel
  store: AppStore
  close: () => void
}) {
  const chooser = useRef<HTMLInputElement>(null)
  if (model.candidate)
    return <CropView model={model} store={store} close={close} />
  const files = (event: DragEvent) => event.dataTransfer.types.includes('Files')
  return (
    <div
      className={classes('drop-zone', model.dragOver && 'over')}
      onDragEnter={(event) => {
        if (!files(event)) return
        event.preventDefault()
        model.setDragOver(true)
      }}
      onDragOver={(event) => {
        if (!files(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        model.setDragOver(true)
      }}
      onDragLeave={(event) => {
        const into = event.relatedTarget
        if (into instanceof Node && event.currentTarget.contains(into)) return
        model.setDragOver(false)
      }}
      onDrop={(event) => {
        if (!files(event)) return
        event.preventDefault()
        model.setDragOver(false)
        const file = event.dataTransfer.files[0]
        if (file) void model.take(file, true)
      }}
    >
      <svg className="drop-edge" aria-hidden="true">
        <rect x="0.5" y="0.5" rx="9.5" ry="9.5" />
      </svg>
      <div className="drop-words">{avatarEditorWords.dropZone()}</div>
      <div className="drop-or">{t('or')}</div>
      <EditorButton
        title={avatarEditorWords.browse()}
        primary={false}
        wide={false}
        onClick={() => chooser.current?.click()}
      />
      <input
        ref={chooser}
        type="file"
        hidden
        accept={avatarEditorWords.pickerTypes
          .map((kind) => `.${kind}`)
          .join(',')}
        aria-label={avatarEditorWords.pickerTitle()}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void model.take(file, false)
        }}
      />
    </div>
  )
}

// MARK: The crop

/** One line cut in its middle when it doesn't fit (the Mac's `.middle`): a file's name and size. */
function MiddleLine({
  words,
  className,
}: {
  words: string
  className: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [shown, fit] = useState(words)
  useLayoutEffect(() => {
    const line = box.current
    const pen = line && document.createElement('canvas').getContext('2d')
    if (!line || !pen) return
    const style = getComputedStyle(line)
    pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const width = (some: string) => pen.measureText(some).width
    const measure = () => fit(middleCut(words, line.clientWidth, width))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(line)
    return () => watch.disconnect()
  }, [words])
  return (
    <div ref={box} className={className} title={words}>
      {shown}
    </div>
  )
}

/** The picture in its 96-point circle, drawn where the crop puts it; dragged, the picture follows the pointer. */
function Stage({
  model,
  candidate,
}: {
  model: AvatarEditorModel
  candidate: Candidate
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const start = useRef<{ x: number; y: number; crop: AvatarCrop }>(undefined)
  useLayoutEffect(() => {
    const element = canvas.current
    const pen = element?.getContext('2d')
    if (!element || !pen) return
    const scale = window.devicePixelRatio || 1
    const side = Math.round(AvatarCrop.stage * scale)
    if (element.width !== side) {
      element.width = side
      element.height = side
    }
    pen.clearRect(0, 0, side, side)
    pen.imageSmoothingEnabled = true
    pen.imageSmoothingQuality = 'high'
    const place = candidate.crop.placement
    pen.drawImage(
      candidate.image,
      place.x * scale,
      place.y * scale,
      place.width * scale,
      place.height * scale,
    )
  }, [candidate])
  return (
    <div
      className="crop-stage"
      role="img"
      aria-label={t('Drag to reposition')}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = {
          x: event.clientX,
          y: event.clientY,
          crop: candidate.crop,
        }
      }}
      onPointerMove={(event) => {
        const from = start.current
        if (!from) return
        model.setCrop(
          from.crop.panned(event.clientX - from.x, event.clientY - from.y),
        )
      }}
      onPointerUp={() => {
        start.current = undefined
      }}
      onPointerCancel={() => {
        start.current = undefined
      }}
    >
      <canvas ref={canvas} />
    </div>
  )
}

/**
 * The crop (Upload and Generate): the picture in a 96-point circle that
 * drags it, the file's name and size and "Drag to reposition", the zoom (−,
 * the Mac's slider from 1 to 5, +; a step is 0.5), then Restart and Set
 * avatar.
 */
function CropView({
  model,
  store,
  close,
}: {
  model: AvatarEditorModel
  store: AppStore
  close: () => void
}) {
  const candidate = model.candidate
  if (!candidate) return null
  const crop = candidate.crop
  const filled =
    ((AvatarCrop.clampZoom(crop.zoom) - AvatarCrop.minZoom) /
      (AvatarCrop.maxZoom - AvatarCrop.minZoom)) *
    100
  return (
    <div className="crop-view">
      <Stage model={model} candidate={candidate} />
      <div className="crop-lines">
        {candidate.fileLine !== undefined && (
          <MiddleLine words={candidate.fileLine} className="crop-file" />
        )}
        <div className="crop-hint">{t('Drag to reposition')}</div>
      </div>
      <div className="crop-zoom">
        <ZoomStep
          label={t('Zoom out')}
          minus
          step={() =>
            model.setCrop(crop.zoomed(crop.zoom - AvatarCrop.zoomStep))
          }
        />
        <input
          type="range"
          className="crop-slider"
          min={AvatarCrop.minZoom}
          max={AvatarCrop.maxZoom}
          step="any"
          value={crop.zoom}
          aria-label={t('Zoom')}
          style={{ ['--filled' as string]: `${filled}%` }}
          onChange={(event) =>
            model.setCrop(crop.zoomed(Number(event.target.value)))
          }
        />
        <ZoomStep
          label={t('Zoom in')}
          minus={false}
          step={() =>
            model.setCrop(crop.zoomed(crop.zoom + AvatarCrop.zoomStep))
          }
        />
      </div>
      <div className="crop-buttons">
        <EditorButton
          title={t('Restart')}
          primary={false}
          disabled={model.saving}
          onClick={() => model.restart()}
        />
        <EditorButton
          title={model.saving ? t('Saving…') : t('Set avatar')}
          primary
          disabled={model.saving}
          onClick={() => void model.setPicture(store, close)}
        />
      </div>
    </div>
  )
}

/** − and + (12, in a 20 square, round 8, the grey under the pointer). */
function ZoomStep({
  label,
  minus,
  step,
}: {
  label: string
  minus: boolean
  step: () => void
}) {
  return (
    <button
      type="button"
      className="zoom-step"
      aria-label={label}
      onClick={step}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={minus ? 'M2.2 6h7.6' : 'M2.2 6h7.6M6 2.2v7.6'}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
