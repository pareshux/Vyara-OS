/**
 * Server-action capture wrapper — Blueprint PLAT-009.
 *
 * Opt-in wrapper for server actions. Adds an unconditional try/catch
 * around the action body and routes unexpected throws through
 * captureError() with a useful context payload. Returns are
 * pass-through — actions that already use the `{ error: '...' }`
 * result shape keep working unchanged.
 *
 * Use only at the BOUNDARY (the exported action function), not on
 * internal helpers. One capture per error is enough.
 *
 * Example:
 *
 *   export const checkIn = withCapture(
 *     'field-attendance.checkIn',
 *     async (params: CheckInParams) => {
 *       // ... existing implementation
 *     },
 *   )
 *
 * If the action knows its tenant/user (most do via getActorContext),
 * also pass the resolver — context gets attached to every capture
 * from inside this action.
 */
import { captureError, type CaptureContext } from './capture'

type ContextResolver<TArgs extends unknown[]> = (
  args: TArgs,
) => Promise<Omit<CaptureContext, 'action_name'>>

export function withCapture<TArgs extends unknown[], TReturn>(
  actionName: string,
  fn: (...args: TArgs) => Promise<TReturn>,
  resolveContext?: ContextResolver<TArgs>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args)
    } catch (err) {
      let context: CaptureContext = { action_name: actionName }
      if (resolveContext) {
        try {
          const resolved = await resolveContext(args)
          context = { ...resolved, action_name: actionName }
        } catch {
          // Context resolution failure shouldn't suppress the original
          // error capture. Continue with just the action name.
        }
      }
      captureError(err, context)
      throw err
    }
  }
}
