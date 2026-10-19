// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  boundaries,
  clipAt,
  FADE,
  fadeAt,
  fadeBlock,
  insertClip,
  moveClip,
  placeClip,
  placed,
  removeClip,
  fitItemFades,
  rippleBy,
  setFade,
  setItemFade,
  setPart,
  snapPoints,
  snapTo,
  splitClip,
  timelineEnd,
  trimClip,
  zoomAround
} from '../../app/helpers/filmTimeline'
import { fadeInOf, fadeOutOf } from '@skydock/scripts/client'
import type { FilmEdit } from '@skydock/scripts/client'

const edit: FilmEdit = {
  version: 1,
  clips: [
    { id: 'clip-1', name: 'a.mp4', start: 0, end: 10, sound: true },
    { id: 'clip-2', name: 'b.mp4', start: 2, end: 8, sound: false }
  ],
  music: [{ id: 'music-1', name: 'm.mp3', at: 12, start: 0, end: 5, volume: 1 }],
  texts: [
    {
      id: 'text-1',
      text: 'Hi',
      at: 11,
      seconds: 2,
      effect: 'fade',
      font: 'bold',
      x: 0.5,
      y: 0.5,
      size: 0.09,
      colour: '#ffffff'
    }
  ],
  underSound: 0.15
}

describe('cutting at the playhead', () => {
  it('makes two clips that meet at the cut and keeps the film as long', () => {
    const cut = splitClip(edit, 4)!
    expect(cut.clips).toEqual([
      { id: 'clip-1', name: 'a.mp4', start: 0, end: 4, sound: true },
      { id: 'clip-3', name: 'a.mp4', start: 4, end: 10, sound: true },
      edit.clips[1]
    ])
    expect(cut.texts).toEqual(edit.texts)
    expect(cut.music).toEqual(edit.music)
  })

  it('cuts inside the second clip at its source time', () => {
    const cut = splitClip(edit, 13)!
    expect(cut.clips.slice(1).map((c) => [c.start, c.end])).toEqual([
      [2, 5],
      [5, 8]
    ])
  })

  it('does nothing where a piece would be too short, or past the film', () => {
    expect(splitClip(edit, 0.2)).toBeNull()
    expect(splitClip(edit, 9.8)).toBeNull()
    expect(splitClip(edit, 10)).toBeNull()
    expect(splitClip(edit, 16)).toBeNull()
  })

  it('cuts half a second in even when the sum falls a hair over', () => {
    const odd: FilmEdit = {
      ...edit,
      clips: [
        { id: 'clip-1', name: 'a.mp4', start: 0.1, end: 4.2, sound: true },
        { id: 'clip-2', name: 'b.mp4', start: 0, end: 6, sound: true }
      ]
    }
    expect(splitClip(odd, 4.6)).not.toBeNull()
  })
})

describe('the fades of a clip through the edits', () => {
  const faded: FilmEdit = {
    ...edit,
    clips: [
      { id: 'clip-1', name: 'a.mp4', start: 0, end: 10, sound: true, fadeIn: 2, fadeOut: 3 },
      { id: 'clip-2', name: 'b.mp4', start: 2, end: 8, sound: false }
    ]
  }

  it('stays in on the first piece of a cut and out on the second', () => {
    const cut = splitClip(faded, 4)!
    expect(cut.clips[0]).toEqual({
      id: 'clip-1',
      name: 'a.mp4',
      start: 0,
      end: 4,
      sound: true,
      fadeIn: 2
    })
    expect(cut.clips[1]).toEqual({
      id: 'clip-3',
      name: 'a.mp4',
      start: 4,
      end: 10,
      sound: true,
      fadeOut: 3
    })
  })

  it('is clamped to half the clip when it is trimmed shorter, and comes back when it grows', () => {
    const shorter = trimClip(faded, 'clip-1', 'end', 2, 20, false)
    expect(fadeInOf(shorter.clips, 0)).toBe(1)
    expect(fadeOutOf(shorter.clips, 0)).toBe(1)
    const longer = trimClip(shorter, 'clip-1', 'end', 10, 20, false)
    expect(fadeOutOf(longer.clips, 0)).toBe(3)
  })

  it('follows the clip when it moves, and goes with it when it is deleted', () => {
    const moved = moveClip(faded, 'clip-1', 2)
    expect(moved.clips[1]).toMatchObject({ id: 'clip-1', fadeIn: 2, fadeOut: 3 })
    expect(removeClip(faded, 'clip-1', false).clips.map((one) => one.id)).toEqual(['clip-2'])
  })
})

