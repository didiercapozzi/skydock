import { plural, t } from '@lingui/core/macro'
import {
  EDIT_LOCKED,
  freeablePlace,
  furthestBehind,
  goneFromStorage,
  hasCompletePassenger,
  idsOf,
  isFiled,
  isMontage,
  isVideoFile,
  jumpTrim,
  passengerName,
  passengerOf,
  startOfFiles,
  montageSteps,
  montageUploadKey
} from '@skydock/scripts'
import type { FrameCrop, MontageStep, Rotation, SendPlan } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useFetchers, useNavigate, useOutletContext, useParams } from 'react-router'
import { openFile } from '../helpers/previewWindow'
import type { BoardDialog } from '../components/dialog-host'
import { lockReason } from '../components/file-list'
import type { Passenger } from '../components/montage-card'
import type { Destination, ManifestFile, ManifestGroup } from '../components/types'
import { setOutputRoot, shortDate } from '../components/utils'
import { importFiles, whatIsComing } from '../helpers/import'
import type { Dropped } from '../helpers/import'
import { folderOnStorage } from '../helpers/jumps'
import {
  groupsIn,
  looseIn,
  placeFromParams,
  placeHref,
  placeKey,
  placeLabel,
  placeNameProblem,
  placeOfGroup,
  placeOfLoose
} from '../helpers/places'
import type { Place } from '../helpers/places'
import { routingEngine, useSafeSearchParams } from '../helpers/routing'
import { jumpLabels } from '../helpers/sections'
import { fileFacts } from '../helpers/status'
import { boardViewSchema } from '../helpers/view'
import { templatesAnswerSchema } from '../../../packages/skydock-scripts/src/templateEntry'
import { useBoardState } from './useBoardState'
import { useDragAndDrop } from './useDragAndDrop'
import type { Move } from './useDragAndDrop'
import { useFileView } from './useFileView'
import { useNas } from './useNas'
import { setSendPlan, useSendPlan } from './useSendPlan'

type Loaded = Parameters<typeof useBoardState>[0] & Parameters<typeof useNas>[0]

/* Everything the whole board shares — the rail, the folder open in the pane, the file open in it
   and the dialogs over them: what the board holds, what is known about each jump, and every change
   that can be asked for. It lives in the layout and reaches the folder and the file through the
   outlet, so each address draws only its own part and none of them works out the board again. */
