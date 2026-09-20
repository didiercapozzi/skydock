# TODO

What is still to do. What was done is in git, not here.

## Open

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