describe('ripple', () => {
  it('moves what starts after the change, and leaves what starts before', () => {
    const moved = rippleBy(edit, 11.5, -3, true)
    expect(moved.texts[0]!.at).toBe(11)
    expect(moved.music[0]!.at).toBe(9)
  })

  it('moves nothing when it is off', () => {
    expect(rippleBy(edit, 0, -3, false)).toEqual(edit)
  })

  it('leaves a block that began before the change or inside the changed clip', () => {
    const blocks: FilmEdit = {
      ...edit,
      music: [{ ...edit.music[0]!, at: 8 }],
      texts: [{ ...edit.texts[0]!, at: 3 }]
    }
    const trimmed = trimClip(blocks, 'clip-1', 'end', 6, 10, true)
    expect(trimmed.music[0]!.at).toBe(8)
    expect(trimmed.texts[0]!.at).toBe(3)
  })

  it('brings a block that started inside a removed clip to the change point', () => {
    const blocks: FilmEdit = {
      ...edit,
      music: [{ ...edit.music[0]!, at: 8 }],
      texts: [{ ...edit.texts[0]!, at: 3 }]
    }
    const removed = removeClip(blocks, 'clip-2', true)
    expect(removed.texts[0]!.at).toBe(3)
    const first = removeClip(blocks, 'clip-1', true)
    expect(first.texts[0]!.at).toBe(0)
    expect(first.music[0]!.at).toBe(0)
    const second = removeClip(
      { ...blocks, texts: [{ ...blocks.texts[0]!, at: 12 }] },
      'clip-2',
      true
    )
    expect(second.texts[0]!.at).toBe(10)
  })

  it('never moves a block that starts before the change point', () => {
    expect(rippleBy(edit, 12, 5, true).texts[0]!.at).toBe(11)
  })

  it('pushes a block at 0 as well when a clip goes in at the very start', () => {
    const clip = { id: 'clip-9', name: 'c.mp4', start: 0, end: 4, sound: false }
    const blocks: FilmEdit = {
      ...edit,
      texts: [
        { ...edit.texts[0]!, at: 0 },
        { ...edit.texts[0]!, id: 'text-2', at: 5 }
      ]
    }
    const put = insertClip(blocks, 0, clip, true)
    expect(put.texts.map((text) => text.at)).toEqual([4, 9])
    expect(put.music[0]!.at).toBe(16)
    expect(insertClip(blocks, 1, clip, true).texts.map((text) => text.at)).toEqual([0, 5])
    const boundary = insertClip(
      { ...blocks, texts: [{ ...blocks.texts[0]!, at: 10 }] },
      1,
      clip,
      true
    )
    expect(boundary.texts[0]!.at).toBe(14)
  })

  it('follows a deleted clip, and a trimmed one, unless it is off', () => {
    expect(removeClip(edit, 'clip-1', true).texts[0]!.at).toBe(1)
    expect(removeClip(edit, 'clip-1', true).music[0]!.at).toBe(2)
    expect(removeClip(edit, 'clip-1', false).texts[0]!.at).toBe(11)
    expect(trimClip(edit, 'clip-1', 'end', 6, 10, true).music[0]!.at).toBe(8)
    expect(trimClip(edit, 'clip-1', 'end', 6, 10, false).music[0]!.at).toBe(12)
  })
})

