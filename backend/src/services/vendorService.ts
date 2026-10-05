import { query,queryOne } from '../db/pool';
import { CreateMaterialBody,UpdateMaterialBody,Vendor,VendorMaterial,VendorMaterialRow } from '../types';
import { appCache } from './cacheService';

function mapVendorMaterial(row: VendorMaterialRow): VendorMaterial {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    grade: row.grade,
    customerName: (row.customer_name === 'All' || !row.customer_name) ? '—' : row.customer_name,
    castingCode: row.casting_code,
    rmWeight: Number(row.rm_weight),
    revisedRatePerKg: Number(row.revised_rate_per_kg),
    mmrRate: Number(row.mmr_rate),
    roRate: Number(row.ro_rate),
    consumablesRate: Number(row.consumables_rate),
    extraFactor: Number(row.extra_factor),
    fromDate: row.from_date,
    toDate: row.to_date,
    machineType: row.machine_type || undefined,
    coating: row.coating || undefined,
    cavity: row.cavity || undefined,
    coreSleeve: row.core_sleeve || undefined,
    itemCode: row.item_code || undefined,
    itemDescription: row.item_description || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllVendors(
  page?: number, 
  pageSize?: number, 
  search?: string, 
  name?: string, 
  bpCode?: string, 
  groupName?: string
): Promise<{ items: Vendor[]; total: number; page?: number; pageSize?: number } | Vendor[]> {
  // Auto-sync vendor materials from SAP in background (fire-and-forget)
  // Uses ON CONFLICT DO NOTHING so it's safe and fast on repeat calls
  syncVendorMaterialsFromSAP().catch(err => 
    console.warn('[vendor-sync] Background sync failed:', err.message)
  );

  let whereClause = `WHERE TRIM(o.cardcode) LIKE 'SUP%'`;
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    const q = `%${search.trim()}%`;
    whereClause += ` AND (o.cardname ILIKE $${paramIdx} OR o.cardcode ILIKE $${paramIdx} OR g.groupname ILIKE $${paramIdx} OR EXISTS (SELECT 1 FROM vendor_materials vm WHERE vm.vendor_id = TRIM(o.cardcode) AND (vm.item_code ILIKE $${paramIdx} OR vm.casting_code ILIKE $${paramIdx})))`;
    params.push(q);
    paramIdx++;
  }
  if (name) {
    whereClause += ` AND o.cardname = $${paramIdx}`;
    params.push(name);
    paramIdx++;
  }
  if (bpCode) {
    whereClause += ` AND o.cardcode = $${paramIdx}`;
    params.push(bpCode);
    paramIdx++;
  }
  if (groupName) {
    whereClause += ` AND g.groupname = $${paramIdx}`;
    params.push(groupName);
    paramIdx++;
  }

  if (page && pageSize) {
    const offset = (page - 1) * pageSize;
    
    const countSql = `
      SELECT COUNT(DISTINCT o.cardcode) as count 
      FROM ocrd_sftp o
      LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
      ${whereClause}`;
    const countQuery = await query<any>(countSql, params);
    const total = parseInt(countQuery[0].count, 10);

    const sql = `
      SELECT DISTINCT 
          TRIM(o.cardcode) as id, 
          o.cardname as name, 
          TRIM(o.cardcode) as bp_code,
          o.groupcode::TEXT as group_code,
          TRIM(g.groupname) as group_name
       FROM ocrd_sftp o
       LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
       ${whereClause}
       ORDER BY o.cardname ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const vendors = await query<any>(sql, [...params, pageSize, offset]);
    let materials: VendorMaterialRow[] = [];
    if (vendors.length > 0) {
      const vendorIds = vendors.map(v => typeof v.id === 'string' ? v.id.trim() : v.id);
      materials = await query<VendorMaterialRow>(
        `WITH latest_history AS (
           SELECT DISTINCT ON (TRIM(vendor_id), TRIM(COALESCE(item_code, casting_code)))
             TRIM(vendor_id) AS vendor_id,
             TRIM(COALESCE(item_code, casting_code)) AS code_key,
             TRIM(item_code) AS item_code,
             TRIM(casting_code) AS casting_code,
             new_rm_weight AS rm_weight,
             new_revised_rate_per_kg AS revised_rate_per_kg,
             new_revised_price AS revised_price,
             from_date,
             to_date,
             new_mmr_rate AS mmr_rate,
             new_ro_rate AS ro_rate,
             new_consumables_rate AS consumables_rate,
             new_extra_factor AS extra_factor
           FROM vendor_materials_history
           WHERE TRIM(vendor_id) = ANY($1::text[])
             AND (new_rm_weight > 0 OR new_revised_rate_per_kg > 0 OR new_revised_price > 0)
           ORDER BY TRIM(vendor_id), TRIM(COALESCE(item_code, casting_code)), changed_at DESC, id DESC
         )
         SELECT 
           vm.id,
           vm.vendor_id,
           COALESCE(NULLIF(NULLIF(TRIM(vm.grade), '0'), ''), TRIM(oi.u_grade), '—') AS grade,
           vm.customer_name,
           vm.casting_code,
           vm.item_code,
           COALESCE(NULLIF(TRIM(vm.item_description), ''), NULLIF(TRIM(oi.itemname), '')) AS item_description,
           COALESCE(NULLIF(vm.rm_weight, 0), lh.rm_weight, 0) AS rm_weight,
           COALESCE(NULLIF(vm.revised_rate_per_kg, 0), lh.revised_rate_per_kg, 0) AS revised_rate_per_kg,
           COALESCE(NULLIF(vm.revised_price, 0), lh.revised_price, 0) AS revised_price,
           COALESCE(NULLIF(vm.mmr_rate, 0), lh.mmr_rate, 0) AS mmr_rate,
           COALESCE(NULLIF(vm.ro_rate, 0), lh.ro_rate, 0) AS ro_rate,
           COALESCE(NULLIF(vm.consumables_rate, 0), lh.consumables_rate, 0) AS consumables_rate,
           COALESCE(NULLIF(vm.extra_factor, 0), lh.extra_factor, 0) AS extra_factor,
           COALESCE(vm.from_date, lh.from_date) AS from_date,
           COALESCE(vm.to_date, lh.to_date) AS to_date,
           vm.machine_type,
           vm.coating,
           vm.cavity,
           vm.core_sleeve,
           vm.created_at,
           vm.updated_at
         FROM vendor_materials vm
         LEFT JOIN LATERAL (
           SELECT lh.rm_weight, lh.revised_rate_per_kg, lh.revised_price,
                  lh.mmr_rate, lh.ro_rate, lh.consumables_rate, lh.extra_factor,
                  lh.from_date, lh.to_date
           FROM latest_history lh
           WHERE TRIM(lh.vendor_id) = TRIM(vm.vendor_id)
             AND (
               (vm.item_code IS NOT NULL AND TRIM(lh.item_code) = TRIM(vm.item_code))
               OR (
                 (vm.item_code IS NULL OR TRIM(lh.item_code) != TRIM(vm.item_code))
                 AND TRIM(lh.casting_code) = TRIM(vm.casting_code)
               )
             )
           ORDER BY CASE WHEN vm.item_code IS NOT NULL AND TRIM(lh.item_code) = TRIM(vm.item_code) THEN 0 ELSE 1 END
           LIMIT 1
         ) lh ON true
         LEFT JOIN oitm_sftp oi ON (vm.item_code IS NOT NULL AND TRIM(oi.itemcode) = TRIM(vm.item_code))
                           OR (vm.item_code IS NULL AND TRIM(oi.u_grade) = TRIM(vm.grade)
                                                   AND TRIM(oi.frgnname) = TRIM(vm.customer_name)
                                                   AND TRIM(oi.u_castingcode) = TRIM(vm.casting_code))
         WHERE TRIM(vm.vendor_id) = ANY($1::text[])
         ORDER BY vm.created_at DESC, vm.id DESC`,
        [vendorIds]
      );
    }

    const items = vendors.map(v => {
      const vId = typeof v.id === 'string' ? v.id.trim() : v.id;
      const vMaterials = materials
        .filter(m => typeof m.vendor_id === 'string' ? m.vendor_id.trim() === vId : m.vendor_id === vId)
        .map(mapVendorMaterial);
      return {
        id: vId,
        name: typeof v.name === 'string' ? v.name.trim() : v.name,
        bpCode: typeof v.bp_code === 'string' ? v.bp_code.trim() : (v.bp_code || ''),
        groupCode: v.group_code,
        groupName: typeof v.group_name === 'string' ? v.group_name.trim() : v.group_name,
        materials: vMaterials,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }).sort((a, b) => b.materials.length - a.materials.length || a.name.localeCompare(b.name));

    return { items, total, page, pageSize };
  }

  const sql = `
    SELECT DISTINCT 
        TRIM(o.cardcode) as id, 
        o.cardname as name, 
        TRIM(o.cardcode) as bp_code,
        o.groupcode::TEXT as group_code,
        TRIM(g.groupname) as group_name
     FROM ocrd_sftp o
     LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
     ${whereClause}
     ORDER BY o.cardname ASC`;
     
  const vendors = await query<any>(sql, params);
  
  // Non-paginated query is typically used only for populating dropdown filter options,
  // where the materials list is completely unused. We skip fetching materials here to save DB resources.
  return vendors.map(v => {
    const vId = typeof v.id === 'string' ? v.id.trim() : v.id;
    return {
      id: vId,
      name: typeof v.name === 'string' ? v.name.trim() : v.name,
      bpCode: typeof v.bp_code === 'string' ? v.bp_code.trim() : (v.bp_code || ''),
      groupCode: v.group_code,
      groupName: typeof v.group_name === 'string' ? v.group_name.trim() : v.group_name,
      materials: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function getVendorById(id: string, date?: string): Promise<Vendor | null> {
  const vendorRow = await queryOne<any>(
    `SELECT 
        o.cardcode as id, 
        o.cardname as name, 
        o.cardcode as bp_code, 
        o.groupcode::TEXT as group_code,
        g.groupname as group_name
     FROM ocrd_sftp o
     LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
     WHERE o.cardcode = $1`, [id]
  );
  if (!vendorRow) return null;

  const cleanDate = typeof date === 'string' ? date.trim() : undefined;
  let dateFilterClauseVendor = '';
  if (cleanDate && /^\d{4}-\d{2}$/.test(cleanDate)) {
    const fy = parseInt(cleanDate.split('-')[0], 10);
    const fm = parseInt(cleanDate.split('-')[1], 10);
    const firstDay = `${cleanDate}-01`;
    const lastDayDate = new Date(fy, fm, 0);
    const lastDay = `${cleanDate}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    dateFilterClauseVendor = `
      AND (vm.from_date IS NULL OR vm.from_date::DATE <= '${lastDay}'::DATE)
      AND (vm.to_date IS NULL OR vm.to_date::DATE >= '${firstDay}'::DATE)`;
  }

  const materials = await query<VendorMaterialRow>(
    `SELECT vm.*,
            COALESCE(NULLIF(NULLIF(TRIM(vm.grade), '0'), ''), TRIM(oi.u_grade), '—') AS grade,
            COALESCE(NULLIF(TRIM(vm.item_description), ''), NULLIF(TRIM(oi.itemname), '')) AS item_description
     FROM (
       SELECT 
         id, vendor_id, item_code, item_description, grade, customer_name, casting_code, 
         rm_weight, revised_rate_per_kg, revised_price,
         mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date,
         COALESCE(updated_at, NOW()) AS created_at
       FROM vendor_materials
       
       UNION ALL
       
       SELECT 
         id, vendor_id, item_code, item_description, grade, customer_name, casting_code, 
         new_rm_weight as rm_weight, new_revised_rate_per_kg as revised_rate_per_kg, new_revised_price as revised_price,
         new_mmr_rate as mmr_rate, new_ro_rate as ro_rate, new_consumables_rate as consumables_rate, new_extra_factor as extra_factor, from_date, to_date,
         changed_at as created_at
       FROM vendor_materials_history
     ) vm
     LEFT JOIN oitm_sftp oi ON (vm.item_code IS NOT NULL AND TRIM(oi.itemcode) = TRIM(vm.item_code))
                       OR (vm.item_code IS NULL AND TRIM(oi.u_grade) = TRIM(vm.grade)
                                               AND TRIM(oi.frgnname) = TRIM(vm.customer_name)
                                               AND TRIM(oi.u_castingcode) = TRIM(vm.casting_code))
     WHERE vm.vendor_id = $1
       ${dateFilterClauseVendor}
     ORDER BY vm.created_at DESC, vm.id DESC`, [id.trim()]
  );
  // Apply pending dispute overrides from pricing_batch_items.
  // Params are pre-trimmed on app side — no TRIM() on column side so PG indexes are usable.
  // Match by item_code exact, or item_code + '-RM', or casting_code.
  // No customer_name filter — avoids SAP vs Price List name mismatch.
  let pbiDateParams: string[] = [];
  let pbiDateClauses = '';
  if (date && /^\d{4}-\d{2}$/.test(date)) {
    const fy = parseInt(date.split('-')[0], 10);
    const fm = parseInt(date.split('-')[1], 10);
    const firstDay = `${date}-01`;
    const lastDayDate = new Date(fy, fm, 0);
    const lastDay = `${date}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    // $4 = lastDay, $5 = firstDay (positional, after the 3 code params)
    pbiDateClauses = `
      AND (from_date IS NULL OR from_date::DATE <= $4::DATE)
      AND (to_date IS NULL OR to_date::DATE >= $5::DATE)
    `;
    pbiDateParams = [lastDay, firstDay];
  }

  for (const m of materials) {
    const baseCode = m.item_code ? m.item_code.trim().replace(/-RM$/i, '') : null;
    const rmCode = baseCode ? baseCode + '-RM' : null;
    const castCode = m.casting_code ? m.casting_code.trim() : null;
    if (!baseCode && !castCode) continue;

    const vendorIdIdx = pbiDateParams.length + 4;
    const pbiOverride = await queryOne<any>(`
      SELECT rm_weight, rm_cost, new_price, customer_rm_weight, customer_rate_per_kg
      FROM pricing_batch_items
      WHERE (
        ($1::TEXT IS NOT NULL AND (item_code = $1 OR item_code = $2))
        OR ($3::TEXT IS NOT NULL AND casting_code = $3)
      )
      AND TRIM(vendor_id) = TRIM($${vendorIdIdx})
      AND LOWER(status) IN ('pending', 'approved', 'open')
      ${pbiDateClauses}
      ORDER BY id DESC
      LIMIT 1
    `, [baseCode, rmCode, castCode, ...pbiDateParams, id.trim()]);

    if (pbiOverride) {
      if (pbiOverride.customer_rm_weight != null && Number(pbiOverride.customer_rm_weight) > 0) {
        m.rm_weight = Number(pbiOverride.customer_rm_weight);
      } else if (pbiOverride.rm_weight != null && Number(pbiOverride.rm_weight) > 0) {
        m.rm_weight = Number(pbiOverride.rm_weight);
      }

      if (pbiOverride.customer_rate_per_kg != null && Number(pbiOverride.customer_rate_per_kg) > 0) {
        m.revised_rate_per_kg = Number(pbiOverride.customer_rate_per_kg);
      } else if (pbiOverride.rm_weight != null && Number(pbiOverride.rm_weight) > 0 && pbiOverride.rm_cost != null) {
        m.revised_rate_per_kg = Number(pbiOverride.rm_cost) / Number(pbiOverride.rm_weight);
      } else if (pbiOverride.new_price != null && Number(pbiOverride.rm_weight) > 0) {
        m.revised_rate_per_kg = Number(pbiOverride.new_price) / Number(pbiOverride.rm_weight);
      }
    }
  }

  return {
    id: vendorRow.id,
    name: vendorRow.name,
    bpCode: vendorRow.bp_code,
    groupCode: vendorRow.group_code,
    groupName: typeof vendorRow.group_name === 'string' ? vendorRow.group_name.trim() : vendorRow.group_name,
    materials: materials.map(mapVendorMaterial),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function addVendorMaterial(vendorId: string, body: CreateMaterialBody): Promise<VendorMaterial | null> {
  console.log('[ADD_MATERIAL DEBUG]', { vendorId, grade: body.grade, customerName: body.customerName, castingCode: body.castingCode, itemCode: body.itemCode, itemDescription: body.itemDescription });
  
  let itemCode = body.itemCode?.trim() || null;
  let itemDescription = body.itemDescription?.trim() || null;
  
  // Use the imported itemCode and itemDescription as the direct source of truth without SAP resolution lookup.

  // Check if it already exists to emulate ON CONFLICT DO UPDATE
  let existingId: number | null = null;
  if (itemCode && itemCode !== body.castingCode?.trim()) {
    const existing = await queryOne<any>(
      `SELECT id FROM vendor_materials 
       WHERE TRIM(vendor_id) = $1 
         AND TRIM(item_code) = $2`,
      [
        vendorId.trim(), 
        itemCode.trim()
      ]
    );
    existingId = existing?.id || null;
  }

  if (!existingId) {
    const existing = await queryOne<any>(
      `SELECT id FROM vendor_materials 
       WHERE TRIM(vendor_id) = $1 
         AND TRIM(grade) = $2 
         AND TRIM(customer_name) = $3 
         AND TRIM(casting_code) = $4
         AND COALESCE(TRIM(item_description), '') = COALESCE(TRIM($5), '')
         AND COALESCE(TRIM(machine_type), '') = COALESCE(TRIM($6), '')
         AND COALESCE(TRIM(coating), '') = COALESCE(TRIM($7), '')
         AND COALESCE(TRIM(cavity), '') = COALESCE(TRIM($8), '')
         AND COALESCE(TRIM(core_sleeve), '') = COALESCE(TRIM($9), '')`,
      [
        vendorId.trim(), 
        body.grade.trim(), 
        (body.customerName || 'All').trim(), 
        (body.castingCode || 'All').trim(),
        itemDescription || null,
        body.machineType || null,
        body.coating || null,
        body.cavity || null,
        body.coreSleeve || null
      ]
    );
    existingId = existing?.id || null;
  }

  let row: VendorMaterialRow | null = null;

  if (existingId) {
    row = await queryOne<VendorMaterialRow>(
      `UPDATE vendor_materials SET
         rm_weight = $1, revised_rate_per_kg = $2, revised_price = $1::numeric * $2::numeric,
         mmr_rate = $3, ro_rate = $4, consumables_rate = $5, extra_factor = $6,
         from_date = $7, to_date = $8, machine_type = $9, coating = $10, cavity = $11, core_sleeve = $12,
         item_code = COALESCE($13, item_code), item_description = COALESCE($14, item_description),
         updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [
        body.rmWeight || 0, body.revisedRatePerKg || 0, body.mmrRate, body.roRate, body.consumablesRate, body.extraFactor,
        body.fromDate || null, body.toDate || null, body.machineType || null, body.coating || null, body.cavity || null, body.coreSleeve || null,
        itemCode, itemDescription, existingId
      ]
    );
  } else {
    row = await queryOne<VendorMaterialRow>(
      `INSERT INTO vendor_materials (
         vendor_id, item_code, item_description, grade, customer_name, casting_code, rm_weight, revised_rate_per_kg, revised_price,
         mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date, machine_type, coating, cavity, core_sleeve, groupcode, groupname
       )
       SELECT
         $1, $2, $3, $4, $5, $6, $7, $8, $7::numeric * $8::numeric,
         $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         o.groupcode, og.groupname
       FROM (SELECT $1::text as vendor_id) v
       LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
       LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)
       RETURNING *`,
      [
        vendorId, itemCode, itemDescription, body.grade, body.customerName || 'All', body.castingCode || 'All', body.rmWeight || 0, body.revisedRatePerKg || 0,
        body.mmrRate, body.roRate, body.consumablesRate, body.extraFactor, body.fromDate || null, body.toDate || null,
        body.machineType || null, body.coating || null, body.cavity || null, body.coreSleeve || null
      ]
    );
  }

  console.log('[ADD_MATERIAL DEBUG RESULT]', row ? `Returned row id ${row.id}, rm_weight ${row.rm_weight}` : 'No row returned');

  if (row) {
    // Fire-and-forget: don't block the HTTP response waiting for pricing table sync.
    // syncToPricingTables queries argit_pll1/aargit_plp1/aargit_ple1 which can be slow.
    syncToPricingTables(vendorId, row.item_code || null, row.grade, row.customer_name, row.casting_code, Number(row.rm_weight), Number(row.revised_rate_per_kg))
      .catch(err => console.warn('[addMaterial] syncToPricingTables failed (non-blocking):', err.message));
    const joined = await queryOne<VendorMaterialRow>(
      `SELECT vm.*, COALESCE(NULLIF(TRIM(vm.item_description), ''), NULLIF(TRIM(oi.itemname), '')) AS item_description 
       FROM vendor_materials vm
       LEFT JOIN oitm_sftp oi ON (vm.item_code IS NOT NULL AND TRIM(oi.itemcode) = TRIM(vm.item_code))
                         OR (vm.item_code IS NULL AND TRIM(oi.u_grade) = TRIM(vm.grade) 
                                                 AND TRIM(oi.frgnname) = TRIM(vm.customer_name)
                                                 AND TRIM(oi.u_castingcode) = TRIM(vm.casting_code))
       WHERE vm.id = $1`, [row.id]
    );
    appCache.flushAll();
    return joined ? mapVendorMaterial(joined) : mapVendorMaterial(row);
  }

  return null;
}

