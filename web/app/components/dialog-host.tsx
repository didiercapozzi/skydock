import {
  buildPassengerFolder,
  isMontage,
  isVideoFile,
  lostOf,
  passengerOf
} from '@skydock/scripts/client'
import type { MontageEntry, MontageLost, MontageFact, freeablePlace } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { ConnectionDialog } from './connection-dialog'
import { EmailDialog } from './email-dialog'
import { FreeDialog } from './free-dialog'
import { FreePlaceDialog } from './free-place-dialog'
import { DeleteJumpDialog } from './delete-jump-dialog'
import { DisconnectDialog } from './disconnect-dialog'
import { RemovePlaceDialog } from './remove-place-dialog'
import { RemoveFilesDialog } from './remove-files-dialog'
import { NameMontageDialog } from './name-montage-dialog'
import { NasFolderBrowser } from './nas-folder-browser'
import { ResetFreshDialog } from './reset-fresh-dialog'
import { StartAgainDialog } from './start-again-dialog'
import type { StartAgainWhich } from './start-again-dialog'
import { TakeBackDialog } from './take-back-dialog'
import { FilmTemplatesDialog } from './film-templates-dialog'
import { TemplatesDialog } from './templates-dialog'
import type { TakeBackMode } from './take-back-dialog'
import type { Destination, ManifestFile, ManifestGroup } from './types'
import { UploadDialog } from './upload-dialog'
import { ForgetCameraDialog } from './camera-dialogs'
import { WorkFolderDialog } from './work-folder-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'
import { AboutDialog } from './about-dialog'
import { folderOnStorage } from '../helpers/jumps'
import type { Passenger } from './montage-card'
import type { SendPlan } from '@skydock/scripts'

type UploadDialogState = { kind: 'upload'; groupId: string }
type SendDialogState = { kind: 'send'; files: ManifestFile[] }

