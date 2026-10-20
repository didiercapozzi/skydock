import { t } from '@lingui/core/macro'
import type { MontageFact } from '@skydock/scripts'
import { Note } from './blurbs'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'

type Which = 'edit' | 'kdenlive'

const StartAgainDialog = ({
  who,
  facts,
  onClose,
  onConfirm
}: {
  who: string
  facts: MontageFact
  onClose: () => void
  onConfirm: (which: Which) => void
}) => {
  const edits: Which[] = [
    ...(facts.edit ? (['edit'] as const) : []),
    ...(facts.kdenlive ? (['kdenlive'] as const) : [])
  ]
  const named = { edit: t`the film editor’s edit`, kdenlive: t`the kdenlive project` }
  return (
    <Modal
      label={t`Start the edit again`}
      title={t`Start ${who}’s edit again`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          {edits.map((which) => (
            <Danger
              key={which}
              onClick={() => onConfirm(which)}>
              {edits.length === 1
                ? t`Start again`
                : which === 'edit'
                  ? t`Start the film editor’s edit again`
                  : t`Start the kdenlive project again`}
            </Danger>
          ))}
        </>
      }>
      <Section title={t`Kept aside in .projects, then taken away`}>
        {edits.map((which) => (
          <Line
            key={which}
            mark='✕'>
            {named[which]}
          </Line>
        ))}
      </Section>
      <Section title={t`Left as they are`}>
        <Line mark='✓'>{t`the copies, and the film rendered last`}</Line>
        <Line mark='✓'>{t`the name, every trim and frame, and every corrected time`}</Line>
      </Section>
      <Note>
        {t`The montage is no longer held by that edit. The film editor starts again from the clips laid end to end, and a kdenlive project can be made anew.`}
      </Note>
    </Modal>
  )
}

export { StartAgainDialog }
export type { Which as StartAgainWhich }
