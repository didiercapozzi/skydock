import { itemsFrom, PARTS, projectFolderOf, slugOf, stemOf, zipNameOf } from '@skydock/scripts'
import type { PartFile, SendItem, SendPart, SendPlan, MontageFact } from '@skydock/scripts'
import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { Go, Mini, Seg } from './buttons'
import { Icon } from './icons'
import type { IconName } from './icons'
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

/* the small grey line that says how something works, under or beside what it is about */
const NOTE = 'text-micro leading-normal text-ink-3'

/* a button with no box of its own, for what sits at the end of a line: take out, remove, leave out */
const QUIET =
  'inline-flex flex-none items-center gap-1 rounded-control font-semibold whitespace-nowrap text-ink-2 hover:bg-well hover:text-ink'

/* Each step keeps what is dragged from held at its top and lets what it is dropped on scroll beneath,
   so the thing being carried is never scrolled away from the place it is going. */
const HELD = 'flex flex-none flex-col gap-3.5 px-6.5 pt-5.5 pb-3.5'
const SCROLL = 'flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-6.5 pt-px pb-5.5'

/* what a step says about itself, at the size of the words around it */
const HELP = 'font-medium text-ink-3'

/* a typed value in a dialog: a well with the text in the face file names are read in */
const VALUE =
  'h-9 rounded-control border-0 bg-well px-3 font-mono text-body tracking-title text-ink'

type Remove = { label: string; onClick: () => void }

/* taking one thing out of a zip or a destination, a small cross the same everywhere; the label says
   exactly what comes out of where */
const TakeOut = ({ remove }: { remove: Remove }) => (
  <button
    type='button'
    aria-label={remove.label}
    title={remove.label}
    onClick={remove.onClick}
    className={`${QUIET} size-chip justify-center text-ink-3`}>
    <Icon
      name='close'
      size={12}
    />
  </button>
)

/* A step's heading: its number, quiet, and what it does. */
const Heading = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <span className='flex items-center gap-2.5'>
    <span className='grid size-6.5 flex-none place-items-center self-center rounded-control bg-accent text-small font-bold text-on-accent'>
      {n}
    </span>
    <h3 className='font-display m-0 text-subhead font-bold tracking-display'>{children}</h3>
  </span>
)

/* A part as it sits in a zip: a folder and how many it holds, or one file. The folder's files by name
   are in its title, for whoever wants to check what is in it. */
const PartLine = ({
  part,
  parts,
  stem,
  remove
}: {
  part: SendPart
  parts: Parts
  stem: string
  remove?: Remove
}) => {
  const files = parts[part]
  const folder = part === 'videos' || part === 'photos'
  return (
    <span
      title={
        folder
          ? `${files
              .slice(0, SHOWN)
              .map((f) => f.name)
              .join(', ')}${files.length > SHOWN ? ` ${t`+ ${files.length - SHOWN} more`}` : ''}`
          : undefined
      }
      className='flex h-control-sm items-center gap-2.5 font-medium'>
      <span className='flex min-w-0 flex-1 items-center gap-2.5'>
        <Icon
          name={PART_ICONS[part]}
          size={15}
        />
        <code className='font-mono text-small font-medium tracking-title break-all text-ink'>
          {folder ? `${part}/` : `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}`}
        </code>
        {folder && (
          <span>
            {part === 'videos'
              ? plural(files.length, { one: '# clip', other: '# clips' })
              : plural(files.length, { one: '# photo', other: '# photos' })}
          </span>
        )}
      </span>
      {remove && <TakeOut remove={remove} />}
    </span>
  )
}

/* a part sent as it is, named as it lands: a folder, or the file by its name */
const partLabel = (part: SendPart, stem: string) =>
  part === 'videos' || part === 'photos'
    ? `${part}/`
    : `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}`

/* what each part looks like, drawn the same wherever it is: a clip, a still, the film, the edit */
const PART_ICONS: Record<SendPart, IconName> = {
  videos: 'play',
  photos: 'photo',
  film: 'montage',
  project: 'project'
}

const iconOfItem = (item: SendItem): IconName => (item.zip ? 'zip' : PART_ICONS[item.holds[0]!])

