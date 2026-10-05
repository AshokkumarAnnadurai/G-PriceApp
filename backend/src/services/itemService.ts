import { DEFAULT_PAGE_SIZE,MAX_PAGE_SIZE } from '../constants';
import { pool,query,queryOne } from '../db/pool';
import { logger } from '../middleware/logger';
import { ItemMaster,ListItemsQuery,PaginatedResponse,PricingItem } from '../types';
import { getOrSetCache } from './cacheService';

export function excelRound(num: number, decimals: number = 2): number {
  const p = Math.pow(10, decimals);
  return Math.round(Number((num * p).toFixed(8))) / p;
}

export async function trackItemPriceHistory(
  itemCode: string,
  pricingType: string,
  oldData: any,
  newData: any,
  updatedBy: string
) {
  const changedFields: Record<string, { old: any; new: any }> = {};
  
  for (const key of Object.keys(newData)) {
    if (['updatedBy', 'customerName', 'validFrom', 'validTo', 'priceList', 'currency'].includes(key)) continue;

    const oldVal = oldData ? Number(oldData[key]) || 0 : 0;
    const newVal = Number(newData[key]) || 0;
    
    if (Math.abs(oldVal - newVal) > 0.0001) {
      changedFields[key] = { old: oldVal, new: newVal };
    }
  }

  const strFields = ['customerName', 'validFrom', 'validTo', 'priceList', 'currency'];
  for (const key of strFields) {
    const oldStr = oldData ? String(oldData[key] || '').trim() : '';
    const newStr = String(newData[key] || '').trim();
    if (oldStr !== newStr && newData[key] !== undefined) {
      changedFields[key] = { old: oldStr, new: newStr };
    }
  }

  if (Object.keys(changedFields).length > 0) {
    try {
      const keyToCol: Record<string, string> = {
        weight: 'weight',
        ratePerKg: 'rate_per_kg',
        rejectionCost: 'rejection_cost',
        powderCoating: 'powder_coating',
        specialProcess: 'special_process',
        process: 'process',
        transCharges: 'trans_charges',
        ohp: 'ohp',
        packing: 'packing',
        totalWorkingCost: 'total_working_cost',
        finalPrice: 'final_price',
        lessDomesticPacking: 'less_domestic_packing',
        assemblyCost: 'assembly_cost',
        exportPackingCost: 'export_packing_cost',
        fobCost: 'fob_cost',
        ohIccExport: 'oh_icc_export',
        addedExportOverheads: 'added_export_overheads',
        unitPriceExport: 'unit_price_export',
        forex: 'forex',
        unitPriceForeignCurrency: 'unit_price_foreign_currency'
      };

      const columns = [
        'item_code', 'customer_name', 'pricing_type', 'valid_from', 'valid_to', 'price_list', 'currency', 'changed_fields', 'updated_by'
      ];
      const values = [
        itemCode,
        newData.customerName || (oldData?.customerName) || '',
        pricingType,
        newData.validFrom || (oldData?.validFrom) || null,
        newData.validTo || (oldData?.validTo) || null,
        newData.priceList || (oldData?.priceList) || '',
        newData.currency || (oldData?.currency) || '',
        JSON.stringify(changedFields),
        updatedBy || 'System'
      ];

      for (const key of Object.keys(changedFields)) {
        const colBase = keyToCol[key];
        if (colBase) {
          columns.push(`${colBase}_old`, `${colBase}_new`);
          values.push(changedFields[key].old, changedFields[key].new);
        }
      }

      const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
      await query(
        `INSERT INTO item_sales_price_history (${columns.map(c => `"${c}"`).join(', ')})
         VALUES (${placeholders})`,
        values
      );
    } catch (err) {
      logger.error('Failed to insert item_sales_price_history:', err);
    }
  }
}

export async function trackCustomerPricingHistory(
  itemCode: string,
  customerCode: string,
  customerName: string,
  castingCode: string,
  itemDescription: string,
  grade: string,
  groupName: string,
  domesticExport: string,
  customerApprovalFoundry: string,
  oldData: any,
  newData: any,
  updatedBy: string
) {
  const hasChanged = !oldData || 
    Math.abs((Number(oldData.weight) || 0) - (Number(newData.weight) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.ratePerKg) || 0) - (Number(newData.ratePerKg) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.mmrRate) || 0) - (Number(newData.mmrRate) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.roRate) || 0) - (Number(newData.roRate) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.consumablesRate) || 0) - (Number(newData.consumablesRate) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.extraFactor) || 0) - (Number(newData.extraFactor) || 0)) > 0.0001 ||
    Math.abs((Number(oldData.price) || 0) - (Number(newData.finalPrice) || 0)) > 0.0001 ||
    String(oldData.validFrom || '') !== String(newData.validFrom || '') ||
    String(oldData.validTo || '') !== String(newData.validTo || '');

  if (!hasChanged) return;

  try {
    const oldPrice = oldData ? Number(oldData.price) || 0 : 0;
    const newPrice = Number(newData.finalPrice) || 0;
    const delta = newPrice - oldPrice;

    await query(
      `INSERT INTO customer_pricing_history (
        batch_id, batch_number, item_code, casting_code, item_description, grade, group_name, domestic_export,
        customer_code, customer_name, customer_approval_foundry,
        old_cast_weight, new_cast_weight,
        old_cast_rate, new_cast_rate,
        old_mmr_rate, new_mmr_rate,
        old_ro_rate, new_ro_rate,
        old_consumables, new_consumables,
        old_extra, new_extra,
        process_machining, ohp, packing, trans_charges, rejection_cost, powder_coating, special_process,
        old_price, new_price, delta,
        from_date, to_date, updated_by,
        forex, unit_price_foreign_currency
      ) VALUES (
        NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        NULLIF($33, '')::DATE, NULLIF($34, '')::DATE, $35,
        $36, $37
      )`,
      [
        oldData ? 'Customer Master Edit' : 'Customer Master Create',
        itemCode,
        castingCode || '',
        itemDescription || '',
        grade || '',
        groupName || '',
        domesticExport || '',
        customerCode || '',
        customerName || '',
        customerApprovalFoundry || '',
        oldData ? Number(oldData.weight) || 0 : 0,
        Number(newData.weight) || 0,
        oldData ? Number(oldData.ratePerKg) || 0 : 0,
        Number(newData.ratePerKg) || 0,
        oldData ? Number(oldData.mmrRate) || 0 : 0,
        Number(newData.mmrRate) || 0,
        oldData ? Number(oldData.roRate) || 0 : 0,
        Number(newData.roRate) || 0,
        oldData ? Number(oldData.consumablesRate) || 0 : 0,
        Number(newData.consumablesRate) || 0,
        oldData ? Number(oldData.extraFactor) || 0 : 0,
        Number(newData.extraFactor) || 0,
        Number(newData.process) || 0,
        Number(newData.ohp) || 0,
        Number(newData.packing) || 0,
        Number(newData.transCharges) || 0,
        Number(newData.rejectionCost) || 0,
        Number(newData.powderCoating) || 0,
        Number(newData.specialProcess) || 0,
        oldPrice,
        newPrice,
        delta,
        newData.validFrom || '',
        newData.validTo || '',
        updatedBy || 'Admin',
        newData.forex !== undefined && newData.forex !== '' ? Number(newData.forex) || null : null,
        newData.unitPriceForeignCurrency !== undefined && newData.unitPriceForeignCurrency !== '' ? Number(newData.unitPriceForeignCurrency) || null : null
      ]
    );
  } catch (err) {
    logger.error('Failed to insert customer_pricing_history from customer master edit:', err);
  }
}

async function logImportHistory(
  client: any,
  row: any,
  domesticExport: string,
  updatedBy: string
) {
  try {
    await client.query(
      `INSERT INTO customer_pricing_history (
        batch_id, batch_number, item_code, casting_code, item_description, grade, group_name, domestic_export,
        customer_code, customer_name, customer_approval_foundry,
        old_cast_weight, new_cast_weight,
        old_cast_rate, new_cast_rate,
        old_mmr_rate, new_mmr_rate,
        old_ro_rate, new_ro_rate,
        old_consumables, new_consumables,
        old_extra, new_extra,
        process_machining, ohp, packing, trans_charges, rejection_cost, powder_coating, special_process,
        old_price, new_price, delta,
        from_date, to_date, updated_by,
        forex, unit_price_foreign_currency
      ) VALUES (
        NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        NULLIF($33, '')::DATE, NULLIF($34, '')::DATE, $35,
        $36, $37
      )`,
      [
        'Customer Master Import',
        row.itemCode,
        row.castingCode || '',
        row.itemDescription || '',
        row.grade || '',
        row.groupName || '',
        domesticExport,
        row.customerCode || '',
        row.customerName || '',
        row.customerApprovalFoundry || '',
        0, Number(row.weight) || 0,
        0, Number(row.ratePerKg) || 0,
        0, Number(row.mmrRate) || 0,
        0, Number(row.roRate) || 0,
        0, Number(row.consumablesRate) || 0,
        0, Number(row.extraFactor) || 0,
        Number(row.process) || 0,
        Number(row.ohp) || 0,
        Number(row.packing) || 0,
        Number(row.transCharges) || 0,
        Number(row.rejectionCost) || 0,
        Number(row.powderCoating) || 0,
        Number(row.specialProcess) || 0,
        0, Number(row.finalPrice) || 0, Number(row.finalPrice) || 0,
        row.fromDate ? String(row.fromDate) : null,
        row.toDate ? String(row.toDate) : null,
        updatedBy || 'Admin',
        row.forex !== undefined && row.forex !== '' ? Number(row.forex) || null : null,
        row.unitPriceForeignCurrency !== undefined && row.unitPriceForeignCurrency !== '' ? Number(row.unitPriceForeignCurrency) || null : null
      ]
    );
  } catch (err) {
    logger.error('Failed to log import history for itemCode:', row.itemCode, err);
  }
}

export function parseQuarterAndYear(quarterInput: any, yearInput: any): { fromDate: string; toDate: string } | null {
  if (quarterInput === undefined || quarterInput === null || quarterInput === '') return null;

  const qStr = String(quarterInput).trim().toUpperCase();
  let year = parseInt(yearInput, 10);
  if (isNaN(year) || year < 1900 || year > 2100) {
    const yearMatch = qStr.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[0], 10);
    } else {
      return null;
    }
  }

  const qStrNoYear = qStr.replace(/\b(19|20)\d{2}\b/g, '').trim();

  // Month-wise lookup definition
  const monthsList = [
    { names: ['JAN', 'JANUARY', 'M1', 'M01', '01'], num: 1, days: 31 },
    { names: ['FEB', 'FEBRUARY', 'M2', 'M02', '02'], num: 2, days: 28 },
    { names: ['MAR', 'MARCH', 'M3', 'M03', '03'], num: 3, days: 31 },
    { names: ['APR', 'APRIL', 'M4', 'M04', '04'], num: 4, days: 30 },
    { names: ['MAY', 'M5', 'M05', '05'], num: 5, days: 31 },
    { names: ['JUN', 'JUNE', 'M6', 'M06', '06'], num: 6, days: 30 },
    { names: ['JUL', 'JULY', 'M7', 'M07', '07'], num: 7, days: 31 },
    { names: ['AUG', 'AUGUST', 'M8', 'M08', '08'], num: 8, days: 31 },
    { names: ['SEP', 'SEPTEMBER', 'M9', 'M09', '09'], num: 9, days: 30 },
    { names: ['OCT', 'OCTOBER', 'M10', '10'], num: 10, days: 31 },
    { names: ['NOV', 'NOVEMBER', 'M11', '11'], num: 11, days: 30 },
    { names: ['DEC', 'DECEMBER', 'M12', '12'], num: 12, days: 31 }
  ];

  // Try to match specific month names/keys first
  const matchedMonth = monthsList.find(m => m.names.includes(qStrNoYear) || qStrNoYear === `MONTH ${m.num}` || qStrNoYear === `MONTH${m.num}`);
  if (matchedMonth) {
    let endDay = matchedMonth.days;
    if (matchedMonth.num === 2) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      endDay = isLeap ? 29 : 28;
    }
    const mm = String(matchedMonth.num).padStart(2, '0');
    return {
      fromDate: `${year}-${mm}-01`,
      toDate: `${year}-${mm}-${String(endDay).padStart(2, '0')}`
    };
  }

  // Fallback to quarterly parsing logic
  const match = qStrNoYear.match(/\d/g);
  if (!match || match.length === 0) return null;
  
  const numbers = match.map(Number).filter(n => n >= 1 && n <= 4);
  if (numbers.length === 0) return null;
  
  const minQ = Math.min(...numbers);
  const maxQ = Math.max(...numbers);

  const startMonthStr = minQ === 1 ? '01-01' : (minQ === 2 ? '04-01' : (minQ === 3 ? '07-01' : '10-01'));
  const endMonthStr = maxQ === 1 ? '03-31' : (maxQ === 2 ? '06-30' : (maxQ === 3 ? '09-30' : '12-31'));

  return { fromDate: `${year}-${startMonthStr}`, toDate: `${year}-${endMonthStr}` };
}

function mapItem(row: any): ItemMaster {
  const item: ItemMaster = {
    id: row.itemcode?.trim() || row.itemCode?.trim() || '',
    itemCode: row.itemcode?.trim() || row.itemCode?.trim() || '',
    description: row.itemname?.trim() || row.description?.trim() || '',
    inStock: Number(row.onhand) || 0,
    itemGroup: row.itmsgrpnam?.trim() || row.itemGroup?.trim() || '',
    castingCode: row.u_castingcode?.trim() || row.castingCode?.trim() || '',
    foreignName: row.frgnname?.trim() || row.foreignName?.trim() || '',
    grade: row.u_grade?.trim() || row.grade?.trim() || '',
    boughtOutJobWork: row.u_bought?.trim() || row.boughtOutJobWork?.trim() || '',
    chapterId: '',
    purchasingItem: row.prchseitem?.trim()?.toUpperCase() === 'Y' ? 'Yes' : 'No',
    salesItem: row.sellitem?.trim()?.toUpperCase() === 'Y' ? 'Yes' : 'No',
    inventoryItem: row.invntitem?.trim()?.toUpperCase() === 'Y' ? 'Yes' : 'No',
    subGroup1: row.u_subgrup?.trim() || '',
    active: row.validfor?.trim()?.toUpperCase() === 'Y' ? 'Yes' : 'No',
    stage: row.u_stage?.trim() || '',
    uom: row.invntryuom?.trim() || '',
    uom2: row.ugpentry === -1 ? 'Manual' : (row.ugpentry?.toString() || ''),
    price: Number(row.price) || 0,
    kit: row.u_kit?.trim() || '',
    exportDomestic: row.u_domeexpo?.trim() || row.exportDomestic?.trim() || '',
    customerCode: row.CustomerCode?.trim() || row.customerCode?.trim() || '',
    customerGroup: row.CustomerGroup?.trim() || row.customerGroup?.trim() || '',
    currency: row.currency?.trim() || '',
    weight: Number(row.weight) || 0,
    ratePerKg: Number(row.ratePerKg) || 0,
    vendorId: row.LastVendorCode?.trim() || row.vendorId?.trim() || '',
    vendorName: row.LastVendorName?.trim() || row.vendorName?.trim() || '',
  } as ItemMaster;

  if (row.customerName !== undefined) item.customerName = row.customerName;
  if (row.customerApprovalFoundry !== undefined) item.customerApprovalFoundry = row.customerApprovalFoundry;
  if (row.rejectionCost !== undefined) item.rejectionCost = Number(row.rejectionCost) || 0;
  if (row.specialCoating !== undefined) item.specialCoating = row.specialCoating ? String(row.specialCoating).trim() : '';
  if (row.powderCoating !== undefined) item.powderCoating = Number(row.powderCoating) || 0;
  // Map powder coating weight & rate for Labour/Job Work items
  if (row.powderCoatingWeight !== undefined || row.powder_coating_weight !== undefined) {
    item.powderCoatingWeight = Number(row.powderCoatingWeight || row.powder_coating_weight) || 0;
  }
  if (row.powderCoatingRate !== undefined || row.powder_coating_rate !== undefined) {
    item.powderCoatingRate = Number(row.powderCoatingRate || row.powder_coating_rate) || 0;
  }
  if (row.specialProcess !== undefined) item.specialProcess = Number(row.specialProcess) || 0;
  if (row.specialProcessWeight !== undefined || row.special_process_weight !== undefined) {
    item.specialProcessWeight = Number(row.specialProcessWeight || row.special_process_weight) || 0;
  }
  if (row.specialProcessRate !== undefined || row.special_process_rate !== undefined) {
    item.specialProcessRate = Number(row.specialProcessRate || row.special_process_rate) || 0;
  }
  if (row.process !== undefined) item.process = Number(row.process) || 0;
  if (row.transCharges !== undefined) item.transCharges = Number(row.transCharges) || 0;
  if (row.ohp !== undefined) item.ohp = Number(row.ohp) || 0;
  if (row.packing !== undefined) item.packing = Number(row.packing) || 0;
  if (row.totalWorkingCost !== undefined) item.totalWorkingCost = Number(row.totalWorkingCost) || 0;
  if (row.finalPrice !== undefined) item.finalPrice = Number(row.finalPrice) || 0;

  const processSum = (item.rejectionCost || 0) + (item.powderCoating || 0) + (item.specialProcess || 0) + (item.process || 0) + (item.transCharges || 0) + (item.ohp || 0) + (item.packing || 0) + (item.hardeningRate && item.hardeningWt ? item.hardeningRate * item.hardeningWt : 0) + (item.grinding || 0) + (item.hardChromeRate && item.hardChromeWt ? item.hardChromeRate * item.hardChromeWt : 0);
  const currentTotal = Number(item.totalWorkingCost || 0);
  const currentFinal = Number(item.finalPrice || 0);
  if (processSum > 0 && Math.abs(currentTotal - currentFinal) < 0.01 && Math.abs(currentTotal - processSum) > 0.01) {
    item.totalWorkingCost = Number(processSum.toFixed(2));
  }
  if (row.fromDate !== undefined) item.fromDate = row.fromDate;
  if (row.toDate !== undefined) item.toDate = row.toDate;
  if (row.lessDomesticPacking !== undefined) item.lessDomesticPacking = Number(row.lessDomesticPacking) || 0;
  if (row.assemblyCost !== undefined) item.assemblyCost = Number(row.assemblyCost) || 0;
  if (row.exportPackingCost !== undefined) item.exportPackingCost = row.exportPackingCost || '';
  if (row.fobCost !== undefined) item.fobCost = Number(row.fobCost) || 0;
  if (row.ohIccExport !== undefined) item.ohIccExport = Number(row.ohIccExport) || 0;
  if (row.addedExportOverheads !== undefined) item.addedExportOverheads = Number(row.addedExportOverheads) || 0;
  if (row.unitPriceExport !== undefined) item.unitPriceExport = row.unitPriceExport || '';
  if (row.forex !== undefined) item.forex = Number(row.forex) || 0;
  if (row.unitPriceForeignCurrency !== undefined) item.unitPriceForeignCurrency = row.unitPriceForeignCurrency || '';

  if (row.hardeningWt !== undefined || row.hardening_wt !== undefined) {
    item.hardeningWt = Number(row.hardeningWt || row.hardening_wt) || 0;
  }
  if (row.hardeningRate !== undefined || row.hardening_rate !== undefined) {
    item.hardeningRate = Number(row.hardeningRate || row.hardening_rate) || 0;
  }
  if (row.grinding !== undefined) {
    item.grinding = Number(row.grinding) || 0;
  }
  if (row.hardChromeWt !== undefined || row.hard_chrome_wt !== undefined) {
    item.hardChromeWt = Number(row.hardChromeWt || row.hard_chrome_wt) || 0;
  }
  if (row.hardChromeRate !== undefined || row.hard_chrome_rate !== undefined) {
    item.hardChromeRate = Number(row.hardChromeRate || row.hard_chrome_rate) || 0;
  }
  if (row.cuttingWeight !== undefined || row.cutting_wt !== undefined) {
    item.cuttingWeight = Number(row.cuttingWeight || row.cutting_wt) || 0;
  }
  if (row.cuttingRate !== undefined || row.cutting_rate !== undefined) {
    item.cuttingRate = Number(row.cuttingRate || row.cutting_rate) || 0;
  }
  if (row.cutting !== undefined) {
    item.cutting = Number(row.cutting) || 0;
  }

  // Clean up any literal '?' values from the database
  Object.keys(item).forEach(key => {
    if ((item as any)[key] === '?') {
      (item as any)[key] = '';
    }
  });

  return item;
}

function mapPricingItem(row: any): PricingItem {
  const item: PricingItem = {
    ...mapItem(row),
    customerName: row.CustomerName?.trim() || '',
    customerType: row.u_domeexpo?.trim() || '',
    customerCode: row.customercode?.trim() || row.CustomerCode?.trim() || '',
    finalPrice: Number(row.customerprice) || Number(row.CustomerPrice) || 0,
    coating: '',
    machining: 0,
    weight: Number(row.weight) || 0,
    ratePerKg: Number(row.ratePerKg) || Number(row.U_RatPerKG) || 0,
    currentPrice: ((Number(row.vendorRmCost) || 0) + (Number(row.vendorProcessCost) || 0)) || Number(row.CurrentPrice) || Number(row.U_Cost) || 0,
    vendorId: row.LastVendorCode?.trim() || '',
    vendorName: row.LastVendorName?.trim() || '',
    createdAt: row.createdate || new Date().toISOString(),
    // Vendor cost fields for profit/loss indicator
    vendorRmCost: row.vendorRmCost != null ? Number(row.vendorRmCost) : null,
    vendorRmWeight: row.vendorRmWeight != null ? Number(row.vendorRmWeight) : null,
    vendorRmRate: row.vendorRmRate != null ? Number(row.vendorRmRate) : null,
    vendorProcessCost: row.vendorProcessCost != null ? Number(row.vendorProcessCost) : null,
  };

  if (row.vendors && Array.isArray(row.vendors)) {
    const validVendors = row.vendors.filter((v: any) => v.CardCode);
    if (validVendors.length > 0) {
      item.vendorId = validVendors[0].CardCode;
      item.vendorName = validVendors[0].CardName;
      item.currentPrice = Number(validVendors[0].Price);
    }
  }

  // Clean up any literal '?' values from the database
  Object.keys(item).forEach(key => {
    if ((item as any)[key] === '?') {
      (item as any)[key] = '';
    }
  });

  return item;
}


