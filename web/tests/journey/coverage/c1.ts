/* What the first half of part C guards: the jumps, times, places, disk tree, languages and the board's own
   screen, each RULES.md feature by the titles of the chapters that walk it. */

const covers: Record<string, string[]> = {
  Jumps: [
    'groups the files by the fifteen-minute pause, names the jumps by position oldest first through the days, and lets a jump last hours',
    'leaves a file with no neighbours loose, listed on a card of its own, rather than making a jump of one',
    'groups only the files it had not seen: new files within the gap join a jump still in Fresh files, and a jump already filed never grows',
    'gathers the loose files into jumps by the gap rule when asked, which forgets nothing',
    'is deleted from its panel, and its files stay, loose, each at the time its camera gave it'
  ],
  'Times and dates': [
    'moves nothing but its place in the jump when the new time is among the others',
    'keeps a file in its jump and the jump under its day when the new time is on another day, and flags the file off the gap',
    'sends a loose file to whichever day its new time falls on',
    'is given the time it really started, and every file in it moves by the same amount, the gaps and the order staying as they were',
    'is named by the corrected time once its files are filed to a destination and processed',
    'forgets every corrected time, so no file is held off the gap, and keeps the jumps'
  ],
  'Places: destinations and montages': [
    'cannot be named Montages, in any case, or like a path, and the board says why',
    'takes a loose file filed to it without the file belonging to any jump, and hands it over with its own day among the others',
    'is taken off the board when asked, after asking first, and the jump filed there comes back to Fresh files whole with every original where it is'
  ],
  'What lands on disk': [
    'keeps every original as it came off the camera in a folder a day, what is handed over flat in the folder of its destination, and the board record at the top',
    'leaves no copy of a file taken out of a jump, so nothing stale is left to hand over, and the original stays where it is',
    'are built from who it is for, the date and the time shot, folding accents and spaces away in the file names but not in the folder name, and a counter keeps two files shot in the same second apart'
  ],
  Languages: [
    'is French once chosen under Settings: the page is drawn again in it at once, the places, the cards and the dates with it, and the disk is as it was',
    'is German once chosen, and kept on this machine, so another window opens in it',
    'writes names to the disk in no language but their own: what is handed over is named alike in German',
    'is English again when asked, and is first chosen by what the machine asks for until one is chosen, else English'
  ],
  'The board': [
    'starts away, comes by itself when a jump is opened, and goes and comes back with the icon on the toolbar',
    'is remembered beside the files, so a page opened again keeps it where it was left',
    'folds into a drawer on a window narrower than a laptop, pulled out with the same icon and shut again on the next visit',
    'is still reached when the window is so narrow that the menu of places becomes a strip across the top'
  ],
  'Every folder has its own address': [
    'is a link in the menu, so picking one is going there, and a folder reloaded comes back as the same place',
    'is reached by the back button, which walks the folders and the clips looked at',
    'is that clip open in its folder, which comes back from a reload, and which Escape closes, leaving the folder open',
    'says nothing of a trim nobody saved, which is somewhere not worth coming back to',
    'travels with its address: what is typed in the box and which jump card is open come back from a reload',
    'opens the fresh files for an address nobody recognises, rather than nothing'
  ],
  "A destination's page and Fresh files are calm": [
    'is calm: its name, one quiet line, a search icon and a menu, over one card that says where things stand',
    'shows its jumps as white cards over the loose files as one more card, and opening it from the menu chooses the loose files',
    'is calm: its name, one quiet line, a search icon and a menu, over one card with its count, a bar and the next button',
    'with no files yet says so, and asks where it should go'
  ],
  'The panel on the right says nothing that the page already says': [
    'holds, for a destination with nothing selected, only where its files go and taking it off the board',
    'offers a jump waiting in Fresh files each destination to file it to, then making a montage, its start, and deleting it at the foot',
    'puts a file picture across the top, then its name, its state, its facts a line each, what can be done with it, and the bin at the foot',
    'puts, for a group of picked files, their strip of pictures edge to edge across the top, then how many, their size and the times they span'
  ],
  'The places': [
    'are a menu pinned down the left of Fresh files, destinations, montages and, under Elsewhere, the bin, each with what is left there',
    'take a jump dropped on the Montages heading by asking its name first, and cancelled, the jump stays where it was'
  ],
  'Jumps as cards': [
    'are a grid of equal cells, newest first, the loose files first as a dashed card with no day, each jump with its day, what it holds, how far it has got and its pictures',
    'opens one card at a time, lists its files under the cards, and choosing the loose files lets go of the jump',
    'takes files dropped on it into that jump whichever day it is on, which keeps its day and start and flags the file off the gap, while the loose card takes nothing'
  ],
  'Showing files': [
    'shows every file as rows, or as a grid of thumbnails once chosen, for the whole board until the window is closed',
    'draws thumbnails smaller or bigger with a slider on the toolbar or with Ctrl and the mouse wheel over them, and remembers the size on this machine',
    'shows the name of the copy that is handed over with the camera name kept beside it, and finds a file by either name',
    'is drawn forty rows at a time, the next page by itself as the end of the last comes near, and all the rest at once when asked',
    'is drawn as thumbnails a page at a time, the rest as the end of each page comes near',
    'shows its first frame, so no picture is missing'
  ],
  'The board follows its record': [
    'shows what a hand edit changed by itself, with nothing reloaded and no note said'
  ],
  'Arranging and finding': [
    'runs every list newest first, the latest shot at the top, and a jump has its own files the same way',
    'narrows what is drawn by name, so a jump with nothing matching drops out of view, the jumps left keep their numbers, and the menu still counts everything',
    'shows the name of the copy that is handed over with the camera name kept beside it, and finds a file by either name'
  ],
  Selecting: [
    'only previews a file on a click: the file shows in the inspector and is marked as the one looked at, and nothing is picked, however many files are picked already',
    'picks a file by its tick or by ctrl-click, each of which also takes it back off',
    'takes a range with shift-click, and with no range started picks that file and starts one',
    'picks every file on screen that can move with Ctrl-A, and moves the preview with the arrows, adding to the picks with shift',
    'shows a tick on every row, and a ring with a tick on what is picked',
    'asks the same question wherever picks are removed, Cancel leaves them where they were, and a file only being looked at is removed by Delete the same way',
    'sends a file back loose in Fresh files when asked, on its camera time, with the original where it was',
    'chooses no card to begin with when Fresh files has no loose file left, and a file put in the bin leaves the originals'
  ]
}

export { covers }
