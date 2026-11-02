// Dictation's rules (mac/Simeon/Dictation.swift): the lines for a refused or
// missing microphone and a failed transcription, the space before what was
// said, and the meter's level.

import { afterEach, describe, expect, it } from 'vitest'
import { NetworkError } from '../core/http'
import { setWords } from '../core/words'
import {
  levelOf,
  microphoneMessage,
  spacedDictation,
  transcriptionMessage,
} from './Dictation'

afterEach(() => setWords('en', {}))

const named = (name: string) => Object.assign(new Error(name), { name })

describe('dictation', () => {
  it('says why the microphone could not be used, in the window’s words', () => {
    expect(microphoneMessage(named('NotAllowedError'))).toBe(
      'Microphone access denied. Please enable microphone permissions in your system settings.',
    )
    expect(microphoneMessage(named('NotFoundError'))).toBe(
      'No microphone found. Please connect a microphone and try again.',
    )
    expect(microphoneMessage(named('NotReadableError'))).toBe(
      'An error occurred with voice input. Please try again.',
    )
  })

  it('says when the transcription could not be reached, and any other failure', () => {
    expect(
      transcriptionMessage(new NetworkError('offline', 'unreachable')),
    ).toBe('Network connection failed. Please check your internet connection.')
    expect(transcriptionMessage(new NetworkError('slow', 'timedOut'))).toBe(
      'Network connection failed. Please check your internet connection.',
    )
    expect(transcriptionMessage(new Error('500'))).toBe(
      'An error occurred with voice input. Please try again.',
    )
  })

  it('puts a space before what was said when the word before runs on', () => {
    expect(spacedDictation('Book', 'a table')).toBe(' a table')
    expect(spacedDictation('Book ', 'a table')).toBe('a table')
    expect(spacedDictation('', 'Book a table')).toBe('Book a table')
    expect(spacedDictation('Line\n', 'next')).toBe('next')
    expect(spacedDictation('Book', ' a table')).toBe(' a table')
  })

  it('reads the meter as the Mac does: -50 dB silent, 0 dB full', () => {
    expect(levelOf(new Float32Array(64))).toBe(0)
    expect(levelOf(new Float32Array(64).fill(1))).toBe(1)
    // A tenth of full scale is -20 dB: 0.6.
    expect(levelOf(new Float32Array(64).fill(0.1))).toBeCloseTo(0.6, 5)
  })

  it('in French', () => {
    setWords('fr', {
      mac: {
        'No microphone found. Please connect a microphone and try again.':
          'Aucun micro trouvé. Branche un micro et réessaie.',
      },
    })
    expect(microphoneMessage(named('NotFoundError'))).toBe(
      'Aucun micro trouvé. Branche un micro et réessaie.',
    )
  })
})
