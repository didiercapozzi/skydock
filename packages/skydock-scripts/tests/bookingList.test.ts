// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bookedNear, emailFor, parseBookingList } from '../src/bookingList'

/* The day's bookings come off a booking export or a list typed by hand, in whatever shape it
   has, and name montages from it (RULES, The booking list). */
describe('reading a booking list', () => {
  it('reads a booking export by its headings, in any order and any of the three languages', () => {
    const list = parseBookingList(
      'Heure;Prénom;Nom de famille;E-mail\n10:30;Luc;Favre;luc@example.com\n11h15;Chloé;Perret;\n'
    )

    expect(list).toEqual([
      { name: 'Luc Favre', email: 'luc@example.com', time: '10:30' },
      { name: 'Chloé Perret', time: '11:15' }
    ])
  })

  it('reads a list with no headings: the name first, the address and the time wherever they are', () => {
    const list = parseBookingList('Luc Favre, 9.05, luc@example.com\n"Perret, Chloé",,')

    expect(list).toEqual([
      { name: 'Luc Favre', email: 'luc@example.com', time: '09:05' },
      { name: 'Perret, Chloé' }
    ])
  })

  it('leaves out a line with no name', () => {
    expect(parseBookingList('Name,Email\n,nobody@example.com\nLuc,')).toEqual([{ name: 'Luc' }])
  })
})

describe('a jump and the booking list', () => {
  const list = [
    { name: 'Luc Favre', time: '10:30', email: 'luc@example.com' },
    { name: 'Chloé Perret', time: '11:30' }
  ]
  const at = (h: number, m: number) => Math.floor(new Date(2026, 8, 28, h, m).getTime() / 1000)

  it('names whoever was booked nearest when the jump began', () => {
    expect(bookedNear(list, at(11, 10))?.name).toBe('Chloé Perret')
  })

  it('names nobody when nobody was booked within three quarters of an hour', () => {
    expect(bookedNear(list, at(14, 0))).toBeNull()
  })

  it('finds the address booked under a name, whatever its case', () => {
    expect(emailFor(list, 'luc favre')).toBe('luc@example.com')
  })
})
