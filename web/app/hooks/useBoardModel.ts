import { plural, t } from '@lingui/core/macro'
import {
  FREED_LOCKED,
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
  montageLockOf,
  montageSteps,
  montageUploadKey
} from '@skydock/scripts/client'
import type { BusyScope, FrameCrop, MontageStep, Rotation, SendPlan } from '@skydock/scripts'
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
  editHref,
  placeKey,
  placeLabel,
  placeNameProblem,
  placeOfGroup,
  placeOfLoose
} from '../helpers/places'
import type { Place } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { jumpLabels } from '../helpers/sections'
import { fileFacts } from '../helpers/status'
import { boardViewSchema } from '../helpers/view'
import { useBoardState } from './useBoardState'
import { useDragAndDrop } from './useDragAndDrop'
import type { Move } from './useDragAndDrop'
import { useFileView } from './useFileView'
import { useNas } from './useNas'
import { setSendPlan, useSendPlan } from './useSendPlan'

type Loaded = Parameters<typeof useBoardState>[0] & Parameters<typeof useNas>[0]

const useBoardModel = (loaded: Loaded & { outputDir: string }) => {
  setOutputRoot(loaded.outputDir)
  const [dialog, setDialog] = useState<BoardDialog>(null)
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

  const [picksGone, setPicksGone] = useState(0)
  const clearSelection = () => setPicksGone((n) => n + 1)

  const lockOf = (group: ManifestGroup) => montageLockOf(group, board.montageFacts[group.id])
  const frozen = new Set(groups.filter((g) => lockOf(g) === 'freed').map((g) => g.id))
  const edited = new Set(groups.filter((g) => lockOf(g) === 'edit').map((g) => g.id))
  const frozenFiles = new Set(
    groups
      .filter((g) => frozen.has(g.id))
      .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
  )
  const facts = fileFacts({ outputs: board.outputs, remote: nas.remote })
  const { statusContext } = facts

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
  const inUnsorted = (file: ManifestFile) => {
    const group = groupOfFile(file)
    return !file.destination && !(group && isFiled(group))
  }
  const backLabel = (files: ManifestFile[]) =>
    files.every((f) => f.copyOf)
      ? files.length === 1
        ? t`Remove this copy (⌫)`
        : t`Remove these copies (⌫)`
      : t`Remove… (⌫)`

  const goneById = Object.fromEntries(
    groups.map((g) => [g.id, goneFromStorage(g.uploaded, nas.remote)])
  )
  const asOnStorage = (group: ManifestGroup) =>
    group.uploaded && (goneById[group.id]?.length ?? 0) > 0
      ? { ...group, uploaded: undefined }
      : group
  const emailedOn = (group: ManifestGroup) =>
    group.emailed ??
    board.storage?.montages.find((m) => m.folder === folderOnStorage(group))?.emailed ??
    null
  const finished = (group: ManifestGroup) =>
    isMontage(group) && (Boolean(group.freed) || group.done !== undefined)
  const progressOf = (group: ManifestGroup) =>
    isMontage(group)
      ? montageSteps({
          group: asOnStorage(group),
          facts: board.montageFacts[group.id],
          emailed: Boolean(emailedOn(group))
        })
      : null
  const progressByName = new Map<string, NonNullable<ReturnType<typeof progressOf>>[]>()
  for (const g of groups) {
    if (!isMontage(g)) continue
    const shown = progressOf(g)
    if (!shown) continue
    const name = passengerOf(g)
    progressByName.set(name, [...(progressByName.get(name) ?? []), shown])
  }
  const passengerProgress = (name: string) => furthestBehind(progressByName.get(name) ?? [])
  const listed = groups.filter((g) => !finished(g))
  const delivered = new Set(
    groups
      .filter((g) => finished(g) && !listed.some((l) => passengerOf(l) === passengerOf(g)))
      .map(passengerOf)
  ).size

  const whereFiled = (g: ManifestGroup) => (isMontage(g) ? '\0montage' : (g.destination ?? ''))
  const labels = new Map(
    [...new Set(groups.map(whereFiled))].flatMap((dest) => [
      ...jumpLabels(groups.filter((g) => whereFiled(g) === dest))
    ])
  )
  const labelOf = (group: ManifestGroup) =>
    `${labels.get(group.id) ?? group.label} · ${shortDate(startOfFiles(group.files))}`

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

  const pickPlace = (next: Place) => {
    clearSelection()
    goTo(placeHref(next, { kind: looking.kind }))
  }

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

  const trimToJump = (group: ManifestGroup) => {
    if (frozen.has(group.id)) {
      setProblem(FREED_LOCKED)
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
  const deleteJump = (group: ManifestGroup, asked = false) => {
    if (!asked && group.files.some((f) => f.processed)) {
      setDialog({ kind: 'delete-jump', groupId: group.id })
      return
    }
    clearSelection()
    send('delete-jump', { intent: 'delete-jump', groupId: group.id })
  }

  const moveFiles = (ids: string[], where: Move) => {
    if (ids.length === 0) return
    clearSelection()
    if (where.copy && where.targetGroupId) {
      const here = ids.filter((id) => !fileById(id)?.freed)
      if (here.length === 0) setProblem(t`Freed from this machine — there is no file here to copy.`)
      else if (frozen.has(where.targetGroupId)) setProblem(FREED_LOCKED)
      else send('copy', { intent: 'copy-files', fileIds: here, targetGroupId: where.targetGroupId })
      return
    }
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
    const free = ids.filter((id) => !frozenFiles.has(id) && !locked.includes(id))
    if (free.length === 0 || (where.targetGroupId && frozen.has(where.targetGroupId))) {
      setProblem(
        free.length === 0 && where.targetGroupId
          ? `${FREED_LOCKED} ${t`Hold alt while dropping to copy it into the other jump instead.`}`
          : FREED_LOCKED
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
      setProblem(`${FREED_LOCKED} ${t`Its files stayed where they were.`}`)
    if (!where.destination && !where.targetGroupId) leaveEmptied(free)
  }

  const followedFreed = useRef<unknown>(null)
  useEffect(() => {
    if (!justFreed || followedFreed.current === justFreed) return
    followedFreed.current = justFreed
    const freed = groups.find((g) => g.id === justFreed.groupId)
    if (!freed || place.kind !== 'pax' || place.name !== passengerOf(freed)) return
    const stillHere = groups.some((g) => isMontage(g) && passengerOf(g) === place.name && !g.freed)
    if (!stillHere) goTo(placeHref({ kind: 'delivered' }, { kind: looking.kind }))
  })

  const leaveEmptied = (gone: string[]) => {
    if (place.kind !== 'pax') return
    const theirs = groups.filter((g) => isMontage(g) && passengerOf(g) === place.name)
    const left = theirs.flatMap((g) => g.files).filter((f) => !gone.includes(f.id ?? ''))
    if (theirs.length > 0 && left.length === 0) pickPlace({ kind: 'sort' })
  }

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
  const chooseFolder = (path: string, destination: string) => {
    const known = places.some((d) => d.name === destination)
    saveDestinations(
      known
        ? places.map((d) => (d.name === destination ? { ...d, path } : d))
        : [...places, { name: destination, path }]
    )
    setDialog(dialog?.kind === 'folder' && dialog.back ? dialog.back : null)
  }

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
    onFiled: (destination) => flash({ kind: 'dz', name: destination })
  })

  const [flashPlace, setFlashPlace] = useState<string | null>(null)
  const flash = (target: Place) => {
    const key = placeKey(target)
    setFlashPlace(key)
    setTimeout(() => setFlashPlace((current) => (current === key ? null : current)), 1800)
  }

  const [goingTo, setGoingTo] = useState<string | null>(null)
  const montageExists = (who: string) => groups.some((g) => isMontage(g) && passengerOf(g) === who)
  const answered = goingTo !== null && busy === null
  const exists = answered && montageExists(goingTo)
  if (answered && (!exists || (place.kind === 'pax' && place.name === goingTo))) setGoingTo(null)
  const answering = useFetchers().some((fetcher) => fetcher.state !== 'idle')
  const arrived = exists && !answering
  useEffect(() => {
    if (arrived && goingTo) goTo(placeHref({ kind: 'pax', name: goingTo }))
  }, [arrived, goingTo, goTo])

  const openedKey = placeKey(place)
  const lookedFor = useRef(openedKey)
  useEffect(() => {
    if (lookedFor.current === openedKey) return
    lookedFor.current = openedKey
    if (nas.connected) nas.checkRemote()
  })

  const editedMontage = (who: string) => {
    const held = groups.find((g) => frozen.has(g.id) && passengerOf(g) === who)
    if (!held) return false
    setProblem(
      t`${who}’s montage was freed from this machine — give this one another name, such as “${who} 2”.`
    )
    return true
  }
  const madeNote = (who: string, joining: boolean, copied: boolean, follow = true) => {
    const made = joining ? t`Joined ${who}’s montage` : t`Made ${who}’s montage`
    setNote(copied ? `${made} — ${t`copied, the destination keeps its own`}` : made)
    flash({ kind: 'pax', name: who })
    if (follow) setGoingTo(who)
  }
  const nameMontage = (groupId: string, passenger: Passenger, follow = true) => {
    const who = passengerName(passenger)
    if (editedMontage(who)) return
    const joining = groups.some((g) => g.id !== groupId && isMontage(g) && passengerOf(g) === who)
    toMontage([groupId], passenger)
    madeNote(who, joining, false, follow)
  }
  const montageOf = (
    files: ManifestFile[],
    passenger: Passenger,
    startsAt?: number,
    follow = true
  ) => {
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
    madeNote(who, joining, !files.every(inUnsorted), follow)
  }
  const nameDropped = (what: { groupId?: string; fileIds?: string[] }, passenger: Passenger) => {
    if (what.groupId) {
      nameMontage(what.groupId, passenger, false)
      return
    }
    const files = (what.fileIds ?? []).flatMap((id) => {
      const found = fileById(id)
      return found ? [found] : []
    })
    montageOf(files, passenger, undefined, false)
  }
  const montageOffer = (files: ManifestFile[], from: Place) => ({
    passengers,
    keeps: files.every(inUnsorted) ? undefined : placeLabel(from),
    onMake: (passenger: Passenger) => montageOf(files, passenger)
  })

  const setPassenger = (groupId: string, firstname: string, lastname: string) => {
    if (frozen.has(groupId)) {
      setProblem(FREED_LOCKED)
      return
    }
    updateGroups(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, passenger: firstname || lastname ? { firstname, lastname } : undefined }
          : g
      )
    )
  }
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
  const labelsOf = (ids: string[]) =>
    groups
      .filter((g) => ids.includes(g.id))
      .map(labelOf)
      .join(', ')
  const requestUpload = (scope: { groupIds?: string[]; destination?: string }, key: string) => {
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
  const askSend = (files: ManifestFile[]) => {
    if (board.uploading) return
    if (!nas.connected) {
      openConnect()
      return
    }
    setDialog({ kind: 'send', files })
  }
  const confirmSend = (files: ManifestFile[], plan: SendPlan) => {
    setDialog(null)
    const name = plan.folder || 'files'
    board.sendUpload(
      { key: `files:${name}`, label: name },
      { intent: 'send-files', fileIds: idsOf(files), name, plan }
    )
  }
  const openEditor = (group: ManifestGroup) => goTo(editHref(group.id))
  const takeStep = (group: ManifestGroup, step: MontageStep) => {
    if (step === 'Edited' || step === 'Rendered') openEditor(group)
    if (step === 'Uploaded') askUpload(group)
    if (step === 'Emailed') setDialog({ kind: 'email', groupId: group.id })
  }
  const markDone = (group: ManifestGroup, done: boolean) =>
    send(`done:${group.id}`, { intent: 'mark-done', groupId: group.id, done })
  const openFolderOf = (group: ManifestGroup) =>
    send(`folder:${group.id}`, { intent: 'open-folder', groupId: group.id })
  const cancelProcess = (scope?: BusyScope) => {
    const jobId = scope ? board.processingOf(scope) : null
    send('cancel-process', { intent: 'cancel-process', ...(jobId ? { jobId } : {}) })
  }
  const placeHeld = (name: string) =>
    board.busyWith({
      destination: name,
      groupIds: groups.filter((g) => g.destination === name).map((g) => g.id)
    })
  const heldOf = (group: ManifestGroup) =>
    board.busyWith({
      groupIds: isMontage(group)
        ? groups
            .filter((g) => isMontage(g) && passengerOf(g) === passengerOf(group))
            .map((g) => g.id)
        : [group.id]
    })
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
    edited,
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
    askSend,
    confirmSend,
    openEditor,
    takeStep,
    markDone,
    openFolderOf,
    trimToJump,
    cancelProcess,
    heldOf,
    placeHeld,
    freeableOf
  }
}

type BoardModel = ReturnType<typeof useBoardModel>

const useBoard = () => useOutletContext<BoardModel>()

export { useBoard, useBoardModel }
export type { BoardModel }
