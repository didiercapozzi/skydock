/* What the window chapters (window/*.test.ts, SkyDock's own Electron window on a display of its own, worked
   by a real pointer) guard: each RULES.md feature, by the title of the chapter that walks it. */

const covers: Record<string, string[]> = {
  'Nothing running is cut off unasked': [
    'is not offered another folder while processing writes into this one, and asks before the close button cuts it off'
  ],
  'Another work folder': [
    'works from another folder chosen under Settings, leaves the folder behind as it was, and can go back to it',
    'is not offered another folder while processing writes into this one, and asks before the close button cuts it off'
  ],
  'A whole folder can be dropped': [
    'takes in every video and photo inside a folder let go over the board, however deep, and leaves the notes and bookkeeping where they are'
  ],
  "In the machine's own player": [
    'hands the clip, as it was shot, to the machine own player from the file window, copying nothing'
  ],
  'A window of its own': [
    'opens a double-clicked file in a second window, keeps the board going behind it, and shows the next file in the same window',
    'brings the file window back to the front when it is under the board and another file is asked for, and closes it with Escape and not the board'
  ],
  'How big it is drawn': [
    'draws the board bigger and smaller from the buttons of the status bar, a tenth at a time, and back to as drawn when the size is pressed',
    'draws the board at the size the keys ask, never beyond half or three times, and keeps the size for next time'
  ],
  'The toolbar and the status bar': [
    'draws minimise, maximise and close at the end of the toolbar, and minimise puts the window away until it is asked back',
    'maximises and restores from the middle button, and by pressing the empty toolbar twice',
    'moves the window when the empty toolbar is dragged',
    'closes SkyDock from the close button, without asking anything when nothing is running'
  ]
}

const exempt: Record<string, string> = {
  'It keeps itself current':
    'the update check runs only in an installed (packaged) app and its feed is the release address baked into the package, with no setting to point it at a local feed; the shell run from source never asks, and the network is not touched. Covered by hand on a release build.'
}

export { covers, exempt }
