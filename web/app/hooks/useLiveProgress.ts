import { t } from '@lingui/core/macro'
import { jsonText, liveEventSchema, mergeRow } from '@skydock/scripts'
import type { JobRow, JumpMoments, LiveEvent, ProxyFact, MontageFact } from '@skydock/scripts'
import { useEffect, useEffectEvent, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { routingEngine } from '../helpers/routing'
import { forgetLive, liveJobs, liveFiles, liveKey } from './liveStore'

type LiveFile = Pick<Extract<LiveEvent, { kind: 'file' }>, 'work' | 'percent'>

type JobOutcome = NonNullable<Extract<LiveEvent, { kind: 'job' }>['outcome']>
type CameraEnded = JobOutcome & { camera: string; reason?: string; seq: number }

type Disk = Omit<Extract<LiveEvent, { kind: 'disk' }>, 'kind'>

type Mounted = Extract<LiveEvent, { kind: 'cameras' }>['mounted'][number]

type Job = Omit<Extract<LiveEvent, { kind: 'job' }>, 'kind' | 'row' | 'rows'> & { rows: JobRow[] }

const useLiveProgress = (
  onProxies: Dispatch<SetStateAction<Record<string, ProxyFact>>>,
  onMontages: Dispatch<SetStateAction<Record<string, MontageFact>>>,
  onNote: Dispatch<SetStateAction<{ text: string; problem: boolean } | null>>,
  onJump: (fileId: string, moments: JumpMoments | null) => void
) => {
  const found = useEffectEvent(onJump)
  const [ended, setEnded] = useState<CameraEnded | null>(null)
  const [cameras, setCameras] = useState<Mounted[]>([])
  const [disk, setDisk] = useState<Disk | null>(null)
  const [changed, setChanged] = useState<string | null>(null)

  useEffect(() => {
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
        const { kind: _, row, rows, outcome, ...fields } = event
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
