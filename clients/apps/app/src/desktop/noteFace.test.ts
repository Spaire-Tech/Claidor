// The faces Windows' notifications show (noteFace.ts): drawn once per
// picture, given at once after that, a notification never held long.

import { describe, expect, it } from 'vitest'
import { faceById, pictureURL } from '../core/faces'
import { makeAgent } from '../core/models'
import { NoteFaces } from './noteFace'

const iris = makeAgent({ id: 'iris', name: 'Iris', avatarShape: 'clay-07' })

describe('a notification’s face (NoteFaces)', () => {
  it('draws a face once, over its backdrop, then gives it at once', async () => {
    const drawn: { url: string; backdrop?: string }[] = []
    const faces = new NoteFaces(
      async (url, backdrop) => {
        drawn.push({ url, backdrop })
        return 'data:image/png;base64,AAAA'
      },
      1_000,
      () => true,
    )
    const first = faces.face(iris)
    expect(first).toBeInstanceOf(Promise)
    expect(await first).toBe('data:image/png;base64,AAAA')
    expect(faces.face(iris)).toBe('data:image/png;base64,AAAA')
    expect(drawn).toEqual([
      { url: pictureURL(iris), backdrop: faceById('clay-07')?.backdrop },
    ])
  })

  it('goes without one that cannot be drawn, and does not try it again', async () => {
    let tries = 0
    const faces = new NoteFaces(
      async () => {
        tries += 1
        throw new Error('broken picture')
      },
      1_000,
      () => true,
    )
    expect(await faces.face(iris)).toBeUndefined()
    expect(faces.face(iris)).toBeUndefined()
    expect(tries).toBe(1)
  })

  it('never holds a notification longer than its wait', async () => {
    const faces = new NoteFaces(
      () => new Promise<string | undefined>(() => {}),
      10,
      () => true,
    )
    expect(await faces.face(iris)).toBeUndefined()
  })

  it('draws nothing where nothing can draw, or for no agent', () => {
    const faces = new NoteFaces(
      async () => 'data:image/png;base64,AAAA',
      1_000,
      () => false,
    )
    expect(faces.face(iris)).toBeUndefined()
    expect(
      new NoteFaces(undefined, 1_000, () => true).face(undefined),
    ).toBeUndefined()
  })
})
