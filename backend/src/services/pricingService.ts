import { BATCH_STATUS } from '../constants';
import { addVendorGroupInfo } from '../db/add_vendor_group_info';
import { pool,query,queryOne } from '../db/pool';
import { getSapClient } from './sapSyncService';
import { logger } from '../middleware/logger';
import {
  CreateBatchBody,
  ItemPriceHistory,ItemPriceHistoryRow,
  PricingBatch,
  PricingBatchItem,PricingBatchItemRow,
  PricingBatchRow
} from '../types';

function toLocalDateString(val: string | Date): string {
  const d = new Date(val);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Mappers ───────────────────────────────────────────────────────────────────
function mapBatch(row: PricingBatchRow): PricingBatch {
  return {
    id: row.id,
    batchNumber: row.batch_number,
    description: row.description,
    status: row.status,
    grade: row.grade,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    customerName: (row as any).customer_name,
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    updatedMmr: row.updated_mmr !== null && row.updated_mmr !== undefined ? Number(row.updated_mmr) : undefined,
    updatedCoatingRate: row.updated_coating_rate !== null && row.updated_coating_rate !== undefined ? Number(row.updated_coating_rate) : undefined,
    updatedConsumablesRate: row.updated_consumables_rate !== null && row.updated_consumables_rate !== undefined ? Number(row.updated_consumables_rate) : undefined,
    updatedExtraFactor: row.updated_extra_factor !== null && row.updated_extra_factor !== undefined ? Number(row.updated_extra_factor) : undefined,
    mmrChange: (row as any).mmr_change !== null && (row as any).mmr_change !== undefined ? Number((row as any).mmr_change) : undefined,
    roChange: (row as any).coating_change !== null && (row as any).coating_change !== undefined ? Number((row as any).coating_change) : undefined,
    consChange: (row as any).consumables_change !== null && (row as any).consumables_change !== undefined ? Number((row as any).consumables_change) : undefined,
    extraChange: (row as any).extra_change !== null && (row as any).extra_change !== undefined ? Number((row as any).extra_change) : undefined,
    fromDate: row.from_date ? toLocalDateString(row.from_date) : undefined,
    toDate: row.to_date ? toLocalDateString(row.to_date) : undefined,
  };
}

function mapBatchItem(row: PricingBatchItemRow): PricingBatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    itemMasterId: row.item_master_id,
    castingCode: row.casting_code,
    itemCode: row.item_code,
    customerName: row.customer_name,
    rmWeight: Number(row.rm_weight),
    rmCost: Number(row.rm_cost),
    machining: Number(row.machining),
    subcon: Number(row.subcon),
    overheadPct: Number(row.overhead_pct),
    packing: Number(row.packing),
    oldPrice: Number(row.old_price),
    newPrice: Number(row.new_price),
    delta: Number(row.delta),
    customerRmWeight: Number(row.customer_rm_weight),
    customerRatePerKg: Number(row.customer_rate_per_kg),
    customerRmPrice: Number(row.customer_rm_price),
    customerTotalPrice: Number(row.customer_total_price),
    customerDelta: Number(row.customer_delta),
    oldRatePerKg: row.old_rate_per_kg !== undefined && row.old_rate_per_kg !== null ? Number(row.old_rate_per_kg) : undefined,
    oldCoating: row.old_coating !== undefined && row.old_coating !== null ? Number(row.old_coating) : undefined,
    customerApprovalFoundry: row.customer_approval_foundry || '—',
    oldMmr: row.old_mmr !== undefined && row.old_mmr !== null ? Number(row.old_mmr) : undefined,
    oldRo: row.old_ro !== undefined && row.old_ro !== null ? Number(row.old_ro) : undefined,
    oldConsumables: row.old_consumables !== undefined && row.old_consumables !== null ? Number(row.old_consumables) : undefined,
    oldExtra: row.old_extra !== undefined && row.old_extra !== null ? Number(row.old_extra) : undefined,
  };
}

// ── Pricing calc ─────────────────────────────────────────────────────────────
// Removed unused calcNewPrice

// ── Service functions ─────────────────────────────────────────────────────────
export async function listBatches(): Promise<PricingBatch[]> {
  const rows = await query<PricingBatchRow>(
    `SELECT 
       b.*,
       (SELECT ocrd.cardname FROM ocrd_sftp ocrd WHERE cardcode = b.vendor_id LIMIT 1) as vendor_name,
       (
         SELECT 
           CASE 
             WHEN COUNT(DISTINCT bi.customer_name) = 1 THEN MAX(bi.customer_name)
             WHEN COUNT(DISTINCT bi.customer_name) > 1 THEN 'Multiple Customers'
             ELSE 'All Customers'
           END
         FROM pricing_batch_items bi 
         WHERE bi.batch_id = b.id
       ) as customer_name,
       (SELECT COUNT(*) FROM pricing_batch_items pbi WHERE pbi.batch_id = b.id) AS item_count
     FROM pricing_batches b
     ORDER BY b.created_at DESC`
  );
  return rows.map(mapBatch);
}

export async function getBatchById(id: number): Promise<PricingBatch | null> {
  const row = await queryOne<PricingBatchRow>(
    `SELECT pb.*, v.cardname AS vendor_name,
            (
              SELECT 
                CASE 
                  WHEN COUNT(DISTINCT bi.customer_name) = 1 THEN MAX(bi.customer_name)
                  WHEN COUNT(DISTINCT bi.customer_name) > 1 THEN 'Multiple Customers'
                  ELSE 'All Customers'
                END
              FROM pricing_batch_items bi 
              WHERE bi.batch_id = pb.id
            ) as customer_name,
            (SELECT COUNT(*) FROM pricing_batch_items pbi WHERE pbi.batch_id = pb.id) AS item_count
     FROM pricing_batches pb
     LEFT JOIN ocrd_sftp v ON v.cardcode = pb.vendor_id
     WHERE pb.id = $1`, [id]
  );
  return row ? mapBatch(row) : null;
}

export async function getBatchItems(batchId: number): Promise<PricingBatchItem[]> {
  const rows = await query<PricingBatchItemRow>(
    'SELECT * FROM pricing_batch_items WHERE batch_id=$1 ORDER BY casting_code, item_code',
    [batchId]
  );
  return rows.map(mapBatchItem);
}

