import { t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'

const FilmShortcuts = ({ scratch, onClose }: { scratch: boolean; onClose: () => void }) => {
  const sections: [string, [string, string][]][] = [
    [
      t`Playing`,
      [
        ['Enter, Space', t`play or stop; in a text box they type instead`],
        ['←  →', t`move the playhead 0.1 second, 1 second with Shift`],
        ['Home, End', t`go to the start or the end of the timeline`]
      ]
    ],
    [
      t`Tools`,
      [
        ...(scratch ? [] : ([['C', t`cut at the playhead`]] as [string, string][])),
        ['F', t`fade the picked clip in over the one before it, or take the fade off`],
        ['Delete, Backspace', t`delete the picked item`],
        ['R', t`turn Ripple on or off`],
        ['S', t`turn Snap on or off`],
        ['T', t`add a text at the playhead`]
      ]
    ],
    [
      t`Editing`,
      [
        ...(scratch
          ? []
          : ([['Alt + ←  →', t`move the picked clip 0.1 second, 1 second with Shift`]] as [
              string,
              string
            ][])),
        ['⌘/Ctrl + Z', t`undo`],
        ['?', t`this list`],
        ['Esc', t`close this list, or the editor`]
      ]
    ]
  ]
  return (
    <Modal
      label={t`Film editor shortcuts`}
      title={t`Film editor shortcuts`}
      onClose={onClose}
      footer={
        <>
          <span className='text-small text-ink-3'>
            {t`A button you clicked does not take Enter or Space: they play. Reach it with Tab and they press it.`}
          </span>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      {sections.map(([heading, keys]) => (
        <section key={heading}>
          <h5 className='m-0 mb-1.5 text-micro font-bold text-ink-3'>{heading}</h5>
          <dl className='m-0 grid grid-cols-[170px_1fr] items-center gap-x-4 gap-y-1.5 text-body'>
            {keys.map(([key, does]) => (
              <div
                key={key}
                className='contents'>
                <dt className='w-max rounded-corner border border-line-2 bg-well px-1 text-micro leading-4 font-medium text-ink-2'>
                  {key}
                </dt>
                <dd className='m-0 text-ink-2'>{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  )
}

export { FilmShortcuts }
