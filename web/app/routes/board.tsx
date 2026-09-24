import {
  earlierTandemsDir,
  ensureNasSession,
  forgetLostFiles,
  getOutputDir,
  learnStorage,
  listRemoteFiles,
  loadManifest,
  processingNow,
  saveManifest,
  statProcessedOutputs,
  statProxies,
  statTandemArtifacts,
  tandemsRemoteDir
} from '@skydock/scripts'
import type { TandemEntry } from '@skydock/scripts'
import { keepBackupAsPlace } from '../../../packages/skydock-scripts/src/destinations'
import { diskSpace } from '../../../packages/skydock-scripts/src/diskSpace'
import { readTandemIndex } from '../../../packages/skydock-scripts/src/tandemIndex'
import { Outlet } from 'react-router'
import type { ShouldRevalidateFunctionArgs } from 'react-router'
import { BoardHeader } from '../components/board-header'
import type { NasLink } from '../components/board-header'
import { Callout } from '../components/callout'
import { DialogHost } from '../components/dialog-host'
import { ImportPanel } from '../components/import-panel'
import { PlacesTree } from '../components/places-tree'
import { formatTime } from '../components/utils'
import { fromComputer } from '../helpers/import'
import { useBoardModel } from '../hooks/useBoardModel'
import type { Route } from './+types/board'
import { idsOf, messageOf } from '@skydock/scripts'

/* The board's data is read once, and every change comes back in the answer the endpoint gives: the
   board adopts that answer, so reading everything again — the disk, and the storage over the
   network — would only be thrown away. Walking the folders never asks either. Connecting to the
   storage, or leaving it, is the one change whose answer does not carry the board, so it is read
   again then. */
const shouldRevalidate = ({
  formMethod,
  formAction,
  defaultShouldRevalidate
}: ShouldRevalidateFunctionArgs) =>
  formMethod !== undefined && formAction?.startsWith('/api/nas') === true
    ? defaultShouldRevalidate
    : false

const loader = async (_args: Route.LoaderArgs) => {
  const outputDir = getOutputDir()
  let manifest = null
  try {
    manifest = loadManifest(`${outputDir}/manifest.json`)
  } catch {
    manifest = null
  }
  /* a session file is not a session: ask DSM whether the id still works (and let it refresh
     itself if it does not), so the board never shows a connection that is already dead */
  let nas: {
    connected: boolean
    hostname: string | null
    username: string | null
  } = { connected: false, hostname: null, username: null }
  /* the first look at the NAS happens here rather than on mount: the page then arrives already
     correct, and the Refresh button re-runs the same check through /api/remote-files */
  let remote: { dirs: string[]; sizes: Record<string, number | null>; at: number } | null = null
  let storage: { dir: string; tandems: TandemEntry[]; problem: string | null } | null = null
  try {
    const session = await ensureNasSession()
    if (session) {
      nas = {
        connected: true,
        hostname: session.hostname,
        username: session.username
      }
      /* a backup folder chosen before backups went into destinations becomes one (RULES, Places) */
      if (manifest && session.backupFolder && keepBackupAsPlace(manifest, session.backupFolder))
        saveManifest(`${outputDir}/manifest.json`, manifest)
      if (manifest) {
        remote = await listRemoteFiles(manifest, session)
        /* footage that is nowhere is not listed: a freed file the storage no longer holds has
           nothing left anywhere, so the app forgets it rather than offering a dead row */
        const forgotten = forgetLostFiles(manifest, remote)
        if (forgotten.length > 0) {
          saveManifest(`${outputDir}/manifest.json`, manifest)
          console.log(`[Board] Forgot ${forgotten.length} file(s) nowhere: ${forgotten.join(', ')}`)
        }
        /* What the storage holds is written into its own list, whoever put it there: a place can be
           pointed at a folder that was full of footage long before SkyDock saw it, and an upload
           must not send a second copy of what is already up there (RULES, Network storage). It is
           the board's own reading of those folders, so it costs nothing more to look — and a
           storage that will not have it written changes nothing about the board. */
        await learnStorage(manifest, session, remote.sizes).catch((e: unknown) => {
          console.warn(
            `[Board] The storage's list of what it holds was not written: ${messageOf(e)}`
          )
        })
        /* the storage's own list of tandems — every one it holds, from here or from elsewhere */
        const dir = tandemsRemoteDir(manifest)
        if (dir)
          storage = await readTandemIndex(session, dir, earlierTandemsDir(manifest))
            .then((index) => ({ dir, tandems: index.tandems, problem: null as string | null }))
            .catch((e: unknown) => ({
              dir,
              tandems: [],
              problem: messageOf(e)
            }))
      }
    }
  } catch {
    nas = { connected: false, hostname: null, username: null }
  }
  const grouped = new Set(
    (manifest?.groups ?? []).flatMap((g) => g.files.map((f) => f.id ?? f.path))
  )
  const looseFiles = (manifest?.files ?? []).filter((f) => !grouped.has(f.id ?? f.path))
  return {
    groups: manifest?.groups ?? [],
    looseFiles,
    destinations: manifest?.destinations ?? [],
    /* what the disk says about each processed copy — the record alone cannot know someone
       emptied processed/ (RULES, File status) */
    outputs: manifest ? statProcessedOutputs(manifest) : {},
    /* which clips have their small copy yet — built behind the scan, so this is a fresh look
       every time the board is drawn (RULES, Workflow) */
    proxies: manifest ? statProxies(manifest, outputDir) : {},
    /* the room left on the disk, so a board opened on a full one says so from the first paint */
    disk: diskSpace(outputDir),
    /* where this machine keeps the work: every media address the board builds is a path inside it */
    outputDir,
    /* and what each tandem's folder holds: nothing tells SkyDock when the editor finishes, so a
       film is only ever noticed by looking (RULES, The editing project) */
    tandems: manifest ? statTandemArtifacts(manifest, outputDir) : {},
    remote,
    storage,
    hasManifest: manifest !== null,
    nas,
    /* what is being processed right now, if anything — a page loaded in the middle of it has to
       show it still running rather than offer to start it again */
    processing: processingNow()
  }
}

