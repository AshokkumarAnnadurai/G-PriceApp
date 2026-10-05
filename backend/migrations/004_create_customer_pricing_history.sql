-- =============================================================================
-- Migration: Create customer_pricing_history table
-- Run this once on production before deploying the updated application.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_pricing_history (
  id                        SERIAL PRIMARY KEY,

  -- Batch reference
  batch_id                  INTEGER,
  batch_number              VARCHAR(50),

  -- Item identity
  item_code                 VARCHAR(100),
  casting_code              VARCHAR(100),
  item_description          VARCHAR(300),
  grade                     VARCHAR(100),
  group_name                VARCHAR(100),
  domestic_export           VARCHAR(20),

  -- Customer identity
  customer_code             VARCHAR(50),
  customer_name             VARCHAR(200),
  customer_approval_foundry VARCHAR(200),

  -- Casting weight (kg)
  old_cast_weight           NUMERIC(12, 4),
  new_cast_weight           NUMERIC(12, 4),

  -- Casting rate per kg
  old_cast_rate             NUMERIC(12, 4),
  new_cast_rate             NUMERIC(12, 4),

  -- Material component rates
  old_mmr_rate              NUMERIC(12, 4),
  new_mmr_rate              NUMERIC(12, 4),
  old_ro_rate               NUMERIC(12, 4),
  new_ro_rate               NUMERIC(12, 4),
  old_consumables           NUMERIC(12, 4),
  new_consumables           NUMERIC(12, 4),
  old_extra                 NUMERIC(12, 4),
  new_extra                 NUMERIC(12, 4),

  -- Add-on charges (snapshotted)
  process_machining         NUMERIC(12, 4)  DEFAULT 0,
  ohp                       NUMERIC(12, 4)  DEFAULT 0,
  packing                   NUMERIC(12, 4)  DEFAULT 0,
  trans_charges             NUMERIC(12, 4)  DEFAULT 0,
  rejection_cost            NUMERIC(12, 4)  DEFAULT 0,
  powder_coating            NUMERIC(12, 4)  DEFAULT 0,
  special_process           NUMERIC(12, 4)  DEFAULT 0,

  -- Price totals
  old_price                 NUMERIC(12, 4),
  new_price                 NUMERIC(12, 4),
  delta                     NUMERIC(12, 4),

  -- Validity period
  from_date                 DATE,
  to_date                   DATE,

  -- Audit
  updated_by                VARCHAR(100),
  created_at                TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cph_casting_code   ON customer_pricing_history (casting_code);
CREATE INDEX IF NOT EXISTS idx_cph_customer_code  ON customer_pricing_history (customer_code);
CREATE INDEX IF NOT EXISTS idx_cph_batch_id       ON customer_pricing_history (batch_id);
CREATE INDEX IF NOT EXISTS idx_cph_created_at     ON customer_pricing_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cph_from_to        ON customer_pricing_history (from_date, to_date);

-- =============================================================================
-- End of migration
-- =============================================================================
