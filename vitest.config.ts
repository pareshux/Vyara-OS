import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/actions/orders.ts',
        'lib/actions/dispatches.ts',
        'lib/actions/invoices.ts',
        'lib/actions/collections.ts',
        'lib/actions/reservations.ts',
        'lib/auth/mask.ts',
        'lib/inngest/order-handlers.ts',
        'lib/inngest/collection-handlers.ts',
      ],
    },
  },
})
