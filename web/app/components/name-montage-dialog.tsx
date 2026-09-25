import { NameMontage } from './montage-card'
import type { Passenger } from './montage-card'
import { Modal } from './modal'
import type { ManifestGroup } from './types'

/* What is dropped on the Montages heading becomes a montage, and a montage is its name: so the name is
   asked for before anything moves. Saved, it is made and named in one step; cancelled, nothing has
   changed and what was dropped is still where it was (RULES, Making a montage). */
const NameMontageDialog = ({
  jump,
  count,
  keeps,
  passengers,
  onSave,
  onClose
}: {
  /* the jump dropped, whose frames help tell who it is; none when files were dropped */
  jump?: ManifestGroup
  /* how many files were dropped, when it was files */
  count?: number
  keeps?: string
  passengers: Passenger[]
  onSave: (passenger: Passenger) => void
  onClose: () => void
}) => (
  <Modal
    label='Name the montage'
    title='Name the montage'
    onClose={onClose}>
    <p className='m-0 text-[12.5px] text-ink-2'>
      {jump
        ? 'This jump becomes a montage once it has a name.'
        : `${count === 1 ? 'This file becomes' : `These ${count ?? 0} files become`} a montage once it has a name.`}
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
