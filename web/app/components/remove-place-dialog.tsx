import { plural, t } from '@lingui/core/macro'
import { Danger, Mini } from './buttons'
import { Line, Modal, Section, Spacer } from './modal'
import { Note } from './blurbs'

const RemovePlaceDialog = ({
  place,
  jumps,
  loose,
  linked,
  onClose,
  onConfirm
}: {
  place: string
  jumps: number
  loose: number
  linked: string | null
  onClose: () => void
  onConfirm: () => void
}) => {
  const filed = [
    jumps > 0 ? plural(jumps, { one: '# jump', other: '# jumps' }) : null,
    loose > 0 ? plural(loose, { one: '# loose file', other: '# loose files' }) : null
  ].filter(Boolean)
  const what = filed.join(t` and `)
  return (
    <Modal
      label={t`Remove a destination`}
      title={t`Remove ${place}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Danger onClick={onConfirm}>{t`Remove ${place}`}</Danger>
        </>
      }>
      <Section title={t`What happens`}>
        <Line mark='✕'>{t`${place} stops being a destination files can be filed under`}</Line>
        {filed.length > 0 ? (
          <Line mark='↩'>
            {t`${what} filed there come back to Fresh files, whole — every jump keeps its files, its name and its trims, and can be filed somewhere else`}
          </Line>
        ) : (
          <Line mark='✓'>{t`nothing is filed there`}</Line>
        )}
        {linked && <Line mark='✕'>{t`it stops being linked to ${linked} on the storage`}</Line>}
      </Section>

      <Section title={t`What does not`}>
        <Line mark='✓'>{t`every original stays on this machine, exactly where it is`}</Line>
        {linked && (
          <Line mark='✓'>
            {t`${linked} and everything in it stays on the storage, and so does any link handed out of it`}
          </Line>
        )}
      </Section>

      <Note>
        {t`The copies already made for ${place} were written into a folder named after it, so they are forgotten and made again wherever those jumps are filed next. Making the place again by the same name does not bring the filing back.`}
      </Note>
    </Modal>
  )
}

export { RemovePlaceDialog }
