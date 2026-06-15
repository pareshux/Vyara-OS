import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { pavingStageCheck } from '@/lib/inngest/functions'
import { onQuoteWonCreateOrderTask } from '@/lib/inngest/order-handlers'
import { onOrderCreatedScheduleDispatchTask } from '@/lib/inngest/dispatch-handlers'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    pavingStageCheck,
    onQuoteWonCreateOrderTask,
    onOrderCreatedScheduleDispatchTask,
  ],
})
