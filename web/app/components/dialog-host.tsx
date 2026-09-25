import { buildPassengerFolder, isVideoFile, lostOf, passengerOf } from '@skydock/scripts'
import type { MontageEntry, MontageLost, MontageFact, freeablePlace } from '@skydock/scripts'
import { ConnectionDialog } from './connection-dialog'
import { EmailDialog } from './email-dialog'
import { FreeDialog } from './free-dialog'
import { FreePlaceDialog } from './free-place-dialog'
import { DisconnectDialog } from './disconnect-dialog'
import { RemovePlaceDialog } from './remove-place-dialog'
import { NasFolderBrowser } from './nas-folder-browser'
import { ResetFreshDialog } from './reset-fresh-dialog'
import { TakeBackDialog } from './take-back-dialog'
import { TemplatesDialog } from './templates-dialog'
import type { TakeBackMode } from './take-back-dialog'
import { TrashDialog } from './trash-dialog'
import type { Destination, ManifestFile, ManifestGroup } from './types'
import { UploadDialog } from './upload-dialog'
import { folderOnStorage } from '../helpers/jumps'
import type { SendPlan } from '@skydock/scripts'

type UploadDialogState = { kind: 'upload'; groupId: string }

/* one value, so two dialogs can never be open at once; `destination` set means the folder is being
   chosen for that card rather than as the global default, and `back` is the dialog a folder was
   being chosen for, which it returns to once one is chosen */
type BoardDialog =
  | null
  | { kind: 'connect' }
  | { kind: 'folder'; destination: string; back?: UploadDialogState }
  | UploadDialogState
  | { kind: 'take-back'; mode: TakeBackMode; who: string }
  | { kind: 'free'; groupId: string }
  /* what of a dropzone is on the storage, about to be deleted from this machine */
  | { kind: 'free-place'; place: string }
  /* a place about to be taken off the board, what was filed there going back to Fresh files */
  | { kind: 'remove-place'; place: string }
  /* the storage about to be let go of — a mark the size of a full stop, so it is asked first */
  | { kind: 'disconnect' }
  /* unsorted files about to go to the bin */
  | { kind: 'trash'; files: ManifestFile[] }
  /* a montage on this board by its jump, or one the storage's list alone knows, by its folder */
  | { kind: 'email'; groupId?: string; folder?: string }
  /* Fresh files put back, by as much as is chosen there */
  | { kind: 'reset-fresh'; files: number; decided: number }
  /* the editing templates — chosen between for this montage's editing project, or only looked over */
  | { kind: 'templates'; groupId?: string }

