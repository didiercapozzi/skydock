import {
  attrsOf,
  childrenOf,
  framesOf,
  isAudioTrack,
  lengthOf,
  nodeById,
  tagOf,
  timelineTracks,
  tracksOf
} from './lib/mlt'
import type { XmlNode } from './lib/mlt'

/* What a template puts around the footage — the intro, the end card, the music — moved to the ends
   of the film that was actually built.

   A template is made for a film of a certain length; a montage is as long as the footage it was
   given, which is never that length. The shipped one ends its card at 7:42 and its music at 9:56,
   while a tandem's seventeen clips run to 19:09 — so the card lands a third of the way in, over the
   plane ride, and the music stops in the middle. Every one of them is dragged by hand afterwards.

   Only the ends are answered here. The intro is already at the start and stays there; the titles in
   the middle are somebody's idea of where they belong and are left alone. A template whose shape is
   not recognised is left exactly as it arrived rather than mangled, and what did move is said out
   loud when the montage is made. */

/* The first playlist of a track, which is where its clips are: the second is kdenlive's own lane for
   two clips of one track crossing over, and nothing here has any business in it. */
const playlistOf = (mlt: XmlNode[], tractor: XmlNode) => {
  const id = attrsOf(tracksOf(tractor)[0] ?? {})['@_producer']
  return id ? (nodeById(mlt, 'playlist', id) ?? null) : null
}

const entriesIn = (playlist: XmlNode) => childrenOf(playlist).filter((c) => tagOf(c) === 'entry')

/* What a track actually holds, with where each of them sits in the document. A project is written
   indented, and the spaces between one tag and the next are children too — so the last thing on a
   track is the newline after its last clip, not the clip, and a shape read without knowing that is
   never recognised. */
const itemsIn = (playlist: XmlNode) =>
  childrenOf(playlist).flatMap((node, index) =>
    tagOf(node) === 'blank' || tagOf(node) === 'entry' ? [{ node, index }] : []
  )

const spanOf = (node: XmlNode, fps: number) => {
  const attrs = attrsOf(node)
  return tagOf(node) === 'blank'
    ? framesOf(attrs['@_length'], fps)
    : framesOf(attrs['@_out'], fps) - framesOf(attrs['@_in'], fps) + 1
}

/* Read before the jump is laid, never after: A1 is empty in a template and fills with the jump's own
   sound, which from here looks exactly like music. */
const readFurniture = (
  mlt: XmlNode[],
  sequence: XmlNode,
  videoTrackId: string,
  soundPlaylist: XmlNode | null
) => {
  const tracks = timelineTracks(mlt, sequence)
  const video = tracks.filter((t) => !isAudioTrack(t))
  const top = video[video.length - 1]
  const titles =
    top && attrsOf(tracksOf(top)[0] ?? {})['@_producer'] !== videoTrackId
      ? playlistOf(mlt, top)
      : null
  /* the music is whichever audio track a template already put something on, and there is one or it
     is not clear enough to touch */
  const sounded = tracks.filter(isAudioTrack).flatMap((t) => {
    const playlist = playlistOf(mlt, t)
    return playlist && playlist !== soundPlaylist && entriesIn(playlist).length > 0
      ? [playlist]
      : []
  })
  return { titles, music: sounded.length === 1 ? sounded[0]! : null }
}

/* The end card follows the last clip, so the film ends on the card rather than on footage. Moved by
   the blank in front of it and nothing else: its own length is the template's business, and a card
   that is also the first thing on its track is an intro, not an end. */
const moveEndCard = (titles: XmlNode, filmEnd: number, fps: number) => {
  const items = itemsIn(titles)
  const card = items[items.length - 1]
  const before = items[items.length - 2]
  if (!card || !before || tagOf(card.node) !== 'entry' || tagOf(before.node) !== 'blank')
    return false
  const gap = framesOf(attrsOf(before.node)['@_length'], fps)
  const start = items.slice(0, -1).reduce((sum, item) => sum + spanOf(item.node, fps), 0)
  const moved = gap + (filmEnd - start)
  if (moved < 0) return false
  attrsOf(before.node)['@_length'] = String(moved)
  return true
}

/* The music stops when the film does. Its last piece is cut where the film ends and whatever came
   after it is dropped; music that runs out before the film is left as it is, since there is nothing
   to invent. Nothing is ever stretched or moved forward. */
const cutMusic = (music: XmlNode, end: number, fps: number) => {
  const children = childrenOf(music)
  let at = 0
  for (const { node, index } of itemsIn(music)) {
    const attrs = attrsOf(node)
    const blank = tagOf(node) === 'blank'
    const length = spanOf(node, fps)
    if (at + length > end) {
      const keep = end - at
      if (keep <= 0) children.splice(index)
      else {
        if (blank) attrs['@_length'] = String(keep)
        else attrs['@_out'] = String(framesOf(attrs['@_in'], fps) + keep - 1)
        children.splice(index + 1)
      }
      return true
    }
    at += length
  }
  return false
}

/* Where the film ends is the last thing anybody sees: the last clip, or the card that follows it.
   Which is why the card is moved first and the music cut to whatever the answer then is — and why a
   card that could not be moved still has the music played over it rather than under silence. */
const followTheFilm = (
  furniture: { titles: XmlNode | null; music: XmlNode | null },
  filmEnd: number,
  fps: number
) => {
  const moved: string[] = []
  if (furniture.titles && moveEndCard(furniture.titles, filmEnd, fps)) moved.push('the end card')
  const ends = Math.max(filmEnd, furniture.titles ? lengthOf(furniture.titles, fps) : 0)
  if (furniture.music && cutMusic(furniture.music, ends, fps)) moved.push('the music')
  return moved
}

export { followTheFilm, readFurniture }
