import { EDIT_LOCKED, isVideoFile, passengerOf } from '@skydock/scripts'
import type { TandemEntry } from '@skydock/scripts'
import { Callout } from './callout'
import { folderOnStorage } from '../helpers/jumps'
import { StorageList } from './storage-list'
import { PassengerCard } from './tandem-card'
import type { ManifestFile, ManifestGroup } from './types'

/* All passengers: one card per tandem, the nameless first, and below them the storage's own list
   of every tandem it holds (RULES, The storage's list of tandems). */
const TandemsGrid = ({
  unnamed,
  named,
  asOnStorage,
  renaming,
  frozen,
  storage,
  groupDropTarget,
  onOpen,
  onPreview,
  onRename,
  onName,
  onEmail
}: {
  unnamed: ManifestGroup[]
  named: ManifestGroup[]
  asOnStorage: (group: ManifestGroup) => ManifestGroup
  renaming: string | null
  frozen: Set<string>
  storage: { dir: string; tandems: TandemEntry[]; problem: string | null } | null
  groupDropTarget: (groupId: string) => Record<string, unknown>
  onOpen: (who: string) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onRename: (groupId: string | null) => void
  onName: (groupId: string, firstname: string, lastname: string) => void
  onEmail: (folder: string) => void
}) => (
  <>
    {unnamed.length > 0 && (
      <Callout tone='warn'>
        <b className='text-ink'>
          {unnamed.length} tandem{unnamed.length === 1 ? '' : 's'} with no passenger yet.
        </b>{' '}
        Open one to give it a name — it is the folder the passenger gets.
      </Callout>
    )}
    <div className='my-2.5 grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-2.5'>
      {[...unnamed, ...named].map((group) => {
        const who = passengerOf(group)
        return (
          <PassengerCard
            key={group.id}
            group={asOnStorage(group)}
            who={who}
            naming={renaming === group.id}
            locked={frozen.has(group.id) ? EDIT_LOCKED : undefined}
            dropTarget={groupDropTarget(group.id)}
            /* A named tandem has a place of its own to open. One still waiting for a name has none
               — the places are keyed by the passenger — so the clips themselves are what opens,
               which is what the name is read from. */
            onOpen={() => {
              if (who) {
                onOpen(who)
                return
              }
              const first = group.files.find((f) => isVideoFile(f.path)) ?? group.files[0]
              if (first) onPreview(first, group.id)
            }}
            onRename={() => onRename(group.id)}
            onName={(firstname, lastname) => {
              onName(group.id, firstname, lastname)
              onRename(null)
            }}
          />
        )
      })}
    </div>
    <StorageList
      storage={storage}
      isHere={(entry) => [...unnamed, ...named].some((g) => folderOnStorage(g) === entry.folder)}
      onOpen={(entry) => onOpen(`${entry.firstname} ${entry.lastname}`.trim())}
      onEmail={(entry) => onEmail(entry.folder)}
    />
  </>
)

export { TandemsGrid }