export async function listItems(filters: ListItemsQuery): Promise<PaginatedResponse<ItemMaster>> {
  const page = Math.max(1, parseInt(filters.page ?? '1', 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, parseInt(filters.pageSize ?? String(DEFAULT_PAGE_SIZE), 10));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.grade) { conditions.push(`TRIM(T1.u_grade) = TRIM($${idx++})`); params.push(filters.grade); }
  if (filters.customerName) {
    conditions.push(`(
      T1.u_cusfoudt ILIKE $${idx} OR 
      T1.frgnname ILIKE $${idx} OR
      T1.itemcode IN (
        SELECT DISTINCT TRIM("U_ItemNo") FROM "argit_pld1" WHERE "U_CustName" ILIKE $${idx} OR "U_CustCode" ILIKE $${idx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "aargit_ple1" WHERE "U_CustName" ILIKE $${idx} OR "U_CustCode" ILIKE $${idx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "argit_pll1" WHERE "U_CustName" ILIKE $${idx} OR "U_CustCode" ILIKE $${idx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "aargit_plp1" WHERE "U_CustName" ILIKE $${idx} OR "U_CustCode" ILIKE $${idx}
      )
    )`);
    params.push(`%${filters.customerName}%`);
    idx++;
  }
  // Only show active items from SAP Item Master across all tabs
  conditions.push(`T1.validfor = 'Y'`);

  if (filters.customerType && filters.customerType !== 'All') {
    if (filters.customerType === 'Domestic') {
      conditions.push(`(TRIM(T1.u_domeexpo) ILIKE 'Domestic%' OR T1.u_domeexpo IS NULL)`);
    } else if (filters.customerType === 'Export') {
      conditions.push(`(TRIM(T1.u_domeexpo) ILIKE '%Export%' OR T1.u_domeexpo IS NULL)`);
    } else if (filters.customerType === 'Labour / Job Work') {
      conditions.push(`(TRIM(T1.u_bought) = 'Job Work' OR T1.u_bought IS NULL)`);
    } else if (filters.customerType === 'Pin & Bush') {
      conditions.push(`(T1.itmsgrpcod::TEXT IN ('116', '118') OR TRIM(T1.u_domeexpo) ILIKE '%Pin Bush%' OR TRIM(T1.u_domeexpo) ILIKE '%Pin Push%' OR TRIM(T1.u_domeexpo) ILIKE '%Pin & Bush%' OR T1.u_domeexpo IS NULL)`);
    } else if (filters.customerType === 'Unmapped') {
      conditions.push(`(T1."CardCode" IS NULL OR TRIM(T1."CardCode") = '')`);
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM vendor_materials vm
        WHERE vm.casting_code = TRIM(T1.u_castingcode)
           OR vm.casting_code = TRIM(T1.itemcode)
      )`);
    } else {
      conditions.push(`(TRIM(T1.u_domeexpo) ILIKE $${idx} OR T1.u_domeexpo IS NULL)`);
      params.push(`%${filters.customerType}%`);
      idx++;
    }
  }
  if (filters.search) {
    conditions.push(`(T1.u_castingcode ILIKE $${idx} OR T1.itemcode ILIKE $${idx} OR T1.itemname ILIKE $${idx} OR T1.u_grade ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.foreignName) {
    const fnames = filters.foreignName.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (fnames.length > 0) {
      conditions.push(`TRIM(T1.frgnname) = ANY($${idx++})`);
      params.push(fnames);
    }
  }
  if (filters.itemGroup) {
    const groups = filters.itemGroup.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (groups.length > 0) {
      conditions.push(`T1.itmsgrpcod::TEXT = ANY($${idx++})`);
      params.push(groups);
    }
  }
  if (filters.castingCode) {
    const codes = filters.castingCode.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (codes.length > 0) {
      conditions.push(`TRIM(COALESCE(NULLIF(T1.u_castingcode, ''), T1.itemcode)) = ANY($${idx++})`);
      params.push(codes);
    }
  }
  if (filters.itemCode) {
    const icodes = filters.itemCode.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (icodes.length > 0) {
      conditions.push(`TRIM(T1.itemcode) = ANY($${idx++})`);
      params.push(icodes);
    }
  }
  if (filters.description) {
    const descs = filters.description.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (descs.length > 0) {
      conditions.push(`TRIM(T1.itemname) = ANY($${idx++})`);
      params.push(descs);
    }
  }
  if (filters.boughtOutJobWork) {
    const bjs = filters.boughtOutJobWork.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    if (bjs.length > 0) {
      conditions.push(`TRIM(T1.u_bought) = ANY($${idx++})`);
      params.push(bjs);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countSql = `SELECT COUNT(T1.itemcode) AS count
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
     ${where}`;
  const countCacheKey = `item-count-basic-${JSON.stringify({ sql: countSql, params })}`;
  const total = await getOrSetCache(countCacheKey, async () => {
    const countRows = await query<{ count: string }>(countSql, params);
    return parseInt(countRows[0]?.count ?? '0', 10);
  });

  if (total === 0) {
    return { items: [], total, page, pageSize };
  }

  let sql: string;
  if (filters.customerType === 'Domestic') {
    sql = `
      WITH filtered_items AS (
        SELECT T1.itemcode, T1.itemname, T1.frgnname, T1.u_castingcode, T1.itmsgrpcod, T1.u_bought, T1.u_domeexpo, T1.u_rateperkg, T1.validfor
        FROM oitm_sftp T1
        ${where}
        ORDER BY T1.itemcode ASC
        LIMIT $${idx++} OFFSET $${idx}
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
          pld."U_MmrRate" as mmr_rate,
          pld."U_RoRate" as ro_rate,
          pld."U_ConsRate" as consumables_rate,
          pld."U_Extra" as extra_factor,
          pld."U_PowdCoatWt" as powder_coating_weight,
          pld."U_PowdCoatRate" as powder_coating_rate,
          pld."U_SpecProcWt" as special_process_weight,
          pld."U_SpecProcRate" as special_process_rate
        FROM "argit_pld1" pld
        WHERE TRIM(pld."U_ItemNo") IN (SELECT TRIM(itemcode) FROM filtered_items)
        ORDER BY TRIM(pld."U_ItemNo"), pld."DocEntry"::bigint DESC
      ),
      customer_lookup AS (
        SELECT DISTINCT ON (LOWER(TRIM(cardname)))
          LOWER(TRIM(cardname)) AS name_key,
          TRIM(cardcode) AS cardcode,
          TRIM(currency) AS currency
        FROM ocrd_sftp
        WHERE cardtype = 'C'
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        f.frgnname AS "foreignName",
        f.u_castingcode AS "castingCode",
        oitb.itmsgrpnam AS "itemGroup",
        f.u_bought AS "boughtOutJobWork",
        f.u_domeexpo AS "exportDomestic",
        f.validfor AS "validfor",
        dd.weight AS "weight",
        dd.rate_per_kg AS "ratePerKg",
        COALESCE(cl.cardcode, dd.customer_code) AS "customerCode",
        cl.currency AS "currency",
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
        dd.mmr_rate AS "mmrRate",
        dd.ro_rate AS "roRate",
        dd.consumables_rate AS "consumablesRate",
        dd.extra_factor AS "extraFactor",
        dd.powder_coating_weight AS "powderCoatingWeight",
        dd.powder_coating_rate AS "powderCoatingRate",
        dd.special_process_weight AS "specialProcessWeight",
        dd.special_process_rate AS "specialProcessRate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN domestic_details dd ON dd.item_code = TRIM(f.itemcode)
      LEFT JOIN customer_lookup cl ON cl.name_key = LOWER(TRIM(f.frgnname))
      ORDER BY f.itemcode ASC
    `;
  } else if (filters.customerType === 'Export') {
    sql = `
      WITH filtered_items AS (
        SELECT T1.itemcode, T1.itemname, T1.frgnname, T1.u_castingcode, T1.itmsgrpcod, T1.u_bought, T1.u_domeexpo, T1.u_rateperkg, T1.validfor
        FROM oitm_sftp T1
        ${where}
        ORDER BY T1.itemcode ASC
        LIMIT $${idx++} OFFSET $${idx}
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
          ple."U_MmrRate" as mmr_rate,
          ple."U_RoRate" as ro_rate,
          ple."U_ConsRate" as consumables_rate,
          ple."U_Extra" as extra_factor,
          ple."U_PowdCoatWt" as powder_coating_weight,
          ple."U_PowdCoatRate" as powder_coating_rate,
          ple."U_SpecProcWt" as special_process_weight,
          ple."U_SpecProcRate" as special_process_rate
        FROM "aargit_ple1" ple
        WHERE TRIM(ple."U_ItemNo") IN (SELECT TRIM(itemcode) FROM filtered_items)
        ORDER BY TRIM(ple."U_ItemNo"), ple."DocEntry"::bigint DESC
      ),
      customer_lookup AS (
        SELECT DISTINCT ON (LOWER(TRIM(cardname)))
          LOWER(TRIM(cardname)) AS name_key,
          TRIM(cardcode) AS cardcode,
          TRIM(currency) AS currency
        FROM ocrd_sftp
        WHERE cardtype = 'C'
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        f.frgnname AS "foreignName",
        f.u_castingcode AS "castingCode",
        oitb.itmsgrpnam AS "itemGroup",
        f.u_bought AS "boughtOutJobWork",
        f.u_domeexpo AS "exportDomestic",
        f.validfor AS "validfor",
        dd.weight AS "weight",
        dd.rate_per_kg AS "ratePerKg",
        COALESCE(cl.cardcode, dd.customer_code) AS "customerCode",
        cl.currency AS "currency",
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
        dd.mmr_rate AS "mmrRate",
        dd.ro_rate AS "roRate",
        dd.consumables_rate AS "consumablesRate",
        dd.extra_factor AS "extraFactor",
        dd.powder_coating_weight AS "powderCoatingWeight",
        dd.powder_coating_rate AS "powderCoatingRate",
        dd.special_process_weight AS "specialProcessWeight",
        dd.special_process_rate AS "specialProcessRate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN domestic_details dd ON dd.item_code = TRIM(f.itemcode)
      LEFT JOIN customer_lookup cl ON cl.name_key = LOWER(TRIM(f.frgnname))
      ORDER BY f.itemcode ASC
    `;
  } else if (filters.customerType === 'Pin & Bush') {
    sql = `
      WITH filtered_items AS (
        SELECT T1.itemcode, T1.itemname, T1.frgnname, T1.u_castingcode, T1.itmsgrpcod, T1.u_bought, T1.u_domeexpo, T1.validfor
        FROM oitm_sftp T1
        ${where}
        ORDER BY T1.itemcode ASC
        LIMIT $${idx++} OFFSET $${idx}
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
          plp."U_SpecProc" as special_process,
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
          plp."U_MmrRate" as mmr_rate,
          plp."U_RoRate" as ro_rate,
          plp."U_ConsRate" as consumables_rate,
          plp."U_Extra" as extra_factor,
          plp."U_PowdCoatWt" as powder_coating_weight,
          plp."U_PowdCoatRate" as powder_coating_rate,
          plp."U_SpecProcWt" as special_process_weight,
          plp."U_SpecProcRate" as special_process_rate
        FROM "aargit_plp1" plp
        WHERE TRIM(plp."U_ItemNo") IN (SELECT TRIM(itemcode) FROM filtered_items)
        ORDER BY TRIM(plp."U_ItemNo"), plp."DocEntry"::bigint DESC
      ),
      customer_lookup AS (
        SELECT DISTINCT ON (LOWER(TRIM(cardname)))
          LOWER(TRIM(cardname)) AS name_key,
          TRIM(cardcode) AS cardcode,
          TRIM(currency) AS currency
        FROM ocrd_sftp
        WHERE cardtype = 'C'
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        f.frgnname AS "foreignName",
        f.u_castingcode AS "castingCode",
        oitb.itmsgrpnam AS "itemGroup",
        COALESCE(pd.bought_out_job_work, f.u_bought) AS "boughtOutJobWork",
        COALESCE(pd.export_domestic, f.u_domeexpo) AS "exportDomestic",
        f.validfor AS "validfor",
        pd.weight AS "weight",
        pd.rate_per_kg AS "ratePerKg",
        pd.casting_price AS "castingPrice",
        COALESCE(cl.cardcode, pd.customer_code) AS "customerCode",
        cl.currency AS "currency",
        pd.customer_name AS "customerName",
        pd.customer_approval_foundry AS "customerApprovalFoundry",
        pd.rejection_cost AS "rejectionCost",
        pd.special_coating AS "specialCoating",
        pd.powder_coating AS "powderCoating",
        pd.special_process AS "specialProcess",
        pd.process_machining_others AS "process",
        pd.trans_charges AS "transCharges",
        pd.ohp AS "ohp",
        pd.packing AS "packing",
        pd.total_working_cost AS "totalWorkingCost",
        pd.final_price AS "finalPrice",
        pd.hardening_wt AS "hardeningWt",
        pd.hardening_rate AS "hardeningRate",
        pd.grinding AS "grinding",
        pd.hard_chrome_wt AS "hardChromeWt",
        pd.hard_chrome_rate AS "hardChromeRate",
        pd.from_date AS "fromDate",
        pd.to_date AS "toDate",
        pd.mmr_rate AS "mmrRate",
        pd.ro_rate AS "roRate",
        pd.consumables_rate AS "consumablesRate",
        pd.extra_factor AS "extraFactor",
        pd.powder_coating_weight AS "powderCoatingWeight",
        pd.powder_coating_rate AS "powderCoatingRate",
        pd.special_process_weight AS "specialProcessWeight",
        pd.special_process_rate AS "specialProcessRate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN pin_details pd ON pd.item_code = TRIM(f.itemcode)
      LEFT JOIN customer_lookup cl ON cl.name_key = LOWER(TRIM(f.frgnname))
      ORDER BY f.itemcode ASC
    `;
  } else if (filters.customerType === 'Labour / Job Work') {
    sql = `
      WITH filtered_items AS (
        SELECT T1.itemcode, T1.itemname, T1.frgnname, T1.u_castingcode, T1.itmsgrpcod, T1.u_bought, T1.u_domeexpo, T1.validfor
        FROM oitm_sftp T1
        ${where}
        ORDER BY T1.itemcode ASC
        LIMIT $${idx++} OFFSET $${idx}
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
          pll."U_SpecProc" as special_process,
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
        WHERE TRIM(pll."U_ItemNo") IN (SELECT TRIM(itemcode) FROM filtered_items)
        ORDER BY TRIM(pll."U_ItemNo"), pll."DocEntry"::bigint DESC
      ),
      customer_lookup AS (
        SELECT DISTINCT ON (LOWER(TRIM(cardname)))
          LOWER(TRIM(cardname)) AS name_key,
          TRIM(cardcode) AS cardcode,
          TRIM(currency) AS currency
        FROM ocrd_sftp
        WHERE cardtype = 'C'
      )
      SELECT 
        f.itemcode AS "itemCode",
        f.itemcode AS "id",
        f.itemname AS "description",
        f.frgnname AS "foreignName",
        f.u_castingcode AS "castingCode",
        oitb.itmsgrpnam AS "itemGroup",
        COALESCE(ld.bought_out_job_work, f.u_bought) AS "boughtOutJobWork",
        COALESCE(ld.export_domestic, f.u_domeexpo) AS "exportDomestic",
        f.validfor AS "validfor",
        ld.weight AS "weight",
        ld.rate_per_kg AS "ratePerKg",
        ld.casting_price AS "castingPrice",
        COALESCE(cl.cardcode, ld.customer_code) AS "customerCode",
        cl.currency AS "currency",
        ld.customer_name AS "customerName",
        ld.customer_approval_foundry AS "customerApprovalFoundry",
        ld.rejection_cost AS "rejectionCost",
        ld.special_coating AS "specialCoating",
        ld.powder_coating AS "powderCoating",
        ld.special_process AS "specialProcess",
        ld.process_machining_others AS "process",
        ld.trans_charges AS "transCharges",
        ld.ohp AS "ohp",
        ld.packing AS "packing",
        ld.total_working_cost AS "totalWorkingCost",
        ld.final_price AS "finalPrice",
        ld.from_date AS "fromDate",
        ld.to_date AS "toDate"
      FROM filtered_items f
      LEFT JOIN oitb_sftp oitb ON f.itmsgrpcod::text = oitb.itmsgrpcod::text
      LEFT JOIN labour_details ld ON ld.item_code = TRIM(f.itemcode)
      LEFT JOIN customer_lookup cl ON cl.name_key = LOWER(TRIM(f.frgnname))
      ORDER BY f.itemcode ASC
    `;
  } else {
    sql = `
      SELECT 
        T1.itemcode, T1.itemname, T1.u_castingcode, T1.u_grade, T1.u_cost, T1.u_cusfoudt, T1.u_domeexpo, T1.createdate, T1.frgnname,
        T1.u_rateperkg, T1.onhand, T2.itmsgrpnam, T1.u_bought, T1.prchseitem, 
        T1.sellitem, T1.invntitem, T1.u_subgrup, T1.validfor, T1.u_stage, 
        T1.invntryuom, T1.ugpentry, T1.u_kit
      FROM oitm_sftp T1
      LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
      ${where}
      ORDER BY T1.itemcode ASC
      LIMIT $${idx++} OFFSET $${idx}
    `;
  }

  const rows = await query<any>(sql, [...params, pageSize, offset]);
  return { items: rows.map(mapItem), total, page, pageSize };
}

export async function listPricingItems(filters: ListItemsQuery): Promise<PaginatedResponse<PricingItem>> {
  const page = Math.max(1, parseInt(filters.page ?? '1', 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, parseInt(filters.pageSize ?? String(DEFAULT_PAGE_SIZE), 10));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.grade) { conditions.push(`TRIM(T1.u_grade) = TRIM($${idx++})`); params.push(filters.grade); }
  if (filters.vendorId) { 
    conditions.push(`(
      TRIM(T1.itemcode) IN (SELECT TRIM(item_code) FROM vendor_materials WHERE TRIM(vendor_id) = $${idx}) OR
      TRIM(T1.itemcode) IN (SELECT TRIM(item_code) FROM vendor_materials_history WHERE TRIM(vendor_id) = $${idx}) OR
      (
        SELECT COUNT(*) 
        FROM vendor_materials 
        WHERE TRIM(vendor_id) = $${idx} 
        AND item_code IS NOT NULL 
        AND POSITION(TRIM(T1.itemcode) IN TRIM(item_code)) > 0
      ) > 0 OR
      (
        SELECT COUNT(*) 
        FROM vendor_materials_history 
        WHERE TRIM(vendor_id) = $${idx} 
        AND item_code IS NOT NULL 
        AND POSITION(TRIM(T1.itemcode) IN TRIM(item_code)) > 0
      ) > 0
    )`); 
    params.push(filters.vendorId); 
    idx++; 
  }
  let customerNameParamIdx = -1;
  if (filters.customerName) {
    const rawCust = filters.customerName.trim();
    customerNameParamIdx = idx;
    params.push(`%${rawCust}%`);
    idx++;

    conditions.push(`(
      T1.itemcode IN (
        SELECT DISTINCT TRIM("U_ItemNo") FROM "argit_pld1" WHERE "U_CustName" ILIKE $${customerNameParamIdx} OR "U_CustCode" ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "aargit_ple1" WHERE "U_CustName" ILIKE $${customerNameParamIdx} OR "U_CustCode" ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "argit_pll1" WHERE "U_CustName" ILIKE $${customerNameParamIdx} OR "U_CustCode" ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM("U_ItemNo") FROM "aargit_plp1" WHERE "U_CustName" ILIKE $${customerNameParamIdx} OR "U_CustCode" ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM(item_code) FROM customer_pricing_history WHERE customer_name ILIKE $${customerNameParamIdx} OR customer_code ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM(item_code) FROM pricing_batch_items WHERE customer_name ILIKE $${customerNameParamIdx} OR customer_code ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT REPLACE(TRIM(item_code), '-RM', '') FROM pricing_batch_items WHERE customer_name ILIKE $${customerNameParamIdx} OR customer_code ILIKE $${customerNameParamIdx}
        UNION
        SELECT DISTINCT TRIM(item_master_id) FROM pricing_batch_items WHERE customer_name ILIKE $${customerNameParamIdx} OR customer_code ILIKE $${customerNameParamIdx}
      )
    )`);
  }
  if (filters.customerType && filters.customerType !== 'All') {
    if (filters.customerType === 'Domestic') {
      conditions.push(`TRIM(T1.u_domeexpo) ILIKE 'Domestic%'`);
    } else if (filters.customerType === 'Export') {
      conditions.push(`TRIM(T1.u_domeexpo) ILIKE '%Export%'`);
    } else if (filters.customerType === 'Labour / Job Work') {
      conditions.push(`TRIM(T1.u_bought) = 'Job Work'`);
    } else if (filters.customerType === 'Pin & Bush') {
      conditions.push(`(T1.itmsgrpcod::TEXT IN ('116', '118') OR TRIM(T1.u_domeexpo) ILIKE '%Pin Bush%' OR TRIM(T1.u_domeexpo) ILIKE '%Pin Push%' OR TRIM(T1.u_domeexpo) ILIKE '%Pin & Bush%')`);
    } else {
      conditions.push(`TRIM(T1.u_domeexpo) ILIKE $${idx++}`);
      params.push(`%${filters.customerType}%`);
    }
  }
  if (filters.search) {
    conditions.push(`(T1.u_castingcode ILIKE $${idx} OR T1.itemcode ILIKE $${idx} OR T1.itemname ILIKE $${idx} OR T1.u_grade ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.itemGroup) {
    conditions.push(`T1.itmsgrpcod::TEXT = $${idx++}`);
    params.push(filters.itemGroup);
  }
  if (filters.itemCode) {
    conditions.push(`TRIM(T1.itemcode) = TRIM($${idx++})`);
    params.push(filters.itemCode);
  }


  // ── Date (month/year) filter ─────────────────────────────────────────────
  // Accepts YYYY-MM format. Finds records active during that month.
  let dateFilterClause = '';
  let dateFilterClauseHistory = '';
  let dateFilterClauseVendor = '';
    if (filters.date && /^\d{4}-\d{2}$/.test(filters.date)) {
    const filterYear = parseInt(filters.date.split('-')[0], 10);
    const filterMonth = parseInt(filters.date.split('-')[1], 10);
    // First day and last day of the selected month
    const firstDay = `${filters.date}-01`;
    const lastDay = new Date(filterYear, filterMonth, 0); // month is 1-based, day 0 = last day of previous month
    const lastDayStr = `${filters.date}-${String(lastDay.getDate()).padStart(2, '0')}`;
    // A pricing record is active in the selected month if:
    //   fromDate <= lastDay of selected month  AND  (toDate is null OR toDate >= firstDay of selected month)
    dateFilterClause = `
      AND (sub."U_EffDateF" IS NULL OR sub."U_EffDateF"::DATE <= '${lastDayStr}'::DATE)
      AND (sub."U_EffDateT" IS NULL OR sub."U_EffDateT"::DATE >= '${firstDay}'::DATE)`;
    dateFilterClauseHistory = `
      AND (from_date IS NULL OR from_date::DATE <= '${lastDayStr}'::DATE)
      AND (to_date IS NULL OR to_date::DATE >= '${firstDay}'::DATE)`;
    dateFilterClauseVendor = `
      AND (vm.from_date IS NULL OR vm.from_date::DATE <= '${lastDayStr}'::DATE)
      AND (vm.to_date IS NULL OR vm.to_date::DATE >= '${firstDay}'::DATE)`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const isActionedTab = filters.approvalStatus === 'approved_master';

  // Count query
  let countSql = '';
  if (isActionedTab) {
    countSql = `SELECT COUNT(DISTINCT (T1.itemcode, pbi.customer_name)) AS count
      FROM oitm_sftp T1
      LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
      JOIN pricing_batch_items pbi ON (
        TRIM(pbi.item_code) = TRIM(T1.itemcode) OR
        TRIM(pbi.item_master_id) = TRIM(T1.itemcode)
      )
      WHERE pbi.status = '${filters.approvalStatus}'
      ${conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : ''}`;
  } else {
    countSql = `SELECT COUNT(T1.itemcode) AS count
      FROM oitm_sftp T1
      LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
      ${where}`;
  }
  const countRows = await query<{ count: string }>(countSql, params);
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  if (total === 0) {
    return { items: [], total, page, pageSize };
  }

  let resolvedCustCode: string | null = null;
  if (filters.customerName) {
    const custRow = await queryOne<any>(
      `SELECT cardcode FROM ocrd_sftp WHERE cardtype = 'C' AND (cardcode = $1 OR cardname = $1 OR cardname ILIKE $1) LIMIT 1`,
      [filters.customerName.trim()]
    );
    if (custRow) {
      resolvedCustCode = custRow.cardcode;
    }
  }

  let resolvedCustCodeParamIdx = -1;
  if (resolvedCustCode) {
    params.push(resolvedCustCode);
    resolvedCustCodeParamIdx = idx++;
  }

  let poFilter = '';
  let itemFilter = '';
  if (filters.vendorId) {
    const vendorParamIndex = params.indexOf(filters.vendorId) + 1;
    if (vendorParamIndex > 0) {
      poFilter = `AND TRIM(T0.cardcode) = $${vendorParamIndex}`;
      itemFilter = `AND TRIM(T0."CardCode") = $${vendorParamIndex}`;
    }
  }

  const customerNameMatchClause = customerNameParamIdx !== -1
    ? `(sub."U_CustName" ILIKE $${customerNameParamIdx} OR sub."U_CustCode" ILIKE $${customerNameParamIdx})`
    : `(sub."U_CustName" ILIKE '%' || T1.frgnname || '%' OR sub."U_CustCode" = T1.u_cusfoudt)`;

  const filteredItemsSql = isActionedTab
    ? `SELECT DISTINCT T1.itemcode, pbi.customer_name, pbi.customer_code
       FROM oitm_sftp T1
       LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
       JOIN pricing_batch_items pbi ON (
         TRIM(pbi.item_code) = TRIM(T1.itemcode) OR
         TRIM(pbi.item_master_id) = TRIM(T1.itemcode)
       )
       WHERE pbi.status = '${filters.approvalStatus}'
       ${conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : ''}`
    : `SELECT T1.itemcode, NULL::text AS customer_name, NULL::text AS customer_code
       FROM oitm_sftp T1
       LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
       ${where}`;

  const sql = `
    WITH filtered_items AS (
      ${filteredItemsSql}
      ORDER BY itemcode ASC
      LIMIT $${idx++} OFFSET $${idx++}
    ),
    latest_pld AS (
      SELECT DISTINCT ON (TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName")) sub.*
      FROM "argit_pld1" sub
      JOIN oitm_sftp T1 ON TRIM(sub."U_ItemNo") = TRIM(T1.itemcode)
      WHERE TRIM(sub."U_ItemNo") IN (SELECT itemcode FROM filtered_items)
        AND ${customerNameMatchClause}
        ${dateFilterClause}
      ORDER BY TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName"), sub."DocEntry"::bigint DESC
    ),
    latest_ple AS (
      SELECT DISTINCT ON (TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName")) sub.*
      FROM "aargit_ple1" sub
      JOIN oitm_sftp T1 ON TRIM(sub."U_ItemNo") = TRIM(T1.itemcode)
      WHERE TRIM(sub."U_ItemNo") IN (SELECT itemcode FROM filtered_items)
        AND ${customerNameMatchClause}
        ${dateFilterClause}
      ORDER BY TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName"), sub."DocEntry"::bigint DESC
    ),
    latest_pll AS (
      SELECT DISTINCT ON (TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName")) sub.*
      FROM "argit_pll1" sub
      JOIN oitm_sftp T1 ON TRIM(sub."U_ItemNo") = TRIM(T1.itemcode)
      WHERE TRIM(sub."U_ItemNo") IN (SELECT itemcode FROM filtered_items)
        AND ${customerNameMatchClause}
        ${dateFilterClause}
      ORDER BY TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName"), sub."DocEntry"::bigint DESC
    ),
    latest_plp AS (
      SELECT DISTINCT ON (TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName")) sub.*
      FROM "aargit_plp1" sub
      JOIN oitm_sftp T1 ON TRIM(sub."U_ItemNo") = TRIM(T1.itemcode)
      WHERE TRIM(sub."U_ItemNo") IN (SELECT itemcode FROM filtered_items)
        AND ${customerNameMatchClause}
        ${dateFilterClause}
      ORDER BY TRIM(sub."U_ItemNo"), TRIM(sub."U_CustName"), sub."DocEntry"::bigint DESC
    ),
    po_vendors AS (
      SELECT DISTINCT ON (TRIM(T1.itemcode)) 
        TRIM(T1.itemcode) AS itemcode, 
        TRIM(T0.cardcode) AS "VendorCode", 
        v.cardname AS "VendorName"
      FROM por1_sftp T1
      INNER JOIN opor_sftp T0 ON T0.docentry = T1.docentry
      LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(T0.cardcode)
      WHERE TRIM(T1.itemcode) IN (SELECT TRIM(itemcode) FROM filtered_items)
        ${poFilter}
      ORDER BY TRIM(T1.itemcode), T0.docdate DESC
    ),
    item_vendors AS (
      SELECT 
        TRIM(T0.itemcode) AS itemcode,
        STRING_AGG(DISTINCT TRIM(T0.cardcode), ', ') AS "VendorCodes",
        STRING_AGG(DISTINCT v.cardname, ', ') AS "VendorNames"
      FROM ospp_sftp T0
      LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(T0.cardcode)
      WHERE TRIM(T0.itemcode) IN (SELECT TRIM(itemcode) FROM filtered_items)
        ${itemFilter}
      GROUP BY TRIM(T0.itemcode)
    ),
    vendor_materials_all AS MATERIALIZED (
      SELECT 
        id, vendor_id, item_code, item_description, grade, customer_name, casting_code, 
        rm_weight, revised_rate_per_kg, revised_price,
        mmr_rate, ro_rate, consumables_rate, extra_factor, from_date, to_date,
        COALESCE(updated_at, NOW()) AS changed_at
      FROM vendor_materials
      
      UNION ALL
      
      SELECT 
        id, vendor_id, item_code, item_description, grade, customer_name, casting_code, 
        new_rm_weight as rm_weight, new_revised_rate_per_kg as revised_rate_per_kg, new_revised_price as revised_price,
        new_mmr_rate as mmr_rate, new_ro_rate as ro_rate, new_consumables_rate as consumables_rate, new_extra_factor as extra_factor, from_date, to_date,
        changed_at
      FROM vendor_materials_history
    ),
    vm_vendors AS (
      SELECT 
        f.itemcode AS itemcode,
        STRING_AGG(DISTINCT TRIM(vm.vendor_id), ', ') AS "VendorCodes",
        STRING_AGG(DISTINCT v.cardname, ', ') AS "VendorNames"
      FROM filtered_items f
      JOIN oitm_sftp o ON o.itemcode = f.itemcode
      JOIN vendor_materials_all vm ON (
        TRIM(vm.item_code) = TRIM(o.itemcode) OR
        TRIM(vm.casting_code) = TRIM(o.itemcode) OR
        (NULLIF(TRIM(o.u_castingcode), '') IS NOT NULL AND (
          TRIM(vm.casting_code) = TRIM(o.u_castingcode) OR
          TRIM(vm.item_code) = TRIM(o.u_castingcode) OR
          REPLACE(TRIM(vm.item_code), '-RM', '') = REPLACE(TRIM(o.u_castingcode), '-RM', '') OR
          REPLACE(TRIM(vm.casting_code), '-RM', '') = REPLACE(TRIM(o.u_castingcode), '-RM', '')
        )) OR
        (NULLIF(TRIM(o.itemcode), '') IS NOT NULL AND (
          REPLACE(TRIM(vm.item_code), '-RM', '') = REPLACE(TRIM(o.itemcode), '-RM', '') OR
          REPLACE(TRIM(vm.casting_code), '-RM', '') = REPLACE(TRIM(o.itemcode), '-RM', '')
        )) OR
        (vm.item_code IS NOT NULL AND POSITION(TRIM(o.itemcode) IN TRIM(vm.item_code)) > 0)
      ) ${dateFilterClauseVendor}
      LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(vm.vendor_id)
      GROUP BY f.itemcode
    ),
    -- ── Vendor cost CTE: latest RM vendor cost + latest process vendor cost per item ───
    vm_cost AS (
      SELECT DISTINCT ON (f.itemcode)
        f.itemcode,
        -- RM / Casting vendor: groupname = 'Raw Material' preferred, else first match
        FIRST_VALUE(
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' OR vg.groupname IS NULL
            THEN (vm.rm_weight * vm.revised_rate_per_kg)
            ELSE NULL END
        ) OVER (PARTITION BY f.itemcode ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' THEN 0 ELSE 1 END ASC,
          vm.changed_at DESC, vm.id DESC
        ) AS "vendorRmCost",
        FIRST_VALUE(
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' OR vg.groupname IS NULL
            THEN vm.rm_weight
            ELSE NULL END
        ) OVER (PARTITION BY f.itemcode ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' THEN 0 ELSE 1 END ASC,
          vm.changed_at DESC, vm.id DESC
        ) AS "vendorRmWeight",
        FIRST_VALUE(
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' OR vg.groupname IS NULL
            THEN vm.revised_rate_per_kg
            ELSE NULL END
        ) OVER (PARTITION BY f.itemcode ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) = 'raw material' THEN 0 ELSE 1 END ASC,
          vm.changed_at DESC, vm.id DESC
        ) AS "vendorRmRate",
        -- Process vendor: groupname != 'Raw Material'
        FIRST_VALUE(
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) != 'raw material' AND vg.groupname IS NOT NULL
            THEN (vm.rm_weight * vm.revised_rate_per_kg)
            ELSE NULL END
        ) OVER (PARTITION BY f.itemcode ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(vg.groupname, ''))) != 'raw material' AND vg.groupname IS NOT NULL THEN 0 ELSE 1 END ASC,
          vm.changed_at DESC, vm.id DESC
        ) AS "vendorProcessCost"
      FROM filtered_items f
      JOIN oitm_sftp o ON o.itemcode = f.itemcode
      JOIN vendor_materials_all vm ON (
        TRIM(vm.item_code) = TRIM(o.itemcode) OR
        TRIM(vm.casting_code) = TRIM(o.itemcode) OR
        (NULLIF(TRIM(o.u_castingcode), '') IS NOT NULL AND (
          TRIM(vm.casting_code) = TRIM(o.u_castingcode) OR
          TRIM(vm.item_code) = TRIM(o.u_castingcode) OR
          REPLACE(TRIM(vm.item_code), '-RM', '') = REPLACE(TRIM(o.u_castingcode), '-RM', '') OR
          REPLACE(TRIM(vm.casting_code), '-RM', '') = REPLACE(TRIM(o.u_castingcode), '-RM', '')
        )) OR
        (NULLIF(TRIM(o.itemcode), '') IS NOT NULL AND (
          REPLACE(TRIM(vm.item_code), '-RM', '') = REPLACE(TRIM(o.itemcode), '-RM', '') OR
          REPLACE(TRIM(vm.casting_code), '-RM', '') = REPLACE(TRIM(o.itemcode), '-RM', '')
        )) OR
        (vm.item_code IS NOT NULL AND POSITION(TRIM(o.itemcode) IN TRIM(vm.item_code)) > 0)
      ) ${dateFilterClauseVendor}
      LEFT JOIN ocrd_sftp o2 ON TRIM(o2.cardcode) = TRIM(vm.vendor_id)
      LEFT JOIN ocrg_sftp vg ON o2.groupcode::TEXT = vg.groupcode::TEXT
    )
    SELECT 
      T1.itemcode, T1.itemname, T1.u_castingcode, T1.u_grade, T1.u_cost, T1.u_cusfoudt, T1.u_domeexpo, T1.createdate, T1.frgnname,
      COALESCE(vm."VendorCodes", po."VendorCode", iv."VendorCodes") AS "LastVendorCode",
      COALESCE(vm."VendorNames", po."VendorName", iv."VendorNames") AS "LastVendorName",
      COALESCE(pld."U_FinPrice"::numeric, ple."U_FinPrice"::numeric, pll."U_FinPrice"::numeric, plp."U_FinPrice"::numeric) AS "CustomerPrice",
      COALESCE(pbi_status.customer_code, pld."U_CustCode"::text, ple."U_CustCode"::text, pll."U_CustCode"::text, plp."U_CustCode"::text, cust.cardcode::text) AS "CustomerCode",
      COALESCE(pbi_status.customer_name, cust.cardname) AS "CustomerName",
      COALESCE(pld."U_CusApprF", ple."U_CusApprF", pll."U_CusApprF", plp."U_CusApprF") AS "customerApprovalFoundry",
      COALESCE(pld."U_SpecCoat", ple."U_SpecCoat", pll."U_SpecCoat", plp."U_SpecCoat") AS "specialCoating",
      COALESCE(pld."U_CastWt"::numeric, ple."U_CastWt"::numeric, pll."U_CastWt"::numeric, plp."U_CastWt"::numeric) AS "weight",
      COALESCE(pld."U_CastRate"::numeric, ple."U_CastRate"::numeric, pll."U_CastRate"::numeric, plp."U_CastRate"::numeric) AS "ratePerKg",
      COALESCE(pld."U_RejCost"::numeric, ple."U_RejCost"::numeric, pll."U_RejCost"::numeric, plp."U_RejCost"::numeric) AS "rejectionCost",
      COALESCE(pld."U_PowdCoat"::numeric, ple."U_PowdCoat"::numeric, pll."U_PowdCoat"::numeric, plp."U_PowdCoat"::numeric) AS "powderCoating",
      COALESCE(pld."U_PowdCoatWt"::numeric, ple."U_PowdCoatWt"::numeric, pll."U_PowdCoatWt"::numeric, plp."U_PowdCoatWt"::numeric) AS "powderCoatingWeight",
      COALESCE(pld."U_PowdCoatRate"::numeric, ple."U_PowdCoatRate"::numeric, pll."U_PowdCoatRate"::numeric, plp."U_PowdCoatRate"::numeric) AS "powderCoatingRate",
      COALESCE(pld."U_SpecProc"::numeric, ple."U_SpecProc"::numeric, pll."U_SpecProc"::numeric, plp."U_SpecProc"::numeric) AS "specialProcess",
      COALESCE(pld."U_SpecProcWt"::numeric, ple."U_SpecProcWt"::numeric, pll."U_SpecProcWt"::numeric, plp."U_SpecProcWt"::numeric) AS "specialProcessWeight",
      COALESCE(pld."U_SpecProcRate"::numeric, ple."U_SpecProcRate"::numeric, pll."U_SpecProcRate"::numeric, plp."U_SpecProcRate"::numeric) AS "specialProcessRate",
      COALESCE(pld."U_ProcMach"::numeric, ple."U_ProcMach"::numeric, pll."U_ProcMach"::numeric, plp."U_ProcMach"::numeric) AS "process",
      COALESCE(pld."U_TranChar"::numeric, ple."U_TranChar"::numeric, pll."U_TranChar"::numeric, plp."U_TranChar"::numeric) AS "transCharges",
      COALESCE(pld."U_OHP"::numeric, ple."U_OHP"::numeric, pll."U_OHP"::numeric, plp."U_OHP"::numeric) AS "ohp",
      COALESCE(pld."U_Packing"::numeric, ple."U_Packing"::numeric, pll."U_Packing"::numeric, plp."U_Packing"::numeric) AS "packing",
      COALESCE(pld."U_ActCost"::numeric, ple."U_ActCost"::numeric, pll."U_ActCost"::numeric, plp."U_ActCost"::numeric) AS "totalWorkingCost",
      COALESCE(pld."U_FinPrice"::numeric, ple."U_FinPrice"::numeric, pll."U_FinPrice"::numeric, plp."U_FinPrice"::numeric) AS "finalPrice",
      COALESCE(pld."U_EffDateF"::text, ple."U_EffDateF"::text, pll."U_EffDateF"::text, plp."U_EffDateF"::text) AS "fromDate",
      COALESCE(pld."U_EffDateT"::text, ple."U_EffDateT"::text, pll."U_EffDateT"::text, plp."U_EffDateT"::text) AS "toDate",
      NULL AS "CurrentPrice",
      NULL AS "U_RMWeight", T1.u_rateperkg, T1.u_catweight AS "u_catweight", NULL AS "U_RatPerKG",
      T1.onhand, T2.itmsgrpnam, T1.u_bought, T1.prchseitem, 
      T1.ugpentry, T1.u_kit,
      -- Vendor cost fields for profit/loss indicator
      vc."vendorRmCost",
      vc."vendorRmWeight",
      vc."vendorRmRate",
      vc."vendorProcessCost",
      -- Approval status from pricing_batch_items (most recent record)
      pbi_status.status AS "itemActionStatus"
    FROM filtered_items f
    JOIN oitm_sftp T1 ON T1.itemcode = f.itemcode
    LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
    LEFT JOIN item_vendors iv ON iv.itemcode = TRIM(T1.itemcode)
    LEFT JOIN po_vendors po ON po.itemcode = TRIM(T1.itemcode)
    LEFT JOIN vm_vendors vm ON vm.itemcode = TRIM(T1.itemcode)
    LEFT JOIN latest_pld pld ON TRIM(pld."U_ItemNo") = TRIM(T1.itemcode)
                        AND (f.customer_name IS NULL OR TRIM(pld."U_CustName") = TRIM(f.customer_name))
    LEFT JOIN latest_ple ple ON TRIM(ple."U_ItemNo") = TRIM(T1.itemcode)
                        AND (f.customer_name IS NULL OR TRIM(ple."U_CustName") = TRIM(f.customer_name))
    LEFT JOIN latest_pll pll ON TRIM(pll."U_ItemNo") = TRIM(T1.itemcode)
                        AND (f.customer_name IS NULL OR TRIM(pll."U_CustName") = TRIM(f.customer_name))
    LEFT JOIN latest_plp plp ON TRIM(plp."U_ItemNo") = TRIM(T1.itemcode)
                        AND (f.customer_name IS NULL OR TRIM(plp."U_CustName") = TRIM(f.customer_name))
    LEFT JOIN ocrd_sftp cust ON cust.cardtype = 'C' AND (
      cust.cardcode::text = COALESCE(
        NULLIF(TRIM(pld."U_CustCode"::text), ''),
        NULLIF(TRIM(ple."U_CustCode"::text), ''),
        NULLIF(TRIM(pll."U_CustCode"::text), ''),
        NULLIF(TRIM(plp."U_CustCode"::text), ''),
        -- If customer filter is active, force match on customer cardcode from database matching the filter
        ${resolvedCustCodeParamIdx !== -1 ? `$${resolvedCustCodeParamIdx}::text` : `NULL::text`},
        -- Fallbacks only if NO customer filter is active
        ${customerNameParamIdx === -1 ? `
        NULLIF(TRIM(T1.u_cusfoudt::text), ''),
        (SELECT c2.cardcode::text FROM ocrd_sftp c2 WHERE c2.cardtype = 'C' AND (LOWER(TRIM(c2.cardname::text)) = LOWER(TRIM(T1.frgnname::text)) OR LOWER(TRIM(c2.cardfname::text)) = LOWER(TRIM(T1.frgnname::text))) LIMIT 1),
        CASE WHEN LOWER(T1.frgnname::text) LIKE 'geekeyy%' THEN 'CUS0097'::text ELSE NULL::text END
        ` : `NULL::text`}
      )
    )
    LEFT JOIN vm_cost vc ON vc.itemcode = TRIM(T1.itemcode)
    LEFT JOIN LATERAL (
      SELECT status, customer_code, customer_name
      FROM pricing_batch_items pbi
      WHERE pbi.status IN ('dispute_raised', 'approved_master', 'resubmitted')
        AND (
          LOWER(TRIM(pbi.item_code)) = LOWER(TRIM(T1.itemcode)) OR
          LOWER(REPLACE(TRIM(pbi.item_code), '-RM', '')) = LOWER(REPLACE(TRIM(T1.itemcode), '-RM', '')) OR
          LOWER(TRIM(pbi.item_master_id)) = LOWER(TRIM(T1.itemcode)) OR
          (LOWER(TRIM(pbi.casting_code)) = LOWER(TRIM(T1.itemcode)) AND LOWER(TRIM(T1.itemcode)) != LOWER(TRIM(T1.u_castingcode)))
        )
        AND (
          ${customerNameParamIdx !== -1 ? `
            (pbi.customer_name ILIKE $${customerNameParamIdx} OR pbi.customer_code ILIKE $${customerNameParamIdx}
             ${resolvedCustCodeParamIdx !== -1 ? `OR pbi.customer_code = $${resolvedCustCodeParamIdx}` : ''})
          ` : `
            f.customer_name IS NULL OR
            (pbi.customer_name = f.customer_name OR pbi.customer_code = f.customer_code)
          `}
        )
      ORDER BY pbi.id DESC
      LIMIT 1
    ) pbi_status ON true
    WHERE (
      ${filters.approvalStatus === 'approved_master'
        ? `pbi_status.status IN ('approved', 'approved_master')`
        : `(pbi_status.status IS NULL OR pbi_status.status NOT IN ('approved_master', 'resubmitted'))`}
    )
    ORDER BY T1.itemcode ASC
  `;
  
  const rows = await query<any>(sql, [...params, pageSize, offset]);
  
  const shouldCheckHistory = !!filters.date;
  const itemCodes = rows.map(r => r.itemcode.trim());
  const custCodesMap = new Map<string, string>();
  for (const r of rows) {
    const c = r.CustomerCode || r.u_cusfoudt;
    if (c) custCodesMap.set(r.itemcode.trim(), c.trim());
  }
  const custCodesUnique = Array.from(new Set(custCodesMap.values()));

  let historyMap = new Map<string, any>();

  if (rows.length > 0) {
    if (shouldCheckHistory) {
      const qParams: any[] = [itemCodes, custCodesUnique];
      let nameFilterClause = '';
      if (filters.customerName) {
        qParams.push(`%${filters.customerName}%`);
        nameFilterClause = `OR customer_name ILIKE $3 OR customer_code ILIKE $3`;
      }
      const historyList = await query<any>(`
        SELECT DISTINCT ON (TRIM(item_code), TRIM(customer_code))
          TRIM(item_code) AS item_code_trimmed,
          TRIM(customer_code) AS customer_code_trimmed,
          new_cast_weight AS "weight",
          new_cast_rate AS "ratePerKg",
          process_machining AS "process",
          ohp,
          packing,
          trans_charges AS "transCharges",
          rejection_cost AS "rejectionCost",
          powder_coating AS "powderCoating",
          special_process AS "specialProcess",
          new_price AS "finalPrice",
          ((COALESCE(new_cast_weight, 0) * COALESCE(new_cast_rate, 0)) + COALESCE(rejection_cost, 0) + COALESCE(powder_coating, 0) + COALESCE(special_process, 0) + COALESCE(process_machining, 0) + COALESCE(trans_charges, 0) + COALESCE(ohp, 0) + COALESCE(packing, 0)) AS "totalWorkingCost",
          from_date::text AS "fromDate",
          to_date::text AS "toDate",
          customer_approval_foundry AS "customerApprovalFoundry",
          new_mmr_rate AS "mmrRate",
          new_ro_rate AS "roRate",
          new_consumables AS "consumablesRate",
          new_extra AS "extraFactor",
          customer_code AS "CustomerCode",
          customer_name AS "CustomerName"
        FROM customer_pricing_history
        WHERE TRIM(item_code) = ANY($1)
          AND (
            TRIM(customer_code) = ANY($2)
            ${nameFilterClause}
          )
          ${dateFilterClauseHistory}
        ORDER BY TRIM(item_code), TRIM(customer_code), from_date DESC, id DESC
      `, qParams);

      for (const h of historyList) {
        historyMap.set(`${h.item_code_trimmed}_${h.customer_code_trimmed}`, h);
      }
    } else {
      const historyList = await query<any>(`
        SELECT DISTINCT ON (TRIM(item_code), TRIM(customer_code))
          TRIM(item_code) AS item_code_trimmed,
          TRIM(customer_code) AS customer_code_trimmed,
          new_cast_weight AS "weight",
          new_cast_rate AS "ratePerKg",
          process_machining AS "process",
          ohp,
          packing,
          trans_charges AS "transCharges",
          rejection_cost AS "rejectionCost",
          powder_coating AS "powderCoating",
          special_process AS "specialProcess",
          new_price AS "finalPrice",
          ((COALESCE(new_cast_weight, 0) * COALESCE(new_cast_rate, 0)) + COALESCE(rejection_cost, 0) + COALESCE(powder_coating, 0) + COALESCE(special_process, 0) + COALESCE(process_machining, 0) + COALESCE(trans_charges, 0) + COALESCE(ohp, 0) + COALESCE(packing, 0)) AS "totalWorkingCost",
          from_date::text AS "fromDate",
          to_date::text AS "toDate",
          customer_approval_foundry AS "customerApprovalFoundry",
          new_mmr_rate AS "mmrRate",
          new_ro_rate AS "roRate",
          new_consumables AS "consumablesRate",
          new_extra AS "extraFactor",
          customer_code AS "CustomerCode",
          customer_name AS "CustomerName"
        FROM customer_pricing_history
        WHERE TRIM(item_code) = ANY($1)
          AND TRIM(customer_code) = ANY($2)
        ORDER BY TRIM(item_code), TRIM(customer_code), from_date DESC, id DESC
      `, [itemCodes, custCodesUnique]);

      for (const h of historyList) {
        historyMap.set(`${h.item_code_trimmed}_${h.customer_code_trimmed}`, h);
      }
    }
  }

  for (const row of rows) {
    const custCode = row.CustomerCode || row.u_cusfoudt;
    const custCodeTrimmed = custCode ? custCode.trim() : '';

    if (shouldCheckHistory && (custCode || filters.customerName)) {
      let hist = historyMap.get(`${row.itemcode.trim()}_${custCodeTrimmed}`);
      
      if (!hist && filters.customerName) {
        hist = Array.from(historyMap.values()).find(h => 
          (h as any).item_code_trimmed === row.itemcode.trim() && 
          ((h as any).CustomerName?.toLowerCase().includes(filters.customerName!.toLowerCase()) || 
           (h as any).CustomerCode?.toLowerCase().includes(filters.customerName!.toLowerCase()))
        );
      }

      if (hist) {
        row.CustomerPrice = hist.finalPrice;
        row.CustomerCode = hist.CustomerCode;
        if (hist.CustomerName && hist.CustomerName.trim() !== '') {
          row.CustomerName = hist.CustomerName;
        }
        row.customerApprovalFoundry = hist.customerApprovalFoundry;
        row.weight = hist.weight;
        row.U_RMWeight = hist.weight;
        row.ratePerKg = hist.ratePerKg;
        row.U_RatPerKG = hist.ratePerKg;
        row.rejectionCost = hist.rejectionCost;
        row.powderCoating = hist.powderCoating;
        row.specialProcess = hist.specialProcess;
        row.process = hist.process;
        row.transCharges = hist.transCharges;
        row.ohp = hist.ohp;
        row.packing = hist.packing;
        row.totalWorkingCost = hist.totalWorkingCost;
        row.finalPrice = hist.finalPrice;
        row.customerprice = hist.finalPrice;
        row.fromDate = hist.fromDate;
        row.toDate = hist.toDate;
      }
    } else if (!row.fromDate) {
      if (custCode) {
        const hist = historyMap.get(`${row.itemcode.trim()}_${custCodeTrimmed}`);
        if (hist) {
          row.CustomerPrice = hist.finalPrice;
          row.CustomerCode = hist.CustomerCode;
          if (hist.CustomerName && hist.CustomerName.trim() !== '') {
            row.CustomerName = hist.CustomerName;
          }
          row.customerApprovalFoundry = hist.customerApprovalFoundry;
          row.weight = hist.weight;
          row.U_RMWeight = hist.weight;
          row.ratePerKg = hist.ratePerKg;
          row.U_RatPerKG = hist.ratePerKg;
          row.rejectionCost = hist.rejectionCost;
          row.powderCoating = hist.powderCoating;
          row.specialProcess = hist.specialProcess;
          row.process = hist.process;
          row.transCharges = hist.transCharges;
          row.ohp = hist.ohp;
          row.packing = hist.packing;
          row.totalWorkingCost = hist.totalWorkingCost;
          row.finalPrice = hist.finalPrice;
          row.customerprice = hist.finalPrice;
          row.fromDate = hist.fromDate;
          row.toDate = hist.toDate;
        }
      }
    }
  }

  // ── Apply active/pending dispute overrides from pricing_batch_items for items in listPricing ──
  if (rows.length > 0) {
    const itemCodesList = rows.map(r => r.itemcode.trim());

    let pbiDateClauses = '';
    const pbiDateParams: any[] = [itemCodesList];
    let idxPbi = 2;
    if (filters.date && /^\d{4}-\d{2}$/.test(filters.date)) {
      const fy = parseInt(filters.date.split('-')[0], 10);
      const fm = parseInt(filters.date.split('-')[1], 10);
      const firstDay = `${filters.date}-01`;
      const lastDayDate = new Date(fy, fm, 0);
      const lastDay = `${filters.date}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      pbiDateClauses = `
        AND (from_date IS NULL OR from_date::DATE <= $${idxPbi++}::DATE)
        AND (to_date IS NULL OR to_date::DATE >= $${idxPbi++}::DATE)`;
      pbiDateParams.push(lastDay, firstDay);
    }

    const pbiOverrides = await query<any>(`
      SELECT DISTINCT ON (TRIM(COALESCE(item_code, casting_code)))
        TRIM(item_code) AS item_code_trimmed,
        TRIM(casting_code) AS casting_code_trimmed,
        customer_rm_weight, customer_rate_per_kg, customer_rm_price,
        rm_weight, rm_cost, new_price, powder_coating, special_process,
        trans_charges, rejection_cost, customer_approval_foundry,
        machining, packing, overhead_pct, customer_total_price,
        from_date::text AS from_date, to_date::text AS to_date
      FROM pricing_batch_items
      WHERE (
        TRIM(item_code) = ANY($1) OR TRIM(casting_code) = ANY($1)
      )
      AND status IN ('pending', 'Open', 'resubmitted', 'disputed')
      ${pbiDateClauses}
      ORDER BY TRIM(COALESCE(item_code, casting_code)), id DESC
    `, pbiDateParams);

    const pbiMap = new Map<string, any>();
    for (const p of pbiOverrides) {
      if (p.item_code_trimmed) pbiMap.set(p.item_code_trimmed, p);
      if (p.casting_code_trimmed) pbiMap.set(p.casting_code_trimmed, p);
      const base = p.item_code_trimmed ? p.item_code_trimmed.replace(/-rm$/i, '') : null;
      if (base) pbiMap.set(base, p);
    }

    for (const row of rows) {
      const baseCode = row.itemcode ? row.itemcode.trim().replace(/-rm$/i, '') : null;
      const castCode = row.u_castingcode ? row.u_castingcode.trim() : null;
      const pbi = pbiMap.get(row.itemcode.trim()) || (castCode ? pbiMap.get(castCode) : null) || (baseCode ? pbiMap.get(baseCode) : null);

      if (pbi) {
        if (pbi.customer_rm_weight != null && Number(pbi.customer_rm_weight) > 0) {
          row.weight = Number(pbi.customer_rm_weight);
          row.U_RMWeight = Number(pbi.customer_rm_weight);
        } else if (pbi.rm_weight != null && Number(pbi.rm_weight) > 0) {
          row.weight = Number(pbi.rm_weight);
          row.U_RMWeight = Number(pbi.rm_weight);
        }

        if (pbi.customer_rate_per_kg != null && Number(pbi.customer_rate_per_kg) > 0) {
          row.ratePerKg = Number(pbi.customer_rate_per_kg);
          row.U_RatPerKG = Number(pbi.customer_rate_per_kg);
        }

        if (pbi.new_price != null && Number(pbi.new_price) > 0) {
          row.finalPrice = Number(pbi.new_price);
          row.CustomerPrice = Number(pbi.new_price);
          row.customerprice = Number(pbi.new_price);
        }

        if (pbi.rejection_cost != null) row.rejectionCost = Number(pbi.rejection_cost);
        if (pbi.powder_coating != null) row.powderCoating = Number(pbi.powder_coating);
        if (pbi.special_process != null) row.specialProcess = Number(pbi.special_process);
        if (pbi.trans_charges != null) row.transCharges = Number(pbi.trans_charges);
        if (pbi.overhead_pct != null && Number(pbi.overhead_pct) > 0) row.ohp = Number(pbi.overhead_pct);
        if (pbi.packing != null) row.packing = Number(pbi.packing);
        if (pbi.machining != null) row.process = Number(pbi.machining);

        // Calculate Total Working Cost as sum of working process components
        const calcTwc = Number(row.rejectionCost || 0) + Number(row.powderCoating || 0) + Number(row.specialProcess || 0) + Number(row.process || 0) + Number(row.transCharges || 0) + Number(row.ohp || 0) + Number(row.packing || 0);
        row.totalWorkingCost = calcTwc > 0 ? calcTwc : (row.totalWorkingCost ? Number(row.totalWorkingCost) : 0);

        if (pbi.customer_total_price != null && Number(pbi.customer_total_price) > 0) {
          row.finalPrice = Number(pbi.customer_total_price);
          row.CustomerPrice = Number(pbi.customer_total_price);
          row.customerprice = Number(pbi.customer_total_price);
        }
      }
    }
  }

  return { items: rows.map(r => ({ ...mapPricingItem(r), approvalStatus: r.itemActionStatus ?? null })), total, page, pageSize };
}

export async function getItemById(id: string, customerCode?: string, groupName?: string, date?: string): Promise<ItemMaster | null> {
  const basic = await queryOne<any>(
    'SELECT itmsgrpcod, u_domeexpo, u_bought FROM oitm_sftp WHERE TRIM(itemcode) = $1',
    [id.trim()]
  );
  if (!basic) return null;
  
  let isLabour = ['125', '128'].includes(String(basic.itmsgrpcod || '')) || 
                 String(basic.u_bought || '').trim() === 'Job Work';
  let isPin = ['116', '118'].includes(String(basic.itmsgrpcod || '')) || 
              String(basic.u_domeexpo || '').toUpperCase().includes('PIN BUSH') ||
              String(basic.u_domeexpo || '').toUpperCase().includes('PIN PUSH') ||
              String(basic.u_domeexpo || '').toUpperCase().includes('PIN & BUSH');
  let isDomestic = String(basic.u_domeexpo || '').trim().toLowerCase() === 'domestic';

  if (groupName) {
    isLabour = groupName === 'Labour / Job Work';
    isPin = groupName === 'Pin & Bush';
    isDomestic = groupName === 'Domestic';
  }
  
  const detailQuery = isLabour ? 
    `SELECT 
      T1.itemcode, T1.itemname, T1.onhand, T2.itmsgrpnam, 
      T1.u_castingcode, T1.frgnname, T1.u_grade, T1.u_bought, 
      T1.prchseitem, T1.sellitem, T1.invntitem, 
      T1.u_subgrup, T1.validfor, T1.u_stage, T1.invntryuom, 
      T1.ugpentry, T1.u_rateperkg, T1.u_kit, T1.u_domeexpo,
      T1.u_cost, T1.u_cusfoudt, T1.createdate, T1.u_catweight as "u_catweight",
      pll."U_CustCode" as "customerCode",
      pll."U_CustName" as "customerName",
      pll."U_CusApprF" as "customerApprovalFoundry",
      pll."U_CastWt" as "weight",
      pll."U_CastRate" as "ratePerKg",
      pll."U_CastPric" as "castingPrice",
      pll."U_RejCost" as "rejectionCost",
      pll."U_SpecCoat" as "specialCoating",
      pll."U_PowdCoat" as "powderCoating",
      pll."U_PowdCoatWt" as "powderCoatingWeight",
      pll."U_PowdCoatRate" as "powderCoatingRate",
      pll."U_SpecProc" as "specialProcess",
      pll."U_SpecProcWt" as "specialProcessWeight",
      pll."U_SpecProcRate" as "specialProcessRate",
      pll."U_ProcMach" as "process",
      pll."U_TranChar" as "transCharges",
      pll."U_OHP" as "ohp",
      pll."U_Packing" as "packing",
      pll."U_ActCost" as "totalWorkingCost",
      pll."U_FinPrice" as "finalPrice",
      pll."U_EffDateF" as "fromDate",
      pll."U_EffDateT" as "toDate",
      NULL as less_domestic_packing,
      NULL as assembly_cost,
      NULL as export_packing_cost,
      NULL as fob_cost,
      NULL as oh_icc_export,
      NULL as added_export_overheads,
      NULL as unit_price_export,
      NULL as forex,
      NULL as unit_price_foreign_currency,
      (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE (LOWER(TRIM(cust.cardfname)) = LOWER(TRIM(T1.frgnname)) OR LOWER(TRIM(cust.cardname)) = LOWER(TRIM(T1.frgnname))) AND cust.cardtype = 'C' LIMIT 1) AS "currency",
      NULL as "U_RMWeight"
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
     LEFT JOIN "argit_pll1" pll ON TRIM(pll."U_ItemNo") = TRIM(T1.itemcode) AND (TRIM(pll."U_CustCode") = $2 OR $2 IS NULL)
     WHERE TRIM(T1.itemcode) = $1
     ORDER BY pll."DocEntry"::bigint DESC
     LIMIT 1`
    : isDomestic ?
    `SELECT 
      T1.itemcode, T1.itemname, T1.onhand, T2.itmsgrpnam, 
      T1.u_castingcode, T1.frgnname, T1.u_grade, T1.u_bought, 
      T1.prchseitem, T1.sellitem, T1.invntitem, 
      T1.u_subgrup, T1.validfor, T1.u_stage, T1.invntryuom, 
      T1.ugpentry, T1.u_rateperkg, T1.u_kit, T1.u_domeexpo,
      T1.u_cost, T1.u_cusfoudt, T1.createdate, T1.u_catweight as "u_catweight",
      pld."U_CustCode" as "customerCode",
      pld."U_CustName" as "customerName",
      pld."U_CusApprF" as "customerApprovalFoundry",
      pld."U_CastWt" as "weight",
      pld."U_CastRate" as "ratePerKg",
      pld."U_CastWt"::numeric * pld."U_CastRate"::numeric as "castingPrice",
      pld."U_RejCost" as "rejectionCost",
      pld."U_SpecCoat" as "specialCoating",
      pld."U_PowdCoat" as "powderCoating",
      pld."U_PowdCoatWt" as "powderCoatingWeight",
      pld."U_PowdCoatRate" as "powderCoatingRate",
      pld."U_SpecProc" as "specialProcess",
      pld."U_SpecProcWt" as "specialProcessWeight",
      pld."U_SpecProcRate" as "specialProcessRate",
      pld."U_ProcMach" as "process",
      pld."U_TranChar" as "transCharges",
      pld."U_OHP" as "ohp",
      pld."U_Packing" as "packing",
      pld."U_ActCost" as "totalWorkingCost",
      pld."U_FinPrice" as "finalPrice",
      pld."U_EffDateF" as "fromDate",
      pld."U_EffDateT" as "toDate",
      NULL as "lessDomesticPacking",
      NULL as "assemblyCost",
      NULL as "exportPackingCost",
      NULL as "fobCost",
      NULL as "ohIccExport",
      NULL as "addedExportOverheads",
      NULL as "unitPriceExport",
      NULL as "forex",
      NULL as "unitPriceForeignCurrency",
      (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE (LOWER(TRIM(cust.cardfname)) = LOWER(TRIM(T1.frgnname)) OR LOWER(TRIM(cust.cardname)) = LOWER(TRIM(T1.frgnname))) AND cust.cardtype = 'C' LIMIT 1) AS "currency",
      NULL as "U_RMWeight"
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
     LEFT JOIN "argit_pld1" pld ON TRIM(pld."U_ItemNo") = TRIM(T1.itemcode) AND (TRIM(pld."U_CustCode") = $2 OR $2 IS NULL)
     WHERE TRIM(T1.itemcode) = $1
     ORDER BY pld."DocEntry"::bigint DESC
     LIMIT 1`
    : isPin ?
    `SELECT 
      T1.itemcode, T1.itemname, T1.onhand, T2.itmsgrpnam, 
      T1.u_castingcode, T1.frgnname, T1.u_grade, T1.u_bought, 
      T1.prchseitem, T1.sellitem, T1.invntitem, 
      T1.u_subgrup, T1.validfor, T1.u_stage, T1.invntryuom, 
      T1.ugpentry, T1.u_rateperkg, T1.u_kit, T1.u_domeexpo,
      T1.u_cost, T1.u_cusfoudt, T1.createdate, T1.u_catweight as "u_catweight",
      plp."U_CustCode" as "customerCode",
      plp."U_CustName" as "customerName",
      plp."U_CusApprF" as "customerApprovalFoundry",
      plp."U_CastWt" as "weight",
      plp."U_CastRate" as "ratePerKg",
      plp."U_CastPric" as "castingPrice",
      plp."U_RejCost" as "rejectionCost",
      plp."U_SpecCoat" as "specialCoating",
      plp."U_PowdCoat" as "powderCoating",
      plp."U_PowdCoatWt" as "powderCoatingWeight",
      plp."U_PowdCoatRate" as "powderCoatingRate",
      plp."U_SpecProc" as "specialProcess",
      plp."U_SpecProcWt" as "specialProcessWeight",
      plp."U_SpecProcRate" as "specialProcessRate",
      plp."U_ProcMach" as "process",
      plp."U_TranChar" as "transCharges",
      plp."U_OHP" as "ohp",
      plp."U_Packing" as "packing",
      plp."U_CuttingWt" as "cuttingWeight",
      plp."U_CuttingRate" as "cuttingRate",
      plp."U_Cutting" as "cutting",
      plp."U_HardWt" as "hardeningWt",
      plp."U_HardRate" as "hardeningRate",
      plp."U_Grinding" as "grinding",
      plp."U_HChromeW" as "hardChromeWt",
      plp."U_HChromeR" as "hardChromeRate",
      plp."U_ActCost" as "totalWorkingCost",
      plp."U_FinPrice" as "finalPrice",
      plp."U_EffDateF" as "fromDate",
      plp."U_EffDateT" as "toDate",
      NULL as less_domestic_packing,
      NULL as assembly_cost,
      NULL as export_packing_cost,
      NULL as fob_cost,
      NULL as oh_icc_export,
      NULL as added_export_overheads,
      NULL as unit_price_export,
      NULL as forex,
      NULL as unit_price_foreign_currency,
      (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE (LOWER(TRIM(cust.cardfname)) = LOWER(TRIM(T1.frgnname)) OR LOWER(TRIM(cust.cardname)) = LOWER(TRIM(T1.frgnname))) AND cust.cardtype = 'C' LIMIT 1) AS "currency",
      NULL as "U_RMWeight"
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
     LEFT JOIN "aargit_plp1" plp ON TRIM(plp."U_ItemNo") = TRIM(T1.itemcode) AND (TRIM(plp."U_CustCode") = $2 OR $2 IS NULL)
     WHERE TRIM(T1.itemcode) = $1
     ORDER BY plp."DocEntry"::bigint DESC
     LIMIT 1`
    :
    `SELECT 
      T1.itemcode, T1.itemname, T1.onhand, T2.itmsgrpnam, 
      T1.u_castingcode, T1.frgnname, T1.u_grade, T1.u_bought, 
      T1.prchseitem, T1.sellitem, T1.invntitem, 
      T1.u_subgrup, T1.validfor, T1.u_stage, T1.invntryuom, 
      T1.ugpentry, T1.u_rateperkg, T1.u_kit, T1.u_domeexpo,
      T1.u_cost, T1.u_cusfoudt, T1.createdate, T1.u_catweight as "u_catweight",
      ple."U_CustCode" as "customerCode",
      ple."U_CustName" as "customerName",
      ple."U_CusApprF" as "customerApprovalFoundry",
      ple."U_CastWt" as "weight",
      ple."U_CastRate" as "ratePerKg",
      ple."U_CastPric" as "castingPrice",
      ple."U_RejCost" as "rejectionCost",
      ple."U_SpecCoat" as "specialCoating",
      ple."U_PowdCoat" as "powderCoating",
      ple."U_PowdCoatWt" as "powderCoatingWeight",
      ple."U_PowdCoatRate" as "powderCoatingRate",
      ple."U_SpecProc" as "specialProcess",
      ple."U_SpecProcWt" as "specialProcessWeight",
      ple."U_SpecProcRate" as "specialProcessRate",
      ple."U_ProcMach" as "process",
      ple."U_TranChar" as "transCharges",
      ple."U_OHP" as "ohp",
      ple."U_Packing" as "packing",
      ple."U_ActCost" as "totalWorkingCost",
      ple."U_FinPrice" as "finalPrice",
      ple."U_EffDateF" as "fromDate",
      ple."U_EffDateT" as "toDate",
      ple."U_LessDome" as "lessDomesticPacking",
      ple."U_AsblyCst" as "assemblyCost",
      ple."U_ExpPack" as "exportPackingCost",
      ple."U_FOBCost" as "fobCost",
      ple."U_OHICCExp" as "ohIccExport",
      ple."U_ExpoHead" as "addedExportOverheads",
      ple."U_UnPriEx" as "unitPriceExport",
      ple."U_Forex" as "forex",
      ple."U_ForeCurr" as "unitPriceForeignCurrency",
      (SELECT TRIM(cust.currency) FROM ocrd_sftp cust WHERE (LOWER(TRIM(cust.cardfname)) = LOWER(TRIM(T1.frgnname)) OR LOWER(TRIM(cust.cardname)) = LOWER(TRIM(T1.frgnname))) AND cust.cardtype = 'C' LIMIT 1) AS "currency",
      NULL as "U_RMWeight"
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp T2 ON T1.itmsgrpcod::text = T2.itmsgrpcod::text
     LEFT JOIN "aargit_ple1" ple ON TRIM(ple."U_ItemNo") = TRIM(T1.itemcode) AND (TRIM(ple."U_CustCode") = $2 OR $2 IS NULL)
     WHERE TRIM(T1.itemcode) = $1
     ORDER BY ple."DocEntry"::bigint DESC
     LIMIT 1`;

  const row = await queryOne<any>(detailQuery, [id.trim(), customerCode || null]);

  if (!row) return null;

  // If customerCode was explicitly passed but the price list had no record for that customer,
  // the row.customerName will be NULL. Resolve it directly from ocrd_sftp so the UI shows
  // the correct customer name (not the item's default frgnname from oitm_sftp).
  if (customerCode && !row.customerName) {
    const custRow = await queryOne<any>(
      `SELECT TRIM(cardname) AS cardname FROM ocrd_sftp WHERE cardcode = $1 LIMIT 1`,
      [customerCode.trim()]
    );
    if (custRow?.cardname) {
      row.customerName = custRow.cardname;
      row.customerCode = customerCode.trim();
    }
  }

  if (date && /^\d{4}-\d{2}$/.test(date)) {
    const custCode = customerCode || row.customerCode || row.u_cusfoudt;
    if (custCode) {
      const histRow = await queryOne<any>(`
        SELECT 
          new_cast_weight AS "weight",
          new_cast_rate AS "ratePerKg",
          process_machining AS "process",
          ohp,
          packing,
          trans_charges AS "transCharges",
          rejection_cost AS "rejectionCost",
          powder_coating AS "powderCoating",
          special_process AS "specialProcess",
          new_price AS "finalPrice",
          ((COALESCE(new_cast_weight, 0) * COALESCE(new_cast_rate, 0)) + COALESCE(rejection_cost, 0) + COALESCE(powder_coating, 0) + COALESCE(special_process, 0) + COALESCE(process_machining, 0) + COALESCE(trans_charges, 0) + COALESCE(ohp, 0) + COALESCE(packing, 0)) AS "totalWorkingCost",
          from_date::text AS "fromDate",
          to_date::text AS "toDate",
          customer_approval_foundry AS "customerApprovalFoundry",
          new_mmr_rate AS "mmrRate",
          new_ro_rate AS "roRate",
          new_consumables AS "consumablesRate",
          new_extra AS "extraFactor",
          customer_code AS "customerCode",
          customer_name AS "customerName"
        FROM customer_pricing_history
        WHERE TRIM(item_code) = $1 AND TRIM(customer_code) = $2
        ${(() => {
          const fy = parseInt(date.split('-')[0], 10);
          const fm = parseInt(date.split('-')[1], 10);
          const firstDay = `${date}-01`;
          const lastDayDate = new Date(fy, fm, 0);
          const lastDay = `${date}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
          return `AND (from_date IS NULL OR from_date::DATE <= '${lastDay}'::DATE)
        AND (to_date IS NULL OR to_date::DATE >= '${firstDay}'::DATE)`;
        })()}
        ORDER BY from_date DESC, id DESC LIMIT 1
      `, [id.trim(), custCode.trim()]);

      if (histRow) {
        Object.assign(row, histRow);
      } else {
        row.weight = null;
        row.ratePerKg = null;
        row.finalPrice = null;
        row.totalWorkingCost = null;
        row.fromDate = null;
        row.toDate = null;
        row.rejectionCost = null;
        row.powderCoating = null;
        row.specialProcess = null;
        row.process = null;
        row.transCharges = null;
        row.ohp = null;
        row.packing = null;
      }
    }
  }

  // ── Apply active/pending/resubmitted dispute overrides from pricing_batch_items ──
  const baseCode = row.itemcode ? row.itemcode.trim().replace(/-rm$/i, '') : null;
  const rmCode = baseCode ? `${baseCode}-RM` : null;
  const castCode = row.u_castingcode ? row.u_castingcode.trim() : null;

  let pbiDateClauses = '';
  const pbiDateParams: any[] = [];
  if (date && /^\d{4}-\d{2}$/.test(date)) {
    const fy = parseInt(date.split('-')[0], 10);
    const fm = parseInt(date.split('-')[1], 10);
    const firstDay = `${date}-01`;
    const lastDayDate = new Date(fy, fm, 0);
    const lastDay = `${date}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    pbiDateClauses = `
      AND (from_date IS NULL OR from_date::DATE <= $4::DATE)
      AND (to_date IS NULL OR to_date::DATE >= $5::DATE)`;
    pbiDateParams.push(lastDay, firstDay);
  }

  // Build customer code filter for PBI query — only apply PBI records belonging to this customer
  const pbiCustClause = customerCode ? `AND TRIM(customer_code) = $${4 + pbiDateParams.length}` : '';
  const pbiCustParams = customerCode ? [customerCode.trim()] : [];

  const pbiCustomerOverride = await queryOne<any>(`
    SELECT 
      customer_rm_weight, customer_rate_per_kg, customer_rm_price,
      rm_weight, rm_cost, new_price, powder_coating, special_process,
      trans_charges, rejection_cost, customer_approval_foundry,
      machining, packing, overhead_pct, customer_total_price,
      from_date::text AS from_date, to_date::text AS to_date,
      customer_code, customer_name
    FROM pricing_batch_items
    WHERE (
      ($1::TEXT IS NOT NULL AND (item_code = $1 OR item_code = $2))
      OR ($3::TEXT IS NOT NULL AND casting_code = $3)
    )
    AND status IN ('pending', 'Open', 'resubmitted', 'disputed')
    ${pbiDateClauses}
    ${pbiCustClause}
    ORDER BY id DESC
    LIMIT 1
  `, [baseCode, rmCode, castCode, ...pbiDateParams, ...pbiCustParams]);

  if (pbiCustomerOverride) {
    if (pbiCustomerOverride.customer_rm_weight != null && Number(pbiCustomerOverride.customer_rm_weight) > 0) {
      row.weight = Number(pbiCustomerOverride.customer_rm_weight);
    } else if (pbiCustomerOverride.rm_weight != null && Number(pbiCustomerOverride.rm_weight) > 0) {
      row.weight = Number(pbiCustomerOverride.rm_weight);
    }

    if (pbiCustomerOverride.customer_rate_per_kg != null && Number(pbiCustomerOverride.customer_rate_per_kg) > 0) {
      row.ratePerKg = Number(pbiCustomerOverride.customer_rate_per_kg);
    }

    if (pbiCustomerOverride.customer_rm_price != null && Number(pbiCustomerOverride.customer_rm_price) > 0) {
      row.castingPrice = Number(pbiCustomerOverride.customer_rm_price);
    } else if (row.weight != null && row.ratePerKg != null) {
      row.castingPrice = Number(row.weight) * Number(row.ratePerKg);
    }

    if (pbiCustomerOverride.rejection_cost != null) row.rejectionCost = Number(pbiCustomerOverride.rejection_cost);
    if (pbiCustomerOverride.powder_coating != null) row.powderCoating = Number(pbiCustomerOverride.powder_coating);
    if (pbiCustomerOverride.special_process != null) row.specialProcess = Number(pbiCustomerOverride.special_process);
    if (pbiCustomerOverride.trans_charges != null) row.transCharges = Number(pbiCustomerOverride.trans_charges);
    if (pbiCustomerOverride.overhead_pct != null && Number(pbiCustomerOverride.overhead_pct) > 0) row.ohp = Number(pbiCustomerOverride.overhead_pct);
    if (pbiCustomerOverride.packing != null) row.packing = Number(pbiCustomerOverride.packing);
    if (pbiCustomerOverride.machining != null) row.process = Number(pbiCustomerOverride.machining);
    if (pbiCustomerOverride.customer_total_price != null) row.totalWorkingCost = Number(pbiCustomerOverride.customer_total_price);
    if (pbiCustomerOverride.from_date) row.fromDate = pbiCustomerOverride.from_date;
    if (pbiCustomerOverride.to_date) row.toDate = pbiCustomerOverride.to_date;
    if (pbiCustomerOverride.customer_code) row.customerCode = pbiCustomerOverride.customer_code;
    if (pbiCustomerOverride.customer_name) row.customerName = pbiCustomerOverride.customer_name;
    if (pbiCustomerOverride.customer_approval_foundry) row.customerApprovalFoundry = pbiCustomerOverride.customer_approval_foundry;

    if (pbiCustomerOverride.customer_total_price != null && Number(pbiCustomerOverride.customer_total_price) > 0) {
      row.finalPrice = Number(pbiCustomerOverride.customer_total_price);
    } else if (pbiCustomerOverride.new_price != null && Number(pbiCustomerOverride.new_price) > 0) {
      row.finalPrice = Number(pbiCustomerOverride.new_price);
    }
  }

  const lookupCodes = [row.itemcode?.trim()];
  if (row.u_castingcode?.trim()) lookupCodes.push(row.u_castingcode.trim());
  if (row.itemcode?.trim()) lookupCodes.push(row.itemcode.trim() + '-RM');

  const placeholders = lookupCodes.map((_, i) => `$${i + 1}`).join(',');

  let vendor = null;

  // 1. Prioritized lookup: Check vendor_materials mapping first (supporting date-filtered history union)
  if (lookupCodes.length > 0) {
    let dateFilterClauseVendor = '';
    if (date && /^\d{4}-\d{2}$/.test(date)) {
      const fy = parseInt(date.split('-')[0], 10);
      const fm = parseInt(date.split('-')[1], 10);
      const firstDay = `${date}-01`;
      const lastDayDate = new Date(fy, fm, 0);
      const lastDay = `${date}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      dateFilterClauseVendor = `
        AND (vm.from_date IS NULL OR vm.from_date::DATE <= '${lastDay}'::DATE)
        AND (vm.to_date IS NULL OR vm.to_date::DATE >= '${firstDay}'::DATE)`;
    }

    const vmRow = await queryOne<any>(
      `SELECT TRIM(vm.vendor_id) AS "CardCode",
         v.cardname AS "CardName",
         vm.revised_rate_per_kg AS "Price",
         TRIM(COALESCE(vm.item_code, vm.casting_code)) AS "ItemCode"
       FROM (
         SELECT 
           vendor_id, item_code, casting_code, revised_rate_per_kg, from_date, to_date,
           COALESCE(updated_at, NOW()) AS changed_at
         FROM vendor_materials
         UNION ALL
         SELECT 
           vendor_id, item_code, casting_code, new_revised_rate_per_kg as revised_rate_per_kg, from_date, to_date,
           changed_at
         FROM vendor_materials_history
       ) vm
       LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(vm.vendor_id)
       WHERE TRIM(COALESCE(vm.item_code, vm.casting_code)) IN (${placeholders})
       ${dateFilterClauseVendor}
       ORDER BY vm.changed_at DESC
       LIMIT 1`,
      [...lookupCodes]
    );
    if (vmRow) {
      vendor = vmRow;
    }
  }

  // 2. Fallback to purchase orders (por1)
  if (!vendor && lookupCodes.length > 0) {
    const vendors = await query<any>(
      `SELECT DISTINCT ON (TRIM(T1.itemcode)) 
          TRIM(T1.itemcode) AS "ItemCode", 
          TRIM(T0.cardcode) AS "CardCode", 
          v.cardname AS "CardName",
          T1.price AS "Price"
       FROM por1_sftp T1
       INNER JOIN opor_sftp T0 ON T0.docentry = T1.docentry
       LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(T0.cardcode)
       WHERE TRIM(T1.itemcode) IN (${placeholders})
       ORDER BY TRIM(T1.itemcode), T0.docdate DESC`, 
        lookupCodes
    );

    const vendorMap = new Map(vendors.map(v => [v.ItemCode, v]));
    if (row.itemcode && vendorMap.has(row.itemcode.trim())) {
      vendor = vendorMap.get(row.itemcode.trim());
    } else if (row.u_castingcode && vendorMap.has(row.u_castingcode.trim())) {
      vendor = vendorMap.get(row.u_castingcode.trim());
    }
  }

  // 3. Fallback to Special Prices (ospp_sftp)
  if (!vendor && lookupCodes.length > 0) {
    const osppVendors = await query<any>(
      `SELECT DISTINCT ON (TRIM(T0.itemcode))
          TRIM(T0.itemcode) AS "ItemCode", 
          TRIM(T0.cardcode) AS "CardCode", 
          v.cardname AS "CardName",
          T0.price AS "Price"
       FROM ospp_sftp T0
       LEFT JOIN ocrd_sftp v ON TRIM(v.cardcode) = TRIM(T0.cardcode)
       WHERE TRIM(T0.itemcode) IN (${placeholders})`, 
       lookupCodes
    );
    const osppMap = new Map(osppVendors.map(v => [v.ItemCode, v]));
    if (row.itemcode && osppMap.has(row.itemcode.trim())) {
      vendor = osppMap.get(row.itemcode.trim());
    } else if (row.itemcode && osppMap.has(row.itemcode.trim() + '-RM')) {
      vendor = osppMap.get(row.itemcode.trim() + '-RM');
    } else if (row.u_castingcode && osppMap.has(row.u_castingcode.trim())) {
      vendor = osppMap.get(row.u_castingcode.trim());
    }
  }

  if (vendor) {
    row.LastVendorCode = vendor.CardCode;
    row.LastVendorName = vendor.CardName;
    row.CurrentPrice = vendor.Price;

    // Fetch the specific RM Weight from the vendor's Special Prices (Vendor Materials)
    const itemCodeToLookup = row.itemcode?.trim() || '';
    const castingCodeToLookup = row.u_castingcode?.trim() || '';
    const rmCodeToLookup = itemCodeToLookup ? itemCodeToLookup + '-RM' : '';
    
    // Clear out fallback OITM rate so it STRICTLY uses ospp
    row.U_RatePerKg = 0;
    row.U_RMWeight = 0;

    const weightRow = await queryOne<{rm_weight: number, revised_rate_per_kg: number, revised_price: number}>(
      `SELECT rm_weight, revised_rate_per_kg, revised_price FROM vendor_materials 
       WHERE TRIM(casting_code) IN ($1, $2, $3) 
       AND TRIM(vendor_id) = $4 
       ORDER BY 
         CASE 
           WHEN TRIM(casting_code) = $2 THEN 1 
           WHEN TRIM(casting_code) = $3 THEN 2 
           ELSE 3 END ASC
       LIMIT 1`,
      [itemCodeToLookup, rmCodeToLookup, castingCodeToLookup, vendor.CardCode.trim()]
    );
    
    if (weightRow) {
      if (weightRow.rm_weight) {
        row.U_RMWeight = Number(weightRow.rm_weight);
      }
      if (weightRow.revised_rate_per_kg) {
        row.U_RatePerKg = Number(weightRow.revised_rate_per_kg);
      } else if (weightRow.revised_price) {
        row.U_RatePerKg = Number(weightRow.revised_price);
      }
    }
  }

  const baseCustQuery = `SELECT o.cardcode as "CardCode", g.groupname as "GroupName" FROM ocrd_sftp o LEFT JOIN ocrg_sftp g ON o.groupcode::TEXT = g.groupcode::TEXT WHERE (o.cardname ILIKE $1 OR o.cardfname ILIKE $1) AND o.cardtype = 'C' LIMIT 1`;
  const rawCustomerName = row.frgnname?.trim() || row.U_CusFouDt?.trim();
  if (rawCustomerName) {
    let custRow = await queryOne<{CardCode: string, GroupName: string}>(baseCustQuery, [rawCustomerName]);
    
    if (!custRow) {
      const cleanName = rawCustomerName
        .replace(/\b(LIMITED|LTD|PVT|PRIVATE|INC|LLC)\b/gi, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
        
      if (cleanName.length > 3) {
         custRow = await queryOne<{CardCode: string, GroupName: string}>(baseCustQuery, [`${cleanName}%`]);
      }
      
      if (!custRow && cleanName.includes(' ')) {
         const words = cleanName.split(' ');
         const twoWords = words[0] + ' ' + words[1];
         if (twoWords.length > 4) {
             custRow = await queryOne<{CardCode: string, GroupName: string}>(baseCustQuery, [`${twoWords}%`]);
         }
      }

      if (!custRow) {
         const fw = cleanName.split(' ')[0];
         if (fw.length > 4) {
             custRow = await queryOne<{CardCode: string, GroupName: string}>(baseCustQuery, [`${fw}%`]);
         }
      }
    }

    if (custRow) {
      row.CustomerCode = custRow.CardCode;
      row.CustomerGroup = custRow.GroupName;
    }
  }

  return mapItem(row);
}

export async function getDistinctGrades(filters?: { vendorId?: string; customerName?: string }): Promise<string[]> {
  const names = new Set<string>();

  // Fetch grades from vendor_materials
  const vmConditions: string[] = [];
  const vmParams: string[] = [];
  let vmIdx = 1;
  if (filters?.vendorId) {
    vmConditions.push(`TRIM(vendor_id) = $${vmIdx++}`);
    vmParams.push(filters.vendorId);
  }
  if (filters?.customerName) {
    vmConditions.push(`TRIM(customer_name) ILIKE $${vmIdx++}`);
    vmParams.push(`%${filters.customerName}%`);
  }
  const vmWhere = vmConditions.length > 0
    ? `WHERE ${vmConditions.join(' AND ')} AND TRIM(grade) != '' AND TRIM(grade) != '0'`
    : `WHERE TRIM(grade) != '' AND TRIM(grade) != '0'`;
  const vmRows = await query<{ grade: string }>(
    `SELECT DISTINCT TRIM(grade) as grade FROM vendor_materials ${vmWhere}`,
    vmParams
  );
  vmRows.forEach(r => {
    if (r.grade) names.add(r.grade);
  });

  // If not filtering by a specific vendor, also include grades from oitm_sftp
  if (!filters?.vendorId) {
    const conditions: string[] = ['validfor = \'Y\'', 'itmsgrpcod::TEXT = \'109\'', 'u_grade IS NOT NULL', 'TRIM(u_grade) != \'\''];
    const params: string[] = [];
    let idx = 1;
    if (filters?.customerName) {
      conditions.push(`(u_cusfoudt ILIKE $${idx} OR frgnname ILIKE $${idx})`);
      params.push(`%${filters.customerName}%`);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<{ grade: string }>(
      `SELECT DISTINCT TRIM(u_grade) as grade FROM oitm_sftp ${where} ORDER BY grade`,
      params
    );
    rows.forEach(r => {
      if (r.grade) names.add(r.grade);
    });
  }

  return Array.from(names).sort();
}

export async function getDistinctCustomers(filters?: { vendorId?: string; grade?: string; itemCode?: string }): Promise<string[]> {
  const vmConditions: string[] = [
    "customer_name IS NOT NULL", 
    "TRIM(customer_name) != ''",
    "TRIM(customer_name) != TRIM(item_code)",
    "TRIM(customer_name) != TRIM(casting_code)"
  ];
  const vmParams: any[] = [];
  let idx = 1;

  if (filters?.vendorId) {
    vmConditions.push(`TRIM(vendor_id) = $${idx++}`);
    vmParams.push(filters.vendorId.trim());
  }
  if (filters?.grade) {
    const grades = filters.grade.split(',').map(g => g.trim()).filter(Boolean);
    vmConditions.push(`TRIM(grade) = ANY($${idx++})`);
    vmParams.push(grades);
  }
  if (filters?.itemCode) {
    vmConditions.push(`(TRIM(item_code) = $${idx} OR TRIM(casting_code) = $${idx})`);
    vmParams.push(filters.itemCode.trim());
    idx++;
  }

  const where = `WHERE ${vmConditions.join(' AND ')}`;

  let rows: { cardname: string }[] = [];
  if (filters?.vendorId || filters?.grade || filters?.itemCode) {
    rows = await query<{ cardname: string }>(`
      SELECT DISTINCT TRIM(customer_name) as cardname 
      FROM vendor_materials ${where}
      UNION
      SELECT DISTINCT TRIM(customer_name) as cardname 
      FROM vendor_materials_history ${where}
      ORDER BY cardname
    `, vmParams);
  } else {
    rows = await query<{ cardname: string }>(`
      SELECT DISTINCT TRIM(customer_name) as cardname FROM vendor_materials WHERE customer_name IS NOT NULL AND TRIM(customer_name) != '' AND TRIM(customer_name) != TRIM(item_code) AND TRIM(customer_name) != TRIM(casting_code)
      UNION
      SELECT DISTINCT TRIM(customer_name) as cardname FROM vendor_materials_history WHERE customer_name IS NOT NULL AND TRIM(customer_name) != '' AND TRIM(customer_name) != TRIM(item_code) AND TRIM(customer_name) != TRIM(casting_code)
      UNION
      SELECT DISTINCT TRIM("U_CustName") as cardname FROM "argit_pld1" WHERE "U_CustName" IS NOT NULL AND TRIM("U_CustName") != ''
      UNION
      SELECT DISTINCT TRIM("U_CustName") as cardname FROM "aargit_ple1" WHERE "U_CustName" IS NOT NULL AND TRIM("U_CustName") != ''
      UNION
      SELECT DISTINCT TRIM("U_CustName") as cardname FROM "aargit_plp1" WHERE "U_CustName" IS NOT NULL AND TRIM("U_CustName") != ''
      UNION
      SELECT DISTINCT TRIM("U_CustName") as cardname FROM "argit_pll1" WHERE "U_CustName" IS NOT NULL AND TRIM("U_CustName") != ''
      UNION
      SELECT DISTINCT TRIM(cardname) as cardname FROM ocrd_sftp WHERE cardtype = 'C' AND cardname IS NOT NULL AND TRIM(cardname) != ''
      ORDER BY cardname
    `);
  }

  return rows.map(r => r.cardname).filter(Boolean);
}

export async function getDistinctCustomerTypes(): Promise<string[]> {
  const rows = await query<{ u_domeexpo: string }>(
    'SELECT DISTINCT u_domeexpo FROM oitm_sftp WHERE u_domeexpo IS NOT NULL AND validfor = \'Y\' ORDER BY u_domeexpo'
  );
  return rows.map(r => r.u_domeexpo).filter(Boolean);
}

export async function getVendorsForFilter(filters?: { grade?: string; customerName?: string; itemCode?: string }): Promise<{id: string, name: string}[]> {
  const grade = filters?.grade;
  const customerName = filters?.customerName;
  const itemCode = filters?.itemCode;
  
  if (grade || customerName || itemCode) {
    const vmConditions: string[] = [];
    const vmParams: any[] = [];
    let idx = 1;
    if (grade) {
      const grades = grade.split(',').map(g => g.trim()).filter(Boolean);
      vmConditions.push(`TRIM(v.grade) = ANY($${idx++})`);
      vmParams.push(grades);
    }
    if (customerName) {
      vmConditions.push(`TRIM(v.customer_name) ILIKE $${idx++}`);
      vmParams.push(`%${customerName.trim()}%`);
    }
    if (itemCode) {
      vmConditions.push(`(TRIM(v.item_code) = $${idx} OR TRIM(v.casting_code) = $${idx})`);
      vmParams.push(itemCode.trim());
      idx++;
    }
    const where = vmConditions.length > 0 ? `WHERE ${vmConditions.join(' AND ')}` : '';
    const rows = await query<{ id: string; name: string }>(`
      SELECT DISTINCT TRIM(v.vendor_id) as id, COALESCE(TRIM(ocrd.cardname), TRIM(v.vendor_id)) as name
      FROM (
        SELECT vendor_id, customer_name, grade, item_code, casting_code FROM vendor_materials
        UNION
        SELECT vendor_id, customer_name, grade, item_code, casting_code FROM vendor_materials_history
      ) v
      LEFT JOIN ocrd_sftp ocrd ON TRIM(ocrd.cardcode) = TRIM(v.vendor_id)
      ${where}
      ORDER BY name
    `, vmParams);
    return rows;
  } else {
    const rows = await query<any>(`
      SELECT TRIM(cardcode) as id, cardname as name
      FROM ocrd_sftp
      WHERE cardtype = 'S'
      ORDER BY name
    `);
    return rows;
  }
}

export async function getDistinctCastingCodes(filters?: { vendorId?: string }): Promise<string[]> {
  if (filters?.vendorId) {
    const rows = await query<{ code: string }>(
      `SELECT DISTINCT TRIM(casting_code) as code FROM vendor_materials WHERE TRIM(vendor_id) = $1 AND casting_code IS NOT NULL AND TRIM(casting_code) != ''
       UNION
       SELECT DISTINCT TRIM(casting_code) as code FROM vendor_materials_history WHERE TRIM(vendor_id) = $1 AND casting_code IS NOT NULL AND TRIM(casting_code) != ''
       ORDER BY code`,
      [filters.vendorId.trim()]
    );
    return rows.map(r => r.code).filter(Boolean);
  }
  const rows = await query<{ code: string }>(
    'SELECT DISTINCT TRIM(u_castingcode) as code FROM oitm_sftp WHERE u_castingcode IS NOT NULL AND TRIM(u_castingcode) != \'\' AND validfor = \'Y\' ORDER BY code'
  );
  return rows.map(r => r.code);
}

export async function getDistinctFoundries(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT TRIM("U_CusApprF") as foundry FROM "argit_pld1" WHERE "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CusApprF") as foundry FROM "aargit_ple1" WHERE "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CusApprF") as foundry FROM "aargit_plp1" WHERE "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CusApprF") as foundry FROM "argit_pll1" WHERE "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    ORDER BY foundry ASC
  `;
  const rows = await query<{ foundry: string }>(sql);
  return rows.map(r => r.foundry);
}

export async function getDistinctItemGroups(): Promise<{ code: number; name: string }[]> {
  const rows = await query<{ code: number; name: string }>(
    'SELECT DISTINCT itmsgrpcod as code, itmsgrpnam as name FROM oitb_sftp WHERE itmsgrpnam IS NOT NULL ORDER BY name'
  );
  return rows;
}

export async function getDistinctStages(): Promise<string[]> {
  const rows = await query<{ stage: string }>(
    'SELECT DISTINCT TRIM(u_stage) as stage FROM oitm_sftp WHERE u_stage IS NOT NULL AND TRIM(u_stage) != \'\' AND validfor = \'Y\' ORDER BY stage'
  );
  return rows.map(r => r.stage);
}

export async function getDistinctItemCodes(filters?: { vendorId?: string; customerName?: string; grade?: string }): Promise<string[]> {
  const vmConditions: string[] = [];
  const vmParams: any[] = [];
  let idx = 1;

  if (filters?.vendorId) {
    vmConditions.push(`TRIM(vendor_id) = $${idx++}`);
    vmParams.push(filters.vendorId.trim());
  }
  if (filters?.customerName) {
    vmConditions.push(`TRIM(customer_name) ILIKE $${idx++}`);
    vmParams.push(`%${filters.customerName.trim()}%`);
  }
  if (filters?.grade) {
    const grades = filters.grade.split(',').map(g => g.trim()).filter(Boolean);
    vmConditions.push(`TRIM(grade) = ANY($${idx++})`);
    vmParams.push(grades);
  }

  const where = vmConditions.length > 0 ? `WHERE ${vmConditions.join(' AND ')}` : '';

  const rows = await query<{ code: string }>(`
    SELECT DISTINCT TRIM(item_code) as code FROM vendor_materials ${where} ${where ? 'AND' : 'WHERE'} item_code IS NOT NULL AND TRIM(item_code) != ''
    UNION
    SELECT DISTINCT TRIM(item_code) as code FROM vendor_materials_history ${where} ${where ? 'AND' : 'WHERE'} item_code IS NOT NULL AND TRIM(item_code) != ''
    UNION
    SELECT DISTINCT TRIM(casting_code) as code FROM vendor_materials ${where} ${where ? 'AND' : 'WHERE'} casting_code IS NOT NULL AND TRIM(casting_code) != ''
    UNION
    SELECT DISTINCT TRIM(casting_code) as code FROM vendor_materials_history ${where} ${where ? 'AND' : 'WHERE'} casting_code IS NOT NULL AND TRIM(casting_code) != ''
    ORDER BY code
  `, vmParams);
  return rows.map(r => r.code).filter(Boolean);
}

export async function getDistinctDescriptions(filters?: { vendorId?: string }): Promise<string[]> {
  if (filters?.vendorId) {
    const rows = await query<{ description: string }>(
      `SELECT DISTINCT TRIM(item_description) as description FROM vendor_materials WHERE TRIM(vendor_id) = $1 AND item_description IS NOT NULL AND TRIM(item_description) != ''
       UNION
       SELECT DISTINCT TRIM(item_description) as description FROM vendor_materials_history WHERE TRIM(vendor_id) = $1 AND item_description IS NOT NULL AND TRIM(item_description) != ''
       ORDER BY description`,
      [filters.vendorId.trim()]
    );
    return rows.map(r => r.description).filter(Boolean);
  }
  const rows = await query<{ description: string }>(
    'SELECT DISTINCT TRIM(itemname) as description FROM oitm_sftp WHERE itemname IS NOT NULL AND TRIM(itemname) != \'\' AND validfor = \'Y\' ORDER BY description'
  );
  return rows.map(r => r.description);
}

export async function getDistinctForeignNames(filters?: { vendorId?: string }): Promise<string[]> {
  if (filters?.vendorId) {
    const rows = await query<{ name: string }>(
      `SELECT DISTINCT TRIM(customer_name) as name FROM vendor_materials WHERE TRIM(vendor_id) = $1 AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
       UNION
       SELECT DISTINCT TRIM(customer_name) as name FROM vendor_materials_history WHERE TRIM(vendor_id) = $1 AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
       ORDER BY name`,
      [filters.vendorId.trim()]
    );
    return rows.map(r => r.name).filter(Boolean);
  }
  const rows = await query<{ name: string }>(
    'SELECT DISTINCT TRIM(frgnname) as name FROM oitm_sftp WHERE frgnname IS NOT NULL AND TRIM(frgnname) != \'\' AND validfor = \'Y\' ORDER BY name'
  );
  return rows.map(r => r.name);
}

export async function createItem(body: Partial<ItemMaster>, _updatedBy: string = 'System'): Promise<ItemMaster> {
  const itemCode = body.itemCode?.trim() || '';
  if (!itemCode) {
    throw new Error('ItemCode is required');
  }

  const existing = await queryOne('SELECT itemcode FROM oitm_sftp WHERE TRIM(itemcode) = $1', [itemCode]);
  if (existing) {
    throw new Error(`Item with code ${itemCode} already exists`);
  }

  const querySql = `
    INSERT INTO oitm_sftp (
      itemcode, itemname, onhand, itmsgrpcod, u_castingcode, 
      frgnname, u_grade, u_bought, prchseitem, sellitem, 
      invntitem, u_subgrup, validfor, u_stage, invntryuom, 
      u_rateperkg, u_kit, u_domeexpo, "CardCode", createdate
    ) VALUES (
      $1, $2, $3, $4, $5, 
      $6, $7, $8, $9, $10, 
      $11, $12, $13, $14, $15, 
      $16, $17, $18, $19, NOW()
    ) RETURNING *
  `;

  const itmsGrpCod = body.itemGroup ? Number(body.itemGroup) : 109;

  const params = [
    itemCode,
    body.description || '',
    Number(body.inStock) || 0,
    itmsGrpCod,
    body.castingCode || '',
    body.foreignName || '',
    body.grade || '',
    body.boughtOutJobWork || '',
    body.purchasingItem === 'Yes' ? 'Y' : 'N',
    body.salesItem === 'Yes' ? 'Y' : 'N',
    body.inventoryItem === 'Yes' ? 'Y' : 'N',
    body.subGroup1 || '',
    body.active === 'Yes' ? 'Y' : 'N',
    body.stage || '',
    body.uom || '',
    Number(body.price) || 0,
    body.kit || '',
    body.exportDomestic || '',
    body.vendorId || null,
  ];
  await query(querySql, params);

  const createdItem = await getItemById(itemCode);
  if (!createdItem) {
    throw new Error('Failed to retrieve created item');
  }
  return createdItem;
}

export async function updateItem(itemCode: string, body: any, updatedBy: string = 'System'): Promise<any> {
  const cleanCode = itemCode.trim();
  
  // 1. Update basic SAP properties in oitm
  const oitmSql = `
    UPDATE oitm_sftp SET
      itemname = $1, u_castingcode = $2, frgnname = $3, u_grade = $4,
      u_bought = $5, validfor = $6, u_stage = $7, invntryuom = $8,
      u_kit = $9, u_domeexpo = $10
    WHERE TRIM(itemcode) = $11
  `;
  // Skip oitm_sftp update when saving from Customer Master (Domestic/Export/Labour/Pin & Bush tabs).
  // In that context only the argit pricing tables should be written — oitm is for Item Master edits only.
  if (!body._skipOitmUpdate) {
    const oitmParams = [
      body.description || '', body.castingCode || '', body.foreignName || '', body.grade || '',
      body.boughtOutJobWork || '', body.active === 'Yes' ? 'Y' : 'N', body.stage || '', body.uom || '',
      body.kit || '', body.exportDomestic || '', cleanCode
    ];
    await query(oitmSql, oitmParams);
  }


  // Load SAP item details for fallback
  const sapItem = await queryOne<any>(
    `SELECT T1.itemname, T1.frgnname, T1.u_castingcode, T1.u_grade, T1.u_bought, 
            T1.u_domeexpo, T1.itmsgrpcod, oitb.itmsgrpnam as "itemGroup"
     FROM oitm_sftp T1
     LEFT JOIN oitb_sftp oitb ON T1.itmsgrpcod::text = oitb.itmsgrpcod::text
     WHERE TRIM(T1.itemcode) = $1`,
    [cleanCode]
  );

  let isLabour = false;
  let isPin = false;
  if (body.exportDomestic === 'Labour / Job Work') {
    isLabour = true;
  } else if (body.exportDomestic === 'Pin & Bush') {
    isPin = true;
  } else if (body.exportDomestic === 'Export' || body.exportDomestic === 'Domestic') {
    // explicitly export or domestic, not labour/pin
  } else {
    isLabour = !!(sapItem && (['125', '128'].includes(String(sapItem.itmsgrpcod || '')) || 
                      String(sapItem.u_bought || '').trim() === 'Job Work'));
    isPin = !!(sapItem && (['116', '118'].includes(String(sapItem.itmsgrpcod || '')) || 
                    String(sapItem.u_domeexpo || '').toUpperCase().includes('PIN BUSH') ||
                    String(sapItem.u_domeexpo || '').toUpperCase().includes('PIN PUSH') ||
                    String(sapItem.u_domeexpo || '').toUpperCase().includes('PIN & BUSH')));
  }

  const foreignName = body.foreignName || sapItem?.frgnname?.trim() || '';
  const itemDescription = body.description || sapItem?.itemname?.trim() || '';
  const groupName = body.itemGroup || sapItem?.itemGroup?.trim() || '';
  const boughtOutJobWork = body.boughtOutJobWork || sapItem?.u_bought?.trim() || '';
  
  let exportDomestic = body.exportDomestic || sapItem?.u_domeexpo?.trim() || '';
  if (!exportDomestic) {
    if (isLabour) exportDomestic = 'Labour / Job Work';
    else if (isPin) exportDomestic = 'Pin & Bush';
    else exportDomestic = 'Domestic';
  }

  const isExport = exportDomestic === 'Export';
  const isDomestic = exportDomestic === 'Domestic';

  let customerCode = body.customerCode || '';
  let customerName = body.customerName || '';
  if (!customerCode && foreignName) {
    const cust = await queryOne<any>(
      `SELECT TRIM("CardCode") as "customerCode", TRIM("CardName") as "customerName"
       FROM ocrd_sftp
       WHERE (LOWER(TRIM("CardFName")) = LOWER(TRIM($1)) OR LOWER(TRIM("CardName")) = LOWER(TRIM($1)))
         AND cardtype = 'C'
       LIMIT 1`,
      [foreignName]
    );
    if (cust) {
      customerCode = cust.customerCode;
      customerName = cust.customerName;
    }
  } else if (customerCode && !customerName) {
    // Resolve customer name from ocrd_sftp when code is known but name is missing
    const cust = await queryOne<any>(
      `SELECT TRIM(cardname) as "customerName" FROM ocrd_sftp WHERE TRIM(cardcode) = $1 LIMIT 1`,
      [customerCode.trim()]
    );
    if (cust) {
      customerName = cust.customerName;
    }
  }

  const customerApprovalFoundry = body.customerApprovalFoundry || '';
  const weight = Number(body.weight || 0);
  const mmrRate = body.mmrRate !== undefined && body.mmrRate !== '' ? Number(body.mmrRate) : 0;
  const roRate = body.roRate !== undefined && body.roRate !== '' ? Number(body.roRate) : 0;
  const consumablesRate = body.consumablesRate !== undefined && body.consumablesRate !== '' ? Number(body.consumablesRate) : 0;
  const extraFactor = body.extraFactor !== undefined && body.extraFactor !== '' ? Number(body.extraFactor) : 0;

  let ratePerKg = Number(body.ratePerKg || 0);
  if (body.mmrRate !== undefined || body.roRate !== undefined || body.consumablesRate !== undefined || body.extraFactor !== undefined) {
    ratePerKg = mmrRate + roRate + consumablesRate + extraFactor;
  }
  const castingPrice = weight * ratePerKg;
  const rejectionCost = Number(body.rejectionCost || 0);
  const powderCoating = Number(body.powderCoating || 0);
  const specialCoating = body.specialCoating !== undefined ? String(body.specialCoating).trim() : '';
  const specialProcess = excelRound(Number(body.specialProcess || 0));
  const process = Number(body.process || 0);
  const transCharges = Number(body.transCharges || 0);
  const ohp = Number(body.ohp || 0);
  const packing = excelRound(Number(body.packing || 0));
  // Helper: converts a value to a numeric string, returning null for empty/undefined
  // so Postgres numeric columns don't receive an empty string and throw a type error.
  const toNumericStr = (v: any): string | null =>
    (v !== undefined && v !== null && v !== '') ? String(v) : null;
  const powderCoatingWeight = toNumericStr(body.powderCoatingWeight);
  const powderCoatingRate   = toNumericStr(body.powderCoatingRate);
  const specialProcessWeight = toNumericStr(body.specialProcessWeight);
  const specialProcessRate   = toNumericStr(body.specialProcessRate);
  const cuttingWeight = toNumericStr(body.cuttingWeight);
  const cuttingRate   = toNumericStr(body.cuttingRate);
  const cutting = Number(body.cutting || 0);

  
  let totalWorkingCost = excelRound(rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing);
  let finalPrice = castingPrice + totalWorkingCost;
  
  if (isLabour) {
    totalWorkingCost = excelRound(powderCoating + specialProcess + process + transCharges + ohp + packing);
    finalPrice = totalWorkingCost;
  }

  const hardeningWt = Number(body.hardeningWt || 0);
  const hardeningRate = Number(body.hardeningRate || 0);
  const hardeningPrice = hardeningWt * hardeningRate;
  const grinding = Number(body.grinding || 0);
  const hardChromeWt = Number(body.hardChromeWt || 0);
  const hardChromeRate = Number(body.hardChromeRate || 0);
  const hardChromePrice = hardChromeWt * hardChromeRate;

  if (isPin) {
    totalWorkingCost = excelRound(rejectionCost + cutting + process + transCharges + ohp + packing + hardeningPrice + grinding + hardChromePrice);
    finalPrice = castingPrice + totalWorkingCost;
  }

  const fromDate = body.fromDate || null;
  const toDate = body.toDate || null;

  if (isLabour) {
    const existingPll = await queryOne<{ DocEntry: string }>(
      'SELECT "DocEntry" FROM "argit_pll1" WHERE TRIM("U_ItemNo") = $1 AND TRIM("U_CustCode") = $2 ORDER BY "DocEntry"::bigint DESC LIMIT 1',
      [cleanCode, customerCode]
    );

    let docEntry = existingPll ? parseInt(existingPll.DocEntry || '0', 10) : 0;

    let oldData: any = null;

    if (existingPll) {
      const oldRow = await queryOne<any>(`SELECT * FROM "argit_pll1" WHERE "DocEntry" = $1`, [docEntry]);
      if (oldRow) {
        oldData = {
          customerName: oldRow.U_CustName,
          validFrom: oldRow.U_EffDateF,
          validTo: oldRow.U_EffDateT,
          priceList: oldRow.U_PriceList,
          currency: oldRow.U_Currency,
          weight: oldRow.U_CastWt,
          ratePerKg: oldRow.U_CastRate,
          powderCoating: oldRow.U_PowdCoat,
          specialProcess: oldRow.U_SpecProc,
          rejectionCost: oldRow.U_RejCost,
          transCharges: oldRow.U_TranChar,
          ohp: oldRow.U_OHP,
          packing: oldRow.U_Packing,
          process: oldRow.U_ProcMach,
          price: oldRow.U_FinPrice
        };
      }

      const pllSql = `
        UPDATE "argit_pll1" SET
          "U_CustCode" = $1, "U_CustName" = $2, "U_ForgName" = $3, "U_CusApprF" = $4, "U_CastCode" = $5,
          "U_ItemDesc" = $6, "U_GrpName" = $7, "U_DomeExpo" = $8, "U_BoughJob" = $9, "U_CastWt" = $10,
          "U_CastRate" = $11, "U_CastPric" = $12, "U_RejCost" = $13, "U_PowdCoat" = $14, "U_SpecProc" = $15,
          "U_ProcMach" = $16, "U_TranChar" = $17, "U_OHP" = $18, "U_Packing" = $19, "U_ActCost" = $20,
          "U_FinPrice" = $21, "U_EffDateF" = $22, "U_EffDateT" = $23, "U_Status" = $24,
          "U_PowdCoatWt" = $27, "U_PowdCoatRate" = $28, "U_SpecProcWt" = $29, "U_SpecProcRate" = $30, "U_SpecCoat" = $31
        WHERE "DocEntry"::bigint = $25 AND TRIM("U_ItemNo") = $26
      `;
      const pllParams = [
        customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        itemDescription, groupName, exportDomestic, boughtOutJobWork, String(weight),
        String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating), String(specialProcess),
        String(process), String(transCharges), String(ohp), String(packing), String(totalWorkingCost),
        String(finalPrice), fromDate, toDate, 'Success', docEntry, cleanCode,
        powderCoatingWeight, powderCoatingRate, specialProcessWeight, specialProcessRate, String(specialCoating)
      ];
      await query(pllSql, pllParams);
    } else {
      const docEntryRes = await queryOne<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "argit_pll1"');
      docEntry = parseInt(docEntryRes?.max || '0', 10) + 1;

      const pllInsertSql = `
        INSERT INTO "argit_pll1" (
          "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
          "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_CastCode",
          "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
          "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
          "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
          "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
          "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate", "U_SpecCoat"
        ) VALUES (
          $1, '1', '0', 'OPLE', '0',
          $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31
        )
      `;
      const pllInsertParams = [
        String(docEntry), customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        cleanCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        String(weight), String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating),
        String(specialProcess), String(process), String(transCharges), String(ohp), String(packing),
        String(totalWorkingCost), String(finalPrice), fromDate, toDate, 'Success',
        powderCoatingWeight, powderCoatingRate, specialProcessWeight, specialProcessRate, String(specialCoating)
      ];
      await query(pllInsertSql, pllInsertParams);
    }

    const newData = {
      customerName: customerName,
      validFrom: fromDate,
      validTo: toDate,
      weight, ratePerKg, powderCoating, specialProcess, rejectionCost, transCharges, ohp, packing, process, finalPrice
    };
    await trackItemPriceHistory(cleanCode, 'Labour', oldData, newData, updatedBy);
    await trackCustomerPricingHistory(
      cleanCode, customerCode, customerName, body.castingCode || '', itemDescription,
      body.grade || '', groupName, exportDomestic, customerApprovalFoundry,
      oldData, newData, updatedBy
    );
  } else if (isPin) {
    const existingPlp = await queryOne<{ DocEntry: string }>(
      'SELECT "DocEntry" FROM "aargit_plp1" WHERE TRIM("U_ItemNo") = $1 AND TRIM("U_CustCode") = $2 ORDER BY "DocEntry"::bigint DESC LIMIT 1',
      [cleanCode, customerCode]
    );

    let docEntry = existingPlp ? parseInt(existingPlp.DocEntry || '0', 10) : 0;

    let oldData: any = null;

    if (existingPlp) {
      const oldRow = await queryOne<any>(`SELECT * FROM "aargit_plp1" WHERE "DocEntry" = $1`, [docEntry]);
      if (oldRow) {
        oldData = {
          customerName: oldRow.U_CustName,
          validFrom: oldRow.U_EffDateF,
          validTo: oldRow.U_EffDateT,
          weight: oldRow.U_CastWt,
          ratePerKg: oldRow.U_CastRate,
          powderCoating: oldRow.U_PowdCoat,
          specialProcess: oldRow.U_SpecProc,
          rejectionCost: oldRow.U_RejCost,
          transCharges: oldRow.U_TranChar,
          ohp: oldRow.U_OHP,
          packing: oldRow.U_Packing,
          process: oldRow.U_ProcMach,
          price: oldRow.U_FinPrice,
          hardeningWt: oldRow.U_HardWt,
          hardeningRate: oldRow.U_HardRate,
          grinding: oldRow.U_Grinding,
          hardChromeWt: oldRow.U_HChromeW,
          hardChromeRate: oldRow.U_HChromeR,
          mmrRate: oldRow.U_MmrRate,
          roRate: oldRow.U_RoRate,
          consumablesRate: oldRow.U_ConsRate,
          extraFactor: oldRow.U_Extra
        };
      }

      const plpSql = `
        UPDATE "aargit_plp1" SET
          "U_CustCode" = $1, "U_CustName" = $2, "U_ForgName" = $3, "U_CusApprF" = $4, "U_CastCode" = $5,
          "U_ItemDesc" = $6, "U_GrpName" = $7, "U_DomeExpo" = $8, "U_BoughJob" = $9, "U_CastWt" = $10,
          "U_CastRate" = $11, "U_CastPric" = $12, "U_RejCost" = $13, "U_PowdCoat" = $14, "U_SpecProc" = $15,
          "U_ProcMach" = $16, "U_TranChar" = $17, "U_OHP" = $18, "U_Packing" = $19, "U_ActCost" = $20,
          "U_FinPrice" = $21, "U_EffDateF" = $22, "U_EffDateT" = $23, "U_Status" = $24,
          "U_HardWt" = $25, "U_HardRate" = $26, "U_Grinding" = $27, "U_HChromeW" = $28, "U_HChromeR" = $29,
          "U_CuttingWt" = $32, "U_CuttingRate" = $33, "U_Cutting" = $34,
          "U_MmrRate" = $35, "U_RoRate" = $36, "U_ConsRate" = $37, "U_Extra" = $38, "U_SpecCoat" = $39
        WHERE "DocEntry"::bigint = $30 AND TRIM("U_ItemNo") = $31
      `;
      const plpParams = [
        customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        itemDescription, groupName, exportDomestic, boughtOutJobWork, String(weight),
        String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating), String(specialProcess),
        String(process), String(transCharges), String(ohp), String(packing), String(totalWorkingCost),
        String(finalPrice), fromDate, toDate, 'Success', 
        String(hardeningWt), String(hardeningRate), String(grinding), String(hardChromeWt), String(hardChromeRate),
        docEntry, cleanCode,
        cuttingWeight, cuttingRate, String(cutting),
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating)
      ];
      await query(plpSql, plpParams);
    } else {
      const docEntryRes = await queryOne<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "aargit_plp1"');
      docEntry = parseInt(docEntryRes?.max || '0', 10) + 1;

      const plpInsertSql = `
        INSERT INTO "aargit_plp1" (
          "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
          "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_CastCode",
          "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
          "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
          "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
          "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
          "U_HardWt", "U_HardRate", "U_Grinding", "U_HChromeW", "U_HChromeR",
          "U_CuttingWt", "U_CuttingRate", "U_Cutting",
          "U_MmrRate", "U_RoRate", "U_ConsRate", "U_Extra", "U_SpecCoat"
        ) VALUES (
          $1, '1', '0', 'OPLE', '0',
          $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31,
          $32, $33, $34,
          $35, $36, $37, $38, $39
        )
      `;
      const plpInsertParams = [
        String(docEntry), customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        cleanCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        String(weight), String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating),
        String(specialProcess), String(process), String(transCharges), String(ohp), String(packing),
        String(totalWorkingCost), String(finalPrice), fromDate, toDate, 'Success',
        String(hardeningWt), String(hardeningRate), String(grinding), String(hardChromeWt), String(hardChromeRate),
        cuttingWeight, cuttingRate, String(cutting),
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating)
      ];
      await query(plpInsertSql, plpInsertParams);
    }

    // bpe table is not needed



    const newData = {
      customerName: customerName,
      validFrom: fromDate,
      validTo: toDate,
      weight, ratePerKg, powderCoating, specialProcess, rejectionCost, transCharges, ohp, packing, process, finalPrice,
      mmrRate, roRate, consumablesRate, extraFactor
    };
    await trackItemPriceHistory(cleanCode, 'PinPush', oldData, newData, updatedBy);
    await trackCustomerPricingHistory(
      cleanCode, customerCode, customerName, body.castingCode || '', itemDescription,
      body.grade || '', groupName, exportDomestic, customerApprovalFoundry,
      oldData, newData, updatedBy
    );
  } else if (isExport) {
    // 2. Manage custom export rates inside aargit_ple1 and aargit_bpe1
    const existingPle = await queryOne<{ DocEntry: string }>(
      'SELECT "DocEntry" FROM "aargit_ple1" WHERE TRIM("U_ItemNo") = $1 AND TRIM("U_CustCode") = $2 ORDER BY "DocEntry"::bigint DESC LIMIT 1',
      [cleanCode, customerCode]
    );

    let docEntry = existingPle ? parseInt(existingPle.DocEntry || '0', 10) : 0;
    
    const lessDomesticPacking = Number(body.lessDomesticPacking || 0);
    const assemblyCost = Number(body.assemblyCost || 0);
    const exportPackingCost = String(body.exportPackingCost || '0');
    const fobCost = Number(body.fobCost || 0);
    const ohIccExport = Number(body.ohIccExport || 0);
    const addedExportOverheads = Number(body.addedExportOverheads || 0);
    const forex = Number(body.forex || 0);

    const unitPriceExportVal = finalPrice - lessDomesticPacking + assemblyCost + Number(exportPackingCost || 0) + fobCost + ohIccExport + addedExportOverheads;
    const unitPriceExport = body.unitPriceExport || Number(unitPriceExportVal).toFixed(2);
    
    const unitPriceForeignCurrencyVal = forex > 0 ? (Number(unitPriceExport) / forex) : 0;
    const unitPriceForeignCurrency = body.unitPriceForeignCurrency || (unitPriceForeignCurrencyVal > 0 ? unitPriceForeignCurrencyVal.toFixed(4) : '');

    let oldData: any = null;

    if (existingPle) {
      const oldRow = await queryOne<any>(`SELECT * FROM "aargit_ple1" WHERE "DocEntry" = $1`, [docEntry]);
      if (oldRow) {
        oldData = {
          customerName: oldRow.U_CustName,
          validFrom: oldRow.U_EffDateF,
          validTo: oldRow.U_EffDateT,
          weight: oldRow.U_CastWt,
          ratePerKg: oldRow.U_CastRate,
          powderCoating: oldRow.U_PowdCoat,
          specialProcess: oldRow.U_SpecProc,
          rejectionCost: oldRow.U_RejCost,
          transCharges: oldRow.U_TranChar,
          ohp: oldRow.U_OHP,
          packing: oldRow.U_Packing,
          process: oldRow.U_ProcMach,
          price: oldRow.U_FinPrice,
          lessDomesticPacking: oldRow.U_LessDome,
          assemblyCost: oldRow.U_AsblyCst,
          exportPackingCost: oldRow.U_ExpPack,
          fobCost: oldRow.U_FOBCost,
          ohIccExport: oldRow.U_OHICCExp,
          addedExportOverheads: oldRow.U_ExpoHead,
          unitPriceExport: oldRow.U_UnPriEx,
          forex: oldRow.U_Forex,
          unitPriceForeignCurrency: oldRow.U_ForeCurr,
          mmrRate: oldRow.U_MmrRate,
          roRate: oldRow.U_RoRate,
          consumablesRate: oldRow.U_ConsRate,
          extraFactor: oldRow.U_Extra
        };
      }

      // Perform Update
      const pleSql = `
        UPDATE "aargit_ple1" SET
          "U_CustCode" = $1, "U_CustName" = $2, "U_ForgName" = $3, "U_CusApprF" = $4, "U_CastCode" = $5,
          "U_ItemDesc" = $6, "U_GrpName" = $7, "U_DomeExpo" = $8, "U_BoughJob" = $9, "U_CastWt" = $10,
          "U_CastRate" = $11, "U_CastPric" = $12, "U_RejCost" = $13, "U_PowdCoat" = $14, "U_SpecProc" = NULLIF($15, '')::double precision,
          "U_ProcMach" = $16, "U_TranChar" = $17, "U_OHP" = $18, "U_Packing" = NULLIF($19, '')::double precision, "U_ActCost" = NULLIF($20, '')::double precision,
          "U_FinPrice" = $21, "U_EffDateF" = $22, "U_EffDateT" = $23, "U_Status" = $24,
          "U_LessDome" = $25, "U_AsblyCst" = NULLIF($26, '')::double precision, "U_ExpPack" = $27, "U_FOBCost" = $28,
          "U_OHICCExp" = $29, "U_ExpoHead" = $30, "U_UnPriEx" = $31, "U_Forex" = $32,
          "U_ForeCurr" = $33,
          "U_MmrRate" = $36, "U_RoRate" = $37, "U_ConsRate" = $38, "U_Extra" = $39, "U_SpecCoat" = $40,
          "U_PowdCoatWt" = $41, "U_PowdCoatRate" = $42, "U_SpecProcWt" = $43, "U_SpecProcRate" = $44
        WHERE "DocEntry" = $34 AND TRIM("U_ItemNo") = $35
      `;
      const pleParams = [
        customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        itemDescription, groupName, exportDomestic, boughtOutJobWork, String(weight),
        String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating), String(specialProcess),
        String(process), String(transCharges), String(ohp), String(packing), String(totalWorkingCost),
        String(finalPrice), fromDate, toDate, 'Success',
        String(lessDomesticPacking), String(assemblyCost), String(exportPackingCost), String(fobCost),
        String(ohIccExport), String(addedExportOverheads), String(unitPriceExport), String(forex),
        String(unitPriceForeignCurrency), docEntry, cleanCode,
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating),
        powderCoatingWeight ? String(powderCoatingWeight) : null,
        powderCoatingRate ? String(powderCoatingRate) : null,
        specialProcessWeight ? String(specialProcessWeight) : null,
        specialProcessRate ? String(specialProcessRate) : null
      ];
      await query(pleSql, pleParams);
    } else {
      // Perform Insert
      const docEntryRes = await queryOne<{ max: string }>('SELECT COALESCE(MAX("DocEntry"), 0) as max FROM "aargit_ple1"');
      docEntry = parseInt(docEntryRes?.max || '0', 10) + 1;

      const pleInsertSql = `
        INSERT INTO "aargit_ple1" (
          "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
          "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_CastCode",
          "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
          "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
          "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
          "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
          "U_LessDome", "U_AsblyCst", "U_ExpPack", "U_FOBCost",
          "U_OHICCExp", "U_ExpoHead", "U_UnPriEx", "U_Forex", "U_ForeCurr",
          "U_MmrRate", "U_RoRate", "U_ConsRate", "U_Extra", "U_SpecCoat",
          "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate"
        ) VALUES (
          $1, 1, 0, 'OPLE', 0,
          $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          NULLIF($17, '')::double precision, $18, $19, $20, NULLIF($21, '')::double precision,
          NULLIF($22, '')::double precision, $23, $24, $25, $26,
          $27, NULLIF($28, '')::double precision, $29, $30,
          $31, $32, $33, $34, $35,
          $36, $37, $38, $39, $40,
          $41, $42, $43, $44
        )
      `;
      const pleInsertParams = [
        docEntry, customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        cleanCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        String(weight), String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating),
        String(specialProcess), String(process), String(transCharges), String(ohp), String(packing),
        String(totalWorkingCost), String(finalPrice), fromDate, toDate, 'Success',
        String(lessDomesticPacking), String(assemblyCost), String(exportPackingCost), String(fobCost),
        String(ohIccExport), String(addedExportOverheads), String(unitPriceExport), String(forex),
        String(unitPriceForeignCurrency),
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating),
        powderCoatingWeight ? String(powderCoatingWeight) : null,
        powderCoatingRate ? String(powderCoatingRate) : null,
        specialProcessWeight ? String(specialProcessWeight) : null,
        specialProcessRate ? String(specialProcessRate) : null
      ];
      await query(pleInsertSql, pleInsertParams);
    }

    // bpe table is not needed



    const newData = {
      customerName: customerName,
      validFrom: fromDate,
      validTo: toDate,
      weight, ratePerKg, powderCoating, specialProcess, rejectionCost, transCharges, ohp, packing, process, finalPrice,
      lessDomesticPacking, assemblyCost, exportPackingCost, fobCost, ohIccExport, addedExportOverheads,
      unitPriceExport, forex, unitPriceForeignCurrency,
      mmrRate, roRate, consumablesRate, extraFactor
    };
    await trackItemPriceHistory(cleanCode, 'Export', oldData, newData, updatedBy);
    await trackCustomerPricingHistory(
      cleanCode, customerCode, customerName, body.castingCode || '', itemDescription,
      body.grade || '', groupName, exportDomestic, customerApprovalFoundry,
      oldData, newData, updatedBy
    );
  } else if (isDomestic) {
    // Manage domestic rates inside argit_pld1 and aargit_bpe1
    const existingPld = await queryOne<{ DocEntry: string }>(
      'SELECT "DocEntry" FROM "argit_pld1" WHERE TRIM("U_ItemNo") = $1 AND TRIM("U_CustCode") = $2 ORDER BY "DocEntry"::bigint DESC LIMIT 1',
      [cleanCode, customerCode]
    );

    let docEntry = existingPld ? parseInt(existingPld.DocEntry || '0', 10) : 0;
    
    let oldData: any = null;

    if (existingPld) {
      const oldRow = await queryOne<any>(`SELECT * FROM "argit_pld1" WHERE "DocEntry" = $1`, [docEntry]);
      if (oldRow) {
        oldData = {
          customerName: oldRow.U_CustName,
          validFrom: oldRow.U_EffDateF,
          validTo: oldRow.U_EffDateT,
          weight: oldRow.U_CastWt,
          ratePerKg: oldRow.U_CastRate,
          powderCoating: oldRow.U_PowdCoat,
          specialProcess: oldRow.U_SpecProc,
          rejectionCost: oldRow.U_RejCost,
          transCharges: oldRow.U_TranChar,
          ohp: oldRow.U_OHP,
          packing: oldRow.U_Packing,
          process: oldRow.U_ProcMach,
          price: oldRow.U_FinPrice,
          mmrRate: oldRow.U_MmrRate,
          roRate: oldRow.U_RoRate,
          consumablesRate: oldRow.U_ConsRate,
          extraFactor: oldRow.U_Extra
        };
      }

      // Perform Update
      const pldSql = `
        UPDATE "argit_pld1" SET
          "U_CustCode" = $1, "U_CustName" = $2, "U_ForgName" = $3, "U_CusApprF" = $4, "U_CastCode" = $5,
          "U_ItemDesc" = $6, "U_GrpName" = $7, "U_DomeExpo" = $8, "U_BoughJob" = $9, "U_CastWt" = $10,
          "U_CastRate" = $11, "U_CastPric" = $12, "U_RejCost" = $13, "U_PowdCoat" = $14, "U_SpecProc" = $15,
          "U_ProcMach" = $16, "U_TranChar" = $17, "U_OHP" = $18, "U_Packing" = $19, "U_ActCost" = $20,
          "U_FinPrice" = $21, "U_EffDateF" = $22, "U_EffDateT" = $23, "U_Status" = $24,
          "U_MmrRate" = $27, "U_RoRate" = $28, "U_ConsRate" = $29, "U_Extra" = $30, "U_SpecCoat" = $31,
          "U_PowdCoatWt" = $32, "U_PowdCoatRate" = $33, "U_SpecProcWt" = $34, "U_SpecProcRate" = $35
        WHERE "DocEntry"::bigint = $25 AND TRIM("U_ItemNo") = $26
      `;
      const pldParams = [
        customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        itemDescription, groupName, exportDomestic, boughtOutJobWork, String(weight),
        String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating), String(specialProcess),
        String(process), String(transCharges), String(ohp), String(packing), String(totalWorkingCost),
        String(finalPrice), fromDate, toDate, 'Success',
        docEntry, cleanCode,
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating),
        powderCoatingWeight ? String(powderCoatingWeight) : null,
        powderCoatingRate ? String(powderCoatingRate) : null,
        specialProcessWeight ? String(specialProcessWeight) : null,
        specialProcessRate ? String(specialProcessRate) : null
      ];
      await query(pldSql, pldParams);
    } else {
      // Perform Insert
      const docEntryRes = await queryOne<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "argit_pld1"');
      docEntry = parseInt(docEntryRes?.max || '0', 10) + 1;

      const pldInsertSql = `
        INSERT INTO "argit_pld1" (
          "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
          "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_CastCode",
          "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
          "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
          "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
          "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
          "U_MmrRate", "U_RoRate", "U_ConsRate", "U_Extra", "U_SpecCoat",
          "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate"
        ) VALUES (
          $1, 1, 0, 'OPLD', 0,
          $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, 'Success',
          $26, $27, $28, $29, $30,
          $31, $32, $33, $34
        )
      `;
      const pldInsertParams = [
        String(docEntry), customerCode, customerName, foreignName, customerApprovalFoundry, body.castingCode || '',
        cleanCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        String(weight), String(ratePerKg), String(castingPrice), String(rejectionCost), String(powderCoating),
        String(specialProcess), String(process), String(transCharges), String(ohp), String(packing),
        String(totalWorkingCost), String(finalPrice), fromDate, toDate,
        String(mmrRate), String(roRate), String(consumablesRate), String(extraFactor), String(specialCoating),
        powderCoatingWeight ? String(powderCoatingWeight) : null,
        powderCoatingRate ? String(powderCoatingRate) : null,
        specialProcessWeight ? String(specialProcessWeight) : null,
        specialProcessRate ? String(specialProcessRate) : null
      ];
      await query(pldInsertSql, pldInsertParams);
    }

    // bpe table is not needed



    const newData = {
      customerName: customerName,
      validFrom: fromDate,
      validTo: toDate,
      weight, ratePerKg, powderCoating, specialProcess, rejectionCost, transCharges, ohp, packing, process, finalPrice,
      mmrRate, roRate, consumablesRate, extraFactor
    };
    await trackItemPriceHistory(cleanCode, 'Domestic', oldData, newData, updatedBy);
    await trackCustomerPricingHistory(
      cleanCode, customerCode, customerName, body.castingCode || '', itemDescription,
      body.grade || '', groupName, exportDomestic, customerApprovalFoundry,
      oldData, newData, updatedBy
    );
  }


  const vmGrade = body.grade || '';
  const vmCustomer = body.foreignName || body.customerName || 'All';
  const vmCasting = (body.castingCode || '').trim();
  
  // Update existing rows matching cleanCode, cleanCode + '-RM', or castingCode
  const codesToUpdate = [cleanCode, cleanCode + '-RM'];
  if (vmCasting) codesToUpdate.push(vmCasting);

  if (body.vendorId) {
    const updateRes = await query(`
      UPDATE vendor_materials SET
        rm_weight = $1,
        revised_rate_per_kg = $2,
        revised_price = $1::numeric * $2::numeric,
        updated_at = NOW()
      WHERE TRIM(vendor_id) = $3 AND TRIM(casting_code) = ANY($4)
      RETURNING *
    `, [weight, ratePerKg, body.vendorId.trim(), codesToUpdate]);

    // If no existing rows were updated, insert a new record under cleanCode + '-RM' (or castingCode)
    if (!updateRes || updateRes.length === 0) {
      const insertCode = vmCasting || (cleanCode + '-RM');
      await query(`
        INSERT INTO vendor_materials (vendor_id, grade, customer_name, casting_code, rm_weight, revised_rate_per_kg, revised_price, groupcode, groupname)
        SELECT $1, $2, $3, $4, $5, $6, $5::numeric * $6::numeric, o.groupcode, og.groupname
        FROM (SELECT $1::text as vendor_id) v
        LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
        LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)
        ON CONFLICT (vendor_id, grade, customer_name, casting_code) DO UPDATE SET
          rm_weight = EXCLUDED.rm_weight,
          revised_rate_per_kg = EXCLUDED.revised_rate_per_kg,
          revised_price = EXCLUDED.rm_weight * EXCLUDED.revised_rate_per_kg,
          updated_at = NOW()
      `, [body.vendorId.trim(), vmGrade.trim(), vmCustomer.trim(), insertCode.trim(), weight, ratePerKg]);
    }
  } else if (!customerCode) {
    // If no vendorId is provided AND this is not a customer update, update all vendors having this casting_code/item_code
    await query(`
      UPDATE vendor_materials SET
        rm_weight = $1,
        revised_rate_per_kg = $2,
        revised_price = $1::numeric * $2::numeric,
        updated_at = NOW()
      WHERE TRIM(casting_code) = ANY($3)
    `, [weight, ratePerKg, codesToUpdate]);
  }

  return getItemById(cleanCode);
}

