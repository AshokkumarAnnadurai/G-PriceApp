import { query } from '../db/pool';
import { Customer } from '../types';

export async function getAllCustomers(
  page?: number, 
  pageSize?: number, 
  search?: string, 
  name?: string, 
  bpCode?: string, 
  groupName?: string
): Promise<{ items: Customer[]; total: number; page?: number; pageSize?: number } | Customer[]> {
  
  let whereClause = `WHERE TRIM(o.cardcode) LIKE 'CUS%'`;
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    const q = `%${search.trim()}%`;
    whereClause += ` AND (
      o.cardname ILIKE $${paramIdx} OR 
      o.cardcode ILIKE $${paramIdx} OR 
      g.groupname ILIKE $${paramIdx} OR
      COALESCE(o.cardfname, '') ILIKE $${paramIdx} OR
      EXISTS (
        SELECT 1 FROM (
          SELECT "U_CustCode" AS cust_code, "U_ItemNo" AS item_no FROM "argit_pld1"
          UNION ALL
          SELECT "U_CustCode", "U_ItemNo" FROM "aargit_ple1"
          UNION ALL
          SELECT "U_CustCode", "U_ItemNo" FROM "argit_pll1"
          UNION ALL
          SELECT "U_CustCode", "U_ItemNo" FROM "aargit_plp1"
        ) map
        LEFT JOIN oitm_sftp item ON TRIM(item.itemcode) = TRIM(map.item_no)
        WHERE TRIM(map.cust_code) = TRIM(o.cardcode) AND (
          TRIM(map.item_no) ILIKE $${paramIdx} OR
          TRIM(COALESCE(item.u_castingcode, '')) ILIKE $${paramIdx} OR
          TRIM(COALESCE(item.itemname, '')) ILIKE $${paramIdx}
        )
      )
    )`;
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
          TRIM(o.cardcode) as bp_code, 
          o.cardname as name, 
          o.groupcode::TEXT as group_code,
          TRIM(g.groupname) as group_name, o.cardfname as foreign_name
       FROM ocrd_sftp o
       LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
       ${whereClause}
       ORDER BY o.cardname ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
       
    const rows = await query<any>(sql, [...params, pageSize, offset]);
    
    const items = rows.map(r => ({
      bpCode: typeof r.bp_code === 'string' ? r.bp_code.trim() : (r.bp_code || ''),
      name: typeof r.name === 'string' ? r.name.trim() : r.name,
      groupCode: r.group_code,
      groupName: typeof r.group_name === 'string' ? r.group_name.trim() : r.group_name,
      foreignName: r.foreign_name,
      localName: typeof r.name === 'string' ? r.name.trim() : r.name
    }));

    return { items, total, page, pageSize };
  }

  const sql = `
    SELECT DISTINCT 
        TRIM(o.cardcode) as bp_code, 
        o.cardname as name, 
        o.groupcode::TEXT as group_code,
        TRIM(g.groupname) as group_name, o.cardfname as foreign_name
     FROM ocrd_sftp o
     LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT
     ${whereClause}
     ORDER BY o.cardname ASC`;
     
  const rows = await query<any>(sql, params);
  
  return rows.map(r => ({
    bpCode: typeof r.bp_code === 'string' ? r.bp_code.trim() : (r.bp_code || ''),
    name: typeof r.name === 'string' ? r.name.trim() : r.name,
    groupCode: r.group_code,
    groupName: typeof r.group_name === 'string' ? r.group_name.trim() : r.group_name,
      foreignName: r.foreign_name,
      localName: typeof r.name === 'string' ? r.name.trim() : r.name
  }));
}