describe('snapping', () => {
  it('pulls a value to the nearest candidate within reach', () => {
    expect(snapTo([0, 5, 9], 5.3, 0.5)).toBe(5)
    expect(snapTo([0, 5, 9], 5.8, 0.5)).toBe(5.8)
    expect(snapTo([4.8, 5.2], 5.1, 0.5)).toBe(5.2)
    expect(snapTo([], 3, 1)).toBe(3)
  })

  it('knows the film start, the cuts, the playhead, the marks and the other blocks', () => {
    const sources = new Map([
      [
        'a.mp4',
        {
          name: 'a.mp4',
          path: '',
          play: '',
          seconds: 10,
          sound: true,
          marks: [{ which: 'exit' as const, at: 3 }]
        }
      ]
    ])
    const points = snapPoints(edit, sources, 7.5, 'text-1')
    expect([...points].sort((a, b) => a - b)).toEqual(
      [0, 3, 7.5, 10, 16, 12, 17].sort((a, b) => a - b)
    )
  })
})

describe('the end of the timeline', () => {
  it('is the latest end among the videos, the texts and the music', () => {
    expect(timelineEnd(edit)).toBe(17)
    expect(timelineEnd({ ...edit, music: [], texts: [] })).toBe(16)
    expect(
      timelineEnd({ ...edit, music: [], texts: [{ ...edit.texts[0]!, at: 20, seconds: 3 }] })
    ).toBe(23)
    expect(timelineEnd({ ...edit, clips: [], music: [], texts: [] })).toBe(0)
  })
})

describe('the clip at a moment', () => {
  it('is none on a tail that has only a text or music', () => {
    expect(clipAt(edit, 5)?.clip.id).toBe('clip-1')
    expect(clipAt(edit, 16)?.clip.id).toBe('clip-2')
    expect(clipAt(edit, 16.5)).toBeNull()
  })
})

describe('zooming around a point', () => {
  it('keeps the moment under the pointer where it is', () => {
    const scroll = zoomAround(100, 300, 10, 20)
    expect((scroll + 300) / 20).toBeCloseTo((100 + 300) / 10, 9)
    expect(zoomAround(0, 0, 10, 40)).toBe(0)
  })
})

const gapped: FilmEdit = {
  ...edit,
  clips: [
    { id: 'clip-1', name: 'a.mp4', start: 0, end: 10, sound: true },
    { id: 'clip-2', name: 'b.mp4', start: 2, end: 8, sound: false, gap: 3 },
    { id: 'clip-3', name: 'c.mp4', start: 0, end: 4, sound: false, gap: 2 }
  ],
  music: [{ id: 'music-1', name: 'm.mp3', at: 22, start: 0, end: 5, volume: 1 }],
  texts: [{ ...edit.texts[0]!, at: 20 }]
}

const startsOf = (film: FilmEdit) => placed(film).map((one) => [one.from, one.to])