export async function getBomAndRoute(itemCode: string): Promise<{ bom: any[], routeFlow: any[] }> {
  const sql = `
    WITH RECURSIVE bom_tree AS (
      SELECT 
        1 as level,
        father as parent_code,
        code as comp_code,
        quantity as qty,
        itemname as description,
        type as type,
        father || '->' || code as path
      FROM itt1_sftp
      WHERE TRIM(father) = $1
      
      UNION ALL
      
      SELECT 
        bt.level + 1,
        i.father,
        i.code,
        i.quantity,
        i.itemname,
        i.type,
        bt.path || '->' || i.code
      FROM itt1_sftp i
      INNER JOIN bom_tree bt ON TRIM(i.father) = TRIM(bt.comp_code)
    )
    SELECT * FROM bom_tree ORDER BY path;
  `;
  
  const rows = await query<any>(sql, [itemCode.trim()]);
  
  const routeFlow = [];
  const bom = [];
  
  // Anything with an OP code in comp_code is considered an operation/route stage
  // The lowest level items (leaves) are usually the raw materials (BOM)
  for (const row of rows) {
    if (row.comp_code.includes('.OP')) {
      routeFlow.push({
        seq: row.level * 10,
        opCode: row.comp_code.split('.').pop(), // e.g. OP10
        operationName: row.description?.trim() || '-',
        inhouseSubcon: 'In-house',
        workCenter: row.description?.trim() || '-',
        inItem: row.comp_code,
        outItem: row.parent_code
      });
    } else {
      bom.push({
        level: row.level,
        compCode: row.comp_code?.trim(),
        description: row.description?.trim(),
        itemType: row.type === '4' ? 'Raw Material' : 'Component',
        qty: row.qty,
        scrap: '0%' // Default scrap if not available
      });
    }
  }

  // Reverse routeFlow so OP10 comes first
  routeFlow.sort((a, b) => b.seq - a.seq);
  
  // Reassign sequence
  routeFlow.forEach((r, idx) => {
    r.seq = (idx + 1) * 10;
  });

  return { bom, routeFlow };
}

