/* What the sorting chapters guard (c2-sorting, c2-copies, c2-bin, c2-merging, c2-board): filing, copies, the bin,
   merging and making jumps by hand, the toolbar, light and dark, what the board says, its dialogs and finding
   anything. */

const covers: Record<string, string[]> = {
  Filing: [
    'files a whole jump by dragging its card onto a place in the menu, and the destination opens with it',
    'moves a loose file onto another jump by dragging it onto the jump',
    'copies a file into a montage when alt is held while it is dragged onto the montage in the menu',
    'moves a file into a montage when it is dragged onto it with no key held',
    'lists Fresh files, every destination, every named montage and a new montage for picked files, leaving out where they are',
    'asks for the name before anything moves when a new montage is chosen, and Escape leaves the files where they were',
    'files picked files under a destination chosen in the menu, and that destination opens with them',
    'moves one file from its own panel with Move to…, and the montage keeps the rest',
    'goes to Fresh files with the last files of a montage taken back there, and the montage is gone'
  ],
  'Files that already belong somewhere — a dropzone, another montage — are copied': [
    'are copied into a montage, which says so before anything is made, and the destination keeps its own as processed',
    'keeps the original out of the bin while a montage still holds a copy of it, and says so',
    'leaves the montage’s copy as it was, each side changing without the other',
    'refuses the bin for a copy alongside others, and says that a copy can only be taken out',
    'takes copies out without asking, the originals staying where they are'
  ],
  'Putting files in the bin': [
    'warns first with how many files, how many videos and photos and how much space, and Cancel leaves them where they were',
    'offers the bin as a red button with a bin on it',
    'puts the files in the bin once confirmed: out of the board and the originals, moved and not erased, keeping their day folder',
    'puts a destination’s file in the bin from where it is, and the copy made from it goes with it',
    'refuses the bin for a copy alongside others, and says that a copy can only be taken out'
  ],
  'Looking into the bin': [
    'shows each time something was put aside, the latest first, saying where it came from, and which folder to empty by hand',
    'brings picked files back to Fresh files, into the originals under the day each was shot',
    'leaves in the bin, and names, a file whose footage is on the board already, since bringing it back would make two of it'
  ],
  'Merging and making jumps by hand': [
    'merges two jumps when the files of one are picked in one press and dropped on the other’s card, and the jump left empty disappears',
    'makes a jump of picked loose files, asking only when it started and moving every file by the same amount, and opens its panel',
    'are opened next to each other by a ctrl-click on a second jump, and merged onto a time typed in'
  ],
  'The toolbar and the status bar': [
    'scans from the toolbar, and the footage a camera copy left under the originals is found',
    'shows files as rows or as thumbnails, whichever was chosen last, for the whole board',
    'puts what is set once behind Settings, and says in the status bar that the storage is not connected',
    'says which version this is from About SkyDock in Settings, the one the installer is named after'
  ],
  'Light and dark': [
    'follows the machine while no choice has been made',
    'is pinned light or dark in the app, whatever the machine says',
    'keeps the choice on that machine and applies it before the first thing is drawn'
  ],
  'What the board says': [
    'says a refusal as an alert, in the colour of something still owed, and it can be dismissed',
    'says news in the app’s own colour, and the next thing done replaces the line'
  ],
  Dialogs: [
    'closes the keyboard shortcuts with Escape and with a click outside, and focus goes back to the button that opened it',
    'closes the editing templates and the work folder with Escape and with a click outside',
    'closes the question about connecting to the storage with Escape and with a click outside',
    'closes the question about putting files in the bin with Escape and with a click outside, Cancel first and what it does last',
    'closes the question about taking a destination off the board with Escape and with a click outside, the red button without an icon',
    'closes the question about resetting Fresh files and the one asking a montage’s name with Escape and with a click outside'
  ],
  'Finding anything': [
    'goes to the box on Ctrl F and finds a destination, a montage or a file by a piece of its name, saying where each is',
    'says so when nothing has that piece of a name, and looks only from two letters on',
    'goes to the first place found on Enter',
    'goes to whichever place found is clicked: a montage, or a file opened where it is'
  ]
}

export { covers }
