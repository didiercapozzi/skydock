import { itemsFrom, PARTS, projectFolderOf, slugOf, stemOf, zipNameOf } from '@skydock/scripts'
import type { PartFile, SendItem, SendPart, SendPlan, MontageFact } from '@skydock/scripts'
import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { Go, Mini, Seg } from './buttons'
import { INPUT, Modal, Spacer } from './modal'
import type { Destination, ManifestGroup } from './types'
import { formatFilmSize, hhmm, isVideoFile } from './utils'

/* Uploading a montage, in two steps (RULES, Uploading a montage). First the zips: each of the
   montage's four parts — its original videos, its original photos, the project, the montage itself —
   is dragged onto a zip, the same part into as many as wanted, and every zip shows exactly what is
   inside it. Then where it all goes: the zips, and each part as it is, dragged onto one destination
   or more, each destination taking them straight into its folder or into the project folder. */

type Parts = Record<SendPart, PartFile[]>

const PART_NAMES = {
  videos: msg`Original videos`,
  photos: msg`Original photos`,
  film: msg`The montage`,
  project: msg`The kdenlive project`
} as const

/* a part, named in the language the app speaks */
const partName = (part: SendPart) => i18n._(PART_NAMES[part])

const ICON: Record<SendPart, string> = { videos: '🎞', photos: '🖼', film: '▶', project: '✎' }

/* how many files a group shows by name before it says how many more */
const SHOWN = 3

/* What each part of the montage is made of, as the board knows it: the originals, the photos as they
   were prepared, the montage and the project once they exist. The same parts the upload reads off
   the disk, so the items shown are the items built. */
