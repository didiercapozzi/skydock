import { itemsFrom, PARTS, stemOf } from '@skydock/scripts'
import type { PartFile, SendItem, SendPart, SendPlan, TandemFact } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini, Seg } from './buttons'
import { Modal, Spacer } from './modal'
import type { Destination, ManifestGroup } from './types'
import { formatFilmSize, hhmm, isVideoFile, plural } from './utils'

/* Uploading a montage, in two steps (RULES, Uploading a montage). First what is zipped — the
   original videos, the photos, the film, the project, into one zip or a zip each — with what that
   makes shown beside it, named as it will be. Then where each of those goes: dragged, or added, into
   one destination or more. The same item can go to several; a destination holding the film gets the
   share link that is emailed. */

const PART_LABEL: Record<SendPart, string> = {
  videos: 'Original videos',
  photos: 'Photos',
  film: 'The film',
  project: 'The kdenlive project'
}

const ICON: Record<SendPart, string> = { videos: '🎞', photos: '🖼', film: '▶', project: '✎' }

/* What each part of the montage is made of, as the board knows it: the originals, the photos as they
   were prepared, the film and the project once they exist. The same parts the upload reads off the
   disk, so the items shown are the items built. */
const partsOf = (group: ManifestGroup, facts?: TandemFact): Record<SendPart, PartFile[]> => ({
  videos: group.files
    .filter((f) => isVideoFile(f.path))
    .map((f) => ({ file: f.path, name: f.filename, size: f.size })),
  photos: group.files
    .filter((f) => !isVideoFile(f.path))
    .flatMap((f) =>
      f.processed
        ? [
            {
              file: f.processed.path,
              name: f.processed.path.slice(f.processed.path.lastIndexOf('/') + 1),
              size: f.processed.size
            }
          ]
        : []
    )
    .sort((a, b) => a.name.localeCompare(b.name)),
  film: facts?.film ? [{ file: facts.film.path, name: 'film', size: facts.film.size }] : [],
  project: facts?.project ? [{ file: facts.projectPath, name: 'project', size: 0 }] : []
})

/* what an item holds, said in a line */
const holding = (item: SendItem, parts: Record<SendPart, PartFile[]>) =>
  item.holds
    .map((part) =>
      part === 'videos'
        ? plural(parts.videos.length, 'clip')
        : part === 'photos'
          ? plural(parts.photos.length, 'photo')
          : part === 'film'
            ? 'the film'
            : 'the project'
    )
    .join(' · ')

const insideOf = (item: SendItem, parts: Record<SendPart, PartFile[]>, stem: string) =>
  item.holds.map((part) =>
    part === 'videos'
      ? `videos/ — ${plural(parts.videos.length, 'clip')}`
      : part === 'photos'
        ? `photos/ — ${plural(parts.photos.length, 'photo')}`
        : `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}`
  )

const ItemCard = ({
  item,
  parts,
  stem,
  places,
  onAdd
}: {
  item: SendItem
  parts: Record<SendPart, PartFile[]>
  stem: string
  /* in step two, where it can be added; absent in the preview */
  places?: string[]
  onAdd?: (destination: string) => void
}) => (
  <div
    draggable={onAdd !== undefined}
    onDragStart={(e) => {
      e.dataTransfer.setData('text/plain', item.key)
      e.dataTransfer.effectAllowed = 'copy'
    }}
    aria-label={item.name}
    className={`flex flex-col gap-0.5 rounded-[9px] border border-line bg-pane px-3 py-2 ${onAdd ? 'cursor-grab' : ''}`}>
    <span className='flex items-center gap-2'>
      {onAdd && <span className='text-ink-3'>⠿</span>}
      <span className='text-accent'>{item.zip ? '🗜' : ICON[item.holds[0]!]}</span>
      <code className='min-w-0 truncate font-mono text-[12px] font-medium'>{item.name}</code>
      <span
        className={`rounded-full px-1.5 text-[10.5px] font-semibold ${item.zip ? 'bg-accent-soft text-accent' : 'bg-line-2 text-ink-2'}`}>
        {item.zip ? 'zip' : 'as it is'}
      </span>
    </span>
    <span className='pl-6 text-[11.5px] text-ink-2'>
      {holding(item, parts)}
      {item.size > 0 ? ` · ${formatFilmSize(item.size)}` : ''}
    </span>
    {item.zip &&
      insideOf(item, parts, stem).map((line) => (
        <span
          key={line}
          className='pl-6 font-mono text-[11px] text-ink-2'>
          └ {line}
        </span>
      ))}
    {onAdd && places && (
      <select
        aria-label={`Add ${item.name} to`}
        value=''
        onChange={(e) => e.target.value && onAdd(e.target.value)}
        className='mt-1 ml-6 self-start rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[11.5px] text-ink-2'>
        <option value=''>Add to…</option>
        {places.map((name) => (
          <option
            key={name}
            value={name}>
            {name}
          </option>
        ))}
      </select>
    )}
  </div>
)

