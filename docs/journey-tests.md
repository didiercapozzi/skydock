# Journey tests — the whole app, walked through

The component tests check one piece with the server stubbed. The journey checks **the joins**: the built app,
real ffmpeg, a real browser or SkyDock's own window, one person's afternoon from the first file to the last
upload. It is where the stuck footer count, the thumbnail error and the Reset that could not be saved were found,
none of which a green component test could see.

This file is the plan and the map: what exists, what is to build, and which RULES.md sentence each chapter guards.
RULES.md stays the authority on what the app does; the chapters are named in its words.

## How it works

| Piece                                  | What it is                                                                                                         | State |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| `web/tests/journey/journey.test.ts`    | the story, in order, on one app, Playwright inside vitest; `npm run test:journey` (~15 s)                          | built |
| `app.ts`, `media.ts`, `page.ts`        | a temp world (work, config, bin), the built server started with only its own folders, ffmpeg-made DJI-style clips | built |
| [`docs/journey-map.md`](./journey-map.md) | which chapter guards which RULES.md feature, and what it asserts — written by the coverage guard from the claims, so it is never out of date | built |
| `steps.ts`, `record.ts`                 | what a person does on the page (places, dialogs, the storage connected and a folder chosen, clips opened, waits on what is on screen) and the record as the app's own shape reads it — written once, taking the `Page`, for every chapter | built |
| silent-break check                     | after every chapter: no console error, no failed request (a failed picture is asked for again before it counts)    | built |
| films and failure screens              | `videos/journey.mp4` (click it in the editor to watch) with a pointer dot, `JOURNEY_SLOW=250` for a human pace; a screen and text on failure        | built |
| `window/*.test.ts`, `drag-source.py` | Tier B: SkyDock's own Electron window on its own Xvfb, a real pointer (`xdotool`), a real file drop (XDND); `npm run test:journey:window` | written, never run here (no Electron in the container) |
| `harness.ts`                           | what every file does the same way: a world (or a saved state), the app, the browser, the film, the failure screen | built |
| saved states                           | the work folder copied after key chapters (`sorted`, `processed`, `i2-ready`), restored with its paths rewritten, so each file starts where the story left off | built |
| fake storage                           | a standalone DSM-like process: Auth (2-step), List, Download, MD5, CopyMove, Rename, CreateFolder, Sharing, upload; can misbehave on request, proven against the app's own client | built |
| coverage guard                         | a node test (`tests/server/journey-coverage.test.ts`) that reads RULES.md's feature names and fails when one has no chapter and is not on the exemptions list (`journey/coverage/*.ts`) | built |
| invariants and screens                 | the record parses with the app's own schema, the output tree matches a stored listing, the page is never held up, one light and one dark picture per page against baselines made on the machine (not kept in git) | built |

**Rules of the journey**

- Navigate by what a person clicks. The only address ever typed is the one the app starts on.
- No stubs, no fixtures of the app's answers. The server, the tools and the disk are real; the storage is a real
  process on `127.0.0.1`.
- Everything in temporary folders. Never `/workspace/output`, `/mnt/osmo`, `config/nas.json` or `.env`; the app is
  given only its own folders, the tools and the machine's clock and language.
- Every chapter ends with the silent-break check, and asserts on the disk (and the fake storage) as well as on screen.
- A bug fix adds or tightens one chapter, and starts with it failing (CLAUDE.md).
- A chapter that fails shows what failed first; later chapters that depended on it may fail too — read the first.

**Two tiers of input.** Tier A (Playwright) sends the page real click, key, hover and in-window drag events and
covers nearly everything. Tier B is an X server's own pointer on the real window, needed only for what a browser
cannot do: a file dropped from outside the window, the window's frame, quit. Tier B stays small.

## Chapters

Status: **done** · **written, not run here** (needs Electron) · **todo**. A chapter whose app behaviour is wrong is written, asserts what RULES.md says and is skipped with a `// BUG:` comment holding the evidence; TODO.md lists them.

