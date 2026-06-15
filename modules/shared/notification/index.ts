/**
 * Notification engine — public API
 *
 * Driven by Inngest consumers listening to domain events.
 * Modules never call this directly — they emit events, which trigger notifications.
 * Direct calls allowed only for immediate in-app notifications.
 */

export type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'in_app';

export type NotificationPayload = {
  tenant_id: string;
  template: string;
  recipient_id: string;
  channels: NotificationChannel[];
  data: Record<string, unknown>;
};

// Placeholder — wired to Inngest in Phase 1
export async function sendNotification(_payload: NotificationPayload): Promise<void> {
  throw new Error('Notification engine not yet implemented');
}
