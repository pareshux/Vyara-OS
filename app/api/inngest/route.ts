import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { pavingStageCheck, staleSampleCheck } from '@/lib/inngest/functions'
import { onQuoteWonCreateOrderTask } from '@/lib/inngest/order-handlers'
import { onOrderCreatedScheduleDispatchTask } from '@/lib/inngest/dispatch-handlers'
import {
  onInvoiceSyncedCreateCollection,
  dailyCollectionCheck,
} from '@/lib/inngest/collection-handlers'
import {
  onDispatchCompletedConsumeReservation,
  inventoryDailyCheck,
} from '@/lib/inngest/inventory-handlers'
import { dailyDigestCron } from '@/lib/inngest/daily-digest-cron'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    pavingStageCheck,
    staleSampleCheck,
    onQuoteWonCreateOrderTask,
    onOrderCreatedScheduleDispatchTask,
    onInvoiceSyncedCreateCollection,
    dailyCollectionCheck,
    onDispatchCompletedConsumeReservation,
    inventoryDailyCheck,
    dailyDigestCron,
  ],
})
