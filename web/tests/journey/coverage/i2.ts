/* What the chapters about sending a montage guard (i2-montage-out, -refusals, -list, -link, -back): each RULES.md
   feature, by the title of the chapter that walks it. */

const covers: Record<string, string[]> = {
  'Uploading a montage': [
    'is sent when Upload is pressed: each zip holds what it was made of, laid out as shown, and the film and photos landed as they are'
  ],
  '1. Make the zips': [
    'starts with one zip of the originals, the photos and the project, named from the montage and the day and time of its first jump, and puts it in Backup',
    'drags a part onto a zip to put it in, and onto the empty space to make a new zip ending with that part',
    'says how many zips each part is in, since the same part can go into several',
    'takes a part out of a zip, drops a zip left empty, and removes a zip',
    'names each zip by an ending of lowercase letters, digits and dashes, no two alike, one of them with none'
  ],
  '2. Where it goes': [
    'lists every zip with its whole name and, among the destinations something is already in, the ones to add',
    'adds any other destination, drags a part onto it as it is, and takes what is in it out again',
    'puts what lands in a destination straight in its folder or in the project folder, and makes what is typed into one name',
    'says nothing is sent until each destination has a folder on the storage, and a destination left out takes what was in it',
    'has the folder of each destination chosen from the storage, and shows what will land there as a tree from that folder'
  ],
  Refusals: [
    'when it has no name: a jump is not made a montage until it is named',
    'when nothing is put anywhere, and says so',
    'when a destination has no folder on the storage, and says so',
    'when a file is still to process, and says how many',
    'when there is no film yet, naming the film that was looked for',
    'while the film is still being written',
    'while another upload is going, naming it',
    'with a film rendered under another name, when it is the only one there, taken as the film and sent named after the montage'
  ],
  'What was handed over, shown afterwards': [
    'shows one card per destination the montage is linked to, with its folder and what it holds',
    'keeps a zip closed until its row is pressed, then shows what is inside it, and closes it when pressed again'
  ],
  "The storage's list of montages": [
    'is written once a montage is uploaded, and says who it was for, the day, how much, where and its link'
  ],
  'What the storage says for itself is asked of the storage': [
    'is asked whether the folder is still there: a montage whose folder is gone is shown as no longer on the storage, and stays on the list'
  ],
  'Sending the link': [
    'is offered once the montage is on the storage with a link, which is the one the upload recorded',
    'writes the email already, in French, greeting the first word of the name and saying what is ready and from which day',
    'takes what is typed in the heading for the Subject field, and the other way round',
    'copies the email laid out and opens a new Gmail message with the address and subject filled in, and sends nothing itself',
    "asks whether the email was sent in a dialog that cannot be put away, and records Yes on the board and on the storage's list",
    'shows the montage as emailed once it was, and the mark can be undone',
    'asks nothing more when the montage is marked already, and when it is not, Not sent leaves the montage to email'
  ],
  'In the language of whoever it is for': [
    "is written in French until another language is picked for it, and is then drafted again from that language's own template"
  ],
  'A QR code of the link': ['shows the link as a QR code on request, and puts it away again'],
  'The email template': [
    "is drafted from the club's template, whose variables are shown as such while it is written and can be put in from a list that says what each would be here",
    'keeps the template on this machine, once per language, and a change to one email never changes it'
  ],
  'Going back': [
    'lists the changes made on the board, the latest first, each said in words with the time it was made',
    'puts the board back as it was just before a change, touching no file on the disk',
    'is itself a change, so it can be gone back from in the same way',
    'reads the last good record kept beside it when the board is cut off half written, rather than losing it'
  ]
}

const exempt: Record<string, string> = {
  'Not built':
    'It lists what SkyDock does not do (never sends email, nothing renders the film, a dropzone is not renamed); the chapters of sending the link show the first, the film is dropped in by hand in every montage chapter, and nothing else in the list is a behaviour a browser could walk.'
}

export { covers, exempt }