// ── Domestic bulk import into argit_pld1 ─────────────────────────────────────
export async function importDomesticPricingPld(rows: any[], updatedBy: string = 'System', importContext: string = 'Global'): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let successCount = 0;

  // 1. Gather all codes for batch lookups
  const itemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
  const customerCodes = Array.from(new Set(rows.map(r => String(r.customerCode || r['Customer Code'] || '').trim()).filter(Boolean)));

  const foundries = new Set<string>();
  rows.forEach(r => {
    const f1 = String(r.foundry1 || r['Foundry 1'] || '').trim();
    const f2 = String(r.foundry2 || r['Foundry 2'] || '').trim();
    const f3 = String(r.foundry3 || r['Foundry 3'] || '').trim();
    if (f1) foundries.add(f1.toLowerCase());
    if (f2) foundries.add(f2.toLowerCase());
    if (f3) foundries.add(f3.toLowerCase());
  });
  const foundryList = Array.from(foundries);

  // 2. Perform batch queries
  // 2. Perform batch queries
  const itemsRes = await query<{ itemcode: string; u_grade: string; u_castingcode: string }>('SELECT TRIM(itemcode) as itemcode, TRIM(u_grade) as u_grade, TRIM(u_castingcode) as u_castingcode FROM oitm_sftp WHERE TRIM(itemcode) = ANY($1)', [itemCodes]);
  const itemMap = new Map<string, { grade: string; castingCode: string }>();
  itemsRes.forEach(i => itemMap.set(i.itemcode, { grade: i.u_grade || '', castingCode: i.u_castingcode || '' }));

  const customersRes = customerCodes.length > 0
    ? await query<{ CardCode: string }>('SELECT TRIM(cardcode) as "CardCode" FROM ocrd_sftp WHERE cardtype = \'C\' AND TRIM(cardcode) = ANY($1)', [customerCodes])
    : [];
  const customerSet = new Set(customersRes.map(c => c.CardCode));

  const vendorsRes = foundryList.length > 0
    ? await query<{ CardCode: string; CardName: string }>(
        'SELECT TRIM(cardcode) as "CardCode", TRIM(cardname) as "CardName" FROM ocrd_sftp WHERE cardtype = \'S\' AND (LOWER(TRIM(cardcode)) = ANY($1) OR LOWER(TRIM(cardname)) = ANY($1))',
        [foundryList]
      )
    : [];
  const vendorCodeSet = new Set(vendorsRes.map(v => v.CardCode.toLowerCase()));
  const vendorNameSet = new Set(vendorsRes.map(v => v.CardName.toLowerCase()));

  // 3. Perform writes inside a single connection transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If context is CustomerList, delete any existing items for the imported customer(s) that are NOT in the Excel file
    if (importContext === 'CustomerList' && customerCodes.length > 0) {
      const importedItemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
      if (importedItemCodes.length > 0) {
        await client.query(
          'DELETE FROM "argit_pld1" WHERE "U_CustCode" = ANY($1) AND NOT ("U_ItemNo" = ANY($2))',
          [customerCodes, importedItemCodes]
        );
      }
    }

    // Check existing DocEntries in argit_pld1 for upsert
    const existingPldRes = await client.query<{ item_code: string; customer_code: string; DocEntry: string }>(
      'SELECT TRIM("U_ItemNo") as item_code, TRIM("U_CustCode") as customer_code, MAX("DocEntry"::bigint) as "DocEntry" FROM "argit_pld1" WHERE TRIM("U_ItemNo") = ANY($1) GROUP BY TRIM("U_ItemNo"), TRIM("U_CustCode")',
      [itemCodes]
    );
    const existingPldMap = new Map<string, number>();
    existingPldRes.rows.forEach((r: any) => existingPldMap.set(`${r.item_code}_${r.customer_code}`, parseInt(r.DocEntry || '0', 10)));

    const docEntryRes = await client.query<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "argit_pld1"');
    let maxDocEntry = parseInt(docEntryRes.rows[0]?.max || '0', 10);

    const pldRowsToInsert: any[] = [];
    const pldRowsToUpdate: any[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;
      const itemCode = String(row.itemCode || row['Item No'] || '').trim();
      const customerCode = String(row.customerCode || row['Customer Code'] || '').trim();
      const foundry1 = String(row.foundry1 || row['Foundry 1'] || '').trim();
      const foundry2 = String(row.foundry2 || row['Foundry 2'] || '').trim();
      const foundry3 = String(row.foundry3 || row['Foundry 3'] || '').trim();

      if (!itemCode && !customerCode) continue;
      if (!itemCode) { errors.push(`Row ${rowNum}: Item No is missing`); continue; }
      if (!itemMap.has(itemCode)) { errors.push(`Row ${rowNum}: Item No "${itemCode}" not found in SAP (oitm)`); continue; }
      const itemInfo = itemMap.get(itemCode)!;
      if (!itemInfo.castingCode || !itemInfo.grade) {
        const missing: string[] = [];
        if (!itemInfo.castingCode) missing.push('Casting Code');
        if (!itemInfo.grade) missing.push('Grade');
        errors.push(`Row ${rowNum} (Item ${itemCode}): Missing required ${missing.join(' and ')} in Item Master`);
        continue;
      }
      if (customerCode && !customerSet.has(customerCode)) { errors.push(`Row ${rowNum}: Customer Code "${customerCode}" not found in SAP (ocrd)`); continue; }

      const validateVendor = (vName: string, label: string) => {
        if (!vName) return true;
        const lowName = vName.toLowerCase();
        if (vendorCodeSet.has(lowName) || vendorNameSet.has(lowName)) return true;
        errors.push(`Row ${rowNum}: ${label} "${vName}" not found in SAP (ocrd)`);
        return false;
      };
      if (!validateVendor(foundry1, 'Foundry 1') || !validateVendor(foundry2, 'Foundry 2') || !validateVendor(foundry3, 'Foundry 3')) continue;

      const castingCode = String(row.castingCode || row['Casting Code'] || '').trim();
      const foreignName = String(row.foreignName || row['Foreign Name'] || '').trim();
      const customerName = String(row.customerName || row['Customer Name'] || '').trim();
      const customerApprovalFoundry = String(row.customerApprovalFoundry || row['Customer Approval Foundry'] || '').trim();
      const specialCoating = String(row.specialCoating || row['Special Coating'] || '').trim();
      const itemDescription = String(row.description || row['Item Description'] || '').trim();
      const groupName = String(row.itemGroup || row['Group Name'] || '').trim();
      const boughtOutJobWork = String(row.boughtOutJobWork || row['Bought Out/Job Work'] || '').trim();
      const exportDomestic = String(row.exportDomestic || row['Domestic/Export'] || '').trim();
      const weight = Number(row.weight || row['Casting Wt(Kg)']) || 0;
      const ratePerKg = Number(row.ratePerKg || row['Casting Rate/Kg (INR)']) || 0;
      const castingPrice = Number(row.castingPrice || row['Casting Price']) || (weight * ratePerKg);
      const rejectionPercent = Number(row['Rejection Percentage (%)']) || 0;
      const rejectionCost = rejectionPercent > 0 ? excelRound(castingPrice * rejectionPercent / 100) : (Number(row.rejectionCost || row['Rejection Cost']) || 0);
      const powderCoatingWt = row['Powder Coating Wt(Kg)'] !== undefined && row['Powder Coating Wt(Kg)'] !== null && row['Powder Coating Wt(Kg)'] !== '' ? Number(row['Powder Coating Wt(Kg)']) : weight;
      const powderCoatingRate = Number(row['Powder Coating Rate/Kg'] || row['Powder Coating Rate']) || 0;
      const powderCoating = powderCoatingRate > 0 ? excelRound(powderCoatingWt * powderCoatingRate) : (Number(row.powderCoating || row['Powder Coating']) || 0);
      const specialProcessWt = row['Special Process Wt(Kg)'] !== undefined && row['Special Process Wt(Kg)'] !== null && row['Special Process Wt(Kg)'] !== '' ? Number(row['Special Process Wt(Kg)']) : weight;
      const specialProcessRate = Number(row['Special Process Rate/Kg'] || row['Special Process Rate']) || 0;
      const specialProcess = specialProcessRate > 0 ? excelRound(specialProcessWt * specialProcessRate) : excelRound(Number(row.specialProcess || row['Special Process'] || 0));
      const process = Number(row.process || row['Process (Machining+others)']) || 0;
      const transCharges = Number(row.transCharges || row['Trans Charges']) || 0;
      const ohp = Number(row.ohp || row['OHP']) || 0;
      const packing = excelRound(Number(row.packing || row['Packing'] || 0));
      const totalWorkingCost = excelRound(Number(row.totalWorkingCost || row['Total Working Cost'] || 0)) || excelRound(rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing);
      const finalPrice = Number(row.finalPrice || row['Final Price']) || (castingPrice + totalWorkingCost);
      let fromDate = row.fromDate || row['From Date'] || null;
      let toDate = row.toDate || row['To Date'] || null;
      const quarterVal = row.quarter || row['Quarter'] || row['Quarter (Q1/Q2/Q3/Q4)'];
      const yearVal = row.year || row['Year'] || row['Year (YYYY)'];
      if (quarterVal || yearVal) {
        const parsedDates = parseQuarterAndYear(quarterVal, yearVal);
        if (parsedDates) { fromDate = parsedDates.fromDate; toDate = parsedDates.toDate; }
      }

      const existingDocEntry = existingPldMap.get(`${itemCode}_${customerCode}`);
      let docEntry: number;
      if (existingDocEntry) {
        docEntry = existingDocEntry;
        pldRowsToUpdate.push({
          docEntry, itemCode, customerCode, customerName, foreignName, customerApprovalFoundry, specialCoating, castingCode,
          itemDescription, groupName, exportDomestic, boughtOutJobWork,
          weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
          specialProcess, process, transCharges, ohp, packing, totalWorkingCost, finalPrice, fromDate, toDate,
          powderCoatingWeight: powderCoatingWt, powderCoatingRate: powderCoatingRate,
          specialProcessWeight: specialProcessWt, specialProcessRate: specialProcessRate
        });
      } else {
        maxDocEntry++;
        docEntry = maxDocEntry;
        pldRowsToInsert.push({
          docEntry, itemCode, customerCode, customerName, foreignName, customerApprovalFoundry, specialCoating, castingCode,
          itemDescription, groupName, exportDomestic, boughtOutJobWork,
          weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
          specialProcess, process, transCharges, ohp, packing, totalWorkingCost, finalPrice, fromDate, toDate,
          powderCoatingWeight: powderCoatingWt, powderCoatingRate: powderCoatingRate,
          specialProcessWeight: specialProcessWt, specialProcessRate: specialProcessRate
        });
      }



      successCount++;
    }

    // Execute bulk updates
    for (const r of pldRowsToUpdate) {
      await client.query(`
        UPDATE "argit_pld1" SET
          "U_CustCode"=$1, "U_CustName"=$2, "U_ForgName"=$3, "U_CusApprF"=$4, "U_SpecCoat"=$5, "U_CastCode"=$6,
          "U_ItemDesc"=$7, "U_GrpName" = $8, "U_DomeExpo" = $9, "U_BoughJob" = $10,
          "U_CastWt"=$11, "U_CastRate"=$12, "U_CastPric"=$13, "U_RejCost"=$14, "U_PowdCoat"=$15,
          "U_SpecProc"=$16, "U_ProcMach"=$17, "U_TranChar"=$18, "U_OHP"=$19, "U_Packing"=$20,
          "U_ActCost"=$21, "U_FinPrice"=$22, "U_EffDateF"=$23, "U_EffDateT"=$24, "U_Status"='Success',
          "U_PowdCoatWt"=$25, "U_PowdCoatRate"=$26, "U_SpecProcWt"=$27, "U_SpecProcRate"=$28
        WHERE "DocEntry"::bigint=$29 AND TRIM("U_ItemNo")=$30
      `, [
        r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry, r.specialCoating, r.castingCode,
        r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
        r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
        r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
        r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate,
        r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate,
        r.docEntry, r.itemCode
      ]);
    }

    // Execute bulk inserts
    if (pldRowsToInsert.length > 0) {
      for (const r of pldRowsToInsert) {
        await client.query(`
          INSERT INTO "argit_pld1" (
            "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
            "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_SpecCoat", "U_CastCode",
            "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
            "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
            "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
            "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
            "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate"
          ) VALUES (
            $1, 1, 0, 'OPLD', 0,
            $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22,
            $23, $24, $25, $26, 'Success',
            $27, $28, $29, $30
          )
        `, [
          r.docEntry, r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry, r.specialCoating, r.castingCode,
          r.itemCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
          r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
          r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
          r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate,
          r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate
        ]);
      }
    }

    // Log history for all updates & inserts
    for (const r of pldRowsToUpdate) {
      await logImportHistory(client, r, r.exportDomestic || 'Domestic', updatedBy);
    }
    for (const r of pldRowsToInsert) {
      await logImportHistory(client, r, r.exportDomestic || 'Domestic', updatedBy);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { success: errors.length === 0, count: successCount, errors };
}