type BoardDialog =
  | null
  | { kind: 'connect' }
  | { kind: 'folder'; destination: string; back?: UploadDialogState | SendDialogState }
  | UploadDialogState
  | SendDialogState
  | { kind: 'take-back'; mode: TakeBackMode; who: string }
  | { kind: 'start-again'; groupId: string }
  | { kind: 'free'; groupId: string }
  | { kind: 'free-place'; place: string }
  | { kind: 'remove-place'; place: string }
  | { kind: 'disconnect' }
  | { kind: 'remove-files'; files: ManifestFile[] }
  | { kind: 'email'; groupId?: string }
  | { kind: 'reset-fresh'; files: number; decided: number }
  | { kind: 'templates'; groupId?: string }
  | { kind: 'filmTemplates' }
  | { kind: 'name-montage'; groupId?: string; fileIds?: string[]; keeps?: string }
  | { kind: 'work-folder' }
  | { kind: 'delete-jump'; groupId: string }
  | { kind: 'forget-camera'; key: string; name: string }
  | { kind: 'shortcuts' }
  | { kind: 'about' }

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
  onSend,
  storage,
  onEmailed,
  onFree,
  freeableOf,
  onFreePlace,
  onRemovePlace,
  onDisconnect,
  onTakeBack,
  onStartAgain,
  onDeleteJump,
  onMontage,
  passengers,
  onNameMontage,
  workFolder,
  onRemoveFiles,
  onResetFresh,
  onForgetCamera
}: {
  dialog: BoardDialog
  onDialog: (dialog: BoardDialog) => void
  nas: {
    connectSucceeded: boolean
    error: string | undefined
    connect: (host: string, user: string, password: string, otp?: string) => void
    codeAsked?: string
    host: string | null
    user: string | null
  }
  places: Destination[]
  onChooseFolder: (path: string, destination: string) => void
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  asOnStorage: (group: ManifestGroup) => ManifestGroup
  facts: Record<string, MontageFact>
  folderFor: (destination: string) => string | null
  plan: SendPlan
  onPlan: (plan: SendPlan) => void
  onUpload: (group: ManifestGroup, plan: SendPlan) => void
  onSend: (files: ManifestFile[], plan: SendPlan) => void
  storage: { montages: MontageEntry[]; lost: MontageLost } | null
  onEmailed: (folder: string, sent: boolean, to: string) => void
  onFree: (group: ManifestGroup) => void
  freeableOf: (place: string) => ReturnType<typeof freeablePlace>
  onFreePlace: (place: string) => void
  onRemovePlace: (place: string) => void
  onDisconnect: () => void
  onTakeBack: (mode: TakeBackMode, group: ManifestGroup) => void
  onStartAgain: (group: ManifestGroup, which: StartAgainWhich) => void
  onDeleteJump: (group: ManifestGroup) => void
  onMontage: (groupId: string, template: string) => void
  passengers: Passenger[]
  onNameMontage: (what: { groupId?: string; fileIds?: string[] }, passenger: Passenger) => void
  workFolder: { folder: string; working: string | null }
  onRemoveFiles: (to: 'fresh' | 'bin', files: ManifestFile[]) => void
  onResetFresh: (what: 'times' | 'everything') => void
  onForgetCamera: (key: string) => void
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

      {dialog?.kind === 'folder' &&
        (() => {
          const destination = dialog.destination
          return (
            <NasFolderBrowser
              initialPath={places.find((d) => d.name === destination)?.path ?? undefined}
              title={t`Storage folder for ${destination}`}
              onSelect={(path) => onChooseFolder(path, dialog.destination)}
              onClose={() => onDialog(dialog.back ?? null)}
            />
          )
        })()}

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

      {dialog?.kind === 'send' && (
        <UploadDialog
          who={plural(dialog.files.length, { one: '# file', other: '# files' })}
          group={{
            id: 'files',
            label: t`Files`,
            day: '',
            files: dialog.files,
            passenger: { firstname: t`Files`, lastname: '' }
          }}
          picked
          places={places.map((p) => ({ ...p, path: folderFor(p.name) ?? undefined }))}
          plan={plan}
          onPlan={onPlan}
          onPickFolder={(destination) => onDialog({ kind: 'folder', destination, back: dialog })}
          onClose={close}
          onUpload={(asked) => onSend(dialog.files, asked)}
        />
      )}

      {dialog?.kind === 'email' &&
        (() => {
          const group = dialog.groupId ? groups.find((g) => g.id === dialog.groupId) : undefined
          const folder = group ? folderOnStorage(group) : null
          const entry = folder ? storage?.montages.find((m) => m.folder === folder) : undefined
          const shareUrl =
            folder && lostOf(storage?.lost, folder)
              ? undefined
              : (group?.uploaded?.shareUrl ?? group?.publish?.shareUrl ?? entry?.shareUrl)
          const about = group
            ? {
                firstname: group.passenger?.firstname ?? '',
                lastname: group.passenger?.lastname ?? '',
                day: group.day,
                videos: group.files.filter((f) => isVideoFile(f.path)).length,
                photos: group.files.filter((f) => !isVideoFile(f.path)).length,
                seconds: facts[group.id]?.film?.seconds ?? null
              }
            : null
          if (!about || !shareUrl) return null
          return (
            <EmailDialog
              key={folder ?? dialog.groupId}
              about={{ ...about, shareUrl }}
              emailed={group?.emailed ?? entry?.emailed ?? null}
              canRecord={Boolean(folder)}
              onRecord={(sent, to) => folder && onEmailed(folder, sent, to)}
              onClose={close}
            />
          )
        })()}

      {dialog?.kind === 'name-montage' && (
        <NameMontageDialog
          jump={dialog.groupId ? groups.find((g) => g.id === dialog.groupId) : undefined}
          count={dialog.fileIds?.length}
          keeps={dialog.keeps}
          passengers={passengers}
          onSave={(passenger) => onNameMontage(dialog, passenger)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'remove-files' &&
        (() => {
          const placeOf = (file: ManifestFile) => {
            const holder = groups.find((g) => g.files.some((f) => f.id === file.id))
            if (holder && isMontage(holder)) return passengerOf(holder) || t`a montage`
            return holder?.destination ?? file.destination ?? t`Fresh files`
          }
          const places = new Set(dialog.files.map(placeOf))
          const loose = (file: ManifestFile) =>
            !file.destination && !groups.some((g) => g.files.some((f) => f.id === file.id))
          const onStorage = dialog.files.filter((f) => f.uploaded || f.freed).length
          return (
            <RemoveFilesDialog
              from={places.size === 1 ? [...places][0]! : null}
              files={dialog.files}
              onStorage={onStorage}
              canLoose={!dialog.files.every(loose) && onStorage === 0}
              onClose={close}
              onChoose={(to) => onRemoveFiles(to, dialog.files)}
            />
          )
        })()}

      {dialog?.kind === 'shortcuts' && <ShortcutsDialog onClose={close} />}
      {dialog?.kind === 'about' && <AboutDialog onClose={close} />}

      {dialog?.kind === 'forget-camera' && (
        <ForgetCameraDialog
          name={dialog.name}
          onClose={close}
          onConfirm={() => {
            close()
            onForgetCamera(dialog.key)
          }}
        />
      )}
      {dialog?.kind === 'work-folder' && (
        <WorkFolderDialog
          folder={workFolder.folder}
          working={workFolder.working}
          onClose={close}
        />
      )}

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

      {dialog?.kind === 'start-again' &&
        (() => {
          const group = groups.find((g) => g.id === dialog.groupId)
          const known = group && facts[group.id]
          if (!group || !known?.project) return null
          return (
            <StartAgainDialog
              who={passengerOf(group)}
              facts={known}
              onClose={close}
              onConfirm={(which) => onStartAgain(group, which)}
            />
          )
        })()}

      {dialog?.kind === 'delete-jump' &&
        (() => {
          const group = groups.find((g) => g.id === dialog.groupId)
          if (!group) return null
          return (
            <DeleteJumpDialog
              label={group.label}
              files={group.files.length}
              copies={group.files.filter((f) => f.processed).length}
              onClose={close}
              onConfirm={() => onDeleteJump(group)}
            />
          )
        })()}

      {dialog?.kind === 'reset-fresh' && (
        <ResetFreshDialog
          files={dialog.files}
          decided={dialog.decided}
          onClose={close}
          onReset={onResetFresh}
        />
      )}

      {dialog?.kind === 'filmTemplates' && <FilmTemplatesDialog onClose={close} />}

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
