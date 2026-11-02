// A pick from a composer list, where it sits in the words, and the message
// as the window's composer sends it (SimeonCore's ComposerDocument.swift):
// the words (`prompt`) and the editor's document (`richText`). "@Nora" for
// an agent, "@Weekly report" for a skill or routine, "#12" for a pull
// request. The window's editor holds these as single pieces (nodes); here,
// as on the iPhone, they are the words' own, kept track of while the words
// change. Places are UTF-16 offsets, as the browser's field counts them.

import { richDocument } from './chat'
import { int, isObject, str } from './json'

export type ChipNode =
  /** An agent, a group or "everyone" (`mention`). */
  | { kind: 'mention'; id: string; label: string }
  /** A skill, a routine or a connector (`workflowReference`). */
  | {
      kind: 'workflow'
      id: string
      label: string
      iconId?: string
      iconURL?: string
    }
  /** A pull request (`prReference`). */
  | { kind: 'pullRequest'; number: number; title?: string; url?: string }

export interface ComposerChip {
  /** Where its first character is. */
  start: number
  node: ChipNode
}

/** Its words in the message ("@Nora", "#12"), as the window writes them in the plain text. */
export function chipText(node: ChipNode): string {
  return node.kind === 'pullRequest' ? `#${node.number}` : `@${node.label}`
}

export function chipEnd(chip: ComposerChip): number {
  return chip.start + chipText(chip.node).length
}

/**
 * The picks still whole once the words went from `old` to `next`: those
 * before the change stay, those after it move with it, one the change
 * touched is gone (as a node deleted or split).
 */
export function carry(
  chips: readonly ComposerChip[],
  old: string,
  next: string,
): ComposerChip[] {
  if (old === next) return [...chips]
  let prefix = 0
  while (
    prefix < old.length &&
    prefix < next.length &&
    old[prefix] === next[prefix]
  )
    prefix += 1
  let suffix = 0
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1
  const changedEnd = old.length - suffix
  const delta = next.length - old.length
  return chips
    .map((chip): ComposerChip | undefined => {
      if (chipEnd(chip) <= prefix) return chip
      if (chip.start >= changedEnd)
        return { ...chip, start: chip.start + delta }
      return undefined
    })
    .filter(
      (chip): chip is ComposerChip =>
        chip != null &&
        chip.start >= 0 &&
        chipEnd(chip) <= next.length &&
        next.slice(chip.start, chipEnd(chip)) === chipText(chip.node),
    )
}

/** Where the words after the last pick begin (the window's text before the caret): a list opens only in them. */
export function textStart(
  chips: readonly ComposerChip[],
  draft: string,
): number {
  return Math.max(0, ...chips.map(chipEnd).filter((end) => end <= draft.length))
}

/** The words with the trigger and what was typed after it (`from` to the end) swapped for the pick and a space. */
export function picking(
  node: ChipNode,
  from: number,
  draft: string,
  chips: readonly ComposerChip[],
): { draft: string; chips: ComposerChip[] } {
  return pickingBetween(node, from, draft.length, draft, chips)
}

/**
 * The same with the words after the caret kept (the Mac's field, whose
 * caret may be anywhere): `from` to `to` swapped for the pick and a space,
 * the picks after it moved along.
 */
export function pickingBetween(
  node: ChipNode,
  from: number,
  to: number,
  draft: string,
  chips: readonly ComposerChip[],
): { draft: string; chips: ComposerChip[] } {
  const head = draft.slice(0, Math.min(from, draft.length))
  const chip: ComposerChip = { start: head.length, node }
  const piece = `${chipText(node)} `
  const delta = piece.length - (to - head.length)
  return {
    draft: head + piece + draft.slice(to),
    chips: [
      ...chips.filter((one) => chipEnd(one) <= head.length),
      chip,
      ...chips
        .filter((one) => one.start >= to)
        .map((one) => ({ ...one, start: one.start + delta })),
    ],
  }
}

/** The message's words as sent: the draft, trimmed (`prompt`). */
export function prompt(draft: string): string {
  return draft.trim()
}

type DocJSON = { [key: string]: unknown }

function nodeJSON(node: ChipNode): DocJSON {
  switch (node.kind) {
    case 'mention':
      return {
        type: 'mention',
        attrs: { id: node.id, label: node.label, mentionSuggestionChar: '@' },
      }
    case 'workflow':
      return {
        type: 'workflowReference',
        attrs: {
          id: node.id,
          label: node.label,
          iconId: node.iconId ?? null,
          iconUrl: node.iconURL ?? null,
        },
      }
    case 'pullRequest':
      return {
        type: 'prReference',
        attrs: {
          prNumber: node.number,
          title: node.title ?? null,
          url: node.url ?? null,
        },
      }
  }
}

/**
 * The editor's document for the draft (`JSON.stringify(editor.getJSON())`):
 * one paragraph, a line break a `hardBreak`, each pick its node; none for
 * empty words.
 */
export function richText(
  draft: string,
  chips: readonly ComposerChip[],
): string | undefined {
  if (draft === '') return undefined
  const content: DocJSON[] = []
  const addText = (words: string) => {
    words.split('\n').forEach((line, index) => {
      if (index > 0) content.push({ type: 'hardBreak' })
      if (line !== '') content.push({ type: 'text', text: line })
    })
  }
  let cursor = 0
  for (const chip of [...chips].sort((a, b) => a.start - b.start)) {
    if (chip.start < cursor || chipEnd(chip) > draft.length) continue
    addText(draft.slice(cursor, chip.start))
    content.push(nodeJSON(chip.node))
    cursor = chipEnd(chip)
  }
  addText(draft.slice(cursor))
  const paragraph =
    content.length === 0
      ? { type: 'paragraph' }
      : { type: 'paragraph', content }
  return JSON.stringify({ type: 'doc', content: [paragraph] })
}

/** A sent message's document read back into words and picks (a canceled message going back to the composer). */
export function draftFrom(
  rich: string | undefined,
): { draft: string; chips: ComposerChip[] } | undefined {
  const doc = richDocument(rich)
  if (!doc) return undefined
  let draft = ''
  const chips: ComposerChip[] = []
  const blocks = Array.isArray(doc.content) ? doc.content : []
  blocks.forEach((block, index) => {
    if (index > 0) draft += '\n\n'
    const pieces =
      isObject(block) && Array.isArray(block.content) ? block.content : []
    for (const piece of pieces) {
      if (!isObject(piece)) continue
      const attrs = isObject(piece.attrs) ? piece.attrs : {}
      let node: ChipNode | undefined
      switch (piece.type) {
        case 'text':
          draft += str(piece.text) ?? ''
          break
        case 'hardBreak':
          draft += '\n'
          break
        case 'mention': {
          const id = str(attrs.id)
          if (id != null)
            node = { kind: 'mention', id, label: str(attrs.label) ?? id }
          break
        }
        case 'workflowReference': {
          const id = str(attrs.id)
          if (id != null)
            node = {
              kind: 'workflow',
              id,
              label: str(attrs.label) ?? '',
              iconId: str(attrs.iconId),
              iconURL: str(attrs.iconUrl),
            }
          break
        }
        case 'prReference': {
          const number = int(attrs.prNumber)
          if (number != null)
            node = {
              kind: 'pullRequest',
              number,
              title: str(attrs.title),
              url: str(attrs.url),
            }
          break
        }
      }
      if (node) {
        chips.push({ start: draft.length, node })
        draft += chipText(node)
      }
    }
  })
  return { draft, chips }
}
