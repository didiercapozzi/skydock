/* What the chapters of parts A and B (a-opening, b-footage) guard: each RULES.md feature, by the title of the chapter that walks it. */

const covers: Record<string, string[]> = {
  'Where SkyDock runs': [
    'the work folder dialog says where the work is kept, and that another folder is chosen from SkyDock’s own window',
    'a drive without a DCIM folder is not a camera, and a card with one that nobody has met asks first, saying its name and how many files on it are not here yet'
  ],
  '2. Scan': [
    'a work folder with no record is looked through the moment the board opens, showing only a loader, and then opens on what was found',
    'a work folder nothing has been copied into yet is settled by its first look: the originals folder made, an empty record written, and a board that says there is nothing to sort',
    'a work folder that holds the work of an earlier SkyDock opens on the work as it was, with no first look through it'
  ],
  '3. Sort': ['makes a destination, and files a jump into it by dragging it there'],
  'The workflow': [
    'copies a camera only when asked from its page: every file is listed first, they are copied not moved, and a preview copy and a Mac’s own files stay on the card',
    'several files dropped together are copied, not moved, into the originals under the day they were shot, and wait loose in Fresh files'
  ],
  '1. Copy off the cameras': [
    'copies a camera only when asked from its page: every file is listed first, they are copied not moved, and a preview copy and a Mac’s own files stay on the card',
    'a camera put in again is not asked about twice and costs nothing, and one that is out is listed as not connected',
    'a second camera’s clip with the same name as one already there is kept beside it under its name with a number',
    'a camera set to copy automatically is copied the moment it is plugged in with nobody pressing anything, and what is here already is passed over'
  ],
  'SkyDock remembers the cameras it has met, and copies from them only as told': [
    'a drive without a DCIM folder is not a camera, and a card with one that nobody has met asks first, saying its name and how many files on it are not here yet',
    'closing the question remembers the camera on this machine and copies nothing, with the box to copy it automatically unticked',
    'the dialog’s Choose which files… remembers the camera and opens its page, where only the files ticked are copied and the rest stay on the card',
    'a camera set to copy automatically is copied the moment it is plugged in with nobody pressing anything, and what is here already is passed over',
    'the switch to copy new files automatically starts off for a camera that is not yours, and is turned on and off from its page'
  ],
  'A camera that hands its files over is a camera too': [
    'a camera that hands its files over is found by the DCIM inside one of its stores, named by that store, and said to be slower than a card reader, and its files cannot be looked at from the card'
  ],
  'Seeing what is on a camera': [
    'a camera can be forgotten from its page, which asks first and touches no file, and is new again the next time it is plugged in',
    'a file not copied yet, or copied here and not uploaded, is not offered for deleting from the camera',
    'a file on a camera is looked at from the card without copying it, and only what lies under its DCIM folder can be asked for',
    'a file copied from a camera and then put in the bin is shown as such, and can be deleted from the camera once its bytes are proved the same, going to the bin',
    'the switch to copy new files automatically starts off for a camera that is not yours, and is turned on and off from its page'
  ],
  'Adding files from the computer': [
    'several files dropped together are copied, not moved, into the originals under the day they were shot, and wait loose in Fresh files',
    'footage already on the board is recognised by its contents under another name: dropped on a jump it joins that jump and stays in the other, on a destination it moves there, and nothing new is copied',
    'a file let go where nothing takes it is left where it was, and the board says where it could have gone'
  ],
  'A whole folder can be dropped': [
    'a dropped folder is opened out: every video and photo inside it, however deep, is copied, and notes, projects and bookkeeping are left where they are'
  ],
  'What is coming is said before it is copied': [
    'what is coming is listed before the first file is copied, and counted as each lands',
    'a drop holding nothing SkyDock can show says so and copies nothing',
    'footage already on the board is recognised by its contents under another name: dropped on a jump it joins that jump and stays in the other, on a destination it moves there, and nothing new is copied'
  ]
}

/* What a browser against the built app cannot walk, and what stands in for it. */
const exempt: Record<string, string> = {
  '5. Hand over':
    'only names the steps that follow: the upload of a dropzone and the project, upload and email of a montage are walked by the chapters of the storage (F) and of montages (I), not by getting footage in'
}

export { covers, exempt }
