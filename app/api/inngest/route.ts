import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { pavingStageCheck } from '@/lib/inngest/functions'
import { onQuoteWonCreateOrderTask } from '@/lib/inngest/order-handlers'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pavingStageCheck, onQuoteWonCreateOrderTask],
})
