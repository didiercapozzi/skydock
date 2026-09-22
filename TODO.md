# TODO

What is still to do. What was done is in git, not here.

## Open

### The jump's moments, and what to build on them

The exit, both ends of the canopy opening and the ground are found and shown (RULES, Where the jump
is in a clip). What they were found for is not built yet, in the order worth doing:

- **The music on the exit.** The montage cuts the music to end with the film (RULES, Montage); where
  it _starts_ is still zero. A finished film changes track where the jump begins, which is a moment
  SkyDock knows.
- **Cameras synced on the exit.** Two cameras of one jump share that instant, so their offsets are
  arithmetic: the project could open with the angles already lined up. The hard part of editing,
  for free — but only for clips that both have an exit.
- **A suggested trim on the board**, from a few seconds before the exit to a little after the ground,
  offered as a hollow ✂ to accept rather than applied. The montage marks the moments on the clip and
  cuts nothing: where the film changes is the editor's decision.
- **Speed, which is left alone on purpose.** Both finished films run the canopy ride at twice speed
  and cut four or five half-speed highlights out of the freefall. Every boundary of those is a mark
  SkyDock has, so it could be offered — but how fast a particular canopy ride should run is a
  judgement about that ride, and a montage that guesses it is a montage somebody has to undo.
- **A camera nobody has read yet** gets no marks, and is marked by hand. Both cameras here are read.
  The sound was tried and dropped as a fallback for the rest: on a GoPro freefall is the quietest,
  flattest part of the spectrum and on a DJI the busiest, so no one threshold serves both, and a
  wrong mark is worse than none.
- **The canopy on a freefly jump.** A jumper head-down and turning weighs what an opening weighs,
  for longer, so nothing is claimed about the canopy or the ground there — the exit is still exact.
  Telling them apart wants something besides how much a second weighs: the direction it pulls in,
  which both cameras record, or the height, which neither does as things stand.
- **Height and speed on the graph** (RULES, The jump on a graph) are drawn the moment a camera
  writes them, and read off satellites alone. The GoPro here has its satellites switched off in its
  settings — turning them on is the whole of what it takes, at some cost in battery. The DJI has no
  receiver at all, so its clips will never carry either; its whole stream was searched, the debug
  one included, and there is nothing in it but motion and exposure.

### The installed app

- Signing: unsigned installers warn on macOS and Windows. Needs an Apple Developer ID and Azure
  Trusted Signing, both paid.
- Updating works only once the repository is public and the signing key is a secret of it: an
  installed SkyDock asks GitHub what the latest release is, and a private repository answers nothing
  to a request with no token. Until then every copy stays where it is, quietly.
- Updating passes by a `.deb`: only the AppImage can replace itself on Linux. A machine installed
  from the package updates by downloading the next one.
- Moving the work folder: it is asked for on the first run and remembered. There is no way to change
  it afterwards but to edit the settings file.
- The macOS and Windows installers have never been run: they are built by the workflow and have to be
  tried on those machines. The exiftool each carries is part of what has never been tried — the
  Windows build brings its own Perl, and a Mac's is the system's own.

### Code left out of the cleanup, because changing it could change behaviour (CODING.md)

- Some endpoints are still called by a URL written by hand: file, thumbnail and storage-file links,
  the import upload, and the template upload. Moving them to `routingEngine` changes how the server
  reads each request.
- Several forms still hold their own state instead of using `@skydock/ui/forms`: the email dialog,
  the merge date, the passenger name, the jump time, the new NAS folder, and the new destination.
- Six hooks each implement their own stored-preference store. They could share one factory.
- The camera-copied refresh is fired from an effect. It belongs in the live-event handler.
- A few hand-written types still duplicate transported data without a schema: the import result, the
  free results, the board loader's data.
- A video-cropper test sends a synthetic wheel event instead of a real user action.
