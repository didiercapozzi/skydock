import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'

/* A jump going is nothing to ask about — its files stay, loose in Fresh files, with their trims.
   Only its processed copies are lost, so that is what this asks about, in the app's own words
   rather than the browser's. */
const DeleteJumpDialog = ({
  label,
  files,
  copies,
  onClose,
  onConfirm
}: {
  label: string
  files: number
  copies: number
  onClose: () => void
  onConfirm: () => void
}) => (
  <Modal
    label={t`Delete jump`}
    title={t`Delete ${label}`}
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>{t`Cancel`}</Mini>
        <Danger onClick={onConfirm}>{t`Delete jump`}</Danger>
      </>
    }>
    <Section>
      <Line mark='✓'>
        {t`its ${plural(files, { one: '# file stays', other: '# files stay' })}, loose in Fresh files, with their trims`}
      </Line>
      <Line mark='✕'>
        {t`${plural(copies, { one: '# processed copy is', other: '# processed copies are' })} deleted, and made again when it is processed next`}
      </Line>
    </Section>
  </Modal>
)

export { DeleteJumpDialog }
