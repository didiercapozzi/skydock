// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { furthestBehind, tandemSteps } from '../src/tandemSteps'
import type { TandemFact } from '../src/boardAnswer'
import type { ManifestGroup } from '../src/types'

/* A tandem walks the same six steps every time — named, processed, edited, rendered, uploaded,
   emailed — and the board shows every passenger where they are on it and what comes next. Each step
   is read off what is there, so these build the state and ask where it has got to. */

const tandem = (over: Partial<ManifestGroup> = {}): ManifestGroup => ({
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  destination: 'Tandems',
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files: [],
  ...over
})

const facts = (over: Partial<TandemFact> = {}): TandemFact => ({
  project: false,
  projectPath: '/p/luc_favre.kdenlive',
  film: null,
  baseName: 'luc_favre',
  ...over
})

const FILM = { size: 1, mtime: 1, seconds: 60, path: '/p/luc_favre.mp4' }

const UPLOADED = { at: 1 }

const at = (group: ManifestGroup, fact?: TandemFact, emailed = false) => {
  const { steps, at: index, next } = tandemSteps({ group, facts: fact, emailed })
  return { step: steps[index]?.name ?? 'done', next: next?.todo ?? null }
}

describe('where a tandem has got to', () => {
  it('waits for a name before anything else', () => {
    expect(at(tandem({ passenger: { firstname: 'Luc', lastname: '' } }))).toEqual({
      step: 'Named',
      next: 'to name'
    })
  })

  it('is to be processed once named', () => {
    expect(at(tandem())).toEqual({ step: 'Processed', next: 'to process' })
  })

  it('is to be edited once processed', () => {
    expect(at(tandem({ processed: true }), facts())).toEqual({ step: 'Edited', next: 'to edit' })
  })

  it('is to be rendered once there is a project', () => {
    expect(at(tandem({ processed: true }), facts({ project: true }))).toEqual({
      step: 'Rendered',
      next: 'to render'
    })
  })

  it('is to be uploaded once the film is there', () => {
    expect(at(tandem({ processed: true }), facts({ project: true, film: FILM }))).toEqual({
      step: 'Uploaded',
      next: 'to upload'
    })
  })

  it('is to be emailed once uploaded', () => {
    const group = tandem({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ project: true, film: FILM }))).toEqual({
      step: 'Emailed',
      next: 'to email'
    })
  })

  it('has every step done once the passenger was emailed', () => {
    const group = tandem({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ project: true, film: FILM }), true)).toEqual({
      step: 'done',
      next: null
    })
  })

  /* freed: nothing of it here any more, but it went through every step to get there */
  it('counts a freed tandem as having been through every step up to the upload', () => {
    const group = tandem({ processed: true, uploaded: UPLOADED, freed: { at: 1, bytes: 1 } })
    expect(at(group)).toEqual({ step: 'Emailed', next: 'to email' })
  })
})

describe('where a passenger has got to', () => {
  /* one passenger is one folder: they are only past a step once all their jumps are */
  it('is where their jump furthest behind is', () => {
    const ahead = tandemSteps({
      group: tandem({ processed: true }),
      facts: facts({ project: true, film: FILM }),
      emailed: false
    })
    const behind = tandemSteps({ group: tandem({ id: 'g2' }), emailed: false })

    expect(furthestBehind([ahead, behind])?.next?.todo).toBe('to process')
  })

  it('has nowhere to be without a tandem', () => {
    expect(furthestBehind([])).toBeNull()
  })
})