async function bulkUpsertPle(client: any, pleRows: any[], existingPleMap: Map<string, number>) {
  if (pleRows.length === 0) return;

  const inserts = pleRows.filter(r => !existingPleMap.has(`${r.itemCode}_${r.customerCode}`));
  const updates = pleRows.filter(r => existingPleMap.has(`${r.itemCode}_${r.customerCode}`));

  // 1. Process Updates in bulk batches to minimize roundtrips and connection holding times
  if (updates.length > 0) {
    const batchSize = 100; // Small batch size to avoid placeholder limits
    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      const params = [];
      const valuePlaceholders = [];
      let pIdx = 1;

      for (const r of chunk) {

        valuePlaceholders.push(
          `($${pIdx++}::bigint, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}::double precision, $${pIdx++}::double precision)`
        );
        params.push(
          r.docEntry, r.itemCode, r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry,
          r.specialCoating, r.castingCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
          r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
          r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
          r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
          r.lessDomesticPacking, r.assemblyCost, r.exportPackingCost, r.fobCost,
          r.ohIccExport, r.addedExportOverheads, r.unitPriceExport, r.forex,
          r.unitPriceForeignCurrency,
          r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate
        );
      }

      const sql = `
        UPDATE "aargit_ple1" AS ple SET
          "U_CustCode" = val.customerCode,
          "U_CustName" = val.customerName,
          "U_ForgName" = val.foreignName,
          "U_CusApprF" = val.customerApprovalFoundry,
          "U_SpecCoat" = val.specialCoating,
          "U_CastCode" = val.castingCode,
          "U_ItemDesc" = val.itemDescription,
          "U_GrpName" = val.groupName,
          "U_DomeExpo" = val.exportDomestic,
          "U_BoughJob" = val.boughtOutJobWork,
          "U_CastWt" = val.weight,
          "U_CastRate" = val.ratePerKg,
          "U_CastPric" = val.castingPrice,
          "U_RejCost" = val.rejectionCost,
          "U_PowdCoat" = val.powderCoating,
          "U_SpecProc" = val.specialProcess,
          "U_ProcMach" = val.process,
          "U_TranChar" = val.transCharges,
          "U_OHP" = val.ohp,
          "U_Packing" = val.packing,
          "U_ActCost" = val.totalWorkingCost,
          "U_FinPrice" = val.finalPrice,
          "U_EffDateF" = val.fromDate,
          "U_EffDateT" = val.toDate,
          "U_Status" = val.status,
          "U_LessDome" = val.lessDomesticPacking,
          "U_AsblyCst" = val.assemblyCost,
          "U_ExpPack" = val.exportPackingCost,
          "U_FOBCost" = val.fobCost,
          "U_OHICCExp" = val.ohIccExport,
          "U_ExpoHead" = val.addedExportOverheads,
          "U_UnPriEx" = val.unitPriceExport,
          "U_Forex" = val.forex,
          "U_ForeCurr" = val.unitPriceForeignCurrency,
          "U_PowdCoatWt" = val.powderCoatingWeight,
          "U_PowdCoatRate" = val.powderCoatingRate,
          "U_SpecProcWt" = val.specialProcessWeight,
          "U_SpecProcRate" = val.specialProcessRate
        FROM (VALUES ${valuePlaceholders.join(',')}) AS val(
          docEntry, itemCode, customerCode, customerName, foreignName, customerApprovalFoundry,
          specialCoating, castingCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
          weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
          specialProcess, process, transCharges, ohp, packing,
          totalWorkingCost, finalPrice, fromDate, toDate, status,
          lessDomesticPacking, assemblyCost, exportPackingCost, fobCost,
          ohIccExport, addedExportOverheads, unitPriceExport, forex,
          unitPriceForeignCurrency,
          powderCoatingWeight, powderCoatingRate, specialProcessWeight, specialProcessRate
        )
        WHERE ple."DocEntry" = val.docEntry AND TRIM(ple."U_ItemNo") = val.itemCode
      `;
      await client.query(sql, params);
    }
  }

  // 2. Process Inserts
  if (inserts.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < inserts.length; i += batchSize) {
      const chunk = inserts.slice(i, i + batchSize);
      const valuePlaceholders = [];
      const params = [];
      let pIdx = 1;
      for (const r of chunk) {
        const rowPlaceholders = [];
        for (let c = 0; c < 44; c++) {
          rowPlaceholders.push(`$${pIdx++}`);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(',')})`);
        params.push(
          r.docEntry, r.lineId, r.visOrder, r.object, r.logInst,
          r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry, r.specialCoating, r.castingCode,
          r.itemCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
          r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
          r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
          r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
          r.lessDomesticPacking, r.assemblyCost, r.exportPackingCost, r.fobCost,
          r.ohIccExport, r.addedExportOverheads, r.unitPriceExport, r.forex,
          r.unitPriceForeignCurrency,
          r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate
        );
      }

      const sql = `
        INSERT INTO "aargit_ple1" (
          "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
          "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_SpecCoat", "U_CastCode",
          "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
          "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
          "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
          "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
          "U_LessDome", "U_AsblyCst", "U_ExpPack", "U_FOBCost",
          "U_OHICCExp", "U_ExpoHead", "U_UnPriEx", "U_Forex", "U_ForeCurr",
          "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate"
        ) VALUES ${valuePlaceholders.join(',')}
      `;
      await client.query(sql, params);
    }
  }
}



export async function importDomesticPricing(rows: any[], updatedBy: string = 'System', importContext: string = 'Global'): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let successCount = 0;

  // 1. Gather all codes for batch lookups
  const itemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
  const customerCodes = Array.from(new Set(rows.map(r => String(r.customerCode || r['Customer Code'] || '').trim()).filter(Boolean)));
  
  const foundries = new Set<string>();
  rows.forEach(r => {
    const f1 = String(r.foundry1 || r['Foundry 1'] || '').trim();
    const f2 = String(r.foundry2 || r['Foundry 2'] || '').trim();
    const f3 = String(r.foundry3 || r['Foundry 3'] || '').trim();
    if (f1) foundries.add(f1.toLowerCase());
    if (f2) foundries.add(f2.toLowerCase());
    if (f3) foundries.add(f3.toLowerCase());
  });
  const foundryList = Array.from(foundries);

  // 2. Perform batch queries
  const itemsRes = await query<{ itemcode: string; u_grade: string; u_castingcode: string }>('SELECT TRIM(itemcode) as itemcode, TRIM(u_grade) as u_grade, TRIM(u_castingcode) as u_castingcode FROM oitm_sftp WHERE TRIM(itemcode) = ANY($1)', [itemCodes]);
  const itemMap = new Map<string, { grade: string; castingCode: string }>();
  itemsRes.forEach(i => itemMap.set(i.itemcode, { grade: i.u_grade || '', castingCode: i.u_castingcode || '' }));

  const customersRes = customerCodes.length > 0 
    ? await query<{ CardCode: string }>('SELECT TRIM(cardcode) as "CardCode" FROM ocrd_sftp WHERE cardtype = \'C\' AND TRIM(cardcode) = ANY($1)', [customerCodes])
    : [];
  const customerSet = new Set(customersRes.map(c => c.CardCode));

  const vendorsRes = foundryList.length > 0
    ? await query<{ CardCode: string; CardName: string }>(
        'SELECT TRIM(cardcode) as "CardCode", TRIM(cardname) as "CardName" FROM ocrd_sftp WHERE cardtype = \'S\' AND (LOWER(TRIM(cardcode)) = ANY($1) OR LOWER(TRIM(cardname)) = ANY($1))', 
        [foundryList]
      )
    : [];
  
  const vendorCodeSet = new Set(vendorsRes.map(v => v.CardCode.toLowerCase()));
  const vendorNameSet = new Set(vendorsRes.map(v => v.CardName.toLowerCase()));

  // 3. Perform writes inside a single connection transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If context is CustomerList, delete any existing items for the imported customer(s) that are NOT in the Excel file
    if (importContext === 'CustomerList' && customerCodes.length > 0) {
      const importedItemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
      if (importedItemCodes.length > 0) {
        await client.query(
          'DELETE FROM "aargit_ple1" WHERE "U_CustCode" = ANY($1) AND NOT ("U_ItemNo" = ANY($2))',
          [customerCodes, importedItemCodes]
        );
      }
    }

    // Get all existing DocEntries for batch upsert checking of imported item codes only
    const existingPleRes = await client.query<{ item_code: string; customer_code: string; DocEntry: string }>(
      'SELECT TRIM("U_ItemNo") as item_code, TRIM("U_CustCode") as customer_code, MAX("DocEntry"::bigint) as "DocEntry" FROM "aargit_ple1" WHERE TRIM("U_ItemNo") = ANY($1) GROUP BY TRIM("U_ItemNo"), TRIM("U_CustCode")',
      [itemCodes]
    );
    const existingPleMap = new Map<string, number>();
    existingPleRes.rows.forEach((r: any) => existingPleMap.set(`${r.item_code}_${r.customer_code}`, parseInt(r.DocEntry || '0', 10)));

    // Get max RowNum & DocEntry
    const docEntryRes = await client.query<{ max: string }>('SELECT COALESCE(MAX("DocEntry"), 0) as max FROM "aargit_ple1"');
    let maxDocEntry = parseInt(docEntryRes.rows[0]?.max || '0', 10);

    const pleRowsToInsert: any[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;
      const itemCode = String(row.itemCode || row['Item No'] || '').trim();
      const customerCode = String(row.customerCode || row['Customer Code'] || '').trim();
      const foundry1 = String(row.foundry1 || row['Foundry 1'] || '').trim();
      const foundry2 = String(row.foundry2 || row['Foundry 2'] || '').trim();
      const foundry3 = String(row.foundry3 || row['Foundry 3'] || '').trim();

      if (!itemCode && !customerCode) continue;
      if (!itemCode) {
        errors.push(`Row ${rowNum}: Item No is missing`);
        continue;
      }

      if (!itemMap.has(itemCode)) {
        errors.push(`Row ${rowNum}: Item No "${itemCode}" not found in SAP (oitm)`);
        continue;
      }
      const itemInfo = itemMap.get(itemCode)!;
      if (!itemInfo.castingCode || !itemInfo.grade) {
        const missing: string[] = [];
        if (!itemInfo.castingCode) missing.push('Casting Code');
        if (!itemInfo.grade) missing.push('Grade');
        errors.push(`Row ${rowNum} (Item ${itemCode}): Missing required ${missing.join(' and ')} in Item Master`);
        continue;
      }

      if (customerCode && !customerSet.has(customerCode)) {
        errors.push(`Row ${rowNum}: Customer Code "${customerCode}" not found in SAP (ocrd)`);
        continue;
      }

      const validateVendor = (vName: string, label: string) => {
        if (!vName) return true;
        const lowName = vName.toLowerCase();
        if (vendorCodeSet.has(lowName) || vendorNameSet.has(lowName)) return true;
        errors.push(`Row ${rowNum}: ${label} "${vName}" not found in SAP (ocrd)`);
        return false;
      };

      if (!validateVendor(foundry1, 'Foundry 1') || !validateVendor(foundry2, 'Foundry 2') || !validateVendor(foundry3, 'Foundry 3')) {
        continue;
      }

      const castingCode = String(row.castingCode || row['Casting Code'] || '').trim();
      const foreignName = String(row.foreignName || row['Foreign Name'] || '').trim();
      const customerName = String(row.customerName || row['Customer Name'] || '').trim();
      const customerApprovalFoundry = String(row.customerApprovalFoundry || row['Customer Approval Foundry'] || '').trim();
      const specialCoating = String(row.specialCoating || row['Special Coating'] || '').trim();
      const itemDescription = String(row.description || row['Item Description'] || '').trim();
      const groupName = String(row.itemGroup || row['Group Name'] || '').trim();
      const boughtOutJobWork = String(row.boughtOutJobWork || row['Bought Out/Job Work'] || '').trim();
      const exportDomestic = String(row.exportDomestic || row['Domestic/Export'] || '').trim();
      const weight = Number(row.weight || row['Casting Wt(Kg)']) || 0;
      const ratePerKg = Number(row.ratePerKg || row['Casting Rate/Kg (INR)']) || 0;
      const castingPrice = Number(row.castingPrice || row['Casting Price']) || (weight * ratePerKg);
      const rejectionPercent = Number(row['Rejection Percentage (%)']) || 0;
      const rejectionCost = rejectionPercent > 0 ? excelRound(castingPrice * rejectionPercent / 100) : (Number(row.rejectionCost || row['Rejection Cost']) || 0);
      const powderCoatingWt = row['Powder Coating Wt(Kg)'] !== undefined && row['Powder Coating Wt(Kg)'] !== null && row['Powder Coating Wt(Kg)'] !== '' ? Number(row['Powder Coating Wt(Kg)']) : weight;
      const powderCoatingRate = Number(row['Powder Coating Rate/Kg'] || row['Powder Coating Rate']) || 0;
      const powderCoating = powderCoatingRate > 0 ? excelRound(powderCoatingWt * powderCoatingRate) : (Number(row.powderCoating || row['Powder Coating']) || 0);
      const specialProcessWt = row['Special Process Wt(Kg)'] !== undefined && row['Special Process Wt(Kg)'] !== null && row['Special Process Wt(Kg)'] !== '' ? Number(row['Special Process Wt(Kg)']) : weight;
      const specialProcessRate = Number(row['Special Process Rate/Kg'] || row['Special Process Rate']) || 0;
      const specialProcess = specialProcessRate > 0 ? excelRound(specialProcessWt * specialProcessRate) : excelRound(Number(row.specialProcess || row['Special Process'] || 0));
      const process = Number(row.process || row['Process (Machining+others)']) || 0;
      const transCharges = Number(row.transCharges || row['Trans Charges']) || 0;
      const ohp = Number(row.ohp || row['OHP']) || 0;
      const packing = excelRound(Number(row.packing || row['Packing'] || 0));
      const totalWorkingCost = excelRound(Number(row.totalWorkingCost || row['Total Working Cost'] || 0)) || excelRound(rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing);
      const finalPrice = Number(row.finalPrice || row['Final Price']) || (castingPrice + totalWorkingCost);
      let fromDate = row.fromDate || row['From Date'] || null;
      let toDate = row.toDate || row['To Date'] || null;
      const quarterVal = row.quarter || row['Quarter'] || row['Quarter (Q1/Q2/Q3/Q4)'];
      const yearVal = row.year || row['Year'] || row['Year (YYYY)'];
      if (quarterVal || yearVal) {
        const parsedDates = parseQuarterAndYear(quarterVal, yearVal);
        if (parsedDates) {
          fromDate = parsedDates.fromDate;
          toDate = parsedDates.toDate;
        }
      }

      // Export columns parsing & auto-calculations
      const lessDomesticPacking = Number(row.lessDomesticPacking || row['Less Domestic Packing (if BTPL Code)']) || 0;
      const assemblyCost = Number(row.assemblyCost || row['Assembly Cost']) || 0;
      const exportPackingCost = row.exportPackingCost || row['Export Packing cost'] || row['Export Packing Cost'] || '';
      const fobCost = Number(row.fobCost || row['FOB Cost/piece'] || row['FOB Cost']) || 0;
      const ohIccExport = Number(row.ohIccExport || row['OH & ICC on Export'] || row['OH & ICC (Export)']) || 0;
      const addedExportOverheads = Number(row.addedExportOverheads || row['Added Export over Heads'] || row['Added Export Overheads']) || 0;
      const forex = Number(row.forex || row['Forex']) || 0;

      const unitPriceExportVal = finalPrice - lessDomesticPacking + assemblyCost + Number(exportPackingCost || 0) + fobCost + ohIccExport + addedExportOverheads;
      const unitPriceExport = String(row.unitPriceExport || row['Unit Price for Export'] || row['Unit Price (Export)'] || Number(unitPriceExportVal).toFixed(2));
      
      const unitPriceForeignCurrencyVal = forex > 0 ? (Number(unitPriceExport) / forex) : 0;
      const unitPriceForeignCurrency = String(row.unitPriceForeignCurrency || row['Unit Price in Foreign Currency'] || row['Unit Price (Foreign Currency)'] || (unitPriceForeignCurrencyVal > 0 ? unitPriceForeignCurrencyVal.toFixed(4) : ''));

      let docEntry = existingPleMap.get(`${itemCode}_${customerCode}`);
      if (!docEntry) {
        maxDocEntry++;
        docEntry = maxDocEntry;
      }

      pleRowsToInsert.push({
        docEntry, lineId: 1, visOrder: 0, object: 'OPLE', logInst: 0,
        customerCode, customerName, foreignName, customerApprovalFoundry, specialCoating, castingCode,
        itemCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
        specialProcess, process, transCharges, ohp, packing,
        totalWorkingCost, finalPrice, fromDate, toDate, status: 'Success',
        lessDomesticPacking, assemblyCost, exportPackingCost, fobCost,
        ohIccExport, addedExportOverheads, unitPriceExport, forex,
        unitPriceForeignCurrency,
        powderCoatingWeight: powderCoatingWt,
        powderCoatingRate: powderCoatingRate,
        specialProcessWeight: specialProcessWt,
        specialProcessRate: specialProcessRate
      });

      // bpe table is not needed

      successCount++;
    }

    // Execute bulk writes
    await bulkUpsertPle(client, pleRowsToInsert, existingPleMap);

    // Log history for all imported rows
    for (const r of pleRowsToInsert) {
      await logImportHistory(client, r, r.exportDomestic || 'Export', updatedBy);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { success: errors.length === 0, count: successCount, errors };
}

export async function importLabourPricing(rows: any[], updatedBy: string = 'System', importContext: string = 'Global'): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let successCount = 0;

  // 1. Gather all codes for batch lookups
  const itemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
  const customerCodes = Array.from(new Set(rows.map(r => String(r.customerCode || r['Customer Code'] || '').trim()).filter(Boolean)));

  // 2. Perform batch queries
  const itemsRes = await query<{ itemcode: string; u_grade: string; u_castingcode: string }>('SELECT TRIM(itemcode) as itemcode, TRIM(u_grade) as u_grade, TRIM(u_castingcode) as u_castingcode FROM oitm_sftp WHERE TRIM(itemcode) = ANY($1)', [itemCodes]);
  const itemMap = new Map<string, { grade: string; castingCode: string }>();
  itemsRes.forEach(i => itemMap.set(i.itemcode, { grade: i.u_grade || '', castingCode: i.u_castingcode || '' }));

  const customersRes = customerCodes.length > 0 
    ? await query<{ CardCode: string }>('SELECT TRIM(cardcode) as "CardCode" FROM ocrd_sftp WHERE cardtype = \'C\' AND TRIM(cardcode) = ANY($1)', [customerCodes])
    : [];
  const customerSet = new Set(customersRes.map(c => c.CardCode));

  // 3. Perform writes inside a single connection transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If context is CustomerList, delete any existing items for the imported customer(s) that are NOT in the Excel file
    if (importContext === 'CustomerList' && customerCodes.length > 0) {
      const importedItemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
      if (importedItemCodes.length > 0) {
        await client.query(
          'DELETE FROM "argit_pll1" WHERE "U_CustCode" = ANY($1) AND NOT ("U_ItemNo" = ANY($2))',
          [customerCodes, importedItemCodes]
        );
      }
    }

    // Get all existing DocEntries for batch upsert checking of imported item codes only
    const existingPllRes = await client.query<{ item_code: string; DocEntry: string }>(
      'SELECT TRIM("U_ItemNo") as item_code, "DocEntry" FROM "argit_pll1" WHERE TRIM("U_ItemNo") = ANY($1)',
      [itemCodes]
    );
    const existingPllMap = new Map<string, number>();
    existingPllRes.rows.forEach((r: any) => existingPllMap.set(r.item_code, parseInt(r.DocEntry || '0', 10)));

    // Get max DocEntry
    const docEntryRes = await client.query<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "argit_pll1"');
    let maxDocEntry = parseInt(docEntryRes.rows[0]?.max || '0', 10);

    const pllRowsToInsert: any[] = [];
    const pllRowsToUpdate: any[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;
      const itemCode = String(row.itemCode || row['Item No'] || '').trim();
      const customerCode = String(row.customerCode || row['Customer Code'] || '').trim();

      if (!itemCode && !customerCode) continue;
      if (!itemCode) {
        errors.push(`Row ${rowNum}: Item No is missing`);
        continue;
      }

      if (!itemMap.has(itemCode)) {
        errors.push(`Row ${rowNum}: Item No "${itemCode}" not found in SAP (oitm)`);
        continue;
      }
      const itemInfo = itemMap.get(itemCode)!;
      if (!itemInfo.castingCode || !itemInfo.grade) {
        const missing: string[] = [];
        if (!itemInfo.castingCode) missing.push('Casting Code');
        if (!itemInfo.grade) missing.push('Grade');
        errors.push(`Row ${rowNum} (Item ${itemCode}): Missing required ${missing.join(' and ')} in Item Master`);
        continue;
      }

      if (customerCode && !customerSet.has(customerCode)) {
        errors.push(`Row ${rowNum}: Customer Code "${customerCode}" not found in SAP (ocrd)`);
        continue;
      }

      const castingCode = String(row.castingCode || row['Casting Code'] || '').trim();
      const foreignName = String(row.foreignName || row['Foreign Name'] || '').trim();
      const customerName = String(row.customerName || row['Customer Name'] || '').trim();
      const customerApprovalFoundry = String(row.customerApprovalFoundry || row['Customer Approval Foundry'] || '').trim();
      const specialCoating = String(row.specialCoating || row['Special Coating'] || '').trim();
      const itemDescription = String(row.description || row['Item Description'] || '').trim();
      const groupName = String(row.itemGroup || row['Group Name'] || '').trim();
      const boughtOutJobWork = String(row.boughtOutJobWork || row['Bought Out/Job Work'] || 'Job Work').trim();
      const exportDomestic = String(row.exportDomestic || row['Domestic/Export'] || 'Domestic').trim();
      
      const weight = Number(row.weight || row['Casting Wt(Kg)']) || 0;
      const ratePerKg = Number(row.ratePerKg || row['Casting Rate/Kg (INR)']) || 0;
      const castingPrice = Number(row.castingPrice || row['Casting Price']) || (weight * ratePerKg);
      const rejectionPercent = Number(row['Rejection Percentage (%)']) || 0;
      const rejectionCost = rejectionPercent > 0 ? excelRound(castingPrice * rejectionPercent / 100) : (Number(row.rejectionCost || row['Rejection Cost']) || 0);
      const powderCoatingWt = row['Powder Coating Wt(Kg)'] !== undefined && row['Powder Coating Wt(Kg)'] !== null && row['Powder Coating Wt(Kg)'] !== '' ? Number(row['Powder Coating Wt(Kg)']) : weight;
      const powderCoatingRate = Number(row['Powder Coating Rate/Kg'] || row['Powder Coating Rate']) || 0;
      const powderCoating = powderCoatingRate > 0 ? excelRound(powderCoatingWt * powderCoatingRate) : (Number(row.powderCoating || row['Powder Coating']) || 0);
      const specialProcessWt = row['Special Process Wt(Kg)'] !== undefined && row['Special Process Wt(Kg)'] !== null && row['Special Process Wt(Kg)'] !== '' ? Number(row['Special Process Wt(Kg)']) : weight;
      const specialProcessRate = Number(row['Special Process Rate/Kg'] || row['Special Process Rate']) || 0;
      const specialProcess = specialProcessRate > 0 ? excelRound(specialProcessWt * specialProcessRate) : excelRound(Number(row.specialProcess || row['Special Process'] || 0));
      const process = Number(row.process || row['Process (Machining+others)']) || 0;
      const transCharges = Number(row.transCharges || row['Trans Charges']) || 0;
      const ohp = Number(row.ohp || row['OHP']) || 0;
      const packing = excelRound(Number(row.packing || row['Packing'] || 0));
      const totalWorkingCost = excelRound(Number(row.totalWorkingCost || row['Total Working Cost'] || 0)) || excelRound(rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing);
      const finalPrice = Number(row.finalPrice || row['Final Price']) || (castingPrice + totalWorkingCost);
      let fromDate = row.fromDate || row['From Date'] || null;
      let toDate = row.toDate || row['To Date'] || null;
      const quarterVal = row.quarter || row['Quarter'] || row['Quarter (Q1/Q2/Q3/Q4)'];
      const yearVal = row.year || row['Year'] || row['Year (YYYY)'];
      if (quarterVal || yearVal) {
        const parsedDates = parseQuarterAndYear(quarterVal, yearVal);
        if (parsedDates) {
          fromDate = parsedDates.fromDate;
          toDate = parsedDates.toDate;
        }
      }

      let docEntry = existingPllMap.get(itemCode);
      const isUpdate = !!docEntry;
      if (!docEntry) {
        maxDocEntry++;
        docEntry = maxDocEntry;
      }

      const itemRecord = {
        docEntry: String(docEntry),
        customerCode, customerName, foreignName, customerApprovalFoundry, specialCoating, castingCode,
        itemCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        weight: String(weight), ratePerKg: String(ratePerKg), castingPrice: String(castingPrice), 
        rejectionCost: String(rejectionCost), powderCoating: String(powderCoating),
        specialProcess: String(specialProcess), process: String(process), transCharges: String(transCharges), 
        ohp: String(ohp), packing: String(packing),
        totalWorkingCost: String(totalWorkingCost), finalPrice: String(finalPrice), 
        fromDate, toDate, status: 'Success',
        powderCoatingWeight: String(powderCoatingWt),
        powderCoatingRate: String(powderCoatingRate),
        specialProcessWeight: String(specialProcessWt),
        specialProcessRate: String(specialProcessRate)
      };

      if (isUpdate) {
        pllRowsToUpdate.push(itemRecord);
      } else {
        pllRowsToInsert.push(itemRecord);
      }

      successCount++;
    }

    // Execute bulk updates in batches
    if (pllRowsToUpdate.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < pllRowsToUpdate.length; i += batchSize) {
        const chunk = pllRowsToUpdate.slice(i, i + batchSize);
        const params = [];
        const valuePlaceholders = [];
        let pIdx = 1;

        for (const r of chunk) {
          valuePlaceholders.push(
            `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
          );
          params.push(
            r.docEntry, r.itemCode, r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry,
            r.specialCoating, r.castingCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
            r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
            r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
            r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
            r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate
          );
        }

        const sql = `
          UPDATE "argit_pll1" AS pll SET
            "U_CustCode" = val.customerCode,
            "U_CustName" = val.customerName,
            "U_ForgName" = val.foreignName,
            "U_CusApprF" = val.customerApprovalFoundry,
            "U_SpecCoat" = val.specialCoating,
            "U_CastCode" = val.castingCode,
            "U_ItemDesc" = val.itemDescription,
            "U_GrpName" = val.groupName,
            "U_DomeExpo" = val.exportDomestic,
            "U_BoughJob" = val.boughtOutJobWork,
            "U_CastWt" = val.weight,
            "U_CastRate" = val.ratePerKg,
            "U_CastPric" = val.castingPrice,
            "U_RejCost" = val.rejectionCost,
            "U_PowdCoat" = val.powderCoating,
            "U_SpecProc" = val.specialProcess,
            "U_ProcMach" = val.process,
            "U_TranChar" = val.transCharges,
            "U_OHP" = val.ohp,
            "U_Packing" = val.packing,
            "U_ActCost" = val.totalWorkingCost,
            "U_FinPrice" = val.finalPrice,
            "U_EffDateF" = val.fromDate,
            "U_EffDateT" = val.toDate,
            "U_Status" = val.status,
            "U_PowdCoatWt" = val.powderCoatingWeight,
            "U_PowdCoatRate" = val.powderCoatingRate,
            "U_SpecProcWt" = val.specialProcessWeight,
            "U_SpecProcRate" = val.specialProcessRate
          FROM (VALUES ${valuePlaceholders.join(',')}) AS val(
            docEntry, itemCode, customerCode, customerName, foreignName, customerApprovalFoundry,
            specialCoating, castingCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
            weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
            specialProcess, process, transCharges, ohp, packing,
            totalWorkingCost, finalPrice, fromDate, toDate, status,
            powderCoatingWeight, powderCoatingRate, specialProcessWeight, specialProcessRate
          )
          WHERE pll."DocEntry" = val.docEntry AND TRIM(pll."U_ItemNo") = val.itemCode
        `;
        await client.query(sql, params);
      }
    }

    // Execute bulk inserts
    if (pllRowsToInsert.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < pllRowsToInsert.length; i += batchSize) {
        const chunk = pllRowsToInsert.slice(i, i + batchSize);
        const valuePlaceholders = [];
        const params = [];
        let pIdx = 1;
        for (const r of chunk) {
          const rowPlaceholders = [];
          for (let c = 0; c < 35; c++) {
            rowPlaceholders.push(`$${pIdx++}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(',')})`);
          params.push(
            r.docEntry, '1', '0', 'OPLE', '0',
            r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry, r.specialCoating, r.castingCode,
            r.itemCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
            r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
            r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
            r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
            r.powderCoatingWeight, r.powderCoatingRate, r.specialProcessWeight, r.specialProcessRate
          );
        }

        const sql = `
          INSERT INTO "argit_pll1" (
            "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
            "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_SpecCoat", "U_CastCode",
            "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
            "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
            "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
            "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
            "U_PowdCoatWt", "U_PowdCoatRate", "U_SpecProcWt", "U_SpecProcRate"
          ) VALUES ${valuePlaceholders.join(',')}
        `;
        await client.query(sql, params);
      }
    }

    // Log history for all updates & inserts
    for (const r of pllRowsToUpdate) {
      await logImportHistory(client, r, r.exportDomestic || 'Labour', updatedBy);
    }
    for (const r of pllRowsToInsert) {
      await logImportHistory(client, r, r.exportDomestic || 'Labour', updatedBy);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { success: errors.length === 0, count: successCount, errors };
}

