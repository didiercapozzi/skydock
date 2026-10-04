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
  liveDeleting,
  liveFreeing,
  liveFiles,
  liveImporting,
  liveKey
} from './liveStore'

type LiveFile = Pick<Extract<LiveEvent, { kind: 'file' }>, 'work' | 'percent'>

type CameraCopy = Extract<LiveEvent, { kind: 'camera' }>
type CameraEnded = CameraCopy & { seq: number }

type Disk = Omit<Extract<LiveEvent, { kind: 'disk' }>, 'kind'>

type Mounted = Extract<LiveEvent, { kind: 'cameras' }>['mounted'][number]

type Importing = Omit<Extract<LiveEvent, { kind: 'import' }>, 'kind'>

type Freeing = Omit<Extract<LiveEvent, { kind: 'free' }>, 'kind'>

type Deleting = Omit<Extract<LiveEvent, { kind: 'camera-delete' }>, 'kind' | 'path'>

type Bringing = Omit<Extract<LiveEvent, { kind: 'bring' }>, 'kind'>

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
      if (event.kind === 'camera') {
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
        liveImporting.update(() => (event.phase === 'done' ? null : event))
        return
      }
      if (event.kind === 'free') {
        liveFreeing.update(() => (event.stage === 'done' ? null : event))
        return
      }
      if (event.kind === 'camera-delete') {
        liveDeleting.update((now) => ({
          ...now,
          [event.path]: {
            stage: event.stage,
            part: event.part,
            size: event.size ?? now[event.path]?.size
          }
        }))
        setTimeout(() => {
          const rest = Object.values(liveDeleting.get())
          if (rest.length > 0 && rest.every((d) => d.stage === 'done' || d.stage === 'failed'))
            liveDeleting.update(() => ({}))
        }, 2500)
        return
      }
      if (event.kind === 'board') {
        setChanged(event.stamp)
        return
      }
      if (event.kind === 'bring') {
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
export type { Bringing, CameraCopy, Deleting, Disk, Freeing, Importing, LiveFile, Mounted }
