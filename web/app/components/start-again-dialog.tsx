import { t } from '@lingui/core/macro'
import { Note } from './blurbs'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'

const StartAgainDialog = ({
  who,
  onClose,
  onConfirm
}: {
  who: string
  onClose: () => void
  onConfirm: () => void
}) => (
  <Modal
    label={t`Start the edit again`}
    title={t`Start ${who}’s edit again`}
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>{t`Cancel`}</Mini>
        <Danger onClick={onConfirm}>{t`Start again`}</Danger>
      </>
    }>
    <Section title={t`Kept aside in .projects, then taken away`}>
      <Line mark='✕'>{t`the film editor’s edit`}</Line>
    </Section>
    <Section title={t`Left as they are`}>
      <Line mark='✓'>{t`the copies, and the film rendered last`}</Line>
      <Line mark='✓'>{t`the name, every trim and frame, and every corrected time`}</Line>
    </Section>
    <Note>
      {t`The montage is no longer held by that edit. The film editor starts again from the clips laid end to end.`}
    </Note>
  </Modal>
)

export { StartAgainDialog }
