-- Migration: Add old rate component columns and additional details to pricing_batch_items
-- Run this script in your production database to update the schema.

ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_rate_per_kg NUMERIC(12,4);
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_coating NUMERIC(12,4);
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS rejection_cost NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS powder_coating NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS special_process NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS trans_charges NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS customer_approval_foundry VARCHAR(100);

-- Old rate component snapshots (added to support reviewing customer pricing updates correctly)
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_mmr NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_ro NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_consumables NUMERIC(12,4) DEFAULT 0;
ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_extra NUMERIC(12,4) DEFAULT 0;