export async function updateVendorMaterial(vendorId: string, materialId: number, body: UpdateMaterialBody): Promise<VendorMaterial | null> {
  console.log("updateVendorMaterial called with body:", body);
  
  let itemCode = body.itemCode?.trim() || null;
  let itemDescription = body.itemDescription?.trim() || null;
  
  // Maintain the edited itemCode and itemDescription as the direct source of truth without SAP lookup.

  const row = await queryOne<VendorMaterialRow>(
    `UPDATE vendor_materials
     SET customer_name=$1, casting_code=$2, rm_weight=$3, revised_rate_per_kg=$4, revised_price=$3::numeric * $4::numeric, mmr_rate=$5, ro_rate=$6, consumables_rate=$7, extra_factor=$8, from_date=$9, to_date=$10, machine_type=$11, coating=$12, cavity=$13, core_sleeve=$14, item_code=$15, item_description=$16, updated_at=NOW()
     WHERE id=$17 AND TRIM(vendor_id)=TRIM($18)
     RETURNING *`,
    [
      body.customerName || 'All',
      body.castingCode || 'All',
      body.rmWeight || 0,
      body.revisedRatePerKg || 0,
      body.mmrRate,
      body.roRate,
      body.consumablesRate,
      body.extraFactor,
      body.fromDate || null,
      body.toDate || null,
      body.machineType || null,
      body.coating || null,
      body.cavity || null,
      body.coreSleeve || null,
      itemCode,
      itemDescription,
      materialId,
      vendorId
    ]
  );

  if (row) {
    // Fire-and-forget: don't block the HTTP response waiting for pricing table sync.
    // syncToPricingTables queries argit_pll1/aargit_plp1/aargit_ple1 which can be slow.
    syncToPricingTables(vendorId, row.item_code || null, row.grade, row.customer_name, row.casting_code, Number(row.rm_weight), Number(row.revised_rate_per_kg))
      .catch(err => console.warn('[updateMaterial] syncToPricingTables failed (non-blocking):', err.message));
    const joined = await queryOne<VendorMaterialRow>(
      `SELECT vm.*, COALESCE(NULLIF(TRIM(vm.item_description), ''), NULLIF(TRIM(oi.itemname), '')) AS item_description 
       FROM vendor_materials vm
       LEFT JOIN oitm_sftp oi ON (vm.item_code IS NOT NULL AND TRIM(oi.itemcode) = TRIM(vm.item_code))
                         OR (vm.item_code IS NULL AND TRIM(oi.u_grade) = TRIM(vm.grade) 
                                                 AND TRIM(oi.frgnname) = TRIM(vm.customer_name)
                                                 AND TRIM(oi.u_castingcode) = TRIM(vm.casting_code))
       WHERE vm.id = $1`, [row.id]
    );
    appCache.flushAll();
    return joined ? mapVendorMaterial(joined) : mapVendorMaterial(row);
  }

  return null;
}

