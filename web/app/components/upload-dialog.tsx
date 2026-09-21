import { photosNameOf, rushesNameOf } from '@skydock/scripts'
import type { BackupChoice } from '../hooks/useBackupChoice'
import { Go, Mini, Seg } from './buttons'
import { Modal, Spacer } from './modal'

import type { TandemFact } from '@skydock/scripts'
import type { ManifestGroup } from './types'
import { formatFilmSize, hhmm, isVideoFile, plural } from './utils'

/* What uploading a tandem will do, laid out before it is done: two parcels, and the whole question
   is what belongs in each. The passenger gets the film and the photos and nothing else; the backup
   gets the originals, never shared. Both folders are shown, and either can be changed from here. */

const Parcel = ({
  title,
  folder,
  pickTitle,
  onPick,
  tag,
  children
}: {
  title: string
  folder: string | null
  pickTitle: string
  onPick: () => void
  tag: React.ReactNode
  children: React.ReactNode
}) => (
  <div className='overflow-hidden rounded-[9px] border border-line'>
    <div className='flex flex-wrap items-center gap-2 border-b border-line bg-ground px-3 py-[9px] text-[13px]'>
      <b>{title}</b>
      <span className='text-ink-3'>→</span>
      <Mini
        title={pickTitle}
        onClick={onPick}>
        {folder ?? 'choose a folder'}
      </Mini>
      {folder && (
        <span
          title='Remembered from last time — click the folder to change it'
          className='rounded-full bg-accent-soft px-[7px] py-px text-[9.5px] font-semibold tracking-[0.05em] text-accent uppercase'>
          kept
        </span>
      )}
      <span className='ml-auto text-[12px] text-ink-2'>{tag}</span>
    </div>
    <div className='px-1.5 py-1'>{children}</div>
  </div>
)

const Item = ({
  name,
  size,
  what,
  off,
  onToggle
}: {
  name: string
  size?: string
  what: string
  off?: boolean
  /* an item that is a choice carries a tick; the rest are what the parcel always holds */
  onToggle?: (on: boolean) => void
}) => (
  <label
    className={`flex cursor-pointer items-center gap-[9px] rounded-[5px] px-1.5 py-[5px] hover:bg-line-2 ${
      off ? 'opacity-45' : ''
    }`}>
    {onToggle ? (
      <input
        type='checkbox'
        checked={!off}
        onChange={(e) => onToggle(e.target.checked)}
        className='flex-none'
      />
    ) : (
      <span className='w-[13px] text-center text-accent'>•</span>
    )}
    <code className='font-mono text-[11.5px]'>{name}</code>
    {size && <span className='text-[12px] text-ink-2'>{size}</span>}
    <span className='ml-auto text-[12px] text-ink-2'>{what}</span>
  </label>
)

const BACKUP_AS = [
  ['zip', 'One zip'],
  ['folder', 'Plain files']
] as const

