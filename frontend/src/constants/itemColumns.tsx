
/** Strip time portion from ISO date strings (e.g. "2024-12-31T18:30:00.000Z" → "2024-12-31") */
const formatDate = (val: any): string => {
  if (!val) return '-';
  const s = String(val).trim();
  if (!s) return '-';
  const cleanStr = s.includes('T') ? s.split('T')[0] : s;
  const parts = cleanStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    // yyyy-mm-dd format
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return cleanStr;
};

const formatSpecialCoating = (val: any): string => {
  if (val === null || val === undefined || val === '' || val === '-' || val === '—') return '-';
  const s = String(val).trim();
  const num = Number(s);
  return !isNaN(num) && s !== '' ? num.toFixed(2) : s;
};

export const getDomesticColumns = (_getVendorName: (id: string) => string) => [
  { key: 'customerCode', header: 'Customer Code', render: (i: any) => i.customerCode || '-' },
  { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '-' },
  { key: 'customerApprovalFoundry', header: 'Customer Approval Foundry', render: (i: any) => i.customerApprovalFoundry || '-' },
  { key: 'specialCoating', header: 'Special Coating', render: (i: any) => formatSpecialCoating(i.specialCoating) },
  { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '-' },
  { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '-' },
  { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
  { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div> },
  { key: 'itemGroup', header: 'Group Name', render: (i: any) => i.itemGroup || '' },
  { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '' },
  { key: 'exportDomestic', header: 'Domestic/Export', render: (i: any) => i.exportDomestic || '' },
  { key: 'weight', header: 'Casting Wt(Kg)', render: (i: any) => i.weight ? `${Number(i.weight).toFixed(2)} kg` : '-' },
  { key: 'ratePerKg', header: 'Casting Rate/Kg', render: (i: any) => i.ratePerKg ? `₹${Number(i.ratePerKg).toFixed(2)}` : '-' },
  { key: 'castingPrice', header: 'Casting Price', render: (i: any) => {
      const wt = Number(i.weight || 0);
      const rate = Number(i.ratePerKg || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'rejectionCost', header: 'Rejection Cost', render: (i: any) => i.rejectionCost ? `₹${Number(i.rejectionCost).toFixed(2)}` : '-' },
  { key: 'powderCoating', header: 'Powder Coating', render: (i: any) => i.powderCoating ? `₹${Number(i.powderCoating).toFixed(2)}` : '-' },
  { key: 'specialProcess', header: 'Special Process', render: (i: any) => i.specialProcess ? `₹${Number(i.specialProcess).toFixed(2)}` : '-' },
  { key: 'process', header: 'Process (Machining+others)', render: (i: any) => i.process ? `₹${Number(i.process).toFixed(2)}` : '-' },
  { key: 'transCharges', header: 'Trans Charges', render: (i: any) => i.transCharges ? `₹${Number(i.transCharges).toFixed(2)}` : '-' },
  { key: 'ohp', header: 'OHP', render: (i: any) => i.ohp ? `₹${Number(i.ohp).toFixed(2)}` : '-' },
  { key: 'packing', header: 'Packing', render: (i: any) => i.packing ? `₹${Number(i.packing).toFixed(2)}` : '-' },
  { key: 'totalWorkingCost', header: 'Total Working Cost', render: (i: any) => i.totalWorkingCost ? `₹${Number(i.totalWorkingCost).toFixed(2)}` : '-' },
  { key: 'finalPrice', header: 'Final Price', render: (i: any) => i.finalPrice ? `₹${Number(i.finalPrice).toFixed(2)}` : '-' },
  { key: 'fromDate', header: 'From Date', render: (i: any) => formatDate(i.fromDate) },
  { key: 'toDate', header: 'To Date', render: (i: any) => formatDate(i.toDate) }
];

export const getExportColumns = (_getVendorName: (id: string) => string) => [
  { key: 'customerCode', header: 'Customer Code', render: (i: any) => i.customerCode || '-' },
  { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '-' },
  { key: 'customerApprovalFoundry', header: 'Customer Approval Foundry', render: (i: any) => i.customerApprovalFoundry || '-' },
  { key: 'specialCoating', header: 'Special Coating', render: (i: any) => formatSpecialCoating(i.specialCoating) },
  { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '-' },
  { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '-' },
  { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
  { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div> },
  { key: 'itemGroup', header: 'Group Name', render: (i: any) => i.itemGroup || '' },
  { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '' },
  { key: 'exportDomestic', header: 'Domestic/Export', render: (i: any) => i.exportDomestic || '' },
  { key: 'weight', header: 'Casting Wt(Kg)', render: (i: any) => i.weight ? `${Number(i.weight).toFixed(2)} kg` : '-' },
  { key: 'ratePerKg', header: 'Casting Rate/Kg', render: (i: any) => i.ratePerKg ? `₹${Number(i.ratePerKg).toFixed(2)}` : '-' },
  { key: 'castingPrice', header: 'Casting Price', render: (i: any) => {
      const wt = Number(i.weight || 0);
      const rate = Number(i.ratePerKg || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'rejectionCost', header: 'Rejection Cost', render: (i: any) => i.rejectionCost ? `₹${Number(i.rejectionCost).toFixed(2)}` : '-' },
  { key: 'powderCoating', header: 'Powder Coating', render: (i: any) => i.powderCoating ? `₹${Number(i.powderCoating).toFixed(2)}` : '-' },
  { key: 'specialProcess', header: 'Special Process', render: (i: any) => i.specialProcess ? `₹${Number(i.specialProcess).toFixed(2)}` : '-' },
  { key: 'process', header: 'Process (Machining+others)', render: (i: any) => i.process ? `₹${Number(i.process).toFixed(2)}` : '-' },
  { key: 'transCharges', header: 'Trans Charges', render: (i: any) => i.transCharges ? `₹${Number(i.transCharges).toFixed(2)}` : '-' },
  { key: 'ohp', header: 'OHP', render: (i: any) => i.ohp ? `₹${Number(i.ohp).toFixed(2)}` : '-' },
  { key: 'packing', header: 'Packing', render: (i: any) => i.packing ? `₹${Number(i.packing).toFixed(2)}` : '-' },
  { key: 'totalWorkingCost', header: 'Total Working Cost', render: (i: any) => i.totalWorkingCost ? `₹${Number(i.totalWorkingCost).toFixed(2)}` : '-' },
  { key: 'finalPrice', header: 'Final Price', render: (i: any) => i.finalPrice ? `₹${Number(i.finalPrice).toFixed(2)}` : '-' },
  { key: 'lessDomesticPacking', header: 'Less Domestic Packing (if BTPL Code)', render: (i: any) => i.lessDomesticPacking ? `₹${Number(i.lessDomesticPacking).toFixed(2)}` : '-' },
  { key: 'assemblyCost', header: 'Assembly Cost', render: (i: any) => i.assemblyCost ? `₹${Number(i.assemblyCost).toFixed(2)}` : '-' },
  { key: 'exportPackingCost', header: 'Export Packing cost', render: (i: any) => i.exportPackingCost ? `₹${Number(i.exportPackingCost).toFixed(2)}` : '-' },
  { key: 'fobCost', header: 'FOB Cost/piece', render: (i: any) => i.fobCost ? `₹${Number(i.fobCost).toFixed(2)}` : '-' },
  { key: 'ohIccExport', header: 'OH & ICC on Export', render: (i: any) => i.ohIccExport ? `₹${Number(i.ohIccExport).toFixed(2)}` : '-' },
  { key: 'addedExportOverheads', header: 'Added Export over Heads', render: (i: any) => i.addedExportOverheads ? `₹${Number(i.addedExportOverheads).toFixed(2)}` : '-' },
  { key: 'unitPriceExport', header: 'Unit Price for Export', render: (i: any) => {
      if (i.unitPriceExport) return `₹${Number(i.unitPriceExport).toFixed(2)}`;
      const fp = Number(i.finalPrice || 0);
      const ldp = Number(i.lessDomesticPacking || 0);
      const ac = Number(i.assemblyCost || 0);
      const epc = Number(i.exportPackingCost || 0);
      const fob = Number(i.fobCost || 0);
      const oh = Number(i.ohIccExport || 0);
      const aeh = Number(i.addedExportOverheads || 0);
      const upe = fp - ldp + ac + epc + fob + oh + aeh;
      return upe ? `₹${upe.toFixed(2)}` : '-';
    }
  },
  { key: 'forex', header: 'Forex', render: (i: any) => i.forex ? Number(i.forex).toFixed(2) : '-' },
  { key: 'unitPriceForeignCurrency', header: 'Unit Price in Foreign Currency', render: (i: any) => {
      const currency = i.currency || 'USD';
      if (i.unitPriceForeignCurrency) return `${currency} ${Number(i.unitPriceForeignCurrency).toFixed(2)}`;
      const forex = Number(i.forex || 0);
      if (forex <= 0) return '-';
      const fp = Number(i.finalPrice || 0);
      const ldp = Number(i.lessDomesticPacking || 0);
      const ac = Number(i.assemblyCost || 0);
      const epc = Number(i.exportPackingCost || 0);
      const fob = Number(i.fobCost || 0);
      const oh = Number(i.ohIccExport || 0);
      const aeh = Number(i.addedExportOverheads || 0);
      const upe = fp - ldp + ac + epc + fob + oh + aeh;
      return upe ? `${currency} ${(upe / forex).toFixed(2)}` : '-';
    }
  },
  { key: 'fromDate', header: 'From Date', render: (i: any) => formatDate(i.fromDate) },
  { key: 'toDate', header: 'To Date', render: (i: any) => formatDate(i.toDate) }
];

export const getLabourColumns = () => [
  { key: 'customerCode', header: 'Customer Code', render: (i: any) => i.customerCode || '-' },
  { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '-' },
  { key: 'specialCoating', header: 'Special Coating', render: (i: any) => formatSpecialCoating(i.specialCoating) },
  { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '-' },
  { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '-' },
  { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
  { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div> },
  { key: 'itemGroup', header: 'Group Name', render: (i: any) => i.itemGroup || '' },
  { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '' },
  { key: 'exportDomestic', header: 'Domestic/Export', render: (i: any) => i.exportDomestic || '' },
  { key: 'powderCoating', header: 'Powder Coating', render: (i: any) => i.powderCoating ? `₹${Number(i.powderCoating).toFixed(2)}` : '-' },
  { key: 'specialProcess', header: 'Special Process', render: (i: any) => i.specialProcess ? `₹${Number(i.specialProcess).toFixed(2)}` : '-' },
  { key: 'process', header: 'Process (Machining+others)', render: (i: any) => i.process ? `₹${Number(i.process).toFixed(2)}` : '-' },
  { key: 'transCharges', header: 'Trans Charges', render: (i: any) => i.transCharges ? `₹${Number(i.transCharges).toFixed(2)}` : '-' },
  { key: 'ohp', header: 'OHP', render: (i: any) => i.ohp ? `₹${Number(i.ohp).toFixed(2)}` : '-' },
  { key: 'packing', header: 'Packing', render: (i: any) => i.packing ? `₹${Number(i.packing).toFixed(2)}` : '-' },
  { key: 'totalWorkingCost', header: 'Total Working Cost', render: (i: any) => i.totalWorkingCost ? `₹${Number(i.totalWorkingCost).toFixed(2)}` : '-' },
  { key: 'finalPrice', header: 'Final Price', render: (i: any) => i.finalPrice ? `₹${Number(i.finalPrice).toFixed(2)}` : '-' },
  { key: 'fromDate', header: 'From Date', render: (i: any) => formatDate(i.fromDate) },
  { key: 'toDate', header: 'To Date', render: (i: any) => formatDate(i.toDate) }
];

export const getPinBushColumns = (_getVendorName: (id: string) => string) => [
  { key: 'customerCode', header: 'Customer Code', render: (i: any) => i.customerCode || '-' },
  { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '-' },
  { key: 'customerApprovalFoundry', header: 'Customer Approval Foundry', render: (i: any) => i.customerApprovalFoundry || '-' },
  { key: 'specialCoating', header: 'Special Coating', render: (i: any) => formatSpecialCoating(i.specialCoating) },
  { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '-' },
  { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '-' },
  { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
  { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div> },
  { key: 'itemGroup', header: 'Group Name', render: (i: any) => i.itemGroup || '' },
  { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '' },
  { key: 'exportDomestic', header: 'Domestic/Export', render: (i: any) => i.exportDomestic || '' },
  { key: 'weight', header: 'Casting Wt(Kg)', render: (i: any) => i.weight ? `${Number(i.weight).toFixed(2)} kg` : '-' },
  { key: 'ratePerKg', header: 'Casting Rate/Kg (INR)', render: (i: any) => i.ratePerKg ? `₹${Number(i.ratePerKg).toFixed(2)}` : '-' },
  { key: 'castingPrice', header: 'Casting Price', render: (i: any) => {
      const wt = Number(i.weight || 0);
      const rate = Number(i.ratePerKg || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'rejectionCost', header: 'Rejection Cost', render: (i: any) => i.rejectionCost ? `₹${Number(i.rejectionCost).toFixed(2)}` : '-' },
  { key: 'cutting', header: 'Cutting', render: (i: any) => i.cutting ? `₹${Number(i.cutting).toFixed(2)}` : '-' },
  { key: 'process', header: 'Process (Machining+others)', render: (i: any) => i.process ? `₹${Number(i.process).toFixed(2)}` : '-' },
  { key: 'transCharges', header: 'Trans Charges', render: (i: any) => i.transCharges ? `₹${Number(i.transCharges).toFixed(2)}` : '-' },
  { key: 'ohp', header: 'OHP', render: (i: any) => i.ohp ? `₹${Number(i.ohp).toFixed(2)}` : '-' },
  { key: 'packing', header: 'Packing', render: (i: any) => i.packing ? `₹${Number(i.packing).toFixed(2)}` : '-' },
  { key: 'hardeningWt', header: 'Hardening Wt(Kg)', render: (i: any) => i.hardeningWt ? `${Number(i.hardeningWt).toFixed(2)} kg` : '-' },
  { key: 'hardeningRate', header: 'Hardening Rate/Kg', render: (i: any) => i.hardeningRate ? `₹${Number(i.hardeningRate).toFixed(2)}` : '-' },
  { key: 'hardeningPrice', header: 'Hardening Price', render: (i: any) => {
      const wt = Number(i.hardeningWt || 0);
      const rate = Number(i.hardeningRate || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'grinding', header: 'Grinding', render: (i: any) => i.grinding ? `₹${Number(i.grinding).toFixed(2)}` : '-' },
  { key: 'hardChromeWt', header: 'Hard Chrome Wt(Kg)', render: (i: any) => i.hardChromeWt ? `${Number(i.hardChromeWt).toFixed(2)} kg` : '-' },
  { key: 'hardChromeRate', header: 'Hard Chrome Rate/Kg', render: (i: any) => i.hardChromeRate ? `₹${Number(i.hardChromeRate).toFixed(2)}` : '-' },
  { key: 'hardChromePrice', header: 'Hard Chrome Price', render: (i: any) => {
      const wt = Number(i.hardChromeWt || 0);
      const rate = Number(i.hardChromeRate || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'totalWorkingCost', header: 'Total Working Cost', render: (i: any) => i.totalWorkingCost ? `₹${Number(i.totalWorkingCost).toFixed(2)}` : '-' },
  { key: 'finalPrice', header: 'Final Price', render: (i: any) => i.finalPrice ? `₹${Number(i.finalPrice).toFixed(2)}` : '-' },
  { key: 'fromDate', header: 'From Date', render: (i: any) => formatDate(i.fromDate) },
  { key: 'toDate', header: 'To Date', render: (i: any) => formatDate(i.toDate) }
];

export const getCustomerPricingColumns = () => [
  { key: 'customerCode', header: 'Customer Code', render: (i: any) => i.customerCode || '-' },
  { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '-' },
  { key: 'customerApprovalFoundry', header: 'Customer Approval Foundry', render: (i: any) => i.customerApprovalFoundry || '-' },
  { key: 'specialCoating', header: 'Special Coating', render: (i: any) => formatSpecialCoating(i.specialCoating) },
  { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '-' },
  { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '-' },
  { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
  { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div> },
  { key: 'itemGroup', header: 'Group Name', render: (i: any) => i.itemGroup || '' },
  { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '' },
  { key: 'exportDomestic', header: 'Domestic/Export', render: (i: any) => i.exportDomestic || '' },
  { key: 'weight', header: 'Casting Wt(Kg)', render: (i: any) => i.weight ? `${Number(i.weight).toFixed(2)} kg` : '-' },
  { key: 'ratePerKg', header: 'Casting Rate/Kg', render: (i: any) => i.ratePerKg ? `₹${Number(i.ratePerKg).toFixed(2)}` : '-' },
  { key: 'castingPrice', header: 'Casting Price', render: (i: any) => {
      const wt = Number(i.weight || 0);
      const rate = Number(i.ratePerKg || 0);
      const cp = wt * rate;
      return cp ? `₹${cp.toFixed(2)}` : '-';
    }
  },
  { key: 'fromDate', header: 'From Date', render: (i: any) => formatDate(i.fromDate) },
  { key: 'toDate', header: 'To Date', render: (i: any) => formatDate(i.toDate) }
];
