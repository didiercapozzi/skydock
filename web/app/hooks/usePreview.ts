import { isVideoFile } from '@skydock/scripts'
import type { FrameCrop, Rotation } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { VideoRef } from '../components/preview-drawer'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { placeHref } from '../helpers/places'
import type { Place } from '../helpers/places'
import { openFile } from '../helpers/previewWindow'
import type { BoardView } from '../helpers/view'

type CropRange = { cropStart: number | null; cropEnd: number | null }

/* What is being decided about the file on screen and has not been saved yet: the trim, the
   rectangle, the turn, and where the playhead is. It belongs to the one file it is about, so it is
   kept with that file's name on it — step to the next clip and what is on screen is that clip's
   own trim, frame and turn, never the one just left, without anything having to be cleared. */
type Draft = {
  id: string
  crop: CropRange
  zoom: number
  currentTime: number
  duration: number
  frame: FrameCrop | null
  rotation: Rotation
}

/* `LOOSE` stands where a jump id would go, for a file that belongs to no jump: its crop has no
   group reference to live on, so it is saved on the registry entry instead. */
const LOOSE = 'loose'

const idOf = (file: ManifestFile) => file.id ?? file.path

/* A clip as it stands: its own trim, frame and turn, and the playhead where its trim starts — a
   trimmed clip begins there, which is where the copy made from it begins. */
const asItStands = (file: ManifestFile): Draft => ({
  id: idOf(file),
  crop: { cropStart: file.cropStart ?? null, cropEnd: file.cropEnd ?? null },
  zoom: 1,
  currentTime: file.cropStart ?? 0,
  duration: 0,
  frame: file.frame ?? null,
  rotation: file.rotation ?? 0
})

/* The file the address says is open, and the files it steps through: a jump's, in the jump's order,
   or the one file alone when it belongs to no jump. */
const shownIn = (groups: ManifestGroup[], loose: ManifestFile[], fileId: string | undefined) => {
  if (!fileId) return null
  const inJump = groups.flatMap((group) =>
    group.files.filter((file) => idOf(file) === fileId).map((file) => ({ group, file }))
  )[0]
  if (inJump)
    return {
      files: inJump.group.files,
      index: inJump.group.files.findIndex((file) => idOf(file) === fileId),
      groupId: inJump.group.id
    }
  const lone = loose.find((file) => idOf(file) === fileId)
  return lone ? { files: [lone], index: 0, groupId: LOOSE } : null
}

/* Which file is open is part of the address: opening one is a navigation, closing it goes back to
   the folder, and stepping to the next clip is another address again — so the browser's back button
   walks the clips somebody looked at, and a clip can be reloaded or sent to somebody as it is
   (RULES, The board). What is being decided about it is not: a trim nobody has saved is not
   something to come back to. */
