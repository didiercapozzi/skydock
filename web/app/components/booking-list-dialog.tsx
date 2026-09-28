import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { bringInBookings, useBookingList } from '../hooks/useBookingList'
import { Go, Mini } from './buttons'
import { ERROR, INPUT, Modal, Spacer } from './modal'

/* The day's bookings, brought in from the booking system's export or pasted from anywhere: a name on
   each line, and an address or a booked time where there is one. Naming a montage then offers the
   name booked nearest when its jump began, and its email is addressed already (RULES, The booking
   list). */
/* the footer's button lives outside the form element, and this is how it still submits it */
const FORM_ID = 'booking-list'

const listSchema = z.object({ csv: z.string().trim().min(1) })

const BookingListDialog = ({ onClose }: { onClose: () => void }) => {
  const list = useBookingList()
  const [problem, setProblem] = useState<string | null>(null)
  const bringIn = async (body: { csv: string } | { list: [] }) => {
    const answer = await bringInBookings(body)
    setProblem(answer.error ?? null)
    if (!answer.error) form.setFieldValue(form.fields.csv, '')
  }
  const submit: SubmitFunction = async (target) => {
    const parsed = listSchema.safeParse(target)
    if (parsed.success) await bringIn({ csv: parsed.data.csv })
  }
  const form = useForm({ schema: listSchema, defaultValues: { csv: '' }, submit })
  const typed = String(form.getFieldValue(form.fields.csv) ?? '')
  return (
    <Modal
      label={t`Booking list`}
      title={t`The day’s bookings`}
      wide
      onClose={onClose}
      footer={
        <>
          {list.length > 0 && (
            <Mini onClick={() => void bringIn({ list: [] })}>{t`Clear the list`}</Mini>
          )}
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
          <Go
            type='submit'
            form={FORM_ID}
            disabled={typed.trim() === ''}>
            {list.length > 0 ? t`Replace the list` : t`Bring in the list`}
          </Go>
        </>
      }>
      <p className='m-0 text-[12.5px] text-ink-2'>
        {t`Paste the booking system’s export, or choose its CSV file: a name on each line — or first name and last name — and, where there is one, an email address and the time they are booked. Headings in English, French or German are understood.`}
      </p>
      <input
        type='file'
        accept='.csv,.txt,text/csv,text/plain'
        aria-label={t`A CSV file`}
        onChange={(e) => {
          const chosen = e.target.files?.[0]
          if (chosen) void chosen.text().then((text) => form.setFieldValue(form.fields.csv, text))
        }}
        className='text-[12px]'
      />
      <Form
        id={FORM_ID}
        value={form}>
        <FormField field={form.fields.csv}>
          {(control) => (
            <textarea
              {...control}
              aria-label={t`The list`}
              rows={6}
              placeholder={t`Time;First name;Last name;Email\n10:30;Luc;Favre;luc@example.com`}
              className={`w-full ${INPUT} font-mono text-[12px]`}
            />
          )}
        </FormField>
      </Form>
      {problem && <p className={ERROR}>{problem}</p>}
      {list.length > 0 && (
        <>
          <p className='m-0 text-[12.5px] font-semibold text-ink'>
            {plural(list.length, {
              one: '# booking on the list',
              other: '# bookings on the list'
            })}
          </p>
          <table className='w-full border-collapse text-[12.5px]'>
            <tbody>
              {list.map((b, i) => (
                <tr
                  key={`${b.name}:${i}`}
                  className='border-t border-line-2'>
                  <td className='py-1 pr-3 font-mono text-[12px] text-ink-2'>{b.time ?? '—'}</td>
                  <td className='py-1 pr-3 font-semibold'>{b.name}</td>
                  <td className='py-1 text-ink-2'>{b.email ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  )
}

export { BookingListDialog }
