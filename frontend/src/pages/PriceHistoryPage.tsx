import React, { useEffect, useMemo, useState } from 'react';
import { pricingApi } from '../api/pricingApi';
import { SearchableSelect } from '../components/ui';
import { BRAND, MESSAGES } from '../constants';
import { ItemPriceHistory } from '../types';

import { exportPriceHistoryToExcel } from '../utils/exportUtils';
import { getMonthFullName, getMonthsRangeData, getYearMonthVal, MonthRangeDef } from '../utils/quarterUtils';

interface MonthLogData {
  log: ItemPriceHistory | null;
  revLog: ItemPriceHistory | null;
  mmrSplit: number;
  roSplit: number;
  consSplit: number;
  extraSplit: number;
  hasRevision: boolean;
}

interface GroupedItem {
  key: string;
  foreignName: string;
  castingCode: string;
  itemDescription: string;
  vendor: string;
  grade: string;
  domesticExport?: string;
  rmWeight?: number;
  months: Record<string, MonthLogData>;
}

const fmtSplitVal = (val: number): string => {
  if (val === 0) return '0';
  return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
};

export const PriceHistoryPage: React.FC = () => {
  const [mode, setMode] = useState<'vendor' | 'customer'>('vendor');
  const [history, setHistory] = useState<ItemPriceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [castingCodeFilter, setCastingCodeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-11

  // Default From-To range: Dec (Prior Year) to Dec (Current Year)
  const [fromYear, setFromYear] = useState<number>(currentYear - 1);
  const [fromMonth, setFromMonth] = useState<number>(11); // 11 = Dec
  const [toYear, setToYear] = useState<number>(currentYear);
  const [toMonth, setToMonth] = useState<number>(11); // 11 = Dec

  const [vendorFiltersData, setVendorFiltersData] = useState<{ castingCodes: string[]; itemCodes: string[]; vendors: { id: string; name: string }[] }>({ castingCodes: [], itemCodes: [], vendors: [] });
  const [customerFiltersData, setCustomerFiltersData] = useState<{ castingCodes: string[]; customers: { code: string; name: string }[] }>({ castingCodes: [], customers: [] });

  const castingCodes = mode === 'customer' ? customerFiltersData.castingCodes : vendorFiltersData.castingCodes;

  const loadFilters = async (m: 'vendor' | 'customer') => {
    try {
      const res = await pricingApi.getPriceLogFilters(m);
      if (m === 'customer') {
        setCustomerFiltersData({
          castingCodes: res?.castingCodes || [],
          customers: res?.customers || [],
        });
      } else {
        setVendorFiltersData({
          castingCodes: res?.castingCodes || [],
          itemCodes: res?.itemCodes || [],
          vendors: res?.vendors || [],
        });
      }
    } catch (err) { console.error(err); }
  };

  const loadHistory = async (m: 'vendor' | 'customer', ccFilter: string, vFilter: string, custFilter: string) => {
    setLoading(true);
    try {
      const res = m === 'customer'
        ? await pricingApi.getPriceLog(ccFilter, '', '', 'customer', custFilter)
        : await pricingApi.getPriceLog(ccFilter, '', vFilter, 'vendor');
      if (res) setHistory(res);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadFilters('vendor'); loadFilters('customer'); }, []);

  useEffect(() => {
    setCastingCodeFilter(''); setVendorFilter(''); setCustomerFilter(''); setHistory([]); setPage(1);
    loadHistory(mode, '', '', '');
  }, [mode]);

  useEffect(() => {
    setPage(1);
    loadHistory(mode, castingCodeFilter, vendorFilter, customerFilter);
  }, [castingCodeFilter, vendorFilter, customerFilter]);

  const monthsList: MonthRangeDef[] = useMemo(() => {
    return getMonthsRangeData(fromYear, fromMonth, toYear, toMonth);
  }, [fromYear, fromMonth, toYear, toMonth]);

  const groupedData = useMemo(() => {
    const groups: Record<string, GroupedItem> = {};
    const sortedHistory = [...history].sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

    const normalizeCode = (code?: string) => {
      if (!code) return '';
      return code.trim().toUpperCase().replace(/-RM$/i, '');
    };

    const getKey = (log: ItemPriceHistory) => {
      const vId = (log.vendorId || log.vendorName || '-').trim().toUpperCase();
      const code = normalizeCode(log.castingCode || log.itemCode);
      if (mode === 'customer') {
        const itemCodeNorm = normalizeCode(log.itemCode);
        return `${itemCodeNorm}|${code}|${(log.customerCode || log.customerName || '-').trim().toUpperCase()}`;
      }
      return `${vId}|${code}`;
    };

    sortedHistory.forEach(log => {
      const key = getKey(log);
      if (!groups[key]) {
        groups[key] = {
          key,
          foreignName: log.customerName || '-',
          castingCode: log.castingCode || '-',
          itemDescription: log.itemDescription || '-',
          vendor: mode === 'customer' ? (log.customerApprovalFoundry || log.customerName || '-') : (log.vendorName || log.vendorId || '-'),
          grade: log.grade || '-',
          domesticExport: log.domesticExport,
          rmWeight: log.rmWeight ?? log.newCastWeight,
          months: {},
        };
      } else {
        if (log.rmWeight && !groups[key].rmWeight) {
          groups[key].rmWeight = log.rmWeight ?? log.newCastWeight;
        }
        if (log.itemDescription && (groups[key].itemDescription === '-' || !groups[key].itemDescription)) {
          groups[key].itemDescription = log.itemDescription;
        }
        if (log.grade && (groups[key].grade === '-' || !groups[key].grade)) {
          groups[key].grade = log.grade;
        }
        if (log.customerName && (groups[key].foreignName === '-' || !groups[key].foreignName)) {
          groups[key].foreignName = log.customerName;
        }
      }
    });

    const logsByKey: Record<string, ItemPriceHistory[]> = {};
    sortedHistory.forEach(log => {
      const key = getKey(log);
      if (!logsByKey[key]) logsByKey[key] = [];
      logsByKey[key].push(log);
    });

    const finalGroups = Object.values(groups).map(g => {
      const finalMonths: Record<string, MonthLogData> = {};
      const itemLogs = logsByKey[g.key] || [];

      monthsList.forEach(mDef => {
        const mVal = mDef.yearMonthVal;
        let bestLog: ItemPriceHistory | null = null;
        let maxLogVal = 0;
        let revLog: ItemPriceHistory | null = null;

        itemLogs.forEach(log => {
          const val = getYearMonthVal(log.fromDate || log.createdAt);
          let isValid = val <= mVal;
          if (isValid && log.toDate) {
            const toVal = getYearMonthVal(log.toDate);
            if (mVal > toVal) isValid = false;
          }
          if (isValid && val >= maxLogVal) {
            bestLog = log;
            maxLogVal = val;
          }

          if (val === mVal) {
            revLog = log;
          }
        });

        let mmrSplit = 0;
        let roSplit = 0;
        let consSplit = 0;
        let extraSplit = 0;
        let hasRevision = false;

        if (revLog) {
          hasRevision = true;
          mmrSplit = (revLog as any).newMmr !== undefined && (revLog as any).oldMmr !== undefined 
            ? Number((revLog as any).newMmr) - Number((revLog as any).oldMmr)
            : Number((revLog as any).newMmr ?? 0);

          roSplit = (revLog as any).newCoating !== undefined && (revLog as any).oldCoating !== undefined 
            ? Number((revLog as any).newCoating) - Number((revLog as any).oldCoating)
            : Number((revLog as any).newCoating ?? 0);

          consSplit = (revLog as any).newConsumables !== undefined && (revLog as any).oldConsumables !== undefined 
            ? Number((revLog as any).newConsumables) - Number((revLog as any).oldConsumables)
            : Number((revLog as any).newConsumables ?? 0);

          extraSplit = (revLog as any).newExtra !== undefined && (revLog as any).oldExtra !== undefined 
            ? Number((revLog as any).newExtra) - Number((revLog as any).oldExtra)
            : Number((revLog as any).newExtra ?? 0);
        }

        finalMonths[mDef.name] = {
          log: bestLog,
          revLog,
          mmrSplit,
          roSplit,
          consSplit,
          extraSplit,
          hasRevision,
        };
      });

      return { ...g, months: finalMonths };
    });

    if (debouncedSearchTerm.trim()) {
      const lower = debouncedSearchTerm.toLowerCase();
      return finalGroups.filter(g =>
        (g.foreignName && g.foreignName.toLowerCase().includes(lower)) ||
        (g.castingCode && g.castingCode.toLowerCase().includes(lower)) ||
        (g.itemDescription && g.itemDescription.toLowerCase().includes(lower)) ||
        (g.vendor && g.vendor.toLowerCase().includes(lower)) ||
        (g.grade && g.grade.toLowerCase().includes(lower)) ||
        (g.key && g.key.toLowerCase().includes(lower))
      );
    }
    return finalGroups;
  }, [history, monthsList, debouncedSearchTerm, mode]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groupedData.slice(start, start + pageSize);
  }, [groupedData, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(groupedData.length / pageSize));

  const thClass = "px-3 py-2 border border-gray-300 text-sm font-bold text-gray-900 bg-white whitespace-nowrap";
  const hasActiveFilter = castingCodeFilter || vendorFilter || customerFilter || fromYear !== (currentYear - 1) || fromMonth !== 11 || toYear !== currentYear || toMonth !== 11;

  const resetFilters = () => {
    setCastingCodeFilter('');
    setVendorFilter('');
    setCustomerFilter('');
    setFromYear(currentYear - 1);
    setFromMonth(11);
    setToYear(currentYear);
    setToMonth(11);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
      <div className="bg-white border-b border-gray-200 relative z-50 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">
                {mode === 'vendor' ? 'Vendor Price History' : 'Customer Price History'}
              </h1>
              <span className="text-sm text-gray-500 font-medium">({groupedData.length} records)</span>
            </div>
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
              {(['vendor', 'customer'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 capitalize ${
                    mode === m ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Bar Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <SearchableSelect
              value={castingCodeFilter}
              onChange={setCastingCodeFilter}
              options={castingCodes}
              placeholder="All Casting Codes"
              className="w-[170px]"
              style={{ backgroundColor: '#ffffff' }}
            />

            {mode === 'vendor' ? (
              <SearchableSelect
                value={vendorFilter}
                onChange={setVendorFilter}
                options={vendorFiltersData.vendors.map(v => ({ value: v.id, label: v.name || v.id }))}
                placeholder="All Vendors"
                className="w-[180px]"
                style={{ backgroundColor: '#ffffff' }}
              />
            ) : (
              <SearchableSelect
                value={customerFilter}
                onChange={setCustomerFilter}
                options={customerFiltersData.customers.map(c => ({ value: c.code, label: c.name }))}
                placeholder="All Customers"
                className="w-[180px]"
                style={{ backgroundColor: '#ffffff' }}
              />
            )}

            {/* From Selector */}
            <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-300 rounded-lg text-xs">
              <span className="font-semibold text-gray-600 pl-1">From:</span>
              <select
                value={fromYear}
                onChange={e => setFromYear(Number(e.target.value))}
                className="h-[30px] px-1.5 rounded border text-xs bg-white font-medium focus:outline-none"
              >
                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={fromMonth}
                onChange={e => setFromMonth(Number(e.target.value))}
                className="h-[30px] px-1.5 rounded border text-xs bg-white font-medium focus:outline-none"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(mIdx => (
                  <option key={mIdx} value={mIdx}>{getMonthFullName(mIdx).slice(0, 3)}</option>
                ))}
              </select>
            </div>

            {/* To Selector */}
            <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-300 rounded-lg text-xs">
              <span className="font-semibold text-gray-600 pl-1">To:</span>
              <select
                value={toYear}
                onChange={e => setToYear(Number(e.target.value))}
                className="h-[30px] px-1.5 rounded border text-xs bg-white font-medium focus:outline-none"
              >
                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={toMonth}
                onChange={e => setToMonth(Number(e.target.value))}
                className="h-[30px] px-1.5 rounded border text-xs bg-white font-medium focus:outline-none"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(mIdx => (
                  <option key={mIdx} value={mIdx}>{getMonthFullName(mIdx).slice(0, 3)}</option>
                ))}
              </select>
            </div>

            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="h-[38px] inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg shadow-sm hover:bg-red-100 transition-all duration-200"
              >
                <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                <span>Reset</span>
              </button>
            )}

            <div className="relative">
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-[180px] h-[38px] pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-white"
                style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED } as React.CSSProperties}
              />
            </div>

            <button
              onClick={() => exportPriceHistoryToExcel(groupedData, mode, monthsList)}
              className="h-[38px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 border border-green-700 rounded-lg shadow-sm hover:bg-green-700 active:bg-green-800 transition-all duration-200 cursor-pointer"
              title={`Export ${mode === 'vendor' ? 'Vendor Price History' : 'Customer Price History'} to Excel`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-8 space-y-6 flex flex-col min-h-0 overflow-hidden">
        <div className="bg-white shadow rounded-lg flex-1 flex flex-col min-h-0 overflow-hidden border border-gray-200">
          <div className="flex-1 overflow-auto rounded-lg">
            <table className="w-full text-sm text-left border-collapse min-w-[2000px]">
              <thead className="sticky top-0 z-30 shadow-sm bg-white">
                <tr>
                  {mode === 'vendor' ? (
                    <>
                      <th rowSpan={2} className={`${thClass} min-w-[150px] sticky left-0 z-40 bg-white`}>Foreign Name</th>
                      <th rowSpan={2} className={`${thClass} min-w-[100px] sticky left-[150px] z-40 bg-white`}>Casting Code</th>
                      <th rowSpan={2} className={`${thClass} min-w-[150px]`}>Item Description</th>
                      <th rowSpan={2} className={`${thClass} min-w-[120px]`}>Vendor</th>
                      <th rowSpan={2} className={`${thClass} min-w-[100px]`}>Grade</th>
                    </>
                  ) : (
                    <>
                      <th rowSpan={2} className={`${thClass} min-w-[150px] sticky left-0 z-40 bg-white`}>Customer Name</th>
                      <th rowSpan={2} className={`${thClass} min-w-[100px] sticky left-[150px] z-40 bg-white`}>Casting Code</th>
                      <th rowSpan={2} className={`${thClass} min-w-[150px]`}>Item Description</th>
                      <th rowSpan={2} className={`${thClass} min-w-[90px]`}>Dom/Export</th>
                      <th rowSpan={2} className={`${thClass} min-w-[100px]`}>Grade</th>
                    </>
                  )}

                  {/* Top Level Month Headers */}
                  {monthsList.map(mDef => (
                    <React.Fragment key={`h1-${mDef.name}`}>
                      <th
                        colSpan={4}
                        className="px-3 py-2 border border-gray-400 text-sm font-extrabold text-yellow-950 bg-yellow-400 text-center whitespace-nowrap min-w-[240px]"
                      >
                        MMR/ Revision {mDef.name.toUpperCase().replace('-', ' ')}
                      </th>
                      <th
                        colSpan={mode === 'customer' ? 4 : 3}
                        className="px-3 py-2 border border-gray-400 text-sm font-extrabold text-gray-900 bg-orange-100 text-center whitespace-nowrap"
                      >
                        {mDef.name}
                      </th>
                    </React.Fragment>
                  ))}
                </tr>

                {/* Sub-headers Row */}
                <tr>
                  {monthsList.map(mDef => (
                    <React.Fragment key={`h2-${mDef.name}`}>
                      {/* MMR Split headers */}
                      <th className="px-2.5 py-2 border border-gray-400 text-[13px] font-bold text-yellow-950 bg-yellow-300 text-center whitespace-nowrap">MMR</th>
                      <th className="px-2.5 py-2 border border-gray-400 text-[13px] font-bold text-yellow-950 bg-yellow-300 text-center whitespace-nowrap">RO</th>
                      <th className="px-2.5 py-2 border border-gray-400 text-[13px] font-bold text-yellow-950 bg-yellow-300 text-center whitespace-nowrap">Cons</th>
                      <th className="px-2.5 py-2 border border-gray-400 text-[13px] font-bold text-yellow-950 bg-yellow-300 text-center whitespace-nowrap">Extra</th>
                      
                      {/* Month Rate sub-headers */}
                      <th className="px-2.5 py-2 border border-gray-300 text-[13px] font-bold text-gray-900 text-center bg-gray-50 whitespace-nowrap">{mode === 'customer' ? 'Cast Wt' : 'Rm Weight'}</th>
                      <th className="px-2.5 py-2 border border-gray-300 text-[13px] font-bold text-gray-900 text-center bg-gray-50 whitespace-nowrap">{mode === 'customer' ? 'Cast Rate/Kg' : 'Revised Rate/Kg'}</th>
                      <th className="px-2.5 py-2 border border-gray-300 text-[13px] font-bold text-gray-900 text-center bg-gray-50 whitespace-nowrap">{mode === 'customer' ? 'Casting Price' : 'Revised Price'}</th>
                      {mode === 'customer' && (
                        <th className="px-2.5 py-2 border border-emerald-400 text-[13px] font-bold text-emerald-950 text-center bg-emerald-100 whitespace-nowrap">Final Price</th>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {(() => {
                  const monthColsPerMonth = mode === 'customer' ? 8 : 7;
                  const totalCols = 5 + (monthsList.length * monthColsPerMonth);

                  if (loading) {
                    return <tr><td colSpan={totalCols} className="px-4 py-8 text-center text-gray-500 text-sm">{MESSAGES.LOADING_PRICE_HISTORY}</td></tr>;
                  }
                  if (groupedData.length === 0) {
                    return (
                      <tr>
                        <td colSpan={totalCols} className="px-4 py-8 text-center text-gray-500 text-sm">
                          {mode === 'customer' ? MESSAGES.EMPTY_CUSTOMER_PRICE_HISTORY : MESSAGES.EMPTY_VENDOR_PRICE_HISTORY}
                        </td>
                      </tr>
                    );
                  }

                  return paginatedData.map((row) => (
                    <tr key={row.key} className="hover:bg-blue-50 transition-colors">
                      <td className="px-3 py-2 border border-gray-200 text-sm font-medium text-gray-900 bg-white sticky left-0 z-20">{row.foreignName}</td>
                      <td className="px-3 py-2 border border-gray-200 text-sm text-gray-700 font-medium bg-white sticky left-[150px] z-20">{row.castingCode}</td>
                      <td className="px-3 py-2 border border-gray-200 text-sm text-gray-700 truncate max-w-[200px]" title={row.itemDescription}>{row.itemDescription}</td>
                      {mode === 'vendor' ? (
                        <td className="px-3 py-2 border border-gray-200 text-sm text-gray-700 truncate max-w-[150px]">{row.vendor}</td>
                      ) : (
                        <td className="px-3 py-2 border border-gray-200 text-sm text-gray-700 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            row.domesticExport === 'Domestic' ? 'bg-green-100 text-green-700' :
                            row.domesticExport === 'Export' ? 'bg-blue-100 text-blue-700' :
                            row.domesticExport === 'Labour' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{row.domesticExport || '-'}</span>
                        </td>
                      )}
                      <td className="px-3 py-2 border border-gray-200 text-sm text-gray-700">{row.grade}</td>

                      {monthsList.map(mDef => {
                        const mInfo = row.months[mDef.name] || {
                          log: null,
                          mmrSplit: 0,
                          roSplit: 0,
                          consSplit: 0,
                          extraSplit: 0,
                          hasRevision: false,
                        };
                        const mLog = mInfo.log;

                        const rawWt = mode === 'customer'
                          ? ((mLog as any)?.newCastWeight ?? (mLog as any)?.rmWeight ?? row.rmWeight)
                          : ((mLog as any)?.rmWeight ?? (mLog as any)?.newCastWeight ?? row.rmWeight);

                        const rate = mode === 'customer'
                          ? ((mLog as any)?.newCastRate ?? (mLog as any)?.newRatePerKg ?? (mLog as any)?.oldCastRate)
                          : ((mLog as any)?.newRatePerKg ?? (mLog as any)?.oldRatePerKg);

                        const wt = (rate != null || (mLog && (mLog.rmWeight != null || mLog.newCastWeight != null))) ? rawWt : null;
                        const calcPrice = (wt != null && rate != null)
                          ? Number((Number(wt) * Number(rate)).toFixed(2))
                          : (mLog?.newPrice != null ? Number(mLog.newPrice) : null);

                        return (
                          <React.Fragment key={`data-${row.key}-${mDef.name}`}>
                            {/* Revision Splits */}
                            <td className={`px-2.5 py-2 border border-gray-300 text-center font-mono text-[13px] ${mInfo.mmrSplit !== 0 ? 'bg-yellow-100 font-bold text-amber-950' : 'text-gray-400 font-medium'}`}>
                              {fmtSplitVal(mInfo.mmrSplit)}
                            </td>
                            <td className={`px-2.5 py-2 border border-gray-300 text-center font-mono text-[13px] ${mInfo.roSplit !== 0 ? 'bg-yellow-100 font-bold text-amber-950' : 'text-gray-400 font-medium'}`}>
                              {fmtSplitVal(mInfo.roSplit)}
                            </td>
                            <td className={`px-2.5 py-2 border border-gray-300 text-center font-mono text-[13px] ${mInfo.consSplit !== 0 ? 'bg-yellow-100 font-bold text-amber-950' : 'text-gray-400 font-medium'}`}>
                              {fmtSplitVal(mInfo.consSplit)}
                            </td>
                            <td className={`px-2.5 py-2 border border-gray-300 text-center font-mono text-[13px] ${mInfo.extraSplit !== 0 ? 'bg-yellow-100 font-bold text-amber-950' : 'text-gray-400 font-medium'}`}>
                              {fmtSplitVal(mInfo.extraSplit)}
                            </td>

                            {/* Month Rates & Prices */}
                            <td className="px-2.5 py-2 border border-gray-200 text-center font-mono text-[13px] text-gray-800 bg-white">
                              {wt != null ? Number(wt).toFixed(2) : '-'}
                            </td>
                            <td className="px-2.5 py-2 border border-gray-200 text-center font-mono text-[13px] text-gray-900 font-semibold bg-white">
                              {rate != null ? `₹${Number(rate).toFixed(2)}` : '-'}
                            </td>
                            <td className="px-2.5 py-2 border border-gray-200 text-center font-mono text-[13px] text-gray-900 font-bold bg-white">
                              {calcPrice != null ? `₹${calcPrice.toFixed(2)}` : '-'}
                            </td>
                            {mode === 'customer' && (
                              <td className="px-2.5 py-2 border border-emerald-300 text-center font-mono text-[13px] text-emerald-950 font-bold bg-emerald-50/70">
                                {mLog && mLog.newPrice != null ? `₹${Number(mLog.newPrice).toFixed(2)}` : '-'}
                              </td>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {groupedData.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4 shrink-0 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="h-8 px-2 border rounded bg-white text-xs text-gray-700 focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
                <span>entries per page</span>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  Showing {Math.min((page - 1) * pageSize + 1, groupedData.length)} to {Math.min(page * pageSize, groupedData.length)} of {groupedData.length} entries
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 font-bold text-gray-800">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceHistoryPage;
