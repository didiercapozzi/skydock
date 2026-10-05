import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { z } from 'zod'
import { Go, Mini } from './buttons'
import { Line, Modal, Spacer } from './modal'
import { Note } from './blurbs'

/* What the window answers when it is asked for another folder. */
const answerSchema = z.union([
  z.object({ chosen: z.string().nullable() }),
  z.object({ refused: z.string() })
])

/* The folder SkyDock works in — the originals, what is handed over, the proxies, the bin and the
   board's own record, all together — and a way to work in another one. Nothing is copied or moved:
   the board opens on what the other folder holds, and the one left behind stays as it is, to be
   chosen again (RULES, What lands on disk). Only SkyDock's own window can do it, and not while
   something is being written into the folder. */
const WorkFolderDialog = ({
  folder,
  working,
  onClose
}: {
  folder: string
  /* why the folder cannot change right now: something running that writes into it */
  working: string | null
  onClose: () => void
}) => {
  const choose = typeof window === 'undefined' ? undefined : window.skydock?.chooseWorkFolder
  const [said, setSaid] = useState<string | null>(null)
  const ask = async () => {
    if (!choose) return
    const answer = answerSchema.safeParse(await choose().catch(() => null))
    if (!answer.success) setSaid(t`The folder could not be changed.`)
    else if ('refused' in answer.data) setSaid(answer.data.refused)
    else if (answer.data.chosen) {
      const chosen = answer.data.chosen
      setSaid(t`Opening ${chosen}…`)
    }
  }
  return (
    <Modal
      label={t`Work folder`}
      title={t`Work folder`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
          {choose && (
            <Go
              disabled={working !== null}
              title={working ?? undefined}
              onClick={() => void ask()}>
              {t`Choose another folder…`}
            </Go>
          )}
        </>
      }>
      <p className='m-0 text-body text-ink-2'>{t`SkyDock works in`}</p>
      <code className='font-mono text-body break-all text-ink'>{folder}</code>

      <p className='m-0 text-body font-semibold text-ink'>{t`Choosing another folder`}</p>
      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
        <Line mark='✓'>
          {t`the board opens on what that folder holds — empty, or the work already kept there`}
        </Line>
        <Line mark='✓'>{t`this folder stays exactly as it is, and can be chosen again`}</Line>
        <Line mark='✕'>
          {t`nothing is copied or moved: to take the work along, move the folder by hand first`}
        </Line>
      </ul>

      {!choose && (
        <Note>
          {t`The folder is changed from SkyDock’s own window. Here it is the one the server was started with.`}
        </Note>
      )}
      {working && choose && (
        <p className='m-0 text-small text-local'>{t`${working} — wait until it is done.`}</p>
      )}
      {said && <p className='m-0 text-body text-ink'>{said}</p>}
    </Modal>
  )
}

export { WorkFolderDialog }
