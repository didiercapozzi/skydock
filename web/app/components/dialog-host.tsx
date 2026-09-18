import { buildPassengerFolder, isVideoFile, passengerOf } from '@skydock/scripts'
import type { TandemEntry, TandemFact } from '@skydock/scripts'
import { ComparisonDialog } from './comparison-dialog'
import { ConnectionDialog } from './connection-dialog'
import { EmailDialog } from './email-dialog'
import { FreeDialog } from './free-dialog'
import { NasFolderBrowser } from './nas-folder-browser'
import { ResetFreshDialog } from './reset-fresh-dialog'
import { TakeBackDialog } from './take-back-dialog'
import { TemplatesDialog } from './templates-dialog'
import type { TakeBackMode } from './take-back-dialog'
import { TrashDialog } from './trash-dialog'
import type { Destination, ManifestFile, ManifestGroup } from './types'
import { UploadDialog } from './upload-dialog'
import { TANDEMS, folderOnStorage } from '../helpers/jumps'
import type { BackupChoice } from '../hooks/useBackupChoice'

type UploadDialogState = { kind: 'upload'; groupId: string }

/* one value, so two dialogs can never be open at once; `destination` set means the folder is being
   chosen for that card rather than as the global default, and `back` is the dialog a folder was
   being chosen for, which it returns to once one is chosen */
type BoardDialog =
  | null
  | { kind: 'connect' }
  | { kind: 'folder'; destination?: string; target?: 'backup'; back?: UploadDialogState }
  | UploadDialogState
  | { kind: 'take-back'; mode: TakeBackMode; who: string }
  | { kind: 'free'; groupId: string }
  /* unsorted files about to go to the bin */
  | { kind: 'trash'; files: ManifestFile[] }
  /* a tandem on this board by its jump, or one the storage's list alone knows, by its folder */
  | { kind: 'email'; groupId?: string; folder?: string }
  /* Fresh files put back, by as much as is chosen there */
  | { kind: 'reset-fresh'; files: number; decided: number }
  /* the editing templates — chosen between for this tandem's montage, or only looked over */
  | { kind: 'templates'; groupId?: string }

