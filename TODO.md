# TODO

What is still to do. What was done is in git, not here.

## Open

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
