// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { furthestBehind, montageSteps } from '../src/montageSteps'
import type { MontageFact } from '../src/boardAnswer'
import type { ManifestGroup } from '../src/types'

const montage = (over: Partial<ManifestGroup> = {}): ManifestGroup => ({
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files: [],
  ...over
})

const facts = (over: Partial<MontageFact> = {}): MontageFact => ({
  edit: false,
  film: null,
  baseName: 'luc_favre',
  ...over
})

const FILM = { size: 1, mtime: 1, seconds: 60, path: '/p/luc_favre.mp4' }

const UPLOADED = { at: 1 }

const at = (group: ManifestGroup, fact?: MontageFact, emailed = false) => {
  const { steps, at: index, next } = montageSteps({ group, facts: fact, emailed })
  return { step: steps[index]?.name ?? 'done', next: next?.todo ?? null }
}

describe('where a montage has got to', () => {
  it('is to be edited first, with nothing processed', () => {
    expect(at(montage())).toEqual({ step: 'Edited', next: 'to edit' })
  })

  it('has no step for the copies, which are made when something is handed over', () => {
    expect(montageSteps({ group: montage(), emailed: false }).steps.map((s) => s.name)).toEqual([
      'Edited',
      'Rendered',
      'Uploaded',
      'Emailed'
    ])
  })

  it('is to be rendered once there is an edit', () => {
    expect(at(montage({ processed: true }), facts({ edit: true }))).toEqual({
      step: 'Rendered',
      next: 'to render'
    })
  })

  it('is to be uploaded once the film is there', () => {
    expect(at(montage({ processed: true }), facts({ edit: true, film: FILM }))).toEqual({
      step: 'Uploaded',
      next: 'to upload'
    })
  })

  it('is to be emailed once uploaded', () => {
    const group = montage({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ edit: true, film: FILM }))).toEqual({
      step: 'Emailed',
      next: 'to email'
    })
  })

  it('has every step done once it was sent', () => {
    const group = montage({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ edit: true, film: FILM }), true)).toEqual({
      step: 'done',
      next: null
    })
  })

  it('counts a freed montage as having been through every step up to the upload', () => {
    const group = montage({ processed: true, uploaded: UPLOADED, freed: { at: 1, bytes: 1 } })
    expect(at(group)).toEqual({ step: 'Emailed', next: 'to email' })
  })
})

describe('a montage that is done', () => {
  const kept = (over: Partial<ManifestGroup> = {}) => montage({ processed: true, done: 1, ...over })

  it('has no step to take next, whichever it has been through', () => {
    expect(at(kept())).toEqual({ step: 'done', next: null })
    expect(at(kept(), facts({ edit: true, film: FILM }))).toEqual({ step: 'done', next: null })
  })

  it('keeps the steps it was really through, and says it was kept by hand', () => {
    const progress = montageSteps({ group: kept(), facts: facts({ edit: true }), emailed: false })

    expect(progress.kept).toBe(true)
    expect(progress.steps.map((step) => step.done)).toEqual([true, false, false, false])
  })

  it('is behind nothing, so a passenger whose jumps are all done is not to be done', () => {
    const done = montageSteps({ group: kept(), emailed: false })
    const other = montageSteps({ group: kept({ id: 'g2' }), emailed: false })

    expect(furthestBehind([done, other])?.next).toBeNull()
  })

  it('is not a montage kept by hand once it has been freed from this machine', () => {
    const group = kept({ uploaded: UPLOADED, freed: { at: 1, bytes: 1 } })
    expect(montageSteps({ group, emailed: false }).kept).toBe(false)
  })
})

describe('where a passenger has got to', () => {
  it('is where their jump furthest behind is', () => {
    const ahead = montageSteps({
      group: montage(),
      facts: facts({ edit: true, film: FILM }),
      emailed: false
    })
    const behind = montageSteps({ group: montage({ id: 'g2' }), emailed: false })

    expect(furthestBehind([ahead, behind])?.next?.todo).toBe('to edit')
  })

  it('has nowhere to be without a montage', () => {
    expect(furthestBehind([])).toBeNull()
  })
})