const UploadDialog = ({
  who,
  group,
  facts,
  backupFolder,
  passengerFolder,
  choice,
  onChoice,
  onPickBackup,
  onPickPassenger,
  onClose,
  onUpload
}: {
  who: string
  group: ManifestGroup
  facts?: TandemFact
  backupFolder: string | null
  /* where the passenger's own folder will be, or null while there is nowhere to put it */
  passengerFolder: string | null
  choice: BackupChoice
  onChoice: (choice: BackupChoice) => void
  onPickBackup: () => void
  onPickPassenger: () => void
  onClose: () => void
  onUpload: () => void
}) => {
  const videos = group.files.filter((f) => isVideoFile(f.path))
  const photos = group.files.filter((f) => !isVideoFile(f.path))
  const film = facts?.film ?? null
  const baseName = facts?.baseName ?? group.label
  const zip = choice.backupAs === 'zip'
  const withFilm = choice.filmToBackup && film !== null
  const withProject = Boolean(facts?.project)

  const originalsSize = videos.reduce((n, f) => n + f.size, 0)
  const backupSize = originalsSize + (withFilm && film ? film.size : 0)
  /* the photos travel as the prepared copies, and a zip of JPEGs is about the size of the JPEGs */
  const photosSize = photos.reduce((n, f) => n + (f.processed?.size ?? f.size), 0)
  const toPassenger = (film?.size ?? 0) + photosSize

  /* a tandem with footage has a film to wait for; one whose camera died is photos only */
  const waitingForFilm = videos.length > 0 && !film
  const blocked = waitingForFilm
    ? 'Render the film in kdenlive first'
    : !passengerFolder
      ? `Choose where ${who}’s folder goes first`
      : !backupFolder && videos.length > 0
        ? 'Choose the backup folder first — it is never guessed'
        : null
  const uploaded = group.uploaded

  return (
    <Modal
      label='Upload'
      title={who}
      wide
      onClose={onClose}
      footer={
        <>
          <span className='text-[12px] text-ink-2'>
            {formatFilmSize(backupSize)} to the backup · {formatFilmSize(toPassenger)} to {who}
          </span>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          <Go
            disabled={blocked !== null}
            title={blocked ?? 'Build the archives, then send each parcel to its folder'}
            onClick={onUpload}>
            {uploaded ? 'Upload again' : 'Upload'}
          </Go>
        </>
      }>
      {videos.length > 0 && (
        <Parcel
          title='Backup'
          folder={backupFolder}
          pickTitle='Where the original videos are kept — never shared'
          onPick={onPickBackup}
          tag={
            uploaded?.rushes || uploaded?.originals ? (
              <span className='font-semibold text-up'>✓ archived {hhmm(uploaded.at)}</span>
            ) : (
              'ready now · never shared'
            )
          }>
          <Item
            name={zip ? rushesNameOf(baseName) : `${baseName}/`}
            size={formatFilmSize(backupSize)}
            what={`${plural(videos.length, 'original video')}${withFilm ? ' + the film' : ''}${
              withProject ? ' + the project' : ''
            }${zip ? '' : ', as files'}`}
          />
          {film && (
            <Item
              name={zip ? '… inside that zip' : '… in that folder'}
              size={formatFilmSize(film.size)}
              what='a copy of the film'
              off={!choice.filmToBackup}
              onToggle={(on) => onChoice({ ...choice, filmToBackup: on })}
            />
          )}
          {/* the edit exists nowhere else, and weighs nothing beside the footage, so it always goes */}
          {facts?.project && (
            <Item
              name={zip ? '… inside that zip' : '… in that folder'}
              what='the kdenlive project'
            />
          )}
        </Parcel>
      )}

      <Parcel
        title={`For ${who}`}
        folder={passengerFolder}
        pickTitle={`Where ${who}’s folder goes — the one that gets a share link`}
        onPick={onPickPassenger}
        tag={
          uploaded ? (
            <span className='font-semibold text-up'>✓ uploaded {hhmm(uploaded.at)}</span>
          ) : waitingForFilm ? (
            'waiting for the film'
          ) : (
            'ready to upload'
          )
        }>
        {film ? (
          <Item
            name={`${baseName}.mp4`}
            size={formatFilmSize(film.size)}
            what='the film'
          />
        ) : (
          waitingForFilm && (
            <div className='flex items-center gap-[9px] px-1.5 py-[5px] opacity-45'>
              <span className='w-[13px] text-center text-accent'>•</span>
              <code className='font-mono text-[11.5px]'>no film yet</code>
              <span className='ml-auto text-[12px] text-ink-2'>render it in kdenlive first</span>
            </div>
          )
        )}
        {photos.length > 0 && (
          <Item
            name={photosNameOf(baseName)}
            size={formatFilmSize(photosSize)}
            what={plural(photos.length, 'photo')}
          />
        )}
      </Parcel>

      {videos.length > 0 && (
        <div className='flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-2'>
          <span>Keep the backup as</span>
          <Seg
            label='Keep the backup as'
            value={choice.backupAs}
            options={BACKUP_AS}
            onPick={(backupAs) => onChoice({ ...choice, backupAs })}
          />
          <span className='flex-[1_1_200px] text-[12px]'>
            {zip
              ? 'one object to move, and it cannot arrive half-copied'
              : 'browsable on the storage, and one clip can be pulled out without unpacking it all'}
          </span>
        </div>
      )}

      <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
        <b className='text-ink'>Set once, reused after that.</b> Both folders and the choices above
        are remembered, so the next tandem opens with this already filled in — until you change it
        again. The archives are only built once, too: upload again after a re-render and they are
        reused unless something in them changed. The project and the working folders never leave
        this machine.
      </p>
    </Modal>
  )
}

export { UploadDialog }
