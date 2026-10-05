import { plural, t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { Note } from './blurbs'

const Choice = ({
  title,
  forgets,
  keeps,
  onChoose
}: {
  title: string
  forgets: string
  keeps: string
  onChoose: () => void
}) => (
  <button
    type='button'
    onClick={onChoose}
    className='flex flex-col gap-1 rounded-[10px] border border-line-2 bg-pane px-3 py-2.5 text-left hover:border-accent hover:bg-accent-soft'>
    <b className='text-[13px] font-semibold text-ink'>{title}</b>
    <span className='text-[12px] text-ink-2'>
      <span className='text-changed'>✕</span> {forgets}
    </span>
    <span className='text-[12px] text-ink-2'>
      <span className='text-up'>✓</span> {keeps}
    </span>
  </button>
)

const ResetFreshDialog = ({
  files,
  decided,
  onClose,
  onReset
}: {
  files: number
  decided: number
  onClose: () => void
  onReset: (what: 'times' | 'everything') => void
}) => {
  const alreadySet =
    decided > 0
      ? plural(decided, { one: ' — # file has one set', other: ' — # files have one set' })
      : ''
  return (
    <Modal
      label={t`Reset Fresh files`}
      title={t`Reset the ${plural(files, { one: '# file', other: '# files' })} in Fresh files`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <Choice
        title={t`Times only`}
        forgets={t`the times that were corrected — every file goes back to the time its camera gave it`}
        keeps={t`the jumps and their names, and every trim, frame and turn`}
        onChoose={() => onReset('times')}
      />
      <Choice
        title={t`Everything, as just scanned`}
        forgets={t`the corrected times, the jumps made and named by hand, any copies, and every trim, frame and turn${alreadySet}. The gap rule makes the jumps again`}
        keeps={t`nothing decided about these files`}
        onChoose={() => onReset('everything')}
      />
      <Note>
        {t`Either way, nothing filed to a destination or a montage is touched, and no original file is.`}
      </Note>
    </Modal>
  )
}

export { ResetFreshDialog }
