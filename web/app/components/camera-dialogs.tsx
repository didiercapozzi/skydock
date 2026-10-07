import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { Danger, Go, Mini } from './buttons'
import { Spacer, Modal } from './modal'

/* A camera this machine has never met asks what to do about it (RULES, Cameras): its new files copied
   now or not, and whether the new files of this camera are copied by themselves from now on — which it
   starts out not doing, since a camera is often somebody else's and one file is all that is wanted. The
   camera is remembered whichever is answered, and closing the question remembers it and copies nothing. */
const NewCameraDialog = ({
  name,
  fresh,
  onAnswer
}: {
  name: string
  /* how many files on it are not here yet; none where that cannot be counted */
  fresh: number | null
  /* `copy`: copy the new files now; `auto`: copy them by themselves from now on */
  onAnswer: (answer: { copy: boolean; auto: boolean; choose?: boolean }) => void
}) => {
  const [auto, setAuto] = useState(false)
  return (
    <Modal
      label={t`A new camera`}
      title={name}
      sub={t`A camera SkyDock has not seen before`}
      onClose={() => onAnswer({ copy: false, auto: false })}
      footer={
        <>
          <Spacer />
          <Mini onClick={() => onAnswer({ copy: false, auto })}>{t`Just remember it`}</Mini>
          {/* the way to take only some: remembered, and its page opened to tick the files wanted */}
          <Mini
            title={t`Remember this camera and open its page, to tick the files to copy`}
            onClick={() => onAnswer({ copy: false, auto, choose: true })}>
            {t`Choose which files…`}
          </Mini>
          <Go onClick={() => onAnswer({ copy: true, auto })}>
            {fresh === null
              ? t`Copy what is new`
              : t`Copy ${plural(fresh, { one: 'the # new file', other: 'the # new files' })}`}
          </Go>
        </>
      }>
      <p className='m-0 text-body text-ink-2'>
        {fresh === null
          ? t`SkyDock cannot say how many of its files are not on this machine yet. It will remember this camera, so it is in the list next time even when it is not plugged in.`
          : t`It holds ${plural(fresh, { one: '# file', other: '# files' })} that ${plural(fresh, { one: 'is', other: 'are' })} not on this machine yet. SkyDock will remember this camera, so it is in the list next time even when it is not plugged in.`}
      </p>
      <label className='flex cursor-pointer items-start gap-3 rounded-corner bg-well px-3.5 py-3'>
        <input
          type='checkbox'
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className='mt-0.5 size-mark flex-none'
        />
        <span>
          <b className='block text-body'>{t`Copy new files automatically from now on`}</b>
          <span className='text-small text-ink-3'>
            {t`Leave this unticked for a camera that is not yours — you will pick the files to copy each time.`}
          </span>
        </span>
      </label>
    </Modal>
  )
}

/* Forgetting a camera takes it off the list and nothing else: what was copied from it stays where it is. */
const ForgetCameraDialog = ({
  name,
  onClose,
  onConfirm
}: {
  name: string
  onClose: () => void
  onConfirm: () => void
}) => (
  <Modal
    label={t`Forget this camera`}
    title={t`Forget ${name}?`}
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>{t`Keep it`}</Mini>
        <Danger onClick={onConfirm}>{t`Forget it`}</Danger>
      </>
    }>
    <p className='m-0 text-body text-ink-2'>
      {t`Its files that are already here stay where they are. The next time it is plugged in, SkyDock will treat it as a new camera and ask.`}
    </p>
  </Modal>
)

export { ForgetCameraDialog, NewCameraDialog }