export async function createBatch(body: CreateBatchBody): Promise<PricingBatch> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate unique batch number (e.g. B-0001, B-0002)
    const maxBatchRes = await client.query<{ max_num: number | null }>(`
      SELECT MAX(
        CAST(SUBSTRING(batch_number FROM 'B-([0-9]+)') AS INTEGER)
      ) as max_num
      FROM pricing_batches
      WHERE batch_number ~ '^B-[0-9]+$'
    `);
    let nextNum = (maxBatchRes.rows[0]?.max_num || 0) + 1;
    let batchNum = `B-${String(nextNum).padStart(4, '0')}`;

    while (true) {
      const exists = await client.query('SELECT 1 FROM pricing_batches WHERE batch_number = $1', [batchNum]);
      if (exists.rowCount === 0) break;
      nextNum++;
      batchNum = `B-${String(nextNum).padStart(4, '0')}`;
    }

    const batchRow = await client.query<PricingBatchRow>(
      `INSERT INTO pricing_batches
         (batch_number, description, status, grade, vendor_id,
          updated_mmr, updated_coating_rate, updated_consumables_rate, updated_extra_factor,
          mmr_change, coating_change, consumables_change, extra_change,
          from_date, to_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        batchNum, body.description, body.status || BATCH_STATUS.DRAFT,
        body.grade ?? null, body.vendorId ?? null,
        body.updatedMmr ?? null, body.updatedCoatingRate ?? null,
        body.updatedConsumablesRate ?? null, body.updatedExtraFactor ?? null,
        body.mmrChange ?? null, body.roChange ?? null, body.consChange ?? null, body.extraChange ?? null,
        body.fromDate, body.toDate,
      ]
    );
    const batch = batchRow.rows[0];
    if (!batch) throw new Error('Failed to create batch');

    for (const rawItemId of body.itemMasterIds) {
      let itemId = rawItemId;
      if (rawItemId.includes('|')) {
        const parts = rawItemId.split('|');
        if (parts.length === 3) {
          itemId = parts[2]; // castingCode or itemCode
        }
      }
      const itemRes = await client.query<any>(
        `SELECT 
          TRIM(T1.itemcode) as id,
          TRIM(COALESCE(NULLIF(T1.u_castingcode, ''), T1.itemcode)) as casting_code,
          TRIM(T1.itemcode) as item_code,
          T1.u_grade as grade,
          T1.itmsgrpcod as group_code,
          T1.u_bought as bought_out,
          T1.u_domeexpo as dome_expo,
          COALESCE(NULLIF(TRIM(T1.frgnname), ''), TRIM(T1.u_cusfoudt)) as customer_name,
          TRIM(T1.u_cusfoudt) as customer_approval_foundry,
          COALESCE(NULLIF(NULLIF(REPLACE(TRIM(T1.u_rateperkg::text), ',', ''), '?'), '')::numeric, 0) as rate_per_kg,
          0 as weight,
          0 as coating,
          0 as machining,
          0 as current_price
         FROM oitm_sftp T1
         WHERE TRIM(T1.itemcode) = $1 OR TRIM(T1.u_castingcode) = $1
         LIMIT 1`, [itemId]
      );
      const item = itemRes.rows[0];
      if (!item) continue;

      let customerName = item.customer_name;
      let customerCode: string | null = null;
      let customerApprovalFoundry = item.customer_approval_foundry || '—';
      let resolvedCastingWeight: number | null = null;
      let resolvedCastingRate: number | null = null;
      let resolvedRejection: number | null = null;
      let resolvedPowderCoating: number | null = null;
      let resolvedSpecialProcess: number | null = null;
      let resolvedProcess: number | null = null;
      let resolvedTrans: number | null = null;
      let resolvedOhp: number | null = null;
      let resolvedPacking: number | null = null;
      let resolvedCoating: number | null = null;
      let resolvedMmr: number | null = null;
      let resolvedConsumables: number | null = null;
      let resolvedExtra: number | null = null;

      if (!body.vendorId && rawItemId.includes('|')) {
        const parts = rawItemId.split('|');
        if (parts.length === 3) {
          const custCode = parts[0].trim();
          customerCode = custCode;
          const castingCode = parts[1].trim();
          const itemCode = parts[2].trim();
          
          // Resolve customer name from OCRD for name-based fallback matching
          const cardRes = await client.query<{ CardName: string; CardFName: string }>(
            `SELECT TRIM(cardname) as "CardName", TRIM(cardfname) as "CardFName" FROM ocrd_sftp WHERE TRIM(cardcode) = $1 LIMIT 1`,
            [custCode]
          );
          const cardName = cardRes.rows[0]?.CardName || '';
          const cardFName = cardRes.rows[0]?.CardFName || '';

          // Update customerName to actual customer name instead of frgnname
          if (cardName) {
            customerName = cardName;
          }

          logger.debug('[createBatch] resolving customer details:', { custCode, cardName, cardFName, castingCode, itemCode, rawItemId });
          
          const custDetailsRes = await client.query<{ customer_name: string; customer_approval_foundry: string; casting_weight: string; casting_rate: string; rejection_cost: string; powder_coating: string; special_process: string; process_machining: string; trans_charges: string; OHP: string; packing: string; ro_rate: string; consumables_rate: string; mmr_rate: string; extra_factor: string }>(
            `WITH pld_latest AS (
               SELECT * FROM "argit_pld1"
               WHERE (LOWER(TRIM("U_CustCode")) = LOWER(TRIM($1)) OR ($4::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($5))) OR ($4::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($5))))
                 AND (LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')))
               ORDER BY 
                 (CASE 
                    WHEN LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR
                         LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) 
                    THEN 1 ELSE 2 
                  END) ASC,
                 "DocEntry"::bigint DESC
               LIMIT 1
             ),
             ple_latest AS (
               SELECT * FROM "aargit_ple1"
               WHERE (LOWER(TRIM("U_CustCode")) = LOWER(TRIM($1)) OR ($4::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($5))) OR ($4::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($5))))
                 AND (LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')))
               ORDER BY 
                 (CASE 
                    WHEN LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR
                         LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) 
                    THEN 1 ELSE 2 
                  END) ASC,
                 "DocEntry"::bigint DESC
               LIMIT 1
             ),
             plp_latest AS (
               SELECT * FROM "aargit_plp1"
               WHERE (LOWER(TRIM("U_CustCode")) = LOWER(TRIM($1)) OR ($4::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($5))) OR ($4::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($5))))
                 AND (LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')))
               ORDER BY 
                 (CASE 
                    WHEN LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR
                         LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) 
                    THEN 1 ELSE 2 
                  END) ASC,
                 "DocEntry"::bigint DESC
               LIMIT 1
             ),
             pll_latest AS (
               SELECT * FROM "argit_pll1"
               WHERE (LOWER(TRIM("U_CustCode")) = LOWER(TRIM($1)) OR ($4::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_CustName")) = LOWER(TRIM($5))) OR ($4::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($4))) OR ($5::text <> '' AND LOWER(TRIM("U_ForgName")) = LOWER(TRIM($5))))
                 AND (LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR LOWER(REPLACE(TRIM("U_CastCode"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')))
               ORDER BY 
                 (CASE 
                    WHEN LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR
                         LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($3), '-RM', '')) 
                    THEN 1 ELSE 2 
                  END) ASC,
                 "DocEntry"::bigint DESC
               LIMIT 1
             )
             SELECT 
              COALESCE(
                NULLIF(TRIM(pld."U_CustName"), ''), NULLIF(TRIM(pld."U_ForgName"), ''), 
                NULLIF(TRIM(ple."U_CustName"), ''), NULLIF(TRIM(ple."U_ForgName"), ''), 
                NULLIF(TRIM(plp."U_CustName"), ''), NULLIF(TRIM(plp."U_ForgName"), ''), 
                NULLIF(TRIM(pll."U_CustName"), ''), NULLIF(TRIM(pll."U_ForgName"), '')
              ) as customer_name,
              COALESCE(NULLIF(TRIM(pld."U_CusApprF"), ''), NULLIF(TRIM(ple."U_CusApprF"), ''), NULLIF(TRIM(plp."U_CusApprF"), ''), NULLIF(TRIM(pll."U_CusApprF"), '')) as customer_approval_foundry,
              COALESCE(pld."U_CastWt"::text, ple."U_CastWt"::text, plp."U_CastWt"::text, pll."U_CastWt"::text)::numeric as casting_weight,
              COALESCE(pld."U_CastRate"::text, ple."U_CastRate"::text, plp."U_CastRate"::text, pll."U_CastRate"::text)::numeric as casting_rate,
              COALESCE(pld."U_RejCost"::text, ple."U_RejCost"::text, plp."U_RejCost"::text, pll."U_RejCost"::text)::numeric as rejection_cost,
              COALESCE(pld."U_PowdCoat"::text, ple."U_PowdCoat"::text, plp."U_PowdCoat"::text, pll."U_PowdCoat"::text)::numeric as powder_coating,
              COALESCE(pld."U_SpecProc"::text, ple."U_SpecProc"::text, plp."U_SpecProc"::text, pll."U_SpecProc"::text)::numeric as special_process,
              COALESCE(pld."U_ProcMach"::text, ple."U_ProcMach"::text, plp."U_ProcMach"::text, pll."U_ProcMach"::text)::numeric as process_machining,
              COALESCE(pld."U_TranChar"::text, ple."U_TranChar"::text, plp."U_TranChar"::text, pll."U_TranChar"::text)::numeric as trans_charges,
              COALESCE(pld."U_OHP"::text, ple."U_OHP"::text, plp."U_OHP"::text, pll."U_OHP"::text)::numeric as OHP,
              COALESCE(pld."U_Packing"::text, ple."U_Packing"::text, plp."U_Packing"::text, pll."U_Packing"::text)::numeric as packing,
              COALESCE(pld."U_RoRate"::text, ple."U_RoRate"::text, plp."U_RoRate"::text)::numeric as ro_rate,
              COALESCE(pld."U_ConsRate"::text, ple."U_ConsRate"::text, plp."U_ConsRate"::text)::numeric as consumables_rate,
              COALESCE(pld."U_MmrRate"::text, ple."U_MmrRate"::text, plp."U_MmrRate"::text)::numeric as mmr_rate,
              COALESCE(pld."U_Extra"::text, ple."U_Extra"::text, plp."U_Extra"::text)::numeric as extra_factor
             FROM (SELECT 1) dummy
             LEFT JOIN pld_latest pld ON 1=1
             LEFT JOIN ple_latest ple ON 1=1
             LEFT JOIN plp_latest plp ON 1=1
             LEFT JOIN pll_latest pll ON 1=1
             LIMIT 1`,
            [custCode, castingCode, itemCode, cardName, cardFName]
          );
          logger.debug('[createBatch] query result:', custDetailsRes.rows[0]);
          if (custDetailsRes.rows[0]?.customer_name) {
            customerName = custDetailsRes.rows[0].customer_name;
          }
          if (custDetailsRes.rows[0]?.customer_approval_foundry) {
            customerApprovalFoundry = custDetailsRes.rows[0].customer_approval_foundry;
          }
          if (custDetailsRes.rows[0]?.casting_weight != null) {
            resolvedCastingWeight = Number(custDetailsRes.rows[0].casting_weight);
          }
          if (custDetailsRes.rows[0]?.casting_rate != null) {
            resolvedCastingRate = Number(custDetailsRes.rows[0].casting_rate);
          }
          if (custDetailsRes.rows[0]?.rejection_cost != null) {
            resolvedRejection = Number(custDetailsRes.rows[0].rejection_cost);
          }
          if (custDetailsRes.rows[0]?.powder_coating != null) {
            resolvedPowderCoating = Number(custDetailsRes.rows[0].powder_coating);
          }
          if (custDetailsRes.rows[0]?.special_process != null) {
            resolvedSpecialProcess = Number(custDetailsRes.rows[0].special_process);
          }
          if (custDetailsRes.rows[0]?.process_machining != null) {
            resolvedProcess = Number(custDetailsRes.rows[0].process_machining);
          }
          if (custDetailsRes.rows[0]?.trans_charges != null) {
            resolvedTrans = Number(custDetailsRes.rows[0].trans_charges);
          }
          if (custDetailsRes.rows[0]?.OHP != null) {
            resolvedOhp = Number(custDetailsRes.rows[0].OHP);
          }
          if (custDetailsRes.rows[0]?.packing != null) {
            resolvedPacking = Number(custDetailsRes.rows[0].packing);
          }
          if (custDetailsRes.rows[0]?.ro_rate != null) {
            resolvedCoating = Number(custDetailsRes.rows[0].ro_rate);
          }
          if (custDetailsRes.rows[0]?.mmr_rate != null) {
            resolvedMmr = Number(custDetailsRes.rows[0].mmr_rate);
          }
          if (custDetailsRes.rows[0]?.consumables_rate != null) {
            resolvedConsumables = Number(custDetailsRes.rows[0].consumables_rate);
          }
          if (custDetailsRes.rows[0]?.extra_factor != null) {
            resolvedExtra = Number(custDetailsRes.rows[0].extra_factor);
          }
        }
      }

      // Use the latest item-level approved rate if available, otherwise fall back to item_master
      const approvedRateRes = await client.query<{ customer_rate_per_kg: string; subcon: string }>(
        `SELECT pbi.customer_rate_per_kg, pbi.subcon
         FROM pricing_batch_items pbi
         JOIN pricing_batches pb ON pbi.batch_id = pb.id
         WHERE pbi.item_master_id = $1
           AND pb.status = 'approved'
           AND pbi.status = 'approved'
         ORDER BY pb.approved_at DESC
         LIMIT 1`,
        [item.id]
      );
      const approvedRateRow = approvedRateRes.rows[0];
      
      require('fs').appendFileSync('debug.log', `\n--- CREATE BATCH DEBUG ---\nVendor: ${body.vendorId}\nitem_master_id: ${item.item_master_id}\nitem_code: ${item.item_code}\ncasting_code: ${item.casting_code}\n`);
      // Try to find exact vendor material by item_code first, then fall back to casting code matching
      const vmRes = await client.query<{ customer_name: string; rm_weight: string; revised_rate_per_kg: string; mmr_rate: string; ro_rate: string; consumables_rate: string; extra_factor: string }>(
        `SELECT customer_name, rm_weight, revised_rate_per_kg, mmr_rate, ro_rate, consumables_rate, extra_factor 
         FROM vendor_materials 
         WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(item_code) = TRIM($2)
         LIMIT 1`,
         [body.vendorId, item.item_code]
      );
      let vmRow = vmRes.rows[0];
      if (!vmRow) {
        // Fall back to casting code mapping if exact item_code doesn't exist yet
        const vmFallbackRes = await client.query<{ customer_name: string; rm_weight: string; revised_rate_per_kg: string; mmr_rate: string; ro_rate: string; consumables_rate: string; extra_factor: string }>(
          `SELECT customer_name, rm_weight, revised_rate_per_kg, mmr_rate, ro_rate, consumables_rate, extra_factor 
           FROM vendor_materials 
           WHERE TRIM(vendor_id) = TRIM($1) 
             AND (TRIM(casting_code) = TRIM($2) OR TRIM(casting_code) = TRIM($3))
           LIMIT 1`,
          [body.vendorId, item.casting_code, item.item_master_id]
        );
        vmRow = vmFallbackRes.rows[0];
      }
      if (vmRow && vmRow.customer_name) {
        customerName = vmRow.customer_name;
      }
      require('fs').appendFileSync('debug.log', `vmRow found: ${JSON.stringify(vmRow)}\n`);

      let effectiveRatePerKg = Number(item.rate_per_kg);
      let effectiveWeight = Number(item.weight);
      let effectiveCoating = Number(item.coating || 0);

      let rejectionVal = 0;
      let powderCoatingVal = 0;
      let specialProcessVal = 0;
      let processVal = 0;
      let transVal = 0;
      let ohpVal = 0;
      let packingVal = 0;

      let mmrRateVal = 0;
      let roRateVal = 0;
      let consumablesRateVal = 0;
      let extraFactorVal = 0;

      const isCustomerMode = !body.vendorId;

      if (isCustomerMode) {
        effectiveWeight = resolvedCastingWeight ?? 0;
        effectiveRatePerKg = resolvedCastingRate ?? 0;
        rejectionVal = resolvedRejection ?? 0;
        powderCoatingVal = resolvedPowderCoating ?? 0;
        specialProcessVal = resolvedSpecialProcess ?? 0;
        processVal = resolvedProcess ?? 0;
        transVal = resolvedTrans ?? 0;
        ohpVal = resolvedOhp ?? 0;
        packingVal = resolvedPacking ?? 0;
        effectiveCoating = resolvedCoating ?? 0;
        mmrRateVal = resolvedMmr ?? 0;
        consumablesRateVal = resolvedConsumables ?? 0;
        extraFactorVal = resolvedExtra ?? 0;
      } else {
        if (vmRow && Number(vmRow.revised_rate_per_kg) > 0) {
          effectiveRatePerKg = Number(vmRow.revised_rate_per_kg);
        } else if (approvedRateRow) {
          effectiveRatePerKg = Number(approvedRateRow.customer_rate_per_kg);
        }

        if (vmRow && Number(vmRow.rm_weight) > 0) {
          effectiveWeight = Number(vmRow.rm_weight);
        }

        effectiveCoating = approvedRateRow ? Number(approvedRateRow.subcon) : Number(item.coating);
        mmrRateVal = Number(vmRow?.mmr_rate || 0);
        roRateVal = Number(vmRow?.ro_rate || 0);
        consumablesRateVal = Number(vmRow?.consumables_rate || 0);
        extraFactorVal = Number(vmRow?.extra_factor || 0);
        require('fs').appendFileSync('debug.log', `mmrRateVal=${mmrRateVal}, oldMmrVal=${isCustomerMode ? (resolvedMmr ?? 0) : mmrRateVal}\n`);


        const cleanCode = item.id.trim();
        const isLabour = ['125', '128'].includes(String(item.group_code || '')) || 
                         String(item.bought_out || '').trim() === 'Job Work';
        const isPin = ['116', '118'].includes(String(item.group_code || '')) || 
                      String(item.dome_expo || '').toUpperCase().includes('PIN BUSH') ||
                      String(item.dome_expo || '').toUpperCase().includes('PIN PUSH');

        if (isLabour) {
          const pll = await client.query(`SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing" FROM "argit_pll1" WHERE TRIM("U_ItemNo") = $1 LIMIT 1`, [cleanCode]);
          const pllRow = pll.rows[0];
          if (pllRow) {
            rejectionVal = Number(pllRow.U_RejCost || 0);
            powderCoatingVal = Number(pllRow.U_PowdCoat || 0);
            specialProcessVal = Number(pllRow.U_SpecProc || 0);
            processVal = Number(pllRow.U_ProcMach || 0);
            transVal = Number(pllRow.U_TranChar || 0);
            ohpVal = Number(pllRow.U_OHP || 0);
            packingVal = Number(pllRow.U_Packing || 0);
          }
        } else if (isPin) {
          const plp = await client.query(`SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing" FROM "aargit_plp1" WHERE TRIM("U_ItemNo") = $1 LIMIT 1`, [cleanCode]);
          const plpRow = plp.rows[0];
          if (plpRow) {
            rejectionVal = Number(plpRow.U_RejCost || 0);
            powderCoatingVal = Number(plpRow.U_PowdCoat || 0);
            specialProcessVal = Number(plpRow.U_SpecProc || 0);
            processVal = Number(plpRow.U_ProcMach || 0);
            transVal = Number(plpRow.U_TranChar || 0);
            ohpVal = Number(plpRow.U_OHP || 0);
            packingVal = Number(plpRow.U_Packing || 0);
          }
        } else {
          const ple = await client.query(`SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing" FROM "aargit_ple1" WHERE TRIM("U_ItemNo") = $1 LIMIT 1`, [cleanCode]);
          const pleRow = ple.rows[0];
          if (pleRow) {
            rejectionVal = Number(pleRow.U_RejCost || 0);
            powderCoatingVal = Number(pleRow.U_PowdCoat || 0);
            specialProcessVal = Number(pleRow.U_SpecProc || 0);
            processVal = Number(pleRow.U_ProcMach || 0);
            transVal = Number(pleRow.U_TranChar || 0);
            ohpVal = Number(pleRow.U_OHP || 0);
            packingVal = Number(pleRow.U_Packing || 0);
          }
        }
      }

      // Delta calculations
      const mmrChange = body.mmrChange ?? (body.updatedMmr !== undefined && body.updatedMmr !== null ? body.updatedMmr - mmrRateVal : 0);
      const roChange = body.roChange ?? (body.updatedCoatingRate !== undefined && body.updatedCoatingRate !== null ? body.updatedCoatingRate - (isCustomerMode ? effectiveCoating : roRateVal) : 0);
      const consChange = body.consChange ?? (body.updatedConsumablesRate !== undefined && body.updatedConsumablesRate !== null ? body.updatedConsumablesRate - consumablesRateVal : 0);
      const extraChange = body.extraChange ?? (body.updatedExtraFactor !== undefined && body.updatedExtraFactor !== null ? body.updatedExtraFactor - extraFactorVal : 0);

      const newRate = effectiveRatePerKg + mmrChange + roChange + consChange + extraChange;
      const newRmCost = effectiveWeight * newRate;
      const newCoatingCost = effectiveCoating + roChange;

      const oldRmCost = effectiveRatePerKg * effectiveWeight;
      const oldPrice = oldRmCost + processVal + ohpVal + packingVal + effectiveCoating + transVal + rejectionVal + powderCoatingVal + specialProcessVal;
      const newPrice = newRmCost + processVal + ohpVal + packingVal + newCoatingCost + transVal + (effectiveWeight * newRate * 0.05) + powderCoatingVal + specialProcessVal;
      const delta = newPrice - oldPrice;

      const oldMmrVal = isCustomerMode ? (resolvedMmr ?? 0) : mmrRateVal;
      const oldRoVal = isCustomerMode ? (resolvedCoating ?? 0) : roRateVal;
      const oldConsVal = isCustomerMode ? (resolvedConsumables ?? 0) : consumablesRateVal;
      const oldExtraVal = isCustomerMode ? (resolvedExtra ?? 0) : extraFactorVal;

      await client.query(`
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_rate_per_kg NUMERIC(12,4);
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_coating NUMERIC(12,4);
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS rejection_cost NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS powder_coating NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS special_process NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS trans_charges NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS customer_approval_foundry VARCHAR(100);
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_mmr NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_ro NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_consumables NUMERIC(12,4) DEFAULT 0;
        ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS old_extra NUMERIC(12,4) DEFAULT 0;
      `);

      await client.query(
        `INSERT INTO pricing_batch_items
           (batch_id, item_master_id, casting_code, item_code, customer_name, customer_code,
            rm_weight, rm_cost, machining, subcon, overhead_pct, packing,
            rejection_cost, powder_coating, special_process, trans_charges,
            old_price, new_price, delta,
            customer_rm_weight, customer_rate_per_kg, customer_rm_price, customer_total_price, customer_delta,
            old_rate_per_kg, old_coating, customer_approval_foundry,
            old_mmr, old_ro, old_consumables, old_extra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
        [
          batch.id, rawItemId, item.casting_code, item.item_code, customerName, customerCode,
          effectiveWeight, newRmCost, processVal, newCoatingCost, ohpVal, packingVal,
          rejectionVal, powderCoatingVal, specialProcessVal, transVal,
          oldPrice, newPrice, delta,
          effectiveWeight, newRate, newRmCost, newPrice, delta,
          effectiveRatePerKg, effectiveCoating, customerApprovalFoundry,
          oldMmrVal, oldRoVal, oldConsVal, oldExtraVal
        ]
      );
    }

    await client.query('COMMIT');

    const created = await getBatchById(batch.id);
    if (!created) throw new Error('Batch created but could not be fetched');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function approveBatch(id: number): Promise<PricingBatch> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_revert_trigger', 'true', true)");

    // Check batch status to prevent duplicate approval
    const checkRes = await client.query<{ status: string }>(
      'SELECT status FROM pricing_batches WHERE id = $1 FOR UPDATE',
      [id]
    );
    const currentStatus = checkRes.rows[0]?.status;
    if (!currentStatus) {
      throw new Error('Batch not found');
    }
    if (currentStatus === 'approved') {
      throw new Error('Batch is already approved');
    }

    // Ensure status and history columns exist
    await client.query(`
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS powder_coating NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS special_process NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS trans_charges NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS rejection_cost NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE item_price_history ADD COLUMN IF NOT EXISTS old_from_date DATE;
      ALTER TABLE item_price_history ADD COLUMN IF NOT EXISTS old_to_date DATE;
      ALTER TABLE customer_pricing_history ADD COLUMN IF NOT EXISTS old_from_date DATE;
      ALTER TABLE customer_pricing_history ADD COLUMN IF NOT EXISTS old_to_date DATE;
    `);

    // Fetch batch metadata ONCE before processing items
    const batchMetaRes = await client.query<{
      from_date: string;
      to_date: string;
      batch_number: string;
      vendor_id: string;
      updated_mmr: number | null;
      updated_coating_rate: number | null;
      updated_consumables_rate: number | null;
      updated_extra_factor: number | null;
      mmr_change: number | null;
      coating_change: number | null;
      consumables_change: number | null;
      extra_change: number | null;
      grade: string;
    }>(
      'SELECT from_date, to_date, batch_number, vendor_id, updated_mmr, updated_coating_rate, updated_consumables_rate, updated_extra_factor, mmr_change, coating_change, consumables_change, extra_change, grade FROM pricing_batches WHERE id = $1',
      [id]
    );
    const batchMeta = batchMetaRes.rows[0];
    if (!batchMeta) {
      throw new Error('Batch metadata not found');
    }

    // Update batch status
    await client.query(
      `UPDATE pricing_batches SET status=$1, approved_at=NOW() WHERE id=$2`,
      [BATCH_STATUS.APPROVED, id]
    );

    // Fetch all items in this batch and approve each one (update vendor_materials + history)
    const batchItemsRes = await client.query<{ id: number }>(
      `SELECT id FROM pricing_batch_items WHERE batch_id = $1`,
      [id]
    );
    const itemIds = batchItemsRes.rows.map(r => r.id);

    for (const itemId of itemIds) {
      await client.query('SAVEPOINT item_sp');
      try {
        // Recalculate pricing_batch_items using latest vendor_materials values if they exist
        const pbiCheckRes = await client.query<any>(
          `SELECT * FROM pricing_batch_items WHERE id = $1`,
          [itemId]
        );
        let item = pbiCheckRes.rows[0];
        if (!item) {
          await client.query('RELEASE SAVEPOINT item_sp');
          continue;
        }

        if (batchMeta.vendor_id) {
          const vmCheckRes = await client.query<any>(
            `SELECT rm_weight, revised_rate_per_kg, mmr_rate, ro_rate, consumables_rate, extra_factor 
             FROM vendor_materials 
             WHERE TRIM(vendor_id) = TRIM($1) 
               AND (TRIM(casting_code) = TRIM($2) OR TRIM(casting_code) = TRIM($3) OR TRIM(casting_code) = TRIM($4))
             LIMIT 1`,
            [batchMeta.vendor_id, item.casting_code, item.item_code, item.item_master_id]
          );
          const vmRowToCheck = vmCheckRes.rows[0];
          if (vmRowToCheck) {
            const latestWeight = Number(vmRowToCheck.rm_weight || 0);
            const latestRatePerKg = Number(vmRowToCheck.revised_rate_per_kg || 0);
            
            const mmrChange = Number(batchMeta.mmr_change || 0);
            const roChange = Number(batchMeta.coating_change || 0);
            const consChange = Number(batchMeta.consumables_change || 0);
            const extraChange = Number(batchMeta.extra_change || 0);

            const newRate = latestRatePerKg + mmrChange + roChange + consChange + extraChange;
            const newRmCost = latestWeight * newRate;
            const oldRmCost = latestRatePerKg * latestWeight;

            const machiningVal = Number(item.machining || 0);
            const overheadVal = Number(item.overhead_pct || 0);
            const packingVal = Number(item.packing || 0);
            const oldCoatingVal = Number(item.old_coating || 0);
            const transVal = Number(item.trans_charges || 0);
            const rejectionVal = Number(item.rejection_cost || 0);
            const powderCoatingVal = Number(item.powder_coating || 0);
            const specialProcessVal = Number(item.special_process || 0);

            const oldPrice = oldRmCost + machiningVal + overheadVal + packingVal + oldCoatingVal + transVal + rejectionVal + powderCoatingVal + specialProcessVal;
            const newPrice = newRmCost + machiningVal + overheadVal + packingVal + (oldCoatingVal + roChange) + transVal + (latestWeight * newRate * 0.05) + powderCoatingVal + specialProcessVal;
            const delta = newPrice - oldPrice;

            await client.query(
              `UPDATE pricing_batch_items SET
                 rm_weight = $1,
                 rm_cost = $2,
                 subcon = $3,
                 new_price = $4,
                 delta = $5,
                 customer_rm_weight = $6,
                 customer_rate_per_kg = $7,
                 customer_rm_price = $8,
                 customer_total_price = $9,
                 customer_delta = $10,
                 old_rate_per_kg = $11,
                 old_price = $12
               WHERE id = $13`,
              [
                latestWeight, newRmCost, oldCoatingVal + roChange, newPrice, delta,
                latestWeight, newRate, newRmCost, newPrice, delta,
                latestRatePerKg, oldPrice, itemId
              ]
            );

            // Re-read updated item values
            const updatedRes = await client.query<any>(`SELECT * FROM pricing_batch_items WHERE id = $1`, [itemId]);
            if (updatedRes.rows[0]) {
              item = updatedRes.rows[0];
            }
          }
        }

        // Try to find exact vendor material by item_code first, then fall back to casting code matching
        const vmRes = await client.query(
          `SELECT mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date, item_description 
           FROM vendor_materials 
           WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(item_code) = TRIM($2)
           LIMIT 1`,
          [batchMeta.vendor_id, item.item_code]
        );
        let oldVm = vmRes.rows[0];
        if (!oldVm) {
          // Fall back to casting code mapping if exact item_code doesn't exist yet
          const vmFallbackRes = await client.query(
            `SELECT mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date, item_description 
             FROM vendor_materials 
             WHERE TRIM(vendor_id) = TRIM($1) 
               AND (TRIM(casting_code) = TRIM($2) OR TRIM(casting_code) = TRIM($3) OR TRIM(casting_code) = TRIM($4))
             LIMIT 1`,
            [batchMeta.vendor_id, item.casting_code, item.item_master_id, item.item_code]
          );
          oldVm = vmFallbackRes.rows[0] || { mmr_rate: 0, ro_rate: 0, consumables_rate: 0, extra_factor: 0, from_date: null, to_date: null, item_description: null };
        }

        // Resolve the casting code that vendor_materials actually uses.
        const oitmRes = await client.query<{ u_casting_code: string }>(
          `SELECT TRIM(COALESCE(NULLIF(u_castingcode,''), itemcode)) as u_casting_code 
           FROM oitm_sftp WHERE TRIM(itemcode) = TRIM($1) LIMIT 1`,
          [item.item_master_id]
        );
        const resolvedCastingCode = oitmRes.rows[0]?.u_casting_code || item.casting_code || item.item_code;

        // Mark item as approved
        await client.query(
          `UPDATE pricing_batch_items SET status = 'approved' WHERE id = $1`,
          [itemId]
        );

        let vmCastingCode = resolvedCastingCode;

        if (batchMeta.vendor_id) {
          // Update or Insert vendor_materials with new rates — match on the selected item_code, or fall back to generic casting_code
          const vmCheckRes = await client.query<{ item_code: string; casting_code: string }>(
            `SELECT item_code, casting_code FROM vendor_materials 
             WHERE TRIM(vendor_id) = TRIM($1) 
               AND (TRIM(item_code) = TRIM($2) OR (TRIM(item_code) = TRIM(casting_code) AND TRIM(casting_code) = TRIM($3)))
             LIMIT 1`,
            [batchMeta.vendor_id, item.item_code, item.casting_code]
          );
          const matchedItemCode = vmCheckRes.rows[0]?.item_code;
          vmCastingCode = vmCheckRes.rows[0]?.casting_code || resolvedCastingCode;

          if (!matchedItemCode) {
            const histRes = await client.query<{
              grade: string; customer_name: string;
              new_mmr_rate: string | null; new_ro_rate: string | null;
              new_consumables_rate: string | null; new_extra_factor: string | null;
              new_rm_weight: string | null;
            }>(
              `SELECT grade, customer_name, new_mmr_rate, new_ro_rate, new_consumables_rate, new_extra_factor, new_rm_weight 
               FROM vendor_materials_history 
               WHERE TRIM(vendor_id) = TRIM($1) AND (TRIM(casting_code) = TRIM($2) OR TRIM(casting_code) = TRIM($3)) 
               ORDER BY changed_at DESC LIMIT 1`,
              [batchMeta.vendor_id, vmCastingCode, item.casting_code]
            );
            const hist = histRes.rows[0];
            await client.query(
              `INSERT INTO vendor_materials (
                 vendor_id, item_code, item_description, grade, customer_name, casting_code, rm_weight, revised_rate_per_kg, revised_price,
                 mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date, updated_at, groupcode, groupname
               )
               SELECT $1, $2, $3, $4, $5, $6, $7,
                       $8::numeric + $9::numeric + $10::numeric + $11::numeric,
                       $7::numeric * ($8::numeric + $9::numeric + $10::numeric + $11::numeric),
                       $8, $9, $10, $11, $12, $13, NOW(), o.groupcode, og.groupname
               FROM (SELECT $1::text as vendor_id) v
               LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
               LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)`,
              [
                batchMeta.vendor_id, item.item_code, item.item_code,
                hist?.grade || batchMeta.grade,
                hist?.customer_name || item.customer_name,
                vmCastingCode,
                hist?.new_rm_weight ? parseFloat(hist.new_rm_weight) : item.customer_rm_weight,
                batchMeta.updated_mmr !== null && batchMeta.updated_mmr !== undefined ? batchMeta.updated_mmr : (hist?.new_mmr_rate ? parseFloat(hist.new_mmr_rate) : 0),
                batchMeta.updated_coating_rate !== null && batchMeta.updated_coating_rate !== undefined ? batchMeta.updated_coating_rate : (hist?.new_ro_rate ? parseFloat(hist.new_ro_rate) : 0),
                batchMeta.updated_consumables_rate !== null && batchMeta.updated_consumables_rate !== undefined ? batchMeta.updated_consumables_rate : (hist?.new_consumables_rate ? parseFloat(hist.new_consumables_rate) : 0),
                batchMeta.updated_extra_factor !== null && batchMeta.updated_extra_factor !== undefined ? batchMeta.updated_extra_factor : (hist?.new_extra_factor ? parseFloat(hist.new_extra_factor) : 0),
                batchMeta.from_date, batchMeta.to_date
              ]
            );
          } else {
            await client.query(
              `UPDATE vendor_materials 
               SET item_code         = $13,
                   mmr_rate          = COALESCE($1, mmr_rate          + COALESCE($7,  0::numeric)),
                   ro_rate           = COALESCE($2, ro_rate           + COALESCE($8,  0::numeric)),
                   consumables_rate  = COALESCE($3, consumables_rate  + COALESCE($9,  0::numeric)),
                   extra_factor      = COALESCE($4, extra_factor      + COALESCE($10, 0::numeric)),
                   revised_rate_per_kg = revised_rate_per_kg
                     + (COALESCE($1, mmr_rate         + COALESCE($7,  0::numeric)) - mmr_rate)
                     + (COALESCE($2, ro_rate          + COALESCE($8,  0::numeric)) - ro_rate)
                     + (COALESCE($3, consumables_rate + COALESCE($9,  0::numeric)) - consumables_rate)
                     + (COALESCE($4, extra_factor     + COALESCE($10, 0::numeric)) - extra_factor),
                   revised_price = rm_weight * (
                     revised_rate_per_kg
                     + (COALESCE($1, mmr_rate         + COALESCE($7,  0::numeric)) - mmr_rate)
                     + (COALESCE($2, ro_rate          + COALESCE($8,  0::numeric)) - ro_rate)
                     + (COALESCE($3, consumables_rate + COALESCE($9,  0::numeric)) - consumables_rate)
                     + (COALESCE($4, extra_factor     + COALESCE($10, 0::numeric)) - extra_factor)
                   ),
                   from_date = $11,
                   to_date = $12,
                   updated_at = NOW()
               WHERE TRIM(vendor_id) = TRIM($5) AND TRIM(item_code) = TRIM($6)`,
              [
                batchMeta.updated_mmr, batchMeta.updated_coating_rate,
                batchMeta.updated_consumables_rate, batchMeta.updated_extra_factor,
                batchMeta.vendor_id, matchedItemCode,
                batchMeta.mmr_change, batchMeta.coating_change,
                batchMeta.consumables_change, batchMeta.extra_change,
                batchMeta.from_date, batchMeta.to_date,
                item.item_code
              ]
            );
          }
        }

        const oldRate = Number(item.old_rate_per_kg) || 0;

        // Insert price history record for Vendor batches
        if (batchMeta.vendor_id) {
          await client.query(
            `INSERT INTO item_price_history
               (casting_code, item_code, customer_name, vendor_id, batch_number, batch_id, from_date, to_date, updated_by,
                old_mmr, new_mmr, old_coating, new_coating, old_consumables, new_consumables, old_extra, new_extra,
                old_rate_per_kg, new_rate_per_kg, old_price, new_price, delta, old_from_date, old_to_date, item_description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
            [
              vmCastingCode, item.item_code, item.customer_name, batchMeta.vendor_id, batchMeta.batch_number, item.batch_id,
              batchMeta.from_date, batchMeta.to_date, 'Admin',
              oldVm.mmr_rate,
              batchMeta.updated_mmr !== null && batchMeta.updated_mmr !== undefined ? batchMeta.updated_mmr : (Number(oldVm.mmr_rate) + Number(batchMeta.mmr_change || 0)),
              oldVm.ro_rate,
              batchMeta.updated_coating_rate !== null && batchMeta.updated_coating_rate !== undefined ? batchMeta.updated_coating_rate : (Number(oldVm.ro_rate) + Number(batchMeta.coating_change || 0)),
              oldVm.consumables_rate,
              batchMeta.updated_consumables_rate !== null && batchMeta.updated_consumables_rate !== undefined ? batchMeta.updated_consumables_rate : (Number(oldVm.consumables_rate) + Number(batchMeta.consumables_change || 0)),
              oldVm.extra_factor,
              batchMeta.updated_extra_factor !== null && batchMeta.updated_extra_factor !== undefined ? batchMeta.updated_extra_factor : (Number(oldVm.extra_factor) + Number(batchMeta.extra_change || 0)),
              oldRate, item.customer_rate_per_kg,
              item.old_price, item.customer_total_price, item.customer_total_price - item.old_price,
              oldVm.from_date || null, oldVm.to_date || null,
              oldVm.item_description || null
            ]
          );
        } else {
          // Sync customer pricing physical tables (argit_pld1, aargit_ple1, aargit_plp1, or argit_pll1) only for Customer batches
          let cleanItemMasterId = item.item_master_id;
          let customerCode = '';
          if (item.item_master_id.includes('|')) {
            const parts = item.item_master_id.split('|');
            if (parts.length === 3) {
              customerCode = parts[0].trim();
              cleanItemMasterId = parts[2].trim();
            }
          }
          if (!customerCode && item.customer_name) {
            const custRes = await client.query<{ cardcode: string }>(
              `SELECT TRIM(cardcode) as cardcode 
               FROM ocrd_sftp 
               WHERE (LOWER(TRIM(cardname)) = LOWER(TRIM($1)) OR LOWER(TRIM(cardfname)) = LOWER(TRIM($1)))
                 AND cardtype = 'C' 
               LIMIT 1`,
              [item.customer_name.trim()]
            );
            customerCode = custRes.rows[0]?.cardcode || '';
          }

          let oldCust: { mmr_rate: number; ro_rate: number; consumables_rate: number; extra_factor: number; from_date?: string | null; to_date?: string | null } = { mmr_rate: 0, ro_rate: 0, consumables_rate: 0, extra_factor: 0, from_date: null, to_date: null };
          let computedMMR = 0;
          let computedRO = 0;
          let computedCons = 0;
          let computedExtra = 0;

          const itemMetadataRes = await client.query<{ group_code: string; bought_out: string; dome_expo: string }>(
            `SELECT itmsgrpcod as group_code, u_bought as bought_out, u_domeexpo as dome_expo
             FROM oitm_sftp WHERE TRIM(itemcode) = $1 LIMIT 1`,
            [cleanItemMasterId]
          );
          const meta = itemMetadataRes.rows[0] || { group_code: '', bought_out: '', dome_expo: '' };
          const groupCode = String(meta.group_code || '');
          const boughtOut = String(meta.bought_out || '').trim();
          const domeExpo = String(meta.dome_expo || '').toUpperCase();

          const isLabour = ['125', '128'].includes(groupCode) || boughtOut === 'Job Work';
          const isPin = ['116', '118'].includes(groupCode) || domeExpo.includes('PIN BUSH') || domeExpo.includes('PIN PUSH') || domeExpo.includes('PIN & BUSH');

          let physicalTable = 'aargit_ple1';
          if (isLabour) physicalTable = 'argit_pll1';
          else if (isPin) physicalTable = 'aargit_plp1';
          else if (domeExpo.includes('DOMESTIC')) physicalTable = 'argit_pld1';

          // Get previous rates from the customer table
          if (physicalTable !== 'argit_pll1') {
            const custCheckSql = `
              SELECT "U_MmrRate" as mmr_rate, "U_RoRate" as ro_rate, "U_ConsRate" as consumables_rate, "U_Extra" as extra_factor, "U_EffDateF" as from_date, "U_EffDateT" as to_date 
              FROM "${physicalTable}" 
              WHERE TRIM("U_ItemNo") = TRIM($1)
                AND (${customerCode ? 'TRIM("U_CustCode") = TRIM($2)' : '1=1'})
              ORDER BY "DocEntry"::bigint DESC LIMIT 1
            `;
            const custCheckParams = customerCode ? [cleanItemMasterId, customerCode] : [cleanItemMasterId];
            const custCheckRes = await client.query(custCheckSql, custCheckParams);
            if (custCheckRes.rows[0]) {
              oldCust = {
                mmr_rate: Number(custCheckRes.rows[0].mmr_rate || 0),
                ro_rate: Number(custCheckRes.rows[0].ro_rate || 0),
                consumables_rate: Number(custCheckRes.rows[0].consumables_rate || 0),
                extra_factor: Number(custCheckRes.rows[0].extra_factor || 0),
                from_date: custCheckRes.rows[0].from_date || null,
                to_date: custCheckRes.rows[0].to_date || null,
              };
            }
          }

          computedMMR = batchMeta.updated_mmr !== null && batchMeta.updated_mmr !== undefined 
            ? batchMeta.updated_mmr 
            : (Number(oldCust.mmr_rate || 0) + Number(batchMeta.mmr_change || 0));

          computedRO = batchMeta.updated_coating_rate !== null && batchMeta.updated_coating_rate !== undefined 
            ? batchMeta.updated_coating_rate 
            : (Number(oldCust.ro_rate || 0) + Number(batchMeta.coating_change || 0));

          computedCons = batchMeta.updated_consumables_rate !== null && batchMeta.updated_consumables_rate !== undefined 
            ? batchMeta.updated_consumables_rate 
            : (Number(oldCust.consumables_rate || 0) + Number(batchMeta.consumables_change || 0));

          computedExtra = batchMeta.updated_extra_factor !== null && batchMeta.updated_extra_factor !== undefined 
            ? batchMeta.updated_extra_factor 
            : (Number(oldCust.extra_factor || 0) + Number(batchMeta.extra_change || 0));

          const computedRatePerKg = Number(item.customer_rate_per_kg);
          const computedCastingPrice = Number(item.customer_rm_weight) * computedRatePerKg;

          let castRateCast = '$1';
          let castPricCast = '$2';
          let mmrCast = '$3';
          let roCast = '$4';
          let consCast = '$5';
          let extraCast = '$6';
          let finPriceCast = '$9';
          let actCostCast = '$10';

          if (physicalTable === 'aargit_ple1') {
            castRateCast = '$1::text::numeric::double precision';
            castPricCast = '$2::text';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$9::text';
            actCostCast = '$10::text::numeric::double precision';
          } else if (physicalTable === 'aargit_plp1') {
            castRateCast = '$1::text';
            castPricCast = '$2::text';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$9::text';
            actCostCast = '$10::text';
          } else if (physicalTable === 'argit_pld1') {
            castRateCast = '$1::text::numeric';
            castPricCast = '$2::text::numeric';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$9::text::numeric';
            actCostCast = '$10::text::numeric';
          }

          if (physicalTable === 'argit_pll1') {
            await client.query(
              `UPDATE "${physicalTable}"
               SET "U_CastRate" = $1::text,
                   "U_CastPric" = $2::text,
                   "U_EffDateF" = $3,
                   "U_EffDateT" = $4,
                   "U_FinPrice" = $5::text,
                   "U_ActCost" = $6::text,
                   pricing_audit_status = 'pending'
               WHERE TRIM("U_ItemNo") = $7
                 AND (${customerCode ? 'TRIM("U_CustCode") = TRIM($8)' : '1=1'})`,
              [
                computedRatePerKg,
                computedCastingPrice,
                batchMeta.from_date,
                batchMeta.to_date,
                item.customer_total_price,
                item.customer_total_price - computedCastingPrice,
                cleanItemMasterId,
                ...(customerCode ? [customerCode] : [])
              ]
            );
          } else {
            await client.query(
              `UPDATE "${physicalTable}"
               SET "U_CastRate" = ${castRateCast},
                   "U_CastPric" = ${castPricCast},
                   "U_MmrRate" = ${mmrCast},
                   "U_RoRate" = ${roCast},
                   "U_ConsRate" = ${consCast},
                   "U_Extra" = ${extraCast},
                   "U_EffDateF" = $7,
                   "U_EffDateT" = $8,
                   "U_FinPrice" = ${finPriceCast},
                   "U_ActCost" = ${actCostCast},
                   pricing_audit_status = 'pending'
               WHERE TRIM("U_ItemNo") = $11
                 AND (${customerCode ? 'TRIM("U_CustCode") = TRIM($12)' : '1=1'})`,
              [
                computedRatePerKg,
                computedCastingPrice,
                computedMMR,
                computedRO,
                computedCons,
                computedExtra,
                batchMeta.from_date,
                batchMeta.to_date,
                item.customer_total_price,
                item.customer_total_price - computedCastingPrice,
                cleanItemMasterId,
                ...(customerCode ? [customerCode] : [])
              ]
            );
          }

          // Fetch the pbi's stored customer_approval_foundry and customer_rm_weight
          const pbiMetaRes = await client.query<{
            customer_approval_foundry: string;
            customer_rm_weight: number;
            rm_weight: number;
            machining: number;
            subcon: number;
            overhead_pct: number;
          }>(
            `SELECT customer_approval_foundry, customer_rm_weight, rm_weight, machining, subcon, overhead_pct
             FROM pricing_batch_items WHERE id = $1`,
            [itemId]
          );
          const pbiMeta = pbiMetaRes.rows[0];

          // Fetch item metadata for group/description/grade
          const custItemMetaRes = await client.query<{
            item_description: string; grade: string; group_name: string;
            dome_expo: string; bought_out: string; group_code: string;
          }>(
            `SELECT TRIM(t0.itemname) as item_description, TRIM(t0.u_grade) as grade,
                    TRIM(t1.itmsgrpnam) as group_name, TRIM(t0.u_domeexpo) as dome_expo,
                    TRIM(t0.u_bought) as bought_out, t0.itmsgrpcod::text as group_code
             FROM oitm_sftp t0
             LEFT JOIN oitb_sftp t1 ON t0.itmsgrpcod::text = T1.itmsgrpcod::text
             WHERE TRIM(t0.itemcode) = $1 LIMIT 1`,
            [cleanItemMasterId]
          );
          const custMeta = custItemMetaRes.rows[0];

          // Resolve domestic_export label from group_code / bought_out / dome_expo
          let domesticExport = custMeta?.dome_expo || 'Export';
          if (['125', '128'].includes(String(custMeta?.group_code || '')) || custMeta?.bought_out === 'Job Work') {
            domesticExport = 'Labour';
          } else if (['116', '118'].includes(String(custMeta?.group_code || '')) ||
                     (custMeta?.dome_expo || '').toUpperCase().includes('PIN BUSH') ||
                     (custMeta?.dome_expo || '').toUpperCase().includes('PIN PUSH') ||
                     (custMeta?.dome_expo || '').toUpperCase().includes('PIN & BUSH')) {
            domesticExport = 'Pin Bush';
          }

          await client.query(
            `INSERT INTO customer_pricing_history
               (batch_id, batch_number, item_code, casting_code, item_description, grade, group_name, domestic_export,
                customer_code, customer_name, customer_approval_foundry,
                old_cast_weight, new_cast_weight,
                old_cast_rate, new_cast_rate,
                old_mmr_rate, new_mmr_rate,
                old_ro_rate, new_ro_rate,
                old_consumables, new_consumables,
                old_extra, new_extra,
                process_machining, ohp, packing, trans_charges, rejection_cost, powder_coating, special_process,
                old_price, new_price, delta,
                from_date, to_date, updated_by, old_from_date, old_to_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                     $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)`,
            [
              item.batch_id, batchMeta.batch_number,
              item.item_code, vmCastingCode,
              custMeta?.item_description || '', custMeta?.grade || batchMeta.grade || '',
              custMeta?.group_name || '', domesticExport,
              customerCode, item.customer_name,
              pbiMeta?.customer_approval_foundry || '',
              Number(pbiMeta?.customer_rm_weight || item.customer_rm_weight || 0),
              Number(pbiMeta?.customer_rm_weight || item.customer_rm_weight || 0),
              oldRate, item.customer_rate_per_kg,
              Number(oldCust.mmr_rate || 0), computedMMR,
              Number(oldCust.ro_rate || 0), computedRO,
              Number(oldCust.consumables_rate || 0), computedCons,
              Number(oldCust.extra_factor || 0), computedExtra,
              Number(pbiMeta?.machining || 0),
              Number(pbiMeta?.overhead_pct || 0),
              Number(item.packing || 0),
              Number(item.trans_charges || 0),
              Number(item.rejection_cost || 0),
              Number(item.powder_coating || 0),
              Number(item.special_process || 0),
              item.old_price, item.customer_total_price, item.customer_total_price - item.old_price,
              batchMeta.from_date, batchMeta.to_date, 'Admin',
              oldCust.from_date || null, oldCust.to_date || null
            ]
          );
        }

        await client.query('RELEASE SAVEPOINT item_sp');
      } catch (itemErr) {
        console.error(`Error processing batch item ${itemId} in batch ${id}:`, itemErr);
        await client.query('ROLLBACK TO SAVEPOINT item_sp').catch(() => {});
      }
    }

    await client.query('COMMIT');

    const updated = await getBatchById(id);
    if (!updated) throw new Error('Batch approved but could not be fetched');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}