/* a drop target's look, quiet until something is held over it */
const dropLook = (over: boolean, quiet: string) =>
  over ? 'border border-dashed border-accent bg-accent-soft' : quiet

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
  const [over, setOver] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  /* the project folder belongs to this montage, so it starts from its name each time */
  const [folder, setFolder] = useState(() => projectFolderOf(group, { zips: [], placed: {} }))
  const parts = partsOf(group, facts)
  const stem = stemOf(group)
  const present = PARTS.filter((part) => parts[part].length > 0)
  const items = itemsFrom(parts, stem, plan.zips)
  const zipItems = items.filter((item) => item.zip)
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
  const putInZip = (added: SendPart[], at: number | null) => {
    const first = added[0]
    if (!first) return
    if (at === null) setZips([...plan.zips, { ending: endingFor(first, endings), parts: added }])
    else
      setZips(
        plan.zips.map((zip, i) =>
          i === at ? { ...zip, parts: [...new Set([...zip.parts, ...added])] } : zip
        )
      )
  }
  /* the parts among what was dragged */
  const partsIn = (what: string) => PARTS.filter((part) => what.split('\n').includes(part))
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

  /* what the footer sums up: every zip built once, every item counted once per destination it goes to */
  const toMake = zipItems.filter((item) => placesOf(item.key).length > 0).length
  /* what is put nowhere stays on this machine (RULES, Uploading a montage) */
  const staying = items.filter((item) => placesOf(item.key).length === 0).length
  const toSend = items.reduce((sum, item) => sum + item.size * placesOf(item.key).length, 0)
  const sharing = (name: string) =>
    items.some((item) => item.holds.includes('film') && placesOf(item.key).includes(name))
  const links = used.filter(sharing).length

  const stepOne = (
    <>
      <div className={HELD}>
        <Heading n='1'>{t`Make the zips`}</Heading>
        <span
          className={`-mt-1.5 ${HELP}`}
          title={t`The same one can go into several zips.`}>
          {t`Drag onto a zip, or press one to make a new zip.`}
        </span>
        <div className='flex flex-wrap gap-2'>
          {present.map((part) => (
            <div
              key={part}
              draggable
              onDragStart={(e) => carry(e, part)}
              role='button'
              tabIndex={0}
              onClick={() => putInZip([part], null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  putInZip([part], null)
                }
              }}
              aria-label={partName(part)}
              title={`${aboutPart(part, parts, stem)} — ${t`press to put it in a new zip`}`}
              className={`flex h-9 cursor-grab items-center gap-2 rounded-control px-3.5 font-bold ${
                zipsIn(part) > 0 ? 'bg-up-soft text-up' : 'bg-well text-ink hover:bg-line'
              }`}>
              <Icon name={PART_ICONS[part]} />
              {partName(part)}
              {zipsIn(part) === 1 && (
                <Icon
                  name='check'
                  size={14}
                />
              )}
              {zipsIn(part) > 1 && (
                <span className='text-small font-semibold'>
                  {plural(zipsIn(part), { one: 'in # zip', other: 'in # zips' })}
                </span>
              )}
            </div>
          ))}
        </div>
        {waitingForFilm && (
          <span className='text-body text-local'>
            {t`No montage rendered yet — render it in kdenlive first.`}
          </span>
        )}
      </div>
      <div className={SCROLL}>
        <div
          aria-label={t`Zips`}
          className='flex flex-col gap-3.5'>
          {plan.zips.map((zip, at) => {
            const name = zipNameOf(stem, zip.ending)
            const inside = present.filter((part) => zip.parts.includes(part))
            const size = inside.reduce((sum, part) => sum + sizeOfPart(parts[part]), 0)
            /* the ending is what tells one zip from another, so it is the part of the name picked out */
            const ending = name.slice(stem.length + 1, -'.zip'.length)
            return (
              <section
                key={at}
                aria-label={name}
                {...dropZone(
                  (what) => {
                    setOver(null)
                    putInZip(partsIn(what), at)
                  },
                  () => setOver(`zip:${at}`),
                  () => leave(`zip:${at}`)
                )}
                className={`flex flex-none flex-col gap-2.5 rounded-card px-4 py-3.5 ${dropLook(over === `zip:${at}`, 'bg-pane shadow-hairline')}`}>
                <span
                  draggable
                  onDragStart={(e) => carry(e, `zip:${zip.ending}`)}
                  aria-label={t`Send ${name}`}
                  className='flex cursor-grab items-center gap-2.5'>
                  <Icon
                    name='zip'
                    size={20}
                    className='text-accent'
                  />
                  <code className='min-w-0 flex-1 font-mono text-body tracking-title break-all'>
                    {ending ? (
                      <>
                        {stem}.<b className='font-medium text-accent'>{ending}</b>.zip
                      </>
                    ) : (
                      name
                    )}
                  </code>
                  {size > 0 && (
                    <span className='font-semibold text-ink-3'>{formatFilmSize(size)}</span>
                  )}
                  <button
                    type='button'
                    aria-label={t`Remove ${name}`}
                    title={t`Remove ${name}`}
                    onClick={() => setZips(plan.zips.filter((_, i) => i !== at))}
                    className={`${QUIET} size-7 justify-center text-ink-3`}>
                    <Icon
                      name='close'
                      size={14}
                    />
                  </button>
                </span>
                <label className='flex items-center gap-2.5 font-semibold text-ink-3'>
                  {t`Ends with`}
                  <input
                    aria-label={t`Name ends with`}
                    title={t`Name ends with`}
                    value={zip.ending}
                    onChange={(e) => renameZip(at, e.target.value)}
                    onBlur={tidyEndings}
                    className={`${INPUT} ${VALUE} w-30`}
                  />
                </label>
                <div className='flex flex-col rounded-control border-2 border-dashed border-ink-3 bg-well px-3 py-1.5 text-ink-2'>
                  {inside.map((part) => (
                    <PartLine
                      key={part}
                      part={part}
                      parts={parts}
                      stem={stem}
                      remove={{
                        label: t`Take ${partName(part)} out of ${name}`,
                        onClick: () => takeFromZip(part, at)
                      }}
                    />
                  ))}
                  {inside.length === 0 && (
                    <span className={NOTE}>{t`nothing this montage has`}</span>
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
              putInZip(partsIn(what), null)
            },
            () => setOver('new'),
            () => leave('new')
          )}
          title={t`Named ${stem}.….zip — you choose the end, or none.`}
          className={`flex flex-none flex-col items-center gap-1.5 rounded-card px-4 text-center font-semibold text-ink-3 ${
            plan.zips.length === 0 ? 'py-12' : 'py-4'
          } ${over === 'new' ? 'border-2 border-dashed border-accent bg-accent-soft' : 'border-2 border-dashed border-ink-3'}`}>
          <Icon
            name='zip'
            size={22}
          />
          <span>
            {plan.zips.length === 0
              ? t`Drop here: it makes a zip`
              : t`Drop here to make another zip`}
          </span>
        </div>
        {plan.zips.some((zip) => zip.parts.includes('project')) && (
          <span className={HELP}>
            {t`The project reopens only with its clips back where they sat.`}
          </span>
        )}
        {endingTrouble && <span className='text-body text-local'>{endingTrouble}</span>}
      </div>
    </>
  )

  const stepTwo = (
    <>
      <div className={HELD}>
        <span className='flex flex-wrap items-center gap-3'>
          <Heading n='2'>{t`Where it goes`}</Heading>
          <Spacer />
          <label className='flex items-center gap-2.5 font-semibold text-ink-3'>
            {t`Project folder`}
            <input
              aria-label={t`Project folder`}
              title={t`lowercase letters, digits and - only`}
              value={folder}
              onChange={(e) => setFolder(slugOf(e.target.value, true))}
              onBlur={() => setFolder(slugOf(folder))}
              className={`${VALUE} w-42.5`}
            />
          </label>
        </span>
      </div>
      <div className={SCROLL}>
        {shown.length === 0 && (
          <div className='flex flex-none flex-col items-center gap-1 rounded-card border-2 border-dashed border-ink-3 px-4 py-10 text-center text-body text-ink-3'>
            <Icon
              name='place'
              size={22}
            />
            {t`Add a destination, then drag what should go there onto it.`}
          </div>
        )}
        {shown.map((p) => {
          const here = items.filter((item) => placesOf(item.key).includes(p.name))
          const root = inRoot.includes(p.name)
          const share = here.some((item) => item.holds.includes('film'))
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
              className={`flex flex-none flex-col overflow-hidden rounded-card ${dropLook(over === p.name, 'shadow-hairline')}`}>
              <span className='flex flex-wrap items-center gap-2.5 bg-well px-3.5 py-2.75'>
                <Icon
                  name='place'
                  size={18}
                  className={share ? 'text-accent' : 'text-ink-3'}
                />
                <b className='font-bold'>{p.name}</b>
                {share && (
                  <span className='inline-flex items-center gap-1 text-small font-bold text-accent'>
                    <Icon
                      name='link'
                      size={13}
                    />
                    {t`share link`}
                  </span>
                )}
                <Spacer />
                <Seg
                  label={t`Where in ${p.name}`}
                  value={root ? 'root' : 'folder'}
                  options={[
                    ['root', t`Straight in`],
                    ['folder', t`In the project folder`]
                  ]}
                  onPick={(where) => setRoot(p.name, where === 'root')}
                />
                <button
                  type='button'
                  aria-label={t`Leave ${p.name} out of this upload`}
                  title={t`Leave ${p.name} out of this upload`}
                  onClick={() => dropDestination(p.name)}
                  className={`${QUIET} size-7 justify-center text-ink-3`}>
                  <Icon
                    name='close'
                    size={14}
                  />
                </button>
              </span>
              <div className='flex flex-col gap-1.5 px-4 py-3'>
                {!p.path && (
                  <span>
                    <Mini onClick={() => onPickFolder(p.name)}>
                      {t`choose its folder on the storage`}
                    </Mini>
                  </span>
                )}
                {(p.path || !root) && (
                  <code className='font-mono text-small tracking-title text-ink-2'>
                    {p.path && `${p.path}/`}
                    {!root && <b className='font-bold text-ink'>{`${projectFolder || '…'}/`}</b>}
                  </code>
                )}
                {here.map((item) => (
                  <div
                    key={item.key}
                    aria-label={item.zip ? t`Inside ${item.name}` : undefined}
                    className='flex flex-col gap-1.5'>
                    <span
                      className={`flex items-center gap-2.5 rounded-control px-2.5 py-1.5 ${item.holds[0] === 'film' ? 'bg-accent-soft' : ''}`}>
                      <Icon
                        name={iconOfItem(item)}
                        size={16}
                        className={
                          item.zip || item.holds[0] === 'film' ? 'text-accent' : 'text-ink-3'
                        }
                      />
                      <code className='min-w-0 flex-1 font-mono text-body tracking-title break-all text-ink'>
                        {item.zip ? item.name : partLabel(item.holds[0]!, stem)}
                      </code>
                      {item.holds[0] === 'film' && !item.zip && (
                        <span
                          title={t`share link`}
                          className='text-accent'>
                          <Icon
                            name='link'
                            size={14}
                          />
                        </span>
                      )}
                      <TakeOut remove={remove(item)} />
                    </span>
                    {/* what a zip holds is set apart from what lands as it is: a box of its own, dashed
                        and on a different ground, under the zip */}
                    {item.zip && (
                      <div className='ml-6.5 flex flex-col rounded-control border-2 border-dashed border-ink-3 bg-well px-3 py-1.5 text-ink-2'>
                        {item.holds.map((part) => (
                          <PartLine
                            key={part}
                            part={part}
                            parts={parts}
                            stem={stem}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {here.length === 0 && (
                  <span className={`${NOTE} py-1 text-center`}>{t`drop here`}</span>
                )}
              </div>
            </section>
          )
        })}
        <span className='flex flex-wrap items-center gap-1'>
          {hidden.length > 0 && (
            <span className={`${QUIET} relative h-7 text-lead font-bold`}>
              <Icon
                name='plus'
                className='pointer-events-none absolute left-2.25'
              />
              {/* the choice itself is the button, so picking a destination is one gesture */}
              <select
                aria-label={t`Add a destination`}
                value=''
                onChange={(e) => e.target.value && setAdded([...added, e.target.value])}
                className='h-7 cursor-pointer appearance-none rounded-control bg-transparent [&>option]:bg-pane pr-2.25 pl-7.25 font-bold text-ink-2'>
                <option value=''>{t`Add a destination`}</option>
                {hidden.map((p) => (
                  <option
                    key={p.name}
                    value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </span>
          )}
          {shown.length === 0 && hidden.length === 0 && (
            <span className={NOTE}>{t`No destination yet.`}</span>
          )}
        </span>
      </div>
    </>
  )

  return (
    <Modal
      label={t`Upload`}
      title={t`Upload ${who}`}
      sub={t`nothing is sent until Upload is pressed`}
      aside={
        uploaded && (
          <span className='text-small font-semibold text-up'>
            {t`✓ uploaded ${hhmm(uploaded.at)}`}
          </span>
        )
      }
      full={1240}
      onClose={onClose}
      footer={
        <>
          <span className='font-semibold text-ink-2'>
            {[
              plural(used.length, { one: '# destination', other: '# destinations' }),
              ...(toMake > 0
                ? [plural(toMake, { one: '# zip to make', other: '# zips to make' })]
                : []),
              ...(staying > 0
                ? [
                    plural(staying, {
                      one: '# item stays on this machine',
                      other: '# items stay on this machine'
                    })
                  ]
                : [])
            ].join(' · ')}
            {toSend > 0 && (
              <>
                {' · '}
                <b className='font-bold text-ink'>{formatFilmSize(toSend)}</b> {t`to send`}
              </>
            )}
            {links > 0 && ` · ${plural(links, { one: 'one share link', other: '# share links' })}`}
          </span>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Go
            disabled={blocked !== null || endingTrouble !== null}
            title={
              endingTrouble ??
              blocked ??
              t`Build each item once, then send it to every destination it is in`
            }
            onClick={() => onUpload(asked)}>
            <Icon
              name='upload'
              size={14}
            />
            {uploaded ? t`Upload again` : t`Upload`}
          </Go>
        </>
      }>
      <div className='grid min-h-0 flex-1 grid-cols-[520px_minmax(0,1fr)] max-roomy:grid-cols-1 max-roomy:overflow-auto'>
        <div className='flex min-h-0 flex-col shadow-divider max-roomy:shadow-none'>{stepOne}</div>
        <div className='flex min-h-0 flex-col'>{stepTwo}</div>
      </div>
    </Modal>
  )
}

export { UploadDialog }