const usePreview = ({
  groups,
  loose,
  place,
  fileId,
  view,
  saving = false,
  onGroupsChange,
  onFileCrop
}: {
  groups: ManifestGroup[]
  loose: ManifestFile[]
  place: Place
  fileId: string | undefined
  /* how the folder behind is being looked at, which an address keeps hold of: opening a clip and
     closing it again leaves the folder exactly as it was */
  view: BoardView
  /* a save is on its way: a window of its own is closed only once it has landed, since closing the page
     first would take the request with it */
  saving?: boolean
  onGroupsChange: (next: ManifestGroup[]) => void
  /* a lone file's crop has no group reference to live on, so it is saved on the registry entry —
     the frame goes the same way */
  onFileCrop: (
    file: ManifestFile,
    range: CropRange,
    frame?: FrameCrop | null,
    rotation?: Rotation
  ) => void
}) => {
  const goTo = useNavigate()
  const [drafted, setDrafted] = useState<Draft | null>(null)
  const [closing, setClosing] = useState(false)
  const videoRefRef = useRef<VideoRef | null>(null)

  const preview = shownIn(groups, loose, fileId)
  const file = preview?.files[preview.index]
  /* the file's own state until somebody changes something, and what they changed after that */
  const draft = file && drafted?.id === idOf(file) ? drafted : file ? asItStands(file) : null
  /* each edit starts from the latest draft, so several in one click all land */
  const edit = (next: Partial<Draft>) =>
    file && setDrafted((now) => ({ ...(now?.id === idOf(file) ? now : asItStands(file)), ...next }))

  /* the window of its own is the file's, and stepping in it stays in it */
  const windowed = view.window === 'preview'
  const openPreview = (file: ManifestFile) => openFile(goTo, place, idOf(file), view)

  const stepPreview = (by: number) => {
    if (!preview) return
    const next = preview.files[Math.min(Math.max(preview.index + by, 0), preview.files.length - 1)]
    if (next && idOf(next) !== fileId) openPreview(next)
  }

  const handleVideoSeek = (time: number) => {
    edit({ currentTime: time })
    videoRefRef.current?.seek(time)
  }

  /* The footage moving on its own, which is playing it: where it has got to is where the timeline,
     the graph and the clock all stand. It is told, never sent anywhere — sending a playing video to
     where it already is stutters it. */
  const handleVideoTime = (time: number) => {
    if (draft && draft.currentTime !== time) edit({ currentTime: time })
  }

  const closePreview = () => {
    videoRefRef.current = null
    /* a window of its own is closed, there being no board in it to go back to */
    if (windowed) window.close()
    else goTo(placeHref(place, view))
  }

  /* Applying a crop is the end of the job: it is saved and the drawer gets out of the way, so the
     card behind it — where the ✂ and the status have just changed — is what you see next.
     The timeline's `Reset trim` comes through here with an empty range and leaves the drawer open
     to set a new one; Save closes it whatever it saved. */
  const committed = (range: CropRange) =>
    range.cropStart !== null ||
    range.cropEnd !== null ||
    draft?.frame != null ||
    Boolean(draft?.rotation)

  const handleVideoApply = (range: CropRange, { close = false } = {}) => {
    if (!preview || !file || !draft) return
    const { frame, rotation } = draft
    if (preview.groupId === LOOSE) onFileCrop(file, range, frame, rotation)
    else
      onGroupsChange(
        groups.map((g) =>
          g.id !== preview.groupId
            ? g
            : {
                ...g,
                files: g.files.map((f) =>
                  f.path === file.path
                    ? { ...f, cropStart: range.cropStart, cropEnd: range.cropEnd, frame, rotation }
                    : f
                )
              }
        )
      )
    edit({ crop: range })
    if (!close && !committed(range)) return
    if (windowed) setClosing(true)
    else closePreview()
  }

  /* A mount is mounted badly for the whole jump, so one rectangle usually wants to be all of them.
     Only the clips get it — a photo has no frame crop — and it replaces whatever each had. */
  const handleFrameApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE || !file) return
    const frame = draft?.frame ?? null
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (isVideoFile(f.path) ? { ...f, frame } : f)) }
      )
    )
  }

  /* A camera on its side is on its side for the whole jump, so one turn usually wants to be all of
     them — but only the files of the same kind as this one, since a jump's clips and its photos can
     come off different cameras. It replaces whatever each had, and touches nothing else. */
  const handleRotationApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE || !file) return
    const rotation = draft?.rotation ?? 0
    const sameKind = (f: ManifestFile) => isVideoFile(f.path) === isVideoFile(file.path)
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (sameKind(f) ? { ...f, rotation } : f)) }
      )
    )
  }

  /* closed once the save has been seen to start and to end; and if none ever starts — nothing was
     changed — after a moment, since waiting for ever on a save that is not coming is worse */
  const sawSaving = useRef(false)
  useEffect(() => {
    if (!closing) return
    if (saving) {
      sawSaving.current = true
      return
    }
    if (sawSaving.current) {
      closePreview()
      return
    }
    const later = setTimeout(closePreview, 1500)
    return () => clearTimeout(later)
    // closing it is the whole of what this does, once the save is over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, saving])

  const handleVideoRef = (ref: VideoRef) => {
    videoRefRef.current = ref
  }

  return {
    preview,
    windowed,
    videoState: {
      crop: draft?.crop ?? { cropStart: null, cropEnd: null },
      zoom: draft?.zoom ?? 1,
      currentTime: draft?.currentTime ?? 0,
      duration: draft?.duration ?? 0
    },
    openPreview,
    stepPreview,
    handleVideoSeek,
    handleVideoTime,
    handleVideoApply,
    frame: draft?.frame ?? null,
    rotation: draft?.rotation ?? 0,
    handleRotate: (rotation: Rotation) => edit({ rotation }),
    handleFrameChange: (frame: FrameCrop | null) => edit({ frame }),
    handleFrameApplyToJump,
    handleRotationApplyToJump,
    handleVideoRef,
    setVideoState: edit,
    closePreview
  }
}

export { LOOSE, usePreview }
