import { t } from '@lingui/core/macro'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'

/* Every key and gesture the board knows, in one place, so none of them has to be found by accident
   (RULES, The board). Opened from Settings, the keyboard on the toolbar, or the ? key. */
const ShortcutsDialog = ({ onClose }: { onClose: () => void }) => {
  const sections: [string, [string, string][]][] = [
    [
      t`Files`,
      [
        [t`↑ ↓`, t`step through the files`],
        [t`Shift + ↑ ↓`, t`pick a run of files`],
        [t`⌘/Ctrl + A`, t`pick every file shown`],
        [t`Enter, or double-click`, t`open the file`],
        [t`Delete or ⌫`, t`remove the picked files — asks where they go`],
        [t`Esc`, t`let go of the picks`]
      ]
    ],
    [
      t`Jumps`,
      [
        [t`⌘/Ctrl + click a second jump`, t`compare two jumps side by side`],
        [t`Drag a jump or files onto a dropzone`, t`file them there`],
        [t`Alt or Ctrl while dropping`, t`copy instead of moving`],
        [t`Drop on the Montages heading`, t`make them a montage, named first`]
      ]
    ],
    [
      t`An open clip`,
      [
        [t`Space`, t`play or pause`],
        [t`F`, t`full size`],
        [t`R`, t`turn by a quarter`],
        [t`Esc`, t`close`]
      ]
    ],
    [
      t`The board`,
      [
        [t`⌘/Ctrl + wheel over thumbnails`, t`bigger or smaller thumbnails`],
        [t`⌘/Ctrl + F`, t`find anything`],
        [t`⌘/Ctrl + + − 0`, t`the whole board bigger, smaller, as drawn`],
        [t`?`, t`this list`]
      ]
    ]
  ]
  return (
    <Modal
      label={t`Keyboard shortcuts`}
      title={t`Keyboard shortcuts`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      {sections.map(([heading, keys]) => (
        <section key={heading}>
          <h5 className='m-0 mb-1.5 text-[11.5px] font-bold text-ink-3'>{heading}</h5>
          <dl className='m-0 grid grid-cols-[230px_1fr] items-center gap-x-4 gap-y-1.5 text-[12.5px]'>
            {keys.map(([key, does]) => (
              <div
                key={key}
                className='contents'>
                <dt className='w-max rounded-[6px] border border-line-2 bg-well px-1 text-[11px] leading-4 font-medium text-ink-2'>
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

export { ShortcutsDialog }
