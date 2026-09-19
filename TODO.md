# TODO

What is still to do. What was done is in git, not here.

## Open

### Behaviour that does not match RULES.md

RULES.md states what the app should do in each case below; the code does something else.

- **A scan that finds anything new forgets work done by hand.** Every file goes back to its camera's
  time, which undoes corrected jump times and re-timed files. The jumps rebuilt by the gap rule keep
  only their place, passenger, name and processed flag. Each jump's upload record, montage record and
  freed state are dropped. A camera plugged in triggers such a scan by itself.
- **Processing one of a passenger's two jumps deletes the other jump's copies.** Both jumps share the
  passenger's folder, and processing one clears from it every copy that jump did not just write.
- **Uploaded is not enforced by the server as the end of editing.** Only the board stops an uploaded
  file from being moved or cropped; saving or moving files does not refuse it.
- **Typing a search renumbers the jump cards.** Cards are numbered among the jumps that match, so a
  card can disagree with its panel.
- **A tandem with half a name is listed as a passenger** instead of under "No name yet".
- **Making a tandem from a jump cannot be cancelled.** It has no Cancel button, and Escape does
  nothing.
- **Copying a file freed from this machine says the wrong thing:** "That jump already holds those
  files."
- **A failed proxy is not named on the board.** The reason only goes to the server's log.

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