describe('gaps between clips', () => {
  it('count in where each clip sits, in the length of the film and in its end', () => {
    expect(startsOf(gapped)).toEqual([
      [0, 10],
      [13, 19],
      [21, 25]
    ])
    expect(boundaries(gapped)).toEqual([0, 10, 19, 25])
    expect(timelineEnd(gapped)).toBe(27)
    expect(timelineEnd({ ...gapped, music: [], texts: [] })).toBe(25)
  })

  it('make the picture black, as past the end', () => {
    expect(clipAt(gapped, 11)).toBeNull()
    expect(clipAt(gapped, 12.9)).toBeNull()
    expect(clipAt(gapped, 13)?.clip.id).toBe('clip-2')
    expect(clipAt(gapped, 25)?.clip.id).toBe('clip-3')
  })

  it('are snapped to as the clip starts, and the marks sit after them', () => {
    const sources = new Map([
      [
        'b.mp4',
        {
          name: 'b.mp4',
          path: '',
          play: '',
          seconds: 8,
          sound: true,
          marks: [{ which: 'exit' as const, at: 3 }]
        }
      ]
    ])
    const points = snapPoints({ ...gapped, music: [], texts: [] }, sources, 7, 'clip-3')
    expect([...points].sort((a, b) => a - b)).toEqual([0, 7, 10, 13, 14, 19])
  })

  it('stay on the first piece of a cut clip and not on the second', () => {
    const cut = splitClip(gapped, 16)!
    expect(cut.clips[1]).toEqual({ ...gapped.clips[1], end: 5 })
    expect(cut.clips[2]).toEqual({ id: 'clip-4', name: 'b.mp4', start: 5, end: 8, sound: false })
    expect(startsOf(cut).slice(1)).toEqual([
      [13, 16],
      [16, 19],
      [21, 25]
    ])
  })

  it('go with a deleted clip, and later blocks follow by its gap and length with Ripple on', () => {
    const removed = removeClip(gapped, 'clip-2', true)
    expect(removed.clips.map((c) => c.id)).toEqual(['clip-1', 'clip-3'])
    expect(startsOf(removed)).toEqual([
      [0, 10],
      [12, 16]
    ])
    expect(removed.texts[0]!.at).toBe(11)
    expect(removed.music[0]!.at).toBe(13)
  })

  it('leave the later clips where they are when a clip is deleted with Ripple off', () => {
    const removed = removeClip(gapped, 'clip-2', false)
    expect(startsOf(removed)).toEqual([
      [0, 10],
      [21, 25]
    ])
    expect(removed.clips[1]!.gap).toBe(11)
    expect(removed.texts[0]!.at).toBe(20)
    expect(startsOf(removeClip(gapped, 'clip-3', false))).toEqual([
      [0, 10],
      [13, 19]
    ])
  })

  it('stay put when a clip beside them is trimmed at its far edge', () => {
    const trimmed = trimClip(gapped, 'clip-2', 'end', 6, 8, true)
    expect(trimmed.clips[1]!.gap).toBe(3)
    expect(trimmed.clips[2]!.gap).toBe(2)
    expect(trimmed.music[0]!.at).toBe(20)
  })

  it('grow by the trimmed amount at a clip start with Ripple off, keeping its right edge', () => {
    const trimmed = trimClip(gapped, 'clip-2', 'start', 3, 8, false)
    expect(trimmed.clips[1]).toEqual({ ...gapped.clips[1], start: 3, gap: 4 })
    expect(startsOf(trimmed)[1]).toEqual([14, 19])
    const longer = trimClip(gapped, 'clip-2', 'start', 1, 8, false)
    expect(longer.clips[1]!.gap).toBe(2)
    expect(startsOf(longer)[1]).toEqual([12, 19])
  })

  it('are used up first and then the later clips are pushed when a clip start is trimmed outwards with Ripple off', () => {
    const film: FilmEdit = {
      ...gapped,
      clips: gapped.clips.map((c) => (c.id === 'clip-3' ? { ...c, start: 3, end: 7 } : c))
    }
    const trimmed = trimClip(film, 'clip-3', 'start', 0, 8, false)
    expect(trimmed.clips[2]!.gap).toBeUndefined()
    expect(startsOf(trimmed)[2]).toEqual([19, 26])
  })

  it('keep the start and move what follows with Ripple on when a clip start is trimmed', () => {
    const trimmed = trimClip(gapped, 'clip-2', 'start', 3, 8, true)
    expect(trimmed.clips[1]!.gap).toBe(3)
    expect(startsOf(trimmed)[1]).toEqual([13, 18])
    expect(trimmed.music[0]!.at).toBe(21)
  })

  it('stay where they are for a new clip put in before a clip', () => {
    const clip = { id: 'clip-9', name: 'd.mp4', start: 0, end: 4, sound: false }
    const put = insertClip(gapped, 1, clip, true)
    expect(startsOf(put)).toEqual([
      [0, 10],
      [10, 14],
      [17, 23],
      [25, 29]
    ])
    expect(put.music[0]!.at).toBe(26)
  })

  it('stay with their slots when a clip is moved in the order', () => {
    const moved = moveClip(gapped, 'clip-3', 1)
    expect(moved.clips.map((c) => [c.id, c.gap])).toEqual([
      ['clip-1', undefined],
      ['clip-3', 3],
      ['clip-2', 2]
    ])
  })
})

