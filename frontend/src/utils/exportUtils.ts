import ExcelJS from 'exceljs';
import { getYearMonthVal } from './quarterUtils';

const toExcelDate = (str: any): Date | string => {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  // Use UTC values to prevent timezone shifts from changing the date
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const exportItemsToExcel = async (exportItems: any[], activeTab: string, _getVendorName: (id: string | null | undefined) => string, fileNamePrefix: string) => {
  let sortedItems = [...(exportItems || [])];
  sortedItems.sort((a, b) => {
    const codeA = String(a.castingCode || '').trim();
    const codeB = String(b.castingCode || '').trim();
    const comp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    if (comp !== 0) return comp;

    const itemA = String(a.itemCode || '').trim();
    const itemB = String(b.itemCode || '').trim();
    return itemA.localeCompare(itemB, undefined, { numeric: true, sensitivity: 'base' });
  });

  const itemsToMap = sortedItems.length > 0 ? sortedItems : [{}];
  let rows: any[];
  
  if (activeTab === 'Domestic') {
    rows = itemsToMap.map((i: any, index: number) => {
      const r = index + 2;
      return {
        'Customer Code': i.customerCode || '',
        'Customer Name': i.foreignName || '',
        'Foreign Name': i.foreignName || '',
        'Customer Approval Foundry': i.customerApprovalFoundry || '',
        'Special Coating': i.specialCoating || '',
        'Grade': i.grade || '',
        'Casting Code': i.castingCode || '',
        'Item No': i.itemCode || '',
        'Item Description': i.description || '',
        'Group Name': i.itemGroup || '',
        'Bought Out/Job Work': i.boughtOutJobWork || '',
        'Domestic/Export': i.exportDomestic || '',
        'Casting Wt(Kg)': i.weight || 0,
        'Casting Rate/Kg (INR)': i.ratePerKg || 0,
        'Casting Price': `=ROUND(M${r}*N${r}, 2)`,
        'Rejection Percentage (%)': (i.rejectionCost && i.weight && i.ratePerKg) ? Number((i.rejectionCost / (i.weight * i.ratePerKg) * 100).toFixed(2)) : 0,
        'Rejection Cost': `=ROUND(O${r}*(P${r}/100), 2)`,
        'Powder Coating Wt(Kg)': Number(Number((i.powderCoatingWeight && i.powderCoatingWeight > 0) ? i.powderCoatingWeight : (i.weight || 0)).toFixed(2)),
        'Powder Coating Rate/Kg': Number(Number((i.powderCoatingRate && i.powderCoatingRate > 0) ? i.powderCoatingRate : ((i.powderCoating && i.weight) ? (i.powderCoating / i.weight) : 0)).toFixed(2)),
        'Powder Coating': `=ROUND(R${r}*S${r}, 2)`,
        'Special Process Wt(Kg)': Number(Number((i.specialProcessWeight && i.specialProcessWeight > 0) ? i.specialProcessWeight : (i.weight || 0)).toFixed(2)),
        'Special Process Rate/Kg': Number(Number((i.specialProcessRate && i.specialProcessRate > 0) ? i.specialProcessRate : ((i.specialProcess && i.weight) ? (i.specialProcess / i.weight) : 0)).toFixed(2)),
        'Special Process': `=ROUND(U${r}*V${r}, 2)`,
        'Process (Machining+others)': i.process || 0,
        'Trans Charges': i.transCharges || 0,
        'OHP': i.ohp || 0,
        'Packing': i.packing || 0,
        'Total Working Cost': `=ROUND(Q${r}+T${r}+W${r}+X${r}+Y${r}+Z${r}+AA${r}, 2)`,
        'Final Price': `=ROUND(O${r}+AB${r}, 2)`,
        'From Date': toExcelDate(i.fromDate),
        'To Date': toExcelDate(i.toDate),
      };
    });
    // 50 blank template rows
    const domBase = rows.length + 2;
    for (let x = 0; x < 50; x++) {
      const r = domBase + x;
      rows.push({
        'Customer Code': '', 'Customer Name': '', 'Foreign Name': '', 'Customer Approval Foundry': '',
        'Special Coating': '',
        'Grade': '',
        'Casting Code': '', 'Item No': '', 'Item Description': '', 'Group Name': '',
        'Bought Out/Job Work': '', 'Domestic/Export': '',
        'Casting Wt(Kg)': 0, 'Casting Rate/Kg (INR)': 0,
        'Casting Price': `=M${r}*N${r}`,
        'Rejection Percentage (%)': 0,
        'Rejection Cost': `=O${r}*(P${r}/100)`,
        'Powder Coating Wt(Kg)': 0, 'Powder Coating Rate/Kg': 0,
        'Powder Coating': `=R${r}*S${r}`,
        'Special Process Wt(Kg)': 0, 'Special Process Rate/Kg': 0,
        'Special Process': `=U${r}*V${r}`,
        'Process (Machining+others)': 0, 'Trans Charges': 0, 'OHP': 0, 'Packing': 0,
        'Total Working Cost': `=Q${r}+T${r}+W${r}+X${r}+Y${r}+Z${r}+AA${r}`,
        'Final Price': `=O${r}+AB${r}`,
        'From Date': '', 'To Date': '',
      });
    }
  } else if (activeTab === 'Export') {
    rows = itemsToMap.map((i: any, index: number) => {
      const r = index + 2;
      return {
        'Customer Code': i.customerCode || '',
        'Foreign Name': i.foreignName || '',
        'Customer Approval Foundry': i.customerApprovalFoundry || '',
        'Special Coating': i.specialCoating || '',
        'Grade': i.grade || '',
        'Casting Code': i.castingCode || '',
        'Item No': i.itemCode || '',
        'Item Description': i.description || '',
        'Group Name': i.itemGroup || '',
        'Bought Out/Job Work': i.boughtOutJobWork || '',
        'Domestic/Export': i.exportDomestic || '',
        'Casting Wt(Kg)': i.weight || 0,
        'Casting Rate/Kg (INR)': i.ratePerKg || 0,
        'Casting Price': `=ROUND(L${r}*M${r}, 2)`,
        'Rejection Percentage (%)': (i.rejectionCost && i.weight && i.ratePerKg) ? Number((i.rejectionCost / (i.weight * i.ratePerKg) * 100).toFixed(2)) : 0,
        'Rejection Cost': `=ROUND(N${r}*(O${r}/100), 2)`,
        'Powder Coating Wt(Kg)': Number(Number((i.powderCoatingWeight && i.powderCoatingWeight > 0) ? i.powderCoatingWeight : (i.weight || 0)).toFixed(2)),
        'Powder Coating Rate/Kg': Number(Number((i.powderCoatingRate && i.powderCoatingRate > 0) ? i.powderCoatingRate : ((i.powderCoating && i.weight) ? (i.powderCoating / i.weight) : 0)).toFixed(2)),
        'Powder Coating': `=ROUND(Q${r}*R${r}, 2)`,
        'Special Process Wt(Kg)': Number(Number((i.specialProcessWeight && i.specialProcessWeight > 0) ? i.specialProcessWeight : (i.weight || 0)).toFixed(2)),
        'Special Process Rate/Kg': Number(Number((i.specialProcessRate && i.specialProcessRate > 0) ? i.specialProcessRate : ((i.specialProcess && i.weight) ? (i.specialProcess / i.weight) : 0)).toFixed(2)),
        'Special Process': `=ROUND(T${r}*U${r}, 2)`,
        'Process (Machining+others)': i.process || 0,
        'Trans Charges': i.transCharges || 0,
        'OHP': i.ohp || 0,
        'Packing': i.packing || 0,
        'Total Working Cost': `=ROUND(P${r}+S${r}+V${r}+W${r}+X${r}+Y${r}+Z${r}, 2)`,
        'Final Price': `=ROUND(N${r}+AA${r}, 2)`,
        'Less Domestic Packing (if BTPL Code)': i.lessDomesticPacking || 0,
        'Assembly Cost': i.assemblyCost || 0,
        'Export Packing cost': i.exportPackingCost || 0,
        'FOB Cost/piece': i.fobCost || 0,
        'OH & ICC on Export': i.ohIccExport || 0,
        'Added Export over Heads': i.addedExportOverheads || 0,
        'Unit Price for Export': `=AB${r}-AC${r}+AD${r}+AE${r}+AF${r}+AG${r}+AH${r}`,
        'Forex': i.forex || 0,
        'Unit Price in Foreign Currency': `=IF(AJ${r}>0, AI${r}/AJ${r}, 0)`,
        'From Date': toExcelDate(i.fromDate),
        'To Date': toExcelDate(i.toDate),
      };
    });
    const expBase = rows.length + 2;
    for (let x = 0; x < 50; x++) {
      const r = expBase + x;
      rows.push({
        'Customer Code': '', 'Foreign Name': '', 'Customer Approval Foundry': '',
        'Special Coating': '',
        'Grade': '',
        'Casting Code': '', 'Item No': '', 'Item Description': '', 'Group Name': '',
        'Bought Out/Job Work': '', 'Domestic/Export': '',
        'Casting Wt(Kg)': 0, 'Casting Rate/Kg (INR)': 0,
        'Casting Price': `=L${r}*M${r}`,
        'Rejection Percentage (%)': 0,
        'Rejection Cost': `=N${r}*(O${r}/100)`,
        'Powder Coating Wt(Kg)': 0, 'Powder Coating Rate/Kg': 0,
        'Powder Coating': `=Q${r}*R${r}`,
        'Special Process Wt(Kg)': 0, 'Special Process Rate/Kg': 0,
        'Special Process': `=T${r}*U${r}`,
        'Process (Machining+others)': 0, 'Trans Charges': 0, 'OHP': 0, 'Packing': 0,
        'Total Working Cost': `=P${r}+S${r}+V${r}+W${r}+X${r}+Y${r}+Z${r}`,
        'Final Price': `=N${r}+AA${r}`,
        'Less Domestic Packing (if BTPL Code)': 0, 'Assembly Cost': 0,
        'Export Packing cost': 0, 'FOB Cost/piece': 0,
        'OH & ICC on Export': 0, 'Added Export over Heads': 0,
        'Unit Price for Export': `=AB${r}-AC${r}+AD${r}+AE${r}+AF${r}+AG${r}+AH${r}`,
        'Forex': 0,
        'Unit Price in Foreign Currency': `=IF(AJ${r}>0, AI${r}/AJ${r}, 0)`,
        'From Date': '', 'To Date': '',
      });
    }
  } else if (activeTab === 'Labour / Job Work') {
    rows = itemsToMap.map((i: any, index: number) => {
      const r = index + 2;
      return {
        'Customer Code': i.customerCode || '',
        'Foreign Name': i.foreignName || '',
        'Special Coating': i.specialCoating || '',
        'Grade': i.grade || '',
        'Casting Code': i.castingCode || '',
        'Item No': i.itemCode || '',
        'Item Description': i.description || '',
        'Group Name': i.itemGroup || '',
        'Bought Out/Job Work': i.boughtOutJobWork || '',
        'Domestic/Export': i.exportDomestic || '',
        'Powder Coating Wt(Kg)': i.powderCoatingWeight ? Number(i.powderCoatingWeight) : 0,
        'Powder Coating Rate/Kg': i.powderCoatingRate ? Number(i.powderCoatingRate) : 0,
        'Powder Coating': `=ROUND(K${r}*L${r}, 2)`,
        'Special Process Wt(Kg)': i.specialProcessWeight ? Number(i.specialProcessWeight) : 0,
        'Special Process Rate/Kg': i.specialProcessRate ? Number(i.specialProcessRate) : 0,
        'Special Process': `=ROUND(N${r}*O${r}, 2)`,
        'Process (Machining+others)': i.process ? Number(i.process) : 0,
        'Trans Charges': i.transCharges ? Number(i.transCharges) : 0,
        'OHP': i.ohp ? Number(i.ohp) : 0,
        'Packing': i.packing ? Number(i.packing) : 0,
        'Total Working Cost': `=ROUND(M${r}+P${r}+Q${r}+R${r}+S${r}+T${r}, 2)`,
        'Final Price': `=ROUND(U${r}, 2)`,
        'From Date': toExcelDate(i.fromDate),
        'To Date': toExcelDate(i.toDate),
      };
    });
    const labBase = rows.length + 2;
    for (let x = 0; x < 50; x++) {
      const r = labBase + x;
      rows.push({
        'Customer Code': '', 'Foreign Name': '',
        'Special Coating': '',
        'Grade': '',
        'Casting Code': '',
        'Item No': '', 'Item Description': '', 'Group Name': '',
        'Bought Out/Job Work': '', 'Domestic/Export': '',
        'Powder Coating Wt(Kg)': 0, 'Powder Coating Rate/Kg': 0,
        'Powder Coating': `=ROUND(K${r}*L${r}, 2)`,
        'Special Process Wt(Kg)': 0, 'Special Process Rate/Kg': 0,
        'Special Process': `=ROUND(N${r}*O${r}, 2)`,
        'Process (Machining+others)': 0, 'Trans Charges': 0, 'OHP': 0, 'Packing': 0,
        'Total Working Cost': `=M${r}+P${r}+Q${r}+R${r}+S${r}+T${r}`,
        'Final Price': `=U${r}`,
        'From Date': '', 'To Date': '',
      });
    }
  } else if (activeTab === 'Pin & Bush') {
    rows = itemsToMap.map((i: any, index: number) => {
      const r = index + 2;
      return {
        'Customer Code': i.customerCode || '',
        'Foreign Name': i.foreignName || '',
        'Customer Approval Foundry': i.customerApprovalFoundry || '',
        'Special Coating': i.specialCoating || '',
        'Grade': i.grade || '',
        'Casting Code': i.castingCode || '',
        'Item No': i.itemCode || '',
        'Item Description': i.description || '',
        'Group Name': i.itemGroup || '',
        'Bought Out/Job Work': i.boughtOutJobWork || '',
        'Domestic/Export': i.exportDomestic || '',
        'Casting Wt(Kg)': i.weight || 0,
        'Casting Rate/Kg (INR)': i.ratePerKg || 0,
        'Casting Price': `=ROUND(L${r}*M${r}, 2)`,
        'Rejection Percentage (%)': (i.rejectionCost && i.weight && i.ratePerKg) ? Number((i.rejectionCost / (i.weight * i.ratePerKg) * 100).toFixed(2)) : 0,
        'Rejection Cost': `=ROUND(N${r}*(O${r}/100), 2)`,
        'Cutting': i.cutting || 0,
        'Hardening Wt(Kg)': Number(Number(i.hardeningWt || 0).toFixed(2)),
        'Hardening Rate/Kg': Number(Number(i.hardeningRate || 0).toFixed(2)),
        'Hardening Price': `=ROUND(R${r}*S${r}, 2)`,
        'Grinding Price': i.grinding || 0,
        'Hard Chrome Wt(Kg)': Number(Number(i.hardChromeWt || 0).toFixed(2)),
        'Hard Chrome Rate/Kg': Number(Number(i.hardChromeRate || 0).toFixed(2)),
        'Hard Chrome Price': `=ROUND(V${r}*W${r}, 2)`,
        'Process (Machining+others)': i.process || 0,
        'Trans Charges': i.transCharges || 0,
        'OHP': i.ohp || 0,
        'Packing': i.packing || 0,
        'Total Working Cost': `=ROUND(P${r}+Q${r}+T${r}+U${r}+X${r}+Y${r}+Z${r}+AA${r}+AB${r}, 2)`,
        'Final Price': `=ROUND(N${r}+AC${r}, 2)`,
        'From Date': toExcelDate(i.fromDate),
        'To Date': toExcelDate(i.toDate),
      };
    });
    const pinFirstExtra = rows.length + 2;
    for (let x = 0; x < 50; x++) {
      const r = pinFirstExtra + x;
      rows.push({
        'Customer Code': '', 'Foreign Name': '', 'Customer Approval Foundry': '',
        'Special Coating': '',
        'Grade': '',
        'Casting Code': '', 'Item No': '', 'Item Description': '', 'Group Name': '',
        'Bought Out/Job Work': '', 'Domestic/Export': '',
        'Casting Wt(Kg)': 0, 'Casting Rate/Kg (INR)': 0,
        'Casting Price': `=L${r}*M${r}`,
        'Rejection Percentage (%)': 0,
        'Rejection Cost': `=N${r}*(O${r}/100)`,
        'Cutting': 0,
        'Hardening Wt(Kg)': 0, 'Hardening Rate/Kg': 0,
        'Hardening Price': `=R${r}*S${r}`,
        'Grinding Price': 0,
        'Hard Chrome Wt(Kg)': 0, 'Hard Chrome Rate/Kg': 0,
        'Hard Chrome Price': `=V${r}*W${r}`,
        'Process (Machining+others)': 0, 'Trans Charges': 0, 'OHP': 0, 'Packing': 0,
        'Total Working Cost': `=P${r}+Q${r}+T${r}+U${r}+X${r}+Y${r}+Z${r}+AA${r}+AB${r}`,
        'Final Price': `=N${r}+AC${r}`,
        'From Date': '', 'To Date': '',
      });
    }
  } else {
    rows = exportItems.map((i: any) => ({
      'Item No': i.itemCode || '',
      'Item Description': i.description || '',
      'In Stock': i.inStock || 0,
      'Item Group': i.itemGroup || '',
      'Casting Code': i.castingCode || '',
      'Foreign Name': i.foreignName || '',
      'Grade': i.grade || '',
      'Bought Out/Job Work': i.boughtOutJobWork || '',
      'Purchasing Item': i.purchasingItem || '',
      'Sales Item': i.salesItem || '',
      'Inventory Item': i.inventoryItem || '',
      'Sub Group 1': i.subGroup1 || '',
      'Active': i.active || '',
      'Stage': i.stage || '',
      'UOM': i.uom || '',
      'Kit': i.kit || '',
      'Export/Domestic': i.exportDomestic || '',
    }));
  }

  const headers = Object.keys(rows[0] || {});

  // Create ExcelJS Workbook
  const workbook = new ExcelJS.Workbook();
  const sheetName = activeTab === 'Domestic' ? "DomesticMaster" : (activeTab === 'Export' ? "ExportMaster" : (activeTab === 'Labour / Job Work' ? "LabourJobWorkMaster" : (activeTab === 'Pin & Bush' ? "PinBushMaster" : "ItemMaster")));
  const worksheet = workbook.addWorksheet(sheetName);

  // Set columns
  worksheet.columns = headers.map(key => {
    let maxLen = key.length;
    rows.forEach(r => {
      const val = r[key] !== undefined && r[key] !== null ? String(r[key]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return {
      header: key,
      key: key,
      width: Math.max(maxLen + 3, 12)
    };
  });

  // Add rows with formulas
  rows.forEach((rowObj, _index) => {
    const row = worksheet.addRow({});
    headers.forEach((h, colIdx) => {
      const val = rowObj[h];
      const cell = row.getCell(colIdx + 1);
      if (typeof val === 'string' && val.startsWith('=')) {
        cell.value = { formula: val.substring(1) };
      } else {
        cell.value = val;
      }
    });
  });

  // Header row styling
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };
  });

  // Data rows styling and formats
  const rupeeHeaders = [
    'Casting Rate/Kg (INR)', 'Casting Price', 'Rejection Cost',
    'Powder Coating Rate/Kg', 'Powder Coating',
    'Special Process Rate/Kg', 'Special Process',
    'Process (Machining+others)', 'Trans Charges',
    'Packing', 'Total Working Cost', 'Final Price',
    'Price 1', 'Price 2', 'Price 3',
    'Grinding Price', 'Hardening Rate/Kg', 'Hardening Price',
    'Hard Chrome Rate/Kg', 'Hard Chrome Price', 'Cutting',
    'Less Domestic Packing (if BTPL Code)', 'Assembly Cost',
    'Export Packing cost', 'FOB Cost/piece', 'OH & ICC on Export',
    'Added Export over Heads', 'Unit Price for Export'
  ];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 11, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };

      const headerName = headers[colNumber - 1];
      if (['From Date', 'To Date'].includes(headerName)) {
        cell.numFmt = 'dd-mm-yyyy';
      } else if (rupeeHeaders.includes(headerName)) {
        cell.numFmt = '"₹"#,##0.00';
      } else if (headerName === 'Unit Price in Foreign Currency') {
        cell.numFmt = '0.00';
      } else if (['Item No', 'Customer Code', 'Casting Code'].includes(headerName)) {
        cell.numFmt = '@';
        cell.value = cell.value !== undefined && cell.value !== null ? String(cell.value) : '';
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  
  const fileName = `${fileNamePrefix}_${activeTab.replace(/[\\/&]/g, '').replace(/\s+/g, '')}_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.xlsx`;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

const revDiff = (curr: number | undefined | null, prev: number | undefined | null) => {
  if (curr === undefined || curr === null) return '-';
  if (prev === undefined || prev === null) return '-';
  const c = Number(curr);
  const p = Number(prev);
  const d = c - p;
  if (d === 0) return '0.00';
  return d > 0 ? `+${d.toFixed(2)}` : `${d.toFixed(2)}`;
};

const styleCellRange = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  style: {
    fillColor?: string;
    fontColor?: string;
    bold?: boolean;
    fontSize?: number;
    align?: 'center' | 'left' | 'right';
  }
) => {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = worksheet.getCell(r, c);
      if (style.fillColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: style.fillColor },
        };
      }
      cell.font = {
        name: 'Segoe UI',
        size: style.fontSize || 11,
        bold: style.bold !== undefined ? style.bold : true,
        color: { argb: style.fontColor || 'FF000000' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: style.align || 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
        bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
        left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
        right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      };
    }
  }
};

