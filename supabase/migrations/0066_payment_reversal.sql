-- ============================================================
-- 0066_payment_reversal.sql — Payment reversal columns (P3β)
--
-- Blueprint: FIN-022 reversal flow.
--
-- Cheque bounce, NEFT failure, vendor refund — all real Indian B2B
-- scenarios. Posted payments can't be deleted (audit), but they can
-- be reversed via a separate state: posted → reversed.
--
-- Schema additions to vendor_payment:
--   - status CHECK extended to admit 'reversed'
--   - reversed_at TIMESTAMPTZ
--   - reversed_by UUID FK user_profile
--   - reversal_reason TEXT (required when reversing)
--
-- Reversal action (lib/actions/vendor-payments.ts):
--   1. Validate status='posted' + collect allocations
--   2. Flip status posted → reversed; stamp reversed_at + _by + reason
--   3. For each allocation:
--        bill.amount_paid    -= allocated_amount
--        bill.amount_outstanding = bill.total - bill.amount_paid
--        bill.status = (
--          paid          if amount_outstanding <= 0,
--          partly_paid   if amount_paid > 0,
--          approved      if amount_paid = 0
--        )
--   Concurrent payments (between this payment's post and reversal)
--   are handled: amount_paid is decremented from current state, not
--   from a stale snapshot, so bills already further-paid by other
--   payments stay correct.
-- ============================================================

ALTER TABLE vendor_payment
  DROP CONSTRAINT IF EXISTS vendor_payment_status_check;

ALTER TABLE vendor_payment
  ADD CONSTRAINT vendor_payment_status_check
    CHECK (status IN ('draft', 'posted', 'reversed', 'cancelled'));

ALTER TABLE vendor_payment
  ADD COLUMN IF NOT EXISTS reversed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by      UUID REFERENCES user_profile(id),
  ADD COLUMN IF NOT EXISTS reversal_reason  TEXT;

COMMENT ON COLUMN vendor_payment.reversal_reason IS
  'Required when reversing. Common values: cheque_bounce, neft_failed, vendor_refund, accounting_correction.';

-- Index for the reversed-set query (when we eventually surface a
-- "recent reversals" widget — not built yet, but cheap to add now).
CREATE INDEX IF NOT EXISTS vp_reversed_idx
  ON vendor_payment (tenant_id, reversed_at DESC)
  WHERE status = 'reversed' AND deleted_at IS NULL;
