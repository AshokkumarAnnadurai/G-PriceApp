import path from 'path';
import * as XLSX from 'xlsx';
import { logger } from '../middleware/logger';
import { pool } from './pool';

// Idempotent column additions for tables that may pre-exist
const ALTER_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='bp_code') THEN
    ALTER TABLE vendors ADD COLUMN bp_code VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='coating') THEN
    ALTER TABLE item_master ADD COLUMN coating VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='machining') THEN
    ALTER TABLE item_master ADD COLUMN machining NUMERIC(12,4) NOT NULL DEFAULT 0;
  END IF;
  -- casting_code may not exist, or may exist as NOT NULL — ensure it's nullable
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='item_master' AND column_name='casting_code') THEN
    ALTER TABLE item_master ADD COLUMN casting_code VARCHAR(100);
  ELSE
    ALTER TABLE item_master ALTER COLUMN casting_code DROP NOT NULL;
  END IF;

  -- Drop single rate columns on vendors if they exist to clean up schema
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='mmr_rate') THEN
    ALTER TABLE vendors DROP COLUMN mmr_rate;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='ro_rate') THEN
    ALTER TABLE vendors DROP COLUMN ro_rate;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='consumables_rate') THEN
    ALTER TABLE vendors DROP COLUMN consumables_rate;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_log' AND column_name='old_rate') THEN
    ALTER TABLE price_log ADD COLUMN old_rate NUMERIC(12,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_log' AND column_name='new_rate') THEN
    ALTER TABLE price_log ADD COLUMN new_rate NUMERIC(12,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_log' AND column_name='batch_id') THEN
    ALTER TABLE price_log ADD COLUMN batch_id INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_batches' AND column_name='mmr_change') THEN
    ALTER TABLE pricing_batches ADD COLUMN mmr_change NUMERIC(12,4);
    ALTER TABLE pricing_batches ADD COLUMN coating_change NUMERIC(12,4);
    ALTER TABLE pricing_batches ADD COLUMN consumables_change NUMERIC(12,4);
    ALTER TABLE pricing_batches ADD COLUMN extra_change NUMERIC(12,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_materials' AND column_name='quarter_and_month') THEN
    ALTER TABLE vendor_materials ADD COLUMN quarter_and_month VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aargit_plp1' AND column_name='U_Cutting') THEN
    ALTER TABLE "aargit_plp1" ADD COLUMN "U_CuttingWt" numeric;
    ALTER TABLE "aargit_plp1" ADD COLUMN "U_CuttingRate" numeric;
    ALTER TABLE "aargit_plp1" ADD COLUMN "U_Cutting" numeric;
  END IF;

  -- Performance B-tree & Functional Indexes
  CREATE INDEX IF NOT EXISTS idx_cph_cust_cast ON customer_pricing_history (customer_code, casting_code, item_code);
  CREATE INDEX IF NOT EXISTS idx_cph_created_at ON customer_pricing_history (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pbi_batch_status ON pricing_batch_items (batch_id, status);
  CREATE INDEX IF NOT EXISTS idx_vm_vendor_item ON vendor_materials (vendor_id, item_code, casting_code);
END
$$;
`;

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------
const MIGRATION_SQL = `

-- Vendor materials/grades (one row per grade/material per vendor)
CREATE TABLE IF NOT EXISTS vendor_materials (
  id               SERIAL PRIMARY KEY,
  vendor_id        INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  grade            VARCHAR(100) NOT NULL,
  mmr_rate         NUMERIC(12,4) NOT NULL DEFAULT 0,
  ro_rate          NUMERIC(12,4) NOT NULL DEFAULT 0,
  consumables_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  extra_factor     NUMERIC(12,4) NOT NULL DEFAULT 0,
  quarter_and_month VARCHAR(50),
  customer_name    VARCHAR(150) NOT NULL DEFAULT 'All',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, grade, customer_name)
);


-- Pricing batches
CREATE TABLE IF NOT EXISTS pricing_batches (
  id           SERIAL PRIMARY KEY,
  batch_number VARCHAR(50)  NOT NULL UNIQUE,
  description  TEXT         NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending','approved','rejected')),
  grade        VARCHAR(50),
  vendor_id    INT REFERENCES vendors(id),
  updated_mmr              NUMERIC(12,4),
  updated_coating_rate     NUMERIC(12,4),
  updated_consumables_rate NUMERIC(12,4),
  updated_extra_factor     NUMERIC(12,4),
  from_date    DATE,
  to_date      DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);

-- Batch items (snapshot at time of batch)
CREATE TABLE IF NOT EXISTS pricing_batch_items (
  id               SERIAL PRIMARY KEY,
  batch_id         INT NOT NULL REFERENCES pricing_batches(id) ON DELETE CASCADE,
  item_master_id   INT NOT NULL REFERENCES item_master(id),
  casting_code     VARCHAR(100) NOT NULL,
  item_code        VARCHAR(100) NOT NULL,
  customer_name    VARCHAR(200) NOT NULL,
  rm_weight        NUMERIC(12,4) NOT NULL,
  rm_cost          NUMERIC(12,4) NOT NULL,
  machining        NUMERIC(12,4) NOT NULL DEFAULT 0,
  subcon           NUMERIC(12,4) NOT NULL DEFAULT 0,
  overhead_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,
  packing          NUMERIC(12,4) NOT NULL DEFAULT 0,
  old_price        NUMERIC(12,4) NOT NULL,
  new_price        NUMERIC(12,4) NOT NULL,
  delta            NUMERIC(12,4) NOT NULL,
  customer_rm_weight   NUMERIC(12,4) NOT NULL DEFAULT 0,
  customer_rate_per_kg NUMERIC(12,4) NOT NULL DEFAULT 0,
  customer_rm_price    NUMERIC(12,4) NOT NULL DEFAULT 0,
  customer_total_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  customer_delta       NUMERIC(12,4) NOT NULL DEFAULT 0
);

-- Price log (approved batches history)
CREATE TABLE IF NOT EXISTS item_price_history (
  id               SERIAL PRIMARY KEY,
  casting_code     VARCHAR(100) NOT NULL,
  item_code        VARCHAR(100) NOT NULL,
  customer_name    VARCHAR(200) NOT NULL,
  vendor_id        VARCHAR(50),
  batch_number     VARCHAR(50) NOT NULL,
  batch_id         INT,
  from_date        DATE,
  to_date          DATE,
  updated_by       VARCHAR(100),

  old_mmr          NUMERIC(12,4),
  new_mmr          NUMERIC(12,4),
  old_coating      NUMERIC(12,4),
  new_coating      NUMERIC(12,4),
  old_consumables  NUMERIC(12,4),
  new_consumables  NUMERIC(12,4),
  old_extra        NUMERIC(12,4),
  new_extra        NUMERIC(12,4),
  
  old_rate_per_kg  NUMERIC(12,4),
  new_rate_per_kg  NUMERIC(12,4),
  
  old_price        NUMERIC(12,4) NOT NULL,
  new_price        NUMERIC(12,4) NOT NULL,
  delta            NUMERIC(12,4) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_item_master_grade    ON item_master(grade);
CREATE INDEX IF NOT EXISTS idx_item_master_vendor   ON item_master(vendor_id);
CREATE INDEX IF NOT EXISTS idx_item_master_customer ON item_master(customer_name);
CREATE INDEX IF NOT EXISTS idx_batch_status         ON pricing_batches(status);
CREATE INDEX IF NOT EXISTS idx_item_price_hist_casting ON item_price_history(casting_code);
CREATE INDEX IF NOT EXISTS idx_item_price_hist_item    ON item_price_history(item_code);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RESOURCES = path.join(__dirname, '..', '..', 'resources');

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Read all rows of a sheet as array-of-arrays */
function readSheet(file: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${path.basename(file)}`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
}

// ---------------------------------------------------------------------------
// Seed: Master sheet → vendors
// ---------------------------------------------------------------------------
interface VendorRow {
  name: string;
  bp_code: string;
}

function parseVendors(rmFile: string): VendorRow[] {
  const wb = XLSX.readFile(rmFile);
  const masterSheetName = wb.SheetNames.find(n => n.trim() === 'Master');
  if (!masterSheetName) throw new Error('Master sheet not found in RM file');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[masterSheetName], {
    header: 1,
    defval: null,
  });

  const vendors: VendorRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const name = toStr(row[0]);
    const bpCode = toStr(row[1]);
    if (!name) continue;
    vendors.push({ name, bp_code: bpCode });
  }
  return vendors;
}

// ---------------------------------------------------------------------------
// Seed: Vendor sheets → item_master (RM Master file)
// ---------------------------------------------------------------------------
interface ItemRow {
  item_code: string;
  customer_name: string;
  description: string;
  grade: string;
  coating: string;
  weight: number;
  rate_per_kg: number;
  current_price: number;
  vendor_name: string;
}

function parseRmVendorSheet(
  wb: XLSX.WorkBook,
  sheetName: string
): { items: ItemRow[]; skipped: number } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
  }) as unknown[][];

  const headerRow = rows[2] as unknown[];
  if (!headerRow || headerRow.length === 0) return { items: [], skipped: 0 };

  const colIndices: {
    foreignName: number;
    itemCode: number;
    description: number;
    grade: number;
    coating: number;
  } = { foreignName: -1, itemCode: -1, description: -1, grade: -1, coating: -1 };

  const ratePricePairs: Array<{ rateIdx: number; priceIdx: number; weightIdx: number }> = [];

  headerRow.forEach((cell, colIdx) => {
    const h = toStr(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (colIndices.foreignName === -1 && h === 'foreign name') colIndices.foreignName = colIdx;
    if (colIndices.itemCode === -1 && (h === 'item no.' || h === 'sap rm code')) colIndices.itemCode = colIdx;
    if (colIndices.description === -1 && h === 'item description') colIndices.description = colIdx;
    if (colIndices.grade === -1 && h === 'grade') colIndices.grade = colIdx;
    if (colIndices.coating === -1 && (h === 'coating' || h === 'coating ')) colIndices.coating = colIdx;
  });

  for (let c = 0; c < headerRow.length; c++) {
    const h = toStr(headerRow[c]).toLowerCase().replace(/\s+/g, ' ').trim();
    if (h === 'revised rate/kg') {
      const rateIdx = c;
      const priceH = toStr(headerRow[c + 1]).toLowerCase().replace(/\s+/g, ' ').trim();
      if (priceH.startsWith('revised price')) {
        const weightIdx = c - 1;
        ratePricePairs.push({ rateIdx, priceIdx: c + 1, weightIdx });
      }
    }
  }

  const items: ItemRow[] = [];
  let skipped = 0;

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.every(v => v === null)) continue;

    const itemCode = toStr(
      colIndices.itemCode !== -1 ? row[colIndices.itemCode] : null
    );
    if (!itemCode) { skipped++; continue; }

    let ratePerKg = 0;
    let currentPrice = 0;
    let weight = 0;
    for (let p = ratePricePairs.length - 1; p >= 0; p--) {
      const { rateIdx, priceIdx, weightIdx } = ratePricePairs[p];
      const r_rate = toNum(row[rateIdx]);
      const r_price = toNum(row[priceIdx]);
      if (r_rate !== null && r_price !== null) {
        ratePerKg = r_rate;
        currentPrice = r_price;
        const w = toNum(row[weightIdx]);
        if (w !== null) weight = w;
        break;
      }
    }

    if (weight === 0 && ratePricePairs.length > 0) {
      const w = toNum(row[ratePricePairs[0].weightIdx]);
      if (w !== null) weight = w;
    }

    items.push({
      item_code: itemCode,
      customer_name: colIndices.foreignName !== -1 ? toStr(row[colIndices.foreignName]) : '',
      description: colIndices.description !== -1 ? toStr(row[colIndices.description]) : '',
      grade: colIndices.grade !== -1 ? toStr(row[colIndices.grade]) : '',
      coating: colIndices.coating !== -1 ? toStr(row[colIndices.coating]) : '',
      weight,
      rate_per_kg: ratePerKg,
      current_price: currentPrice,
      vendor_name: sheetName.trim(),
    });
  }

  return { items, skipped };
}

// ---------------------------------------------------------------------------
// Seed: GK-Veesa sheet → item_master
// ---------------------------------------------------------------------------
function parseGkVeesa(gkFile: string): { items: ItemRow[]; skipped: number } {
  const wb = XLSX.readFile(gkFile);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
  }) as unknown[][];

  const headerRow = rows[3] as unknown[];
  if (!headerRow) return { items: [], skipped: 0 };

  let colPartCode = -1, colDescription = -1, colCastingCode = -1, colGrade = -1;
  let colWt = -1, colPowderCoating = -1;
  let colMachining = -1, colCurrentPrice = -1, colCurrentRateKg = -1;

  const revPriceColIndices: number[] = [];
  const revRateColIndices: number[] = [];

  headerRow.forEach((cell, colIdx) => {
    const h = toStr(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (colPartCode === -1 && h === 'part code') colPartCode = colIdx;
    if (colDescription === -1 && h === 'description') colDescription = colIdx;
    if (colCastingCode === -1 && h === 'casting code') colCastingCode = colIdx;
    if (colGrade === -1 && h === 'grade') colGrade = colIdx;
    if (colWt === -1 && h === 'wt') colWt = colIdx;
    if (colPowderCoating === -1 && h === 'powder coating') colPowderCoating = colIdx;
    if (colMachining === -1 && h === 'machining price') colMachining = colIdx;
    if (colCurrentPrice === -1 && h === 'current price') colCurrentPrice = colIdx;
    if (colCurrentRateKg === -1 && h === 'current rate/kg') colCurrentRateKg = colIdx;
    if (h.startsWith('rev price w.e.f')) revPriceColIndices.push(colIdx);
    if (h === 'revised rate/kg') revRateColIndices.push(colIdx);
  });

  const items: ItemRow[] = [];
  let skipped = 0;

  for (let r = 4; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.every(v => v === null)) continue;

    const itemCode = colPartCode !== -1 ? toStr(row[colPartCode]) : '';
    if (!itemCode) { skipped++; continue; }

    const weight = colWt !== -1 ? (toNum(row[colWt]) ?? 0) : 0;
    if (!weight) { skipped++; continue; }

    let currentPrice = colCurrentPrice !== -1 ? (toNum(row[colCurrentPrice]) ?? 0) : 0;
    let ratePerKg = colCurrentRateKg !== -1 ? (toNum(row[colCurrentRateKg]) ?? 0) : 0;

    for (let p = revPriceColIndices.length - 1; p >= 0; p--) {
      const revPrice = toNum(row[revPriceColIndices[p]]);
      if (revPrice !== null) {
        currentPrice = revPrice;
        if (revRateColIndices[p] !== undefined) {
          const revRate = toNum(row[revRateColIndices[p]]);
          if (revRate !== null) ratePerKg = revRate;
        }
        break;
      }
    }

    items.push({
      item_code: itemCode,
      customer_name: '',
      description: colDescription !== -1 ? toStr(row[colDescription]) : '',
      grade: colGrade !== -1 ? toStr(row[colGrade]) : '',
      coating: colPowderCoating !== -1 ? toStr(row[colPowderCoating]) : '',
      weight,
      rate_per_kg: ratePerKg,
      current_price: currentPrice,
      vendor_name: 'Veesaa Foundry',
      ...(colCastingCode !== -1 ? { casting_code: toStr(row[colCastingCode]) } : {}),
      machining: colMachining !== -1 ? (toNum(row[colMachining]) ?? 0) : 0,
    } as ItemRow & { casting_code?: string; machining?: number });
  }

  return { items, skipped };
}

// ---------------------------------------------------------------------------
// Main migrate
// ---------------------------------------------------------------------------
async function migrate() {
  logger.info('Running database migrations...');

  const client = await pool.connect();
  try {
    // 1. DDL
    await client.query(MIGRATION_SQL);
    await client.query(ALTER_SQL);
    logger.info('Schema created / verified.');

    // 2. Parse Excel files
    const rmFile = path.join(RESOURCES, 'RM Master Price List.xlsx');
    const gkFile = path.join(RESOURCES, "Veesa_GK Price list I&A_July'25.xlsx");

    logger.info('Parsing RM Master Price List.xlsx...');
    const vendorRows = parseVendors(rmFile);
    logger.info(`  → ${vendorRows.length} vendors found in Master sheet`);

    const rmWb = XLSX.readFile(rmFile);
    const vendorSheets = rmWb.SheetNames.filter(n => n.trim() !== 'Master');

    let totalRmItems = 0;
    let totalRmSkipped = 0;
    const allRmItems: (ItemRow & { casting_code?: string; machining?: number })[] = [];

    for (const sheetName of vendorSheets) {
      const { items, skipped } = parseRmVendorSheet(rmWb, sheetName);
      totalRmItems += items.length;
      totalRmSkipped += skipped;
      allRmItems.push(...(items as (ItemRow & { casting_code?: string; machining?: number })[]));
    }
    logger.info(`  → RM items parsed: ${totalRmItems}, skipped: ${totalRmSkipped}`);

    logger.info('Parsing GK-Veesa price list...');
    const { items: gkItems, skipped: gkSkipped } = parseGkVeesa(gkFile);
    logger.info(`  → GK-Veesa items parsed: ${gkItems.length}, skipped: ${gkSkipped}`);

    // Collect unique vendor material rates from items
    const vendorMaterialsMap = new Map<string, {
      mmrRate: number;
      roRate: number;
      consumablesRate: number;
      extraFactor: number;
    }>();

    const addMaterialRate = (vName: string, grade: string, rate: number, ro = 0, cons = 0, extra = 0) => {
      const g = grade.trim();
      const v = vName.trim();
      if (!g || !v) return;
      const key = `${v}|||${g}`;
      
      let defaultRo = ro;
      let defaultCons = cons;
      let defaultExtra = extra;
      
      if (v.toLowerCase().includes('veesaa')) {
        defaultCons = 1.50; // consumables per kg
        defaultExtra = 2.00;
      } else if (v.toLowerCase().includes('aggni')) {
        defaultCons = 1.45;
        defaultExtra = 2.50;
      } else if (v.toLowerCase().includes('maxwell')) {
        defaultCons = 1.65;
        defaultExtra = 3.00;
      } else if (v.toLowerCase().includes('rangasayee')) {
        defaultCons = 1.75;
        defaultExtra = 3.50;
      } else if (v.toLowerCase().includes('bindhu')) {
        defaultCons = 1.40;
        defaultExtra = 2.50;
      } else if (v.toLowerCase().includes('classic')) {
        defaultCons = 1.45;
        defaultExtra = 2.60;
      } else if (v.toLowerCase().includes('mahendra')) {
        defaultCons = 1.42;
        defaultExtra = 2.55;
      }

      if (!vendorMaterialsMap.has(key)) {
        vendorMaterialsMap.set(key, {
          mmrRate: rate,
          roRate: defaultRo,
          consumablesRate: defaultCons,
          extraFactor: defaultExtra
        });
      } else {
        const existing = vendorMaterialsMap.get(key)!;
        if (rate > 0 && (existing.mmrRate === 0 || rate < existing.mmrRate)) {
          existing.mmrRate = rate;
        }
      }
    };

    // Extract from all RM items
    for (const item of allRmItems) {
      addMaterialRate(item.vendor_name, item.grade, item.rate_per_kg);
    }

    // Extract from Veesaa items
    for (const item of gkItems) {
      addMaterialRate('Veesaa Foundry', item.grade, item.rate_per_kg, 0, 1.50, 2.00);
    }

    // 3. All inserts in a single transaction
    await client.query('BEGIN');

    // 3a. Insert vendors
    let vendorsInserted = 0;
    let vendorsUpdated = 0;
    for (const v of vendorRows) {
      const res = await client.query(
        `INSERT INTO vendors (name, bp_code)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET bp_code = EXCLUDED.bp_code, updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [v.name, v.bp_code || null]
      );
      if (res.rows[0]?.inserted) vendorsInserted++;
      else vendorsUpdated++;
    }

    // Ensure GK vendor exists
    await client.query(
      `INSERT INTO vendors (name) VALUES ('Veesaa Foundry')
       ON CONFLICT (name) DO NOTHING`
    );
    logger.info(`  → Vendors: ${vendorsInserted} inserted, ${vendorsUpdated} updated`);

    // Build vendor name → id map
    const vendorMapRes = await client.query<{ id: number; name: string }>(
      'SELECT id, name FROM vendors'
    );
    const vendorMap = new Map<string, number>();
    for (const row of vendorMapRes.rows) vendorMap.set(row.name.trim(), row.id);

    // 3b. Insert vendor materials
    let materialsInserted = 0;
    for (const [key, val] of vendorMaterialsMap.entries()) {
      const [vName, grade] = key.split('|||');
      const vendorId = vendorMap.get(vName) ?? null;
      if (!vendorId) continue;

      await client.query(
        `INSERT INTO vendor_materials (vendor_id, grade, mmr_rate, ro_rate, consumables_rate, extra_factor)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (vendor_id, grade) DO UPDATE SET
           mmr_rate = EXCLUDED.mmr_rate,
           ro_rate = EXCLUDED.ro_rate,
           consumables_rate = EXCLUDED.consumables_rate,
           extra_factor = EXCLUDED.extra_factor,
           updated_at = NOW()`,
        [vendorId, grade, val.mmrRate, val.roRate, val.consumablesRate, val.extraFactor]
      );
      materialsInserted++;
    }
    logger.info(`  → Vendor materials: ${materialsInserted} inserted/updated`);

    // 3c. Insert RM items
    let rmInserted = 0;
    let rmUpdated = 0;
    for (const item of allRmItems) {
      const vendorId = vendorMap.get(item.vendor_name) ?? null;
      const res = await client.query(
        `INSERT INTO item_master
           (item_code, customer_name, description, grade, coating, weight,
            rate_per_kg, current_price, vendor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (item_code) DO UPDATE SET
           customer_name = EXCLUDED.customer_name,
           description   = EXCLUDED.description,
           grade         = EXCLUDED.grade,
           coating       = EXCLUDED.coating,
           weight        = EXCLUDED.weight,
           rate_per_kg   = EXCLUDED.rate_per_kg,
           current_price = EXCLUDED.current_price,
           vendor_id     = EXCLUDED.vendor_id
         RETURNING (xmax = 0) AS inserted`,
        [
          item.item_code,
          item.customer_name,
          item.description,
          item.grade,
          item.coating || null,
          item.weight,
          item.rate_per_kg,
          item.current_price,
          vendorId,
        ]
      );
      if (res.rows[0]?.inserted) rmInserted++;
      else rmUpdated++;
    }
    logger.info(`  → RM items: ${rmInserted} inserted, ${rmUpdated} updated`);

    // 3d. Insert GK-Veesa items
    const veesaId = vendorMap.get('Veesaa Foundry') ?? null;
    let gkInserted = 0;
    let gkUpdated = 0;
    for (const item of gkItems as (ItemRow & { casting_code?: string; machining?: number })[]) {
      const res = await client.query(
        `INSERT INTO item_master
           (casting_code, item_code, customer_name, description, grade, coating,
            machining, weight, rate_per_kg, current_price, vendor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (item_code) DO UPDATE SET
           casting_code  = COALESCE(EXCLUDED.casting_code, item_master.casting_code),
           description   = EXCLUDED.description,
           grade         = EXCLUDED.grade,
           coating       = EXCLUDED.coating,
           machining     = EXCLUDED.machining,
           weight        = EXCLUDED.weight,
           rate_per_kg   = EXCLUDED.rate_per_kg,
           current_price = EXCLUDED.current_price,
           vendor_id     = EXCLUDED.vendor_id
         RETURNING (xmax = 0) AS inserted`,
        [
          item.casting_code ?? null,
          item.item_code,
          item.customer_name,
          item.description,
          item.grade,
          item.coating || null,
          item.machining ?? 0,
          item.weight,
          item.rate_per_kg,
          item.current_price,
          veesaId,
        ]
      );
      if (res.rows[0]?.inserted) gkInserted++;
      else gkUpdated++;
    }
    logger.info(`  → GK-Veesa items: ${gkInserted} inserted, ${gkUpdated} updated`);

    // Safety: ensure RM items never have casting_code = item_code (they don't have a separate casting code)
    await client.query(`
      UPDATE item_master SET casting_code = NULL
      WHERE casting_code IS NOT NULL AND casting_code = item_code
    `);

    // 3e. Cross-reference: backfill customer_name on GK items.
    //     GK items: item_code = part code (e.g. "614305027"), casting_code = RM code (e.g. "914305027")
    //     RM items: item_code = SAP Rm Code (e.g. "914305027"), casting_code = NULL
    //     Match gk.casting_code = rm.item_code to inherit customer_name.
    const xrefRes = await client.query(`
      UPDATE item_master gk
      SET customer_name = rm.customer_name
      FROM item_master rm
      WHERE gk.customer_name = ''
        AND rm.customer_name != ''
        AND gk.casting_code IS NOT NULL
        AND gk.casting_code = rm.item_code
        AND gk.id != rm.id
    `);
    logger.info(`  → Cross-ref customer backfill: ${xrefRes.rowCount} GK items updated`);

    await client.query('COMMIT');

    logger.info('─────────────────────────────────────────');
    logger.info('Seed summary:');
    logger.info(`  Vendors  : ${vendorsInserted} new, ${vendorsUpdated} updated`);
    logger.info(`  Materials: ${materialsInserted} created/updated`);
    logger.info(`  RM items : ${rmInserted} new, ${rmUpdated} updated  (${totalRmSkipped} skipped)`);
    logger.info(`  GK items : ${gkInserted} new, ${gkUpdated} updated  (${gkSkipped} skipped)`);
    logger.info('Migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Migration failed — rolled back', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