export async function getCustomerItems(bpCode: string, groupName: string): Promise<any[]> {
  const { query } = require('../db/pool');

  let table = '';
  if (groupName === 'Domestic') {
    table = 'argit_pld1';
  } else if (groupName === 'Export') {
    table = 'aargit_ple1';
  } else if (groupName === 'Pin & Bush') {
    table = 'aargit_plp1';
  } else if (groupName === 'Labour / Job Work') {
    table = 'argit_pll1';
  } else {
    return [];
  }


  // Copying logic from listItems to ensure perfect compatibility
  let sql = '';
  
  const commonFilteredItems = `
      SELECT TRIM(u."U_ItemNo") as itemcode,
             TRIM(o.itemname) as itemname,
             TRIM(o.frgnname) as frgnname,
             TRIM(o.u_castingcode) as u_castingcode,
             o.itmsgrpcod,
             TRIM(o.u_bought) as u_bought,
             TRIM(o.u_domeexpo) as u_domeexpo,
             TRIM(o.u_grade) as grade
      FROM "${table}" u
      LEFT JOIN oitm_sftp o ON TRIM(o.itemcode) = TRIM(u."U_ItemNo")
      WHERE u."U_CustCode" = $1 
  `;

  if (groupName === 'Domestic') {
    sql = `
      WITH filtered_items AS (
        ${commonFilteredItems}
      ),
      domestic_details AS (
        SELECT DISTINCT ON (TRIM(pld."U_ItemNo"))
          TRIM(pld."U_ItemNo") as item_code,
          pld."U_CustCode" as customer_code,
          pld."U_CustName" as customer_name,
          pld."U_CusApprF" as customer_approval_foundry,
          pld."U_CastWt" as weight,
          pld."U_CastRate" as rate_per_kg,
          pld."U_RejCost" as rejection_cost,
          pld."U_SpecCoat" as special_coating,
          pld."U_PowdCoat" as powder_coating,
          pld."U_SpecProc" as special_process,
          pld."U_ProcMach" as process_machining_others,
          pld."U_TranChar" as trans_charges,
          pld."U_OHP" as ohp,
          pld."U_Packing" as packing,
          pld."U_ActCost" as total_working_cost,
          pld."U_FinPrice" as final_price,
          pld."U_EffDateF" as from_date,
          pld."U_EffDateT" as to_date,
          pld."U_PowdCoatWt" as powder_coating_weight,
          pld."U_PowdCoatRate" as powder_coating_rate,
          pld."U_SpecProcWt" as special_process_weight,
          pld."U_SpecProcRate" as special_process_rate
        FROM "argit_pld1" pld
        WHERE TRIM(pld."U_ItemNo") IN (SELECT itemcode FROM filtered_items) AND TRIM(pld."U_CustCode") = $1
        ORDER BY TRIM(pld."U_ItemNo"), pld."DocEntry"::bigint DESC
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        COALESCE((SELECT TRIM(cust.cardname) FROM ocrd_sftp cust WHERE TRIM(cust.cardcode) = $1 LIMIT 1), dd.customer_name, f.frgnname) AS "foreignName",
        f.u_castingcode AS "castingCode",
        f.grade AS "grade",
        oitb.itmsgrpnam AS "itemGroup",
        f.u_bought AS "boughtOutJobWork",
        f.u_domeexpo AS "exportDomestic",
        dd.weight AS "weight",
        dd.rate_per_kg AS "ratePerKg",
        COALESCE($1::text, dd.customer_code::text) AS "customerCode",
        (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE cardcode = $1 LIMIT 1) AS "currency",
        dd.customer_approval_foundry AS "customerApprovalFoundry",
        dd.rejection_cost AS "rejectionCost",
        dd.special_coating AS "specialCoating",
        dd.powder_coating AS "powderCoating",
        dd.special_process AS "specialProcess",
        dd.process_machining_others AS "process",
        dd.trans_charges AS "transCharges",
        dd.ohp AS "ohp",
        dd.packing AS "packing",
        dd.total_working_cost AS "totalWorkingCost",
        dd.final_price AS "finalPrice",
        dd.from_date AS "fromDate",
        dd.to_date AS "toDate",
        dd.powder_coating_weight AS "powderCoatingWeight",
        dd.powder_coating_rate AS "powderCoatingRate",
        dd.special_process_weight AS "specialProcessWeight",
        dd.special_process_rate AS "specialProcessRate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN domestic_details dd ON dd.item_code = f.itemcode
      ORDER BY f.itemcode ASC
    `;
  } else if (groupName === 'Export') {
    sql = `
      WITH filtered_items AS (
        ${commonFilteredItems}
      ),
      domestic_details AS (
        SELECT DISTINCT ON (TRIM(ple."U_ItemNo"))
          TRIM(ple."U_ItemNo") as item_code,
          ple."U_CustCode" as customer_code,
          ple."U_CustName" as customer_name,
          ple."U_CusApprF" as customer_approval_foundry,
          ple."U_CastWt" as weight,
          ple."U_CastRate" as rate_per_kg,
          ple."U_RejCost" as rejection_cost,
          ple."U_SpecCoat" as special_coating,
          ple."U_PowdCoat" as powder_coating,
          ple."U_SpecProc" as special_process,
          ple."U_ProcMach" as process_machining_others,
          ple."U_TranChar" as trans_charges,
          ple."U_OHP" as ohp,
          ple."U_Packing" as packing,
          ple."U_ActCost" as total_working_cost,
          ple."U_FinPrice" as final_price,
          ple."U_EffDateF" as from_date,
          ple."U_EffDateT" as to_date,
          ple."U_LessDome" as less_domestic_packing,
          ple."U_AsblyCst" as assembly_cost,
          ple."U_ExpPack" as export_packing_cost,
          ple."U_FOBCost" as fob_cost,
          ple."U_OHICCExp" as oh_icc_export,
          ple."U_ExpoHead" as added_export_overheads,
          ple."U_UnPriEx" as unit_price_export,
          ple."U_Forex" as forex,
          ple."U_ForeCurr" as unit_price_foreign_currency,
          ple."U_PowdCoatWt" as powder_coating_weight,
          ple."U_PowdCoatRate" as powder_coating_rate,
          ple."U_SpecProcWt" as special_process_weight,
          ple."U_SpecProcRate" as special_process_rate
        FROM "aargit_ple1" ple
        WHERE TRIM(ple."U_ItemNo") IN (SELECT itemcode FROM filtered_items) AND TRIM(ple."U_CustCode") = $1
        ORDER BY TRIM(ple."U_ItemNo"), ple."DocEntry"::bigint DESC
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        COALESCE((SELECT TRIM(cust.cardname) FROM ocrd_sftp cust WHERE TRIM(cust.cardcode) = $1 LIMIT 1), dd.customer_name, f.frgnname) AS "foreignName",
        f.u_castingcode AS "castingCode",
        f.grade AS "grade",
        oitb.itmsgrpnam AS "itemGroup",
        f.u_bought AS "boughtOutJobWork",
        f.u_domeexpo AS "exportDomestic",
        dd.weight AS "weight",
        dd.rate_per_kg AS "ratePerKg",
        COALESCE($1::text, dd.customer_code::text) AS "customerCode",
        (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE cardcode = $1 LIMIT 1) AS "currency",
        dd.customer_approval_foundry AS "customerApprovalFoundry",
        dd.rejection_cost AS "rejectionCost",
        dd.special_coating AS "specialCoating",
        dd.powder_coating AS "powderCoating",
        dd.special_process AS "specialProcess",
        dd.process_machining_others AS "process",
        dd.trans_charges AS "transCharges",
        dd.ohp AS "ohp",
        dd.packing AS "packing",
        dd.total_working_cost AS "totalWorkingCost",
        dd.final_price AS "finalPrice",
        dd.from_date AS "fromDate",
        dd.to_date AS "toDate",
        dd.less_domestic_packing AS "lessDomesticPacking",
        dd.assembly_cost AS "assemblyCost",
        dd.export_packing_cost AS "exportPackingCost",
        dd.fob_cost AS "fobCost",
        dd.oh_icc_export AS "ohIccExport",
        dd.added_export_overheads AS "addedExportOverheads",
        dd.unit_price_export AS "unitPriceExport",
        dd.forex AS "forex",
        dd.unit_price_foreign_currency AS "unitPriceForeignCurrency",
        dd.powder_coating_weight AS "powderCoatingWeight",
        dd.powder_coating_rate AS "powderCoatingRate",
        dd.special_process_weight AS "specialProcessWeight",
        dd.special_process_rate AS "specialProcessRate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN domestic_details dd ON dd.item_code = f.itemcode
      ORDER BY f.itemcode ASC
    `;
  } else if (groupName === 'Pin & Bush') {
    sql = `
      WITH filtered_items AS (
        ${commonFilteredItems}
      ),
      pin_details AS (
        SELECT DISTINCT ON (TRIM(plp."U_ItemNo"))
          TRIM(plp."U_ItemNo") as item_code,
          plp."U_CustCode" as customer_code,
          plp."U_CustName" as customer_name,
          plp."U_CusApprF" as customer_approval_foundry,
          plp."U_CastWt" as weight,
          plp."U_CastRate" as rate_per_kg,
          plp."U_CastPric" as casting_price,
          plp."U_RejCost" as rejection_cost,
          plp."U_SpecCoat" as special_coating,
          plp."U_PowdCoat" as powder_coating,
          plp."U_PowdCoatWt" as powder_coating_weight,
          plp."U_PowdCoatRate" as powder_coating_rate,
          plp."U_SpecProc" as special_process,
          plp."U_SpecProcWt" as special_process_weight,
          plp."U_SpecProcRate" as special_process_rate,
          plp."U_ProcMach" as process_machining_others,
          plp."U_TranChar" as trans_charges,
          plp."U_OHP" as ohp,
          plp."U_Packing" as packing,
          plp."U_ActCost" as total_working_cost,
          plp."U_FinPrice" as final_price,
          plp."U_EffDateF" as from_date,
          plp."U_EffDateT" as to_date,
          plp."U_BoughJob" as bought_out_job_work,
          plp."U_DomeExpo" as export_domestic,
          plp."U_HardWt" as hardening_wt,
          plp."U_HardRate" as hardening_rate,
          plp."U_Grinding" as grinding,
          plp."U_HChromeW" as hard_chrome_wt,
          plp."U_HChromeR" as hard_chrome_rate,
          plp."U_CuttingWt" as cutting_wt,
          plp."U_CuttingRate" as cutting_rate,
          plp."U_Cutting" as cutting
        FROM "aargit_plp1" plp
        WHERE TRIM(plp."U_ItemNo") IN (SELECT itemcode FROM filtered_items) AND TRIM(plp."U_CustCode") = $1
        ORDER BY TRIM(plp."U_ItemNo"), plp."DocEntry"::bigint DESC
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        COALESCE((SELECT TRIM(cust.cardname) FROM ocrd_sftp cust WHERE TRIM(cust.cardcode) = $1 LIMIT 1), pd.customer_name, f.frgnname) AS "foreignName",
        f.u_castingcode AS "castingCode",
        f.grade AS "grade",
        oitb.itmsgrpnam AS "itemGroup",
        COALESCE(pd.bought_out_job_work::text, f.u_bought::text) AS "boughtOutJobWork",
        COALESCE(pd.export_domestic::text, f.u_domeexpo::text) AS "exportDomestic",
        pd.weight AS "weight",
        pd.rate_per_kg AS "ratePerKg",
        pd.casting_price AS "castingPrice",
        COALESCE($1::text, pd.customer_code::text) AS "customerCode",
        (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE cardcode = $1 LIMIT 1) AS "currency",
        pd.customer_approval_foundry AS "customerApprovalFoundry",
        pd.rejection_cost AS "rejectionCost",
        pd.special_coating AS "specialCoating",
        pd.powder_coating AS "powderCoating",
        pd.powder_coating_weight AS "powderCoatingWeight",
        pd.powder_coating_rate AS "powderCoatingRate",
        pd.special_process AS "specialProcess",
        pd.special_process_weight AS "specialProcessWeight",
        pd.special_process_rate AS "specialProcessRate",
        pd.process_machining_others AS "process",
        pd.trans_charges AS "transCharges",
        pd.ohp AS "ohp",
        pd.packing AS "packing",
        pd.total_working_cost AS "totalWorkingCost",
        pd.final_price AS "finalPrice",
        pd.from_date AS "fromDate",
        pd.to_date AS "toDate",
        pd.hardening_wt AS "hardeningWt",
        pd.hardening_rate AS "hardeningRate",
        pd.grinding AS "grinding",
        pd.hard_chrome_wt AS "hardChromeWt",
        pd.hard_chrome_rate AS "hardChromeRate",
        pd.cutting_wt AS "cuttingWeight",
        pd.cutting_rate AS "cuttingRate",
        pd.cutting AS "cutting"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN pin_details pd ON pd.item_code = f.itemcode
      ORDER BY f.itemcode ASC
    `;
  } else if (groupName === 'Labour / Job Work') {
    sql = `
      WITH filtered_items AS (
        ${commonFilteredItems}
      ),
      labour_details AS (
        SELECT DISTINCT ON (TRIM(pll."U_ItemNo"))
          TRIM(pll."U_ItemNo") as item_code,
          pll."U_CustCode" as customer_code,
          pll."U_CustName" as customer_name,
          pll."U_CusApprF" as customer_approval_foundry,
          pll."U_CastWt" as weight,
          pll."U_CastRate" as rate_per_kg,
          pll."U_CastPric" as casting_price,
          pll."U_RejCost" as rejection_cost,
          pll."U_SpecCoat" as special_coating,
          pll."U_PowdCoat" as powder_coating,
          pll."U_PowdCoatWt" as powder_coating_weight,
          pll."U_PowdCoatRate" as powder_coating_rate,
          pll."U_SpecProc" as special_process,
          pll."U_SpecProcWt" as special_process_weight,
          pll."U_SpecProcRate" as special_process_rate,
          pll."U_ProcMach" as process_machining_others,
          pll."U_TranChar" as trans_charges,
          pll."U_OHP" as ohp,
          pll."U_Packing" as packing,
          pll."U_ActCost" as total_working_cost,
          pll."U_FinPrice" as final_price,
          pll."U_EffDateF" as from_date,
          pll."U_EffDateT" as to_date,
          pll."U_BoughJob" as bought_out_job_work,
          pll."U_DomeExpo" as export_domestic
        FROM "argit_pll1" pll
        WHERE TRIM(pll."U_ItemNo") IN (SELECT itemcode FROM filtered_items) AND TRIM(pll."U_CustCode") = $1
        ORDER BY TRIM(pll."U_ItemNo"), pll."DocEntry"::bigint DESC
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        COALESCE((SELECT TRIM(cust.cardname) FROM ocrd_sftp cust WHERE TRIM(cust.cardcode) = $1 LIMIT 1), ld.customer_name, f.frgnname) AS "foreignName",
        f.u_castingcode AS "castingCode",
        f.grade AS "grade",
        oitb.itmsgrpnam AS "itemGroup",
        COALESCE(ld.bought_out_job_work::text, f.u_bought::text) AS "boughtOutJobWork",
        COALESCE(ld.export_domestic::text, f.u_domeexpo::text) AS "exportDomestic",
        ld.weight AS "weight",
        ld.rate_per_kg AS "ratePerKg",
        ld.casting_price AS "castingPrice",
        COALESCE($1::text, ld.customer_code::text) AS "customerCode",
        (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE cardcode = $1 LIMIT 1) AS "currency",
        ld.customer_approval_foundry AS "customerApprovalFoundry",
        ld.rejection_cost AS "rejectionCost",
        ld.special_coating AS "specialCoating",
        ld.powder_coating AS "powderCoating",
        ld.powder_coating_weight AS "powderCoatingWeight",
        ld.powder_coating_rate AS "powderCoatingRate",
        ld.special_process AS "specialProcess",
        ld.special_process_weight AS "specialProcessWeight",
        ld.special_process_rate AS "specialProcessRate",
        ld.process_machining_others AS "process",
        ld.trans_charges AS "transCharges",
        ld.ohp AS "ohp",
        ld.packing AS "packing",
        (COALESCE(ld.powder_coating::numeric, 0) + COALESCE(ld.special_process::numeric, 0) + COALESCE(ld.process_machining_others::numeric, 0) + COALESCE(ld.trans_charges::numeric, 0) + COALESCE(ld.ohp::numeric, 0) + COALESCE(ld.packing::numeric, 0)) AS "totalWorkingCost",
        (COALESCE(ld.powder_coating::numeric, 0) + COALESCE(ld.special_process::numeric, 0) + COALESCE(ld.process_machining_others::numeric, 0) + COALESCE(ld.trans_charges::numeric, 0) + COALESCE(ld.ohp::numeric, 0) + COALESCE(ld.packing::numeric, 0)) AS "finalPrice",
        ld.from_date AS "fromDate",
        ld.to_date AS "toDate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN labour_details ld ON ld.item_code = f.itemcode
      ORDER BY f.itemcode ASC
    `;
  }

  const rows = await query(sql, [bpCode]);
  return rows;
}