describe('placing a clip', () => {
  it('opens a gap before it when moved right, and pushes later clips and blocks with Ripple on', () => {
    const placedAt = placeClip(edit, 'clip-2', 12, true)
    expect(placedAt.clips[1]!.gap).toBe(2)
    expect(startsOf(placedAt)[1]).toEqual([12, 18])
    expect(placedAt.texts[0]!.at).toBe(13)
    expect(placedAt.music[0]!.at).toBe(14)
  })

  it('keeps the later clips in place with Ripple off, until the next gap is used up', () => {
    const near = placeClip(gapped, 'clip-2', 14, false)
    expect(near.clips[1]!.gap).toBe(4)
    expect(near.clips[2]!.gap).toBe(1)
    expect(startsOf(near)[2]).toEqual([21, 25])
    expect(near.texts[0]!.at).toBe(20)
    const far = placeClip(gapped, 'clip-2', 40, false)
    expect(far.clips[1]!.gap).toBe(5)
    expect(far.clips[2]!.gap).toBeUndefined()
    expect(startsOf(far)[1]).toEqual([15, 21])
    expect(startsOf(far)[2]).toEqual([21, 25])
  })

  it('has no limit to the right on the last clip, or with Ripple on', () => {
    expect(placeClip(gapped, 'clip-3', 100, false).clips[2]!.gap).toBe(81)
    expect(placeClip(gapped, 'clip-2', 100, true).clips[1]!.gap).toBe(90)
  })

  it('closes its gap moving left and stops against the clip before, never overlapping', () => {
    const closer = placeClip(gapped, 'clip-2', 11, true)
    expect(closer.clips[1]!.gap).toBe(1)
    expect(closer.music[0]!.at).toBe(20)
    const touching = placeClip(gapped, 'clip-2', 4, true)
    expect(touching.clips[1]!.gap).toBeUndefined()
    expect(startsOf(touching)[1]).toEqual([10, 16])
    expect(placeClip(gapped, 'clip-2', 4, false).clips[2]!.gap).toBe(5)
    expect(placeClip(edit, 'clip-1', -3, true).clips[0]!.gap).toBeUndefined()
  })

  it('does not change a clip put where it is, and ignores an unknown clip', () => {
    expect(placeClip(gapped, 'clip-2', 13, true)).toEqual(gapped)
    expect(placeClip(gapped, 'nope', 20, true)).toBe(gapped)
  })
})

const faded: FilmEdit = {
  ...edit,
  clips: [
    { id: 'clip-1', name: 'a.mp4', start: 0, end: 10, sound: true },
    { id: 'clip-2', name: 'b.mp4', start: 2, end: 8, sound: true, fade: 2 },
    { id: 'clip-3', name: 'c.mp4', start: 0, end: 4, sound: true }
  ],
  music: [{ id: 'music-1', name: 'm.mp3', at: 16, start: 0, end: 5, volume: 1 }],
  texts: [{ ...edit.texts[0]!, at: 15 }]
}

