/**
 * PowerPoint: take the banker to the shape the finding is about.
 *
 * The host where the panel earns its place. A findings list in a web page
 * is a to-do list; the same list beside the slide, jumping to the number
 * as you click it, is the product.
 *
 * **On matching shapes, and being honest about it.** The server reads the
 * deck with `python-pptx`, which gives `shape_id` — the integer in
 * `<p:cNvPr id="..."/>` — and `name`, the string beside it. The JavaScript
 * API gives `Shape.id` and `Shape.name`. Only one of those two pairs is
 * documented to be the same thing on both sides: **the name**. `Shape.id`
 * is described as opaque, and while it often carries the same integer, a
 * jump that lands on the wrong shape is worse than one that does not move,
 * so the name is tried first and the id is a fallback.
 *
 * If both miss, the slide is still worth reaching. « The right slide » is
 * a useful answer; « somewhere on some slide » is not, which is why every
 * outcome comes back saying how it got there.
 */

import { filenameFromUrl, readStamp, writeStamp } from './settings'
import type { Anchor, GoToResult, HostBridge, OpenDocument } from './types'

/** Not every desktop build has the newer selection APIs. */
function supports(set: string): boolean {
  return Boolean(
    Office.context?.requirements?.isSetSupported('PowerPointApi', set),
  )
}

async function currentSlide(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result) => {
          if (result.status !== Office.AsyncResultStatus.Succeeded)
            return resolve(null)
          const slides = (result.value as { slides?: { index?: number }[] })
            ?.slides
          resolve(slides?.[0]?.index ?? null)
        },
      )
    } catch {
      resolve(null)
    }
  })
}

/**
 * Select a slide, and the shape on it when the anchor names one.
 *
 * `setSelectedSlides` and `setSelectedShapes` arrived in PowerPointApi 1.5.
 * Below that there is still `goToByIdAsync`, which moves the view to a
 * slide without selecting anything — less, and enough.
 */
async function select(page: number, anchor: Anchor): Promise<GoToResult> {
  if (!supports('1.3')) {
    return goToSlideOnly(page)
  }

  return PowerPoint.run(async (context) => {
    const slides = context.presentation.slides
    slides.load('items/id')
    await context.sync()

    const slide = slides.items[page - 1]
    if (!slide) {
      return {
        moved: false,
        by: 'none',
        reason: `this deck has no slide ${page}`,
      }
    }

    if (supports('1.5')) {
      context.presentation.setSelectedSlides([slide.id])
      await context.sync()
    }

    const wanted = anchor.shape_name
    const fallbackId =
      anchor.shape_id === undefined ? null : String(anchor.shape_id)
    if (!wanted && !fallbackId) {
      await context.sync()
      return { moved: true, by: 'slide' }
    }

    const shapes = slide.shapes
    shapes.load('items/id,items/name')
    await context.sync()

    // Name first: it is the one field both readers are documented to see
    // the same way. The id is tried after, and only after.
    const found =
      shapes.items.find((shape) => wanted && shape.name === wanted) ??
      shapes.items.find((shape) => fallbackId && shape.id === fallbackId)

    if (!found) {
      // The shape is gone — renamed, deleted, or on a slide that was
      // rebuilt since the deck was uploaded. The slide is still right.
      return {
        moved: true,
        by: 'slide',
        reason: 'that shape is no longer on this slide',
      }
    }

    if (!supports('1.5')) return { moved: true, by: 'slide' }

    // A sentence carries the offsets of the figure inside it, so the
    // selection can be the number rather than the paragraph around it.
    // « $48.9mm » highlighted is an answer; a whole text box highlighted
    // is a place to start looking.
    if (
      anchor.kind === 'text' &&
      anchor.start !== undefined &&
      anchor.end !== undefined
    ) {
      const exact = await selectSubstring(
        context,
        found,
        anchor.start,
        anchor.end,
      )
      if (exact) return { moved: true, by: 'text' }
    }

    slide.setSelectedShapes([found.id])
    await context.sync()
    return { moved: true, by: 'shape' }
  }).catch((error: unknown) => ({
    moved: false,
    by: 'none',
    reason:
      error instanceof Error ? error.message : 'PowerPoint refused the request',
  }))
}

/**
 * Select the exact characters of the figure inside a text shape.
 *
 * The offsets the server recorded are into the *stripped* paragraph text,
 * and the shape's text range is the whole frame with its paragraphs joined
 * — so this is a best effort, checked before it is used: the substring it
 * would select is compared against nothing, but its bounds are, and an
 * out-of-range request is abandoned rather than clamped. Selecting the
 * wrong characters is worse than selecting the shape.
 *
 * Returns false whenever it cannot be sure, and the caller falls back.
 */
async function selectSubstring(
  context: PowerPoint.RequestContext,
  shape: PowerPoint.Shape,
  start: number,
  end: number,
): Promise<boolean> {
  if (!supports('1.4') || end <= start) return false
  try {
    const frame = shape.textFrame
    const range = frame.textRange
    range.load('text')
    await context.sync()

    const text = range.text ?? ''
    // The frame's text includes leading whitespace the reader stripped,
    // so find where the paragraph actually begins before applying the
    // offsets. If it cannot be found, do not guess.
    const offset = text.length - text.trimStart().length
    if (offset + end > text.length) return false

    range.getSubstring(offset + start, end - start).setSelected()
    await context.sync()
    return true
  } catch {
    // A shape with no text frame, or a build without the API. The caller
    // selects the shape instead, which is still the right shape.
    return false
  }
}

function goToSlideOnly(page: number): Promise<GoToResult> {
  return new Promise((resolve) => {
    Office.context.document.goToByIdAsync(
      page,
      Office.GoToType.Index,
      (result) => {
        resolve(
          result.status === Office.AsyncResultStatus.Succeeded
            ? { moved: true, by: 'slide' }
            : {
                moved: false,
                by: 'none',
                reason:
                  'this version of PowerPoint cannot be moved from a task pane',
              },
        )
      },
    )
  })
}

export const powerpoint: HostBridge = {
  host: 'powerpoint',

  async read(): Promise<OpenDocument> {
    return {
      host: 'powerpoint',
      filename: filenameFromUrl(),
      lineageId: readStamp(),
      currentPage: await currentSlide(),
    }
  },

  stamp: writeStamp,

  async goTo(anchor: Anchor, page?: number): Promise<GoToResult> {
    if (!page) {
      return { moved: false, by: 'none', reason: 'this finding names no slide' }
    }
    return select(page, anchor)
  },
}