const DestinationDrop = ({
  place,
  who,
  items,
  over,
  onDrop,
  onOver,
  onLeave,
  onRemove,
  onPickFolder
}: {
  place: Destination
  who: string
  items: SendItem[]
  over: boolean
  onDrop: (key: string) => void
  onOver: () => void
  onLeave: () => void
  onRemove: (key: string) => void
  onPickFolder: () => void
}) => (
  <section
    aria-label={place.name}
    onDragOver={(e) => {
      e.preventDefault()
      onOver()
    }}
    onDragLeave={onLeave}
    onDrop={(e) => {
      e.preventDefault()
      const key = e.dataTransfer.getData('text/plain')
      if (key) onDrop(key)
    }}
    className={`flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5 ${
      over ? 'border-2 border-dashed border-pick bg-pick-soft' : 'border border-line bg-pane'
    }`}>
    <span className='flex items-center gap-2 text-[13px]'>
      <span>⌂</span>
      <b>{place.name}</b>
      {items.some((item) => item.holds.includes('film')) && (
        <span className='ml-auto text-[11.5px] font-semibold text-accent'>🔗 share link</span>
      )}
    </span>
    {place.path ? (
      <code className='font-mono text-[10.5px] break-all text-ink-2'>
        {place.path}/{who}/
      </code>
    ) : (
      <Mini onClick={onPickFolder}>choose its folder on the storage</Mini>
    )}
    {items.map((item) => (
      <span
        key={item.key}
        className='flex items-center gap-2 rounded-md bg-ground px-2 py-1'>
        <span className='text-accent'>{item.zip ? '🗜' : ICON[item.holds[0]!]}</span>
        <code className='min-w-0 flex-1 truncate font-mono text-[11.5px]'>{item.name}</code>
        <button
          type='button'
          aria-label={`Take ${item.name} out of ${place.name}`}
          onClick={() => onRemove(item.key)}
          className='border-0 bg-transparent px-1 text-ink-3 hover:text-ink'>
          ✕
        </button>
      </span>
    ))}
    {items.length === 0 && (
      <span className='py-1 text-center text-[12px] text-ink-3'>drop here</span>
    )}
  </section>
)

const ZIP_HOW = [
  ['one', 'into one zip'],
  ['each', 'into a zip each']
] as const

/* A plan never placed anywhere starts from what a club usually does: the film and the photos to
   Tandems, a zip to the Backup, when those destinations exist. */
const suggested = (items: SendItem[], places: Destination[]) => {
  const has = (name: string) => places.some((p) => p.name === name)
  return Object.fromEntries(
    items.flatMap((item) => {
      const to = item.zip ? 'Backup' : 'Tandems'
      return has(to) ? [[item.key, [to]]] : []
    })
  )
}

