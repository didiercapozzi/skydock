// @vitest-environment node
import { i18n } from '@lingui/core'
import { describe, it, expect } from 'vitest'
import { montageNote } from '../../app/helpers/notes'

i18n.loadAndActivate({ locale: 'en', messages: {} })

/* What the board says once a montage is made — how much went in the bin, and whether the editor came
   up — and, when nothing was put in the bin, that an existing project is being opened again rather
   than made (RULES, The editing project). */
describe('what the board says of a montage', () => {
  it('counts the clips put in the bin', () => {
    expect(
      montageNote({ clips: 3, missingAssets: [], opened: true, openCommand: 'kdenlive' })
    ).toBe('Montage ready — 3 clips in the bin · opening it with kdenlive')
  })

  /* a montage whose camera caught no video is made into a film of its photos */
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
