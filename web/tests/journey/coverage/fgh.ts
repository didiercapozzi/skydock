/* What the storage chapters (f-storage, g-transfers, h-freeing) guard: each RULES.md feature, by the title of
   the chapter that walks it. Everything runs against the fake storage, a process of its own serving a
   folder, so what the app did up there is read off that folder. */

const wrongLogin = 'says a wrong password plainly and keeps nothing of it'
const sameBytes =
  'passes over a file of the very same name and bytes, and sends only what is not up there'
const inTheWay =
  'sends nothing when another file already has the name of one, says which, and shows where to deal with it'
const notGranted =
  'does not read a file as uploaded because the storage lists one of its name: only an upload, which compares checksums, does that'
const folderLink =
  'makes the folder’s link on asking, shows it with Copy link, and takes it away leaving the folder and its files'
const fileLink =
  'is made from the row, shown there by a mark that copies it, and taken away from the same place'
const revoked = 'shows a link the storage no longer honours as no link at all, and offers a new one'
const frees =
  'frees a dropzone: proves the storage holds each file, shows it going in the corner and in the transfers, then deletes the originals and the copies'
const fetched =
  'fetches a file back from the storage tab on asking, shown going in the corner with its name and size'
const noticed =
  'stops counting a file the storage no longer holds when the board is opened, ready to be sent again and the local file left'
const unreachableKept =
  'demotes nothing when the storage cannot be reached: what the record says went up still reads as up'

const covers: Record<string, string[]> = {
  'Network storage': [sameBytes, frees, fetched],
  Connecting: [
    'asks for the login when an upload is wanted and the storage is not connected',
    wrongLogin,
    'asks an account with 2-step verification for its code, in the same login and with what was typed kept',
    'goes on renewing the session without a code once the code was given, since the storage trusts this machine',
    'takes the hostname, username and password once, and keeps the password only encrypted',
    'forgets the trust of this machine when it is disconnected, so the code is asked for again'
  ],
  Folders: [
    'has nowhere to upload into until a folder is picked for the destination, and asks for one',
    'is made, given a folder of its own on the storage, and filled with the next jump'
  ],
  'A place is connected to its folder': [
    'carries the same address from a file’s right panel and from its row on the storage tab, with the file preselected',
    'is no longer listed among the files this machine holds, and the storage tab says it is only there'
  ],
  'Files keep their date': [
    'sends every file with the date processing stamped on it, which is when it was shot'
  ],
  'Uploading a dropzone': [
    'files a second jump and a loose file into the destination, and prepares them',
    sameBytes
  ],
  'Sending what changed': [inTheWay, notGranted, sameBytes],
  'One upload at a time, shown wherever you are': [
    'shows the upload in the corner whatever page is open, and offers no Upload anywhere while it goes',
    'goes on when the page is opened again, and shows the upload still under way',
    sameBytes
  ],
  'Cancelling an upload': ['stops from the panel with nothing to confirm, and records nothing'],
  'And the same footage under another name': [
    'sends only the file the storage does not hold, and has the storage copy the one it holds in another folder',
    'is found in the storage’s list, which another machine had written to'
  ],
  'Where each file came from': [
    'keeps one list on the storage, in the folder that holds the destinations’ folders and never inside one of them',
    'says of each file it sent where it was made from, and writes that inside the file too, but never in an original'
  ],
  "The storage's own listing is the truth; the list only remembers": [
    'forgets what the list says of a file the folder no longer holds, and the board follows'
  ],
  'Share links': [folderLink, fileLink, revoked],
  'Copy link': [folderLink, fileLink],
  'Noticing deletions': [
    'goes on saying what it last proved until the board is opened, a place is opened or the check is pressed',
    noticed,
    'notices another deletion when the check button is pressed, without the page being left'
  ],
  'Never held': [
    'draws the board from this machine at once while the storage is still being asked, and says so',
    unreachableKept
  ],
  'Footage that is nowhere is not listed': [
    'is kept as it is when the storage cannot be asked: a call that failed proves nothing',
    'is forgotten when the storage is asked and says it is not there, with the jump it was the last file of'
  ],
  'Uploaded is the end of editing': [
    'shows a lock with the reason in the preview of a file that is up there, and no way to trim, frame or turn it',
    'refuses to move a file that is up there to another place, and says so'
  ],
  'Being listed can take a claim away, never grant one': [notGranted, unreachableKept],
  'A file brought back is shown going': [fetched],
  'Transfers, looked at afterwards': [
    'lists what the machine kept, the latest first, each with how it ended and how many files',
    'opens one to list every item with its size, where it went and a button to its folder in the storage’s interface',
    'keeps them after the app is stopped and started again',
    'forgets one transfer with its cross and the whole list with Clear, touching nothing that was sent'
  ],
  'The small copies, made in view': [
    'are made in view in a window of their own, which goes when every clip has its copy'
  ],
  'Everything with a bar is in Transfers too': [
    'lists an upload going now at the head of the transfers, with a window of its own in the corner',
    frees
  ],
  'Freeing space': [
    'asks first, saying what is proved, what is deleted and what stays, and deletes nothing when it is turned down',
    'is refused while the storage cannot be reached, and nothing is deleted',
    'is refused naming each file the storage does not hold as it was sent, and nothing is deleted',
    frees
  ],
  'Freed once, partly back, freed again': [
    'rejoins its jump, stops reading as freed, and is a file to prepare again',
    'is sent again once the old copy is deleted up there by hand, and reads as on the storage like any other file'
  ],
  'A dropzone is freed the same way': [frees],
  'Asked for, it comes back': ['is left as it is by a scan, which brings nothing back', fetched],
  'Bring back': [
    fetched,
    'keeps it with the transfers as brought back',
    'rejoins its jump, stops reading as freed, and is a file to prepare again'
  ]
}

const exempt: Record<string, string> = {}

export { covers, exempt }