const useBoardModel = (loaded: Loaded & { outputDir: string }) => {
  /* told rather than assumed: an installed app keeps the work wherever it was asked to */
  setOutputRoot(loaded.outputDir)
  const [dialog, setDialog] = useState<BoardDialog>(null)
  /* uploaded and freed: the one thing left is to tell whoever it is for, so that is offered */
  const [justFreed, setJustFreed] = useState<{ groupId: string } | null>(null)
  const board = useBoardState(loaded, (groupId) => {
    setDialog({ kind: 'email', groupId })
    setJustFreed({ groupId })
  })
  const { groups, updateGroups, loose, places, setPlaces, busy, setNote, setProblem, send } = board
  const nas = useNas(loaded, board.remoteAfterUpload)
  const sendPlan = useSendPlan()
  const view = useFileView()
  const place = placeFromParams(useParams())
  const goTo = useNavigate()
  const { searchParams: looking } = useSafeSearchParams(boardViewSchema)

  /* What is picked belongs to the folder on screen, and a change that takes the picks away — moved,
     binned, made a montage — says so by counting up; the folder lets go of its picks when it sees
     the count change. */
  const [picksGone, setPicksGone] = useState(0)
  const clearSelection = () => setPicksGone((n) => n + 1)

  /* A montage with an edit is frozen (RULES, The editing project), and a freed one lives on the
     storage only. The server refuses any change to either; the board simply never offers it. */
  const frozen = new Set(
    groups.filter((g) => g.freed || board.montageFacts[g.id]?.project).map((g) => g.id)
  )
  const frozenFiles = new Set(
    groups
      .filter((g) => frozen.has(g.id))
      .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
  )
  const facts = fileFacts({ outputs: board.outputs, remote: nas.remote, frozenFiles })
  const { statusContext } = facts

  /* every file and the jump it is in, looked up by a map made once per board rather than by
     walking the whole board for each file asked about — which, asked for each file on screen, was
     the whole board times itself */
  const jumpOf = new Map<string, ManifestGroup>()
  const byId = new Map<string, ManifestFile>()
  for (const g of groups)
    for (const f of g.files) {
      jumpOf.set(f.id ?? f.path, g)
      if (f.id) byId.set(f.id, f)
    }
  for (const f of loose) if (f.id && !byId.has(f.id)) byId.set(f.id, f)
  const groupOfFile = (file: ManifestFile) => jumpOf.get(file.id ?? file.path)
  const fileById = (id: string) => byId.get(id)
  /* filed nowhere — neither as a lone file nor through its jump — and so free to go to the bin */
  const inUnsorted = (file: ManifestFile) => {
    const group = groupOfFile(file)
    return !file.destination && !(group && isFiled(group))
  }
  /* a copy has nowhere to be sent back to — its original is wherever it already is — so it ends;
     anything else is asked about, loose in Fresh files or into the bin */
  const backLabel = (files: ManifestFile[]) =>
    files.every((f) => f.copyOf)
      ? files.length === 1
        ? t`Remove this copy (⌫)`
        : t`Remove these copies (⌫)`
      : t`Remove… (⌫)`

  /* A montage is uploaded while the storage still holds what was sent, and not a moment longer —
     the record says what went up, the listing says whether it is still there. */
  const goneById = Object.fromEntries(
    groups.map((g) => [g.id, goneFromStorage(g.uploaded, nas.remote)])
  )
  const asOnStorage = (group: ManifestGroup) =>
    group.uploaded && (goneById[group.id]?.length ?? 0) > 0
      ? { ...group, uploaded: undefined }
      : group
  /* whether the storage's list says this montage's link was sent */
  const emailedOn = (group: ManifestGroup) =>
    group.emailed ??
    board.storage?.montages.find((m) => m.folder === folderOnStorage(group))?.emailed ??
    null
  /* A montage is done once it is freed: all that is left of it is on the storage. It leaves the Montages
     and is listed under Montages done — emailed or not, since its email can still be sent from its page. */
  const finished = (group: ManifestGroup) => isMontage(group) && Boolean(group.freed)
  /* Where each montage has got to — one answer for its panel, its card and its entry in the menu,
     so the three can never disagree. */
  const progressOf = (group: ManifestGroup) =>
    isMontage(group)
      ? montageSteps({
          group: asOnStorage(group),
          facts: board.montageFacts[group.id],
          emailed: Boolean(emailedOn(group))
        })
      : null
  /* where each montage has got to, worked out once for the board rather than once per montage asked
     about — the rail asks for every one of them */
  const progressByName = new Map<string, NonNullable<ReturnType<typeof progressOf>>[]>()
  for (const g of groups) {
    if (!isMontage(g)) continue
    const shown = progressOf(g)
    if (!shown) continue
    const name = passengerOf(g)
    progressByName.set(name, [...(progressByName.get(name) ?? []), shown])
  }
  const passengerProgress = (name: string) => furthestBehind(progressByName.get(name) ?? [])
  /* A montage freed and walked to its last step has nothing left to do here, so it leaves the
     montages and lives on in the storage's own list. */
  const listed = groups.filter((g) => !finished(g))
  /* how many montages are in Montages done: one per name, however many jumps it had */
  const delivered = new Set(
    groups
      .filter((g) => finished(g) && !listed.some((l) => passengerOf(l) === passengerOf(g)))
      .map(passengerOf)
  ).size

  /* what each jump is called wherever it appears: its place among the jumps where it is filed, or
     its montage's name — the montages counted apart, belonging to no place */
  const whereFiled = (g: ManifestGroup) => (isMontage(g) ? '\0montage' : (g.destination ?? ''))
  const labels = new Map(
    [...new Set(groups.map(whereFiled))].flatMap((dest) => [
      ...jumpLabels(groups.filter((g) => whereFiled(g) === dest))
    ])
  )
  const labelOf = (group: ManifestGroup) =>
    `${labels.get(group.id) ?? group.label} · ${shortDate(startOfFiles(group.files))}`

  /* each montage once, however many jumps it has */
  const named = groups.filter((g) => isMontage(g) && hasCompletePassenger(g.passenger))
  const passengers = [
    ...new Map(
      named.flatMap((g): [string, Passenger][] =>
        g.passenger ? [[passengerOf(g), g.passenger]] : []
      )
    ).values()
  ]
  const hostOf = (who: string) => named.find((g) => passengerOf(g) === who)
  const folderFor = (destination: string) =>
    places.find((d) => d.name === destination)?.path ?? null

  /* Where the board goes by itself: a jump filed somewhere lands its folder open. The one filter
     that is the whole board's, not the folder's, goes with it (RULES, The board). */
  const pickPlace = (next: Place) => {
    clearSelection()
    goTo(placeHref(next, { kind: looking.kind }))
  }

  /* Anything on the board by a piece of its name — a montage, a destination, a file — and where it
     is, most useful first, a dozen at most (RULES, Finding anything). */
  const findAnything = (query: string) => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const has = (text: string) => text.toLowerCase().includes(q)
    const montages = passengers
      .map(passengerName)
      .filter(has)
      .map((who) => ({
        key: `pax:${who}`,
        label: who,
        where: t`Montage`,
        go: () => pickPlace({ kind: 'pax', name: who })
      }))
    const destinations = places
      .filter((d) => has(d.name))
      .map((d) => ({
        key: `dz:${d.name}`,
        label: d.name,
        where: t`Destination`,
        go: () => pickPlace({ kind: 'dz', name: d.name })
      }))
    const files = [
      ...groups.flatMap((g) => g.files.map((f) => ({ f, at: placeOfGroup(g) }))),
      ...loose.map((f) => ({ f, at: placeOfLoose(f) }))
    ]
      .filter(({ f }) => f.id && has(f.filename))
      .map(({ f, at }) => ({
        key: `file:${f.id}`,
        label: f.filename,
        where: placeLabel(at),
        go: () => {
          clearSelection()
          openFile(goTo, at, f.id ?? '', { kind: looking.kind })
        }
      }))
    return [...montages, ...destinations, ...files].slice(0, 12)
  }

  /* A lone file's crop goes through the same save as everything else, on the registry entry — and
     the board's own copy has to be updated with it, because `updateGroups` answers on its own
     fetcher: nothing here would otherwise hear about the saved loose files. */
  const cropLoneFile = (
    file: ManifestFile,
    range: { cropStart: number | null; cropEnd: number | null },
    frame?: FrameCrop | null,
    rotation?: Rotation
  ) => {
    const cropped = {
      ...file,
      cropStart: range.cropStart,
      cropEnd: range.cropEnd,
      ...(frame !== undefined ? { frame } : {}),
      ...(rotation !== undefined ? { rotation } : {})
    }
    board.setLoose((current) => current.map((f) => (f.path === file.path ? cropped : f)))
    updateGroups(groups, [cropped])
  }

  /* Every clip of a jump trimmed to the jump it holds, in one press — those whose exit was found;
     the rest are left as they are, and the note says how many were (RULES, Trimming to the jump). */
  const trimToJump = (group: ManifestGroup) => {
    if (frozen.has(group.id)) {
      setProblem(EDIT_LOCKED)
      return
    }
    const montage = isMontage(group)
    let trimmed = 0
    const files = group.files.map((f) => {
      if (!f.moments || !isVideoFile(f.path) || lockReason(f, statusContext(f))) return f
      trimmed++
      return { ...f, ...jumpTrim(f.moments, montage, f.cropEnd ?? null) }
    })
    if (trimmed === 0) {
      setProblem(t`No clip in this jump has an exit found — trim them by hand.`)
      return
    }
    updateGroups(groups.map((g) => (g.id === group.id ? { ...g, files } : g)))
    const left = group.files.filter((f) => isVideoFile(f.path)).length - trimmed
    setNote(
      left > 0
        ? t`${plural(trimmed, { one: '# clip', other: '# clips' })} trimmed to the jump — ${plural(left, { one: '# clip has', other: '# clips have' })} no exit found, and kept its trim.`
        : t`${plural(trimmed, { one: '# clip', other: '# clips' })} trimmed to the jump.`
    )
  }

  /* Fresh files put back, by as much as is chosen in the dialog, which says what each choice costs */
  const resetFresh = () => {
    const jumps = groups.filter((g) => !isFiled(g))
    const files = [...jumps.flatMap((g) => g.files), ...loose.filter((f) => !f.destination)]
    setDialog({
      kind: 'reset-fresh',
      files: files.length,
      decided: files.filter(
        (f) => f.cropStart != null || f.cropEnd != null || f.frame || f.rotation
      ).length
    })
  }
  /* The jump goes; its files stay, loose in Fresh files, crops and all. Only processed copies are
     lost — they no longer match where the files are — so that alone is asked about first. */
  const deleteJump = (group: ManifestGroup, asked = false) => {
    if (!asked && group.files.some((f) => f.processed)) {
      setDialog({ kind: 'delete-jump', groupId: group.id })
      return
    }
    clearSelection()
    send('delete-jump', { intent: 'delete-jump', groupId: group.id })
  }

  /* Files leave their jump and are re-filed server-side, so the answer is the truth. `newGroup`
     gathers them into a jump of their own; without it the files land as lone files. */
  const moveFiles = (ids: string[], where: Move) => {
    if (ids.length === 0) return
    clearSelection()
    /* Copied into another jump, the files stay where they are as well — so one that cannot move can
       still be copied: nothing about it changes. Only a freed one cannot, having no file here. */
    if (where.copy && where.targetGroupId) {
      const here = ids.filter((id) => !fileById(id)?.freed)
      if (here.length === 0) setProblem(t`Freed from this machine — there is no file here to copy.`)
      else if (frozen.has(where.targetGroupId)) setProblem(EDIT_LOCKED)
      else send('copy', { intent: 'copy-files', fileIds: here, targetGroupId: where.targetGroupId })
      return
    }
    /* a file that cannot move is carried only so that it can be copied */
    const locked = ids.filter((id) => {
      const file = fileById(id)
      return file && !frozenFiles.has(id) && lockReason(file, statusContext(file))
    })
    if (locked.length === ids.length) {
      setProblem(
        t`On the storage already, so it cannot move — hold alt while dropping to copy it instead.`
      )
      return
    }
    /* a montage with an edit neither gives files up nor takes them in */
    const free = ids.filter((id) => !frozenFiles.has(id) && !locked.includes(id))
    if (free.length === 0 || (where.targetGroupId && frozen.has(where.targetGroupId))) {
      setProblem(
        free.length === 0 && where.targetGroupId
          ? `${EDIT_LOCKED} ${t`Hold alt while dropping to copy it into the other jump instead.`}`
          : EDIT_LOCKED
      )
      return
    }
    send('move', {
      intent: 'move-files',
      fileIds: free,
      ...(where.targetGroupId ? { targetGroupId: where.targetGroupId } : {}),
      ...(where.destination ? { destination: where.destination } : {}),
      ...(where.newGroup ? { newGroup: true } : {}),
      ...(where.name ? { name: where.name } : {}),
      ...(where.startsAt !== undefined ? { anchorEpoch: where.startsAt } : {})
    })
    if (free.length < ids.length)
      setProblem(`${EDIT_LOCKED} ${t`Its files stayed where they were.`}`)
    if (!where.destination && !where.targetGroupId) leaveEmptied(free)
  }

  /* A montage whose every file has just gone — back to Fresh files, or into the bin — is no longer
     anywhere to be: the board goes to Fresh files (RULES, Filing). */
  /* A montage that has just been freed has left the Montages and is listed under Montages done: the board
     follows it there, as it does to Fresh files when a montage is emptied. Once for each freeing. */
  const followedFreed = useRef<unknown>(null)
  useEffect(() => {
    if (!justFreed || followedFreed.current === justFreed) return
    followedFreed.current = justFreed
    const freed = groups.find((g) => g.id === justFreed.groupId)
    if (!freed || place.kind !== 'pax' || place.name !== passengerOf(freed)) return
    const stillHere = groups.some(
      (g) => isMontage(g) && passengerOf(g) === place.name && !finished(g)
    )
    if (!stillHere) goTo(placeHref({ kind: 'delivered' }, { kind: looking.kind }))
  })

  const leaveEmptied = (gone: string[]) => {
    if (place.kind !== 'pax') return
    const theirs = groups.filter((g) => isMontage(g) && passengerOf(g) === place.name)
    const left = theirs.flatMap((g) => g.files).filter((f) => !gone.includes(f.id ?? ''))
    if (theirs.length > 0 && left.length === 0) pickPlace({ kind: 'sort' })
  }

  /* Removing files asks every time, wherever they are: loose in Fresh files, or into the bin (RULES,
     Putting files in the bin). Only copies have one way out: they are removed, their originals staying
     where they are. */
  const sendBack = (files: ManifestFile[]) => {
    if (files.length === 0) return
    if (files.every((f) => f.copyOf)) {
      moveFiles(idsOf(files), { destination: null })
      return
    }
    setDialog({ kind: 'remove-files', files })
  }
  const removeTo = (to: 'fresh' | 'bin', files: ManifestFile[]) => {
    const ids = idsOf(files)
    if (to === 'fresh') {
      moveFiles(ids, { destination: null })
      return
    }
    clearSelection()
    send('trash', { intent: 'trash-unsorted', fileIds: ids })
    leaveEmptied(ids)
  }

  const saveDestinations = (next: Destination[]) => {
    setPlaces(next)
    board.manifest({ intent: 'save-groups', groups, destinations: next })
  }
  const addPlace = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || places.some((d) => d.name === trimmed)) return
    const problem = placeNameProblem(trimmed)
    if (problem) {
      setProblem(problem)
      return
    }
    saveDestinations([...places, { name: trimmed }])
  }
  /* A place's folder is part of the workspace, saved with the destinations like any other edit. */
  const chooseFolder = (path: string, destination: string) => {
    const known = places.some((d) => d.name === destination)
    saveDestinations(
      known
        ? places.map((d) => (d.name === destination ? { ...d, path } : d))
        : [...places, { name: destination, path }]
    )
    setDialog(dialog?.kind === 'folder' && dialog.back ? dialog.back : null)
  }

  /* Filing jumps under a destination — or back among the fresh files. A montage filed somewhere is
     a montage no longer: it is that place's jump, with no name of its own. */
  const assign = (ids: string[], destination: string | null) => {
    const nextPlaces =
      destination && !places.some((d) => d.name === destination)
        ? [...places, { name: destination }]
        : undefined
    if (nextPlaces) setPlaces(nextPlaces)
    updateGroups(
      groups.map((g) =>
        ids.includes(g.id)
          ? {
              ...g,
              destination: destination ?? undefined,
              montageJump: undefined,
              passenger: undefined
            }
          : g
      ),
      undefined,
      nextPlaces
    )
  }
  /* Jumps made a montage, and for a montage naming, in one save — made and then named is two saves
     with a nameless montage in between, which is exactly the state the menu then has to call out as
     waiting. */
  const toMontage = (ids: string[], passenger?: Passenger) =>
    updateGroups(
      groups.map((g) =>
        ids.includes(g.id)
          ? {
              ...g,
              destination: undefined,
              montageJump: true,
              passenger: passenger ?? g.passenger ?? undefined
            }
          : g
      )
    )

  /* Files from the computer are copied one by one, the corner showing the list and counting it down;
     once all are in, it looks again and hears how the whole drop went. A folder is opened out
     first, so what is shown is what is coming and not what was let go of. */
  const importDropped = async (list: Dropped[], target: string, where: string) => {
    if (list.length === 0) return
    board.setBusy('import')
    setNote(t`Looking at what was dropped…`)
    const files = await whatIsComing(list)
    if (files.length === 0) {
      board.setBusy(null)
      setProblem(t`Nothing in that drop is a video or a photo SkyDock can show.`)
      return
    }
    setNote(null)
    const tally = await importFiles(files, target, where)
    board.manifest({ intent: 'imported', imported: tally })
  }

  /* Something filed under a destination is followed there: its page opens, showing it where it now
     is (RULES, Jumps). */
  const drag = useDragAndDrop({
    groups,
    loose,
    labels,
    frozen,
    moveFiles,
    assign,
    toMontage,
    importDropped,
    askRemove: (ids) => sendBack(ids.flatMap((id) => fileById(id) ?? [])),
    askMontageName: (what) => {
      if ('groupId' in what) {
        setDialog({ kind: 'name-montage', groupId: what.groupId })
        return
      }
      const files = what.fileIds.flatMap((id) => {
        const found = fileById(id)
        return found ? [found] : []
      })
      setDialog({
        kind: 'name-montage',
        fileIds: what.fileIds,
        keeps: files.every(inUnsorted) ? undefined : placeLabel(place)
      })
    },
    onFiled: (destination) => {
      if (place.kind !== 'dz' || place.name !== destination)
        pickPlace({ kind: 'dz', name: destination })
    }
  })

  /* The folder something was just filed under lights up for a moment, so the eye can follow the
     jump there from the line it left. */
  const [flashPlace, setFlashPlace] = useState<string | null>(null)
  const flash = (target: Place) => {
    const key = placeKey(target)
    setFlashPlace(key)
    setTimeout(() => setFlashPlace((current) => (current === key ? null : current)), 1800)
  }

  /* A montage just made is gone to: its page opens once it is on the board, and its entry in the
     menu lights up. It is known by its name, which is the server's to confirm — a montage the server
     refused never appears, and nothing is opened. */
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const montageExists = (who: string) => groups.some((g) => isMontage(g) && passengerOf(g) === who)
  const answered = goingTo !== null && busy === null
  const exists = answered && montageExists(goingTo)
  if (answered && (!exists || (place.kind === 'pax' && place.name === goingTo))) setGoingTo(null)
  /* a request still being answered is let finish first: the router takes up the answer of a request
     that ends while a navigation is under way, and could leave the address changed but the page not */
  const answering = useFetchers().some((fetcher) => fetcher.state !== 'idle')
  const arrived = exists && !answering
  /* the page is an address, and the address is the browser's */
  useEffect(() => {
    if (arrived && goingTo) goTo(placeHref({ kind: 'pax', name: goingTo }))
  }, [arrived, goingTo, goTo])

  /* Opening a place looks at the storage again (RULES, Noticing deletions); the board's own look
     already covers the place it opened on. */
  const openedKey = placeKey(place)
  const lookedFor = useRef(openedKey)
  useEffect(() => {
    if (lookedFor.current === openedKey) return
    lookedFor.current = openedKey
    if (nas.connected) nas.checkRemote()
  })

  /* a montage with an edit takes nothing in: its project names its clips, and new ones are not */
  const editedMontage = (who: string) => {
    if (!groups.some((g) => frozen.has(g.id) && passengerOf(g) === who)) return false
    setProblem(t`${who}’s montage has an edit — change it in kdenlive.`)
    return true
  }
  const madeNote = (who: string, joining: boolean, copied: boolean) => {
    const made = joining ? t`Joined ${who}’s montage` : t`Made ${who}’s montage`
    setNote(copied ? `${made} — ${t`copied, the destination keeps its own`}` : made)
    flash({ kind: 'pax', name: who })
    setGoingTo(who)
  }
  /* A jump in Fresh files named: it is the montage, in one step. */
  const nameMontage = (groupId: string, passenger: Passenger) => {
    const who = passengerName(passenger)
    if (editedMontage(who)) return
    const joining = groups.some((g) => g.id !== groupId && isMontage(g) && passengerOf(g) === who)
    toMontage([groupId], passenger)
    madeNote(who, joining, false)
  }
  /* Picked files, one file, or a jump a place holds, made a montage. Whether they move or are copied
     is the server's rule, not a key held: out of Fresh files they move, from anywhere else they are
     copied and the place keeps its own (RULES, Making a montage). */
  const montageOf = (files: ManifestFile[], passenger: Passenger, startsAt?: number) => {
    const who = passengerName(passenger)
    if (editedMontage(who)) return
    const fileIds = files.flatMap((f) => (f.id ? [f.id] : []))
    if (fileIds.length === 0) return
    const joining = montageExists(who)
    clearSelection()
    send('make-montage', {
      intent: 'make-montage',
      fileIds,
      name: who,
      ...(startsAt !== undefined ? { anchorEpoch: startsAt } : {})
    })
    madeNote(who, joining, !files.every(inUnsorted))
  }
  /* What was dropped on the Montages heading, named: a jump is made the montage, files are made one
     the way picked files are. */
  const nameDropped = (what: { groupId?: string; fileIds?: string[] }, passenger: Passenger) => {
    if (what.groupId) {
      nameMontage(what.groupId, passenger)
      return
    }
    const files = (what.fileIds ?? []).flatMap((id) => {
      const found = fileById(id)
      return found ? [found] : []
    })
    montageOf(files, passenger)
  }
  /* what making a montage of something takes, from the folder it is in: copied, when a place keeps it */
  const montageOffer = (files: ManifestFile[], from: Place) => ({
    passengers,
    keeps: files.every(inUnsorted) ? undefined : placeLabel(from),
    onMake: (passenger: Passenger) => montageOf(files, passenger)
  })

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    if (frozen.has(groupId)) return
    updateGroups(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
          : g
      )
    )
  }
  /* only what the jump is called on the board — no file is named after it, so nothing processed
     goes stale */
  const renameJump = (groupId: string, name: string) => {
    if (frozen.has(groupId)) return
    updateGroups(
      groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() || undefined } : g))
    )
  }
  const shiftJump = (groupId: string, anchorEpoch: number) =>
    send('shift', { intent: 'shift-group-time', groupId, anchorEpoch })

  const openConnect = () => {
    nas.markDialogOpened()
    setDialog({ kind: 'connect' })
  }
  /* the client opens whichever dialog is missing rather than firing a request the server would only
     refuse — but the server still decides, so the client never guesses a path */
  /* the jumps an upload is of, named as the board names them */
  const labelsOf = (ids: string[]) =>
    groups
      .filter((g) => ids.includes(g.id))
      .map(labelOf)
      .join(', ')
  const requestUpload = (scope: { groupIds?: string[]; destination?: string }, key: string) => {
    /* one upload at a time: nothing is offered on top of one going */
    if (board.uploading) return
    if (!nas.connected) {
      openConnect()
      return
    }
    if (scope.destination && !folderFor(scope.destination)) {
      setDialog({ kind: 'folder', destination: scope.destination })
      return
    }
    board.sendUpload(
      { key, label: scope.destination ?? labelsOf(scope.groupIds ?? []) },
      { intent: 'upload-group', ...scope }
    )
  }
  /* Upload opens what it is about to do, and only the dialog's own button sends anything. */
  const askUpload = (group: ManifestGroup) => {
    if (board.uploading) return
    if (!nas.connected) {
      openConnect()
      return
    }
    setDialog({ kind: 'upload', groupId: group.id })
  }
  const confirmUpload = (group: ManifestGroup, plan: SendPlan) => {
    setDialog(null)
    board.sendUpload(
      { key: montageUploadKey(group.id), label: passengerName(group.passenger) },
      { intent: 'upload-montage', groupId: group.id, plan }
    )
  }
  /* A template is somebody's branding, so which one is never decided here. With the usual one marked,
     or a single template, and that one whole, there is nothing to decide and the project is made at
     once; with several, or one with a hole, the person is shown them first. */
  const makeMontage = (groupId: string, template?: string) =>
    send(groupId, { intent: 'montage', groupId, ...(template ? { template } : {}) })
  const askMontage = async (group: ManifestGroup) => {
    const parsed = templatesAnswerSchema.safeParse(
      await routingEngine.loader({ url: '/api/templates' }).catch(() => null)
    )
    const templates = parsed.success ? parsed.data.templates : []
    const only =
      templates.find((template) => template.byDefault) ??
      (templates.length === 1 ? templates[0] : null)
    if (only && only.missing.length === 0) makeMontage(group.id, only.name)
    else setDialog({ kind: 'templates', groupId: group.id })
  }
  /* A montage's next step, taken from where its trail says what it is — the same thing each step's
     own button does, whichever of them is on screen. */
  const takeStep = (group: ManifestGroup, step: MontageStep) => {
    if (step === 'Processed') send(group.id, { intent: 'process', groupId: group.id })
    if (step === 'Edited') void askMontage(group)
    if (step === 'Rendered') send(`open:${group.id}`, { intent: 'open-montage', groupId: group.id })
    if (step === 'Uploaded') {
      const gate = facts.gateFor(group.files)
      if (gate.blocked) board.setProblem(gate.message ?? t`It cannot be uploaded yet.`)
      else askUpload(group)
    }
    if (step === 'Emailed') setDialog({ kind: 'email', groupId: group.id })
  }
  /* what is being processed is stopped; the answer comes once it has */
  const cancelProcess = () => send('cancel-process', { intent: 'cancel-process' })
  /* what of a dropzone is on the storage and could be deleted from here, by the board's own reading
     of every file — the server proves it again, against the storage, before deleting anything */
  const freeableOf = (name: string) =>
    freeablePlace(
      groupsIn({ kind: 'dz', name }, groups),
      looseIn({ kind: 'dz', name }, loose),
      (f) => facts.statusOf(f) === 'uploaded'
    )

  return {
    board,
    nas,
    view,
    sendPlan,
    setSendPlan,
    dialog,
    setDialog,
    picksGone,
    clearSelection,
    frozen,
    ...facts,
    groupOfFile,
    fileById,
    inUnsorted,
    backLabel,
    goneById,
    asOnStorage,
    emailedOn,
    finished,
    progressOf,
    passengerProgress,
    listed,
    delivered,
    labels,
    labelOf,
    passengers,
    hostOf,
    findAnything,
    folderFor,
    pickPlace,
    cropLoneFile,
    resetFresh,
    deleteJump,
    moveFiles,
    sendBack,
    removeTo,
    addPlace,
    chooseFolder,
    importDropped,
    drag,
    flashPlace,
    nameMontage,
    montageOf,
    nameDropped,
    montageOffer,
    setPassenger,
    renameJump,
    shiftJump,
    openConnect,
    requestUpload,
    askUpload,
    confirmUpload,
    makeMontage,
    askMontage,
    takeStep,
    trimToJump,
    cancelProcess,
    freeableOf
  }
}

type BoardModel = ReturnType<typeof useBoardModel>

/* the board as the folder and the file open in it see it: handed down by the layout */
const useBoard = () => useOutletContext<BoardModel>()

export { useBoard, useBoardModel }
export type { BoardModel }
