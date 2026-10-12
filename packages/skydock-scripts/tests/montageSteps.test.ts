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
  project: false,
  projectPath: '/p/luc_favre.kdenlive',
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
  it('waits for a name before anything else', () => {
    expect(at(montage({ passenger: { firstname: '', lastname: '' } }))).toEqual({
      step: 'Named',
      next: 'to name'
    })
  })

  it('is to be prepared once named', () => {
    expect(at(montage())).toEqual({ step: 'Prepared', next: 'to process' })
  })

  it('is to be given its project once prepared', () => {
    expect(at(montage({ processed: true }), facts())).toEqual({ step: 'Project', next: 'to edit' })
  })

  it('is to be rendered once there is a project', () => {
    expect(at(montage({ processed: true }), facts({ project: true }))).toEqual({
      step: 'Film',
      next: 'to render'
    })
  })

  it('is to be uploaded once the film is there', () => {
    expect(at(montage({ processed: true }), facts({ project: true, film: FILM }))).toEqual({
      step: 'Uploaded',
      next: 'to upload'
    })
  })

  it('is to be emailed once uploaded', () => {
    const group = montage({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ project: true, film: FILM }))).toEqual({
      step: 'Sent',
      next: 'to email'
    })
  })

  it('has every step done once it was sent', () => {
    const group = montage({ processed: true, uploaded: UPLOADED })
    expect(at(group, facts({ project: true, film: FILM }), true)).toEqual({
      step: 'done',
      next: null
    })
  })

  it('counts a freed montage as having been through every step up to the upload', () => {
    const group = montage({ processed: true, uploaded: UPLOADED, freed: { at: 1, bytes: 1 } })
    expect(at(group)).toEqual({ step: 'Sent', next: 'to email' })
  })
})

describe('where a passenger has got to', () => {
  it('is where their jump furthest behind is', () => {
    const ahead = montageSteps({
      group: montage({ processed: true }),
      facts: facts({ project: true, film: FILM }),
      emailed: false
    })
    const behind = montageSteps({ group: montage({ id: 'g2' }), emailed: false })

    expect(furthestBehind([ahead, behind])?.next?.todo).toBe('to process')
  })

  it('has nowhere to be without a montage', () => {
    expect(furthestBehind([])).toBeNull()
  })
})