export async function syncToPricingTables(_vendorId: string, itemCode: string | null, _grade: string, _customerName: string, castingCode: string, weight: number, rate: number) {
  if (!itemCode || itemCode === 'All' || itemCode === '') {
    if (!castingCode || castingCode === 'All') return;
  }

  let items: any[] = [];
  if (itemCode && itemCode !== 'All' && itemCode !== '') {
    items = await query<any>(
      `SELECT TRIM(itemcode) as itemcode, itmsgrpcod, u_domeexpo, u_bought 
       FROM oitm_sftp 
       WHERE TRIM(itemcode) = $1`,
      [itemCode.trim()]
    );
  } else {
    items = await query<any>(
      `SELECT TRIM(itemcode) as itemcode, itmsgrpcod, u_domeexpo, u_bought 
       FROM oitm_sftp 
       WHERE TRIM(itemcode) = $1 OR TRIM(u_castingcode) = $1`,
      [castingCode.trim()]
    );
  }

  for (const item of items) {
    const cleanCode = item.itemcode;
    const isLabour = ['125', '128'].includes(String(item.itmsgrpcod || '')) || 
                     String(item.u_bought || '').trim() === 'Job Work';
    const isPin = ['116', '118'].includes(String(item.itmsgrpcod || '')) || 
                  String(item.u_domeexpo || '').toUpperCase().includes('PIN BUSH') ||
                  String(item.u_domeexpo || '').toUpperCase().includes('PIN PUSH');

    const castingPrice = weight * rate;

    if (isLabour) {
      const pll = await queryOne<any>('SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing" FROM "argit_pll1" WHERE TRIM("U_ItemNo") = $1', [cleanCode]);
      if (pll) {
        const rejectionCost = Number(pll.U_RejCost || 0);
        const powderCoating = Number(pll.U_PowdCoat || 0);
        const specialProcess = Number(pll.U_SpecProc || 0);
        const process = Number(pll.U_ProcMach || 0);
        const transCharges = Number(pll.U_TranChar || 0);
        const ohp = Number(pll.U_OHP || 0);
        const packing = Number(pll.U_Packing || 0);
        const totalWorkingCost = rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing;
        const finalPrice = castingPrice + totalWorkingCost;

        await query(
          `UPDATE "argit_pll1" SET 
             "U_CastWt" = $1, "U_CastRate" = $2, "U_CastPric" = $3, 
             "U_ActCost" = $4, "U_FinPrice" = $5 
           WHERE TRIM("U_ItemNo") = $6`,
          [String(weight), String(rate), String(castingPrice), String(totalWorkingCost), String(finalPrice), cleanCode]
        );
      }
    } else if (isPin) {
      const plp = await queryOne<any>('SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing" FROM "aargit_plp1" WHERE TRIM("U_ItemNo") = $1', [cleanCode]);
      if (plp) {
        const rejectionCost = Number(plp.U_RejCost || 0);
        const powderCoating = Number(plp.U_PowdCoat || 0);
        const specialProcess = Number(plp.U_SpecProc || 0);
        const process = Number(plp.U_ProcMach || 0);
        const transCharges = Number(plp.U_TranChar || 0);
        const ohp = Number(plp.U_OHP || 0);
        const packing = Number(plp.U_Packing || 0);
        const totalWorkingCost = rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing;
        const finalPrice = castingPrice + totalWorkingCost;

        await query(
          `UPDATE "aargit_plp1" SET 
             "U_CastWt" = $1, "U_CastRate" = $2, "U_CastPric" = $3, 
             "U_ActCost" = $4, "U_FinPrice" = $5 
           WHERE TRIM("U_ItemNo") = $6`,
          [String(weight), String(rate), String(castingPrice), String(totalWorkingCost), String(finalPrice), cleanCode]
        );
      }
    } else {
      const ple = await queryOne<any>('SELECT "U_RejCost", "U_PowdCoat", "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing", "U_LessDome", "U_AsblyCst", "U_ExpPack", "U_FOBCost", "U_OHICCExp", "U_ExpoHead", "U_Forex" FROM "aargit_ple1" WHERE TRIM("U_ItemNo") = $1', [cleanCode]);
      if (ple) {
        const rejectionCost = Number(ple.U_RejCost || 0);
        const powderCoating = Number(ple.U_PowdCoat || 0);
        const specialProcess = Number(ple.U_SpecProc || 0);
        const process = Number(ple.U_ProcMach || 0);
        const transCharges = Number(ple.U_TranChar || 0);
        const ohp = Number(ple.U_OHP || 0);
        const packing = Number(ple.U_Packing || 0);
        const totalWorkingCost = rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing;
        const finalPrice = castingPrice + totalWorkingCost;

        const lessDomesticPacking = Number(ple.U_LessDome || 0);
        const assemblyCost = Number(ple.U_AsblyCst || 0);
        const exportPackingCost = Number(ple.U_ExpPack || 0);
        const fobCost = Number(ple.U_FOBCost || 0);
        const ohIccExport = Number(ple.U_OHICCExp || 0);
        const addedExportOverheads = Number(ple.U_ExpoHead || 0);
        const forex = Number(ple.U_Forex || 0);

        const unitPriceExportVal = finalPrice - lessDomesticPacking + assemblyCost + exportPackingCost + fobCost + ohIccExport + addedExportOverheads;
        const unitPriceExport = String(Math.round(unitPriceExportVal));
        const unitPriceForeignCurrencyVal = forex > 0 ? (unitPriceExportVal / forex) : 0;
        const unitPriceForeignCurrency = unitPriceForeignCurrencyVal > 0 ? unitPriceForeignCurrencyVal.toFixed(4) : '';

        await query(
          `UPDATE "aargit_ple1" SET 
             "U_CastWt" = $1::text::numeric::double precision,
             "U_CastRate" = $2::text::numeric::double precision,
             "U_CastPric" = $3::text,
             "U_ActCost" = ROUND($4::text::numeric)::bigint,
             "U_FinPrice" = $5::text,
             "U_UnPriEx" = $6::text,
             "U_ForeCurr" = $7::text
           WHERE TRIM("U_ItemNo") = $8`,
          [
            String(weight),
            String(rate),
            String(castingPrice),
            String(totalWorkingCost),
            String(finalPrice),
            unitPriceExport,
            unitPriceForeignCurrency,
            cleanCode
          ]
        );
      }
    }
  }
}