const DialogHost = ({
  dialog,
  onDialog,
  nas,
  places,
  onChooseFolder,
  groups,
  looseFiles,
  asOnStorage,
  facts,
  folderFor,
  plan,
  onPlan,
  onUpload,
  storage,
  onEmailed,
  onFree,
  freeableOf,
  onFreePlace,
  onRemovePlace,
  onDisconnect,
  onTakeBack,
  onTrash,
  onMontage,
  onResetFresh
}: {
  dialog: BoardDialog
  onDialog: (dialog: BoardDialog) => void
  nas: {
    connectSucceeded: boolean
    error: string | undefined
    connect: (host: string, user: string, password: string, otp?: string) => void
    codeAsked?: string
    /* who it is connected as and where, for the dialogs that name it */
    host: string | null
    user: string | null
  }
  places: Destination[]
  onChooseFolder: (path: string, destination: string) => void
  groups: ManifestGroup[]
  /* files in no jump, needed to say what a place holds before it is taken off the board */
  looseFiles: ManifestFile[]
  asOnStorage: (group: ManifestGroup) => ManifestGroup
  facts: Record<string, MontageFact>
  folderFor: (destination: string) => string | null
  plan: SendPlan
  onPlan: (plan: SendPlan) => void
  onUpload: (group: ManifestGroup, plan: SendPlan) => void
  storage: { montages: MontageEntry[]; lost: MontageLost } | null
  onEmailed: (folder: string, sent: boolean, to: string) => void
  onFree: (group: ManifestGroup) => void
  freeableOf: (place: string) => ReturnType<typeof freeablePlace>
  onFreePlace: (place: string) => void
  onRemovePlace: (place: string) => void
  onDisconnect: () => void
  onTakeBack: (mode: TakeBackMode, group: ManifestGroup) => void
  onTrash: (files: ManifestFile[]) => void
  onMontage: (groupId: string, template: string) => void
  onResetFresh: (what: 'times' | 'everything') => void
}) => {
  const close = () => onDialog(null)
  return (
    <>
      {dialog?.kind === 'connect' && !nas.connectSucceeded && (
        <ConnectionDialog
          onConnect={nas.connect}
          onCancel={close}
          error={nas.error}
          codeAsked={nas.codeAsked}
        />
      )}

      {dialog?.kind === 'folder' && (
        <NasFolderBrowser
          initialPath={places.find((d) => d.name === dialog.destination)?.path ?? undefined}
          title={`NAS folder for ${dialog.destination}`}
          onSelect={(path) => onChooseFolder(path, dialog.destination)}
          onClose={() => onDialog(dialog.back ?? null)}
        />
      )}

      {dialog?.kind === 'upload' &&
        (() => {
          const group = groups.find((g) => g.id === dialog.groupId)
          if (!group) return null
          return (
            <UploadDialog
              who={buildPassengerFolder(group.passenger, group.label)}
              group={asOnStorage(group)}
              facts={facts[group.id]}
              places={places.map((p) => ({ ...p, path: folderFor(p.name) ?? undefined }))}
              plan={plan}
              onPlan={onPlan}
              onPickFolder={(destination) =>
                onDialog({ kind: 'folder', destination, back: dialog })
              }
              onClose={close}
              onUpload={(asked) => onUpload(group, asked)}
            />
          )
        })()}

      {dialog?.kind === 'email' &&
        (() => {
          /* a montage on this board is drafted from its files; one the storage alone knows, from
             what its list says */
          const group = dialog.groupId ? groups.find((g) => g.id === dialog.groupId) : undefined
          const folder = dialog.folder ?? (group ? folderOnStorage(group) : null)
          const entry = folder ? storage?.montages.find((t) => t.folder === folder) : undefined
          /* a link the storage no longer honours is not one to send anybody */
          const shareUrl =
            folder && lostOf(storage?.lost, folder)
              ? undefined
              : (group?.uploaded?.shareUrl ?? group?.publish?.shareUrl ?? entry?.shareUrl)
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

      {dialog?.kind === 'free-place' && (
        <FreePlaceDialog
          place={dialog.place}
          freeable={freeableOf(dialog.place)}
          onClose={close}
          onConfirm={() => onFreePlace(dialog.place)}
        />
      )}

      {dialog?.kind === 'remove-place' && (
        <RemovePlaceDialog
          place={dialog.place}
          jumps={groups.filter((g) => g.destination === dialog.place).length}
          loose={looseFiles.filter((f) => f.destination === dialog.place).length}
          linked={folderFor(dialog.place)}
          onClose={close}
          onConfirm={() => onRemovePlace(dialog.place)}
        />
      )}

      {dialog?.kind === 'disconnect' && (
        <DisconnectDialog
          host={nas.host}
          user={nas.user}
          onClose={close}
          onConfirm={onDisconnect}
        />
      )}

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
          const montage = groups.find((g) => g.id === dialog.groupId)
          return (
            <TemplatesDialog
              who={montage ? passengerOf(montage) : undefined}
              onClose={close}
              onChoose={montage ? (template) => onMontage(montage.id, template) : undefined}
            />
          )
        })()}
    </>
  )
}

export { DialogHost }
export type { BoardDialog }
