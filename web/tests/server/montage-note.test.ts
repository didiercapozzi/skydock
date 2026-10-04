// @vitest-environment node
import { i18n } from '@lingui/core'
import { describe, it, expect } from 'vitest'
import { montageNote } from '../../app/helpers/notes'

i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('what the board says of a montage', () => {
  it('counts the clips put in the bin', () => {
    expect(
      montageNote({ clips: 3, missingAssets: [], opened: true, openCommand: 'kdenlive' })
    ).toBe('Montage ready — 3 clips in the bin · opening it with kdenlive')
  })

  it('counts the photos when the film is to be made of photos', () => {
    expect(montageNote({ clips: 0, photos: 12, missingAssets: [], opened: true })).toBe(
      'Montage ready — 12 photos in the bin · opening it'
    )
  })

  it('says a project is being opened again when nothing was put in the bin', () => {
    expect(montageNote({ clips: 0, photos: 0, missingAssets: [], opened: true })).toBe(
      'Opening it…'
    )
  })
})
