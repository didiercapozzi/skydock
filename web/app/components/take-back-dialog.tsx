import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'
import { formatFilmSize } from './utils'
import type { MontageFact } from '@skydock/scripts'
import type { ManifestGroup } from './types'

/* Resetting or deleting a montage throws away work, some of which only a person can make again — the
   edit above all. So the dialog says exactly what goes and what stays before anything does, and the
   one button that does it says which of the two it is. */

type Mode = 'reset' | 'delete'

const TakeBackDialog = ({
  mode,
  who,
  groups,
  facts,
  onClose,
  onConfirm
}: {
  mode: Mode
  who: string
  /* every jump of the passenger, because they share the one folder */
  groups: ManifestGroup[]
  facts: (MontageFact | undefined)[]
  onClose: () => void
  onConfirm: () => void
}) => {
  const files = groups.flatMap((g) => g.files)
  const copies = files.filter((f) => f.processed).length
  const project = facts.some((f) => f?.project)
  const film = facts.find((f) => f?.film)?.film
  const uploaded = groups.some((g) => g.uploaded)
  const reset = mode === 'reset'
  const jumpCount = groups.length
  const fileCount = files.length
  const filmSize = film ? formatFilmSize(film.size) : ''
  const processed =
    copies > 0
      ? plural(copies, { one: 'the # processed copy', other: 'the # processed copies' })
      : t`the processed folder`

  return (
    <Modal
      label={reset ? t`Reset montage` : t`Delete montage`}
      title={reset ? t`Reset ${who} to before processing` : t`Delete ${who}’s montage`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Danger onClick={onConfirm}>{reset ? t`Reset` : t`Delete`}</Danger>
        </>
      }>
      <p className='m-0 text-[12.5px] font-semibold text-ink'>{t`Deleted from this machine`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✕'>{t`${processed}, and the working copies made for the editor`}</Line>
        {project && (
          <Line mark='✕'>
            <b className='text-changed'>
              {t`the kdenlive project — the edit itself, which cannot be undone`}
            </b>
          </Line>
        )}
        {film && <Line mark='✕'>{t`the rendered film (${filmSize})`}</Line>}
        {uploaded && <Line mark='✕'>{t`the archives, and the record of what was uploaded`}</Line>}
      </ul>

      <p className='m-0 text-[12.5px] font-semibold text-ink'>
        {reset ? t`Kept, ready to process again` : t`Back to Fresh files, loose`}
      </p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        {reset ? (
          <>
            <Line mark='✓'>{t`the name, ${who}`}</Line>
            <Line mark='✓'>{t`every trim and frame, and every corrected time`}</Line>
            <Line mark='✓'>
              {t`${plural(jumpCount, { one: '# jump', other: '# jumps' })}, ${plural(fileCount, { one: '# file', other: '# files' })}, still under Montages`}
            </Line>
          </>
        ) : (
          <>
            <Line mark='↺'>
              {t`${plural(fileCount, { one: '# file', other: '# files' })}, loose, to be sorted again`}
            </Line>
            <Line mark='✕'>
              {plural(jumpCount, {
                one: 'the jump itself — regrouping the loose files puts them back into jumps',
                other:
                  'the # jumps themselves — regrouping the loose files puts them back into jumps'
              })}
            </Line>
            <Line mark='✕'>
              {t`the name, every trim and frame, and every corrected time — each file goes back to the time its camera gave it`}
            </Line>
          </>
        )}
      </ul>

      <p className='m-0 rounded-[10px] bg-local-soft px-2.5 py-2 text-[12px] text-ink-2'>
        {t`The original files are never touched, and nothing is deleted from the storage:`}{' '}
        {uploaded
          ? t`what was uploaded stays there until someone removes it by hand.`
          : t`SkyDock never deletes anything up there.`}
      </p>
    </Modal>
  )
}

export { TakeBackDialog }
export type { Mode as TakeBackMode }
