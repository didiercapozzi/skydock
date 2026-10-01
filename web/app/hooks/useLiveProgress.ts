import { t } from '@lingui/core/macro'
import { jsonText, liveEventSchema } from '@skydock/scripts'
import type { JumpMoments, LiveEvent, ProxyFact, MontageFact } from '@skydock/scripts'
import { useEffect, useEffectEvent, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { routingEngine } from '../helpers/routing'
import {
  forgetLive,
  liveBringing,
  liveCamera,
  liveFiles,
  liveImporting,
  liveKey
} from './liveStore'

/* what is being done to a file right now, and how far through it — in the words the events use */
type LiveFile = Pick<Extract<LiveEvent, { kind: 'file' }>, 'work' | 'percent'>

/* a camera being copied off, and how it ended — the ending numbered, so that two in a row are two */
type CameraCopy = Extract<LiveEvent, { kind: 'camera' }>
type CameraEnded = CameraCopy & { seq: number }

/* the room left on the output folder's disk */
type Disk = Omit<Extract<LiveEvent, { kind: 'disk' }>, 'kind'>

/* a camera plugged in right now: its name, and where it is mounted */
type Mounted = Extract<LiveEvent, { kind: 'cameras' }>['mounted'][number]

/* one file being copied in from the computer, by the name the page gave that copy */
type Importing = Omit<Extract<LiveEvent, { kind: 'import' }>, 'kind'>

/* one file being fetched back from the storage */
type Bringing = Omit<Extract<LiveEvent, { kind: 'bring' }>, 'kind'>

/* What is happening to the files as it happens, heard over one stream the server keeps open — so a
   file being processed, or a proxy being made, shows how far along it is with nobody asking. What
   moves many times a second goes to the live store (liveStore), read by what shows it; what the
   board itself shows is kept here. The
   browser reconnects by itself, and on connecting the server first says what is already under way.

   Only ever a hint for the eyes. What a file is comes from the board's own answers; the one thing
   taken from here is a proxy that has just landed, or the jump just found in a clip, which are facts
   the server read and sent with the event, so the clip is flagged the moment it is ready. */
const useLiveProgress = (
  onProxies: Dispatch<SetStateAction<Record<string, ProxyFact>>>,
  /* what a montage's folder holds, when it changed by the editor's hand — a film just rendered */
  onMontages: Dispatch<SetStateAction<Record<string, MontageFact>>>,
  onNote: Dispatch<SetStateAction<{ text: string; problem: boolean } | null>>,
  /* where the jump is in a clip, as it is found — `null` for a clip that shows none */
  onJump: (fileId: string, moments: JumpMoments | null) => void
) => {
  const found = useEffectEvent(onJump)
  const [ended, setEnded] = useState<CameraEnded | null>(null)
  const [cameras, setCameras] = useState<Mounted[]>([])
  const [disk, setDisk] = useState<Disk | null>(null)

  useEffect(() => {
    /* what an earlier line said is not taken for now: the server says again what is under way */
    forgetLive()
    const source = new EventSource(routingEngine.href({ url: '/api/events' }))
    source.onmessage = (message) => {
      const parsed = jsonText.pipe(liveEventSchema).safeParse(String(message.data))
      if (!parsed.success) return
      const event = parsed.data
      if (event.kind === 'montage') {
        onMontages((now) => ({ ...now, [event.groupId]: event.fact }))
        const who = event.who
        if (event.rendered)
          onNote({ text: t`${who}’s film is rendered — ready to upload`, problem: false })
        return
      }
      if (event.kind === 'camera') {
        /* the card's list comes once, at the start; after it, each file says how it went */
        if (event.state === 'copying')
          liveCamera.update((before) => {
            const same = before?.camera === event.camera && !event.files ? before : null
            return {
              ...event,
              files: event.files ?? same?.files,
              outcomes: event.outcomes ?? [
                ...(same?.outcomes ?? []),
                ...(event.last ? [event.last] : [])
              ]
            }
          })
        else {
          liveCamera.update(() => null)
          setEnded((before) => ({ ...event, seq: (before?.seq ?? 0) + 1 }))
        }
        return
      }
      if (event.kind === 'import') {
        /* Kept until the copy is over, not until its bytes are: a file whose last byte has landed
           is still being read, and a bar that emptied itself at that moment was the board saying a
           finished copy had not started. */
        liveImporting.update(() => (event.phase === 'done' ? null : event))
        return
      }
      if (event.kind === 'bring') {
        /* kept while it goes and a moment after, so the corner shows how it ended; the board's own
           answer says the file is back */
        liveBringing.update(() => (event.state === 'done' ? null : event))
        return
      }
      if (event.kind === 'disk') {
        setDisk({ free: event.free, total: event.total, level: event.level })
        return
      }
      if (event.kind === 'cameras') {
        setCameras(event.mounted)
        return
      }
      if (event.kind === 'file') {
        liveFiles.update((now) => {
          const key = liveKey(event.work, event.fileId)
          /* the same step said again changes nothing, and draws nothing */
          if (now[key]?.percent === event.percent) return now
          return { ...now, [key]: { work: event.work, percent: event.percent } }
        })
        return
      }
      liveFiles.update((now) => {
        const key = liveKey(event.work, event.fileId)
        if (!(key in now)) return now
        const { [key]: _ended, ...rest } = now
        return rest
      })
      const landed = event.proxy
      if (landed) onProxies((now) => ({ ...now, [landed.path]: landed.fact }))
      if (event.moments !== undefined) found(event.fileId, event.moments)
    }
    return () => source.close()
  }, [onProxies, onMontages, onNote])

  return { ended, cameras, disk }
}

export { useLiveProgress }
export type { Bringing, CameraCopy, CameraEnded, Disk, Importing, LiveFile, Mounted }