export async function importPinPricing(rows: any[], updatedBy: string = 'System', importContext: string = 'Global'): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let successCount = 0;

  // 1. Gather all codes for batch lookups
  const itemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
  const customerCodes = Array.from(new Set(rows.map(r => String(r.customerCode || r['Customer Code'] || '').trim()).filter(Boolean)));
  
  const foundries = new Set<string>();
  rows.forEach(r => {
    const f1 = String(r.foundry1 || r['Foundry 1'] || '').trim();
    const f2 = String(r.foundry2 || r['Foundry 2'] || '').trim();
    const f3 = String(r.foundry3 || r['Foundry 3'] || '').trim();
    if (f1) foundries.add(f1.toLowerCase());
    if (f2) foundries.add(f2.toLowerCase());
    if (f3) foundries.add(f3.toLowerCase());
  });
  const foundryList = Array.from(foundries);

  // 2. Perform batch queries
  const itemsRes = await query<{ itemcode: string; u_grade: string; u_castingcode: string }>('SELECT TRIM(itemcode) as itemcode, TRIM(u_grade) as u_grade, TRIM(u_castingcode) as u_castingcode FROM oitm_sftp WHERE TRIM(itemcode) = ANY($1)', [itemCodes]);
  const itemMap = new Map<string, { grade: string; castingCode: string }>();
  itemsRes.forEach(i => itemMap.set(i.itemcode, { grade: i.u_grade || '', castingCode: i.u_castingcode || '' }));

  const customersRes = customerCodes.length > 0 
    ? await query<{ CardCode: string }>('SELECT TRIM(cardcode) as "CardCode" FROM ocrd_sftp WHERE cardtype = \'C\' AND TRIM(cardcode) = ANY($1)', [customerCodes])
    : [];
  const customerSet = new Set(customersRes.map(c => c.CardCode));

  const vendorsRes = foundryList.length > 0
    ? await query<{ CardCode: string; CardName: string }>(
        'SELECT TRIM(cardcode) as "CardCode", TRIM(cardname) as "CardName" FROM ocrd_sftp WHERE cardtype = \'S\' AND (LOWER(TRIM(cardcode)) = ANY($1) OR LOWER(TRIM(cardname)) = ANY($1))', 
        [foundryList]
      )
    : [];
  
  const vendorCodeSet = new Set(vendorsRes.map(v => v.CardCode.toLowerCase()));
  const vendorNameSet = new Set(vendorsRes.map(v => v.CardName.toLowerCase()));

  // 3. Perform writes inside a single connection transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If context is CustomerList, delete any existing items for the imported customer(s) that are NOT in the Excel file
    if (importContext === 'CustomerList' && customerCodes.length > 0) {
      const importedItemCodes = Array.from(new Set(rows.map(r => String(r.itemCode || r['Item No'] || '').trim()).filter(Boolean)));
      if (importedItemCodes.length > 0) {
        await client.query(
          'DELETE FROM "aargit_plp1" WHERE "U_CustCode" = ANY($1) AND NOT ("U_ItemNo" = ANY($2))',
          [customerCodes, importedItemCodes]
        );
      }
    }

    // Get all existing DocEntries for batch upsert checking of imported item codes only
    const existingPlpRes = await client.query<{ item_code: string; customer_code: string; DocEntry: string }>(
      'SELECT TRIM("U_ItemNo") as item_code, TRIM("U_CustCode") as customer_code, MAX("DocEntry"::bigint) as "DocEntry" FROM "aargit_plp1" WHERE TRIM("U_ItemNo") = ANY($1) GROUP BY TRIM("U_ItemNo"), TRIM("U_CustCode")',
      [itemCodes]
    );
    const existingPlpMap = new Map<string, number>();
    existingPlpRes.rows.forEach((r: any) => existingPlpMap.set(`${r.item_code}_${r.customer_code}`, parseInt(r.DocEntry || '0', 10)));

    // Get max DocEntry
    const docEntryRes = await client.query<{ max: string }>('SELECT COALESCE(MAX("DocEntry"::bigint), 0) as max FROM "aargit_plp1"');
    let maxDocEntry = parseInt(docEntryRes.rows[0]?.max || '0', 10);

    const plpRowsToInsert: any[] = [];
    const plpRowsToUpdate: any[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;
      const itemCode = String(row.itemCode || row['Item No'] || '').trim();
      const customerCode = String(row.customerCode || row['Customer Code'] || '').trim();
      const foundry1 = String(row.foundry1 || row['Foundry 1'] || '').trim();
      const foundry2 = String(row.foundry2 || row['Foundry 2'] || '').trim();
      const foundry3 = String(row.foundry3 || row['Foundry 3'] || '').trim();

      if (!itemCode && !customerCode) continue;
      if (!itemCode) {
        errors.push(`Row ${rowNum}: Item No is missing`);
        continue;
      }

      if (!itemMap.has(itemCode)) {
        errors.push(`Row ${rowNum}: Item No "${itemCode}" not found in SAP (oitm)`);
        continue;
      }
      const itemInfo = itemMap.get(itemCode)!;
      if (!itemInfo.castingCode || !itemInfo.grade) {
        const missing: string[] = [];
        if (!itemInfo.castingCode) missing.push('Casting Code');
        if (!itemInfo.grade) missing.push('Grade');
        errors.push(`Row ${rowNum} (Item ${itemCode}): Missing required ${missing.join(' and ')} in Item Master`);
        continue;
      }

      if (customerCode && !customerSet.has(customerCode)) {
        errors.push(`Row ${rowNum}: Customer Code "${customerCode}" not found in SAP (ocrd)`);
        continue;
      }

      const validateVendor = (vName: string, label: string) => {
        if (!vName) return true;
        const lowName = vName.toLowerCase();
        if (vendorCodeSet.has(lowName) || vendorNameSet.has(lowName)) return true;
        errors.push(`Row ${rowNum}: ${label} "${vName}" not found in SAP (ocrd)`);
        return false;
      };

      if (!validateVendor(foundry1, 'Foundry 1') || !validateVendor(foundry2, 'Foundry 2') || !validateVendor(foundry3, 'Foundry 3')) {
        continue;
      }

      const castingCode = String(row.castingCode || row['Casting Code'] || '').trim();
      const foreignName = String(row.foreignName || row['Foreign Name'] || '').trim();
      const customerName = String(row.customerName || row['Customer Name'] || '').trim();
      const customerApprovalFoundry = String(row.customerApprovalFoundry || row['Customer Approval Foundry'] || '').trim();
      const specialCoating = String(row.specialCoating || row['Special Coating'] || '').trim();
      const itemDescription = String(row.description || row['Item Description'] || '').trim();
      const groupName = String(row.itemGroup || row['Group Name'] || '').trim();
      const boughtOutJobWork = String(row.boughtOutJobWork || row['Bought Out/Job Work'] || '').trim();
      const exportDomestic = String(row.exportDomestic || row['Domestic/Export'] || '').trim();
      const weight = Number(row.weight || row['Casting Wt(Kg)']) || 0;
      const ratePerKg = Number(row.ratePerKg || row['Casting Rate/Kg (INR)']) || 0;
      const castingPrice = Number(row.castingPrice || row['Casting Price']) || (weight * ratePerKg);
      const rejectionPercent = Number(row['Rejection Percentage (%)']) || 0;
      const rejectionCost = rejectionPercent > 0 ? excelRound(castingPrice * rejectionPercent / 100) : (Number(row.rejectionCost || row['Rejection Cost']) || 0);
      const powderCoatingWt = row['Powder Coating Wt(Kg)'] !== undefined && row['Powder Coating Wt(Kg)'] !== null && row['Powder Coating Wt(Kg)'] !== '' ? Number(row['Powder Coating Wt(Kg)']) : weight;
      const powderCoatingRate = Number(row['Powder Coating Rate/Kg'] || row['Powder Coating Rate']) || 0;
      const powderCoating = powderCoatingRate > 0 ? excelRound(powderCoatingWt * powderCoatingRate) : (Number(row.powderCoating || row['Powder Coating']) || 0);
      const specialProcessWt = row['Special Process Wt(Kg)'] !== undefined && row['Special Process Wt(Kg)'] !== null && row['Special Process Wt(Kg)'] !== '' ? Number(row['Special Process Wt(Kg)']) : weight;
      const specialProcessRate = Number(row['Special Process Rate/Kg'] || row['Special Process Rate']) || 0;
      const specialProcess = specialProcessRate > 0 ? excelRound(specialProcessWt * specialProcessRate) : excelRound(Number(row.specialProcess || row['Special Process'] || 0));
      const process = Number(row.process || row['Process (Machining+others)']) || 0;
      const transCharges = Number(row.transCharges || row['Trans Charges']) || 0;
      const ohp = Number(row.ohp || row['OHP']) || 0;
      const packing = excelRound(Number(row.packing || row['Packing'] || 0));

      // Pin & Bush Specifics
      const hardeningWt = Number(row.hardeningWt || row['Hardening Wt(Kg)']) || 0;
      const hardeningRate = Number(row.hardeningRate || row['Hardening Rate/Kg']) || 0;
      const hardeningPrice = hardeningWt * hardeningRate;
      const grinding = Number(row.grinding || row['Grinding']) || 0;
      const hardChromeWt = Number(row.hardChromeWt || row['Hard Chrome Wt(Kg)']) || 0;
      const hardChromeRate = Number(row.hardChromeRate || row['Hard Chrome Rate/Kg']) || 0;
      const hardChromePrice = hardChromeWt * hardChromeRate;
      const cutting = Number(row.cutting || row['Cutting']) || 0;

      const isPinBush = true;

      const totalWorkingCost = isPinBush
        ? excelRound(rejectionCost + cutting + process + transCharges + ohp + packing + hardeningPrice + grinding + hardChromePrice)
        : excelRound(rejectionCost + powderCoating + specialProcess + process + transCharges + ohp + packing);

      const finalPrice = Number(row.finalPrice || row['Final Price']) || (castingPrice + totalWorkingCost);
      let fromDate = row.fromDate || row['From Date'] || null;
      let toDate = row.toDate || row['To Date'] || null;
      const quarterVal = row.quarter || row['Quarter'] || row['Quarter (Q1/Q2/Q3/Q4)'];
      const yearVal = row.year || row['Year'] || row['Year (YYYY)'];
      if (quarterVal || yearVal) {
        const parsedDates = parseQuarterAndYear(quarterVal, yearVal);
        if (parsedDates) {
          fromDate = parsedDates.fromDate;
          toDate = parsedDates.toDate;
        }
      }

      let docEntry = existingPlpMap.get(`${itemCode}_${customerCode}`);
      const isUpdate = !!docEntry;
      if (!docEntry) {
        maxDocEntry++;
        docEntry = maxDocEntry;
      }

      const itemRecord = {
        docEntry: String(docEntry),
        customerCode, customerName, foreignName, customerApprovalFoundry, specialCoating, castingCode,
        itemCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
        weight: String(weight), ratePerKg: String(ratePerKg), castingPrice: String(castingPrice), 
        rejectionCost: String(rejectionCost), powderCoating: String(powderCoating),
        specialProcess: String(specialProcess), process: String(process), transCharges: String(transCharges), 
        ohp: String(ohp), packing: String(packing),
        totalWorkingCost: String(totalWorkingCost), finalPrice: String(finalPrice), 
        fromDate, toDate, status: 'Success',
        hardeningWt: String(hardeningWt), hardeningRate: String(hardeningRate), grinding: String(grinding),
        hardChromeWt: String(hardChromeWt), hardChromeRate: String(hardChromeRate), cutting: String(cutting)
      };

      if (isUpdate) {
        plpRowsToUpdate.push(itemRecord);
      } else {
        plpRowsToInsert.push(itemRecord);
      }

      successCount++;
    }

    // Bulk Updates
    if (plpRowsToUpdate.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < plpRowsToUpdate.length; i += batchSize) {
        const chunk = plpRowsToUpdate.slice(i, i + batchSize);
        const params = [];
        const valuePlaceholders = [];
        let pIdx = 1;

        for (const r of chunk) {
          valuePlaceholders.push(
            `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
          );
          params.push(
            r.docEntry, r.itemCode, r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry,
            r.specialCoating, r.castingCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
            r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
            r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
            r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
            r.hardeningWt, r.hardeningRate, r.grinding, r.hardChromeWt, r.hardChromeRate, r.cutting
          );
        }

        const sql = `
          UPDATE "aargit_plp1" AS plp SET
            "U_CustCode" = val.customerCode,
            "U_CustName" = val.customerName,
            "U_ForgName" = val.foreignName,
            "U_CusApprF" = val.customerApprovalFoundry,
            "U_SpecCoat" = val.specialCoating,
            "U_CastCode" = val.castingCode,
            "U_ItemDesc" = val.itemDescription,
            "U_GrpName" = val.groupName,
            "U_DomeExpo" = val.exportDomestic,
            "U_BoughJob" = val.boughtOutJobWork,
            "U_CastWt" = val.weight,
            "U_CastRate" = val.ratePerKg,
            "U_CastPric" = val.castingPrice,
            "U_RejCost" = val.rejectionCost,
            "U_PowdCoat" = val.powderCoating,
            "U_SpecProc" = val.specialProcess,
            "U_ProcMach" = val.process,
            "U_TranChar" = val.transCharges,
            "U_OHP" = val.ohp,
            "U_Packing" = val.packing,
            "U_ActCost" = val.totalWorkingCost,
            "U_FinPrice" = val.finalPrice,
            "U_EffDateF" = val.fromDate,
            "U_EffDateT" = val.toDate,
            "U_Status" = val.status,
            "U_HardWt" = val.hardeningWt::numeric,
            "U_HardRate" = val.hardeningRate::numeric,
            "U_Grinding" = val.grinding::numeric,
            "U_HChromeW" = val.hardChromeWt::numeric,
            "U_HChromeR" = val.hardChromeRate::numeric,
            "U_Cutting" = val.cutting::numeric
          FROM (VALUES ${valuePlaceholders.join(',')}) AS val(
            docEntry, itemCode, customerCode, customerName, foreignName, customerApprovalFoundry,
            specialCoating, castingCode, itemDescription, groupName, exportDomestic, boughtOutJobWork,
            weight, ratePerKg, castingPrice, rejectionCost, powderCoating,
            specialProcess, process, transCharges, ohp, packing,
            totalWorkingCost, finalPrice, fromDate, toDate, status,
            hardeningWt, hardeningRate, grinding, hardChromeWt, hardChromeRate, cutting
          )
          WHERE plp."DocEntry" = val.docEntry AND TRIM(plp."U_ItemNo") = val.itemCode
        `;
        await client.query(sql, params);
      }
    }

    // Bulk Inserts
    if (plpRowsToInsert.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < plpRowsToInsert.length; i += batchSize) {
        const chunk = plpRowsToInsert.slice(i, i + batchSize);
        const valuePlaceholders = [];
        const params = [];
        let pIdx = 1;
        for (const r of chunk) {
          const rowPlaceholders = [];
          for (let c = 0; c < 37; c++) {
            rowPlaceholders.push(`$${pIdx++}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(',')})`);
          params.push(
            r.docEntry, '1', '0', 'OPLE', '0',
            r.customerCode, r.customerName, r.foreignName, r.customerApprovalFoundry, r.specialCoating, r.castingCode,
            r.itemCode, r.itemDescription, r.groupName, r.exportDomestic, r.boughtOutJobWork,
            r.weight, r.ratePerKg, r.castingPrice, r.rejectionCost, r.powderCoating,
            r.specialProcess, r.process, r.transCharges, r.ohp, r.packing,
            r.totalWorkingCost, r.finalPrice, r.fromDate, r.toDate, r.status,
            r.hardeningWt, r.hardeningRate, r.grinding, r.hardChromeWt, r.hardChromeRate, r.cutting
          );
        }

        const sql = `
          INSERT INTO "aargit_plp1" (
            "DocEntry", "LineId", "VisOrder", "Object", "LogInst",
            "U_CustCode", "U_CustName", "U_ForgName", "U_CusApprF", "U_SpecCoat", "U_CastCode",
            "U_ItemNo", "U_ItemDesc", "U_GrpName", "U_DomeExpo", "U_BoughJob",
            "U_CastWt", "U_CastRate", "U_CastPric", "U_RejCost", "U_PowdCoat",
            "U_SpecProc", "U_ProcMach", "U_TranChar", "U_OHP", "U_Packing",
            "U_ActCost", "U_FinPrice", "U_EffDateF", "U_EffDateT", "U_Status",
            "U_HardWt", "U_HardRate", "U_Grinding", "U_HChromeW", "U_HChromeR",
            "U_Cutting"
          ) VALUES ${valuePlaceholders.join(',')}
        `;
        await client.query(sql, params);
      }
    }



    // Log history for all updates & inserts
    for (const r of plpRowsToUpdate) {
      await logImportHistory(client, r, r.exportDomestic || 'Pin Bush', updatedBy);
    }
    for (const r of plpRowsToInsert) {
      await logImportHistory(client, r, r.exportDomestic || 'Pin Bush', updatedBy);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { success: errors.length === 0, count: successCount, errors };
}

export async function getItemHistory(itemCode: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM item_sales_price_history 
     WHERE item_code = $1 
     ORDER BY updated_at DESC`,
    [itemCode]
  );
  return result || [];
}

