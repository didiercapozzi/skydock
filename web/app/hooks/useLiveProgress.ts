import { t } from '@lingui/core/macro'
import { jsonText, liveEventSchema, mergeRow } from '@skydock/scripts'
import type { JobRow, JumpMoments, LiveEvent, ProxyFact, MontageFact } from '@skydock/scripts'
import { useEffect, useEffectEvent, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { routingEngine } from '../helpers/routing'
import { forgetLive, liveJobs, liveFiles, liveKey } from './liveStore'

/* what is being done to a file right now, and how far through it — in the words the events use */
type LiveFile = Pick<Extract<LiveEvent, { kind: 'file' }>, 'work' | 'percent'>

/* a camera copied off, and how it ended — the ending numbered, so that two in a row are two */
type JobOutcome = NonNullable<Extract<LiveEvent, { kind: 'job' }>['outcome']>
type CameraEnded = JobOutcome & { camera: string; reason?: string; seq: number }

/* the room left on the output folder's disk */
type Disk = Omit<Extract<LiveEvent, { kind: 'disk' }>, 'kind'>

/* a camera plugged in right now: its name, and where it is mounted */
type Mounted = Extract<LiveEvent, { kind: 'cameras' }>['mounted'][number]

/* a task with no file of its own, as it goes */
type Job = Omit<Extract<LiveEvent, { kind: 'job' }>, 'kind' | 'row' | 'rows'> & { rows: JobRow[] }

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
  /* which state of the board's record was last said to have changed outside this page */
  const [changed, setChanged] = useState<string | null>(null)

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
      if (event.kind === 'job') {
        /* kept while it goes, and when it fails, so the corner says why until it is put away */
        const { kind: _, row, rows, outcome, ...fields } = event
        /* a card copied off has ended: the board looks again at what came off it */
        if (outcome && event.type === 'camera-copy')
          setEnded((before) => ({
            ...outcome,
            camera: event.label,
            ...(event.reason ? { reason: event.reason } : {}),
            seq: (before?.seq ?? 0) + 1
          }))
        liveJobs.update((jobs) => {
          if (event.stage === 'done') {
            const { [event.id]: _ended, ...rest } = jobs
            return rest
          }
          const known = jobs[event.id]?.rows ?? []
          return {
            ...jobs,
            [event.id]: { ...fields, rows: rows ?? (row ? mergeRow(known, row) : known) }
          }
        })
        return
      }
      if (event.kind === 'board') {
        setChanged(event.stamp)
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

  return { ended, cameras, disk, changed }
}

export { useLiveProgress }
export type { Disk, Job, LiveFile, Mounted }