### A. Opening and the work folder (RULES: Where it runs, The first time it is opened)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| an empty board says "Nothing left to sort"                                                | A    | done  |
| a work folder with no record is looked through at once when the board opens               | A    | done |
| the welcome page the first time: Start, the folder picker, Change, Open the board; closing the picker changes nothing | B | written, not run here |
| another work folder from Settings, refused while something is being written               | A/B  | done |
| the window's close button; closing or quitting while a job runs asks first                | B    | written, not run here |
| no "is ready" notification; update offered once, never installed unasked                  | B    | written, not run here |

### B. Getting footage in (Workflow 1–2, Adding files, Camera)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| a scan groups what a camera copy left into jumps by capture time                          | A    | done  |
| files dropped on the board stay loose, are copied not moved, say what is coming           | A    | done (simulated drop) |
| the same drop from another program, by address, with a real pointer                       | B    | done  |
| a whole folder dropped: every video and photo inside, notes and bookkeeping left          | B    | written, not run here |
| footage already on the board is recognised by contents under another name                 | A    | done |
| a card with a `DCIM` appears, is named and remembered, copied only as told, files copied not moved | A (needs a mount) | done |
| a camera's clock corrected; "seeing what is on a camera" and deleting from it (proved by bytes, into the bin) | A | done |

### C. The board and sorting (The board, Places, Jumps)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| a destination is made and a jump dragged into it                                          | A    | done  |
| loose files grouped into a jump; two jumps merged; a jump made by hand                    | A    | done |
| selecting, Move to…, filing by drag, alt-drag to copy                                     | A    | done |
| a file put in the bin and brought back; the bin never deletes                             | A    | done  |
| search (Ctrl F), sorting, rows or thumbnails, the folder counts match the lists           | A    | done |
| every address reloads to the same place; Escape closes dialogs                            | A    | done |
| light and dark pinned in the app, not following the machine; zoom; English, French, German | A   | done |

### D. The preview, trim, frame, turn (Cropping and turning, Where the jump is in a clip)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| double-click opens a clip; trim from the middle; the copy is shorter once made again      | A    | done  |
| Reset then Save puts the clip back whole and closes; the copy is whole again              | A    | done  |
| leaving with unsaved changes asks first; Cancel puts everything back                      | A    | done |
| Trim to the jump uses the exit mark (marks seeded from a clip with a data stream, or by the redo script) | A | done |
| frame (drag a rectangle, shapes), landscape with blurred sides, turn, full screen         | A    | done |
| the weight a trim will make is shown; a processed copy goes out of date when trim, frame or turn changes | A | done |
| the clip opens in the machine's own player; the preview in a window of its own            | B    | written, not run here |

### E. Preparing (Process, Acting, File status)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| the footer stops counting small copies once every clip can be played                      | A    | done  |
| process writes the copies, only of what needs it; names and folder as RULES says          | A    | done  |
| the corner shows each file's bar live; Stop; the page is never blocked (long-task probe on every job) | A | done |
| proxies made for a clip that is large enough, and the board plays from them               | A    | done |
| nothing is uploaded until everything is processed; "N files need processing" is right     | A    | done |
| processing a file whose record holds the other name of the folder (host and container)    | A    | done |

### F. The storage: connect, upload (Network storage — needs the fake storage)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| connect: wrong password said plainly; 2-step code; the folder chosen per destination      | A    | done |
| upload sends what is not there; same bytes passed over, other bytes block and name the file | A  | done |
| files keep their date; one upload at a time; cancel records nothing wrong                 | A    | done |
| the same footage under another name is recognised; the storage's own listing is the truth | A    | done |
| the destination page counts match its list (N of M on the storage)                        | A    | done |
| the storage unreachable or slow: the board stays usable and says so                       | A    | done |

### G. Transfers and links

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| the Transfers window lists what happened, kept after restart                              | A    | done |
| "Open in DSM" and a storage-tab link carry the same address, with the file preselected    | A    | done |
| share link: create, copy, remove; a revoked link is shown as such                         | A    | done |
| a file deleted on the storage is noticed and no longer counted                            | A    | done |

