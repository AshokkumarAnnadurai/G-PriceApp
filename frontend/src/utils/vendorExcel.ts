import XLSX from 'xlsx-js-style';
import { Vendor } from '../types';
import { getYearMonthVal, getQuartersData, getForwardQuartersData } from './quarterUtils';
import { exportPriceHistoryToExcel } from './exportUtils';

const normalizeCode = (code?: string) => {
  if (!code) return '';
  return code.trim().toUpperCase().replace(/-RM$/i, '');
};

const revDiff = (curr: number | undefined | null, prev: number | undefined | null) => {
  if (curr === undefined || curr === null) return '';
  if (prev === undefined || prev === null) return '';
  const c = Number(curr);
  const p = Number(prev);
  const d = c - p;
  if (d === 0) return '0.00';
  return d > 0 ? `+${d.toFixed(2)}` : `${d.toFixed(2)}`;
};

export const exportVendorToExcel = (targetVendor: Vendor, isHistory: boolean = false, priceLogs?: any[]) => {
  // 1. Determine date range
  let minYear = 2025;
  let minQ = 3;
  let maxYear = new Date().getFullYear();
  let maxQ = Math.floor(new Date().getMonth() / 3) + 1;

  if (isHistory && priceLogs && priceLogs.length > 0) {
    let minVal = Infinity;
    let maxVal = -1;
    priceLogs.forEach(l => {
      const val = getYearMonthVal(l.fromDate || l.createdAt);
      if (val > 0) {
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
    });
    if (minVal !== Infinity) {
      const y = Math.floor(minVal / 100);
      const m = minVal % 100; // 0 to 11
      const q = Math.floor(m / 3) + 1;
      minYear = y;
      minQ = q;
      if (minYear < 2025 || (minYear === 2025 && minQ < 3)) {
        minYear = 2025;
        minQ = 3;
      }
    }
    if (maxVal !== -1) {
      const maxY = Math.floor(maxVal / 100);
      const maxM = maxVal % 100;
      const q = Math.floor(maxM / 3) + 1;
      if (maxY > maxYear || (maxY === maxYear && q > maxQ)) {
        maxYear = maxY;
        maxQ = q;
      }
    }
  }

  const quartersList = getForwardQuartersData(minYear, minQ, maxYear, maxQ);

  // 2. Group materials and history logs
  const grouped = new Map<string, any>();
  const logsByKey: Record<string, any[]> = {};

  targetVendor.materials.forEach(m => {
    const key = `${m.id || ''}|${m.customerName || ''}|${m.machineType || ''}|${m.coating || ''}|${m.cavity || ''}|${m.coreSleeve || ''}|${m.castingCode || ''}|${m.itemCode || ''}|${m.itemDescription || ''}|${m.grade || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, { base: m, values: {}, quarterRevisions: {}, key });
    }
  });

  if (isHistory && priceLogs && priceLogs.length > 0) {
    const sortedHistory = [...priceLogs].sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

    sortedHistory.forEach(l => {
      const lCastingNorm = normalizeCode(l.castingCode || l.itemCode);
      let foundKey: string | null = null;
      for (const [k, v] of grouped.entries()) {
        const mCastingNorm = normalizeCode(v.base.castingCode || v.base.itemCode);
        if (lCastingNorm && mCastingNorm && lCastingNorm === mCastingNorm) {
          foundKey = k;
          break;
        }
      }
      if (!foundKey) {
        foundKey = `${l.id || ''}|${l.customerName || ''}|${l.machineType || ''}|${l.coating || ''}|${l.cavity || ''}|${l.coreSleeve || ''}|${l.castingCode || ''}|${l.itemCode || ''}|${l.itemDescription || ''}|${l.grade || ''}`;
        grouped.set(foundKey, {
          base: {
            customerName: l.customerName || targetVendor.name || '',
            machineType: l.machineType || '',
            coating: l.coating || '',
            cavity: l.cavity || '',
            coreSleeve: l.coreSleeve || '',
            castingCode: l.castingCode || l.itemCode || '',
            itemCode: l.itemCode || l.castingCode || '',
            itemDescription: l.itemDescription || '',
            grade: l.grade || '',
            rmWeight: l.rmWeight ?? l.newCastWeight,
            revisedRatePerKg: l.newRatePerKg ?? l.revisedRatePerKg ?? l.ratePerKg,
          },
          values: {},
          quarterRevisions: {},
          key: foundKey,
        });
      }
      if (!logsByKey[foundKey]) logsByKey[foundKey] = [];
      logsByKey[foundKey].push(l);
    });
  }

  // Detect auto-expanded months with intra-month updates
  const autoExpandedMonths = new Set<string>();

  if (isHistory) {
    grouped.forEach((group) => {
      const itemLogs = logsByKey[group.key] || [];
      quartersList.forEach(qDef => {
        qDef.months.forEach((mDef, idx) => {
          if (idx < 2) {
            const nextMonthDef = qDef.months[idx + 1];
            const nextMonthVal = nextMonthDef.year * 100 + nextMonthDef.monthIdx;
            const nextLog = itemLogs.find(l => getYearMonthVal(l.fromDate || l.createdAt) === nextMonthVal);
            if (nextLog) {
              const hasMmrUpdate = (
                (nextLog.oldMmr != null && nextLog.newMmr != null && nextLog.newMmr !== nextLog.oldMmr) ||
                (nextLog.oldCoating != null && nextLog.newCoating != null && nextLog.newCoating !== nextLog.oldCoating) ||
                (nextLog.oldConsumables != null && nextLog.newConsumables != null && nextLog.newConsumables !== nextLog.oldConsumables) ||
                (nextLog.oldExtra != null && nextLog.newExtra != null && nextLog.newExtra !== nextLog.oldExtra) ||
                (nextLog.newRatePerKg != null && nextLog.oldRatePerKg != null && nextLog.newRatePerKg !== nextLog.oldRatePerKg)
              );
              if (hasMmrUpdate) {
                autoExpandedMonths.add(mDef.name);
              }
            }
          }
        });
      });
    });
  }

  // 3. Populate group monthly data & quarter revisions
  grouped.forEach((group) => {
    const m = group.base;
    const itemLogs = logsByKey[group.key] || [];
    const groupMonths: Record<string, any> = {};

    quartersList.forEach(qDef => {
      qDef.months.forEach((mDef) => {
        const mVal = mDef.year * 100 + mDef.monthIdx;
        let matchedLog: any = null;
        if (isHistory && itemLogs.length > 0) {
          let maxLogVal = -1;
          itemLogs.forEach(l => {
            const val = getYearMonthVal(l.fromDate || l.createdAt);
            let isValid = val <= mVal;
            if (isValid && l.toDate) {
              const toVal = getYearMonthVal(l.toDate);
              if (mVal > toVal) isValid = false;
            }
            if (isValid && val >= maxLogVal) {
              matchedLog = l;
              maxLogVal = val;
            }
          });
        }

        const valOrEmpty = (val: any) => {
          if (val === null || val === undefined || val === 0 || val === '0' || val === '') return '';
          return val;
        };

        if (matchedLog) {
          const wt = valOrEmpty(matchedLog.rmWeight) !== '' ? matchedLog.rmWeight : valOrEmpty(m.rmWeight);
          const rate = (matchedLog.newRatePerKg != null || matchedLog.revisedRatePerKg != null || matchedLog.ratePerKg != null)
            ? (matchedLog.newRatePerKg ?? matchedLog.revisedRatePerKg ?? matchedLog.ratePerKg)
            : valOrEmpty(m.revisedRatePerKg);
          const price = (wt !== '' && rate !== '') ? Number(wt) * Number(rate) : (matchedLog.newPrice != null ? matchedLog.newPrice : '');
          groupMonths[mDef.name] = {
            log: matchedLog,
            wt,
            rate,
            price,
            mmrRate: valOrEmpty(matchedLog.newMmr),
            roRate: valOrEmpty(matchedLog.newCoating),
            consumablesRate: valOrEmpty(matchedLog.newConsumables),
            extraFactor: valOrEmpty(matchedLog.newExtra),
          };
        } else {
          const wt = valOrEmpty(m.rmWeight);
          const rate = valOrEmpty(m.revisedRatePerKg);
          const price = (wt !== '' && rate !== '') ? Number(wt) * Number(rate) : '';
          groupMonths[mDef.name] = {
            log: null,
            wt,
            rate,
            price,
            mmrRate: valOrEmpty(m.mmrRate),
            roRate: valOrEmpty(m.roRate),
            consumablesRate: valOrEmpty(m.consumablesRate),
            extraFactor: valOrEmpty(m.extraFactor),
          };
        }
      });

      if (isHistory && itemLogs.length > 0) {
        const qStartVal = qDef.year * 100 + ((qDef.qIndex - 1) * 3);
        const qEndVal = qDef.year * 100 + ((qDef.qIndex - 1) * 3 + 2);

        let bestRevLog: any = null; let minRevLogVal = Infinity;
        let prevRevLog: any = null; let maxPrevRevLogVal = -1;

        itemLogs.forEach(l => {
          const val = getYearMonthVal(l.fromDate || l.createdAt);
          if (val >= qStartVal && val <= qEndVal && val < minRevLogVal) {
            bestRevLog = l;
            minRevLogVal = val;
          }
          if (val < qStartVal && val >= maxPrevRevLogVal) {
            prevRevLog = l;
            maxPrevRevLogVal = val;
          }
        });

        if (bestRevLog) {
          group.quarterRevisions[qDef.quarterStr] = {
            mmr: revDiff(bestRevLog.newMmr, bestRevLog.oldMmr ?? prevRevLog?.newMmr),
            ro: revDiff(bestRevLog.newCoating, bestRevLog.oldCoating ?? prevRevLog?.newCoating),
            cons: revDiff(bestRevLog.newConsumables, bestRevLog.oldConsumables ?? prevRevLog?.newConsumables),
            extra: revDiff(bestRevLog.newExtra, bestRevLog.oldExtra ?? prevRevLog?.newExtra),
          };
        }
      }
    });

    group.groupMonths = groupMonths;
  });

  // 4. Build Excel Headers
  const merges: any[] = [];
  const row1: any[] = ['', '', '', '', '', '', '', ''];
  const row2: any[] = ['', '', '', '', '', '', '', ''];
  const row3: any[] = [
    'Foreign Name', 'Type of Machine', 'Coating', 'Cavity', 'Core or Sleeve',
    'SAP Rm Code', 'Item Description', 'Grade'
  ];

  let c = 8;
  quartersList.forEach(qDef => {
    const qStartCol = c;
    qDef.months.forEach((mDef, idx) => {
      const isExpanded = autoExpandedMonths.has(mDef.name) && idx < 2;
      const mSpan = isExpanded ? 7 : 3;

      row2[c] = mDef.name;
      if (mSpan > 1) {
        merges.push({ s: { r: 1, c }, e: { r: 1, c: c + mSpan - 1 } });
      }
      for (let i = 1; i < mSpan; i++) row2[c + i] = '';

      row3.push('Rm Weight', 'Revised Rate/Kg', 'Revised Price');
      if (isExpanded) {
        row3.push('MMR', 'Red Oxide', 'Consumable', 'Etc');
      }

      c += mSpan;
    });

    // Quarter Revision Block
    const revStartCol = c;
    row1[revStartCol] = qDef.revisionStr;
    merges.push({ s: { r: 0, c: revStartCol }, e: { r: 1, c: revStartCol + 3 } });
    for (let i = 1; i < 4; i++) row1[revStartCol + i] = '';
    for (let i = 0; i < 4; i++) row2[revStartCol + i] = '';

    row3.push('MMR', 'Red Oxide', 'Consumable', 'Etc');
    c += 4;

    // Quarter header spanning all months in this quarter
    row1[qStartCol] = qDef.quarterStr;
    merges.push({ s: { r: 0, c: qStartCol }, e: { r: 0, c: revStartCol - 1 } });
    for (let i = 1; i < (revStartCol - qStartCol); i++) row1[qStartCol + i] = '';
  });

  // 5. Populate Data Rows
  const dataRows: any[][] = [];
  grouped.forEach(group => {
    const m = group.base;
    const row: any[] = [
      m.customerName || '',
      m.machineType || '',
      m.coating || '',
      m.cavity || '',
      m.coreSleeve || '',
      m.castingCode || m.itemCode || '',
      m.itemDescription || '',
      m.grade || ''
    ];

    quartersList.forEach((qDef) => {
      qDef.months.forEach((mDef, idx) => {
        const mData = group.groupMonths?.[mDef.name];
        if (mData) {
          row.push(mData.wt, mData.rate, mData.price);
        } else {
          row.push('', '', '');
        }

        if (autoExpandedMonths.has(mDef.name) && idx < 2) {
          const nextMonthDef = qDef.months[idx + 1];
          const mDataNext = group.groupMonths?.[nextMonthDef.name];
          const nextLog = mDataNext?.log;
          let showSplits = false;
          if (nextLog) {
            const logVal = getYearMonthVal(nextLog.fromDate || nextLog.createdAt);
            const nextMonthVal = nextMonthDef.year * 100 + nextMonthDef.monthIdx;
            showSplits = logVal === nextMonthVal;
          }
          if (showSplits) {
            row.push(revDiff(nextLog?.newMmr, nextLog?.oldMmr));
            row.push(revDiff(nextLog?.newCoating, nextLog?.oldCoating));
            row.push(revDiff(nextLog?.newConsumables, nextLog?.oldConsumables));
            row.push(revDiff(nextLog?.newExtra, nextLog?.oldExtra));
          } else {
            row.push('', '', '', '');
          }
        }
      });

      const qRev = group.quarterRevisions[qDef.quarterStr];
      if (qRev) {
        row.push(qRev.mmr, qRev.ro, qRev.cons, qRev.extra);
      } else {
        row.push('', '', '', '');
      }
    });
    dataRows.push(row);
  });

  if (dataRows.length === 0) {
    const emptyRow: any[] = ['', '', '', '', '', '', '', ''];
    quartersList.forEach(qDef => {
      qDef.months.forEach((mDef, idx) => {
        emptyRow.push('', '', '');
        if (autoExpandedMonths.has(mDef.name) && idx < 2) {
          emptyRow.push('', '', '', '');
        }
      });
      emptyRow.push('', '', '', '');
    });
    for (let i = 0; i < 50; i++) {
      dataRows.push([...emptyRow]);
    }
  }

  const aoa = [row1, row2, row3, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  // 6. Inject formulas for Revised Price (weight * rate)
  dataRows.forEach((_, rIdx) => {
    const rowNum = 3 + rIdx + 1; // 1-based Excel row number
    let currCol = 8;
    quartersList.forEach(qDef => {
      qDef.months.forEach((mDef, idx) => {
        const wtCol = currCol;
        const rateCol = currCol + 1;
        const priceCol = currCol + 2;
        currCol += 3;

        const wtColLetter = XLSX.utils.encode_col(wtCol);
        const rateColLetter = XLSX.utils.encode_col(rateCol);
        const priceCellRef = XLSX.utils.encode_cell({ r: 3 + rIdx, c: priceCol });
        const wtCellRef = XLSX.utils.encode_cell({ r: 3 + rIdx, c: wtCol });
        const rateCellRef = XLSX.utils.encode_cell({ r: 3 + rIdx, c: rateCol });

        const hasWeight = ws[wtCellRef] && ws[wtCellRef].v !== undefined && ws[wtCellRef].v !== null && ws[wtCellRef].v !== '';
        const hasRate = ws[rateCellRef] && ws[rateCellRef].v !== undefined && ws[rateCellRef].v !== null && ws[rateCellRef].v !== '';

        if (ws[wtCellRef] && (ws[wtCellRef].v === '' || ws[wtCellRef].v === undefined || ws[wtCellRef].v === null)) {
          delete ws[wtCellRef];
        }
        if (ws[rateCellRef] && (ws[rateCellRef].v === '' || ws[rateCellRef].v === undefined || ws[rateCellRef].v === null)) {
          delete ws[rateCellRef];
        }

        const wtVal = hasWeight ? Number(ws[wtCellRef].v) : 0;
        const rateVal = hasRate ? Number(ws[rateCellRef].v) : 0;

        ws[priceCellRef] = {
          t: (hasWeight && hasRate) ? 'n' : 's',
          f: `IF(AND(ISNUMBER(${wtColLetter}${rowNum}), ISNUMBER(${rateColLetter}${rowNum})), ${wtColLetter}${rowNum}*${rateColLetter}${rowNum}, "")`,
          v: (hasWeight && hasRate) ? wtVal * rateVal : '',
          z: '₹ #,##0.00',
        };

        if (autoExpandedMonths.has(mDef.name) && idx < 2) {
          currCol += 4;
        }
      });
      currCol += 4;
    });
  });

  // 7. Styling
  const colStyles = new Map<number, { type: 'month' | 'mmr' | 'split', monthOffset: number, subCol: string }>();
  let currentCol = 8;
  quartersList.forEach(qDef => {
    qDef.months.forEach((mDef, idx) => {
      const monthOffset = idx;
      colStyles.set(currentCol++, { type: 'month', monthOffset, subCol: 'wt' });
      colStyles.set(currentCol++, { type: 'month', monthOffset, subCol: 'rate' });
      colStyles.set(currentCol++, { type: 'month', monthOffset, subCol: 'price' });
      if (autoExpandedMonths.has(mDef.name) && idx < 2) {
        colStyles.set(currentCol++, { type: 'split', monthOffset, subCol: 'mmr' });
        colStyles.set(currentCol++, { type: 'split', monthOffset, subCol: 'ro' });
        colStyles.set(currentCol++, { type: 'split', monthOffset, subCol: 'cons' });
        colStyles.set(currentCol++, { type: 'split', monthOffset, subCol: 'extra' });
      }
    });
    for (let i = 0; i < 4; i++) {
      colStyles.set(currentCol++, { type: 'mmr', monthOffset: -1, subCol: 'mmr' });
    }
  });

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
      const cell = ws[cellRef];

      const isHeader = R <= 2;
      const style: any = {
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        },
        alignment: { vertical: "center", horizontal: "center", wrapText: true }
      };

      if (isHeader) {
        style.font = { bold: true, sz: 11, name: 'Calibri', color: { rgb: "000000" } };
        style.fill = { fgColor: { rgb: "F3F4F6" } };
      } else {
        style.font = { sz: 11, name: 'Calibri' };
        if (C >= 8 && (cell.v !== '' || cell.f)) {
          style.alignment = { vertical: "center", horizontal: "right" };
          if (!cell.z) {
            const colStyle = colStyles.get(C);
            if (colStyle?.subCol === 'wt') {
              cell.z = '#,##0.00';
            } else {
              cell.z = '₹ #,##0.00';
            }
          }
        } else {
          style.alignment = { vertical: "center", horizontal: "center" };
        }
      }

      if (C >= 8) {
        const colStyle = colStyles.get(C);
        if (colStyle) {
          if (R === 0) {
            if (colStyle.type === 'month' || colStyle.type === 'split') {
              style.fill = { fgColor: { rgb: "1B9D4E" } }; // Green
              style.font = { bold: true, sz: 11, name: 'Calibri', color: { rgb: "FFFFFF" } };
            } else if (colStyle.type === 'mmr') {
              style.fill = { fgColor: { rgb: "FFEB3B" } }; // Yellow
              style.font = { bold: true, sz: 11, name: 'Calibri', color: { rgb: "000000" } };
            }
          } else if (R === 1) {
            if (colStyle.type === 'month' || colStyle.type === 'split') {
              if (colStyle.monthOffset === 0) {
                style.fill = { fgColor: { rgb: "FFEEDD" } }; // Peach/Orange
              } else if (colStyle.monthOffset === 1) {
                style.fill = { fgColor: { rgb: "FFDDEE" } }; // Pink
              } else if (colStyle.monthOffset === 2) {
                style.fill = { fgColor: { rgb: "DDEEFF" } }; // Blue
              }
            } else if (colStyle.type === 'mmr') {
              style.fill = { fgColor: { rgb: "FFEB3B" } }; // Yellow
            }
          } else if (R === 2) {
            if (colStyle.type === 'split' || colStyle.type === 'mmr') {
              style.fill = { fgColor: { rgb: "FFEB3B" } }; // Yellow
            } else {
              style.fill = { fgColor: { rgb: "FFFFFF" } };
            }
          }
        }
      }

      cell.s = style;
    }
  }

  const colWidths = [
    { wch: 25 }, // Foreign Name
    { wch: 15 }, // Type of Machine
    { wch: 12 }, // Coating
    { wch: 10 }, // Cavity
    { wch: 18 }, // Core or Sleeve
    { wch: 15 }, // SAP Rm Code
    { wch: 25 }, // Item Description
    { wch: 10 }, // Grade
  ];

  quartersList.forEach(qDef => {
    qDef.months.forEach((mDef, idx) => {
      colWidths.push({ wch: 12 }, { wch: 16 }, { wch: 16 });
      if (autoExpandedMonths.has(mDef.name) && idx < 2) {
        colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 });
      }
    });
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 });
  });

  ws['!cols'] = colWidths;
  ws['!rows'] = [{ hpt: 24 }, { hpt: 24 }, { hpt: 22 }];

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cleanName = (targetVendor.name || 'Vendor').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `VendorPricing_${cleanName}_${dateStr}.xlsx`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'VendorPricing');
  XLSX.writeFile(wb, fileName);
};

export const parseVendorImportFile = (file: File): Promise<{ parsedRows: any[], errCount: number, warnings: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const warnings: string[] = [];
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        let isPivoted = false;
        let headers: string[] = [];
        let dataRows: any[] = [];

        interface MonthInfo {
          label: string;
          fromDate: string;
          toDate: string;
          weightCol: number;
          rateCol: number;
          mmrCol: number;
          roCol: number;
          consCol: number;
          extraCol: number;
        }
        const parsedMonths: MonthInfo[] = [];

        if (rawData.length >= 3) {
          const row3 = rawData[2] as (string | undefined)[];
          const hasForeignName = row3 && row3.some(cell => cell && String(cell).toLowerCase().replace(/\s+/g, '') === 'foreignname');
          const hasGrade = row3 && row3.some(cell => cell && String(cell).toLowerCase().replace(/\s+/g, '') === 'grade');
          if (hasForeignName && hasGrade) {
            isPivoted = true;
            headers = row3.map(c => c || '');
            dataRows = rawData.slice(3);

            const findFactorsRight = (startCol: number) => {
              let mmrCol = -1, roCol = -1, consCol = -1, extraCol = -1;
              for (let i = startCol; i < headers.length; i++) {
                const r3Val = rawData[2]?.[i];
                if (r3Val) {
                  const cleanH = String(r3Val).trim().toLowerCase().replace(/\s+/g, '');
                  if (cleanH === 'mmr') mmrCol = i;
                  else if (cleanH === 'redoxide') roCol = i;
                  else if (cleanH === 'consumable') consCol = i;
                  else if (cleanH === 'etc') {
                    extraCol = i;
                    break;
                  }
                }
              }
              return { mmrCol, roCol, consCol, extraCol };
            };

            // Dynamically scan headers to detect all months and their columns
            for (let c = 8; c < headers.length; c++) {
              const r2Val = rawData[1]?.[c]; // row 2 (month name or empty)
              const r3Val = rawData[2]?.[c]; // row 3 (column header)
              
              if (r2Val && String(r2Val).trim() !== '') {
                const monthStr = String(r2Val).trim();
                const parts = monthStr.split('-');
                if (parts.length === 2) {
                  const shortMonth = parts[0];
                  const shortYear = parts[1];
                  const monthMap: Record<string, number> = {
                    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
                  };
                  const cleanedKey = shortMonth.toLowerCase().trim().slice(0, 3);
                  const m = monthMap[cleanedKey];
                  if (m !== undefined) {
                    const y = shortYear.length === 2 ? 2000 + parseInt(shortYear) : parseInt(shortYear);
                    const fromDateStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                    const lastDay = new Date(y, m + 1, 0).getDate();
                    const toDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                    
                    let weightCol = -1;
                    let rateCol = -1;
                    if (r3Val && (String(r3Val).trim().toLowerCase().replace(/\s+/g, '') === 'rmweight' || String(r3Val).trim().toLowerCase().replace(/\s+/g, '') === 'rmwt')) {
                      weightCol = c;
                    }
                    if (c + 1 < headers.length) {
                      const nextR3Val = rawData[2]?.[c + 1];
                      if (nextR3Val && (String(nextR3Val).trim().toLowerCase().replace(/\s+/g, '') === 'revisedrate/kg' || String(nextR3Val).trim().toLowerCase().replace(/\s+/g, '') === 'revisedrateperkg')) {
                        rateCol = c + 1;
                      }
                    }

                    const factors = findFactorsRight(c);

                    parsedMonths.push({
                      label: monthStr,
                      fromDate: fromDateStr,
                      toDate: toDateStr,
                      weightCol,
                      rateCol,
                      ...factors
                    });
                  }
                }
              }
            }
          }
        }

        if (!isPivoted) {
          const firstRow = rawData[0] as (string | undefined)[];
          const headerKeywords = ['customername', 'castingcode', 'grade', 'fromdate', 'todate', 'foreignname', 'vendorname', 'vendor'];
          const looksLikeHeader = firstRow && firstRow.some(cell => {
            if (!cell) return false;
            const cleaned = String(cell).trim().toLowerCase().replace(/\s+/g, '');
            return headerKeywords.includes(cleaned);
          });

          headers = looksLikeHeader ? (firstRow as string[]) : ['customerName', 'castingCode', 'grade', 'fromDate', 'toDate', 'mmrRate', 'roRate', 'consumablesRate', 'extraFactor', 'rmWeight', 'revisedRatePerKg'];
          dataRows = looksLikeHeader ? rawData.slice(1) : rawData;
        }

        if (!headers || headers.length === 0) {
          reject(new Error('Excel sheet is empty or malformed.'));
          return;
        }

        const headerMap: Record<number, string> = {};
        headers.forEach((h, idx) => {
          if (!h) return;
          const cleanH = h.trim().toLowerCase().replace(/\s+/g, '');
          if (cleanH === 'foreignname' || cleanH === 'customername') headerMap[idx] = 'customerName';
          else if (cleanH === 'saprmcode' || cleanH === 'castingcode') headerMap[idx] = 'castingCode';
          else if (cleanH === 'itemno' || cleanH === 'sapitemcode' || cleanH === 'itemcode') headerMap[idx] = 'itemCode';
          else if (cleanH === 'itemdescription' || cleanH === 'description') headerMap[idx] = 'itemDescription';
          else if (cleanH === 'grade') headerMap[idx] = 'grade';
          else if (cleanH === 'typeofmachine' || cleanH === 'machinetype') headerMap[idx] = 'machineType';
          else if (cleanH === 'coating') headerMap[idx] = 'coating';
          else if (cleanH === 'cavity') headerMap[idx] = 'cavity';
          else if (cleanH === 'coreorsleeve' || cleanH === 'coresleeve') headerMap[idx] = 'coreSleeve';
          
          if (!isPivoted) {
            if (cleanH === 'validfrom' || cleanH === 'fromdate') headerMap[idx] = 'fromDate';
            else if (cleanH === 'validto' || cleanH === 'todate') headerMap[idx] = 'toDate';
            else if (cleanH === 'mmr' || cleanH === 'mmrrate') headerMap[idx] = 'mmrRate';
            else if (cleanH === 'redoxide' || cleanH === 'rorate') headerMap[idx] = 'roRate';
            else if (cleanH === 'consumables' || cleanH === 'consumablesrate') headerMap[idx] = 'consumablesRate';
            else if (cleanH === 'extrafactor') headerMap[idx] = 'extraFactor';
            else if (cleanH === 'rmwt' || cleanH === 'rmweight' || cleanH === 'weight') headerMap[idx] = 'rmWeight';
            else if (cleanH === 'revisedrate' || cleanH === 'revisedrateperkg' || cleanH === 'revisedrate/kg') headerMap[idx] = 'revisedRatePerKg';
          }
        });

        if (!Object.values(headerMap).includes('grade')) {
          warnings.push('Grade column not found; proceeding without it.');
        }

        let errCount = 0;
        const filteredData = dataRows.filter((row: any) => {
          if (!Array.isArray(row)) return false;
          return row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '' && String(cell).trim() !== '—');
        });

        const parsedRows: any[] = [];

        if (isPivoted && parsedMonths.length > 0) {
          filteredData.forEach((rowArr: any, rowIdx: number) => {
            const metaObj: Record<string, any> = {
              customerName: 'All',
              castingCode: 'All',
              machineType: '',
              coating: '',
              cavity: '',
              coreSleeve: '',
              itemCode: '',
              itemDescription: '',
              grade: ''
            };

            headers.forEach((_, colIdx) => {
              if (colIdx < 8) { // cols 0–7 are meta fields (ForeignName through Grade)
                const fieldName = headerMap[colIdx];
                if (fieldName) {
                  const val = rowArr[colIdx];
                  let strVal = val !== undefined && val !== null ? String(val).trim() : '';
                  if (strVal === '—' || strVal === '-') {
                    strVal = '';
                  }
                  metaObj[fieldName] = strVal;
                }
              }
            });
            metaObj.itemCode = metaObj.castingCode;

            parsedMonths.forEach((mInfo, mIdx) => {
              // Read the two columns the user explicitly fills per month.
              // Use these RAW values to decide whether this month has any data —
              // BEFORE running the MMR fallback, so a shared extraFactor=1 in the
              // quarter's MMR columns cannot create ghost rows for empty months.
              const rawRmWeight = mInfo.weightCol !== -1 && rowArr[mInfo.weightCol] !== undefined && rowArr[mInfo.weightCol] !== null
                ? parseFloat(String(rowArr[mInfo.weightCol])) || 0 : 0;
              const rawRate = mInfo.rateCol !== -1 && rowArr[mInfo.rateCol] !== undefined && rowArr[mInfo.rateCol] !== null
                ? parseFloat(String(rowArr[mInfo.rateCol])) || 0 : 0;

              // Skip months where the user left both Rm Weight and Revised Rate/Kg blank.
              // This prevents the shared per-quarter MMR/Etc columns from inflating empty months.
              if (rawRmWeight === 0 && rawRate === 0) return;

              const rmWeight = rawRmWeight;
              const mmrRate = mInfo.mmrCol !== -1 && rowArr[mInfo.mmrCol] !== undefined && rowArr[mInfo.mmrCol] !== null ? parseFloat(String(rowArr[mInfo.mmrCol])) || 0 : 0;
              const roRate = mInfo.roCol !== -1 && rowArr[mInfo.roCol] !== undefined && rowArr[mInfo.roCol] !== null ? parseFloat(String(rowArr[mInfo.roCol])) || 0 : 0;
              const consumablesRate = mInfo.consCol !== -1 && rowArr[mInfo.consCol] !== undefined && rowArr[mInfo.consCol] !== null ? parseFloat(String(rowArr[mInfo.consCol])) || 0 : 0;
              const extraFactor = mInfo.extraCol !== -1 && rowArr[mInfo.extraCol] !== undefined && rowArr[mInfo.extraCol] !== null ? parseFloat(String(rowArr[mInfo.extraCol])) || 0 : 0;

              // If user filled weight but left rate blank, derive it from MMR components
              let revisedRatePerKg = rawRate;
              if (!revisedRatePerKg) {
                revisedRatePerKg = +((mmrRate || 0) + (roRate || 0) + (consumablesRate || 0) + (extraFactor || 0)).toFixed(2);
              }

              parsedRows.push({
                id: `row-${rowIdx}-m-${mIdx}`,
                validationErrors: [],
                ...metaObj,
                fromDate: mInfo.fromDate,
                toDate: mInfo.toDate,
                rmWeight,
                revisedRatePerKg,
                mmrRate,
                roRate,
                consumablesRate,
                extraFactor
              });
            });
          });
        } else {
          filteredData.forEach((rowArr: any, rowIdx: number) => {
            const rowObj: Record<string, any> = {
              id: `row-${rowIdx}`,
              validationErrors: [],
              customerName: 'All',
              castingCode: 'All',
              machineType: '',
              coating: '',
              cavity: '',
              coreSleeve: '',
              itemCode: '',
              itemDescription: '',
              fromDate: '',
              toDate: '',
              rmWeight: 0,
              mmrRate: 0,
              roRate: 0,
              consumablesRate: 0,
              extraFactor: 0,
              revisedRatePerKg: 0
            };

            headers.forEach((_, colIdx) => {
              const fieldName = headerMap[colIdx];
              if (fieldName) {
                const val = rowArr[colIdx];
                if (['mmrRate', 'roRate', 'consumablesRate', 'extraFactor', 'rmWeight', 'revisedRatePerKg'].includes(fieldName)) {
                  rowObj[fieldName] = val !== undefined && val !== null ? parseFloat(String(val)) || 0 : 0;
                } else if (['fromDate', 'toDate'].includes(fieldName)) {
                  if (typeof val === 'number') {
                    const ms = (val - 25569) * 86400 * 1000;
                    const date = new Date(ms);
                    rowObj[fieldName] = date.toISOString().split('T')[0];
                  } else if (val) {
                    const strVal = String(val).trim();
                    rowObj[fieldName] = strVal;

                    const d = new Date(strVal);
                    if (isNaN(d.getTime())) {
                      const parts = strVal.split(/[\/\-\.]/);
                      let fallbackValid = false;
                      if (parts.length === 3) {
                        const attempt1 = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        const attempt2 = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
                        if (!isNaN(attempt1.getTime())) { rowObj[fieldName] = attempt1.toISOString().split('T')[0]; fallbackValid = true; }
                        else if (!isNaN(attempt2.getTime())) { rowObj[fieldName] = attempt2.toISOString().split('T')[0]; fallbackValid = true; }
                      }
                      if (!fallbackValid) {
                        rowObj.validationErrors.push(`Invalid Date in ${fieldName}: ${strVal}`);
                      }
                    }
                  } else {
                    rowObj[fieldName] = '';
                  }
                } else {
                  let strVal = val !== undefined && val !== null ? String(val).trim() : '';
                  if (strVal === '—' || strVal === '-') {
                    strVal = '';
                  }
                  rowObj[fieldName] = strVal;
                }
              }
            });

            if (rowObj.castingCode && !rowObj.itemCode) {
              rowObj.itemCode = rowObj.castingCode;
            }

            if (!rowObj.revisedRatePerKg) {
              rowObj.revisedRatePerKg = +((rowObj.mmrRate || 0) + (rowObj.roRate || 0) + (rowObj.consumablesRate || 0) + (rowObj.extraFactor || 0)).toFixed(2);
            }

            if (rowObj.validationErrors.length > 0) errCount++;
            parsedRows.push(rowObj);
          });
        }

        resolve({ parsedRows, errCount, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
