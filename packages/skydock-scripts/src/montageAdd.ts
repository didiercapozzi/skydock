import { startOfFiles } from './clustering'
import { outputKeyOf } from './fileStatus'
import { isMontage } from './filed'
import { isNamedMontage } from './montageArtifacts'
import { copyFiles, moveFiles } from './moveFiles'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { isVideoFile, parseDayEpoch } from './utils'
import { passengerOf } from './workspace'

type ClipOrigin =
  | { kind: 'loose' }
  | { kind: 'dropzone'; name: string }
  | { kind: 'jump'; name: string }
  | { kind: 'montage'; name: string }

type ClipCandidate = {
  id: string
  filename: string
  path: string
  mtime: number
  origin: ClipOrigin
  freed: boolean
  still: boolean
}

const contentOf = (file: { id?: string; copyOf?: string; path: string }) =>
  file.copyOf ?? file.id ?? file.path

const originOf = (manifest: Manifest, file: ManifestFile): ClipOrigin => {
  const group = manifest.groups.find((g) => g.files.some((f) => contentOf(f) === contentOf(file)))
  if (group) {
    if (isNamedMontage(group)) return { kind: 'montage', name: passengerOf(group) }
    if (isMontage(group)) return { kind: 'montage', name: group.label }
    return { kind: 'jump', name: group.destination ?? group.label }
  }
  return file.destination ? { kind: 'dropzone', name: file.destination } : { kind: 'loose' }
}

const isLoose = (manifest: Manifest, file: ManifestFile) =>
  !file.destination && !manifest.groups.some((g) => g.files.some((f) => f.id === file.id))

const jumpTime = (group: ManifestGroup) =>
  group.files.length > 0 ? startOfFiles(group.files) : (parseDayEpoch(group.day) ?? 0)

/* Everything on the board that is not in this montage yet, the nearest in time to the jump first. */
const clipCandidates = (manifest: Manifest, groupId: string): ClipCandidate[] => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) return []
  const held = new Set(group.files.map(contentOf))
  const at = jumpTime(group)
  return manifest.files
    .filter((f) => f.id && !f.copyOf && !held.has(contentOf(f)))
    .map((f) => ({
      id: f.id!,
      filename: f.filename,
      path: f.path,
      mtime: f.mtime,
      origin: originOf(manifest, f),
      freed: f.freed === true,
      still: !isVideoFile(f.path)
    }))
    .sort((a, b) => Math.abs(a.mtime - at) - Math.abs(b.mtime - at))
}

/* Clips join a montage: those loose in Fresh files move in, those that are somewhere else are copied in
   and stay where they are. Nothing is made for them — a montage is edited where its clips are — and the
   montage's own record of having been prepared is as it was. */
const addToMontage = async (manifest: Manifest, groupId: string, ids: Set<string>) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('That montage is no longer on the board.')
  const before = new Set(group.files.map(outputKeyOf))
  const was = group.processed
  const asked = manifest.files.filter((f) => f.id && ids.has(f.id))
  const here = asked.filter((f) => !f.freed)
  const loose = here.filter((f) => isLoose(manifest, f))
  const looseIds = new Set(loose.map((f) => f.id!))
  const others = new Set(here.flatMap((f) => (looseIds.has(f.id!) ? [] : [f.id!])))

  if (looseIds.size > 0) await moveFiles(manifest, looseIds, { targetGroupId: groupId })
  const copied = others.size > 0 ? copyFiles(manifest, others, groupId) : null
  /* moving rebuilds the groups, so the montage is looked up again */
  const now = manifest.groups.find((g) => g.id === groupId) ?? group
  now.processed = was

  return {
    keys: now.files.map(outputKeyOf).filter((key) => !before.has(key)),
    freed: asked.length - here.length,
    passedOver: copied?.passedOver ?? 0
  }
}

export { addToMontage, clipCandidates }
export type { ClipCandidate, ClipOrigin }
