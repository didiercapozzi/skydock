import { jsonText, liveEventSchema } from '@skydock/scripts'
import type { LiveEvent, ProxyFact, TandemFact } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { routingEngine } from '../helpers/routing'

/* what is being done to a file right now, and how far through it */
type LiveFile = { work: 'process' | 'proxy'; percent: number }

/* a camera being copied off, and how it ended — the ending numbered, so that two in a row are two */
type CameraCopy = Extract<LiveEvent, { kind: 'camera' }>
type CameraEnded = CameraCopy & { seq: number }

/* the room left on the output folder's disk */
type Disk = Omit<Extract<LiveEvent, { kind: 'disk' }>, 'kind'>

/* a camera plugged in right now: its name, and where it is mounted */
type Mounted = Extract<LiveEvent, { kind: 'cameras' }>['mounted'][number]

/* one file being copied in from the computer, by the name the page gave that copy */
type Importing = Omit<Extract<LiveEvent, { kind: 'import' }>, 'kind'>

/* What is happening to the files as it happens, heard over one stream the server keeps open — so a
   file being processed, or a proxy being made, shows how far along it is with nobody asking. The
   browser reconnects by itself, and on connecting the server first says what is already under way.

   Only ever a hint for the eyes. What a file is comes from the board's own answers; the one thing
   taken from here is a proxy that has just landed, which is a fact the server read off the disk and
   sent with the event, so the clip is flagged the moment it is ready. */
const useLiveProgress = (
  onProxies: Dispatch<SetStateAction<Record<string, ProxyFact>>>,
  /* what a tandem's folder holds, when it changed by the editor's hand — a film just rendered */
  onTandems: Dispatch<SetStateAction<Record<string, TandemFact>>>,
  onNote: Dispatch<SetStateAction<string | null>>
) => {
  const [files, setFiles] = useState<Record<string, LiveFile>>({})
  const [camera, setCamera] = useState<CameraCopy | null>(null)
  const [ended, setEnded] = useState<CameraEnded | null>(null)
  const [cameras, setCameras] = useState<Mounted[]>([])
  const [disk, setDisk] = useState<Disk | null>(null)
  const [importing, setImporting] = useState<Importing | null>(null)

  useEffect(() => {
    const source = new EventSource(routingEngine.href({ url: '/api/events' }))
    source.onmessage = (message) => {
      const parsed = jsonText.pipe(liveEventSchema).safeParse(String(message.data))
      if (!parsed.success) return
      const event = parsed.data
      if (event.kind === 'tandem') {
        onTandems((now) => ({ ...now, [event.groupId]: event.fact }))
        if (event.rendered) onNote(`${event.who}’s film is rendered — ready to upload`)
        return
      }
      if (event.kind === 'camera') {
        if (event.state === 'copying') setCamera(event)
        else {
          setCamera(null)
          setEnded((before) => ({ ...event, seq: (before?.seq ?? 0) + 1 }))
        }
        return
      }
      if (event.kind === 'import') {
        /* Kept until the copy is over, not until its bytes are: a file whose last byte has landed
           is still being read, and a bar that emptied itself at that moment was the board saying a
           finished copy had not started. */
        setImporting(event.phase === 'done' ? null : event)
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
        setFiles((now) => ({
          ...now,
          [event.fileId]: { work: event.work, percent: event.percent }
        }))
        return
      }
      setFiles((now) => {
        const { [event.fileId]: _ended, ...rest } = now
        return rest
      })
      const landed = event.proxy
      if (landed) onProxies((now) => ({ ...now, [landed.path]: landed.fact }))
    }
    return () => source.close()
  }, [onProxies, onTandems, onNote])

  return { files, camera, ended, cameras, disk, importing }
}

export { useLiveProgress }
export type { CameraCopy, CameraEnded, Disk, Importing, LiveFile, Mounted }
