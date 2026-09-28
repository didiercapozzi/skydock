import { z } from 'zod'
import {
  getOutputDir,
  parseBookingList,
  bookingListSchema,
  readBookingList,
  saveBookingList
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

/* The day's booking list, as it was last brought in (RULES, The booking list). */
const loader = () => Response.json({ list: readBookingList(getOutputDir()) })

/* A list arrives as the text of a CSV, read here, or as the list itself — an empty one clears it. */
const actionArgs = z.object({ csv: z.string().optional(), list: bookingListSchema.optional() })

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: ({ data, errors }) => {
    const list = data.csv !== undefined ? parseBookingList(data.csv) : (data.list ?? [])
    if (data.csv !== undefined && list.length === 0) {
      errors.addGlobalError('No name found in that list — is there a name on each line?')
      return errors.toResponse(422)
    }
    saveBookingList(getOutputDir(), list)
    return { list }
  }
})

export { action, actionArgs, loader }