export async function getVendorMaterialsHistory(): Promise<any[]> {
  const sql = `
    SELECT h.*, v.cardname as vendor_name 
    FROM vendor_materials_history h
    LEFT JOIN ocrd_sftp v ON h.vendor_id = v.cardcode
    ORDER BY h.changed_at DESC
  `;
  return query<any>(sql);
}

/**
 * Sync vendor materials from SAP Item Master (oitm) using cascading vendor lookup.
 * Priority: por1/opor (Purchase Orders) → ospp (Special Prices)
 * Only creates new mappings (ON CONFLICT DO NOTHING), never overwrites existing data.
 */
export async function syncVendorMaterialsFromSAP(): Promise<{ created: number; total: number }> {
  // Disabled as per user request (no vendor sync in oitm table)
  return { created: 0, total: 0 };
}

export async function deleteVendorMaterial(vendorId: string, materialId: number): Promise<boolean> {
  const material = await queryOne<any>(
    'SELECT vendor_id, grade, customer_name, casting_code FROM vendor_materials WHERE id = $1 AND TRIM(vendor_id) = $2',
    [materialId, vendorId.trim()]
  );

  if (material) {
    await query(
      `DELETE FROM vendor_materials_history 
       WHERE TRIM(vendor_id) = TRIM($1) 
         AND TRIM(grade) = TRIM($2) 
         AND TRIM(customer_name) = TRIM($3) 
         AND COALESCE(TRIM(casting_code), '') = COALESCE(TRIM($4), '')`,
      [material.vendor_id, material.grade, material.customer_name, material.casting_code]
    );
  }

  await query('DELETE FROM vendor_materials WHERE id = $1 AND TRIM(vendor_id) = $2', [materialId, vendorId.trim()]);
  appCache.flushAll();
  return true;
}