/* The board: one screen with the header across the top, the rail of folders down the side and the
   dialogs over them. It is the layout — it holds what the whole board shares and hands it down —
   and the folder the address names is drawn beside the rail by its own route, as is a file opened
   in it (RULES, The board). */
const Board = ({ loaderData }: Route.ComponentProps) => {
  const model = useBoardModel(loaderData)
  const { board, nas, drag, setDialog } = model
  const { groups, loose, places, note, setNote, send } = board

  if (!board.hasManifest) {
    return (
      <main className='mx-auto max-w-5xl p-6'>
        <h1 className='text-[15px] font-bold tracking-[-0.02em]'>Nothing here yet</h1>
        <p className='mt-2 text-[12.5px] text-ink-2'>
          Copy the cameras into the output folder, then scan to find the jumps.
        </p>
        {note && <Callout tone='warn'>{note}</Callout>}
        <button
          type='button'
          disabled={board.scanning}
          onClick={board.scan}
          className='mt-4 rounded-md border border-accent bg-accent px-[11px] py-[5px] text-[12.5px] font-medium text-white disabled:opacity-40'>
          {board.scanning ? 'Scanning…' : 'Scan'}
        </button>
      </main>
    )
  }

  /* Only what is about the storage as a whole. Which folder is whose is said where it matters. */
  const nasLinks: NasLink[] = nas.connected
    ? [
        {
          label: nas.checking ? 'Checking the storage…' : 'Check the storage again',
          mark: '⟳',
          title: `Ask the NAS what it holds now — a file deleted there stops reading as uploaded.${
            nas.remoteCheckedAt ? ` Last checked ${formatTime(nas.remoteCheckedAt)}.` : ''
          }`,
          disabled: nas.checking,
          onClick: nas.checkRemote
        },
        {
          label: 'Disconnect the storage',
          mark: '⏻',
          /* asked first: it is a mark the size of a full stop, and the way back in wants a password
             and a code off somebody's phone */
          onClick: () => setDialog({ kind: 'disconnect' })
        }
      ]
    : [{ label: 'Connect the NAS', onClick: model.openConnect }]

  /* a dialog that ends in a change closes, then asks for it */
  const closeThen = (then: () => void) => {
    setDialog(null)
    then()
  }

  const partCopied =
    model.watching && model.watching.total > 0
      ? Math.min(1, model.watching.done / model.watching.total)
      : 0

  return (
    <main
      onDragEnd={drag.endDrag}
      /* The floor under every place that takes a drop, and a target itself for nothing: what is let
         go where nothing takes it is left alone, and a file is told where it could have gone. An
         engine handed a file nobody wanted opens it, which in SkyDock's own window puts a video
         where the board was, with no way back to it. */
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (!fromComputer(e)) return
        setNote('Drop a clip on a place, a montage or a jump to add it.')
      }}
      className='flex h-screen flex-col'>
      <BoardHeader
        scanning={board.scanning}
        onScan={board.scan}
        onTemplates={() => setDialog({ kind: 'templates' })}
        proxies={board.proxyProgress}
        camera={board.cameraCopy}
        disk={board.disk ?? loaderData.disk}
        nas={{ connected: nas.connected, host: nas.host, user: nas.user, links: nasLinks }}
      />

      <div className='grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] min-[781px]:grid-cols-[250px_minmax(0,1fr)] min-[781px]:grid-rows-[minmax(0,1fr)] min-[1101px]:grid-cols-[250px_minmax(0,1fr)_300px]'>
        <PlacesTree
          destinations={places}
          groups={model.listed}
          looseFiles={loose}
          storage={board.storage}
          cameras={board.cameras}
          statusContext={model.statusContext}
          tandemOpen={(g) => !model.asOnStorage(g).uploaded}
          passengerProgress={model.passengerProgress}
          onAddPlace={model.addPlace}
          dropTarget={drag.placeDrop}
          overTarget={drag.overTarget}
          flashPlace={model.flashPlace}
        />
        {/* the folder the address names: its pane and the panel beside it */}
        <Outlet context={model} />
      </div>

      <DialogHost
        dialog={model.dialog}
        onDialog={setDialog}
        nas={nas}
        places={places}
        onChooseFolder={model.chooseFolder}
        groups={groups}
        looseFiles={loose}
        asOnStorage={model.asOnStorage}
        facts={board.tandemFacts}
        folderFor={model.folderFor}
        plan={model.sendPlan}
        onPlan={model.setSendPlan}
        onUpload={model.confirmUpload}
        storage={board.storage}
        onEmailed={(folder, sent, to) =>
          send('email', {
            intent: 'mark-emailed',
            emailed: { folder, sent, ...(to.trim() ? { to: to.trim() } : {}) }
          })
        }
        onFree={(group) =>
          closeThen(() => send(`free:${group.id}`, { intent: 'free-tandem', groupId: group.id }))
        }
        freeableOf={model.freeableOf}
        onFreePlace={(place) =>
          closeThen(() => send(`free:dz:${place}`, { intent: 'free-dropzone', destination: place }))
        }
        onDisconnect={() => closeThen(nas.disconnect)}
        onRemovePlace={(place) =>
          closeThen(() => {
            send(`remove:dz:${place}`, { intent: 'remove-destination', destination: place })
            /* the place it was showing is gone; what was in it is in Fresh files now */
            model.pickPlace({ kind: 'sort' })
          })
        }
        onTakeBack={(mode, group) =>
          closeThen(() => {
            send('take-back', {
              intent: mode === 'reset' ? 'reset-tandem' : 'delete-tandem',
              groupId: group.id
            })
            /* a deleted montage has no page left; its jumps are in Fresh files now */
            if (mode === 'delete') model.pickPlace({ kind: 'sort' })
          })
        }
        onResetFresh={(what) =>
          closeThen(() => {
            model.clearSelection()
            send('reset', { intent: 'reset-fresh', resetWhat: what })
          })
        }
        onMontage={(groupId, template) => closeThen(() => model.makeMontage(groupId, template))}
        onTrash={(files) =>
          closeThen(() => {
            model.clearSelection()
            send('trash', {
              intent: 'trash-unsorted',
              fileIds: idsOf(files)
            })
          })
        }
      />

      {model.coming && (
        <ImportPanel
          where={model.coming.where}
          files={model.coming.files}
          done={model.coming.done}
          failed={model.coming.failed}
          part={partCopied}
          reading={model.watching?.phase === 'reading'}
        />
      )}
    </main>
  )
}

export { loader, shouldRevalidate }

export default Board
