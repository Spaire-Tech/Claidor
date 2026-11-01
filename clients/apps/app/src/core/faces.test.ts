// The faces as the core's tests have them (`testWhatAnAgentsCircleShows` in
// AgentFaceTests.swift), the group's layout (`testGroupLayoutIsTheWindows`),
// and the hash that gives the same id the same face on every device.

import { describe, expect, it } from 'vitest'
import {
  faceById,
  facePool,
  faces,
  faceURL,
  groupSlots,
  pictureOf,
  pictureURL,
  simeonFaceId,
  stableHash,
  standForId,
} from './faces'
import { makeAgent } from './models'

describe('the faces', () => {
  it('are the core’s catalogue, each with its picture', () => {
    expect(faces.length).toBe(31)
    expect(facePool.some((face) => face.id === simeonFaceId)).toBe(false)
    for (const face of faces) expect(faceURL(face), face.id).toBeTruthy()
  })

  it('hash an id as the voices do (FNV-1a over UTF-16), so every device agrees', () => {
    // Worked out apart, in Python.
    expect(stableHash('maya')).toBe(3_379_142_309)
    expect(stableHash('alex-1')).toBe(55_939_499)
    expect(stableHash('théo')).toBe(3_303_964_293)
    expect(standForId('d')).toBe(facePool[3_775_669_363 % facePool.length])
  })
})

describe('what an agent’s circle shows', () => {
  const women = faces.filter(
    (face) => face.gender === 'female' && face.id !== simeonFaceId,
  )
  const face = women[4]!

  it('is the face it wears, its own picture, the face it was given, or one its id picks', () => {
    expect(
      pictureOf(
        makeAgent({ id: 'a', name: 'Maya', avatarVersion: face.version }),
      ),
    ).toEqual({ kind: 'face', face })
    expect(
      pictureOf(
        makeAgent({
          id: 'b',
          name: 'Maya',
          avatarShape: face.id,
          avatarDataURL: 'data:image/png;base64,iVBORw0KGgo=',
        }),
      ),
    ).toEqual({ kind: 'own', dataURL: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(
      pictureOf(makeAgent({ id: 'c', name: 'Maya', avatarShape: face.id })),
    ).toEqual({ kind: 'face', face })
    expect(pictureOf(makeAgent({ id: 'd', name: 'Maya' }))).toEqual({
      kind: 'face',
      face: standForId('d'),
    })
    // A face shown is drawn from the app's copy even when the roster carries its bytes too.
    expect(
      pictureOf(
        makeAgent({
          id: 'e',
          name: 'Maya',
          avatarVersion: face.version,
          avatarDataURL: 'data:image/webp;base64,UklGRg==',
        }),
      ),
    ).toEqual({ kind: 'face', face })
  })

  it('is a group’s own picture only', () => {
    expect(
      pictureURL(
        makeAgent({
          id: 'g',
          name: 'Team',
          isGroup: true,
          memberIds: ['a', 'b'],
        }),
      ),
    ).toBeUndefined()
    expect(
      pictureURL(
        makeAgent({
          id: 'g',
          name: 'Team',
          isGroup: true,
          avatarDataURL: 'data:image/png;base64,AA',
        }),
      ),
    ).toBe('data:image/png;base64,AA')
    expect(
      pictureURL(
        makeAgent({ id: 's', name: 'Simeon', avatarShape: simeonFaceId }),
      ),
    ).toBe(faceURL(faceById(simeonFaceId)!))
  })
})

describe('a group’s members drawn together', () => {
  it('are laid out as the window lays them', () => {
    const three = groupSlots(3, 36)
    expect(three.map((slot) => slot.size)).toEqual([20, 20, 20])
    expect(three[0]!.x).toBeCloseTo(8, 9)
    expect(three[2]!.y).toBeCloseTo(16, 9)
    expect(groupSlots(2, 36)[1]!.x).toBeCloseTo(12, 9)
  })
})
