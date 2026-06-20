-- 0042_quotation_sent_to_contact.sql
-- Capability: Revenue
--
-- Tracks who a quotation was sent to as a proper FK, not a guess from context.
-- Populated when the user picks a contact on "Mark Sent".

ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS sent_to_contact_id UUID REFERENCES contact(id);

CREATE INDEX IF NOT EXISTS quotation_sent_to_contact_idx
  ON quotation (sent_to_contact_id)
  WHERE sent_to_contact_id IS NOT NULL;