describe('a crossfade between two clips', () => {
  it('starts the clip before the other ends, and shortens the film by the overlap', () => {
    expect(startsOf(faded)).toEqual([
      [0, 10],
      [8, 14],
      [14, 18]
    ])
    expect(boundaries(faded)).toEqual([0, 10, 14, 18])
    expect(timelineEnd(faded)).toBe(21)
    expect(timelineEnd({ ...faded, music: [], texts: [] })).toBe(18)
  })

  it('gives the picture to the newer clip in the overlap and tells how far the blend is', () => {
    expect(clipAt(faded, 7.9)?.clip.id).toBe('clip-1')
    expect(clipAt(faded, 8)?.clip.id).toBe('clip-2')
    expect(clipAt(faded, 9)?.clip.id).toBe('clip-2')
    expect(clipAt(faded, 10)?.clip.id).toBe('clip-2')
    expect(fadeAt(faded, 7.9)).toBeNull()
    expect(fadeAt(faded, 10)).toBeNull()
    expect(fadeAt(faded, 14)).toBeNull()
    const mid = fadeAt(faded, 9)!
    expect(mid.out.clip.id).toBe('clip-1')
    expect(mid.into.clip.id).toBe('clip-2')
    expect(mid.mix).toBeCloseTo(0.5, 9)
    expect(fadeAt(faded, 8)!.mix).toBe(0)
  })

  it('is snapped to where the newer clip starts', () => {
    expect(snapPoints(faded, new Map(), 0).includes(8)).toBe(true)
  })

  it('is one click: on gives one second, held to what the pair allows, and off removes it', () => {
    const on = setFade(edit, 'clip-2', FADE.default, true)
    expect(on.clips[1]!.fade).toBe(1)
    expect(setFade(on, 'clip-2', 0, true)).toEqual(edit)
    expect(setFade(edit, 'clip-2', 99, true).clips[1]!.fade).toBe(3)
    const small: FilmEdit = {
      ...edit,
      clips: [edit.clips[0]!, { ...edit.clips[1]!, start: 0, end: 1.2 }]
    }
    expect(setFade(small, 'clip-2', FADE.default, true).clips[1]!.fade).toBe(0.6)
  })

  it('removes the fade when set below its least', () => {
    expect(setFade(faded, 'clip-2', 0.1, true)).toEqual({
      ...faded,
      clips: [
        faded.clips[0]!,
        { id: 'clip-2', name: 'b.mp4', start: 2, end: 8, sound: true },
        faded.clips[2]!
      ],
      music: [{ ...faded.music[0]!, at: 18 }],
      texts: [{ ...faded.texts[0]!, at: 17 }]
    })
  })

  it('pulls the text and the music after it along with Ripple on, and not with it off', () => {
    const on = setFade(edit, 'clip-2', 1, true)
    expect(on.music[0]!.at).toBe(11)
    expect(on.texts[0]!.at).toBe(10)
    const off = setFade(edit, 'clip-2', 1, false)
    expect(off.music[0]!.at).toBe(12)
    expect(off.texts[0]!.at).toBe(11)
  })

  it('says why it cannot be made', () => {
    expect(fadeBlock(edit, 'clip-1')).toBe('first')
    expect(fadeBlock(edit, 'clip-2')).toBeNull()
    expect(fadeBlock(gapped, 'clip-2')).toBe('gap')
    const short: FilmEdit = {
      ...edit,
      clips: [edit.clips[0]!, { ...edit.clips[1]!, start: 0, end: 0.3 }]
    }
    expect(fadeBlock(short, 'clip-2')).toBe('short')
    expect(setFade(edit, 'clip-1', 1, true)).toBe(edit)
    expect(setFade(gapped, 'clip-2', 1, true)).toBe(gapped)
    expect(setFade(short, 'clip-2', 1, true)).toBe(short)
  })

  it('is cleared when its clip is given a gap, and shortens as the clip is moved right', () => {
    const later = placeClip(faded, 'clip-2', 9, true)
    expect(later.clips[1]!.fade).toBe(1)
    expect(later.clips[1]!.gap).toBeUndefined()
    const apart = placeClip(faded, 'clip-2', 12, true)
    expect(apart.clips[1]!.fade).toBeUndefined()
    expect(apart.clips[1]!.gap).toBe(2)
    expect(placeClip(faded, 'clip-2', 5, true)).toEqual(faded)
  })

  it('stays on the first piece of a cut clip, and the next fade follows the second', () => {
    const next: FilmEdit = {
      ...faded,
      clips: faded.clips.map((one) => (one.id === 'clip-3' ? { ...one, fade: 1 } : one))
    }
    const cut = splitClip(next, 12)!
    expect(cut.clips.map((one) => one.fade)).toEqual([undefined, 2, undefined, 1])
    expect(cut.clips[3]!.id).toBe('clip-3')
  })

  it('is clamped when either clip is trimmed shorter', () => {
    const trimmed = trimClip(faded, 'clip-2', 'end', 2.5, 20, true)
    expect(trimmed.clips[1]!.fade).toBeCloseTo(0.25, 9)
    const before = trimClip(faded, 'clip-1', 'end', 1, 20, true)
    expect(before.clips[1]!.fade).toBe(0.5)
    const part = setPart(faded, 'clip-2', 2, 3, true)
    expect(part.clips[1]!.fade).toBe(0.5)
  })

  it('goes with the clip deleted, and with the clip before it', () => {
    expect(removeClip(faded, 'clip-2', true).clips.map((one) => one.fade)).toEqual([
      undefined,
      undefined
    ])
    expect(removeClip(faded, 'clip-1', true).clips.map((one) => one.fade)).toEqual([
      undefined,
      undefined
    ])
  })

  it('leaves the place empty, where the film no longer overlaps, with Ripple off', () => {
    const gone = removeClip(faded, 'clip-2', false)
    expect(gone.clips[1]!.gap).toBe(4)
    expect(startsOf(gone)[1]).toEqual([14, 18])
  })

  it('stays when clips move around it and goes when its neighbour changes', () => {
    const four: FilmEdit = {
      ...faded,
      clips: [...faded.clips, { id: 'clip-4', name: 'd.mp4', start: 0, end: 4, sound: true }]
    }
    expect(moveClip(four, 'clip-4', 0).clips.map((one) => one.fade)).toEqual([
      undefined,
      undefined,
      2,
      undefined
    ])
    expect(moveClip(four, 'clip-2', 3).clips.map((one) => one.fade)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined
    ])
  })

  it('goes when a clip is put in between', () => {
    const between = insertClip(
      faded,
      1,
      { id: 'clip-9', name: 'z.mp4', start: 0, end: 3, sound: true },
      true
    )
    expect(between.clips.map((one) => one.fade)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined
    ])
  })

  it('cuts the clip on top, not the one fading out underneath', () => {
    const cut = splitClip(faded, 9)!
    expect(cut.clips.map((one) => [one.id, one.start, one.end])).toEqual([
      ['clip-1', 0, 10],
      ['clip-2', 2, 3],
      ['clip-4', 3, 8],
      ['clip-3', 0, 4]
    ])
    expect(cut.clips[1]!.fade).toBe(0.5)
    expect(splitClip(faded, 8.5)!.clips[1]!.end).toBe(2.5)
    expect(splitClip(faded, 10)!.clips[1]!.end).toBe(4)
    expect(splitClip(faded, 8.2)).toBeNull()
    expect(splitClip(faded, 7.9)!.clips[0]!.end).toBe(7.9)
  })

  it('fades the middle clip of a chain in and out', () => {
    const chain: FilmEdit = {
      ...faded,
      clips: faded.clips.map((one) => (one.id === 'clip-3' ? { ...one, fade: 2 } : one))
    }
    expect(fadeAt(chain, 9)!.into.clip.id).toBe('clip-2')
    expect(fadeAt(chain, 10)).toBeNull()
    expect(fadeAt(chain, 12)!.into.clip.id).toBe('clip-3')
    expect(fadeAt(chain, 12)!.mix).toBe(0)
    expect(fadeAt(chain, 13)!.out.clip.id).toBe('clip-2')
    expect(fadeAt(chain, 13)!.mix).toBe(0.5)
    expect(fadeAt(chain, 14)).toBeNull()
    expect(clipAt(chain, 12)?.clip.id).toBe('clip-3')
  })

  it('moves the text and the music with the clip after the one put in between', () => {
    const between = insertClip(
      faded,
      1,
      { id: 'clip-9', name: 'z.mp4', start: 0, end: 3, sound: true },
      true
    )
    expect(between.texts[0]!.at).toBe(20)
    expect(between.music[0]!.at).toBe(21)
  })

  const chained: FilmEdit = {
    ...faded,
    clips: faded.clips.map((one) => (one.id === 'clip-3' ? { ...one, fade: 1 } : one))
  }

  it('keeps the text and the music in step when deleting the clip before a faded one', () => {
    const gone = removeClip(chained, 'clip-2', true)
    expect(startsOf(gone)).toEqual([
      [0, 10],
      [10, 14]
    ])
    expect(gone.texts[0]!.at).toBe(12)
    expect(gone.music[0]!.at).toBe(13)
  })

  it('keeps the text and the music in step when a trim holds the fade to half', () => {
    const short = trimClip(faded, 'clip-2', 'end', 3.2, 100, true)
    expect(short.clips[1]!.fade).toBeCloseTo(0.6, 9)
    expect(startsOf(short)[2]![0]).toBeCloseTo(10.6, 9)
    expect(short.texts[0]!.at).toBeCloseTo(11.6, 9)
    expect(short.music[0]!.at).toBeCloseTo(12.6, 9)
  })

  it('puts the text back where it was when the fade is made and taken off again', () => {
    const early: FilmEdit = { ...edit, texts: [{ ...edit.texts[0]!, at: 10.5 }] }
    const on = setFade(early, 'clip-2', FADE.default, true)
    expect(on.texts[0]!.at).toBe(9.5)
    expect(setFade(on, 'clip-2', 0, true).texts[0]!.at).toBe(10.5)
  })
})

