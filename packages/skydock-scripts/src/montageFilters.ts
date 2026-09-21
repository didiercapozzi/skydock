import type { Piece } from './montageCuts'

/* The few effects a montage writes, in the shape kdenlive writes them — the one place in SkyDock
   that writes a filter at all.

   Only what is the same on every film: it opens out of black, it closes into black, and the music
   fades out rather than stopping dead. Nothing that is a judgement about a particular jump — no
   speed changes, no ducking — because those are choices about a canopy ride nobody here has seen.

   Keyframes are written in frames, counted in the clip's own time, which is where the editor's own
   fades put them. */

/* a second, which is what a fade is unless somebody changes it in the editor */
const FADE_SECONDS = 1

const filterOf = (id: string, attrs: Record<string, string>, properties: [string, string][]) => ({
  filter: properties.map(([name, value]) => ({
    property: [{ '#text': value }],
    ':@': { '@_name': name }
  })),
  ':@': { '@_id': id, ...attrs }
})

/* out of black at the very start of the film */
const fadeFromBlack = (id: string, piece: Piece, fps: number) => {
  const over = Math.max(1, Math.min(Math.round(FADE_SECONDS * fps), piece.out - piece.in))
  return filterOf(id, { '@_out': String(piece.in + over) }, [
    ['start', '1'],
    ['level', '1'],
    ['mlt_service', 'brightness'],
    ['kdenlive_id', 'fade_from_black'],
    ['alpha', `${piece.in}=0;${piece.in + over}=1`]
  ])
}

/* and into black at its end */
const fadeToBlack = (id: string, piece: Piece, fps: number) => {
  const over = Math.max(1, Math.min(Math.round(FADE_SECONDS * fps), piece.out - piece.in))
  return filterOf(id, { '@_in': String(piece.out - over), '@_out': String(piece.out) }, [
    ['start', '1'],
    ['level', '1'],
    ['mlt_service', 'brightness'],
    ['kdenlive_id', 'fade_to_black'],
    ['alpha', `${piece.out - over}=1;${piece.out}=0`]
  ])
}

/* The music goes quiet where it ends instead of being cut off mid-bar. In decibels, which is how a
   volume curve is written: nothing taken off at the start of the fade, everything by the end. */
const SILENCE = '-60'

const musicFadeOut = (id: string, piece: Piece, fps: number) => {
  const over = Math.max(1, Math.min(Math.round(FADE_SECONDS * fps), piece.out - piece.in))
  return filterOf(id, { '@_in': String(piece.out - over), '@_out': String(piece.out) }, [
    ['window', '75'],
    ['max_gain', '20dB'],
    ['level', `${piece.out - over}=0;${piece.out}=${SILENCE}`],
    ['channel_mask', '-1'],
    ['mlt_service', 'volume'],
    ['kdenlive_id', 'volume']
  ])
}

export { fadeFromBlack, fadeToBlack, musicFadeOut }
