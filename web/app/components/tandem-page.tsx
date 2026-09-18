import { hasCompletePassenger, tandemUploadKey } from '@skydock/scripts'
import type { ProxyFact, StatusContext, TandemFact, UploadProgressState } from '@skydock/scripts'
import { Mini } from './buttons'
import { FileList, KindBadges } from './file-list'
import type { FileShape, Kind, Modifiers } from './file-list'
import {
  FilmStrip,
  GoneFromStorage,
  TandemActions,
  UploadStrip,
  UploadedCards
} from './tandem-card'
import type { ManifestFile, ManifestGroup } from './types'
import { formatTime, minFileMtime } from './utils'

/* A passenger's page: each of their jumps as the storage now knows it — what went missing over
   there, what was uploaded, the film — and, while the tandem is still here, its files and the one
   step it is at (RULES, Workflow). */
const TandemPage = ({
  groups,
  gone,
  uploadedAt,
  facts,
  busy,
  uploading,
  progress,
  kind,
  onKind,
  shape,
  picked,
  proxies,
  statusContext,
  gateFor,
  deliveredName,
  groupDropTarget,
  onSelectAll,
  onFile,
  onDragFile,
  onProcess,
  onMontage,
  onOpenMontage,
  onUpload,
  onFree
}: {
  /* the passenger's jumps, each as the storage now says it is */
  groups: ManifestGroup[]
  gone: Record<string, { remotePath: string }[]>
  uploadedAt: (groupId: string) => number | undefined
  facts: Record<string, TandemFact>
  busy: string | null
  uploading: string | null
  progress: UploadProgressState | null
  kind: Kind
  onKind: (kind: Kind) => void
  shape: FileShape
  picked: string[]
  proxies: Record<string, ProxyFact>
  statusContext: (file: ManifestFile) => StatusContext
  gateFor: (files: ManifestFile[]) => { blocked: boolean; message: string | null }
  deliveredName: (file: ManifestFile) => string | null
  groupDropTarget: (groupId: string) => Record<string, unknown>
  onSelectAll: (files: ManifestFile[]) => void
  onFile: (file: ManifestFile, lane: ManifestFile[], e: Modifiers) => void
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  onProcess: (group: ManifestGroup) => void
  onMontage: (group: ManifestGroup) => void
  onOpenMontage: (group: ManifestGroup) => void
  onUpload: (group: ManifestGroup) => void
  onFree: (group: ManifestGroup) => void
}) =>
  groups.map((group) => (
    <div key={group.id}>
      <GoneFromStorage
        gone={gone[group.id] ?? []}
        at={uploadedAt(group.id)}
      />
      {group.uploaded && <UploadedCards group={group} />}
      {!group.uploaded && <FilmStrip facts={facts[group.id]} />}
      {!group.freed && (
        <div
          {...groupDropTarget(group.id)}
          className='mt-2 mb-3.5 rounded-[9px] border border-line bg-pane'>
          <div className='flex flex-wrap items-center gap-[9px] border-b border-line-2 px-3 py-[9px]'>
            <span className='font-mono text-[12.5px] font-semibold tabular-nums'>
              {formatTime(minFileMtime(group.files) ?? 0)}
            </span>
            <KindBadges
              files={group.files}
              kind={kind}
              withAll
              onPick={onKind}
            />
            <Mini onClick={() => onSelectAll(group.files)}>Select all</Mini>
            <TandemActions
              group={group}
              facts={facts[group.id]}
              busy={busy}
              blocked={gateFor(group.files)}
              named={hasCompletePassenger(group.passenger)}
              onProcess={() => onProcess(group)}
              onMontage={() => onMontage(group)}
              onOpenMontage={() => onOpenMontage(group)}
              onUpload={() => onUpload(group)}
              onFree={() => onFree(group)}
            />
            {uploading === tandemUploadKey(group.id) && progress && (
              <span className='mt-0.5 flex-[1_1_100%]'>
                <UploadStrip progress={progress} />
              </span>
            )}
          </div>
          <div className='p-[9px]'>
            <FileList
              files={group.files}
              kind={kind}
              shape={shape}
              picked={picked}
              statusContext={statusContext}
              proxies={proxies}
              onFile={onFile}
              onDragFile={onDragFile}
              deliveredName={deliveredName}
              selecting={picked.length > 0}
            />
          </div>
        </div>
      )}
    </div>
  ))

export { TandemPage }