const DialogHost = ({
  dialog,
  onDialog,
  nas,
  places,
  onChooseFolder,
  groups,
  asOnStorage,
  facts,
  folderFor,
  backup,
  onBackup,
  onUpload,
  storage,
  onEmailed,
  onFree,
  onTakeBack,
  onTrash,
  onMontage,
  onResetFresh,
  comparing
}: {
  dialog: BoardDialog
  onDialog: (dialog: BoardDialog) => void
  nas: {
    connectSucceeded: boolean
    error: string | undefined
    connect: (host: string, user: string, password: string) => void
    defaultFolder: string | null
    backupFolder: string | null
  }
  places: Destination[]
  onChooseFolder: (path: string, destination?: string, target?: 'backup') => void
  groups: ManifestGroup[]
  asOnStorage: (group: ManifestGroup) => ManifestGroup
  facts: Record<string, TandemFact>
  folderFor: (destination: string) => string | null
  backup: BackupChoice
  onBackup: (choice: BackupChoice) => void
  onUpload: (group: ManifestGroup) => void
  storage: { tandems: TandemEntry[] } | null
  onEmailed: (folder: string, sent: boolean, to: string) => void
  onFree: (group: ManifestGroup) => void
  onTakeBack: (mode: TakeBackMode, group: ManifestGroup) => void
  onTrash: (files: ManifestFile[]) => void
  onMontage: (groupId: string, template: string) => void
  onResetFresh: (what: 'times' | 'everything') => void
  comparing: {
    /* the two jumps side by side, when two are being compared */
    pair: [string, string] | null
    onClose: () => void
    onMerge: (leftId: string, rightId: string, anchorEpoch: number) => void
  }
}) => {
  const close = () => onDialog(null)
  return (
    <>
      {dialog?.kind === 'connect' && !nas.connectSucceeded && (
        <ConnectionDialog
          onConnect={nas.connect}
          onCancel={close}
          error={nas.error}
        />
      )}

      {dialog?.kind === 'folder' && (
        <NasFolderBrowser
          initialPath={
            dialog.destination
              ? (places.find((d) => d.name === dialog.destination)?.path ?? undefined)
              : dialog.target === 'backup'
                ? (nas.backupFolder ?? undefined)
                : (nas.defaultFolder ?? undefined)
          }
          title={
            dialog.destination
              ? `NAS folder for ${dialog.destination}`
              : dialog.target === 'backup'
                ? 'Folder for the original videos'
                : 'Default NAS upload folder'
          }
          onSelect={(path) => onChooseFolder(path, dialog.destination, dialog.target)}
          onClose={() => onDialog(dialog.back ?? null)}
        />
      )}

      {dialog?.kind === 'upload' &&
        (() => {
          const group = groups.find((g) => g.id === dialog.groupId)
          if (!group) return null
          const tandems = folderFor(TANDEMS)
          return (
            <UploadDialog
              who={passengerOf(group)}
              group={asOnStorage(group)}
              facts={facts[group.id]}
              backupFolder={nas.backupFolder}
              passengerFolder={
                tandems ? `${tandems}/${buildPassengerFolder(group.passenger, group.label)}` : null
              }
              choice={backup}
              onChoice={onBackup}
              onPickBackup={() => onDialog({ kind: 'folder', target: 'backup', back: dialog })}
              onPickPassenger={() =>
                onDialog({ kind: 'folder', destination: TANDEMS, back: dialog })
              }
              onClose={close}
              onUpload={() => onUpload(group)}
            />
          )
        })()}

      {dialog?.kind === 'email' &&
        (() => {
          /* a tandem on this board is drafted from its files; one the storage alone knows, from
             what its list says */
          const group = dialog.groupId ? groups.find((g) => g.id === dialog.groupId) : undefined
          const folder = dialog.folder ?? (group ? folderOnStorage(group) : null)
          const entry = folder ? storage?.tandems.find((t) => t.folder === folder) : undefined
          const shareUrl = group?.uploaded?.shareUrl ?? group?.publish?.shareUrl ?? entry?.shareUrl
          const about = group
            ? {
                firstname: group.passenger?.firstname ?? '',
                day: group.day,
                hasFilm: group.files.some((f) => isVideoFile(f.path)),
                photos: group.files.filter((f) => !isVideoFile(f.path)).length
              }
            : entry
              ? {
                  firstname: entry.firstname,
                  day: entry.day,
                  hasFilm: entry.videos > 0,
                  photos: entry.photos
                }
              : null
          if (!about || !shareUrl) return null
          return (
            <EmailDialog
              key={folder ?? dialog.groupId}
              about={{ ...about, shareUrl }}
              emailed={entry?.emailed ?? null}
              canRecord={Boolean(entry && folder)}
              onRecord={(sent, to) => folder && onEmailed(folder, sent, to)}
              onClose={close}
            />
          )
        })()}

      {dialog?.kind === 'free' &&
        (() => {
          const group = groups.find((g) => g.id === dialog.groupId)
          if (!group) return null
          return (
            <FreeDialog
              who={passengerOf(group)}
              group={group}
              onClose={close}
              onConfirm={() => onFree(group)}
            />
          )
        })()}

      {dialog?.kind === 'take-back' &&
        (() => {
          const theirs = groups.filter((g) => passengerOf(g) === dialog.who)
          const first = theirs[0]
          if (!first) return null
          return (
            <TakeBackDialog
              mode={dialog.mode}
              who={dialog.who}
              groups={theirs.map(asOnStorage)}
              facts={theirs.map((g) => facts[g.id])}
              onClose={close}
              onConfirm={() => onTakeBack(dialog.mode, first)}
            />
          )
        })()}

      {dialog?.kind === 'trash' && (
        <TrashDialog
          files={dialog.files}
          onClose={close}
          onConfirm={() => onTrash(dialog.files)}
        />
      )}

      {dialog?.kind === 'reset-fresh' && (
        <ResetFreshDialog
          files={dialog.files}
          decided={dialog.decided}
          onClose={close}
          onReset={onResetFresh}
        />
      )}

      {dialog?.kind === 'templates' &&
        (() => {
          const tandem = groups.find((g) => g.id === dialog.groupId)
          return (
            <TemplatesDialog
              who={tandem ? passengerOf(tandem) : undefined}
              onClose={close}
              onChoose={tandem ? (template) => onMontage(tandem.id, template) : undefined}
            />
          )
        })()}

      {comparing.pair && (
        <ComparisonDialog
          groups={groups}
          leftGroupId={comparing.pair[0]}
          rightGroupId={comparing.pair[1]}
          onClose={comparing.onClose}
          onMerge={comparing.onMerge}
        />
      )}
    </>
  )
}

export { DialogHost }
export type { BoardDialog }
