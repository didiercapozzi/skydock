# TODO

What is still to do. What was done is in git, not here.

## Open

### The jump's moments, and what to build on them

The exit, the canopy and the ground are found and shown (RULES, Where the jump is in a clip). What
they were found for is not built yet, in the order worth doing:

- **Markers in the project.** Write them as kdenlive guides when the montage is made. Cheapest of
  the lot and decides nothing — the editor simply stops scrubbing to find the moments.
- **The music on the exit.** Place the template's music so it starts there rather than at zero.
- **Cameras synced on the exit.** Two cameras of one jump share that instant, so their offsets are
  arithmetic: the project could open with the angles already lined up. The hard part of editing,
  for free — but only for clips that both have an exit.
- **A suggested trim**: from a few seconds before the exit to a little after the ground, offered as
  a hollow ✂ to accept rather than applied.
- **DJI clips have no marks.** A DJI writes what it felt into `dbgi` — protobuf, `dvtm_ow001.proto`,
  no published schema — so nothing reads it yet. Until then those clips are marked by hand. The
  sound was tried and dropped: on a GoPro freefall is the quietest, flattest part of the spectrum
  and on a DJI the busiest, so no one threshold serves both, and a wrong mark is worse than none.

### The installed app

- Signing: unsigned installers warn on macOS and Windows. Needs an Apple Developer ID and Azure
  Trusted Signing, both paid.
- Updating: no updater yet — a new version is downloaded and installed over the old one.
- Moving the work folder: it is asked for on the first run and remembered. There is no way to change
  it afterwards but to edit the settings file.
- exiftool does not travel with the installers, so a machine without it reads times off the files
  rather than out of what the camera wrote.
- The macOS and Windows installers have never been run: they are built by the workflow and have to be
  tried on those machines.

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