export async function mapItemToVendors(itemCode: string, vendorIds: string[], _updatedBy: string = 'System'): Promise<any> {
  const cleanCode = itemCode.trim();
  const sapItem = await queryOne<any>(
    'SELECT itemcode, itemname, u_grade, u_castingcode, frgnname, u_cost FROM oitm_sftp WHERE TRIM(itemcode) = $1',
    [cleanCode]
  );
  if (!sapItem) {
    throw new Error(`Item ${itemCode} not found in SAP Item Master.`);
  }

  const grade = sapItem.u_grade?.trim() || '';
  const customerName = sapItem.frgnname?.trim() || '—';
  const castingCode = sapItem.u_castingcode?.trim() || '';
  const description = sapItem.itemname?.trim() || '';

  if (!castingCode || !grade) {
    const missing: string[] = [];
    if (!castingCode) missing.push('Casting Code');
    if (!grade) missing.push('Grade');
    throw new Error(`Cannot map item ${cleanCode}: Item Master record is missing required ${missing.join(' and ')}.`);
  }

  const client = await pool.connect();
  let mappedCount = 0;
  let skippedCount = 0;
  try {
    await client.query('BEGIN');

    for (const vendorId of vendorIds) {
      const vId = vendorId.trim();
      const vExists = await client.query('SELECT 1 FROM ocrd_sftp WHERE cardtype = \'S\' AND TRIM(cardcode) = $1', [vId]);
      if (vExists.rowCount === 0) {
        throw new Error(`Vendor ${vId} not found in database.`);
      }

      // Check if mapping already exists
      const dupCheck = await client.query(`
        SELECT id FROM vendor_materials 
        WHERE TRIM(vendor_id) = $1 AND TRIM(item_code) = $2
      `, [vId, cleanCode]);

      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        const existingId = dupCheck.rows[0].id;
        await client.query(`
          UPDATE vendor_materials SET
            item_description = $1,
            grade = $2,
            customer_name = $3,
            casting_code = $4,
            updated_at = NOW()
          WHERE id = $5
        `, [description, grade, customerName, castingCode, existingId]);
        mappedCount++;
      } else {
        await client.query(`
          INSERT INTO vendor_materials (
            vendor_id, item_code, item_description, grade, customer_name, casting_code, rm_weight,
            revised_rate_per_kg, revised_price, mmr_rate, ro_rate,
            consumables_rate, extra_factor, groupcode, groupname
          ) SELECT $1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 0, 0, 0, o.groupcode, og.groupname
          FROM (SELECT $1::text as vendor_id) v
          LEFT JOIN ocrd_sftp o ON TRIM(o.cardcode) = TRIM(v.vendor_id)
          LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)
        `, [vId, cleanCode, description, grade, customerName, castingCode]);
        mappedCount++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { success: true, mappedCount, skippedCount };
}

export async function getCustomerFoundryMappings(): Promise<{ customerCode: string; customerName: string; foundry: string }[]> {
  const sql = `
    SELECT DISTINCT TRIM("U_CustCode") as "customerCode", TRIM("U_CustName") as "customerName", TRIM("U_CusApprF") as foundry 
    FROM "argit_pld1" 
    WHERE "U_CustCode" IS NOT NULL AND TRIM("U_CustCode") != '' AND "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CustCode") as "customerCode", TRIM("U_CustName") as "customerName", TRIM("U_CusApprF") as foundry 
    FROM "aargit_ple1" 
    WHERE "U_CustCode" IS NOT NULL AND TRIM("U_CustCode") != '' AND "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CustCode") as "customerCode", TRIM("U_CustName") as "customerName", TRIM("U_CusApprF") as foundry 
    FROM "aargit_plp1" 
    WHERE "U_CustCode" IS NOT NULL AND TRIM("U_CustCode") != '' AND "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
    UNION
    SELECT DISTINCT TRIM("U_CustCode") as "customerCode", TRIM("U_CustName") as "customerName", TRIM("U_CusApprF") as foundry 
    FROM "argit_pll1" 
    WHERE "U_CustCode" IS NOT NULL AND TRIM("U_CustCode") != '' AND "U_CusApprF" IS NOT NULL AND TRIM("U_CusApprF") != ''
  `;
  return query<{ customerCode: string; customerName: string; foundry: string }>(sql);
}
