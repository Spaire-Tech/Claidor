// The avatar editor's crop and words as the core's tests have them
// (`testCrop` in RoutineTriggerTests.swift, `testAvatarEditorWords` in
// RoutineEditingTests.swift).

import { describe, expect, it } from 'vitest'
import { AvatarCrop, avatarEditorWords } from './avatarCrop'
import { facePool } from './faces'
import { makeAgent } from './models'

describe('the crop', () => {
  it('pans, zooms and stays inside the picture', () => {
    let crop = new AvatarCrop(200, 100)
    expect(crop.side).toBe(100)
    crop = crop.panned(10, 30)
    expect(crop.centerX).toBeCloseTo(100 - 10 / 0.96, 9)
    expect(crop.centerY).toBe(50)
    crop = crop.zoomed(9)
    expect(crop.zoom).toBe(5)
    expect(crop.side).toBe(20)
    crop = crop.panned(-1000, -1000)
    expect(crop.centerX).toBe(190)
    expect(crop.centerY).toBe(90)
    expect(crop.rect.x).toBe(180)
    expect(AvatarCrop.zoomStep).toBe(0.5)
    expect(AvatarCrop.fitted(4000, 2000)).toEqual({ width: 1024, height: 512 })
    expect(AvatarCrop.sizeProblem(26 * 1024 * 1024)).toBe(
      'Choose an image smaller than 25 MB.',
    )
    expect(AvatarCrop.sizeProblem(25 * 1024 * 1024)).toBeUndefined()
  })
})

describe('the editor’s words', () => {
  it('are the shipped window’s, Reset only while another face or a picture is worn', () => {
    expect([
      avatarEditorWords.faces(),
      avatarEditorWords.generate(),
      avatarEditorWords.upload(),
    ]).toEqual(['Faces', 'Generate', 'Upload'])
    const face = facePool[3]!
    let agent = makeAgent({
      id: 'a1',
      name: 'Maya',
      avatarShape: face.id,
      avatarVersion: face.version,
    })
    // Wearing the face it was given: nothing to reset.
    expect(avatarEditorWords.reset(agent)).toBeUndefined()
    agent = { ...agent, avatarVersion: facePool[4]!.version }
    expect(avatarEditorWords.reset(agent)).toBe('Reset face')
    agent = {
      ...agent,
      avatarVersion: '0123456789abcdef',
      avatarDataURL: 'data:image/png;base64,AA',
    }
    expect(avatarEditorWords.reset(agent)).toBe('Reset face')
    expect(
      avatarEditorWords.reset(
        makeAgent({ id: 'g', name: 'Team', isGroup: true }),
      ),
    ).toBeUndefined()
    expect(avatarEditorWords.gender(agent)).toBe(face.gender)
    expect(avatarEditorWords.gender(makeAgent({ id: 'l', name: 'Leo' }))).toBe(
      'male',
    )
  })
})