const fmtSplitVal = (val: number) => val === 0 ? '0' : (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2));

export const exportPriceHistoryToExcel = async (
  groupedData: any[],
  mode: 'vendor' | 'customer',
  monthsList: any[]
) => {
  const isVendor = mode === 'vendor';
  const fileNamePrefix = isVendor ? 'Vendor_Price_History' : 'Customer_Price_History';

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(isVendor ? 'VendorPriceHistory' : 'CustomerPriceHistory');

  let currentCol = 1;
  const colTypes: ('weight' | 'price' | 'text')[] = [null as any];

  // 1. Base Columns (Cols 1 to 5)
  const baseHeaders = isVendor
    ? ['Foreign Name', 'Casting Code', 'Item Description', 'Vendor', 'Grade']
    : ['Customer Name', 'Casting Code', 'Item Description', 'Dom/Export', 'Grade'];

  baseHeaders.forEach((hName) => {
    worksheet.getCell(1, currentCol).value = hName;
    worksheet.mergeCells(1, currentCol, 2, currentCol);
    styleCellRange(worksheet, 1, currentCol, 2, currentCol, {
      fillColor: 'FFF8FAFC',
      fontColor: 'FF0F172A',
      bold: true,
      fontSize: 11,
    });
    colTypes[currentCol] = 'text';
    currentCol++;
  });

  // 2. Months Loop
  (monthsList || []).forEach((mDef: any) => {
    // 2a. Revision Block FIRST
    const revStartCol = currentCol;
    const splitHeaders = ['MMR', 'RO', 'Cons', 'Extra'];
    splitHeaders.forEach(subH => {
      worksheet.getCell(2, currentCol).value = subH;
      styleCellRange(worksheet, 2, currentCol, 2, currentCol, {
        fillColor: 'FFFDE047', // Yellow-300
        fontColor: 'FF713F12',
        bold: true,
        fontSize: 10,
      });
      colTypes[currentCol] = 'text';
      currentCol++;
    });
    const revEndCol = currentCol - 1;
    worksheet.getCell(1, revStartCol).value = `MMR/ Revision ${mDef.name.toUpperCase().replace('-', ' ')}`;
    worksheet.mergeCells(1, revStartCol, 1, revEndCol);
    styleCellRange(worksheet, 1, revStartCol, 1, revEndCol, {
      fillColor: 'FFFACC15', // Yellow-400
      fontColor: 'FF713F12',
      bold: true,
      fontSize: 11,
    });

    // 2b. Month Rates Block SECOND
    const rateStartCol = currentCol;
    const rateHeaders = isVendor
      ? ['Rm Weight', 'Revised Rate/Kg', 'Revised Price']
      : ['Cast Wt', 'Cast Rate/Kg', 'Casting Price', 'Final Price'];

    rateHeaders.forEach(subH => {
      worksheet.getCell(2, currentCol).value = subH;
      const isFinal = subH === 'Final Price';
      styleCellRange(worksheet, 2, currentCol, 2, currentCol, {
        fillColor: isFinal ? 'FFD1FAE5' : 'FFFFFFFF',
        fontColor: isFinal ? 'FF065F46' : 'FF1E293B',
        bold: true,
        fontSize: 10,
      });
      colTypes[currentCol] = (subH.includes('Weight') || subH.includes('Wt')) ? 'weight' : 'price';
      currentCol++;
    });
    const rateEndCol = currentCol - 1;
    worksheet.getCell(1, rateStartCol).value = mDef.name;
    worksheet.mergeCells(1, rateStartCol, 1, rateEndCol);
    styleCellRange(worksheet, 1, rateStartCol, 1, rateEndCol, {
      fillColor: 'FFFFEDD5', // Peach / Light Orange-100
      fontColor: 'FF9A3412',
      bold: true,
      fontSize: 11,
    });
  });

  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 22;

  // 3. Data Rows starting at Row 3
  (groupedData || []).forEach((item, itemIdx) => {
    const rIdx = 3 + itemIdx;
    const rowValues: any[] = [];

    if (isVendor) {
      rowValues.push(item.foreignName || '-');
      rowValues.push(item.castingCode || '-');
      rowValues.push(item.itemDescription || '-');
      rowValues.push(item.vendor || '-');
      rowValues.push(item.grade || '-');
    } else {
      rowValues.push(item.foreignName || '-');
      rowValues.push(item.castingCode || '-');
      rowValues.push(item.itemDescription || '-');
      rowValues.push(item.domesticExport || '-');
      rowValues.push(item.grade || '-');
    }

    (monthsList || []).forEach((mDef: any) => {
      const mInfo = item.months?.[mDef.name] || {
        log: null,
        mmrSplit: 0,
        roSplit: 0,
        consSplit: 0,
        extraSplit: 0,
      };

      // Split values
      rowValues.push(fmtSplitVal(mInfo.mmrSplit));
      rowValues.push(fmtSplitVal(mInfo.roSplit));
      rowValues.push(fmtSplitVal(mInfo.consSplit));
      rowValues.push(fmtSplitVal(mInfo.extraSplit));

      // Rates & Prices
      const mLog = mInfo.log;
      if (isVendor) {
        const rawWt = mLog?.rmWeight ?? mLog?.newCastWeight ?? item.rmWeight;
        const rate = mLog?.newRatePerKg ?? mLog?.revisedRatePerKg ?? mLog?.ratePerKg;
        let calcPrice: any = '-';
        if (mLog) {
          if (rawWt != null && rate != null) {
            calcPrice = Number((Number(rawWt) * Number(rate)).toFixed(2));
          } else if (mLog.newPrice != null) {
            calcPrice = Number(Number(mLog.newPrice).toFixed(2));
          }
        }
        const wt = (rate != null || calcPrice !== '-') ? rawWt : null;

        rowValues.push(wt != null ? Number(Number(wt).toFixed(2)) : '-');
        rowValues.push(rate != null ? Number(Number(rate).toFixed(2)) : '-');
        rowValues.push(calcPrice);
      } else {
        const rawWt = mLog?.newCastWeight ?? mLog?.customerRmWeight ?? mLog?.rmWeight ?? item.rmWeight;
        const rate = mLog?.newCastRate ?? mLog?.customerRatePerKg ?? mLog?.ratePerKg;
        let calcPrice: any = '-';
        if (mLog && rawWt != null && rate != null) {
          calcPrice = Number((Number(rawWt) * Number(rate)).toFixed(2));
        }
        const finalPrice = (mLog && mLog.newPrice != null) ? Number(Number(mLog.newPrice).toFixed(2)) : '-';
        const wt = (rate != null || calcPrice !== '-' || finalPrice !== '-') ? rawWt : null;

        rowValues.push(wt != null ? Number(Number(wt).toFixed(2)) : '-');
        rowValues.push(rate != null ? Number(Number(rate).toFixed(2)) : '-');
        rowValues.push(calcPrice);
        rowValues.push(finalPrice);
      }
    });

    const row = worksheet.getRow(rIdx);
    row.values = rowValues;
    row.height = 20;

    for (let c = 1; c < currentCol; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      const cType = colTypes[c];
      if (typeof cell.value === 'number') {
        if (cType === 'price') {
          cell.numFmt = '"₹"#,##0.00';
        } else if (cType === 'weight') {
          cell.numFmt = '#,##0.00';
        }
      }
    }
  });

  // 4. Auto-fit column widths
  for (let c = 1; c < currentCol; c++) {
    let maxLen = 12;
    const r2Val = worksheet.getCell(2, c).value;
    if (r2Val) maxLen = Math.max(maxLen, String(r2Val).length);
    for (let r = 3; r < 3 + (groupedData || []).length; r++) {
      const val = worksheet.getCell(r, c).value;
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }
    worksheet.getColumn(c).width = Math.max(maxLen + 4, 13);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileNamePrefix}_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};
