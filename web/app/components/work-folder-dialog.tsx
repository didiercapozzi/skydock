import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { z } from 'zod'
import { Go, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'
import { Note } from './blurbs'

const answerSchema = z.union([
  z.object({ chosen: z.string().nullable() }),
  z.object({ refused: z.string() })
])

const WorkFolderDialog = ({
  folder,
  working,
  onClose
}: {
  folder: string
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
              title={working ? t`${working} — choosing another folder asks first` : undefined}
              onClick={() => void ask()}>
              {t`Choose another folder…`}
            </Go>
          )}
        </>
      }>
      <p className='m-0 text-body text-ink-2'>{t`SkyDock works in`}</p>
      <code className='font-mono text-body break-all text-ink'>{folder}</code>

      <Section title={t`Choosing another folder`}>
        <Line mark='✓'>
          {t`the board opens on what that folder holds — empty, or the work already kept there`}
        </Line>
        <Line mark='✓'>{t`this folder stays exactly as it is, and can be chosen again`}</Line>
        <Line mark='✕'>
          {t`nothing is copied or moved: to take the work along, move the folder by hand first`}
        </Line>
      </Section>

      {!choose && (
        <Note>
          {t`The folder is changed from SkyDock’s own window. Here it is the one the server was started with.`}
        </Note>
      )}
      {working && choose && (
        <p className='m-0 text-small text-local'>
          {t`${working} — choosing another folder now stops it, so SkyDock asks first.`}
        </p>
      )}
      {said && <p className='m-0 text-body text-ink'>{said}</p>}
    </Modal>
  )
}

export { WorkFolderDialog }
