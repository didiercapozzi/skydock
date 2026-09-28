import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'

/* The day's bookings as the booking system knows them — whoever a montage will be for — a name, an address to email, the time
   they are booked to jump — so a montage is named from the list rather than typed off a form, and
   its email is addressed already (RULES, The booking list). Kept beside the board, in the work
   folder, since it belongs to the day's work and not to this machine. */
const bookingSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  /* when they are booked, as the clock on the wall says it: 10:30 */
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
})

const bookingListSchema = z.array(bookingSchema)

type Booking = z.infer<typeof bookingSchema>

const NONE: Booking[] = []

const listPath = (outputDir: string) => path.join(outputDir, 'bookings.json')

const readBookingList = (outputDir: string) => {
  try {
    return bookingListSchema.parse(JSON.parse(fs.readFileSync(listPath(outputDir), 'utf8')))
  } catch {
    return NONE
  }
}

const saveBookingList = (outputDir: string, list: Booking[]) => {
  if (list.length === 0) fs.rmSync(listPath(outputDir), { force: true })
  else writeJsonAtomic(listPath(outputDir), list)
}

/* one line of a CSV, its quoted fields kept whole — a name with a comma in it is still one name */
const fieldsOf = (line: string, separator: string) => {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === separator) {
      fields.push(field.trim())
      field = ''
    } else field += c
  }
  fields.push(field.trim())
  return fields
}

/* a time however a booking export writes it — 10:30, 10h30, 9.05, or inside a date — as 10:30 */
const timeOf = (text: string) => {
  const found = /(?:^|\D)(\d{1,2})[:h.](\d{2})(?!\d)/.exec(text)
  if (!found) return undefined
  const hours = Number(found[1])
  const minutes = Number(found[2])
  if (hours > 23 || minutes > 59) return undefined
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/* what a column holds, by its heading in any of the three languages the app speaks */
const HEADINGS = {
  first: /^(first|firstname|first name|prénom|prenom|vorname)$/i,
  last: /^(last|lastname|last name|surname|nom de famille|nachname|familienname)$/i,
  name: /^(name|nom|full name|passenger|passager|passagier|client|kunde)$/i,
  email: /mail/i,
  time: /^(time|heure|zeit|uhrzeit|slot|créneau|creneau|date|datum|start|début|debut)/i
}

/* A booking export or a list typed by hand, read as bookings. The first line is headings when it
   names its columns; otherwise the first column is the name, and an address or a time is found
   wherever it is. Commas, semicolons and tabs all separate — whichever the first line has most of.
   A line without a name is left out. */
const parseBookingList = (text: string) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const first = lines[0]
  if (!first) return NONE
  const separator = ['\t', ';', ','].reduce((best, s) =>
    first.split(s).length > first.split(best).length ? s : best
  )
  const top = fieldsOf(first, separator)
  const column = (kind: keyof typeof HEADINGS) => top.findIndex((h) => HEADINGS[kind].test(h))
  const headed = (['first', 'last', 'name', 'email', 'time'] as const).some((k) => column(k) !== -1)
  const at = headed
    ? {
        first: column('first'),
        last: column('last'),
        name: column('name'),
        email: column('email'),
        time: column('time')
      }
    : null
  const rows = (headed ? lines.slice(1) : lines).map((l) => fieldsOf(l, separator))
  return rows.flatMap((row) => {
    const cell = (i: number | undefined) => (i === undefined || i < 0 ? '' : (row[i] ?? ''))
    const name = at
      ? (cell(at.name) || [cell(at.first), cell(at.last)].filter(Boolean).join(' ')).trim()
      : (row[0] ?? '').trim()
    if (!name) return []
    const email = at ? cell(at.email) : row.find((f) => f.includes('@'))
    const time = at ? timeOf(cell(at.time)) : row.slice(1).map(timeOf).find(Boolean)
    return [
      {
        name: name.replace(/\s+/g, ' '),
        ...(email && email.includes('@') ? { email: email.trim() } : {}),
        ...(time ? { time } : {})
      }
    ]
  })
}

/* The name booked nearest when a jump began, within three quarters of an hour — the time a
   slot is booked for and the time the camera starts are rarely the same minute, but a list's
   neighbours are a slot apart. */
const bookedNear = (list: Booking[], epoch: number) => {
  const shot = new Date(epoch * 1000)
  const minute = shot.getHours() * 60 + shot.getMinutes()
  const near = list
    .flatMap((b) => {
      if (!b.time) return []
      const [h, m] = b.time.split(':').map(Number)
      return [{ booking: b, off: Math.abs((h ?? 0) * 60 + (m ?? 0) - minute) }]
    })
    .filter((b) => b.off <= 45)
    .sort((a, b) => a.off - b.off)
  return near[0]?.booking ?? null
}

/* the address the list has for a name, whatever its case */
const emailFor = (list: Booking[], name: string) =>
  list.find((b) => b.name.toLowerCase() === name.trim().toLowerCase())?.email ?? null

export {
  bookedNear,
  bookingSchema,
  emailFor,
  parseBookingList,
  bookingListSchema,
  readBookingList,
  saveBookingList
}
export type { Booking }