export interface ItemApproval {
  id: number;
  batchId: number;
  itemMasterId: number;
  itemCode: string;
  castingCode: string;
  customerName: string;
  rmWeight: number;
  rmCost: number;
  machining: number;
  subcon: number;
  oldPrice: number;
  newPrice: number;
  delta: number;
  custRate: number;
  custPrice: number;
  status: string;
  batchNumber: string;
  grade: string;
  fromDate: string | null;
  toDate: string | null;
  vendorName: string | null;
  description: string | null;
  wt: number;
  oldRate: number;
  rejectionCost?: number;
  powderCoating?: number;
  specialProcess?: number;
  transCharges?: number;
  overheadPct: number;
  packing: number;
  ctype: 'Domestic' | 'Export' | 'Labour' | 'Pin & Bush';
  oldMachining?: number;
  oldOverhead?: number;
  oldPacking?: number;
  oldTrans?: number;
  oldPowder?: number;
  oldSpecial?: number;
}

export async function getItemApprovals(): Promise<ItemApproval[]> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS powder_coating NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS special_process NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS trans_charges NUMERIC(12,4) DEFAULT 0;
      ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS rejection_cost NUMERIC(12,4) DEFAULT 0;
    `);
  } finally {
    client.release();
  }

  const rows = await query<{
    id: number;
    batch_id: number;
    item_master_id: number;
    item_code: string;
    casting_code: string;
    customer_name: string;
    rm_weight: string;
    rm_cost: string;
    machining: string;
    subcon: string;
    old_price: string;
    new_price: string;
    delta: string;
    cust_rate: string;
    cust_price: string;
    status: string;
    batch_number: string;
    grade: string;
    from_date: string | null;
    to_date: string | null;
    vendor_name: string | null;
    description: string | null;
    wt: string;
    old_rate: string;
    rejection_cost: string;
    powder_coating: string;
    special_process: string;
    trans_charges: string;
    overhead_pct: string;
    packing: string;
    group_code: string | null;
    bought_out: string | null;
    dome_expo: string | null;
    old_machining: string;
    old_overhead: string;
    old_packing: string;
    old_trans: string;
    old_powder: string;
    old_special: string;
  }>(
    `SELECT 
       pbi.id,
       pbi.batch_id,
       pbi.item_master_id,
       pbi.item_code,
       pbi.casting_code,
       pbi.customer_name,
       pbi.rm_weight,
       pbi.rm_cost,
       COALESCE(NULLIF(pbi.machining, 0), NULLIF(NULLIF(TRIM(ple."U_ProcMach"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_ProcMach"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_ProcMach"::text), '?'), '')::numeric, 0) as machining,
       COALESCE(NULLIF(pbi.subcon, 0), vm.ro_rate::numeric, 0) as subcon,
       pbi.old_price,
       pbi.new_price,
       pbi.delta,
       pbi.customer_rate_per_kg as cust_rate,
       pbi.customer_total_price as cust_price,
       COALESCE(pbi.status, 'pending') as status,
       pb.batch_number,
       pb.grade,
       pb.from_date,
       pb.to_date,
       v.cardname as vendor_name,
       im.itemname as description,
       pbi.rm_weight as wt,
       pbi.old_rate_per_kg as old_rate,
       COALESCE(NULLIF(pbi.rejection_cost, 0), NULLIF(NULLIF(TRIM(ple."U_RejCost"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_RejCost"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_RejCost"::text), '?'), '')::numeric, 0) as rejection_cost,
       COALESCE(NULLIF(pbi.powder_coating, 0), NULLIF(NULLIF(TRIM(ple."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_PowdCoat"::text), '?'), '')::numeric, 0) as powder_coating,
       COALESCE(NULLIF(pbi.special_process, 0), NULLIF(NULLIF(TRIM(ple."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_SpecProc"::text), '?'), '')::numeric, 0) as special_process,
       COALESCE(NULLIF(pbi.trans_charges, 0), NULLIF(NULLIF(TRIM(ple."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_TranChar"::text), '?'), '')::numeric, 0) as trans_charges,
       COALESCE(NULLIF(pbi.overhead_pct, 0), NULLIF(NULLIF(TRIM(ple."U_OHP"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_OHP"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_OHP"::text), '?'), '')::numeric, 0) as overhead_pct,
       COALESCE(NULLIF(pbi.packing, 0), NULLIF(NULLIF(TRIM(ple."U_Packing"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_Packing"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_Packing"::text), '?'), '')::numeric, 0) as packing,
       im.itmsgrpcod as group_code,
       im.u_bought as bought_out,
       im.u_domeexpo as dome_expo,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_ProcMach"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_ProcMach"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_ProcMach"::text), '?'), '')::numeric, 0) as old_machining,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_OHP"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_OHP"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_OHP"::text), '?'), '')::numeric, 0) as old_overhead,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_Packing"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_Packing"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_Packing"::text), '?'), '')::numeric, 0) as old_packing,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_TranChar"::text), '?'), '')::numeric, 0) as old_trans,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_PowdCoat"::text), '?'), '')::numeric, 0) as old_powder,
       COALESCE(NULLIF(NULLIF(TRIM(ple."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_SpecProc"::text), '?'), '')::numeric, 0) as old_special
     FROM pricing_batch_items pbi
     JOIN pricing_batches pb ON pbi.batch_id = pb.id
     LEFT JOIN oitm_sftp im ON pbi.item_master_id = TRIM(im.itemcode)
     LEFT JOIN ocrd_sftp v ON pb.vendor_id = v.cardcode
     LEFT JOIN vendor_materials vm ON (pb.vendor_id = vm.vendor_id AND vm.casting_code = pbi.casting_code)
     LEFT JOIN "aargit_ple1" ple ON TRIM(ple."U_ItemNo") = TRIM(pbi.item_master_id)
     LEFT JOIN "aargit_plp1" plp ON TRIM(plp."U_ItemNo") = TRIM(pbi.item_master_id)
     LEFT JOIN "argit_pll1" pll ON TRIM(pll."U_ItemNo") = TRIM(pbi.item_master_id)
     WHERE pb.status = 'approved' AND (pbi.status IN ('pending', 'dispute') OR pbi.status IS NULL)
     ORDER BY pb.batch_number DESC, pbi.item_code ASC`
  );

  return rows.map(r => {
    const groupCode = String(r.group_code || '');
    const boughtOut = String(r.bought_out || '').trim();
    const domeExpo = String(r.dome_expo || '').toUpperCase();

    const isLabour = ['125', '128'].includes(groupCode) || boughtOut === 'Job Work';
    const isPin = ['116', '118'].includes(groupCode) || domeExpo.includes('PIN BUSH') || domeExpo.includes('PIN PUSH') || domeExpo.includes('PIN & BUSH');
    const isExport = domeExpo.includes('EXPORT');

    let ctype: 'Domestic' | 'Export' | 'Labour' | 'Pin & Bush' = 'Domestic';
    if (isLabour) ctype = 'Labour';
    else if (isPin) ctype = 'Pin & Bush';
    else if (isExport) ctype = 'Export';

    return {
      id: r.id,
      batchId: r.batch_id,
      itemMasterId: r.item_master_id,
      itemCode: r.item_code,
      castingCode: r.casting_code,
      customerName: r.customer_name,
      rmWeight: Number(r.rm_weight),
      rmCost: Number(r.rm_cost),
      machining: Number(r.machining),
      subcon: Number(r.subcon),
      oldPrice: Number(r.old_price),
      newPrice: Number(r.new_price),
      delta: Number(r.delta),
      custRate: Number(r.cust_rate),
      custPrice: Number(r.cust_price),
      status: r.status,
      batchNumber: r.batch_number,
      grade: r.grade,
      fromDate: r.from_date ? toLocalDateString(r.from_date) : null,
      toDate: r.to_date ? toLocalDateString(r.to_date) : null,
      vendorName: r.vendor_name,
      description: r.description,
      wt: Number(r.wt || r.rm_weight),
      oldRate: Number(r.old_rate),
      rejectionCost: Number(r.rejection_cost || 0),
      powderCoating: Number(r.powder_coating || 0),
      specialProcess: Number(r.special_process || 0),
      transCharges: Number(r.trans_charges || 0),
      overheadPct: Number(r.overhead_pct || 0),
      packing: Number(r.packing || 0),
      ctype,
      oldMachining: Number(r.old_machining || 0),
      oldOverhead: Number(r.old_overhead || 0),
      oldPacking: Number(r.old_packing || 0),
      oldTrans: Number(r.old_trans || 0),
      oldPowder: Number(r.old_powder || 0),
      oldSpecial: Number(r.old_special || 0)
    };
  });
}

export async function updateBatchItem(id: number, data: Record<string, number>): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT * FROM pricing_batch_items WHERE id = $1', [id]);
    const item = res.rows[0];
    if (!item) throw new Error('Item not found');

    let customer_rate_per_kg = Number(item.customer_rate_per_kg);
    let subcon = Number(item.subcon);
    let machining = Number(item.machining);
    let overhead_pct = Number(item.overhead_pct);
    let packing = Number(item.packing);
    let powder_coating = Number(item.powder_coating || 0);
    let special_process = Number(item.special_process || 0);
    let trans_charges = Number(item.trans_charges || 0);
    let rejection_cost = Number(item.rejection_cost || 0);
    const weight = Number(item.customer_rm_weight) || 1;

    // Handle mapping from UI row names to DB columns
    if ('Raw Material Base Rate (MMR)' in data) {
      customer_rate_per_kg = data['Raw Material Base Rate (MMR)'];
    }
    if ('Powder Coating' in data) {
      powder_coating = data['Powder Coating'];
    }
    if ('Special Process' in data) {
      special_process = data['Special Process'];
    }
    if ('Subcon' in data) {
      subcon = data['Subcon'];
    }
    if ('Process (Machining+others)' in data || 'Machining (incl. RM)' in data) {
      machining = data['Process (Machining+others)'] ?? data['Machining (incl. RM)'];
    }
    if ('Trans Charges' in data) {
      trans_charges = data['Trans Charges'];
    }
    if ('OHP' in data) {
      overhead_pct = data['OHP'];
    }
    if ('Packing' in data) {
      packing = data['Packing'];
    }
    if ('Rejection Cost' in data) {
      rejection_cost = data['Rejection Cost'];
    }

    const customer_rm_price = weight * customer_rate_per_kg;
    const customer_total_price = customer_rm_price + rejection_cost + powder_coating + special_process + machining + trans_charges + overhead_pct + packing + subcon;
    const delta = customer_total_price - Number(item.old_price);

    await client.query(
      `UPDATE pricing_batch_items SET 
        customer_rate_per_kg = $1, 
        subcon = $2, 
        machining = $3, 
        overhead_pct = $4, 
        packing = $5,
        customer_rm_price = $6,
        customer_total_price = $7,
        new_price = $7,
        delta = $8,
        customer_delta = $8,
        powder_coating = $9,
        special_process = $10,
        trans_charges = $11,
        rejection_cost = $12
      WHERE id = $13`,
      [customer_rate_per_kg, subcon, machining, overhead_pct, packing, customer_rm_price, customer_total_price, delta, powder_coating, special_process, trans_charges, rejection_cost, id]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function approveItems(itemIds: number[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_revert_trigger', 'true', true)");

    const batchCache = new Map<number, any>();
    const vmCache = new Map<string, any>();

    for (const itemId of itemIds) {
      const itemRes = await client.query<{
        item_master_id: string;
        customer_name: string;
        new_price: number;
        customer_total_price: number;
        customer_rate_per_kg: number;
        customer_rm_weight: number;
        old_price: number;
        delta: number;
        casting_code: string;
        item_code: string;
        batch_id: number;
        old_rate_per_kg: number;
        machining: number;
        subcon: number;
        overhead_pct: number;
        packing: number;
        rejection_cost: number;
        powder_coating: number;
        special_process: number;
        trans_charges: number;
      }>(
        `SELECT 
           pbi.item_master_id, pbi.customer_name, pbi.new_price, pbi.customer_total_price, pbi.customer_rate_per_kg, pbi.customer_rm_weight, pbi.old_price, pbi.delta, pbi.casting_code, pbi.item_code, pbi.batch_id, pbi.old_rate_per_kg,
           pbi.machining, pbi.subcon, pbi.overhead_pct, pbi.packing,
           COALESCE(NULLIF(pbi.rejection_cost, 0), NULLIF(NULLIF(TRIM(ple."U_RejCost"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_RejCost"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_RejCost"::text), '?'), '')::numeric, 0) as rejection_cost,
           COALESCE(NULLIF(pbi.powder_coating, 0), NULLIF(NULLIF(TRIM(ple."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_PowdCoat"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_PowdCoat"::text), '?'), '')::numeric, 0) as powder_coating,
           COALESCE(NULLIF(pbi.special_process, 0), NULLIF(NULLIF(TRIM(ple."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_SpecProc"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_SpecProc"::text), '?'), '')::numeric, 0) as special_process,
           COALESCE(NULLIF(pbi.trans_charges, 0), NULLIF(NULLIF(TRIM(ple."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(plp."U_TranChar"::text), '?'), '')::numeric, NULLIF(NULLIF(TRIM(pll."U_TranChar"::text), '?'), '')::numeric, 0) as trans_charges
         FROM pricing_batch_items pbi
         LEFT JOIN "aargit_ple1" ple ON TRIM(ple."U_ItemNo") = TRIM(pbi.item_master_id)
         LEFT JOIN "aargit_plp1" plp ON TRIM(plp."U_ItemNo") = TRIM(pbi.item_master_id)
         LEFT JOIN "argit_pll1" pll ON TRIM(pll."U_ItemNo") = TRIM(pbi.item_master_id)
         WHERE pbi.id = $1`,
        [itemId]
      );

      const item = itemRes.rows[0];
      if (!item) continue;

      let batchMeta = batchCache.get(item.batch_id);
      if (!batchMeta) {
        const batchRes = await client.query<{
          from_date: string; 
          to_date: string; 
          batch_number: string; 
          vendor_id: string;
          updated_mmr: number | null;
          updated_coating_rate: number | null;
          updated_consumables_rate: number | null;
          updated_extra_factor: number | null;
          mmr_change: number | null;
          coating_change: number | null;
          consumables_change: number | null;
          extra_change: number | null;
          grade: string;
        }>(
          'SELECT from_date, to_date, batch_number, vendor_id, updated_mmr, updated_coating_rate, updated_consumables_rate, updated_extra_factor, mmr_change, coating_change, consumables_change, extra_change, grade FROM pricing_batches WHERE id = $1',
          [item.batch_id]
        );
        batchMeta = batchRes.rows[0];
        if (batchMeta) batchCache.set(item.batch_id, batchMeta);
      }

      const vmKey = `${batchMeta?.vendor_id || ''}_${item.casting_code}`;
      let oldVm = vmCache.get(vmKey);
      if (!oldVm && batchMeta?.vendor_id) {
        const vmRes = await client.query(
          'SELECT mmr_rate, ro_rate, consumables_rate, extra_factor FROM vendor_materials WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(casting_code) = TRIM($2)',
          [batchMeta.vendor_id, item.casting_code]
        );
        oldVm = vmRes.rows[0] || { mmr_rate: 0, ro_rate: 0, consumables_rate: 0, extra_factor: 0 };
        vmCache.set(vmKey, oldVm);
      }
      if (!oldVm) oldVm = { mmr_rate: 0, ro_rate: 0, consumables_rate: 0, extra_factor: 0 };

      await client.query(
        `UPDATE pricing_batch_items SET status = 'approved' WHERE id = $1`,
        [itemId]
      );

      /*
      // Sync physical tables: aargit_ple1, aargit_plp1, or argit_pll1
      const itemMetadataRes = await client.query<{ group_code: string; bought_out: string; dome_expo: string }>(
        `SELECT itmsgrpcod as group_code, u_bought as bought_out, u_domeexpo as dome_expo
         FROM oitm_sftp WHERE TRIM(itemcode) = $1 LIMIT 1`,
        [item.item_master_id]
      );
      const meta = itemMetadataRes.rows[0] || { group_code: '', bought_out: '', dome_expo: '' };
      const groupCode = String(meta.group_code || '');
      const boughtOut = String(meta.bought_out || '').trim();
      const domeExpo = String(meta.dome_expo || '').toUpperCase();

      const isLabour = ['125', '128'].includes(groupCode) || boughtOut === 'Job Work';
      const isPin = ['116', '118'].includes(groupCode) || domeExpo.includes('PIN BUSH') || domeExpo.includes('PIN PUSH') || domeExpo.includes('PIN & BUSH');

      let physicalTable = 'aargit_ple1';
      if (isLabour) physicalTable = 'argit_pll1';
      else if (isPin) physicalTable = 'aargit_plp1';

      if (physicalTable === 'aargit_ple1') {
        const actCost = Number(item.customer_total_price) - (Number(item.customer_rm_weight) * Number(item.customer_rate_per_kg));
        await client.query(
          `UPDATE "aargit_ple1"
           SET "U_RejCost" = $1::text::numeric::double precision,
               "U_PowdCoat" = $2::text::numeric::double precision,
               "U_SpecProc" = $3::text::numeric::double precision,
               "U_ProcMach" = $4::text,
               "U_TranChar" = $5::text::numeric::double precision,
               "U_OHP" = $6::text,
               "U_Packing" = $7::text::numeric::double precision,
               "U_FinPrice" = $8::text,
               "U_ActCost" = $9::text::numeric::double precision
           WHERE TRIM("U_ItemNo") = $10`,
          [
            String(item.rejection_cost ?? 0),
            String(item.powder_coating ?? 0),
            String(item.special_process ?? 0),
            String(item.machining ?? ''),
            String(item.trans_charges ?? 0),
            String(item.overhead_pct ?? ''),
            String(item.packing ?? 0),
            String(item.customer_total_price ?? 0),
            String(actCost),
            item.item_master_id
          ]
        );
      } else {
        await client.query(
          `UPDATE "${physicalTable}"
           SET "U_RejCost" = $1::text,
               "U_PowdCoat" = $2::text,
               "U_SpecProc" = $3::text,
               "U_ProcMach" = $4::text,
               "U_TranChar" = $5::text,
               "U_OHP" = $6::text,
               "U_Packing" = $7::text,
               "U_FinPrice" = $8::text,
               "U_ActCost" = $9::text
           WHERE TRIM("U_ItemNo") = $10`,
          [
            item.rejection_cost,
            item.powder_coating,
            item.special_process,
            item.machining,
            item.trans_charges,
            item.overhead_pct,
            item.packing,
            item.customer_total_price,
            item.customer_total_price,
            item.item_master_id
          ]
        );
      }
      */

      // Update or Insert Vendor Materials table with the new MMR, RO, Consumables, Extra, Rate/Kg, and Effective Dates
      // Update or Insert Vendor Materials table with the new MMR, RO, Consumables, Extra, Rate/Kg, and Effective Dates
      const vmCheckRes = await client.query(
        'SELECT 1 FROM vendor_materials WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(item_code) = TRIM($2)',
        [batchMeta.vendor_id, item.item_code]
      );
      if (vmCheckRes.rows.length === 0) {
        // Query vendor_materials_history to see if this material used to exist
        const histRes = await client.query<{
          grade: string;
          customer_name: string;
          new_mmr_rate: string | null;
          new_ro_rate: string | null;
          new_consumables_rate: string | null;
          new_extra_factor: string | null;
          new_rm_weight: string | null;
        }>(
          `SELECT grade, customer_name, new_mmr_rate, new_ro_rate, new_consumables_rate, new_extra_factor, new_rm_weight 
           FROM vendor_materials_history 
           WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(casting_code) = TRIM($2) 
           ORDER BY changed_at DESC LIMIT 1`,
          [batchMeta.vendor_id, item.casting_code]
        );
        const hist = histRes.rows[0];

        await client.query(
          `INSERT INTO vendor_materials (
             vendor_id, item_code, item_description, grade, customer_name, casting_code, rm_weight, revised_rate_per_kg, revised_price,
             mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date, updated_at, groupcode, groupname
           )
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $7::numeric * $8::numeric, $9, $10, $11, $12, $13, $14, NOW(), o.groupcode, og.groupname
           FROM (SELECT $1::text as vendor_id) v
           LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
           LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)`,
          [
            batchMeta.vendor_id,
            item.item_code,
            item.item_code,
            hist?.grade || batchMeta.grade,
            hist?.customer_name || item.customer_name,
            item.casting_code,
            hist?.new_rm_weight ? parseFloat(hist.new_rm_weight) : item.customer_rm_weight,
            item.customer_rate_per_kg,
            batchMeta.updated_mmr !== null && batchMeta.updated_mmr !== undefined ? batchMeta.updated_mmr : (hist?.new_mmr_rate ? parseFloat(hist.new_mmr_rate) : 0),
            batchMeta.updated_coating_rate !== null && batchMeta.updated_coating_rate !== undefined ? batchMeta.updated_coating_rate : (hist?.new_ro_rate ? parseFloat(hist.new_ro_rate) : 0),
            batchMeta.updated_consumables_rate !== null && batchMeta.updated_consumables_rate !== undefined ? batchMeta.updated_consumables_rate : (hist?.new_consumables_rate ? parseFloat(hist.new_consumables_rate) : 0),
            batchMeta.updated_extra_factor !== null && batchMeta.updated_extra_factor !== undefined ? batchMeta.updated_extra_factor : (hist?.new_extra_factor ? parseFloat(hist.new_extra_factor) : 0),
            batchMeta.from_date,
            batchMeta.to_date
          ]
        );
      } else {
        await client.query(
          `UPDATE vendor_materials 
           SET revised_rate_per_kg = $1,
               revised_price = rm_weight * $1,
               mmr_rate = COALESCE($2, mmr_rate + COALESCE($8, 0::numeric)),
               ro_rate = COALESCE($3, ro_rate + COALESCE($9, 0::numeric)),
               consumables_rate = COALESCE($4, consumables_rate + COALESCE($10, 0::numeric)),
               extra_factor = COALESCE($5, extra_factor + COALESCE($11, 0::numeric)),
               from_date = $12,
               to_date = $13,
               updated_at = NOW()
           WHERE TRIM(vendor_id) = TRIM($6) AND TRIM(item_code) = TRIM($7)`,
          [
            item.customer_rate_per_kg,
            batchMeta.updated_mmr,
            batchMeta.updated_coating_rate,
            batchMeta.updated_consumables_rate,
            batchMeta.updated_extra_factor,
            batchMeta.vendor_id,
            item.item_code, // <-- changed from item.casting_code to item.item_code!
            batchMeta.mmr_change,
            batchMeta.coating_change,
            batchMeta.consumables_change,
            batchMeta.extra_change,
            batchMeta.from_date,
            batchMeta.to_date
          ]
        );
      }

      // Sync customer pricing physical tables: argit_pld1, aargit_ple1, aargit_plp1, or argit_pll1
      {
        const itemMetadataRes = await client.query<{ group_code: string; bought_out: string; dome_expo: string }>(
          `SELECT itmsgrpcod as group_code, u_bought as bought_out, u_domeexpo as dome_expo
           FROM oitm_sftp WHERE TRIM(itemcode) = $1 LIMIT 1`,
          [item.item_master_id]
        );
        const meta = itemMetadataRes.rows[0] || { group_code: '', bought_out: '', dome_expo: '' };
        const groupCode = String(meta.group_code || '');
        const boughtOut = String(meta.bought_out || '').trim();
        const domeExpo = String(meta.dome_expo || '').toUpperCase();

        const isLabour = ['125', '128'].includes(groupCode) || boughtOut === 'Job Work';
        const isPin = ['116', '118'].includes(groupCode) || domeExpo.includes('PIN BUSH') || domeExpo.includes('PIN PUSH') || domeExpo.includes('PIN & BUSH');

        let physicalTable = 'aargit_ple1';
        if (isLabour) physicalTable = 'argit_pll1';
        else if (isPin) physicalTable = 'aargit_plp1';
        else if (domeExpo.includes('DOMESTIC')) physicalTable = 'argit_pld1';

        // Get previous rates from the customer table
        const custCheckSql = `
          SELECT "U_MmrRate" as mmr_rate, "U_RoRate" as ro_rate, "U_ConsRate" as consumables_rate, "U_Extra" as extra_factor 
          FROM "${physicalTable}" 
          WHERE TRIM("U_ItemNo") = TRIM($1)
          ORDER BY "DocEntry"::bigint DESC LIMIT 1
        `;
        const custCheckRes = await client.query(custCheckSql, [item.item_master_id]);
        const oldCust = custCheckRes.rows[0] || { mmr_rate: 0, ro_rate: 0, consumables_rate: 0, extra_factor: 0 };

        const computedMMR = batchMeta.updated_mmr !== null && batchMeta.updated_mmr !== undefined 
          ? batchMeta.updated_mmr 
          : (Number(oldCust.mmr_rate || 0) + Number(batchMeta.mmr_change || 0));

        const computedRO = batchMeta.updated_coating_rate !== null && batchMeta.updated_coating_rate !== undefined 
          ? batchMeta.updated_coating_rate 
          : (Number(oldCust.ro_rate || 0) + Number(batchMeta.coating_change || 0));

        const computedCons = batchMeta.updated_consumables_rate !== null && batchMeta.updated_consumables_rate !== undefined 
          ? batchMeta.updated_consumables_rate 
          : (Number(oldCust.consumables_rate || 0) + Number(batchMeta.consumables_change || 0));

        const computedExtra = batchMeta.updated_extra_factor !== null && batchMeta.updated_extra_factor !== undefined 
          ? batchMeta.updated_extra_factor 
          : (Number(oldCust.extra_factor || 0) + Number(batchMeta.extra_change || 0));

        const computedRatePerKg = computedMMR + computedRO + computedCons + computedExtra;
        const computedCastingPrice = Number(item.customer_rm_weight) * computedRatePerKg;

        await client.query(
          `UPDATE "${physicalTable}"
           SET "U_CastRate" = $1,
               "U_CastPric" = $2,
               "U_MmrRate" = $3,
               "U_RoRate" = $4,
               "U_ConsRate" = $5,
               "U_Extra" = $6,
               "U_EffDateF" = $7,
               "U_EffDateT" = $8,
               "U_FinPrice" = $9,
               "U_ActCost" = $10,
               pricing_audit_status = 'pending'
           WHERE TRIM("U_ItemNo") = $11`,
          [
            computedRatePerKg,
            computedCastingPrice,
            computedMMR,
            computedRO,
            computedCons,
            computedExtra,
            batchMeta.from_date,
            batchMeta.to_date,
            item.customer_total_price,
            item.customer_total_price - computedCastingPrice,
            item.item_master_id
          ]
        );
      }

      const oldRate = Number(item.old_rate_per_kg) || 0;

      await client.query(
        `INSERT INTO item_price_history
           (casting_code, item_code, customer_name, vendor_id, batch_number, batch_id, from_date, to_date, updated_by,
            old_mmr, new_mmr, old_coating, new_coating, old_consumables, new_consumables, old_extra, new_extra,
            old_rate_per_kg, new_rate_per_kg, old_price, new_price, delta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          item.casting_code, item.item_code, item.customer_name, batchMeta?.vendor_id, batchMeta?.batch_number, item.batch_id,
          batchMeta?.from_date, batchMeta?.to_date, 'Admin',
          oldVm.mmr_rate,
          batchMeta?.updated_mmr !== null && batchMeta?.updated_mmr !== undefined ? batchMeta.updated_mmr : (Number(oldVm.mmr_rate) + Number(batchMeta?.mmr_change || 0)),
          oldVm.ro_rate,
          batchMeta?.updated_coating_rate !== null && batchMeta?.updated_coating_rate !== undefined ? batchMeta.updated_coating_rate : (Number(oldVm.ro_rate) + Number(batchMeta?.coating_change || 0)),
          oldVm.consumables_rate,
          batchMeta?.updated_consumables_rate !== null && batchMeta?.updated_consumables_rate !== undefined ? batchMeta.updated_consumables_rate : (Number(oldVm.consumables_rate) + Number(batchMeta?.consumables_change || 0)),
          oldVm.extra_factor,
          batchMeta?.updated_extra_factor !== null && batchMeta?.updated_extra_factor !== undefined ? batchMeta.updated_extra_factor : (Number(oldVm.extra_factor) + Number(batchMeta?.extra_change || 0)),
          oldRate, item.customer_rate_per_kg,
          item.old_price, item.customer_total_price, item.customer_total_price - item.old_price
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function holdItems(itemIds: number[]): Promise<void> {
  await query(
    `UPDATE pricing_batch_items SET status = 'dispute' WHERE id = ANY($1::int[])`,
    [itemIds]
  );
}

export async function disputeItems(itemIds: number[]): Promise<void> {
  await query(
    `UPDATE pricing_batch_items SET status = 'dispute_raised' WHERE id = ANY($1::int[])`,
    [itemIds]
  );
}

let isDisputesMigrated = false;
async function ensureDisputesMigration(): Promise<void> {
  if (isDisputesMigrated) return;
  try {
    await query("ALTER TABLE item_price_history ADD COLUMN IF NOT EXISTS item_description VARCHAR(255)");
    await query("ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS disputed_field VARCHAR(50) DEFAULT 'Casting Price'");
    await query("ALTER TABLE pricing_batch_items ADD COLUMN IF NOT EXISTS customer_code VARCHAR(100)");
    await query(`
      DROP VIEW IF EXISTS v_dispute_register CASCADE;
      CREATE VIEW v_dispute_register AS
      WITH customer_disputes AS (
        SELECT 
          TRIM(pld."U_ItemNo") AS item_code,
          TRIM(pld."U_CastCode") AS casting_code,
          TRIM(pld."U_CustCode") AS customer_code,
          TRIM(pld."U_CustName") AS customer_name,
          'argit_pld1' AS source_table,
          pld."U_CastWt"::numeric AS c_weight, 
          pld."U_CastRate"::numeric AS c_rate,
          pld."U_CastPric"::numeric AS c_price,
          pld."U_FinPrice"::numeric AS customer_total_price,
          pld."U_EffDateF"::text AS from_date, 
          pld."U_EffDateT"::text AS to_date,
          NULLIF(NULLIF(TRIM(pld."U_PowdCoat"::text), '?'), '')::numeric as powder_coating,
          NULLIF(NULLIF(TRIM(pld."U_PowdCoatWt"::text), '?'), '')::numeric as powder_coating_weight,
          NULLIF(NULLIF(TRIM(pld."U_PowdCoatRate"::text), '?'), '')::numeric as powder_coating_rate,
          NULLIF(NULLIF(TRIM(pld."U_SpecProc"::text), '?'), '')::numeric as special_process,
          NULLIF(NULLIF(TRIM(pld."U_SpecProcWt"::text), '?'), '')::numeric as special_process_weight,
          NULLIF(NULLIF(TRIM(pld."U_SpecProcRate"::text), '?'), '')::numeric as special_process_rate,
          NULLIF(NULLIF(TRIM(pld."U_RejCost"::text), '?'), '')::numeric as rejection_cost,
          NULLIF(NULLIF(TRIM(pld."U_ProcMach"::text), '?'), '')::numeric as process,
          NULLIF(NULLIF(TRIM(pld."U_TranChar"::text), '?'), '')::numeric as trans_charges,
          NULLIF(NULLIF(TRIM(pld."U_OHP"::text), '?'), '')::numeric as ohp,
          NULLIF(NULLIF(TRIM(pld."U_Packing"::text), '?'), '')::numeric as packing,
          'dispute_raised'::text AS status,
          'Casting Price'::text AS disputed_field
        FROM argit_pld1 pld WHERE pld.pricing_audit_status = 'disputed'

        UNION ALL

        SELECT 
          TRIM(ple."U_ItemNo") AS item_code,
          TRIM(ple."U_CastCode") AS casting_code,
          TRIM(ple."U_CustCode") AS customer_code,
          TRIM(ple."U_CustName") AS customer_name,
          'aargit_ple1' AS source_table,
          ple."U_CastWt"::numeric AS c_weight, 
          ple."U_CastRate"::numeric AS c_rate,
          ple."U_CastPric"::numeric AS c_price,
          ple."U_FinPrice"::numeric AS customer_total_price,
          ple."U_EffDateF"::text AS from_date, 
          ple."U_EffDateT"::text AS to_date,
          NULLIF(NULLIF(TRIM(ple."U_PowdCoat"::text), '?'), '')::numeric as powder_coating,
          NULLIF(NULLIF(TRIM(ple."U_PowdCoatWt"::text), '?'), '')::numeric as powder_coating_weight,
          NULLIF(NULLIF(TRIM(ple."U_PowdCoatRate"::text), '?'), '')::numeric as powder_coating_rate,
          NULLIF(NULLIF(TRIM(ple."U_SpecProc"::text), '?'), '')::numeric as special_process,
          NULLIF(NULLIF(TRIM(ple."U_SpecProcWt"::text), '?'), '')::numeric as special_process_weight,
          NULLIF(NULLIF(TRIM(ple."U_SpecProcRate"::text), '?'), '')::numeric as special_process_rate,
          NULLIF(NULLIF(TRIM(ple."U_RejCost"::text), '?'), '')::numeric as rejection_cost,
          NULLIF(NULLIF(TRIM(ple."U_ProcMach"::text), '?'), '')::numeric as process,
          NULLIF(NULLIF(TRIM(ple."U_TranChar"::text), '?'), '')::numeric as trans_charges,
          NULLIF(NULLIF(TRIM(ple."U_OHP"::text), '?'), '')::numeric as ohp,
          NULLIF(NULLIF(TRIM(ple."U_Packing"::text), '?'), '')::numeric as packing,
          'dispute_raised'::text AS status,
          'Casting Price'::text AS disputed_field
        FROM aargit_ple1 ple WHERE ple.pricing_audit_status = 'disputed'

        UNION ALL

        SELECT 
          TRIM(pll."U_ItemNo") AS item_code,
          TRIM(pll."U_CastCode") AS casting_code,
          TRIM(pll."U_CustCode") AS customer_code,
          TRIM(pll."U_CustName") AS customer_name,
          'argit_pll1' AS source_table,
          pll."U_CastWt"::numeric AS c_weight, 
          pll."U_CastRate"::numeric AS c_rate,
          pll."U_CastPric"::numeric AS c_price,
          pll."U_FinPrice"::numeric AS customer_total_price,
          pll."U_EffDateF"::text AS from_date, 
          pll."U_EffDateT"::text AS to_date,
          NULLIF(NULLIF(TRIM(pll."U_PowdCoat"::text), '?'), '')::numeric as powder_coating,
          NULLIF(NULLIF(TRIM(pll."U_PowdCoatWt"::text), '?'), '')::numeric as powder_coating_weight,
          NULLIF(NULLIF(TRIM(pll."U_PowdCoatRate"::text), '?'), '')::numeric as powder_coating_rate,
          NULLIF(NULLIF(TRIM(pll."U_SpecProc"::text), '?'), '')::numeric as special_process,
          NULLIF(NULLIF(TRIM(pll."U_SpecProcWt"::text), '?'), '')::numeric as special_process_weight,
          NULLIF(NULLIF(TRIM(pll."U_SpecProcRate"::text), '?'), '')::numeric as special_process_rate,
          NULLIF(NULLIF(TRIM(pll."U_RejCost"::text), '?'), '')::numeric as rejection_cost,
          NULLIF(NULLIF(TRIM(pll."U_ProcMach"::text), '?'), '')::numeric as process,
          NULLIF(NULLIF(TRIM(pll."U_TranChar"::text), '?'), '')::numeric as trans_charges,
          NULLIF(NULLIF(TRIM(pll."U_OHP"::text), '?'), '')::numeric as ohp,
          NULLIF(NULLIF(TRIM(pll."U_Packing"::text), '?'), '')::numeric as packing,
          'dispute_raised'::text AS status,
          'Casting Price'::text AS disputed_field
        FROM argit_pll1 pll WHERE pll.pricing_audit_status = 'disputed'

        UNION ALL

        SELECT 
          TRIM(plp."U_ItemNo") AS item_code,
          TRIM(plp."U_CastCode") AS casting_code,
          TRIM(plp."U_CustCode") AS customer_code,
          TRIM(plp."U_CustName") AS customer_name,
          'aargit_plp1' AS source_table,
          plp."U_CastWt"::numeric AS c_weight, 
          plp."U_CastRate"::numeric AS c_rate,
          plp."U_CastPric"::numeric AS c_price,
          plp."U_FinPrice"::numeric AS customer_total_price,
          plp."U_EffDateF"::text AS from_date, 
          plp."U_EffDateT"::text AS to_date,
          NULLIF(NULLIF(TRIM(plp."U_PowdCoat"::text), '?'), '')::numeric as powder_coating,
          NULLIF(NULLIF(TRIM(plp."U_PowdCoatWt"::text), '?'), '')::numeric as powder_coating_weight,
          NULLIF(NULLIF(TRIM(plp."U_PowdCoatRate"::text), '?'), '')::numeric as powder_coating_rate,
          NULLIF(NULLIF(TRIM(plp."U_SpecProc"::text), '?'), '')::numeric as special_process,
          NULLIF(NULLIF(TRIM(plp."U_SpecProcWt"::text), '?'), '')::numeric as special_process_weight,
          NULLIF(NULLIF(TRIM(plp."U_SpecProcRate"::text), '?'), '')::numeric as special_process_rate,
          NULLIF(NULLIF(TRIM(plp."U_RejCost"::text), '?'), '')::numeric as rejection_cost,
          NULLIF(NULLIF(TRIM(plp."U_ProcMach"::text), '?'), '')::numeric as process,
          NULLIF(NULLIF(TRIM(plp."U_TranChar"::text), '?'), '')::numeric as trans_charges,
          NULLIF(NULLIF(TRIM(plp."U_OHP"::text), '?'), '')::numeric as ohp,
          NULLIF(NULLIF(TRIM(plp."U_Packing"::text), '?'), '')::numeric as packing,
          'dispute_raised'::text AS status,
          'Casting Price'::text AS disputed_field
        FROM aargit_plp1 plp WHERE plp.pricing_audit_status = 'disputed'
      )
      SELECT 
        0 AS item_id,
        cd.item_code,
        im.itemname AS item_description,
        COALESCE(cd.customer_name, o.cardname) AS customer_name,
        cd.customer_code,
        COALESCE(cd.casting_code, cd.item_code) AS casting_code,
        vm.vendor_id,
        v.cardname AS vendor_name,
        cd.c_price AS customer_rm_price,
        cd.c_weight AS customer_rm_weight,
        cd.c_rate AS customer_rate_per_kg,
        COALESCE(vm.revised_price, 0) AS rm_cost,
        COALESCE(vm.rm_weight, 0) AS rm_weight,
        0 AS old_price,
        cd.status,
        'MASTER-DISPUTES'::text AS batch_number,
        cd.disputed_field,
        cd.from_date,
        cd.to_date,
        NOW() AS created_at,
        COALESCE(cd.powder_coating, 0) AS powder_coating,
        COALESCE(cd.powder_coating_weight, 0) AS powder_coating_weight,
        COALESCE(cd.powder_coating_rate, 0) AS powder_coating_rate,
        COALESCE(cd.special_process, 0) AS special_process,
        COALESCE(cd.special_process_weight, 0) AS special_process_weight,
        COALESCE(cd.special_process_rate, 0) AS special_process_rate,
        COALESCE(cd.rejection_cost, 0) AS rejection_cost,
        COALESCE(cd.process, 0) AS process,
        COALESCE(cd.trans_charges, 0) AS trans_charges,
        COALESCE(cd.ohp, 0) AS ohp,
        COALESCE(cd.packing, 0) AS packing,
        cd.c_weight AS pld_wt,
        cd.c_rate AS pld_rate,
        vm.rm_weight::numeric AS vm_wt,
        vm.revised_rate_per_kg::numeric AS vm_rate,
        v.cardname AS vm_vendor_name
      FROM customer_disputes AS cd
      LEFT JOIN LATERAL (
        SELECT cardname FROM ocrd_sftp WHERE TRIM(cardcode) = TRIM(cd.customer_code) LIMIT 1
      ) o ON true
      LEFT JOIN LATERAL (
        SELECT itemname FROM oitm_sftp WHERE TRIM(itemcode) = TRIM(cd.item_code) LIMIT 1
      ) im ON true
      LEFT JOIN LATERAL (
        SELECT 
          vm_combined.rm_weight, 
          vm_combined.revised_price, 
          vm_combined.revised_rate_per_kg, 
          vm_combined.vendor_id
        FROM (
          SELECT 
            vendor_id, item_code, casting_code, customer_name,
            rm_weight, revised_price, revised_rate_per_kg,
            from_date, to_date,
            COALESCE(updated_at, NOW()) AS changed_at
          FROM vendor_materials
          UNION ALL
          SELECT 
            vendor_id, item_code, casting_code, customer_name,
            new_rm_weight AS rm_weight, new_revised_price AS revised_price, new_revised_rate_per_kg AS revised_rate_per_kg,
            from_date, to_date,
            changed_at
          FROM vendor_materials_history
        ) vm_combined
        WHERE (
          TRIM(vm_combined.item_code) = TRIM(cd.item_code) 
          OR TRIM(vm_combined.casting_code) = TRIM(cd.item_code)
          OR TRIM(vm_combined.item_code) = TRIM(cd.casting_code)
          OR TRIM(vm_combined.casting_code) = TRIM(cd.casting_code)
          OR (
            LENGTH(TRIM(cd.item_code)) >= 10 
            AND (
              TRIM(vm_combined.item_code) ILIKE SUBSTRING(TRIM(cd.item_code) FROM 1 FOR 10) || '%'
              OR TRIM(vm_combined.casting_code) ILIKE SUBSTRING(TRIM(cd.item_code) FROM 1 FOR 10) || '%'
            )
          )
        )
        ORDER BY 
          CASE 
            WHEN cd.customer_name IS NOT NULL AND TRIM(vm_combined.customer_name) ILIKE TRIM(cd.customer_name) THEN 0
            WHEN TRIM(vm_combined.customer_name) = 'All' OR TRIM(COALESCE(vm_combined.customer_name, '')) = '' THEN 1
            ELSE 2
          END,
          CASE 
            WHEN cd.from_date IS NOT NULL AND cd.from_date ~ '^\d{4}-\d{2}-\d{2}$' 
                 AND vm_combined.from_date IS NOT NULL
                 AND vm_combined.from_date <= (cd.to_date::DATE)
                 AND COALESCE(vm_combined.to_date, '2099-12-31'::DATE) >= (cd.from_date::DATE) THEN 0
            WHEN cd.from_date IS NOT NULL AND cd.from_date ~ '^\d{4}-\d{2}-\d{2}$' 
                 AND vm_combined.from_date IS NOT NULL
                 AND vm_combined.from_date <= (cd.from_date::DATE) THEN 1
            ELSE 2
          END,
          vm_combined.changed_at DESC
        LIMIT 1
      ) vm ON true
      LEFT JOIN LATERAL (
        SELECT cardname FROM ocrd_sftp WHERE TRIM(cardcode) = TRIM(vm.vendor_id) LIMIT 1
      ) v ON true;
    `);

    const tables = ['argit_pld1', 'aargit_ple1', 'argit_pll1', 'aargit_plp1'];
    for (const tbl of tables) {
      const fnName = `trigger_${tbl}_revert_on_change`;
      await query(`
        CREATE OR REPLACE FUNCTION public.${fnName}()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$ 
        BEGIN
          IF current_setting('app.bypass_revert_trigger', true) = 'true' THEN
            RETURN NEW;
          END IF;

          IF OLD.pricing_audit_status = 'approved' AND NEW.pricing_audit_status = 'approved' AND (
            NEW."U_CastWt" IS DISTINCT FROM OLD."U_CastWt"
            OR NEW."U_CastRate" IS DISTINCT FROM OLD."U_CastRate"
            OR NEW."U_CastPric" IS DISTINCT FROM OLD."U_CastPric"
            OR NEW."U_SpecProcWt" IS DISTINCT FROM OLD."U_SpecProcWt"
            OR NEW."U_SpecProcRate" IS DISTINCT FROM OLD."U_SpecProcRate"
            OR NEW."U_SpecProc" IS DISTINCT FROM OLD."U_SpecProc"
            OR NEW."U_RejCost" IS DISTINCT FROM OLD."U_RejCost"
            OR NEW."U_PowdCoat" IS DISTINCT FROM OLD."U_PowdCoat"
            OR NEW."U_ProcMach" IS DISTINCT FROM OLD."U_ProcMach"
            OR NEW."U_TranChar" IS DISTINCT FROM OLD."U_TranChar"
            OR NEW."U_OHP" IS DISTINCT FROM OLD."U_OHP"
            OR NEW."U_Packing" IS DISTINCT FROM OLD."U_Packing"
            OR NEW."U_FinPrice" IS DISTINCT FROM OLD."U_FinPrice"
            OR NEW."U_RoRate" IS DISTINCT FROM OLD."U_RoRate"
            OR NEW."U_ConsRate" IS DISTINCT FROM OLD."U_ConsRate"
            OR NEW."U_MmrRate" IS DISTINCT FROM OLD."U_MmrRate"
            OR NEW."U_Extra" IS DISTINCT FROM OLD."U_Extra"
          ) THEN
            NEW.pricing_audit_status := 'pending';
          END IF;
          RETURN NEW;
        END; 
        $function$;
      `);
    }

    // Ensure foreign key constraints on history tables support ON DELETE CASCADE
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'item_price_history_batch_id_fkey'
        ) THEN
          ALTER TABLE item_price_history DROP CONSTRAINT item_price_history_batch_id_fkey;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'customer_pricing_history_batch_id_fkey'
        ) THEN
          ALTER TABLE customer_pricing_history DROP CONSTRAINT customer_pricing_history_batch_id_fkey;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'item_price_history'
        ) THEN
          ALTER TABLE item_price_history ADD CONSTRAINT item_price_history_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES pricing_batches(id) ON DELETE CASCADE;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_pricing_history'
        ) THEN
          ALTER TABLE customer_pricing_history ADD CONSTRAINT customer_pricing_history_batch_id_fkey 
            FOREIGN KEY (batch_id) REFERENCES pricing_batches(id) ON DELETE CASCADE;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END $$;
    `);

    isDisputesMigrated = true;
  } catch (err) {
    console.error('Failed to run disputes migration:', err);
  }
}

export async function raiseDisputeFromMaster(
  itemCode: string,
  customerCode: string,
  customerName: string,
  castingCode: string,
  approvalDate?: string,
  vendorId?: string,
  disputes?: Array<{ disputedField: string; newPrice: number; customerTotalPrice: number }>,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  await ensureDisputesMigration();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (disputes && disputes.length > 0) {
      for (const d of disputes) {
        const { disputedField, newPrice, customerTotalPrice } = d;

        // Build date filter if dates provided (quarter scoping)
        const pbiBaseParams: any[] = [itemCode, customerName, customerCode, disputedField];
        let dateFilterStr = '';
        if (fromDate) {
          dateFilterStr += ` AND (from_date IS NULL OR from_date = $${pbiBaseParams.length + 1}::DATE)`;
          pbiBaseParams.push(fromDate);
        }
        if (toDate) {
          dateFilterStr += ` AND (to_date IS NULL OR to_date = $${pbiBaseParams.length + 1}::DATE)`;
          pbiBaseParams.push(toDate);
        }

        // 1. Try to find a matching pricing_batch_items record for this item code, customer, disputed_field and dates
        const pbiRes = await client.query<any>(
          `SELECT id FROM pricing_batch_items
           WHERE TRIM(item_code) = TRIM($1)
             AND (TRIM(customer_name) = TRIM($2) OR ($3 <> '' AND (customer_code = $3 OR TRIM(customer_name) ILIKE '%' || TRIM($2) || '%')))
             AND COALESCE(disputed_field, 'Casting Price') = $4
             ${dateFilterStr}
           ORDER BY id DESC LIMIT 1`,
          pbiBaseParams
        );
        const pbi = pbiRes.rows[0];

        if (pbi) {
          await client.query(
            `UPDATE pricing_batch_items
             SET status = 'dispute_raised',
                 customer_code = $5,
                 new_price = $2,
                 customer_total_price = $3,
                 rm_cost = $2,
                 customer_rm_price = $3,
                 disputed_field = $4,
                 from_date = COALESCE(from_date, $6::DATE),
                 to_date = COALESCE(to_date, $7::DATE)
             WHERE id = $1`,
            [pbi.id, newPrice, customerTotalPrice, disputedField, customerCode, fromDate || null, toDate || null]
          );
        } else {
          // 2. If no batch item exists, find or create a default "MASTER-DISPUTES" batch
          let batchRes = await client.query<any>(
            `SELECT id FROM pricing_batches WHERE batch_number = 'MASTER-DISPUTES' LIMIT 1`
          );
          let batchId = batchRes.rows[0]?.id;
          if (!batchId) {
            const insertBatch = await client.query<any>(
              `INSERT INTO pricing_batches (batch_number, status, description)
               VALUES ('MASTER-DISPUTES', 'approved', 'Master Disputes Batch') RETURNING id`
            );
            batchId = insertBatch.rows[0].id;
          }

          let resolvedCustomerName = customerName;
          if (!resolvedCustomerName || resolvedCustomerName === customerCode) {
            const custRes = await client.query<{ cardname: string }>(
              `SELECT cardname FROM ocrd_sftp WHERE TRIM(cardcode) = TRIM($1) LIMIT 1`,
              [customerCode]
            );
            if (custRes.rows[0]?.cardname) {
              resolvedCustomerName = custRes.rows[0].cardname;
            }
          }

          // Insert a new row in pricing_batch_items with status = 'dispute_raised', passing default 0 for not-null columns
          await client.query(
            `INSERT INTO pricing_batch_items (
               batch_id, item_code, item_master_id, customer_name, customer_code, casting_code,
               customer_total_price, new_price, old_price, status,
               rm_weight, rm_cost, machining, subcon, overhead_pct, packing,
               rejection_cost, powder_coating, special_process, trans_charges, delta,
               customer_rm_weight, customer_rate_per_kg, customer_rm_price, customer_delta,
               disputed_field, from_date, to_date
             )
             VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $7, 'dispute_raised',
                     0, $7, 0, 0, 0, 0,
                     0, 0, 0, 0, 0,
                     0, 0, $6, 0, $8, $9::DATE, $10::DATE)`,
            [
              batchId, itemCode, resolvedCustomerName, customerCode, castingCode,
              customerTotalPrice, newPrice, disputedField,
              fromDate || null, toDate || null
            ]
          );
        }
      }
    }

    // ✅ NEW: Update customer table's pricing_audit_status to 'disputed'
    console.log(`[DISPUTE] Searching for item=${itemCode}, customer=${customerCode}`);

    const sourceTableRes = await client.query<{ source_table: string }>(
      `SELECT source_table FROM v_pricing_audit
       WHERE TRIM(item_code) = TRIM($1)
         AND TRIM(customer_code) = TRIM($2)
         AND type = 'customer'
       LIMIT 1`,
      [itemCode, customerCode]
    );

    console.log(`[DISPUTE] Found ${sourceTableRes.rows.length} rows in v_pricing_audit`);

    if (sourceTableRes.rows.length > 0) {
      const sourceTable = sourceTableRes.rows[0].source_table;
      console.log(`[DISPUTE] Source table: ${sourceTable}`);

      const tableMap: Record<string, string> = {
        'argit_pld1': 'argit_pld1',
        'aargit_ple1': 'aargit_ple1',
        'argit_pll1': 'argit_pll1',
        'aargit_plp1': 'aargit_plp1',
      };

      if (tableMap[sourceTable]) {
        const updateRes = await client.query(
          `UPDATE "${tableMap[sourceTable]}"
           SET pricing_audit_status = 'disputed'
           WHERE TRIM("U_ItemNo") = TRIM($1)
             AND TRIM("U_CustCode") = TRIM($2)`,
          [itemCode, customerCode]
        );
        console.log(`[DISPUTE] Updated ${updateRes.rowCount || 0} rows in ${sourceTable}`);
      } else {
        console.log(`[DISPUTE] Unknown source table: ${sourceTable}`);
      }
    } else {
      console.log(`[DISPUTE] Item not found in v_pricing_audit - trying direct customer table search`);
      // Fallback: try to find in any customer table
      for (const table of ['argit_pld1', 'aargit_ple1', 'argit_pll1', 'aargit_plp1']) {
        const res = await client.query(
          `UPDATE "${table}"
           SET pricing_audit_status = 'disputed'
           WHERE TRIM("U_ItemNo") = TRIM($1)
             AND TRIM("U_CustCode") = TRIM($2)`,
          [itemCode, customerCode]
        );
        if ((res.rowCount || 0) > 0) {
          console.log(`[DISPUTE] Updated ${res.rowCount || 0} rows in ${table} (fallback)`);
          break;
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function approveItemFromMaster(
  itemCode: string,
  customerCode: string,
  customerName: string,
  castingCode: string,
  approvalDate?: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  await ensureDisputesMigration();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_revert_trigger', 'true', true)");

    // Try to find the matching pricing_batch_items record for this item/customer and quarter
    const approveBaseParams: any[] = [itemCode, customerName, customerCode];
    let approveDateFilterStr = '';
    if (fromDate) {
      approveDateFilterStr += ` AND (from_date IS NULL OR from_date = $${approveBaseParams.length + 1}::DATE)`;
      approveBaseParams.push(fromDate);
    }
    if (toDate) {
      approveDateFilterStr += ` AND (to_date IS NULL OR to_date = $${approveBaseParams.length + 1}::DATE)`;
      approveBaseParams.push(toDate);
    }
    const pbiRes = await client.query<any>(
      `SELECT id FROM pricing_batch_items
       WHERE TRIM(item_code) = TRIM($1)
         AND (TRIM(customer_name) = TRIM($2) OR TRIM(customer_name) = TRIM($3))
         AND COALESCE(disputed_field, 'Casting Price') = 'Casting Price'
         ${approveDateFilterStr}
       ORDER BY id DESC LIMIT 1`,
      approveBaseParams
    );
    const pbi = pbiRes.rows[0];

    if (pbi) {
      await client.query(
        `UPDATE pricing_batch_items SET status = 'approved_master' WHERE id = $1`,
        [pbi.id]
      );
    } else {
      // No batch item — find or create MASTER-DISPUTES batch and insert an approved row
      let batchRes = await client.query<any>(
        `SELECT id FROM pricing_batches WHERE batch_number = 'MASTER-DISPUTES' LIMIT 1`
      );
      let batchId = batchRes.rows[0]?.id;
      if (!batchId) {
        const insertBatch = await client.query<any>(
          `INSERT INTO pricing_batches (batch_number, status, description)
           VALUES ('MASTER-DISPUTES', 'approved', 'Master Disputes Batch') RETURNING id`
        );
        batchId = insertBatch.rows[0].id;
      }

      await client.query(
        `INSERT INTO pricing_batch_items (
           batch_id, item_code, item_master_id, customer_name, casting_code,
           customer_total_price, new_price, old_price, status,
           rm_weight, rm_cost, machining, subcon, overhead_pct, packing,
           rejection_cost, powder_coating, special_process, trans_charges, delta,
           customer_rm_weight, customer_rate_per_kg, customer_rm_price, customer_delta,
           disputed_field, from_date, to_date
         )
         VALUES ($1, $2, $2, $3, $4, 0, 0, 0, 'approved_master',
                 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Casting Price', $5::DATE, $6::DATE)`,
        [batchId, itemCode, customerName, castingCode, fromDate || null, toDate || null]
      );
    }

    // ✅ NEW: Update customer table's pricing_audit_status to 'approved'
    console.log(`[APPROVE] Searching for item=${itemCode}, customer=${customerCode}`);

    const sourceTableRes = await client.query<{ source_table: string }>(
      `SELECT source_table FROM v_pricing_audit
       WHERE TRIM(item_code) = TRIM($1)
         AND TRIM(customer_code) = TRIM($2)
         AND type = 'customer'
       LIMIT 1`,
      [itemCode, customerCode]
    );

    console.log(`[APPROVE] Found ${sourceTableRes.rows.length} rows in v_pricing_audit`);

    if (sourceTableRes.rows.length > 0) {
      const sourceTable = sourceTableRes.rows[0].source_table;
      console.log(`[APPROVE] Source table: ${sourceTable}`);

      const tableMap: Record<string, string> = {
        'argit_pld1': 'argit_pld1',
        'aargit_ple1': 'aargit_ple1',
        'argit_pll1': 'argit_pll1',
        'aargit_plp1': 'aargit_plp1',
      };

      if (tableMap[sourceTable]) {
        const updateRes = await client.query(
          `UPDATE "${tableMap[sourceTable]}"
           SET pricing_audit_status = 'approved'
           WHERE TRIM("U_ItemNo") = TRIM($1)
             AND TRIM("U_CustCode") = TRIM($2)`,
          [itemCode, customerCode]
        );
        console.log(`[APPROVE] Updated ${updateRes.rowCount || 0} rows in ${sourceTable}`);
      } else {
        console.log(`[APPROVE] Unknown source table: ${sourceTable}`);
      }
    } else {
      console.log(`[APPROVE] Item not found in v_pricing_audit - trying direct customer table search`);
      // Fallback: try to find in any customer table
      for (const table of ['argit_pld1', 'aargit_ple1', 'argit_pll1', 'aargit_plp1']) {
        const res = await client.query(
          `UPDATE "${table}"
           SET pricing_audit_status = 'approved'
           WHERE TRIM("U_ItemNo") = TRIM($1)
             AND TRIM("U_CustCode") = TRIM($2)`,
          [itemCode, customerCode]
        );
        if ((res.rowCount || 0) > 0) {
          console.log(`[APPROVE] Updated ${res.rowCount || 0} rows in ${table} (fallback)`);
          break;
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}



export async function getDisputes(): Promise<any[]> {
  await ensureDisputesMigration();
  const rows = await query(`SELECT * FROM v_dispute_register ORDER BY item_id DESC`);
  
  return rows.map((r: any) => {
    let customerType = 'Domestic';
    const custStr = (r.customer_name || '').toLowerCase();
    if (custStr.includes('export') || custStr.includes('s.p.a') || custStr.includes('gmbh')) customerType = 'Export';
    else if (custStr.includes('hydreco')) customerType = 'Labour / Job Work';

    const resolvedVendorName = r.vendor_name || r.vm_vendor_name || '';

    let cWeight = Number(r.customer_rm_weight) || Number(r.pld_wt) || 0;
    let cRate = Number(r.customer_rate_per_kg) || Number(r.pld_rate) || 0;
    let cPrice = Number(r.customer_rm_price) || (cWeight * cRate);

    const pcCost = Number(r.powder_coating || 0);
    const spCost = Number(r.special_process || 0);
    const rejCost = Number(r.rejection_cost || 0);
    const procCost = Number(r.process || 0);
    const transCost = Number(r.trans_charges || 0);
    const ohpCost = Number(r.ohp || 0);
    const packCost = Number(r.packing || 0);

    const actCost = rejCost + pcCost + spCost + procCost + transCost + ohpCost + packCost;
    const customerTotalPrice = Number(r.customer_total_price) || (cPrice + actCost);

    let vWeight = Number(r.rm_weight) || Number(r.vm_wt) || 0;
    let vRate = 0;
    if (Number(r.rm_weight) > 0 && Number(r.rm_cost) > 0 && Number(r.rm_cost) !== Number(r.rm_weight)) {
      // Check if rm_cost was set to total casting price
      const impliedRate = Number(r.rm_cost) / Number(r.rm_weight);
      vRate = impliedRate < 100 ? impliedRate : (Number(r.vm_rate) || Number(r.rm_cost));
    } else {
      vRate = Number(r.vm_rate) || Number(r.rm_cost) || 0;
    }
    let vPrice = Number(r.rm_cost) || (vWeight * vRate);

    const diff = Math.abs(vPrice - customerTotalPrice);
    const isEuro = customerType === 'Export';
    const currency = isEuro ? '€' : '₹';

    const itemIdVal = r.item_id ? `DSP-${r.item_id}` : `DSP-${r.item_code}-${r.customer_code || 'cust'}`;

    return {
      id: itemIdVal,
      dbId: r.item_id || 0,
      batchId: r.batch_number || 'MASTER-DISPUTES',
      status: 'Open',
      itemCode: r.item_code,
      itemDescription: r.item_description || 'Unknown Item',
      customer: r.customer_name,
      vendorName: resolvedVendorName,
      customerType,
      castingCode: r.casting_code || r.item_code,
      disputedField: r.disputed_field,
      fromDate: r.from_date || null,
      toDate: r.to_date || null,
      createdAt: r.created_at || null,
      powderCoating: pcCost,
      powderCoatingWeight: Number(r.powder_coating_weight || 0),
      powderCoatingRate: Number(r.powder_coating_rate || 0),
      specialProcess: spCost,
      specialProcessWeight: Number(r.special_process_weight || 0),
      specialProcessRate: Number(r.special_process_rate || 0),
      rejectionCost: rejCost,
      process: procCost,
      transCharges: transCost,
      ohp: ohpCost,
      packing: packCost,
      updatedValue: `${currency}${vPrice.toFixed(2)}`,
      custApprovedValue: `${currency}${customerTotalPrice.toFixed(2)}`,
      difference: `${currency}${diff.toFixed(2)}`,
      oldPrice: `${currency}${Number(r.old_price || 0).toFixed(2)}`,
      cWeight,
      cRate,
      cPrice,
      customerTotalPrice,
      vWeight,
      vPrice,
      vRate,
    };
  });
}

export async function rejectBatch(id: number, reason: string): Promise<PricingBatch> {
  const row = await queryOne<PricingBatchRow>(
    `UPDATE pricing_batches
     SET status = $1,
         description = CONCAT(description, ' [REJECTED: ', $3::text, ']')
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [BATCH_STATUS.REJECTED, id, reason]
  );
  if (!row) throw new Error('Batch not found or not in pending state');
  const batch = await getBatchById(id);
  if (!batch) throw new Error('Batch rejected but could not be fetched');
  return batch;
}

export async function getCustomerPriceLog(castingCode?: string, customerCode?: string): Promise<ItemPriceHistory[]> {
  const params: any[] = [];
  const conditions: string[] = [];
  if (castingCode) {
    params.push(castingCode.trim());
    conditions.push(`(TRIM(h.casting_code) = $${params.length})`);
  }
  if (customerCode) {
    params.push(customerCode.trim());
    conditions.push(`TRIM(h.customer_code) = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT h.*,
            im.itemname as item_name_oitm,
            im.u_grade as grade_oitm,
            TRIM(cust.cardname) as cust_name_resolved
     FROM customer_pricing_history h
     LEFT JOIN oitm_sftp im ON TRIM(im.itemcode) = TRIM(h.item_code)
     LEFT JOIN ocrd_sftp cust ON TRIM(cust.cardcode) = TRIM(h.customer_code) AND cust.cardtype = 'C'
     ${where}
     ORDER BY h.created_at DESC`,
    params
  );
  return rows.map(r => ({
    id: r.id,
    batchId: r.batch_id,
    itemCode: r.item_code,
    castingCode: r.casting_code,
    customerName: r.customer_name?.trim() || r.cust_name_resolved || '',
    customerCode: r.customer_code,
    customerApprovalFoundry: r.customer_approval_foundry,
    domesticExport: r.domestic_export,
    groupName: r.group_name,
    itemDescription: r.item_description || r.item_name_oitm || '',
    grade: r.grade || r.grade_oitm || '',
    batchNumber: r.batch_number,
    fromDate: r.from_date ? toLocalDateString(r.from_date) : '',
    toDate: r.to_date ? toLocalDateString(r.to_date) : '',
    updatedBy: r.updated_by,
    oldCastWeight: r.old_cast_weight !== null && r.old_cast_weight !== undefined ? Number(r.old_cast_weight) : undefined,
    newCastWeight: r.new_cast_weight !== null && r.new_cast_weight !== undefined ? Number(r.new_cast_weight) : undefined,
    oldCastRate: r.old_cast_rate !== null && r.old_cast_rate !== undefined ? Number(r.old_cast_rate) : undefined,
    newCastRate: r.new_cast_rate !== null && r.new_cast_rate !== undefined ? Number(r.new_cast_rate) : undefined,
    oldMmr: r.old_mmr_rate !== null && r.old_mmr_rate !== undefined ? Number(r.old_mmr_rate) : undefined,
    newMmr: r.new_mmr_rate !== null && r.new_mmr_rate !== undefined ? Number(r.new_mmr_rate) : undefined,
    oldCoating: r.old_ro_rate !== null && r.old_ro_rate !== undefined ? Number(r.old_ro_rate) : undefined,
    newCoating: r.new_ro_rate !== null && r.new_ro_rate !== undefined ? Number(r.new_ro_rate) : undefined,
    oldConsumables: r.old_consumables !== null && r.old_consumables !== undefined ? Number(r.old_consumables) : undefined,
    newConsumables: r.new_consumables !== null && r.new_consumables !== undefined ? Number(r.new_consumables) : undefined,
    oldExtra: r.old_extra !== null && r.old_extra !== undefined ? Number(r.old_extra) : undefined,
    newExtra: r.new_extra !== null && r.new_extra !== undefined ? Number(r.new_extra) : undefined,
    oldRatePerKg: r.old_cast_rate !== null && r.old_cast_rate !== undefined ? Number(r.old_cast_rate) : undefined,
    newRatePerKg: r.new_cast_rate !== null && r.new_cast_rate !== undefined ? Number(r.new_cast_rate) : undefined,
    rmWeight: r.new_cast_weight !== null && r.new_cast_weight !== undefined ? Number(r.new_cast_weight) : undefined,
    oldPrice: Number(r.old_price),
    newPrice: Number(r.new_price),
    delta: Number(r.delta),
    createdAt: r.created_at
  }));
}

export async function getPriceLog(castingCode?: string, itemCode?: string, vendorId?: string): Promise<ItemPriceHistory[]> {
  await ensureDisputesMigration();
  const params: string[] = [];
  const conditions: string[] = [];
  if (castingCode) {
    params.push(castingCode.trim());
    conditions.push(`(TRIM(h.casting_code) = $${params.length} OR TRIM(im.u_castingcode) = $${params.length})`);
  }
  if (itemCode) {
    params.push(itemCode.trim());
    conditions.push(`TRIM(h.item_code) = $${params.length}`);
  }
  if (vendorId) {
    params.push(vendorId.trim());
    conditions.push(`TRIM(h.vendor_id) = $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = await query<ItemPriceHistoryRow & { item_description: string; grade: string; rm_weight: string; new_rm_weight?: string; master_rm_weight?: string; changed_fields?: any; machine_type?: string; coating?: string; cavity?: string; core_sleeve?: string }>(
    `    WITH combined_history AS (
      SELECT
        id, batch_id, TRIM(item_code) as item_code, TRIM(casting_code) as casting_code, customer_name, vendor_id,
        batch_number,
        old_mmr, new_mmr, old_coating, new_coating, old_consumables, new_consumables,
        old_extra, new_extra, old_rate_per_kg, new_rate_per_kg, old_price, new_price,
        delta, created_at, from_date, to_date, updated_by, NULL::jsonb as changed_fields,
        NULL::varchar as item_description, NULL::varchar as grade,
        NULL::varchar as machine_type, NULL::varchar as coating, NULL::varchar as cavity, NULL::varchar as core_sleeve
      FROM item_price_history
      WHERE vendor_id IS NOT NULL AND vendor_id != ''
      UNION ALL
      SELECT
        -vh.id as id, NULL as batch_id, TRIM(COALESCE(vh.item_code, vh.casting_code)) as item_code, TRIM(vh.casting_code) as casting_code, vh.customer_name, vh.vendor_id as vendor_id,
        'Vendor Material Update' as batch_number,
        old_mmr_rate as old_mmr, new_mmr_rate as new_mmr,
        old_ro_rate as old_coating, new_ro_rate as new_coating,
        old_consumables_rate as old_consumables, new_consumables_rate as new_consumables,
        old_extra_factor as old_extra, new_extra_factor as new_extra,
        old_revised_rate_per_kg as old_rate_per_kg, new_revised_rate_per_kg as new_rate_per_kg,
        old_revised_price as old_price, new_revised_price as new_price,
        (new_revised_price - COALESCE(old_revised_price, 0)) as delta,
        changed_at as created_at, from_date, to_date, 'Vendor Update' as updated_by, NULL::jsonb as changed_fields,
        vh.item_description, vh.grade,
        vh.machine_type, vh.coating, vh.cavity, vh.core_sleeve
      FROM vendor_materials_history vh
      WHERE vh.vendor_id IS NOT NULL AND vh.vendor_id != ''
        AND vh.from_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM item_price_history iph
          WHERE iph.vendor_id = vh.vendor_id 
            AND iph.casting_code = vh.casting_code
            AND ABS(EXTRACT(EPOCH FROM (iph.created_at - vh.changed_at))) < 5
        )
    )
    SELECT 
      h.id, h.batch_id, h.item_code, h.casting_code, h.customer_name, h.vendor_id, h.batch_number,
      h.old_mmr, h.new_mmr, h.old_coating, h.new_coating, h.old_consumables, h.new_consumables,
      h.old_extra, h.new_extra, h.old_rate_per_kg, h.new_rate_per_kg, h.old_price, h.new_price,
      h.delta, h.created_at, h.from_date, h.to_date, h.updated_by, h.changed_fields,
      v.cardname as vendor_name, 
      COALESCE(
        NULLIF(TRIM(h.item_description), ''),
        NULLIF(TRIM(vm.item_description), ''),
        NULLIF(TRIM(im.itemname), '')
      ) as item_description, 
      COALESCE(h.grade, vm.grade, im.u_grade) as grade, 
      COALESCE(h.machine_type, vm.machine_type) as machine_type,
      COALESCE(h.coating, vm.coating) as coating,
      COALESCE(h.cavity, vm.cavity) as cavity,
      COALESCE(h.core_sleeve, vm.core_sleeve) as core_sleeve,
      pbi.rm_weight, vh.new_rm_weight, vm.rm_weight as master_rm_weight
    FROM combined_history h
    LEFT JOIN ocrd_sftp v ON h.vendor_id = v.cardcode
    LEFT JOIN oitm_sftp im ON im.itemcode = h.item_code
    LEFT JOIN pricing_batch_items pbi ON pbi.batch_id = h.batch_id AND pbi.item_code = h.item_code
    LEFT JOIN vendor_materials_history vh ON vh.id = -h.id AND h.id < 0
    LEFT JOIN vendor_materials vm ON vm.vendor_id = h.vendor_id AND (vm.item_code = h.item_code OR vm.casting_code = h.casting_code OR vm.casting_code = h.item_code OR vm.item_code = h.casting_code)
    ${where} 
    ORDER BY h.created_at DESC`,
    params
  );
  return rows.map(r => ({
    id: r.id,
    batchId: r.batch_id,
    itemCode: r.item_code,
    castingCode: r.casting_code,
    itemDescription: r.item_description,
    grade: r.grade,
    rmWeight: r.new_rm_weight ? Number(r.new_rm_weight) : (r.rm_weight ? Number(r.rm_weight) : (r.master_rm_weight ? Number(r.master_rm_weight) : undefined)),
    customerName: r.customer_name,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    batchNumber: r.batch_number,
    fromDate: r.from_date ? toLocalDateString(r.from_date) : '',
    toDate: r.to_date ? toLocalDateString(r.to_date) : '',
    updatedBy: r.updated_by,
    
    oldMmr: r.old_mmr !== null && r.old_mmr !== undefined ? Number(r.old_mmr) : undefined,
    newMmr: r.new_mmr !== null && r.new_mmr !== undefined ? Number(r.new_mmr) : undefined,
    oldCoating: r.old_coating !== null && r.old_coating !== undefined ? Number(r.old_coating) : undefined,
    newCoating: r.new_coating !== null && r.new_coating !== undefined ? Number(r.new_coating) : undefined,
    oldConsumables: r.old_consumables !== null && r.old_consumables !== undefined ? Number(r.old_consumables) : undefined,
    newConsumables: r.new_consumables !== null && r.new_consumables !== undefined ? Number(r.new_consumables) : undefined,
    oldExtra: r.old_extra !== null && r.old_extra !== undefined ? Number(r.old_extra) : undefined,
    newExtra: r.new_extra !== null && r.new_extra !== undefined ? Number(r.new_extra) : undefined,
    oldRatePerKg: r.old_rate_per_kg !== null && r.old_rate_per_kg !== undefined ? Number(r.old_rate_per_kg) : undefined,
    newRatePerKg: r.new_rate_per_kg !== null && r.new_rate_per_kg !== undefined ? Number(r.new_rate_per_kg) : undefined,
    
    oldPrice: Number(r.old_price),
    newPrice: Number(r.new_price),
    delta: Number(r.delta),
    changedFields: r.changed_fields,
    createdAt: r.created_at,
    machineType: r.machine_type || undefined,
    coating: r.coating || undefined,
    cavity: r.cavity || undefined,
    coreSleeve: r.core_sleeve || undefined
  }));
}

export async function getPriceLogFilters(): Promise<{ castingCodes: string[], itemCodes: string[], vendors: { id: string, name: string }[] }> {
  const [castingCodes, itemCodes, vendors] = await Promise.all([
    query<{ casting_code: string }>(`
      SELECT DISTINCT casting_code FROM (
        SELECT casting_code FROM item_price_history WHERE casting_code IS NOT NULL AND casting_code != ''
        UNION
        SELECT casting_code FROM vendor_materials_history WHERE casting_code IS NOT NULL AND casting_code != ''
      ) sub ORDER BY casting_code
    `),
    query<{ item_code: string }>(`
      SELECT DISTINCT item_code FROM (
        SELECT item_code FROM item_price_history WHERE item_code IS NOT NULL AND item_code != ''
        UNION
        SELECT casting_code as item_code FROM vendor_materials_history WHERE casting_code IS NOT NULL AND casting_code != ''
      ) sub ORDER BY item_code
    `),
    query<{ id: string, name: string }>(`
      SELECT DISTINCT v.cardcode as id, v.cardname as name
      FROM (
        SELECT vendor_id FROM item_price_history WHERE vendor_id IS NOT NULL AND vendor_id != ''
        UNION
        SELECT vendor_id FROM vendor_materials_history WHERE vendor_id IS NOT NULL AND vendor_id != ''
      ) sub
      JOIN ocrd_sftp v ON v.cardcode = sub.vendor_id
      ORDER BY name
    `)
  ]);
  return {
    castingCodes: castingCodes.map(r => r.casting_code),
    itemCodes: itemCodes.map(r => r.item_code),
    vendors: vendors
  };
}

export async function getCustomerPriceLogFilters(): Promise<{ castingCodes: string[], customers: { code: string, name: string }[] }> {
  const [castingCodes, customers] = await Promise.all([
    query<{ casting_code: string }>(`
      SELECT DISTINCT casting_code FROM (
        SELECT "U_CastCode" as casting_code FROM "argit_pld1" WHERE "U_CastCode" IS NOT NULL AND "U_CastCode" != ''
        UNION
        SELECT "U_CastCode" as casting_code FROM "aargit_ple1" WHERE "U_CastCode" IS NOT NULL AND "U_CastCode" != ''
        UNION
        SELECT "U_CastCode" as casting_code FROM "aargit_plp1" WHERE "U_CastCode" IS NOT NULL AND "U_CastCode" != ''
        UNION
        SELECT "U_CastCode" as casting_code FROM "argit_pll1" WHERE "U_CastCode" IS NOT NULL AND "U_CastCode" != ''
        UNION
        SELECT casting_code FROM customer_pricing_history WHERE casting_code IS NOT NULL AND casting_code != ''
      ) sub ORDER BY casting_code
    `),
    query<{ code: string, name: string }>(`
      SELECT DISTINCT sub.code, COALESCE(NULLIF(TRIM(c.cardname), ''), sub.name) as name
      FROM (
        SELECT DISTINCT TRIM("U_CustCode") as code, TRIM("U_CustName") as name FROM "argit_pld1" WHERE "U_CustCode" IS NOT NULL AND "U_CustCode" != ''
        UNION
        SELECT DISTINCT TRIM("U_CustCode") as code, TRIM("U_CustName") as name FROM "aargit_ple1" WHERE "U_CustCode" IS NOT NULL AND "U_CustCode" != ''
        UNION
        SELECT DISTINCT TRIM("U_CustCode") as code, TRIM("U_CustName") as name FROM "aargit_plp1" WHERE "U_CustCode" IS NOT NULL AND "U_CustCode" != ''
        UNION
        SELECT DISTINCT TRIM("U_CustCode") as code, TRIM("U_CustName") as name FROM "argit_pll1" WHERE "U_CustCode" IS NOT NULL AND "U_CustCode" != ''
        UNION
        SELECT DISTINCT customer_code as code, customer_name as name FROM customer_pricing_history WHERE customer_code IS NOT NULL AND customer_code != ''
      ) sub
      LEFT JOIN ocrd_sftp c ON TRIM(c.cardcode) = sub.code
      ORDER BY name
    `)
  ]);
  return {
    castingCodes: castingCodes.map(r => r.casting_code),
    customers
  };
}

export async function submitBatch(id: number): Promise<PricingBatch> {
  const row = await queryOne<PricingBatchRow>(
    `UPDATE pricing_batches SET status = $1 WHERE id = $2 AND status = 'draft' RETURNING *`,
    [BATCH_STATUS.PENDING, id]
  );
  if (!row) throw new Error('Batch not found or not in draft state');
  const batch = await getBatchById(id);
  if (!batch) throw new Error('Batch submitted but could not be fetched');
  return batch;
}

export async function deleteBatch(id: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM item_price_history WHERE batch_id = $1', [id]);
    await client.query('DELETE FROM customer_pricing_history WHERE batch_id = $1', [id]);
    await client.query('DELETE FROM price_log WHERE batch_id = $1', [id]);
    await client.query('DELETE FROM pricing_batch_items WHERE batch_id = $1', [id]);
    const result = await client.query<{ id: number }>(
      'DELETE FROM pricing_batches WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rowCount === 0) throw new Error('Batch not found');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPoPriceAudit(): Promise<any[]> {
  await query(`
    CREATE TABLE IF NOT EXISTS pricing_audit_exceptions (
      id SERIAL PRIMARY KEY,
      doc_entry VARCHAR(50),
      line_num VARCHAR(50),
      order_type VARCHAR(10) DEFAULT 'PO',
      verified_by VARCHAR(100),
      verified_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const res = await query<any>(`
    SELECT 
      o.docnum as po_number,
      o.docentry as doc_entry,
      p.linenum as line_num,
      o.docdate as po_date,
      TRIM(o.cardcode) as vendor_code,
      TRIM(o.cardname) as vendor_name,
      TRIM(p.itemcode) as item_code,
      TRIM(p.dscription) as description,
      REPLACE(p.price::text, ',', '')::numeric as po_price,
      REPLACE(p.quantity::text, ',', '')::numeric as quantity,
      vm.revised_price::numeric as master_price,
      vm.rm_weight::numeric as rm_weight,
      vm.revised_rate_per_kg::numeric as rate_per_kg,
      (REPLACE(p.price::text, ',', '')::numeric - vm.revised_price::numeric) as variance,
      (REPLACE(p.price::text, ',', '')::numeric - vm.revised_price::numeric) * REPLACE(p.quantity::text, ',', '')::numeric as total_leakage,
      vm.mmr_rate::numeric as mmr_split,
      vm.ro_rate::numeric as coating,
      vm.consumables_rate::numeric as consumables,
      vm.extra_factor::numeric as extra_factor,
      EXISTS (
        SELECT 1 FROM pricing_audit_exceptions pae 
        WHERE TRIM(pae.doc_entry) = TRIM(o.docentry::text) 
          AND TRIM(pae.line_num) = TRIM(p.linenum::text) 
          AND pae.order_type = 'PO'
      ) as is_verified
    FROM por1_sftp p
    JOIN opor_sftp o ON REPLACE(o.docentry::text, ',', '')::integer = REPLACE(p.docentry::text, ',', '')::integer
    JOIN vendor_materials vm ON TRIM(vm.vendor_id) = TRIM(o.cardcode) 
      AND (TRIM(vm.item_code) = TRIM(p.itemcode) OR TRIM(vm.casting_code) = TRIM(p.itemcode))
    WHERE TRIM(o.docstatus) = 'O' 
      AND REPLACE(p.price::text, ',', '')::numeric <> vm.revised_price::numeric
    ORDER BY o.docdate DESC
  `);
  return res;
}

export async function verifyPoLine(docEntry: string, lineNum: string, orderType: string, verifiedBy: string): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS pricing_audit_exceptions (
      id SERIAL PRIMARY KEY,
      doc_entry VARCHAR(50),
      line_num VARCHAR(50),
      order_type VARCHAR(10) DEFAULT 'PO',
      verified_by VARCHAR(100),
      verified_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(
    `INSERT INTO pricing_audit_exceptions (doc_entry, line_num, order_type, verified_by) 
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [docEntry, lineNum, orderType, verifiedBy]
  );
}

export async function getSoPriceAudit(): Promise<any[]> {
  await query(`
    CREATE TABLE IF NOT EXISTS pricing_audit_exceptions (
      id SERIAL PRIMARY KEY,
      doc_entry VARCHAR(50),
      line_num VARCHAR(50),
      order_type VARCHAR(10) DEFAULT 'PO',
      verified_by VARCHAR(100),
      verified_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const res = await query<any>(`
    WITH customer_prices AS (
      SELECT TRIM("U_CustCode") as customer_id, TRIM("U_ItemNo") as item_code, REPLACE("U_FinPrice"::text, ',', '')::numeric as master_price, 'Domestic' as source_list FROM argit_pld1
      UNION ALL
      SELECT TRIM("U_CustCode") as customer_id, TRIM("U_ItemNo") as item_code, REPLACE("U_FinPrice"::text, ',', '')::numeric as master_price, 'Export' as source_list FROM aargit_ple1
      UNION ALL
      SELECT TRIM("U_CustCode") as customer_id, TRIM("U_ItemNo") as item_code, REPLACE("U_FinPrice"::text, ',', '')::numeric as master_price, 'Pin & Bush' as source_list FROM aargit_plp1
      UNION ALL
      SELECT TRIM("U_CustCode") as customer_id, TRIM("U_ItemNo") as item_code, REPLACE("U_FinPrice"::text, ',', '')::numeric as master_price, 'Labour' as source_list FROM argit_pll1
    ),
    distinct_customer_prices AS (
      SELECT DISTINCT ON (customer_id, item_code) customer_id, item_code, master_price, source_list
      FROM customer_prices
      ORDER BY customer_id, item_code, master_price DESC
    )
    SELECT 
      o."DocNum" as so_number,
      o."DocEntry" as doc_entry,
      r."LineNum" as line_num,
      o."DocDate" as so_date,
      TRIM(o."CardCode") as customer_code,
      TRIM(o."CardName") as customer_name,
      TRIM(r."ItemCode") as item_code,
      TRIM(r."Dscription") as description,
      REPLACE(r."Price"::text, ',', '')::numeric as so_price,
      REPLACE(r."Quantity"::text, ',', '')::numeric as quantity,
      cp.master_price as master_price,
      (REPLACE(r."Price"::text, ',', '')::numeric - cp.master_price) as variance,
      (REPLACE(r."Price"::text, ',', '')::numeric - cp.master_price) * REPLACE(r."Quantity"::text, ',', '')::numeric as total_leakage,
      cp.source_list as source_list,
      EXISTS (
        SELECT 1 FROM pricing_audit_exceptions pae 
        WHERE TRIM(pae.doc_entry) = TRIM(o."DocEntry"::text) 
          AND TRIM(pae.line_num) = TRIM(r."LineNum"::text) 
          AND pae.order_type = 'SO'
      ) as is_verified
    FROM rdr1 r
    JOIN ordr o ON REPLACE(o."DocEntry"::text, ',', '')::integer = r."DocEntry"::integer
    JOIN distinct_customer_prices cp ON cp.customer_id = TRIM(o."CardCode") AND cp.item_code = TRIM(r."ItemCode")
    WHERE TRIM(o."DocStatus") = 'O' 
      AND REPLACE(r."Price"::text, ',', '')::numeric <> cp.master_price
    ORDER BY o."DocDate" DESC
  `);
  return res;
}

// ── Pricing Comparison ────────────────────────────────────────────────────────
// Customer mode: OINV + INV1 (lowercase cols) vs Customer Master (argit_pld1 etc.)
// Vendor mode:   OPCH + PCH1 (mixed-case cols) vs Vendor Master (vendor_materials)

export async function getPricingComparison(
  mode: 'customer' | 'vendor',
  partyName: string,
  fromDate: string,
  toDate: string
): Promise<any[]> {
  if (mode === 'customer') {
    // oinv / inv1 use lowercase column names
    const res = await query<any>(`
      WITH customer_prices AS (
        SELECT TRIM("U_CustCode") AS customer_id, TRIM("U_ItemNo") AS item_code,
               REPLACE("U_FinPrice"::text, ',', '')::numeric AS master_price, 'Domestic' AS category,
               "U_EffDateF"::text AS from_date, "U_EffDateT"::text AS to_date
        FROM argit_pld1
        UNION ALL
        SELECT TRIM("U_CustCode"), TRIM("U_ItemNo"),
               REPLACE(COALESCE(NULLIF("U_ForeCurr"::text, ''), '0'), ',', '')::numeric, 'Export',
               "U_EffDateF"::text, "U_EffDateT"::text
        FROM aargit_ple1
        UNION ALL
        SELECT TRIM("U_CustCode"), TRIM("U_ItemNo"),
               REPLACE("U_FinPrice"::text, ',', '')::numeric, 'Pin & Bush',
               "U_EffDateF"::text, "U_EffDateT"::text
        FROM aargit_plp1
        UNION ALL
        SELECT TRIM("U_CustCode"), TRIM("U_ItemNo"),
               REPLACE("U_FinPrice"::text, ',', '')::numeric, 'Labour / Job Work',
               "U_EffDateF"::text, "U_EffDateT"::text
        FROM argit_pll1
        UNION ALL
        SELECT TRIM(customer_code) AS customer_id, TRIM(item_code) AS item_code,
               CASE WHEN TRIM(domestic_export) = 'Export' 
                    THEN COALESCE(unit_price_foreign_currency, new_price)::numeric 
                    ELSE new_price::numeric END AS master_price,
               domestic_export AS category,
               from_date::text AS from_date, to_date::text AS to_date
        FROM customer_pricing_history
      )
      SELECT
        o.docnum                                      AS invoice_num,
        o.docdate::date                               AS invoice_date,
        o.docstatus                                   AS doc_status,
        TRIM(o.cardcode)                              AS customer_code,
        TRIM(o.cardname)                              AS customer_name,
        TRIM(l.itemcode)                              AS item_code,
        TRIM(l.dscription)                            AS description,
        COALESCE(l.currency, 'INR')                   AS currency,
        COALESCE(i.u_domeexpo, '—')                   AS category,
        REPLACE(l.quantity::text, ',', '')::numeric   AS sales_qty,
        ROUND(REPLACE(l.price::text, ',', '')::numeric, 2)                    AS sap_unit_price,
        ROUND((CASE WHEN l.currency = 'INR' OR l.currency IS NULL OR REPLACE(l.totalfrgn::text, ',', '')::numeric = 0 THEN REPLACE(l.linetotal::text, ',', '')::numeric ELSE REPLACE(l.totalfrgn::text, ',', '')::numeric END)::numeric, 2) AS sap_total_price,
        -- Show unit_price × qty as the master total for all categories
        CASE
          WHEN cp.master_price IS NOT NULL THEN ROUND((ROUND(cp.master_price, 2) * REPLACE(l.quantity::text, ',', '')::numeric)::numeric, 2)
          ELSE NULL
        END                                           AS app_master_price,
        ROUND(cp.master_price, 2)                     AS export_unit_price,
        -- unit_variance (compares sap unit price vs master unit price)
        ROUND((REPLACE(l.price::text, ',', '')::numeric - COALESCE(ROUND(cp.master_price, 2), REPLACE(l.price::text, ',', '')::numeric))::numeric, 2) AS unit_variance,
        -- variance_pct
        CASE WHEN cp.master_price IS NOT NULL AND ROUND(cp.master_price, 2) <> 0
             THEN ROUND(((REPLACE(l.price::text, ',', '')::numeric - ROUND(cp.master_price, 2)) / ROUND(cp.master_price, 2) * 100)::numeric, 2)
             ELSE NULL END                            AS variance_pct,
        -- total_variance
        ROUND(((REPLACE(l.price::text, ',', '')::numeric - COALESCE(ROUND(cp.master_price, 2), REPLACE(l.price::text, ',', '')::numeric)) * REPLACE(l.quantity::text, ',', '')::numeric)::numeric, 2) AS total_variance
      FROM inv1_sftp l
      JOIN oinv_sftp o ON o.docentry = l.docentry
      LEFT JOIN LATERAL (
        SELECT cp.master_price, cp.category
        FROM customer_prices cp
        WHERE cp.customer_id = TRIM(o.cardcode)
          AND cp.item_code = TRIM(l.itemcode)
          AND (cp.from_date IS NULL OR cp.from_date = '' OR o.docdate::date >= NULLIF(cp.from_date, '')::date)
          AND (cp.to_date IS NULL OR cp.to_date = '' OR o.docdate::date <= NULLIF(cp.to_date, '')::date)
        ORDER BY
          NULLIF(cp.from_date, '')::date DESC NULLS LAST,
          cp.master_price DESC
        LIMIT 1
      ) cp ON TRUE
      LEFT JOIN oitm_sftp i ON TRIM(i.itemcode) = TRIM(l.itemcode)
      WHERE TRIM(o.cardname) = $1
        AND o.docdate::date >= $2::date
        AND o.docdate::date <= $3::date
        AND o.docstatus IN ('C', 'O')
      ORDER BY o.docdate DESC, o.docnum DESC, l.itemcode ASC
    `, [partyName, fromDate, toDate]);
    return res;
  } else {
    // opch_sftp / pch1_sftp use lowercase column names
    const res = await query<any>(`
      WITH vendor_prices AS (
        SELECT 
          TRIM(vendor_id) AS vendor_id,
          TRIM(casting_code) AS casting_code,
          TRIM(item_code) AS item_code,
          revised_price::numeric AS revised_price,
          from_date,
          to_date,
          grade,
          customer_name
        FROM vendor_materials
        UNION ALL
        SELECT
          TRIM(vendor_id) AS vendor_id,
          TRIM(casting_code) AS casting_code,
          NULL AS item_code,
          new_revised_price::numeric AS revised_price,
          from_date,
          to_date,
          grade,
          customer_name
        FROM vendor_materials_history
      )
      SELECT
        o.docnum                                      AS invoice_num,
        o.docdate::date                               AS invoice_date,
        o.docstatus                                   AS doc_status,
        TRIM(o.cardcode)                              AS vendor_code,
        TRIM(o.cardname)                              AS vendor_name,
        TRIM(l.itemcode)                              AS item_code,
        TRIM(l.dscription)                            AS description,
        COALESCE(l.currency, 'INR')                   AS currency,
        COALESCE(vm.grade, im.u_grade) AS grade,
        COALESCE(vm.customer_name, NULLIF(TRIM(im.frgnname), ''), TRIM(im.u_cusfoudt)) AS customer_name,
        REPLACE(l.quantity::text, ',', '')::numeric   AS purchase_qty,
        ROUND((REPLACE(l.price::text, ',', '')::numeric), 2)           AS sap_unit_price,
        ROUND((CASE WHEN l.currency = 'INR' OR l.currency IS NULL OR REPLACE(l.totalfrgn::text, ',', '')::numeric = 0 THEN REPLACE(l.linetotal::text, ',', '')::numeric ELSE REPLACE(l.totalfrgn::text, ',', '')::numeric END)::numeric, 2) AS sap_total_price,
        ROUND((ROUND(vm.revised_price::numeric, 2) * REPLACE(l.quantity::text, ',', '')::numeric)::numeric, 2) AS app_master_price,
        ROUND(vm.revised_price::numeric, 2)             AS export_unit_price,
        ROUND((REPLACE(l.price::text, ',', '')::numeric - COALESCE(ROUND(vm.revised_price::numeric, 2), REPLACE(l.price::text, ',', '')::numeric))::numeric, 2) AS unit_variance,
        CASE WHEN vm.revised_price IS NOT NULL AND ROUND(vm.revised_price::numeric, 2) <> 0
             THEN ROUND(((REPLACE(l.price::text, ',', '')::numeric - ROUND(vm.revised_price::numeric, 2)) / ROUND(vm.revised_price::numeric, 2) * 100)::numeric, 2)
             ELSE NULL END                             AS variance_pct,
        ROUND(((REPLACE(l.price::text, ',', '')::numeric - COALESCE(ROUND(vm.revised_price::numeric, 2), REPLACE(l.price::text, ',', '')::numeric)) * REPLACE(l.quantity::text, ',', '')::numeric)::numeric, 2) AS total_variance
      FROM pch1_sftp l
      JOIN opch_sftp o ON REPLACE(TRIM(o.docentry), ',', '') = REPLACE(TRIM(l.docentry), ',', '')
      LEFT JOIN oitm_sftp im ON TRIM(im.itemcode) = TRIM(l.itemcode)
      LEFT JOIN LATERAL (
        SELECT 
          vp.revised_price,
          vp.grade,
          vp.customer_name
        FROM vendor_prices vp
        WHERE vp.vendor_id = TRIM(o.cardcode)
          AND (vp.casting_code = TRIM(l.itemcode) OR vp.item_code = TRIM(l.itemcode))
          AND (vp.from_date IS NULL OR o.docdate::date >= vp.from_date)
          AND (vp.to_date IS NULL OR o.docdate::date <= vp.to_date)
        ORDER BY
          vp.from_date DESC NULLS LAST,
          vp.revised_price DESC
        LIMIT 1
      ) vm ON TRUE
      WHERE TRIM(o.cardname) = $1
        AND o.docdate::date >= $2::date
        AND o.docdate::date <= $3::date
        AND o.docstatus IN ('C', 'O')
      ORDER BY o.docdate DESC, o.docnum DESC, l.itemcode ASC
    `, [partyName, fromDate, toDate]);
    return res;
  }
}

export async function getPricingComparisonFilters(): Promise<{ customers: string[]; vendors: string[] }> {
  const [custRes, vendRes] = await Promise.all([
    // Distinct customer names from oinv_sftp (actual SAP sales invoice data)
    query<{ name: string }>(`
      SELECT DISTINCT TRIM(cardname) AS name FROM oinv_sftp
      WHERE cardname IS NOT NULL AND TRIM(cardname) <> ''
      ORDER BY name
    `),
    // Distinct vendor names from opch_sftp (actual SAP purchase invoice data)
    query<{ name: string }>(`
      SELECT DISTINCT TRIM(cardname) AS name FROM opch_sftp
      WHERE cardname IS NOT NULL AND TRIM(cardname) <> ''
      ORDER BY name
    `),
  ]);
  return {
    customers: custRes.map(r => r.name).filter(Boolean),
    vendors: vendRes.map(r => r.name).filter(Boolean),
  };
}

export async function revertBatch(id: number, targetItemIds?: number[]): Promise<PricingBatch> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch batch to verify status and type
    const checkRes = await client.query<{ status: string, vendor_id: string | null }>(
      'SELECT status, vendor_id FROM pricing_batches WHERE id = $1 FOR UPDATE',
      [id]
    );
    const batch = checkRes.rows[0];
    if (!batch) {
      throw new Error('Batch not found');
    }
    if (batch.status !== 'approved') {
      throw new Error('Only approved batches can be reverted');
    }

    // 2. Fetch all items in this batch
    const batchItemsRes = await client.query<{ id: number; item_code: string; item_master_id: string; customer_name: string }>(
      `SELECT id, item_code, item_master_id, customer_name FROM pricing_batch_items WHERE batch_id = $1`,
      [id]
    );
    const allItems = batchItemsRes.rows;

    const hasTargetIds = Array.isArray(targetItemIds) && targetItemIds.length > 0;
    const isPartial = hasTargetIds && targetItemIds!.length < allItems.length;

    const itemsToRevert = hasTargetIds
      ? allItems.filter(i => targetItemIds!.includes(i.id))
      : allItems;

    const isCustomerMode = !batch.vendor_id;

    if (!isCustomerMode) {
      // Revert Vendor batch
      for (const item of itemsToRevert) {
        // Find the history record for this batch
        const histRes = await client.query<any>(
          `SELECT * FROM item_price_history WHERE batch_id = $1 AND item_code = $2 AND vendor_id = $3 LIMIT 1`,
          [id, item.item_code, batch.vendor_id]
        );
        const hist = histRes.rows[0];
        if (hist) {
          let oldFromDate = hist.old_from_date;
          let oldToDate = hist.old_to_date;
          if (!oldFromDate || !oldToDate) {
            const prevHist = await client.query<{ from_date: string; to_date: string }>(
              `SELECT from_date, to_date FROM vendor_materials_history 
               WHERE TRIM(vendor_id) = TRIM($1) 
                 AND (TRIM(item_code) = TRIM($2) OR TRIM(casting_code) = TRIM($2))
               ORDER BY changed_at DESC LIMIT 1 OFFSET 1`,
              [batch.vendor_id, item.item_code]
            );
            if (prevHist.rows[0]) {
              oldFromDate = oldFromDate || prevHist.rows[0].from_date;
              oldToDate = oldToDate || prevHist.rows[0].to_date;
            }
          }

          // Revert vendor_materials to old values
          await client.query(
            `UPDATE vendor_materials 
             SET mmr_rate = $1,
                 ro_rate = $2,
                 consumables_rate = $3,
                 extra_factor = $4,
                 revised_rate_per_kg = $5,
                 revised_price = rm_weight * $5,
                 from_date = COALESCE($8, from_date),
                 to_date = COALESCE($9, to_date),
                 updated_at = NOW()
             WHERE TRIM(vendor_id) = TRIM($6) AND TRIM(item_code) = TRIM($7)`,
            [
              Number(hist.old_mmr || 0),
              Number(hist.old_coating || 0),
              Number(hist.old_consumables || 0),
              Number(hist.old_extra || 0),
              Number(hist.old_rate_per_kg || 0),
              batch.vendor_id,
              item.item_code,
              oldFromDate || null,
              oldToDate || null
            ]
          );

          // Clean up the trigger-inserted audit records in vendor_materials_history:
          await client.query(
            `DELETE FROM vendor_materials_history 
             WHERE TRIM(vendor_id) = TRIM($1) 
               AND TRIM(item_code) = TRIM($2) 
               AND ABS(EXTRACT(EPOCH FROM (changed_at - $3::timestamp))) < 10`,
            [batch.vendor_id, item.item_code, hist.created_at]
          );

          await client.query(
            `DELETE FROM vendor_materials_history 
             WHERE TRIM(vendor_id) = TRIM($1) 
               AND TRIM(item_code) = TRIM($2) 
               AND ABS(EXTRACT(EPOCH FROM (changed_at - NOW()))) < 5`,
            [batch.vendor_id, item.item_code]
          );

          await client.query(`DELETE FROM item_price_history WHERE batch_id = $1 AND item_code = $2`, [id, item.item_code]);
        }
      }

    } else {
      // Revert Customer batch
      for (const item of itemsToRevert) {
        // Resolve customer code
        let cleanItemMasterId = item.item_master_id;
        let customerCode = '';
        if (item.item_master_id.includes('|')) {
          const parts = item.item_master_id.split('|');
          if (parts.length === 3) {
            customerCode = parts[0].trim();
            cleanItemMasterId = parts[2].trim();
          }
        }
        if (!customerCode && item.customer_name) {
          const custRes = await client.query<{ cardcode: string }>(
            `SELECT TRIM(cardcode) as cardcode 
             FROM ocrd_sftp 
             WHERE (LOWER(TRIM(cardname)) = LOWER(TRIM($1)) OR LOWER(TRIM(cardfname)) = LOWER(TRIM($1)))
               AND cardtype = 'C' 
             LIMIT 1`,
            [item.customer_name.trim()]
          );
          customerCode = custRes.rows[0]?.cardcode || '';
        }

        // Find the customer history record for this batch
        const histRes = await client.query<any>(
          `SELECT * FROM customer_pricing_history WHERE batch_id = $1 AND item_code = $2 LIMIT 1`,
          [id, item.item_code]
        );
        const hist = histRes.rows[0];
        if (hist) {
          // Resolve physical table
          const itemMetadataRes = await client.query<{ group_code: string; bought_out: string; dome_expo: string }>(
            `SELECT itmsgrpcod as group_code, u_bought as bought_out, u_domeexpo as dome_expo
             FROM oitm_sftp WHERE TRIM(itemcode) = $1 LIMIT 1`,
            [cleanItemMasterId]
          );
          const meta = itemMetadataRes.rows[0] || { group_code: '', bought_out: '', dome_expo: '' };
          const groupCode = String(meta.group_code || '');
          const boughtOut = String(meta.bought_out || '').trim();
          const domeExpo = String(meta.dome_expo || '').toUpperCase();

          const isLabour = ['125', '128'].includes(groupCode) || boughtOut === 'Job Work';
          const isPin = ['116', '118'].includes(groupCode) || domeExpo.includes('PIN BUSH') || domeExpo.includes('PIN PUSH') || domeExpo.includes('PIN & BUSH');

          let physicalTable = 'aargit_ple1';
          if (isLabour) physicalTable = 'argit_pll1';
          else if (isPin) physicalTable = 'aargit_plp1';
          else if (domeExpo.includes('DOMESTIC')) physicalTable = 'argit_pld1';

          const oldCastRate = Number(hist.old_cast_rate || 0);
          const oldCastWt = Number(hist.old_cast_weight || 0);
          const oldCastPric = oldCastWt * oldCastRate;
          const oldPrice = Number(hist.old_price || 0);
          const oldActCost = oldPrice - oldCastPric;

          let castRateCast = '$1';
          let castPricCast = '$2';
          let mmrCast = '$3';
          let roCast = '$4';
          let consCast = '$5';
          let extraCast = '$6';
          let finPriceCast = '$7';
          let actCostCast = '$8';

          if (physicalTable === 'aargit_ple1') {
            castRateCast = '$1::text::numeric::double precision';
            castPricCast = '$2::text';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$7::text';
            actCostCast = '$8::text::numeric::double precision';
          } else if (physicalTable === 'aargit_plp1') {
            castRateCast = '$1::text';
            castPricCast = '$2::text';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$7::text';
            actCostCast = '$8::text';
          } else if (physicalTable === 'argit_pld1') {
            castRateCast = '$1::text::numeric';
            castPricCast = '$2::text::numeric';
            mmrCast = '$3::text::numeric';
            roCast = '$4::text::numeric';
            consCast = '$5::text::numeric';
            extraCast = '$6::text::numeric';
            finPriceCast = '$7::text::numeric';
            actCostCast = '$8::text::numeric';
          }

          if (physicalTable === 'argit_pll1') {
            await client.query(
              `UPDATE "${physicalTable}"
               SET "U_CastRate" = $1::text,
                   "U_CastPric" = $2::text,
                   "U_EffDateF" = COALESCE($5, "U_EffDateF"),
                   "U_EffDateT" = COALESCE($6, "U_EffDateT"),
                   "U_FinPrice" = $3::text,
                   "U_ActCost" = $4::text
               WHERE TRIM("U_ItemNo") = $7
                 AND (${customerCode ? 'TRIM("U_CustCode") = TRIM($8)' : '1=1'})`,
              [
                oldCastRate,
                oldCastPric,
                oldPrice,
                oldActCost,
                hist.old_from_date || null,
                hist.old_to_date || null,
                cleanItemMasterId,
                ...(customerCode ? [customerCode] : [])
              ]
            );
          } else {
            await client.query(
              `UPDATE "${physicalTable}"
               SET "U_CastRate" = ${castRateCast},
                   "U_CastPric" = ${castPricCast},
                   "U_MmrRate" = ${mmrCast},
                   "U_RoRate" = ${roCast},
                   "U_ConsRate" = ${consCast},
                   "U_Extra" = ${extraCast},
                   "U_EffDateF" = COALESCE($11, "U_EffDateF"),
                   "U_EffDateT" = COALESCE($12, "U_EffDateT"),
                   "U_FinPrice" = ${finPriceCast},
                   "U_ActCost" = ${actCostCast}
               WHERE TRIM("U_ItemNo") = $9
                 AND (${customerCode ? 'TRIM("U_CustCode") = TRIM($10)' : '1=1'})`,
              [
                oldCastRate,
                oldCastPric,
                Number(hist.old_mmr_rate || 0),
                Number(hist.old_ro_rate || 0),
                Number(hist.old_consumables || 0),
                Number(hist.old_extra || 0),
                oldPrice,
                oldActCost,
                cleanItemMasterId,
                ...(customerCode ? [customerCode] : []),
                hist.old_from_date || null,
                hist.old_to_date || null
              ]
            );
          }
          await client.query(`DELETE FROM customer_pricing_history WHERE batch_id = $1 AND item_code = $2`, [id, item.item_code]);
        }
      }
    }

    const revertedItemIds = itemsToRevert.map(i => i.id);

    if (isPartial && revertedItemIds.length > 0) {
      // Delete reverted items from pricing_batch_items so remaining approved items stay in batch
      await client.query(
        `DELETE FROM pricing_batch_items WHERE id = ANY($1::int[])`,
        [revertedItemIds]
      );
    } else {
      // Whole batch revert: Revert batch status to draft & batch items status to pending
      await client.query(
        `UPDATE pricing_batches SET status = 'draft', approved_at = NULL WHERE id = $1`,
        [id]
      );
      await client.query(
        `UPDATE pricing_batch_items SET status = 'pending' WHERE batch_id = $1`,
        [id]
      );
    }

    await client.query('COMMIT');

    const reverted = await getBatchById(id);
    return reverted || { id, name: '', created_at: '', items: [] } as any;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface ReviseDisputeInput {
  dbId?: number;
  cRate: number;
  vRate: number;
  cWeight?: number;
  vWeight?: number;
  rejectionCost?: number;
  powderCoating?: number;
  specialProcess?: number;
  process?: number;
  transCharges?: number;
  ohp?: number;
  packing?: number;
  itemCodeParam?: string;
  castingCodeParam?: string;
  customerCodeParam?: string;
  customerNameParam?: string;
  vendorIdParam?: string;
  vendorNameParam?: string;
}

export async function reviseDispute(
  arg1: number | ReviseDisputeInput,
  cRate?: number,
  vRate?: number,
  cWeight?: number,
  vWeight?: number,
  rejectionCost?: number,
  powderCoating?: number,
  specialProcess?: number,
  process?: number,
  transCharges?: number,
  ohp?: number,
  packing?: number,
  itemCodeParam?: string,
  castingCodeParam?: string,
  customerCodeParam?: string,
  customerNameParam?: string
): Promise<{ success: boolean }> {
  let opts: ReviseDisputeInput;
  if (typeof arg1 === 'object' && arg1 !== null) {
    opts = arg1;
  } else {
    opts = {
      dbId: arg1,
      cRate: cRate || 0,
      vRate: vRate || 0,
      cWeight,
      vWeight,
      rejectionCost,
      powderCoating,
      specialProcess,
      process,
      transCharges,
      ohp,
      packing,
      itemCodeParam,
      castingCodeParam,
      customerCodeParam,
      customerNameParam
    };
  }

  let dbId = Number(opts.dbId || 0);
  if (isNaN(dbId) || dbId > 2147483647 || dbId < 0) {
    dbId = 0;
  }
  const passedCRate = opts.cRate;
  const passedVRate = opts.vRate;
  const passedCWeight = opts.cWeight;
  const passedVWeight = opts.vWeight;
  const passedRejectionCost = opts.rejectionCost;
  const passedPowderCoating = opts.powderCoating;
  const passedSpecialProcess = opts.specialProcess;
  const passedProcess = opts.process;
  const passedTransCharges = opts.transCharges;
  const passedOhp = opts.ohp;
  const passedPacking = opts.packing;
  itemCodeParam = opts.itemCodeParam;
  castingCodeParam = opts.castingCodeParam;
  customerCodeParam = opts.customerCodeParam;
  customerNameParam = opts.customerNameParam;
  const vendorIdParam = opts.vendorIdParam;
  const vendorNameParam = opts.vendorNameParam;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_revert_trigger', 'true', true)");

    let item: any = null;
    if (dbId > 0) {
      const { rows } = await client.query(
        `SELECT pbi.*, pb.vendor_id AS pb_vendor_id 
         FROM pricing_batch_items pbi 
         LEFT JOIN pricing_batches pb ON pbi.batch_id = pb.id 
         WHERE pbi.id = $1`, 
        [dbId]
      );
      if (rows.length > 0) {
        item = rows[0];
      }
    }

    if (!item) {
      const searchCode = (itemCodeParam || castingCodeParam || '').trim();
      const searchCust = (customerNameParam || customerCodeParam || '').trim();

      let dRow: any = null;
      if (searchCode) {
        const disputeRes = await client.query(
          `SELECT * FROM v_dispute_register 
           WHERE (TRIM(item_code) = TRIM($1) OR TRIM(casting_code) = TRIM($1))
             AND ($2 = '' OR TRIM(customer_name) ILIKE TRIM($2) OR TRIM(customer_code) = TRIM($2))
           LIMIT 1`,
          [searchCode, searchCust]
        );
        dRow = disputeRes.rows[0];
      }

      if (dRow) {
        item = {
          id: dRow.item_id || 0,
          item_code: dRow.item_code || searchCode,
          casting_code: dRow.casting_code || searchCode,
          item_master_id: dRow.item_code || searchCode,
          customer_code: dRow.customer_code || customerCodeParam || '',
          customer_name: dRow.customer_name || customerNameParam || '',
          customer_rm_weight: dRow.customer_rm_weight || passedCWeight || 0,
          rm_weight: dRow.rm_weight || passedVWeight || 0,
          old_price: dRow.old_price || 0,
          vendor_id: dRow.vendor_id || dRow.vm_vendor_name || '',
          from_date: dRow.from_date || null,
          to_date: dRow.to_date || null
        };
      } else {
        item = {
          id: 0,
          item_code: searchCode,
          casting_code: castingCodeParam || searchCode,
          item_master_id: searchCode,
          customer_code: customerCodeParam || '',
          customer_name: customerNameParam || '',
          customer_rm_weight: passedCWeight || 0,
          rm_weight: passedVWeight || 0,
          old_price: 0
        };
      }
    }

    const finalCWeight = passedCWeight !== undefined && passedCWeight !== null ? Number(passedCWeight) : Number(item.customer_rm_weight || 0);
    const finalVWeight = passedVWeight !== undefined && passedVWeight !== null ? Number(passedVWeight) : Number(item.rm_weight || 0);
    const finalCRate = Number(passedCRate || 0);
    const finalVRate = Number(passedVRate || 0);

    const finalRejCost = passedRejectionCost !== undefined && passedRejectionCost !== null ? Number(passedRejectionCost) : Number(item.rejection_cost || 0);
    const finalPowCoating = passedPowderCoating !== undefined && passedPowderCoating !== null ? Number(passedPowderCoating) : Number(item.powder_coating || 0);
    const finalSpecProc = passedSpecialProcess !== undefined && passedSpecialProcess !== null ? Number(passedSpecialProcess) : Number(item.special_process || 0);
    const finalProcMach = passedProcess !== undefined && passedProcess !== null ? Number(passedProcess) : Number(item.machining || 0);
    const finalFreight = passedTransCharges !== undefined && passedTransCharges !== null ? Number(passedTransCharges) : Number(item.trans_charges || 0);
    const finalOverhead = passedOhp !== undefined && passedOhp !== null ? Number(passedOhp) : Number(item.overhead_pct || 0);
    const finalPack = passedPacking !== undefined && passedPacking !== null ? Number(passedPacking) : Number(item.packing || 0);

    const customer_rm_price = finalCWeight * finalCRate;
    const rm_cost = finalVWeight * finalVRate;
    const actCost = finalRejCost + finalPowCoating + finalSpecProc + finalProcMach + finalFreight + finalOverhead + finalPack;
    const customer_total_price = customer_rm_price + actCost;
    const new_price = rm_cost + actCost;
    const delta = new_price - Number(item.old_price || 0);
    const customer_delta = customer_total_price - Number(item.old_price || 0);

    const itemCodeStr = (item.item_code || '').trim();
    const castingCodeStr = (item.casting_code || '').trim();
    const itemMasterIdStr = (item.item_master_id || '').trim();
    const customerNameStr = (item.customer_name || '').trim();

    await client.query(
      `UPDATE pricing_batch_items 
       SET customer_rate_per_kg = $1, 
           customer_rm_weight = $2, 
           customer_rm_price = $3, 
           old_rate_per_kg = $4,
           rm_weight = $5,
           rm_cost = $6, 
           rejection_cost = $7,
           powder_coating = $8,
           special_process = $9,
           machining = $10,
           trans_charges = $11,
           overhead_pct = $12,
           packing = $13,
           customer_total_price = $14, 
           new_price = $15, 
           delta = $16, 
           customer_delta = $17, 
           status = 'approved_master' 
       WHERE (id = $18 AND $18 > 0) 
          OR (
            ($18 = 0 OR $18 IS NULL)
            AND LOWER(status) IN ('dispute_raised', 'dispute', 'open')
            AND ($22 <> '' AND (LOWER(TRIM(customer_code)) = LOWER(TRIM($22)) OR LOWER(TRIM(customer_name)) = LOWER(TRIM($23)) OR LOWER(TRIM(customer_name)) ILIKE '%' || LOWER(TRIM($23)) || '%'))
            AND (
              ($19 <> '' AND (
                LOWER(TRIM(item_code)) = LOWER(TRIM($19)) OR 
                LOWER(REPLACE(TRIM(item_code), '-RM', '')) = LOWER(REPLACE(TRIM($19), '-RM', '')) OR
                LOWER(TRIM(casting_code)) = LOWER(TRIM($19)) OR 
                LOWER(REPLACE(TRIM(casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($19), '-RM', '')) OR
                LOWER(TRIM(item_master_id)) = LOWER(TRIM($19))
              ))
              OR ($20 <> '' AND (
                LOWER(TRIM(item_code)) = LOWER(TRIM($20)) OR 
                LOWER(REPLACE(TRIM(item_code), '-RM', '')) = LOWER(REPLACE(TRIM($20), '-RM', '')) OR
                LOWER(TRIM(casting_code)) = LOWER(TRIM($20)) OR 
                LOWER(REPLACE(TRIM(casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($20), '-RM', '')) OR
                LOWER(TRIM(item_master_id)) = LOWER(TRIM($20))
              ))
              OR ($21 <> '' AND (
                LOWER(TRIM(item_code)) = LOWER(TRIM($21)) OR 
                LOWER(REPLACE(TRIM(item_code), '-RM', '')) = LOWER(REPLACE(TRIM($21), '-RM', '')) OR
                LOWER(TRIM(casting_code)) = LOWER(TRIM($21)) OR 
                LOWER(REPLACE(TRIM(casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($21), '-RM', '')) OR
                LOWER(TRIM(item_master_id)) = LOWER(TRIM($21))
              ))
            )
          )`,
      [
        finalCRate,
        finalCWeight,
        customer_rm_price,
        finalVRate,
        finalVWeight,
        rm_cost,
        finalRejCost,
        finalPowCoating,
        finalSpecProc,
        finalProcMach,
        finalFreight,
        finalOverhead,
        finalPack,
        customer_total_price,
        new_price,
        delta,
        customer_delta,
        dbId,
        itemCodeStr,
        castingCodeStr,
        itemMasterIdStr,
        (item.customer_code || '').trim(),
        customerNameStr
      ]
    );

    const custCodeStr = (item.customer_code || '').trim();

    try {
      await client.query(
        `INSERT INTO customer_pricing_history (
           item_code, customer_code, customer_name, new_cast_weight, new_cast_rate,
           process_machining, ohp, packing, trans_charges, rejection_cost,
           powder_coating, special_process, new_price, from_date, to_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          itemCodeStr || castingCodeStr,
          custCodeStr,
          customerNameStr,
          finalCWeight,
          finalCRate,
          finalProcMach,
          finalOverhead,
          finalPack,
          finalFreight,
          finalRejCost,
          finalPowCoating,
          finalSpecProc,
          customer_total_price,
          item.from_date || null,
          item.to_date || null
        ]
      );
    } catch (eHist) {
      // Ignore schema variations if table doesn't match exact column specs
    }

    // Dynamic Vendor Resolution
    let resolvedVendorId = String(vendorIdParam || item.vendor_id || item.pb_vendor_id || '').trim();
    if (!resolvedVendorId && (itemCodeStr || castingCodeStr)) {
      const vmLookup = await client.query<{ vendor_id: string }>(
        `SELECT TRIM(vendor_id) as vendor_id FROM vendor_materials 
         WHERE ($1 <> '' AND (TRIM(item_code) = TRIM($1) OR TRIM(casting_code) = TRIM($1)))
            OR ($2 <> '' AND (TRIM(item_code) = TRIM($2) OR TRIM(casting_code) = TRIM($2)))
         LIMIT 1`,
        [itemCodeStr, castingCodeStr]
      );
      resolvedVendorId = vmLookup.rows[0]?.vendor_id || '';
    }

    // Sync Vendor Master tables (vendor_materials & vendor_materials_history)
    if (itemCodeStr || castingCodeStr) {
      try {
        const updateVmRes = await client.query(
          `UPDATE vendor_materials 
           SET rm_weight = $1, 
               revised_rate_per_kg = $2, 
               revised_price = $1::numeric * $2::numeric,
               from_date = COALESCE($3::DATE, from_date),
               to_date = COALESCE($4::DATE, to_date),
               updated_at = NOW()
           WHERE (
             ($5 <> '' AND (TRIM(vendor_id) = TRIM($5) OR TRIM(vendor_id) ILIKE TRIM($5)))
             OR ($5 = '')
           )
           AND (
             ($6 <> '' AND (TRIM(item_code) = TRIM($6) OR TRIM(casting_code) = TRIM($6)))
             OR ($7 <> '' AND (TRIM(item_code) = TRIM($7) OR TRIM(casting_code) = TRIM($7)))
           )`,
          [
            finalVWeight,
            finalVRate,
            item.from_date || null,
            item.to_date || null,
            resolvedVendorId,
            itemCodeStr,
            castingCodeStr
          ]
        );

        if (updateVmRes.rowCount === 0 && resolvedVendorId) {
          await client.query(
            `INSERT INTO vendor_materials (
               vendor_id, item_code, casting_code, rm_weight, revised_rate_per_kg,
               revised_price, from_date, to_date, grade, customer_name, groupcode, groupname
             ) SELECT $1, $2, $3, $4, $5, $4::numeric * $5::numeric, $6, $7, $8, $9, o.groupcode, og.groupname
             FROM (SELECT $1::text as vendor_id) v
             LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
             LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)`,
            [
              resolvedVendorId,
              itemCodeStr || castingCodeStr,
              castingCodeStr || itemCodeStr,
              finalVWeight,
              finalVRate,
              item.from_date || null,
              item.to_date || null,
              item.grade || 'FG250',
              customerNameStr
            ]
          );
        }

        if (resolvedVendorId) {
          await client.query(
            `INSERT INTO vendor_materials_history (
               vendor_id, item_code, casting_code, new_rm_weight, new_revised_rate_per_kg,
               new_revised_price, from_date, to_date, grade, customer_name, operation
             ) VALUES ($1, $2, $3, $4, $5, $4::numeric * $5::numeric, $6, $7, $8, $9, 'REVISE')`,
            [
              resolvedVendorId,
              itemCodeStr || castingCodeStr,
              castingCodeStr || itemCodeStr,
              finalVWeight,
              finalVRate,
              item.from_date || null,
              item.to_date || null,
              item.grade || 'FG250',
              customerNameStr
            ]
          );

          // Insert audit log entry in item_price_history for vendor rate revision
          await client.query(
            `INSERT INTO item_price_history (
               casting_code, item_code, customer_name, vendor_id, batch_number, batch_id,
               from_date, to_date, updated_by, new_rate_per_kg, new_price, delta, created_at
             ) VALUES ($1, $2, $3, $4, 'DISPUTE-REVISE', $5, $6, $7, 'Admin', $8, $9, $10, NOW())`,
            [
              castingCodeStr || itemCodeStr,
              itemCodeStr || castingCodeStr,
              customerNameStr,
              resolvedVendorId,
              item.batch_id || null,
              item.from_date || null,
              item.to_date || null,
              finalVRate,
              new_price,
              delta
            ]
          ).catch((eAudit) => console.warn('[reviseDispute] item_price_history insert warning:', eAudit));
        }
      } catch (eVendor) {
        console.warn('[reviseDispute] vendor_materials update warning:', eVendor);
      }
    }

    // Targeted update to Customer SAP Master physical tables for this specific customer & item
    if (itemCodeStr || castingCodeStr) {
      const custCodeStr = (item.customer_code || customerCodeParam || '').trim();
      const custNameStr = (item.customer_name || customerNameParam || '').trim();
      const tables = ['argit_pld1', 'aargit_ple1', 'argit_pll1', 'aargit_plp1'];
      for (const tbl of tables) {
        try {
          await client.query(
            `UPDATE "${tbl}"
             SET "U_CastWt" = $1::numeric,
                 "U_CastRate" = $2::numeric,
                 "U_RejCost" = $3::numeric,
                 "U_PowdCoat" = $4::numeric,
                 "U_SpecProc" = $5::numeric,
                 "U_ProcMach" = $6::numeric,
                 "U_TranChar" = $7::numeric,
                 "U_OHP" = $8::numeric,
                 "U_Packing" = $9::numeric,
                 "U_ActCost" = $10::numeric,
                 "U_FinPrice" = $11::numeric,
                 pricing_audit_status = 'approved'
             WHERE (
               ($12 <> '' AND (TRIM("U_ItemNo") = TRIM($12) OR TRIM("U_CastCode") = TRIM($12)))
               OR ($15 <> '' AND (TRIM("U_ItemNo") = TRIM($15) OR TRIM("U_CastCode") = TRIM($15)))
             )
             AND (
               ($13 <> '' AND TRIM("U_CustCode") = TRIM($13))
               OR ($14 <> '' AND (TRIM("U_CustName") = TRIM($14) OR TRIM("U_CustName") ILIKE TRIM($14)))
             )`,
            [
              Number(finalCWeight || 0),
              Number(finalCRate || 0),
              Number(finalRejCost || 0),
              Number(finalPowCoating || 0),
              Number(finalSpecProc || 0),
              Number(finalProcMach || 0),
              Number(finalFreight || 0),
              Number(finalOverhead || 0),
              Number(finalPack || 0),
              Number(actCost || 0),
              Number(customer_total_price || 0),
              itemCodeStr,
              custCodeStr,
              custNameStr,
              castingCodeStr
            ]
          );
        } catch (e1) {
          console.warn(`[reviseDispute] Update error on table ${tbl}:`, e1);
        }
      }
    }

    await client.query('COMMIT');

    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Price Audit Functions ───────────────────────────────────────────────────────

export async function getPricingAuditData(_filters?: {
  itemCode?: string;
  customerCode?: string;
  vendorId?: string;
  type?: 'customer' | 'vendor';
}): Promise<any[]> {
  // Ensure groupcode/groupname columns exist
  await addVendorGroupInfo().catch(() => {
    // Silently continue if migration fails (columns may already exist)
  });

  const rows = await query<any>(`
    SELECT
      pca.item_code,
      pca.casting_code,
      pca.customer_code,
      pca.vendor_id,
      pca.type,
      pca.final_price,
      pca.valid_from,
      pca.valid_through,
      pca.source_table,
      pca.groupcode,
      pca.groupname,
      COALESCE(o.cardname, pca.customer_code) as customer_name,
      COALESCE(i.itemname, '') as item_description,
      CASE
        WHEN pca.source_table = 'argit_pld1' THEN 'Domestic'
        WHEN pca.source_table = 'aargit_ple1' THEN 'Export'
        WHEN pca.source_table = 'argit_pll1' THEN 'Labour / Job Work'
        WHEN pca.source_table = 'aargit_plp1' THEN 'Pin & Bush'
      END as category,
      COALESCE(
        JSONB_AGG(
          DISTINCT JSONB_BUILD_OBJECT(
            'id', v2.vendor_id,
            'name', COALESCE(ov.cardname, v2.vendor_id),
            'groupcode', v2.groupcode,
            'groupname', v2.groupname,
            'valid_from', v2.valid_from,
            'valid_through', v2.valid_through,
            'cast_weight', CASE WHEN v2.groupcode = '115' THEN vm.rm_weight ELSE NULL END,
            'special_price_weight', CASE WHEN v2.groupcode = '118' THEN vm.rm_weight ELSE NULL END,
            'cast_rate', CASE WHEN v2.groupcode = '115' THEN vm.revised_rate_per_kg ELSE NULL END,
            'special_price_rate', CASE WHEN v2.groupcode = '118' THEN vm.revised_rate_per_kg ELSE NULL END,
            'revised_price', v2.final_price
          )
        ) FILTER (WHERE v2.vendor_id IS NOT NULL),
        '[]'::JSONB
      )::TEXT as vendors
    FROM v_pricing_audit pca
    LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(pca.customer_code)
    LEFT JOIN oitm_sftp i ON TRIM(i.itemcode) = TRIM(pca.item_code)
    LEFT JOIN v_pricing_audit v2 ON v2.type = 'vendor'
      AND v2.item_code = pca.item_code
      AND v2.casting_code = pca.casting_code
      AND (TRIM(v2.groupcode) = '115' OR TRIM(v2.groupcode) = '118')
      AND v2.valid_from < pca.valid_through
      AND v2.valid_through > pca.valid_from
    LEFT JOIN vendor_materials vm ON TRIM(vm.vendor_id) = TRIM(v2.vendor_id)
      AND TRIM(vm.casting_code) = TRIM(v2.casting_code)
      AND vm.from_date = v2.valid_from
      AND vm.to_date = v2.valid_through
      AND vm.revised_price = v2.final_price
    LEFT JOIN ocrd_sftp ov ON TRIM(ov.cardcode) = TRIM(v2.vendor_id)
    WHERE pca.type = 'customer'
      AND pca.item_code IN (
        SELECT DISTINCT v.item_code
        FROM v_pricing_audit v
        WHERE v.type = 'vendor'
          AND (TRIM(v.groupcode) = '115' OR TRIM(v.groupcode) = '118')
      )
    GROUP BY pca.item_code, pca.casting_code, pca.customer_code, pca.vendor_id, pca.type, pca.final_price, pca.valid_from, pca.valid_through, pca.source_table, pca.groupcode, pca.groupname, o.cardname, i.itemname
    ORDER BY pca.item_code, pca.customer_code, pca.source_table
  `);
  return rows;
}

// ── Get Approved Audit Items (from v_approved_audit_prices view) ─────────────────
export async function getApprovedAuditData(_filters?: {
  itemCode?: string;
  customerCode?: string;
  vendorId?: string;
  type?: 'customer' | 'vendor';
}): Promise<any[]> {
  // Ensure groupcode/groupname columns exist
  await addVendorGroupInfo().catch(() => {
    // Silently continue if migration fails (columns may already exist)
  });

  const rows = await query<any>(`
    SELECT
      pca.item_code,
      pca.casting_code,
      pca.customer_code,
      pca.vendor_id,
      pca.type,
      pca.final_price,
      pca.valid_from,
      pca.valid_through,
      pca.source_table,
      pca.groupcode,
      pca.groupname,
      COALESCE(o.cardname, pca.customer_code) as customer_name,
      COALESCE(i.itemname, '') as item_description,
      CASE
        WHEN pca.source_table = 'argit_pld1' THEN 'Domestic'
        WHEN pca.source_table = 'aargit_ple1' THEN 'Export'
        WHEN pca.source_table = 'argit_pll1' THEN 'Labour / Job Work'
        WHEN pca.source_table = 'aargit_plp1' THEN 'Pin & Bush'
      END as category,
      COALESCE(
        JSONB_AGG(
          DISTINCT JSONB_BUILD_OBJECT(
            'id', v2.vendor_id,
            'name', COALESCE(ov.cardname, v2.vendor_id),
            'groupcode', v2.groupcode,
            'groupname', v2.groupname,
            'valid_from', v2.valid_from,
            'valid_through', v2.valid_through,
            'cast_weight', CASE WHEN v2.groupcode = '115' THEN vm.rm_weight ELSE NULL END,
            'special_price_weight', CASE WHEN v2.groupcode = '118' THEN vm.rm_weight ELSE NULL END,
            'cast_rate', CASE WHEN v2.groupcode = '115' THEN vm.revised_rate_per_kg ELSE NULL END,
            'special_price_rate', CASE WHEN v2.groupcode = '118' THEN vm.revised_rate_per_kg ELSE NULL END,
            'revised_price', v2.final_price
          )
        ) FILTER (WHERE v2.vendor_id IS NOT NULL),
        '[]'::JSONB
      )::TEXT as vendors
    FROM v_approved_audit_prices pca
    LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(pca.customer_code)
    LEFT JOIN oitm_sftp i ON TRIM(i.itemcode) = TRIM(pca.item_code)
    LEFT JOIN v_approved_audit_prices v2 ON v2.type = 'vendor'
      AND v2.item_code = pca.item_code
      AND v2.casting_code = pca.casting_code
      AND (TRIM(v2.groupcode) = '115' OR TRIM(v2.groupcode) = '118')
      AND v2.valid_from < pca.valid_through
      AND v2.valid_through > pca.valid_from
    LEFT JOIN vendor_materials vm ON TRIM(vm.vendor_id) = TRIM(v2.vendor_id)
      AND TRIM(vm.casting_code) = TRIM(v2.casting_code)
      AND vm.from_date = v2.valid_from
      AND vm.to_date = v2.valid_through
      AND vm.revised_price = v2.final_price
    LEFT JOIN ocrd_sftp ov ON TRIM(ov.cardcode) = TRIM(v2.vendor_id)
    WHERE pca.type = 'customer'
      AND pca.item_code IN (
        SELECT DISTINCT v.item_code
        FROM v_approved_audit_prices v
        WHERE v.type = 'vendor'
          AND (TRIM(v.groupcode) = '115' OR TRIM(v.groupcode) = '118')
      )
    GROUP BY pca.item_code, pca.casting_code, pca.customer_code, pca.vendor_id, pca.type, pca.final_price, pca.valid_from, pca.valid_through, pca.source_table, pca.groupcode, pca.groupname, o.cardname, i.itemname
    ORDER BY pca.item_code, pca.customer_code, pca.source_table
  `);
  return rows;
}

export async function approvePricingItem(
  itemCode: string,
  customerCode: string,
  type: 'customer' | 'vendor',
  approvedBy: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await queryOne<{ success: boolean; message: string }>(
      'SELECT * FROM approve_pricing_item($1, $2, $3, $4)',
      [itemCode, customerCode, type, approvedBy]
    );
    return result || { success: false, message: 'Approval failed' };
  } catch (err) {
    console.error('Error approving pricing item:', err);
    throw err;
  }
}

export async function getItemPricingDetails(itemCode: string, customerCode: string, tab: string = 'pending', vendorIds?: string[]): Promise<any> {
  // Determine which view to use based on tab
  const viewName = tab === 'approved' ? 'v_approved_audit_prices' : 'v_pricing_audit';

  // Get customer row from view to find source_table and casting_code
  let customerRow: any = null;
  try {
    customerRow = await queryOne<any>(`
      SELECT * FROM ${viewName}
      WHERE (
        LOWER(TRIM(item_code)) = LOWER(TRIM($1)) OR 
        LOWER(REPLACE(TRIM(item_code), '-RM', '')) = LOWER(REPLACE(TRIM($1), '-RM', '')) OR
        LOWER(TRIM(casting_code)) = LOWER(TRIM($1)) OR
        LOWER(REPLACE(TRIM(casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($1), '-RM', ''))
      )
      AND (
        LOWER(TRIM(customer_code)) = LOWER(TRIM($2)) OR
        $2 IS NULL OR $2 = ''
      )
      AND type = 'customer'
      LIMIT 1
    `, [itemCode, customerCode]);
  } catch (eView) {
    console.warn(`[getItemPricingDetails] View query warning on ${viewName}:`, eView);
  }

  // Fallback: search directly in customer SAP tables if not found in view
  if (!customerRow) {
    for (const tbl of ['argit_pld1', 'aargit_ple1', 'argit_pll1', 'aargit_plp1']) {
      try {
        const found = await queryOne<any>(`
          SELECT 
            TRIM("U_ItemNo") as item_code, 
            TRIM("U_CustCode") as customer_code, 
            TRIM("U_CastCode") as casting_code, 
            '${tbl}' as source_table, 
            "U_EffDateF" as valid_from, 
            "U_EffDateT" as valid_through
          FROM "${tbl}"
          WHERE (
            LOWER(TRIM("U_ItemNo")) = LOWER(TRIM($1)) OR 
            LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($1), '-RM', '')) OR
            LOWER(TRIM("U_CastCode")) = LOWER(TRIM($1))
          )
          AND (
            LOWER(TRIM("U_CustCode")) = LOWER(TRIM($2)) OR 
            LOWER(TRIM("U_CustName")) = LOWER(TRIM($2)) OR 
            $2 IS NULL OR $2 = ''
          )
          ORDER BY "DocEntry"::bigint DESC
          LIMIT 1
        `, [itemCode, customerCode || '']);
        if (found) {
          customerRow = found;
          break;
        }
      } catch (eTbl) {
        // Continue to next table
      }
    }
  }

  if (!customerRow) {
    customerRow = {
      source_table: 'argit_pld1',
      casting_code: itemCode,
      valid_from: null,
      valid_through: null
    };
  }

  const sourceTable = customerRow.source_table || 'argit_pld1';
  const castingCode = customerRow.casting_code || itemCode;

  // Map source_table to actual table name and query full details
  let customerDetails: any = {};
  const tableMap: Record<string, string> = {
    'argit_pld1': 'argit_pld1',
    'aargit_ple1': 'aargit_ple1',
    'argit_pll1': 'argit_pll1',
    'aargit_plp1': 'aargit_plp1',
  };

  if (tableMap[sourceTable]) {
    const tbl = tableMap[sourceTable];
    try {
      customerDetails = await queryOne<any>(`
        SELECT
          TRIM("U_ItemNo") as item_code,
          TRIM("U_CustCode") as customer_code,
          TRIM("U_CustName") as customer_name,
          "U_CastWt" as cast_weight,
          "U_CastRate" as cast_rate,
          "U_CastPric" as cast_price,
          "U_SpecProcWt" as special_price_weight,
          "U_SpecProcRate" as special_price_rate,
          "U_SpecProc" as special_price,
          "U_SpecProc" as special_process,
          "U_RejCost" as rejection_cost,
          "U_PowdCoat" as powder_coating,
          "U_ProcMach" as process_machining,
          "U_TranChar" as trans_charges,
          "U_OHP" as ohp,
          "U_Packing" as packing,
          "U_MmrRate" as mmr_rate,
          "U_RoRate" as ro_rate,
          "U_ConsRate" as consumables_rate,
          "U_Extra" as extra_factor,
          "U_FinPrice" as final_price,
          "U_ActCost" as actual_cost,
          "U_EffDateF" as valid_from,
          "U_EffDateT" as valid_through
        FROM "${tbl}"
        WHERE (
          LOWER(TRIM("U_ItemNo")) = LOWER(TRIM($1)) OR 
          LOWER(REPLACE(TRIM("U_ItemNo"), '-RM', '')) = LOWER(REPLACE(TRIM($1), '-RM', '')) OR
          LOWER(TRIM("U_CastCode")) = LOWER(TRIM($1))
        )
        AND (
          LOWER(TRIM("U_CustCode")) = LOWER(TRIM($2)) OR 
          LOWER(TRIM("U_CustName")) = LOWER(TRIM($2)) OR 
          $2 IS NULL OR $2 = ''
        )
        ORDER BY "DocEntry"::bigint DESC
        LIMIT 1
      `, [itemCode, customerCode || '']);
    } catch (eCustDetails) {
      console.warn('[getItemPricingDetails] customerDetails query warning:', eCustDetails);
    }

    if (customerDetails) {
      const calcTwc = Number(customerDetails.rejection_cost || 0) + Number(customerDetails.powder_coating || 0) + Number(customerDetails.special_process || 0) + Number(customerDetails.process_machining || 0) + Number(customerDetails.trans_charges || 0) + Number(customerDetails.ohp || 0) + Number(customerDetails.packing || 0);
      if (calcTwc > 0) {
        customerDetails.actual_cost = calcTwc;
        customerDetails.total_working_cost = calcTwc;
        const castP = Number(customerDetails.cast_price || 0);
        if (castP > 0) {
          customerDetails.final_price = castP + calcTwc;
        }
      }
    }
  }

  // If vendorIds provided (pre-filtered from list view), fetch only those
  // Otherwise, get vendors with date overlap
  let vendorMappings: any[] = [];

  if (vendorIds && vendorIds.length > 0) {
    // Use pre-filtered vendor list from frontend
    vendorMappings = vendorIds.map(id => ({ vendor_id: id }));
  } else {
    try {
      vendorMappings = await query<any>(`
        SELECT DISTINCT ON (vpa.vendor_id)
          vpa.vendor_id,
          vpa.casting_code,
          vpa.final_price,
          vpa.valid_from,
          vpa.valid_through,
          vpa.groupcode,
          vpa.groupname
        FROM ${viewName} vpa
        WHERE vpa.type = 'vendor' AND (
          LOWER(TRIM(vpa.casting_code)) = LOWER(TRIM($1)) OR
          LOWER(REPLACE(TRIM(vpa.casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($1), '-RM', '')) OR
          LOWER(TRIM(vpa.item_code)) = LOWER(TRIM($1))
        )
        ORDER BY vpa.vendor_id
      `, [castingCode]);
    } catch (eVendorMappings) {
      console.warn('[getItemPricingDetails] vendorMappings query warning:', eVendorMappings);
    }
  }

  // For each vendor, get full details from vendor_materials
  const vendorDetails = await Promise.all(
    vendorMappings.map(async (vm: any) => {
      try {
        const details = await queryOne<any>(`
          SELECT
            vm.id,
            TRIM(vm.vendor_id) as id,
            vm.item_code,
            vm.casting_code,
            vm.item_description,
            vm.grade,
            vm.rm_weight,
            vm.revised_rate_per_kg,
            vm.revised_price,
            vm.mmr_rate,
            vm.ro_rate,
            vm.consumables_rate,
            vm.extra_factor,
            vm.from_date as valid_from,
            vm.to_date as valid_through,
            vm.machine_type,
            vm.coating,
            vm.groupcode,
            vm.groupname,
            COALESCE(o.cardname, '') as name
          FROM vendor_materials vm
          LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(vm.vendor_id)
          WHERE TRIM(vm.vendor_id) = TRIM($1)
            AND (
              LOWER(TRIM(vm.casting_code)) = LOWER(TRIM($2)) OR
              LOWER(REPLACE(TRIM(vm.casting_code), '-RM', '')) = LOWER(REPLACE(TRIM($2), '-RM', '')) OR
              LOWER(TRIM(vm.item_code)) = LOWER(TRIM($2))
            )
          LIMIT 1
        `, [vm.vendor_id, castingCode]);
        return details;
      } catch (eVendorDetail) {
        return null;
      }
    })
  );

  return {
    itemCode,
    castingCode,
    customer: customerDetails || {},
    vendors: vendorDetails.filter(v => v !== null),
  };
}

export async function pushApprovedItemsToSap(userId: string): Promise<any> {
  try {
    const approvedItems = await query<any>(`
      SELECT DISTINCT
        item_code,
        COALESCE(customer_code, vendor_id) as card_code,
        type,
        final_price,
        valid_from,
        valid_through
      FROM v_approved_audit_prices
      WHERE final_price IS NOT NULL
      ORDER BY item_code, card_code
    `);

    if (!approvedItems.length) {
      return { success: true, message: 'No items to push', pushed: 0, failed: 0 };
    }

    const sapClient = getSapClient();
    if (!sapClient) {
      throw new Error('SAP client not initialized');
    }

    let pushedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const item of approvedItems) {
      try {
        const checkResult = item.type === 'vendor'
          ? await sapClient.checkVendorPriceExists({
              itemCode: item.item_code,
              vendorCode: item.card_code,
              castingPrice: Number(item.final_price),
              validFrom: item.valid_from,
              validTo: item.valid_through
            })
          : await sapClient.checkCustomerPriceExists({
              itemCode: item.item_code,
              customerCode: item.card_code,
              finalPrice: Number(item.final_price),
              validFrom: item.valid_from,
              validTo: item.valid_through
            });

        let action = 'POST';
        let syncResult;

        if (checkResult.exists) {
          action = 'PATCH';
          syncResult = item.type === 'vendor'
            ? await sapClient.syncVendorPrice({
                itemCode: item.item_code,
                vendorCode: item.card_code,
                castingPrice: Number(item.final_price),
                validFrom: item.valid_from,
                validTo: item.valid_through
              })
            : await sapClient.syncCustomerPrice({
                itemCode: item.item_code,
                customerCode: item.card_code,
                finalPrice: Number(item.final_price),
                validFrom: item.valid_from,
                validTo: item.valid_through
              });
        } else {
          action = 'POST';
          syncResult = item.type === 'vendor'
            ? await sapClient.syncVendorPrice({
                itemCode: item.item_code,
                vendorCode: item.card_code,
                castingPrice: Number(item.final_price),
                validFrom: item.valid_from,
                validTo: item.valid_through
              })
            : await sapClient.syncCustomerPrice({
                itemCode: item.item_code,
                customerCode: item.card_code,
                finalPrice: Number(item.final_price),
                validFrom: item.valid_from,
                validTo: item.valid_through
              });
        }

        // TODO: sap_sync_log table schema needs to be created with proper columns
        // await query(`
        //   INSERT INTO sap_sync_log
        //   (item_code, card_code, type, action, price, valid_from, valid_through, success, error_message, sap_response, pushed_by)
        //   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        // `, [
        //   item.item_code,
        //   item.card_code,
        //   item.type,
        //   action,
        //   item.final_price,
        //   item.valid_from,
        //   item.valid_through,
        //   syncResult.success,
        //   syncResult.error || null,
        //   JSON.stringify(syncResult.sapResponse || {}),
        //   userId
        // ]);

        if (syncResult.success) {
          pushedCount++;
        } else {
          failedCount++;
        }

        results.push({
          itemCode: item.item_code,
          cardCode: item.card_code,
          type: item.type,
          action,
          success: syncResult.success,
          error: syncResult.error
        });
      } catch (itemError: any) {
        failedCount++;

        // TODO: sap_sync_log table schema needs to be created with proper columns
        // await query(`
        //   INSERT INTO sap_sync_log
        //   (item_code, card_code, type, success, error_message, pushed_by)
        //   VALUES ($1, $2, $3, $4, $5, $6)
        // `, [
        //   item.item_code,
        //   item.card_code,
        //   item.type,
        //   false,
        //   itemError.message,
        //   userId
        // ]);

        results.push({
          itemCode: item.item_code,
          cardCode: item.card_code,
          type: item.type,
          success: false,
          error: itemError.message
        });
      }
    }

    return {
      success: true,
      pushed: pushedCount,
      failed: failedCount,
      total: approvedItems.length,
      results
    };
  } catch (error: any) {
    logger.error('Failed to push approved items to SAP:', error.message);
    throw error;
  }
}

export async function getSyncStatus(itemCode?: string): Promise<any[]> {
  try {
    let q = `
      SELECT
        item_code,
        card_code,
        type,
        action,
        success,
        error_message,
        pushed_at
      FROM sap_sync_log
    `;

    if (itemCode) {
      q += ` WHERE item_code = $1`;
      q += ` ORDER BY pushed_at DESC`;
      return await query(q, [itemCode]);
    }

    q += ` ORDER BY pushed_at DESC`;
    return await query(q);
  } catch (error: any) {
    logger.error('Failed to get sync status:', error.message);
    return [];
  }
}
