/* What the chapters about making a montage and its editing project guard (i1-montage, -project, -proxies,
   -editor, -templates, -edit, -reset, -delete, -delivered): each RULES.md feature, by the title of the chapter
   that walks it. */

const SIX_STEPS = 'walks the montage through its six steps, each shown where it is'
const MAKE_ONCE = 'makes the project from the template brought in, and opens the editor on it'
const BRING_FOLDER =
  'brings in the whole folder the editor left, and points the project at the music that came with it'
const MISSING_ONE =
  'keeps a template with a file missing, names what is missing straight away, and shows it before a project is made from it even as the only one'
const REPLACES = 'replaces a template brought in again under a name already there, files and all'
const BEFORE_REPROCESS =
  'keeps the project aside before preparing it again, and pressing the same button twice leaves one version'
const FILM_SHOWN =
  'shows the film above its montage with its name, how long it runs, its size and when it was rendered'
const FILM_NOTICED =
  'notices a film that has stopped growing and can be read, with nothing pressed, and says it is ready to upload'
const BACK_ASKS =
  'asks first, saying what goes and what stays, and changes nothing when told to cancel'
const RESET_KEEPS_EDIT =
  'names the edit on its own in the question, and keeps it aside when the montage is reset'
const DELETE_KEEPS_EDIT =
  'names the edit on its own, removes the project, and keeps every version of it aside'
const SHRINK =
  'shrinks the steps to one line of names and gives way to two cards, what is here and what is on the storage'
const MENU_DELIVERED =
  'keeps what else can be done to a delivered montage in the menu of its page, so the page carries the one next step'
const THREE_CARDS =
  'says in three cards what is stored, the link, and that this machine holds nothing, over what is only on the storage now'
const DONE_LIST =
  'lists the montage among the montages done once it is freed, and says no montage is left to do'
const LINK_IN_PANEL =
  'keeps the link out of those cards, in the panel at the right, with the way to copy it or remove it and where the film and the originals went'
const BUSY = 'cannot be reset or deleted until the processing is over'

const covers: Record<string, string[]> = {
  'Where every montage has got to': [SIX_STEPS, FILM_NOTICED, SHRINK],
  "A montage's page changes with where the montage is": [
    'keeps what else can be done in the menu of its page, so the page carries one next step',
    SHRINK,
    LINK_IN_PANEL,
    MENU_DELIVERED,
    THREE_CARDS
  ],
  'Montages done': [DONE_LIST],
  'Making a montage': [
    'asks for the name before anything is made, and Escape or Cancel changes nothing',
    'a jump dropped on the Montages heading asks for its name in a dialog of its own, then makes the montage',
    'a name that is already a montage’s, however capitalised, joins that montage and keeps its own times',
    'files of a destination are copied into a montage, which starts with their trim, and the destination keeps its own',
    'trimming the montage’s copy again leaves the destination’s file as it was',
    'is saved only by Enter or Save, never by clicking away, and Escape puts the name back',
    'saves nothing for an emptied name, and says a name that is another montage’s will join it before anything is saved',
    'is the same as naming it: a new name moves the montage to it, saved by Enter'
  ],
  'A finished render is noticed': [
    'does not take a film that cannot be read yet for a film, however still it sits',
    FILM_NOTICED,
    'notices a project removed by hand, which lifts the lock, and one put back by hand'
  ],
  "A montage's files are listed as a destination's are": [
    'lists a montage’s files as a destination’s are, each with its picture, name, time, size and state'
  ],
  'The film': [
    FILM_SHOWN,
    'plays the film rendered again, which replaces the one that was there',
    'lets the film that was rendered last be watched where it is shown'
  ],
  'editing project': [MAKE_ONCE],
  'The editing project': [
    MAKE_ONCE,
    'lays the clips whole in the bin in the order shot, each playing from its proxy, and leaves the template’s timeline as it was'
  ],
  'The project waits for the proxies': [
    'cannot be made while a clip is still getting its proxy, and says how many it waits for',
    'makes the project once the clip has its proxy, with the clip playing from it',
    'does not wait for a clip whose proxy was tried and could not be made, which opens as it is'
  ],
  'The jump is marked on the clip, never cut into it': [
    'marks the jump on each clip as markers of its own, and lays none along the timeline',
    'lays the clips whole in the bin in the order shot, each playing from its proxy, and leaves the template’s timeline as it was'
  ],
  'Making the project opens it': [
    MAKE_ONCE,
    'says its step is the film now, and offers the way back into the project',
    'says the editor cannot be reached, still makes the project, and offers its path to copy',
    'refuses to open a project in an editor that stops at once, and says why',
    'opens the project it was made with, in the editor it is told about, when that is one that runs'
  ],
  Templates: ['has none to offer until one is brought in, as SkyDock ships with none', MISSING_ONE],
  'Choosing one': [
    'never decides which one a project is made from while several are there: nothing is made until one is picked',
    'ticks the one picked last time and still waits to be told, for the next montage',
    'marks a template as the usual one, and takes the mark off the same way',
    'is simply used when it is whole, without asking which template to make the project from',
    MISSING_ONE
  ],
  'Bringing one in': [
    BRING_FOLDER,
    'takes a template packed as one archive, or the project and its files picked one by one, named after what it was',
    'refuses an archive that names its way out of the folder, and leaves nothing half-arrived',
    REPLACES
  ],
  'Its files are then its own': [BRING_FOLDER, MISSING_ONE, REPLACES],
  'Open to the editor': [
    'leaves what the archive brought readable and writable by anyone, so the editor can open every file'
  ],
  'The project is made once': [
    'refuses to make a second project for a montage that has one, and the edit is left as it was'
  ],
  'An edit freezes the montage': [
    'shows its files a lock and says why, once the montage has a project',
    'takes no other jump into a montage that has an edit, and says so',
    'notices a project removed by hand, which lifts the lock, and one put back by hand'
  ],
  'The edit is kept aside, every version of it': [
    BEFORE_REPROCESS,
    'keeps another version once the project is not what was kept, and deletes none',
    RESET_KEEPS_EDIT,
    DELETE_KEEPS_EDIT
  ],
  'Preparing it again is allowed': [
    'prepares a montage with an edit again from its originals, leaving the project, the film and every name as they were'
  ],
  'Taking a montage back': [
    BACK_ASKS,
    'puts a processed montage back to before processing, and keeps its name and its trims',
    RESET_KEEPS_EDIT,
    'asks first, and a montage that was only named goes back to loose files with its trims forgotten',
    'removes its copies and sends its files back loose, leaving the originals where they are',
    DELETE_KEEPS_EDIT,
    'removes the film with the rest, and the film goes with it from the board',
    'is asked first, says the record of what was uploaded goes with it, and leaves everything on the storage where it is',
    BUSY
  ]
}

const exempt: Record<string, string> = {
  'Taking the next step from where it is said':
    'The step is taken from the trail on the Montages page when no montage is open there, which the board never leaves it at: it opens the first montage itself, so no click reaches the trail; each step’s own button is walked in the six steps and project chapters.'
}

export { covers, exempt }
