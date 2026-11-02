// The avatar editor's crop and its words (ios/SimeonCore/Sources/SimeonCore/
// AvatarCrop.swift), as the shipped window does them (`xct`, `Jne`, `Nct`,
// `Ele` and the stage's pan): a square of the picture, as big as its shorter
// side over the zoom, kept inside the picture, drawn in a 96-point circle and
// saved as a 256-pixel PNG.

import type { AgentDraft } from './agentDraft'
import { genderFor, givenFace, ownFace, wornFace } from './faces'
import { t } from './l10n'
import type { Agent } from './models'

/** The window's clamp (`bbe`): a range upside down gives its low end. */
function clamp(value: number, low: number, high: number): number {
  return high < low ? low : Math.min(high, Math.max(low, value))
}

export class AvatarCrop {
  /** The circle on screen (`dhe`). */
  static readonly stage = 96
  /** The saved picture's side (`nR`). */
  static readonly output = 256
  /** A picture longer than this on its longest side is drawn down to it first (`BUe`). */
  static readonly longestSource = 1024
  /** The zoom's range and its button step: (5 − 1) / 8 (`tZ`, `Soe`). */
  static readonly minZoom = 1
  static readonly maxZoom = 5
  static readonly zoomStep = (AvatarCrop.maxZoom - AvatarCrop.minZoom) / 8
  /** The biggest file taken by a drop (`Tln`). */
  static readonly maxBytes = 25 * 1024 * 1024

  readonly zoom: number
  readonly centerX: number
  readonly centerY: number

  /** A new picture of this size (in its pixels): zoom 1, centred (`Ele`). */
  constructor(
    readonly width: number,
    readonly height: number,
    at?: { zoom: number; centerX: number; centerY: number },
  ) {
    this.zoom = at?.zoom ?? AvatarCrop.minZoom
    this.centerX = at?.centerX ?? width / 2
    this.centerY = at?.centerY ?? height / 2
  }

  static clampZoom(value: number): number {
    return Number.isFinite(value)
      ? clamp(value, AvatarCrop.minZoom, AvatarCrop.maxZoom)
      : AvatarCrop.minZoom
  }

  /** The crop's side, in the picture's pixels (`xct`). */
  get side(): number {
    return Math.min(this.width, this.height) / AvatarCrop.clampZoom(this.zoom)
  }

  /** The centre kept so the crop stays inside the picture (`Jne`). */
  get clampedCenter(): { x: number; y: number } {
    const half = this.side / 2
    return {
      x: clamp(this.centerX, half, this.width - half),
      y: clamp(this.centerY, half, this.height - half),
    }
  }

  /** The part of the picture saved (`Nct`). */
  get rect(): { x: number; y: number; width: number; height: number } {
    const c = this.clampedCenter
    const side = this.side
    return { x: c.x - side / 2, y: c.y - side / 2, width: side, height: side }
  }

  /** Points on the stage per pixel of the picture. */
  get scale(): number {
    return (
      (AvatarCrop.stage / Math.min(this.width, this.height)) *
      AvatarCrop.clampZoom(this.zoom)
    )
  }

  /** Dragged by `dx`, `dy` points on the stage: the picture follows the pointer. */
  panned(dx: number, dy: number): AvatarCrop {
    const moved = new AvatarCrop(this.width, this.height, {
      zoom: this.zoom,
      centerX: this.centerX - dx / this.scale,
      centerY: this.centerY - dy / this.scale,
    })
    const c = moved.clampedCenter
    return new AvatarCrop(this.width, this.height, {
      zoom: this.zoom,
      centerX: c.x,
      centerY: c.y,
    })
  }

  /** At another zoom, the centre kept where it can be. */
  zoomed(value: number): AvatarCrop {
    const zoom = AvatarCrop.clampZoom(value)
    const c = new AvatarCrop(this.width, this.height, {
      zoom,
      centerX: this.centerX,
      centerY: this.centerY,
    }).clampedCenter
    return new AvatarCrop(this.width, this.height, {
      zoom,
      centerX: c.x,
      centerY: c.y,
    })
  }

  /** Where the whole picture sits on the stage: its size and its top-left corner, in points. */
  get placement(): { x: number; y: number; width: number; height: number } {
    const c = this.clampedCenter
    const k = this.scale
    return {
      x: AvatarCrop.stage / 2 - c.x * k,
      y: AvatarCrop.stage / 2 - c.y * k,
      width: this.width * k,
      height: this.height * k,
    }
  }

  /** The size a picture is drawn down to before it is cropped: its longest side at most 1024 (`Amt`). */
  static fitted(
    width: number,
    height: number,
  ): { width: number; height: number } {
    const longest = Math.max(width, height)
    if (!(longest > AvatarCrop.longestSource))
      return { width: Math.trunc(width), height: Math.trunc(height) }
    const k = AvatarCrop.longestSource / longest
    return {
      width: Math.max(1, Math.round(width * k)),
      height: Math.max(1, Math.round(height * k)),
    }
  }

  /** "Choose an image smaller than 25 MB." for a file over the limit (`Sln`). */
  static sizeProblem(bytes: number): string | undefined {
    return bytes > AvatarCrop.maxBytes
      ? t('Choose an image smaller than 25 MB.')
      : undefined
  }
}

/** The avatar editor's words, as shipped (`AvatarEditorWords`), in the app's language when asked. */
export const avatarEditorWords = {
  dropZone: () => t('Drag, drop, or paste an image'),
  browse: () => t('Browse files'),
  pickerTitle: () => t('Choose an avatar image'),
  /** The kinds of picture Browse files offers. */
  pickerTypes: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] as const,
  notAnImage: () => t('Selected file is not a valid image.'),
  unreadable: () => t('That file could not be read.'),
  unloadable: () => t('That image could not be loaded.'),
  exportFailed: () => t('Could not export the avatar.'),
  pastedName: () => t('Pasted image'),
  voicesUnavailable: () => t('Voices aren’t available right now.'),
  voiceNotSaved: () => t('Couldn’t save the voice.'),
  generationEmpty: () => t('Image generation returned no picture.'),
  /** The editor's tabs since faces (12 October 2026). */
  faces: () => t('Faces'),
  generate: () => t('Generate'),
  upload: () => t('Upload'),
  /** The Faces tab's gender switch and Shuffle. */
  woman: () => t('Woman'),
  man: () => t('Man'),
  shuffle: () => t('Shuffle'),

  /**
   * The Reset beside the editor's tabs: back to the face the agent was
   * given, shown only while it wears something else (another face, or a
   * picture of its own). A group has no face, and no Reset.
   */
  reset(agent: Agent): string | undefined {
    if (agent.isGroup) return undefined
    const worn = wornFace(agent)
    if (worn && worn.id === givenFace(agent)?.id) return undefined
    return t('Reset face')
  },

  /** A new agent's Reset (New Agent's editor): shown once a face or a picture was chosen. */
  resetDraft(draft: AgentDraft): string | undefined {
    return draft.resettable ? t('Reset face') : undefined
  },

  /** The gender the Faces tab opens on: the face the agent wears or was given, else the one it would be given. */
  gender(agent: Agent): string {
    return ownFace(agent)?.gender ?? genderFor(agent)
  },
}
