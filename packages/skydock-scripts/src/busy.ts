import { busyAmong } from './busyScope'
import type { Busy, BusyScope, Work } from './busyScope'
import { renderingNow } from './filmRender'
import { getGroupProcessedDir, isFlatGroup, processingAll } from './process'
import type { Manifest } from './types'
import { uploadingNow } from './uploading'

const workNow = (): Work[] => {
  const upload = uploadingNow()
  return [
    ...processingAll().map((run) => ({ type: 'process' as const, ...run })),
    ...(upload
      ? [
          {
            type: 'upload' as const,
            groupIds: upload.groupIds,
            destinations: upload.key.startsWith('dest:') ? [upload.key.slice('dest:'.length)] : []
          }
        ]
      : []),
    ...[...renderingNow().keys()].map((id) => ({
      type: 'render' as const,
      groupIds: [id],
      destinations: []
    }))
  ]
}

const busyWith = (scope: BusyScope, among?: Work['type'][]) => busyAmong(workNow(), scope, among)

const busySaid = (busy: Busy) =>
  busy === 'processing'
    ? 'It is being processed — wait for it to finish.'
    : busy === 'uploading'
      ? 'It is being uploaded — wait for the upload to finish.'
      : 'Its film is being rendered — wait for the render to finish, or cancel it.'

const jumpsOfMontage = (manifest: Manifest, outputDir: string, groupId: string) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group || isFlatGroup(group)) return [groupId]
  const { dir } = getGroupProcessedDir(outputDir, group)
  return [
    groupId,
    ...manifest.groups
      .filter(
        (g) => g.id !== groupId && !isFlatGroup(g) && getGroupProcessedDir(outputDir, g).dir === dir
      )
      .map((g) => g.id)
  ]
}

const scopeOfFiles = (manifest: Manifest, ids: Set<string>) => {
  const going = manifest.files.filter((f) => f.id && ids.has(f.id))
  const copies = new Set(
    manifest.files.flatMap((f) => (f.copyOf && ids.has(f.copyOf) && f.id ? [f.id] : []))
  )
  const touched = (id: string | undefined) => !!id && (ids.has(id) || copies.has(id))
  return {
    groupIds: manifest.groups.filter((g) => g.files.some((f) => touched(f.id))).map((g) => g.id),
    destinations: [...new Set(going.flatMap((f) => (f.destination ? [f.destination] : [])))]
  }
}

const busyWithFiles = (manifest: Manifest, ids: Set<string>) => {
  const scope = scopeOfFiles(manifest, ids)
  const loose = scope.groupIds.length === 0 && scope.destinations.length === 0
  return busyWith(scope, loose ? ['process', 'render'] : undefined)
}

export { busySaid, busyWith, busyWithFiles, jumpsOfMontage, scopeOfFiles }
