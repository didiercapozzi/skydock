/* What the chapters of preparing guard (e-preparing, e-again, e-names): processing, the step of a dropzone, the
   state a file is in, and the work shown as it happens. */

const SHOWN =
  'shows each file’s own bar as it is processed, goes on answering, and carries on when the page is reloaded'
const STOP =
  'stops processing when asked: the file under way is dropped, the finished copy stays, and nothing counts as processed'
const ONLY =
  'prepares only the two that need it, leaves the day already on the storage as it is, and names the new copies after the destination'
const PLAIN = 'says plainly how many files need processing, and offers no upload before they are'
const HEAD =
  'is headed by who it is, with a menu of three dots for changing its folder and taking it off the board, and a Local and an On the storage tab under it'
const STEP =
  'counts every file of the folder that needs processing in the step beside what it owes, whatever a search is showing'
const PROXIES = 'makes a small copy of each large clip in view, while the board goes on answering'

const covers: Record<string, string[]> = {
  'Work shown as it happens': [SHOWN, PROXIES, 'plays a large clip from its small copy'],
  Acting: [PLAIN, ONLY],
  "A dropzone's step stands beside what it deals with": [STEP, ONLY],
  "A destination's page is headed in three parts": [
    HEAD,
    'shows the folder it goes to in its head, to press and change, and the three stations of to process, to upload and on the storage'
  ],
  Processing: [SHOWN, STOP],
  'Nothing is uploaded until everything in it is processed': [PLAIN, STOP],
  'File status': [
    ONLY,
    STOP,
    'offers the upload once every file is processed, and the copies are whole and the right way up'
  ],
  'What lands on disk': [
    ONLY,
    'processes the files of a destination, found wherever the folder is opened from'
  ]
}

export { covers }