export async function addCustomerItem(bpCode: string, itemCode: string, groupName: string, _updatedBy: string): Promise<any> {
  let table = '';
  if (groupName === 'Domestic') {
    table = 'argit_pld1';
  } else if (groupName === 'Export') {
    table = 'aargit_ple1';
  } else if (groupName === 'Labour / Job Work') {
    table = 'argit_pll1';
  } else if (groupName === 'Pin & Bush') {
    table = 'aargit_plp1';
  } else {
    throw new Error(`Mapping not supported for group: ${groupName}`);
  }

  // Get customer info
  const custRes = await query<any>(`SELECT cardname FROM ocrd_sftp WHERE cardcode = $1`, [bpCode]);
  if (!custRes.length) throw new Error('Customer not found');
  const custName = custRes[0].cardname;

  // Get item info
  const itemRes = await query<any>(`SELECT itemname, itmsgrpcod, u_castingcode, u_domeexpo, u_bought FROM oitm_sftp WHERE itemcode = $1`, [itemCode]);
  if (!itemRes.length) throw new Error('Item not found');
  const item = itemRes[0];

  const poolModule = require('../db/pool');
  const client = await poolModule.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if mapping already exists
    const existing = await client.query(`SELECT 1 FROM "${table}" WHERE TRIM("U_ItemNo") = $1 AND "U_CustCode" = $2`, [itemCode.trim(), bpCode.trim()]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new Error(`Item ${itemCode} is already mapped to this customer`);
    }

    const docEntryRes = await client.query(`SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "${table}"`);
    let docEntry = parseInt(docEntryRes.rows[0]?.max || '0', 10) + 1;

    // Insert minimal mapping row
    await client.query(`
      INSERT INTO "${table}" (
        "DocEntry", "LineId", "VisOrder", "Object", "LogInst", 
        "U_ItemNo", "U_ItemDesc", "U_CustCode", "U_CustName", "U_ForgName",
        "U_GrpName", "U_CastCode", "U_DomeExpo", "U_BoughJob", "U_Status"
      ) VALUES (
        $1, 1, 0, $2, 0,
        $3, $4, $5, $6, $7,
        $8, $9, $10, $11, 'Success'
      )
    `, [
      docEntry, table === 'argit_pld1' ? 'OPLD' : table === 'aargit_ple1' ? 'OPLE' : table === 'argit_pll1' ? 'OPLL' : 'OPLP',
      itemCode, item.itemname, bpCode, custName, custName,
      item.itmsgrpcod, item.u_castingcode, item.u_domeexpo, item.u_bought
    ]);

    await client.query('COMMIT');
    return { success: true, itemCode, docEntry };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


export async function mapItemToCustomer(customerCode: string, itemCode: string, activeTab: string) {
  // Get customer details
  const custRes = await query<any>('SELECT cardname FROM ocrd_sftp WHERE cardcode = $1', [customerCode]);
  const customerName = custRes.length > 0 ? custRes[0].cardname : '';

  // Get item details
  const itemRes = await query<any>('SELECT itemname, frgnname, u_castingcode FROM oitm_sftp WHERE itemcode = $1', [itemCode]);
  if (itemRes.length === 0) {
    throw new Error('Item not found in SAP (oitm)');
  }
  const item = itemRes[0];
  const itemName = item.itemname || '';
    
  let table = '';
  if (activeTab === 'Domestic') table = 'argit_pld1';
  else if (activeTab === 'Export') table = 'aargit_ple1';
  else if (activeTab === 'Labour / Job Work') table = 'argit_pll1';
  else if (activeTab === 'Pin & Bush') table = 'aargit_plp1';
  else throw new Error('Unknown tab');

  // Generate a new DocEntry (max + 1)
  const maxRes = await query<any>(`SELECT MAX("DocEntry"::bigint) as max FROM "${table}"`, []);
  const maxDocEntry = parseInt(maxRes[0].max || '0', 10) + 1;

  // Check if it already exists
  const existRes = await query<any>(`SELECT 1 FROM "${table}" WHERE "U_CustCode" = $1 AND "U_ItemNo" = $2`, [customerCode, itemCode]);
  if (existRes.length > 0) {
    throw new Error('Item is already mapped to this customer for this tab');
  }

  const sql = `
    INSERT INTO "${table}" (
      "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
      "U_CustCode", "U_CustName", "U_ItemNo", "U_ItemDesc"
    ) VALUES (
      $1, 1, 0, 'OPLE', 0,
      $2, $3, $4, $5
    )
  `;
  await query(sql, [maxDocEntry, customerCode, customerName, itemCode, itemName]);
  return { success: true };
}

export async function deleteCustomerItem(bpCode: string, itemCode: string, groupName: string): Promise<any> {
  let table = '';
  if (groupName === 'Domestic') {
    table = 'argit_pld1';
  } else if (groupName === 'Export') {
    table = 'aargit_ple1';
  } else if (groupName === 'Labour / Job Work') {
    table = 'argit_pll1';
  } else if (groupName === 'Pin & Bush') {
    table = 'aargit_plp1';
  } else {
    throw new Error(`Mapping removal not supported for group: ${groupName}`);
  }

  await query(`DELETE FROM "${table}" WHERE TRIM("U_ItemNo") = $1 AND "U_CustCode" = $2`, [itemCode.trim(), bpCode.trim()]);
  await query(
    `DELETE FROM customer_pricing_history 
     WHERE TRIM(item_code) = TRIM($1) 
       AND TRIM(customer_code) = TRIM($2)
       AND (group_name IS NULL OR TRIM(group_name) = TRIM($3))`,
    [itemCode.trim(), bpCode.trim(), groupName.trim()]
  );
  return { success: true };
}