const UploadDialog = ({
  who,
  group,
  facts,
  places,
  plan,
  onPlan,
  onPickFolder,
  onClose,
  onUpload
}: {
  who: string
  group: ManifestGroup
  facts?: TandemFact
  places: Destination[]
  plan: SendPlan
  /* the plan as it now is, remembered for the next montage */
  onPlan: (plan: SendPlan) => void
  onPickFolder: (destination: string) => void
  onClose: () => void
  onUpload: (plan: SendPlan) => void
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [over, setOver] = useState<string | null>(null)
  const parts = partsOf(group, facts)
  const stem = stemOf(group)
  const present = PARTS.filter((part) => parts[part].length > 0)
  const items = itemsFrom(parts, stem, plan.zip)
  const placed = Object.keys(plan.placed).length > 0 ? plan.placed : suggested(items, places)
  const placesOf = (key: string) => placed[key] ?? []

  const setZip = (zip: SendPlan['zip']) => onPlan({ ...plan, zip })
  const tick = (part: SendPart, on: boolean) =>
    setZip({
      ...plan.zip,
      parts: on ? [...new Set([...plan.zip.parts, part])] : plan.zip.parts.filter((p) => p !== part)
    })
  const place = (key: string, destination: string) =>
    onPlan({ ...plan, placed: { ...placed, [key]: [...new Set([...placesOf(key), destination])] } })
  const takeOut = (key: string, destination: string) =>
    onPlan({
      ...plan,
      placed: { ...placed, [key]: placesOf(key).filter((d) => d !== destination) }
    })

  /* what goes, as the upload will be asked for it: only the items there are, where they were put */
  const asked: SendPlan = {
    zip: plan.zip,
    placed: Object.fromEntries(items.map((item) => [item.key, placesOf(item.key)]))
  }
  const used = [...new Set(items.flatMap((item) => placesOf(item.key)))]
  const left = items.filter((item) => placesOf(item.key).length === 0)
  const waitingForFilm = parts.videos.length > 0 && parts.film.length === 0
  const blocked = waitingForFilm
    ? 'Render the film in kdenlive first'
    : used.length === 0
      ? 'Put at least one thing in a destination'
      : used.some((name) => !places.find((p) => p.name === name)?.path)
        ? 'Choose a folder on the storage for every destination used'
        : null
  const uploaded = group.uploaded

  const steps = (
    <span className='flex items-center gap-3 text-[12.5px]'>
      {(['What to zip', 'Where it goes'] as const).map((label, i) => (
        <span
          key={label}
          className={`flex items-center gap-1.5 ${step === i + 1 ? 'font-semibold text-ink' : 'text-ink-2'}`}>
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${
              step > i + 1 || step === i + 1
                ? 'bg-accent text-white'
                : 'border border-line text-ink-3'
            }`}>
            {step > i + 1 ? '✓' : i + 1}
          </span>
          {label}
        </span>
      ))}
    </span>
  )

  return (
    <Modal
      label='Upload'
      title={who}
      wide
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <span className='text-[12px] text-ink-2'>Remembered for the next montage.</span>
            <Spacer />
            <Mini onClick={onClose}>Close</Mini>
            <Go onClick={() => setStep(2)}>Next: where it goes →</Go>
          </>
        ) : (
          <>
            <Mini onClick={() => setStep(1)}>← What to zip</Mini>
            <span className='text-[12px] text-ink-2'>
              {left.length > 0
                ? `${left.map((item) => item.name).join(', ')} stays on this machine`
                : `${plural(items.length, 'item')} to ${plural(used.length, 'destination')}`}
            </span>
            <Spacer />
            <Mini onClick={onClose}>Close</Mini>
            <Go
              disabled={blocked !== null}
              title={blocked ?? 'Build each item once, then send it to every destination it is in'}
              onClick={() => onUpload(asked)}>
              {uploaded ? 'Upload again' : 'Upload'}
            </Go>
          </>
        )
      }>
      <div className='flex flex-wrap items-center gap-3'>
        {steps}
        {uploaded && (
          <span className='ml-auto text-[12px] font-semibold text-up'>
            ✓ uploaded {hhmm(uploaded.at)}
          </span>
        )}
      </div>
      {step === 1 ? (
        <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-[700px]:grid-cols-1'>
          <div className='flex flex-col gap-2'>
            <b className='text-[13px]'>Zip what?</b>
            {present.map((part) => (
              <label
                key={part}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 ${
                  plan.zip.parts.includes(part) ? 'bg-accent-soft' : 'hover:bg-line-2'
                }`}>
                <input
                  type='checkbox'
                  checked={plan.zip.parts.includes(part)}
                  onChange={(e) => tick(part, e.target.checked)}
                />
                <span className='w-4 text-accent'>{ICON[part]}</span>
                <span className='flex flex-col'>
                  <span className='text-[13px] font-medium'>{PART_LABEL[part]}</span>
                  <span className='text-[11.5px] text-ink-2'>
                    {part === 'videos'
                      ? plural(parts.videos.length, 'clip')
                      : part === 'photos'
                        ? plural(parts.photos.length, 'photo')
                        : part === 'film'
                          ? 'the montage, rendered'
                          : 'the one record of the edit'}
                  </span>
                </span>
              </label>
            ))}
            {waitingForFilm && (
              <span className='text-[12px] text-local'>
                No film yet — render it in kdenlive first.
              </span>
            )}
            <span className='flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2'>
              Ticked ones go
              <Seg
                label='Ticked ones go'
                value={plan.zip.each ? 'each' : 'one'}
                options={ZIP_HOW}
                onPick={(how) => setZip({ ...plan.zip, each: how === 'each' })}
              />
            </span>
            <span className='text-[12px] text-ink-2'>What is not ticked is sent as it is.</span>
          </div>
          <div
            aria-label='What will be sent'
            className='flex flex-col gap-2 rounded-[10px] bg-ground p-3'>
            <b className='text-[13px]'>
              What will be sent{' '}
              <span className='font-normal text-ink-2'>— {plural(items.length, 'item')}</span>
            </b>
            {items.map((item) => (
              <ItemCard
                key={item.key}
                item={item}
                parts={parts}
                stem={stem}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className='grid grid-cols-[300px_minmax(0,1fr)] gap-4 max-[700px]:grid-cols-1'>
          <div className='flex flex-col gap-2'>
            <b className='text-[13px]'>What will be sent</b>
            <span className='text-[12px] text-ink-2'>
              Drag each onto one destination or more — the same one can go to several.
            </span>
            {items.map((item) => (
              <ItemCard
                key={item.key}
                item={item}
                parts={parts}
                stem={stem}
                places={places.map((p) => p.name)}
                onAdd={(destination) => place(item.key, destination)}
              />
            ))}
          </div>
          <div className='grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-2.5'>
            {places.map((p) => (
              <DestinationDrop
                key={p.name}
                place={p}
                who={who}
                items={items.filter((item) => placesOf(item.key).includes(p.name))}
                over={over === p.name}
                onOver={() => setOver(p.name)}
                onLeave={() => setOver((current) => (current === p.name ? null : current))}
                onDrop={(key) => {
                  setOver(null)
                  place(key, p.name)
                }}
                onRemove={(key) => takeOut(key, p.name)}
                onPickFolder={() => onPickFolder(p.name)}
              />
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

export { UploadDialog }
