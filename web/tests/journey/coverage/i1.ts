const SIX_STEPS = 'walks the montage through its six steps, each shown where it is'
const BEFORE_REPROCESS =
  'keeps the edit aside before preparing it again, and pressing the same button twice leaves one version'
const FILM_SHOWN =
  'shows the film above its montage with its name, how long it runs, its size and when it was rendered'
const FILM_NOTICED =
  'notices a film that has stopped growing and can be read, with nothing pressed, and says it is ready to upload'
const BACK_ASKS =
  'asks first, saying what goes and what stays, and changes nothing when told to cancel'
const RESET_KEEPS_EDIT =
  'names the edit on its own in the question, and keeps it aside when the montage is reset'
const DELETE_KEEPS_EDIT =
  'names the edit on its own, removes it, and keeps every version of it aside'
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

const FILM_OPENS =
  'opens on a prepared montage with its clips laid end to end, and writes the edit beside them only at the first change'

const covers: Record<string, string[]> = {
  'The film editor': [FILM_OPENS],
  "A processed montage's film is edited in SkyDock": [FILM_OPENS],
  'Clips go in where they are dropped': [
    'trims a clip by its edge, and the clips after it close the gap',
    'puts a clip in again with Add, at the end of the film'
  ],
  'A gap is black and silent': [
    'moves a clip with the keys, which leaves a gap before it, and the render keeps the gap'
  ],
  'A crossfade is one click': [
    'fades a clip in over the one before it with one click, which shortens the film, and a second click takes it off'
  ],
  'Cutting, Ripple and Snap': ['cuts a clip at the playhead into two, and Undo makes it one again'],
  'Choosing the part': ['chooses the part a clip shows in a window of its own, and keeps it'],
  "The music is the film's sound": [
    'hears a clip whose speaker is turned on, and the music dips under it'
  ],
  Music: ['brings music in from the computer, puts it in the film, and the saved edit carries it'],
  Text: ['adds a title from a preset, and the saved edit carries it'],
  'The picture plays the edit': ['plays the edit in the picture, and stops where it is'],
  'Rendering is one press': [
    'renders the film into the montage’s folder, and the board takes it as the film'
  ],
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
    'notices an edit removed by hand, and one put back by hand'
  ],
  "A montage's files are listed as a destination's are": [
    'lists a montage’s files as a destination’s are, each with its picture, name, time, size and state'
  ],
  'The film': [
    FILM_SHOWN,
    'plays the film rendered again, which replaces the one that was there',
    'lets the film that was rendered last be watched where it is shown'
  ],
  'The edit and the montage': [
    'notices an edit removed by hand, and one put back by hand',
    BEFORE_REPROCESS
  ],
  'The edit is kept aside, every version of it': [
    BEFORE_REPROCESS,
    'keeps another version once the edit is not what was kept, and deletes none',
    RESET_KEEPS_EDIT,
    DELETE_KEEPS_EDIT
  ],
  'Preparing it again is allowed': [
    'prepares a montage with an edit again from its originals, leaving the edit, the film and every name as they were'
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
  'An edit holds the montage':
    'What an edit holds is that a new name renames the montage whole and that a freed montage refuses a name it had, which no step of the journey does: the board’s server tests walk the rename (its folder, copies, film and edit) and the refusals, and the film editor’s journey writes the edit this holds.',
  'An edit SkyDock cannot read':
    'An unreadable edit is one a newer SkyDock or a hand wrote, which no step of the journey makes; the film editor’s browser test walks the editor saying it was kept aside, and the scripts’ test that it is set aside whole and never written over.',
  'Starting the edit again':
    'Taking the edit away is one file kept aside and removed, with nothing processed or rendered; the board’s browser test walks the question and the choice, and the server tests that the copies, the film and the name stay.',
  'Taking the next step from where it is said':
    'The step is taken from the trail on the Montages page when no montage is open there, which the board never leaves it at: it opens the first montage itself, so no click reaches the trail; each step’s own button is walked in the six steps and project chapters.'
}

export { covers, exempt }