const partsOf = (group: ManifestGroup, facts?: MontageFact): Parts => ({
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

const sizeOfPart = (files: PartFile[]) => files.reduce((sum, f) => sum + f.size, 0)

/* what a part is, said in a line: how many and how big */
const aboutPart = (part: SendPart, parts: Parts, stem: string) => {
  const size = sizeOfPart(parts[part])
  const much = size > 0 ? ` · ${formatFilmSize(size)}` : ''
  if (part === 'videos')
    return `${plural(parts.videos.length, { one: '# clip', other: '# clips' })}${much}`
  if (part === 'photos')
    return `${plural(parts.photos.length, { one: '# photo', other: '# photos' })}${much}`
  return `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}${much}`
}

/* One line of a tree: a folder, a file or a zip, indented by how deep it sits. */
const Row = ({
  depth,
  mark,
  name,
  note,
  strong,
  quiet,
  remove
}: {
  depth: number
  mark?: string
  name: string
  note?: string
  strong?: boolean
  quiet?: boolean
  remove?: { label: string; onClick: () => void }
}) => (
  <span
    className='flex min-h-6 items-center gap-1.5 rounded px-1.5'
    style={{ paddingLeft: 6 + depth * 16 }}>
    <span className='w-4 flex-none text-center text-[12px] text-accent'>{mark}</span>
    <code
      className={`min-w-0 flex-1 font-mono text-[11.5px] break-all ${strong ? 'font-semibold' : ''} ${quiet ? 'text-ink-2' : ''}`}>
      {name}
    </code>
    {note && <span className='flex-none text-[11px] text-ink-2'>{note}</span>}
    {remove && (
      <button
        type='button'
        aria-label={remove.label}
        onClick={remove.onClick}
        className='border-0 bg-transparent px-1 text-[12px] text-ink-3 hover:text-ink'>
        ✕
      </button>
    )}
  </span>
)

/* A part as it sits in a zip or a destination: a folder with its first files named, or one file. */
const PartTree = ({
  part,
  parts,
  stem,
  depth,
  remove
}: {
  part: SendPart
  parts: Parts
  stem: string
  depth: number
  remove?: { label: string; onClick: () => void }
}) => {
  if (part === 'film' || part === 'project')
    return (
      <Row
        depth={depth}
        mark={ICON[part]}
        name={`${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}`}
        note={part === 'film' ? formatFilmSize(sizeOfPart(parts.film)) : undefined}
        remove={remove}
      />
    )
  const files = parts[part]
  return (
    <>
      <Row
        depth={depth}
        mark='📁'
        name={`${part}/`}
        note={aboutPart(part, parts, stem)}
        strong
        remove={remove}
      />
      {files.slice(0, SHOWN).map((f) => (
        <Row
          key={f.file}
          depth={depth + 1}
          name={f.name}
          quiet
        />
      ))}
      {files.length > SHOWN && (
        <span
          className='text-[11px] text-ink-3 italic'
          style={{ paddingLeft: 28 + (depth + 1) * 16 }}>
          {t`+ ${files.length - SHOWN} more`}
        </span>
      )}
    </>
  )
}

const TREE = 'flex flex-col rounded-lg border border-line bg-ground px-1 py-1.5'

/* a drop target's look, quiet until something is held over it */
const dropLook = (over: boolean) =>
  over ? 'border-2 border-dashed border-pick bg-pick-soft' : 'border border-line bg-pane'

/* where something dragged in this dialog says what it is: a part in step one, items in step two */
const carry = (e: React.DragEvent, what: string) => {
  e.dataTransfer.setData('text/plain', what)
  e.dataTransfer.effectAllowed = 'copy'
}

const dropZone = (onDrop: (what: string) => void, onOver: () => void, onLeave: () => void) => ({
  onDragOver: (e: React.DragEvent) => {
    e.preventDefault()
    onOver()
  },
  onDragLeave: onLeave,
  onDrop: (e: React.DragEvent) => {
    e.preventDefault()
    const what = e.dataTransfer.getData('text/plain')
    if (what) onDrop(what)
  }
})

/* A new zip's ending: the part it starts with, made unique among the others. */
const endingFor = (part: SendPart, taken: string[]) => {
  const first = part === 'film' ? 'montage' : part
  const free = (n: number): string => {
    const ending = n === 1 ? first : `${first}-${n}`
    return taken.includes(ending) ? free(n + 1) : ending
  }
  return free(1)
}

/* A plan never placed anywhere starts with the zips in the Backup, when there is one: where the film
   and the photos go is the club's to choose, and the plan remembers it from then on. */
const suggested = (items: SendItem[], places: Destination[]) =>
  places.some((p) => p.name === 'Backup')
    ? Object.fromEntries(items.flatMap((item) => (item.zip ? [[item.key, ['Backup']]] : [])))
    : {}

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
  facts?: MontageFact
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
  const [ticked, setTicked] = useState<string[]>([])
  const [added, setAdded] = useState<string[]>([])
  /* the project folder belongs to this montage, so it starts from its name each time */
  const [folder, setFolder] = useState(() => projectFolderOf(group, { zips: [], placed: {} }))
  const parts = partsOf(group, facts)
  const stem = stemOf(group)
  const present = PARTS.filter((part) => parts[part].length > 0)
  const items = itemsFrom(parts, stem, plan.zips)
  const zipItems = items.filter((item) => item.zip)
  const looseItems = items.filter((item) => !item.zip)
  const placed = Object.keys(plan.placed).length > 0 ? plan.placed : suggested(items, places)
  /* where an item goes, among the destinations there are now: one remembered from an earlier
     montage that has since been removed or renamed is no place to send anything, and is left out */
  const placesOf = (key: string) =>
    (placed[key] ?? []).filter((name) => places.some((p) => p.name === name))
  const inRoot = plan.inRoot ?? []
  const leave = (key: string) => setOver((current) => (current === key ? null : current))

  /* step one: the zips */
  const endings = plan.zips.map((zip) => zip.ending)
  const setZips = (zips: SendPlan['zips']) => onPlan({ ...plan, zips })
  /* a zip is known by where it is in the list, so its ending can be typed without it changing */
  const putInZip = (part: SendPart, at: number | null) => {
    if (at === null) setZips([...plan.zips, { ending: endingFor(part, endings), parts: [part] }])
    else
      setZips(
        plan.zips.map((zip, i) =>
          i === at ? { ...zip, parts: [...new Set([...zip.parts, part])] } : zip
        )
      )
  }
  /* a zip left with nothing in it is no zip at all */
  const takeFromZip = (part: SendPart, at: number) =>
    setZips(
      plan.zips.flatMap((zip, i) => {
        if (i !== at) return [zip]
        const kept = zip.parts.filter((p) => p !== part)
        return kept.length > 0 ? [{ ...zip, parts: kept }] : []
      })
    )
  const renameZip = (at: number, typed: string) =>
    setZips(plan.zips.map((zip, i) => (i === at ? { ...zip, ending: slugOf(typed, true) } : zip)))
  const tidyEndings = () =>
    setZips(plan.zips.map((zip) => ({ ...zip, ending: slugOf(zip.ending) })))
  const zipsIn = (part: SendPart) => plan.zips.filter((zip) => zip.parts.includes(part)).length
  const endingTrouble =
    new Set(endings.map((ending) => slugOf(ending))).size < endings.length
      ? t`Two zips end the same way — give each its own ending`
      : null

  /* step two: where it goes */
  const place = (keys: string[], destination: string) =>
    onPlan({
      ...plan,
      placed: {
        ...placed,
        ...Object.fromEntries(
          keys.map((key) => [key, [...new Set([...placesOf(key), destination])]])
        )
      }
    })
  const takeOut = (key: string, destination: string) =>
    onPlan({
      ...plan,
      placed: { ...placed, [key]: placesOf(key).filter((d) => d !== destination) }
    })
  const setRoot = (destination: string, root: boolean) =>
    onPlan({
      ...plan,
      inRoot: root
        ? [...new Set([...inRoot, destination])]
        : inRoot.filter((d) => d !== destination)
    })
  const dropDestination = (destination: string) => {
    setAdded(added.filter((d) => d !== destination))
    onPlan({
      ...plan,
      placed: Object.fromEntries(
        Object.entries(placed).map(([key, to]) => [key, to.filter((d) => d !== destination)])
      )
    })
  }
  const tick = (key: string, on: boolean) =>
    setTicked(on ? [...ticked, key] : ticked.filter((k) => k !== key))
  /* dragging a ticked item carries every ticked one with it */
  const dragged = (key: string) => (ticked.includes(key) ? ticked : [key]).join('\n')

  const projectFolder = slugOf(folder)
  const asked: SendPlan = {
    zips: plan.zips.map((zip) => ({ ...zip, ending: slugOf(zip.ending) })),
    placed: Object.fromEntries(items.map((item) => [item.key, placesOf(item.key)])),
    inRoot: inRoot.filter((d) => items.some((item) => placesOf(item.key).includes(d))),
    folder: projectFolder
  }
  const used = [...new Set(items.flatMap((item) => placesOf(item.key)))]
  /* a destination shows once something is in it, or once it is added to be dropped on */
  const shown = places.filter((p) => added.includes(p.name) || used.includes(p.name))
  const hidden = places.filter((p) => !shown.includes(p))
  /* a part that goes up inside a zip is not left behind, even when it is not sent as it is too */
  const zippedAway = (part: SendPart) =>
    zipItems.some((item) => item.holds.includes(part) && placesOf(item.key).length > 0)
  const left = items.filter(
    (item) => placesOf(item.key).length === 0 && (item.zip || !zippedAway(item.holds[0]!))
  )
  const sends = items.reduce((sum, item) => sum + placesOf(item.key).length, 0)
  const waitingForFilm = parts.videos.length > 0 && parts.film.length === 0
  const blocked = waitingForFilm
    ? t`Render the film in kdenlive first`
    : used.length === 0
      ? t`Put at least one thing in a destination`
      : used.some((name) => !places.find((p) => p.name === name)?.path)
        ? t`Choose a folder on the storage for every destination used`
        : projectFolder === '' && used.some((name) => !inRoot.includes(name))
          ? t`Give the project folder a name`
          : null
  const uploaded = group.uploaded

  const steps = (
    <span className='flex items-center gap-3 text-[12.5px]'>
      {[t`Make the zips`, t`Where it goes`].map((label, i) => (
        <span
          key={label}
          className={`flex items-center gap-1.5 ${step === i + 1 ? 'font-semibold text-ink' : 'text-ink-2'}`}>
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${
              step >= i + 1 ? 'bg-accent text-white' : 'border border-line text-ink-3'
            }`}>
            {step > i + 1 ? '✓' : i + 1}
          </span>
          {label}
        </span>
      ))}
    </span>
  )

  const stepOne = (
    <div className='grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-4 max-[800px]:grid-cols-1'>
      <div className='flex flex-col gap-2'>
        <b className='text-[13px]'>{t`What the montage has`}</b>
        <span className='text-[12px] text-ink-2'>
          {t`Drag any of these onto a zip. The same one can go into several zips.`}
        </span>
        {present.map((part) => (
          <div
            key={part}
            draggable
            onDragStart={(e) => carry(e, part)}
            aria-label={partName(part)}
            className='flex cursor-grab items-center gap-2 rounded-[9px] border border-line bg-pane px-3 py-2.5'>
            <span className='text-ink-3'>⠿</span>
            <span className='w-4 text-accent'>{ICON[part]}</span>
            <span className='flex min-w-0 flex-1 flex-col'>
              <span className='text-[13.5px] font-semibold'>{partName(part)}</span>
              <span className='text-[11.5px] break-all text-ink-2'>
                {aboutPart(part, parts, stem)}
              </span>
            </span>
            {zipsIn(part) > 0 && (
              <span className='rounded-full bg-pick-soft px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-pick'>
                {plural(zipsIn(part), { one: 'in # zip', other: 'in # zips' })}
              </span>
            )}
          </div>
        ))}
        {waitingForFilm && (
          <span className='text-[12px] text-local'>
            {t`No montage rendered yet — render it in kdenlive first.`}
          </span>
        )}
      </div>
      <div
        aria-label={t`Zips`}
        className='flex min-h-0 flex-col gap-2.5 rounded-[10px] bg-ground p-3'>
        <b className='text-[13px]'>
          {t`Zips`}{' '}
          <span className='font-normal text-ink-2'>
            — {plural(zipItems.length, { one: '# zip', other: '# zips' })}
          </span>
        </b>
        <div className='grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] items-start gap-3'>
          {plan.zips.map((zip, at) => {
            const name = zipNameOf(stem, zip.ending)
            const inside = present.filter((part) => zip.parts.includes(part))
            const size = inside.reduce((sum, part) => sum + sizeOfPart(parts[part]), 0)
            return (
              <section
                key={at}
                aria-label={name}
                {...dropZone(
                  (what) => {
                    setOver(null)
                    const part = PARTS.find((p) => p === what)
                    if (part) putInZip(part, at)
                  },
                  () => setOver(`zip:${at}`),
                  () => leave(`zip:${at}`)
                )}
                className={`flex flex-col gap-2 rounded-[10px] p-3 ${dropLook(over === `zip:${at}`)}`}>
                <span className='flex items-center gap-2'>
                  <span className='text-accent'>🗜</span>
                  <code className='min-w-0 flex-1 font-mono text-[12.5px] font-semibold break-all'>
                    {name}
                  </code>
                  <button
                    type='button'
                    aria-label={t`Remove ${name}`}
                    onClick={() => setZips(plan.zips.filter((_, i) => i !== at))}
                    className='rounded-[5px] border border-line bg-pane px-2 py-0.5 text-[12px] text-ink-3 hover:text-ink'>
                    ✕
                  </button>
                </span>
                <label className='flex items-center gap-2 text-[11.5px] text-ink-2'>
                  {t`Name ends with`}
                  <input
                    aria-label={t`Name ends with`}
                    value={zip.ending}
                    onChange={(e) => renameZip(at, e.target.value)}
                    onBlur={tidyEndings}
                    className={`${INPUT} w-32 py-0.5 font-mono text-[12px]`}
                  />
                  <Spacer />
                  {size > 0 && formatFilmSize(size)}
                </label>
                <span className='text-[10.5px] font-semibold tracking-[.08em] text-ink-3 uppercase'>
                  {t`Inside the zip`}
                </span>
                <div className={TREE}>
                  {inside.map((part) => (
                    <PartTree
                      key={part}
                      part={part}
                      parts={parts}
                      stem={stem}
                      depth={0}
                      remove={{
                        label: t`Take ${partName(part)} out of ${name}`,
                        onClick: () => takeFromZip(part, at)
                      }}
                    />
                  ))}
                  {inside.length === 0 && (
                    <span className='py-1 text-center text-[12px] text-ink-3'>
                      {t`nothing this montage has`}
                    </span>
                  )}
                </div>
              </section>
            )
          })}
        </div>
        <div
          {...dropZone(
            (what) => {
              setOver(null)
              const part = PARTS.find((p) => p === what)
              if (part) putInZip(part, null)
            },
            () => setOver('new'),
            () => leave('new')
          )}
          className={`flex flex-col items-center gap-1 rounded-[10px] px-4 text-center text-ink-2 ${
            plan.zips.length === 0 ? 'py-14' : 'py-4'
          } ${over === 'new' ? 'border-2 border-dashed border-pick bg-pick-soft' : 'border-2 border-dashed border-line'}`}>
          <span className='text-[13px] font-semibold'>
            {plan.zips.length === 0
              ? t`Drop here: it makes a zip`
              : t`Drop here to make another zip`}
          </span>
          <span className='text-[11.5px]'>
            {t`Named ${stem}.….zip — you choose the end, or none.`}
          </span>
        </div>
        {plan.zips.length === 0 && (
          <span className='text-center text-[11.5px] text-ink-2'>
            {t`No zip at all is fine: everything can still go as it is.`}
          </span>
        )}
      </div>
    </div>
  )

  const itemRow = (item: SendItem) => {
    const n = placesOf(item.key).length
    const on = ticked.includes(item.key)
    return (
      <div
        key={item.key}
        draggable
        onDragStart={(e) => carry(e, dragged(item.key))}
        aria-label={item.name}
        className={`flex cursor-grab items-center gap-2 rounded-lg border border-line px-2.5 py-2 ${on ? 'bg-accent-soft' : 'bg-pane'}`}>
        <input
          type='checkbox'
          aria-label={t`Pick ${item.name}`}
          checked={on}
          onChange={(e) => tick(item.key, e.target.checked)}
        />
        <span className='text-ink-3'>⠿</span>
        <span className='w-4 text-accent'>{item.zip ? '🗜' : ICON[item.holds[0]!]}</span>
        <span className='flex min-w-0 flex-1 flex-col'>
          <span
            className={`font-semibold break-all ${item.zip ? 'font-mono text-[12.5px]' : 'text-[13px]'}`}>
            {item.zip ? item.name.slice(stem.length + 1) : partName(item.holds[0]!)}
          </span>
          {(item.zip || item.holds[0] === 'film' || item.holds[0] === 'project') && (
            <code className='font-mono text-[10.5px] break-all text-ink-2'>{item.name}</code>
          )}
          <span className='text-[10.5px] text-ink-2'>
            {item.zip
              ? `${item.holds.map((part) => (part === 'videos' || part === 'photos' ? `${part}/` : partName(part).toLowerCase())).join(', ')} · ${formatFilmSize(item.size)}`
              : item.holds[0] === 'videos' || item.holds[0] === 'photos'
                ? t`as a ${item.name} folder · ${aboutPart(item.holds[0], parts, stem)}`
                : item.size > 0 && formatFilmSize(item.size)}
          </span>
        </span>
        {n > 0 ? (
          <span className='rounded-full bg-pick-soft px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-pick'>
            {plural(n, { one: '→ # place', other: '→ # places' })}
          </span>
        ) : (
          <span className='text-[10.5px] whitespace-nowrap text-ink-3'>
            {!item.zip && zippedAway(item.holds[0]!) ? t`in a zip` : t`stays here`}
          </span>
        )}
      </div>
    )
  }

  const stepTwo = (
    <div className='grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] gap-4 max-[800px]:grid-cols-1'>
      <div className='flex flex-col gap-2'>
        <b className='text-[13px]'>{t`What can be sent`}</b>
        <span className='text-[12px] text-ink-2'>
          {t`Tick several to drag them together. Each can go to several destinations.`}
        </span>
        {zipItems.length > 0 && (
          <span className='pt-1 text-[10.5px] font-semibold tracking-[.08em] text-ink-3 uppercase'>
            {t`Your zips`}
          </span>
        )}
        {zipItems.map(itemRow)}
        <span className='pt-1 text-[10.5px] font-semibold tracking-[.08em] text-ink-3 uppercase'>
          {t`As they are`}
        </span>
        {looseItems.map(itemRow)}
      </div>
      <div className='flex min-h-0 flex-col gap-2.5'>
        <label className='flex flex-wrap items-center gap-2.5 rounded-[9px] border border-line bg-ground px-3 py-2 text-[13px] font-semibold'>
          📁 {t`Project folder`}
          <input
            aria-label={t`Project folder`}
            value={folder}
            onChange={(e) => setFolder(slugOf(e.target.value, true))}
            onBlur={() => setFolder(slugOf(folder))}
            className={`${INPUT} w-48 py-1 font-mono text-[12.5px] font-normal`}
          />
          <span className='text-[11.5px] font-normal text-ink-2'>
            {t`lowercase letters, digits and - only`}
          </span>
        </label>
        <div className='flex flex-col gap-2.5'>
          {shown.map((p) => {
            const here = items.filter((item) => placesOf(item.key).includes(p.name))
            const root = inRoot.includes(p.name)
            const depth = root ? 1 : 2
            const remove = (item: SendItem) => ({
              label: t`Take ${item.name} out of ${p.name}`,
              onClick: () => takeOut(item.key, p.name)
            })
            return (
              <section
                key={p.name}
                aria-label={p.name}
                {...dropZone(
                  (what) => {
                    setOver(null)
                    place(
                      what.split('\n').filter((key) => items.some((item) => item.key === key)),
                      p.name
                    )
                  },
                  () => setOver(p.name),
                  () => leave(p.name)
                )}
                className={`flex flex-col gap-2 rounded-[10px] px-3 py-2.5 ${dropLook(over === p.name)}`}>
                <span className='flex flex-wrap items-center gap-2 text-[13.5px]'>
                  <span>⌂</span>
                  <b>{p.name}</b>
                  {here.some((item) => item.holds.includes('film')) && (
                    <span className='text-[11.5px] font-semibold text-accent'>
                      🔗 {t`share link`}
                    </span>
                  )}
                  <Spacer />
                  <button
                    type='button'
                    aria-label={t`Leave ${p.name} out of this upload`}
                    onClick={() => dropDestination(p.name)}
                    className='order-last border-0 bg-transparent px-1 text-[12px] text-ink-3 hover:text-ink'>
                    ✕
                  </button>
                  <Seg
                    label={t`Where in ${p.name}`}
                    value={root ? 'root' : 'folder'}
                    options={[
                      ['root', t`In the root`],
                      ['folder', t`In ${projectFolder || '…'}/`]
                    ]}
                    onPick={(where) => setRoot(p.name, where === 'root')}
                  />
                </span>
                <div className={TREE}>
                  {p.path ? (
                    <Row
                      depth={0}
                      mark='⌂'
                      name={`${p.path}/`}
                      quiet
                    />
                  ) : (
                    <span className='px-1.5'>
                      <Mini onClick={() => onPickFolder(p.name)}>
                        {t`choose its folder on the storage`}
                      </Mini>
                    </span>
                  )}
                  {!root && (
                    <Row
                      depth={1}
                      mark='📁'
                      name={`${projectFolder || '…'}/`}
                      strong
                    />
                  )}
                  {here.map((item) =>
                    item.zip ? (
                      /* a zip says what is inside it here too, set apart from what lands as it is */
                      <div
                        key={item.key}
                        aria-label={t`Inside ${item.name}`}
                        className='flex flex-col'>
                        <Row
                          depth={depth}
                          mark='🗜'
                          name={item.name}
                          note={formatFilmSize(item.size)}
                          strong
                          remove={remove(item)}
                        />
                        <div
                          className='my-0.5 mr-1 flex flex-col rounded-r-md border-l-2 border-dashed border-accent/40 bg-accent-soft py-0.5'
                          style={{ marginLeft: 14 + depth * 16 }}>
                          {item.holds.map((part) => (
                            <PartTree
                              key={part}
                              part={part}
                              parts={parts}
                              stem={stem}
                              depth={0}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <PartTree
                        key={item.key}
                        part={item.holds[0]!}
                        parts={parts}
                        stem={stem}
                        depth={depth}
                        remove={remove(item)}
                      />
                    )
                  )}
                  {here.length === 0 && (
                    <span className='py-1 text-center text-[12px] text-ink-3'>{t`drop here`}</span>
                  )}
                </div>
              </section>
            )
          })}
          {hidden.length > 0 && (
            <label className='flex items-center justify-center gap-2.5 rounded-[10px] border-2 border-dashed border-line px-3 py-3 text-[13px] font-semibold text-ink-2'>
              {t`+ Add a destination`}
              <select
                aria-label={t`Add a destination`}
                value=''
                onChange={(e) => e.target.value && setAdded([...added, e.target.value])}
                className='rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px] font-normal text-ink-2'>
                <option value=''>{t`Choose…`}</option>
                {hidden.map((p) => (
                  <option
                    key={p.name}
                    value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {shown.length === 0 && hidden.length === 0 && (
            <span className='text-[12px] text-ink-3'>{t`No destination yet.`}</span>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <Modal
      label={t`Upload`}
      title={who}
      full
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <span className='text-[12px] text-ink-2'>
              {endingTrouble ?? t`Remembered for the next montage: the zips and what goes in each.`}
            </span>
            <Spacer />
            <Mini onClick={onClose}>{t`Close`}</Mini>
            <Go
              disabled={endingTrouble !== null}
              onClick={() => setStep(2)}>
              {t`Next: where it goes →`}
            </Go>
          </>
        ) : (
          <>
            <Mini onClick={() => setStep(1)}>{t`← Back to the zips`}</Mini>
            <span className='text-[12px] text-ink-2'>
              {left.length > 0
                ? t`Stays on this machine: ${left.map((item) => (item.zip ? item.name : partName(item.holds[0]!))).join(', ')}`
                : t`${plural(sends, { one: '# item', other: '# items' })} to ${plural(used.length, { one: '# destination', other: '# destinations' })}`}
            </span>
            <Spacer />
            <Mini onClick={onClose}>{t`Close`}</Mini>
            <Go
              disabled={blocked !== null}
              title={blocked ?? t`Build each item once, then send it to every destination it is in`}
              onClick={() => onUpload(asked)}>
              {uploaded ? t`Upload again` : t`Upload`}
            </Go>
          </>
        )
      }>
      <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3.5'>
        <div className='flex flex-wrap items-center gap-3'>
          {steps}
          {uploaded && (
            <span className='ml-auto text-[12px] font-semibold text-up'>
              {t`✓ uploaded ${hhmm(uploaded.at)}`}
            </span>
          )}
        </div>
        {step === 1 ? stepOne : stepTwo}
      </div>
    </Modal>
  )
}

export { UploadDialog }
