import { plural, t } from '@lingui/core/macro'
import { NameMontage } from './montage-card'
import type { Passenger } from './montage-card'
import { Modal } from './modal'
import type { ManifestGroup } from './types'

const NameMontageDialog = ({
  jump,
  count,
  keeps,
  passengers,
  onSave,
  onClose
}: {
  jump?: ManifestGroup
  count?: number
  keeps?: string
  passengers: Passenger[]
  onSave: (passenger: Passenger) => void
  onClose: () => void
}) => (
  <Modal
    label={t`Name the montage`}
    title={t`Name the montage`}
    onClose={onClose}>
    <p className='m-0 text-body text-ink-2'>
      {jump
        ? t`This jump becomes a montage once it has a name.`
        : plural(count ?? 0, {
            one: 'This file becomes a montage once it has a name.',
            other: 'These # files become a montage once it has a name.'
          })}
    </p>
    <NameMontage
      group={jump}
      initial={jump?.name ?? ''}
      keeps={keeps}
      passengers={passengers}
      onSave={onSave}
      onCancel={onClose}
    />
  </Modal>
)

export { NameMontageDialog }