### H. Freeing space and bringing back (Freeing space, Going back)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| freeing asks first, proves the storage holds each file by bytes, removes the folder, shows live progress | A | done |
| freed once, partly back, freed again; a freed file is not listed among local ones         | A    | done |
| bring back from the storage tab, live and kept in Transfers                               | A    | done |
| a dropzone is freed the same way                                                          | A    | done |

### I. Montages (Making a montage, The editing project, Uploading a montage, Sending the link)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| make a montage from a jump; copied not moved; the six steps                               | A    | done |
| the project is made once; the editor (a stub that records its arguments) gets the right file | A | done |
| an edit freezes the montage; prepare again; every version kept                            | A    | done |
| a finished film dropped in is noticed                                                     | A    | done |
| upload: zips, where it goes, refusals, what was handed over; the storage's list of montages | A  | done |
| the link, its language, the QR code, the email dialog and "was it sent"                   | A    | done |
| templates: import, owned by the folder's owner, chosen per montage                        | A    | done |
| freeing and taking a montage back; reset and delete at every step                         | A    | done |

### J. Staying true (the whole run)

| Chapter                                                                                   | Tier | State |
| ----------------------------------------------------------------------------------------- | ---- | ----- |
| stop and reopen: everything as it was, from the record alone                              | A    | done  |
| the record parses with the app's own schema after every chapter; the output tree matches a stored listing | A | done |
| the main thread is never blocked while any job runs                                       | A    | done |
| one screenshot per page in light and dark, times masked, compared to a baseline           | A    | done |

## Not covered, and what covers it

| Not in the journey                          | Why                                                | What covers it                         |
| ------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| real DSM and Synology Photos                | e.g. Photos is stopped at night and never rescans  | by hand; the fake can mimic "not indexed" |
| kdenlive rendering                          | not in the container                               | the project file's content is asserted; render by hand on the host |
| GPU encode, packaged installers, self-update | need the host / a release                          | host smoke by hand; release checklist  |
| a real camera mount (gvfs, kio, MTP)        | needs a mount; Linux discovers cameras from mounts | unit tests with temp roots; try a bind mount, else exempt |

## What the journey found

The chapters found real defects and places where RULES.md and the app disagree. Each is a skipped chapter with a
`// BUG:` comment (`grep -rn "BUG:" web/tests/journey`), listed in TODO.md. A fix unskips its chapter, which is the
proof.

## Order of work (all of it built; the window chapters are written but have never been run)

1. **Saved states and the guard.** Copy the work folder after "sorted", "processed", "uploaded"; a helper restores one
   and starts the app on it. The guard reads RULES.md's bold lead-ins and `##` headings and fails on any that no
   chapter claims and the table above does not exempt.
2. **Fake storage and F, G, H.** Where the regressions of this project came from: upload, counts, freeing, links.
3. **I, montages.**
4. **C, D, E breadth** (merge, search, theme, language, frame, turn, marks, perf probe).
5. **J invariants** (schema, tree, long-task, screenshots).
6. **Tier B chapters** for A and B (welcome, folder drop, quit, window), on the display `xdotool` and the
   drag source already drive.
7. **Make it mandatory:** `npm run test:journey` into `npm test` and into CLAUDE.md's pre-report step; a release also
   gets a pass by the `the-window` agent over the packaged app, which looks at screens and never gates.

## Done means

For every chapter: it passes five times in a row; and with the feature broken on purpose (this project's own past
bugs are the test set — Reset not closing, a count that includes freed files, an upload refused on same bytes, a
footer stuck at 7/8, host and container paths) it fails, naming the RULES.md sentence. Then `npm run format`,
`npm run check` and every suite stay green.

## Running it

```
npm run test:journey            # build, the story, then every other file in the order of their names; films in web/tests/journey/videos/
JOURNEY_SLOW=250 npm run test:journey   # at the pace of a person, for a film worth watching
npm run test:journey:window     # SkyDock's own window with a real pointer; screens in web/tests/journey/screens/
```

The window test needs `xdotool` and `gir1.2-gtk-3.0` (listed in `.devcontainer/Dockerfile.dev`), Electron unpacked in
`node_modules/electron/dist` (the test unpacks it from the cache when it is missing), and draws only on an X server
of its own, never the machine's session.