describe('a clip played faster or slower', () => {
  const fast: FilmEdit = {
    ...edit,
    clips: [{ ...edit.clips[0]!, speed: 2 }, edit.clips[1]!]
  }

  it('lasts its part divided by its speed', () => {
    expect(placed(fast).map((one) => [one.from, one.to])).toEqual([
      [0, 5],
      [5, 11]
    ])
  })

  it('is cut where the playhead is in the source, not on the timeline', () => {
    const cut = splitClip(fast, 2)!
    expect(cut.clips.slice(0, 2).map((c) => [c.start, c.end, c.speed])).toEqual([
      [0, 4, 2],
      [4, 10, 2]
    ])
  })

  it('moves what follows by the change in its length when its end is trimmed', () => {
    const trimmed = trimClip(fast, 'clip-1', 'end', 6, 20, true)
    expect(placed(trimmed)[1]!.from).toBe(3)
    expect(trimmed.music[0]!.at).toBe(10)
  })
})

describe('the fade of a clip, a text and a piece of music', () => {
  const faded: FilmEdit = {
    ...edit,
    texts: [
      {
        id: 'text-1',
        text: 'Hi',
        at: 1,
        seconds: 4,
        effect: 'fade',
        font: 'bold',
        x: 0.5,
        y: 0.5,
        size: 0.09,
        colour: '#ffffff'
      }
    ],
    music: [{ id: 'music-1', name: 's.mp3', at: 0, start: 0, end: 6, volume: 1 }]
  }

  it('is set to a tenth of a second and held to half of the item', () => {
    expect(setItemFade(faded, 'clips', 'clip-1', 'fadeIn', 1.26).clips[0]).toMatchObject({
      fadeIn: 1.3
    })
    expect(setItemFade(faded, 'clips', 'clip-1', 'fadeOut', 99).clips[0]).toMatchObject({
      fadeOut: 5
    })
    expect(setItemFade(faded, 'texts', 'text-1', 'fadeIn', 9).texts[0]).toMatchObject({ fadeIn: 2 })
    expect(setItemFade(faded, 'music', 'music-1', 'fadeOut', -2).music[0]).toMatchObject({
      fadeOut: 0
    })
    expect(setItemFade(faded, 'music', 'nope', 'fadeIn', 1)).toBe(faded)
  })

  it('follows the size of the item when it is trimmed, and does not come back when it grows', () => {
    const long = setItemFade(faded, 'clips', 'clip-1', 'fadeIn', 4)
    const trimmed = fitItemFades(trimClip(long, 'clip-1', 'end', 2, 10, true))

    expect(trimmed.clips[0]).toMatchObject({ end: 2, fadeIn: 1 })
    expect(trimClip(trimmed, 'clip-1', 'end', 10, 10, true).clips[0]).toMatchObject({ fadeIn: 1 })
  })

  it('leaves a fade that fits, and an item with none, as they are', () => {
    const fits = setItemFade(faded, 'texts', 'text-1', 'fadeOut', 1)

    expect(fitItemFades(fits)).toBe(fits)
    expect(fitItemFades(faded)).toBe(faded)
  })
})
