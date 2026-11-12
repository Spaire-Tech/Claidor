// A notification's picture on Windows: the agent's face, big, where the
// iPhone and the Mac show it (NotificationService.swift, MacServices.swift's
// `AgentMessage`), with Simeon's icon and name small in the toast's head,
// which Windows draws itself. The page has the faces, so it draws the face
// round as a PNG (a toast takes a picture, not one of the page's addresses)
// and the app shows it (windows/src/main/parts/surfaces.ts).

import { pictureOf, pictureURL } from '../core/faces'
import type { Agent } from '../core/models'

/** Windows shows the toast's picture at 48 points: drawn at 96 for screens at twice the density. */
export const noteFaceSize = 96

/** The picture drawn round over its backdrop, a PNG data URL; undefined where nothing can draw (the tests) or the picture cannot be read. */
export async function roundFace(
  url: string,
  backdrop?: string,
  size = noteFaceSize,
): Promise<string | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined')
    return undefined
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    return undefined
  }
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  if (side <= 0) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  context.clip()
  if (backdrop) {
    context.fillStyle = backdrop
    context.fillRect(0, 0, size, size)
  }
  context.imageSmoothingQuality = 'high'
  // The middle square, as the avatars everywhere else crop.
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  )
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/** How long a notification waits for its face before it goes without one. */
const faceWaitMs = 1_500

/**
 * The faces drawn so far, by picture: one drawn before is given at once, a
 * new one once drawn (or without one after a moment and a half), and one
 * that cannot be drawn is not tried again.
 */
export class NoteFaces {
  private readonly drawn = new Map<string, string | null>()
  private readonly drawing = new Map<string, Promise<string | undefined>>()

  constructor(
    private readonly draw: (
      url: string,
      backdrop?: string,
    ) => Promise<string | undefined> = roundFace,
    private readonly waitMs = faceWaitMs,
    private readonly canDraw = () => typeof document !== 'undefined',
  ) {}

  /** The agent's face for a notification: a PNG data URL now, later, or none. */
  face(
    agent: Agent | undefined,
  ): string | undefined | Promise<string | undefined> {
    if (!agent || !this.canDraw()) return undefined
    const url = pictureURL(agent)
    if (!url) return undefined
    const known = this.drawn.get(url)
    if (known !== undefined) return known ?? undefined
    const source = agent.isGroup ? undefined : pictureOf(agent)
    const backdrop = source?.kind === 'face' ? source.face.backdrop : undefined
    let drawing = this.drawing.get(url)
    if (!drawing) {
      drawing = this.draw(url, backdrop)
        .catch(() => undefined)
        .then((png) => {
          // Many agents, few faces; an agent's own picture changes rarely.
          if (this.drawn.size > 200) this.drawn.clear()
          this.drawn.set(url, png ?? null)
          this.drawing.delete(url)
          return png
        })
      this.drawing.set(url, drawing)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), this.waitMs)
    })
    return Promise.race([drawing, late]).finally(() => clearTimeout(timer))
  }
}
