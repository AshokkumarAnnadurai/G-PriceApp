import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { itemApi } from '../api/itemApi';
import { pricingApi } from '../api/pricingApi';
import { vendorApi } from '../api/vendorApi';
import { DateInput,Loader } from '../components/ui';
import { BRAND } from '../constants';
import type { Vendor as ApiVendor,CreateBatchBody } from '../types';
import { CustomerPricingSection } from './CustomerPricingSection';

// ── Helper ──
const numSafe = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};



// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type VendorStatus = 'current' | 'revision_due' | 'pending' | 'overdue';
type BatchStatus  = 'pending' | 'approved' | 'rejected' | 'draft';
type BatchFilter  = 'All Batches' | 'Approval Pending' | 'Approved' | 'Rejected' | 'Draft';

export interface BatchEditScope {
  vendors?: string[];
  grade?: string;
  codes?: string[];
  level: 'vendor' | 'grade' | 'code';
  mode?: 'batch' | 'edit_selected';
  flatSelectedItems?: { vendor: Vendor; casting: Casting; item: CastingItem; id: string }[];
}
interface CastingItem {
  casting: string; desc: string; wt: number; customer?: string; customerType?: string;
  oldRate: number; oldPrice: number; machining: number; coating: number; baseRate: number;
  _id?: string;
  _uid?: string;
}
interface Casting {
  grade: string; customerName: string; castingCode: string; rmWeight: number; revisedRatePerKg: number; mmr: number; consumables: number; coating: number;
  extra: number; codes: number; items: CastingItem[];
  fromDate: string; toDate: string;
  itemCode?: string;
  itemDescription?: string;
  customerApprovalFoundry?: string;
  machineType?: string;
  coatingText?: string;
  cavity?: string;
  coreSleeve?: string;
}
interface Vendor {
  id: string; bpCode: string; name: string; grades: string[]; castingCodes: number;
  currentMMR: number; latestMMR: number; consumables: number;
  coatingRate: number; lastUpdated: string; castings: Casting[];
}
interface Batch {
  id: string; vendor: string; vendorId: string; description: string;
  grade: string; codes: number; items: number; changeType: string;
  date: string; time: string; status: BatchStatus; mmrDelta: number;
  rejectReason?: string; newMMR?: number; fromDate?: string; toDate?: string; activeItemsData?: { vendor: Vendor; casting: Casting; item: CastingItem; apiItem?: any }[];
  _apiId?: number;
  updateMode?: 'incremental' | 'total';
  vendorName?: string;
  customer?: string;
  updatedMmr?: number;
  mmrChange?: number;
  updatedCoatingRate?: number;
  roChange?: number;
  updatedConsumablesRate?: number;
  consChange?: number;
  updatedExtraFactor?: number;
  extraChange?: number;
  newRedOxide?: number;
  newConsumables?: number;
  newExtra?: number;
}

// â”€â”€ Adapter: API Vendor → local Vendor shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 2) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// ── Adapter: API Vendor → local Vendor shape ──────────────────────────────
function adaptVendors(apiVendors: ApiVendor[]): Vendor[] {
  return apiVendors.map(v => ({
    id: String(v.id),
    bpCode: v.bpCode || '',
    name: v.name,
    grades: [...new Set(v.materials.map(m => (m.grade || '').trim()))],
    castingCodes: 0,
    currentMMR: v.materials[0]?.mmrRate ?? 0,
    latestMMR: v.materials[0]?.mmrRate ?? 0,
    consumables: v.materials[0]?.consumablesRate ?? 0,
    coatingRate: v.materials[0]?.roRate ?? 0,
    lastUpdated: new Date(v.updatedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    castings: v.materials.map(m => ({
      grade: (m.grade || '').trim(), customerName: m.customerName || 'All', castingCode: m.castingCode || 'All', 
      rmWeight: m.rmWeight || 0, revisedRatePerKg: m.revisedRatePerKg || 0,
      mmr: m.mmrRate, consumables: m.consumablesRate,
      coating: m.roRate, extra: m.extraFactor, codes: 0, items: [],
      fromDate: formatDate(m.fromDate), toDate: formatDate(m.toDate),
      itemCode: m.itemCode || '',
      itemDescription: m.itemDescription || '',
      machineType: m.machineType || '',
      coatingText: m.coating || '',
      cavity: m.cavity || '',
      coreSleeve: m.coreSleeve || '',
    })),
  }));
}


// â”€â”€ Status configs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VS_COLOR: Record<string, { color: string; bg: string }> = {
  current:      { color: '#16a34a', bg: '#dcfce7' },
  revision_due: { color: '#d97706', bg: '#fef3c7' },
  pending:      { color: '#d97706', bg: '#fef3c7' },
  overdue:      { color: BRAND.RED,  bg: '#fee2e2' },
};
const VS_LABEL: Record<VendorStatus, string> = {
  current:      'Rates current',
  revision_due: 'Revision due',
  pending:      'Revision pending',
  overdue:      'Rates overdue',
};
const BS: Record<BatchStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending Approval', color: '#d97706', bg: '#fef3c7' },
  approved: { label: 'Approved',         color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Rejected',         color: BRAND.RED,  bg: '#fee2e2' },
  draft:    { label: 'Draft',            color: '#64748b', bg: '#f1f5f9' },
};

const SHOWN_BY_DEFAULT = 3;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getVendorStatusFromBatches(vendorId: string, batches: Batch[]): VendorStatus {
  const vendorBatches = batches.filter(b => b.vendorId === vendorId || !b.vendorId);
  if (vendorBatches.length === 0) return 'current';
  const last = vendorBatches[vendorBatches.length - 1];
  if (last.status === 'approved') return 'current';
  if (last.status === 'pending')  return 'revision_due';
  if (last.status === 'draft')    return 'pending';
  return 'current';
}

function getStatusColor(label: string): { color: string; bg: string } {
  const lower = label.toLowerCase();
  if (lower.includes('overdue'))  return VS_COLOR['overdue'];
  if (lower.includes('pending') || lower.includes('due')) return VS_COLOR['revision_due'];
  return VS_COLOR['current'];
}

function formatDateSafe(dStr?: string): string {
  if (!dStr) return '—';
  try {
    const match = dStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dStr;
  }
}

// â”€â”€ Searchable Select Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SearchableSelect({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  className,
  style,
  autoFocus
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: string[]; 
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div 
        onClick={() => setOpen(!open)}
        className={className}
        style={{ 
          ...style, 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          userSelect: 'none'
        }}
        tabIndex={0}
      >
        <span className={value ? 'text-gray-900 truncate' : 'text-gray-500 truncate'}>
          {value || placeholder}
        </span>
        <span className="text-gray-400 text-xs shrink-0 ml-2">▼</span>
      </div>
      
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col" style={{ maxHeight: '300px' }}>
          <div className="p-2 border-b border-gray-100 shrink-0 relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              ref={inputRef}
              type="text"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#d92d20]"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            <div 
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${!value ? 'bg-red-50 text-[#d92d20]' : 'text-gray-600'}`}
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
            >
              {placeholder}
            </div>
            {filtered.map(o => (
              <div 
                key={o}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${value === o ? 'bg-red-50 text-[#d92d20]' : 'text-gray-900'}`}
                onClick={() => { onChange(o); setOpen(false); setSearch(''); }}
              >
                {o}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-center text-gray-400 italic">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable Multi-Select Component ──────────────────────────────────────
function SearchableMultiSelect({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  className,
  style,
  autoFocus
}: { 
  value: string[]; 
  onChange: (val: string[]) => void; 
  options: string[]; 
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (o: string) => {
    if (value.includes(o)) {
      onChange(value.filter(v => v !== o));
    } else {
      onChange([...value, o]);
    }
  };

  const displayText = useMemo(() => {
    if (!value || value.length === 0) return placeholder;
    if (value.length === 1) return value[0];
    return `${value.length} grades selected`;
  }, [value, placeholder]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div 
        onClick={() => setOpen(!open)}
        className={className}
        style={{ 
          ...style, 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          userSelect: 'none'
        }}
        tabIndex={0}
      >
        <span className={value && value.length > 0 ? 'text-gray-900 truncate font-medium' : 'text-gray-500 truncate'}>
          {displayText}
        </span>
        <span className="text-gray-400 text-xs shrink-0 ml-2">▼</span>
      </div>
      
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col" style={{ maxHeight: '320px', minWidth: '220px' }}>
          <div className="p-2 border-b border-gray-100 shrink-0 relative flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input 
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#d92d20]"
                placeholder="Search grades..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500 font-semibold shrink-0">
            <span>{value.length} selected</span>
            <div className="flex gap-2">
              <button 
                type="button"
                className="text-[#d92d20] hover:underline cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onChange([...options]); }}
              >
                Select All
              </button>
              <span>|</span>
              <button 
                type="button"
                className="text-gray-500 hover:underline cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {filtered.map(o => {
              const checked = value.includes(o);
              return (
                <div 
                  key={o}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center gap-2.5 ${checked ? 'bg-red-50/60 font-semibold text-[#d92d20]' : 'text-gray-900'}`}
                  onClick={(e) => { e.stopPropagation(); toggleOption(o); }}
                >
                  <input 
                    type="checkbox" 
                    checked={checked} 
                    onChange={() => {}} 
                    className="rounded border-gray-300 text-[#d92d20] focus:ring-[#d92d20] cursor-pointer" 
                  />
                  <span className="truncate">{o}</span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-center text-gray-400 italic">
                {search.trim() ? 'No results found' : 'Loading grades...'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const getQ = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return Math.floor(date.getMonth() / 3) + 1;
};

const isSingleMonthRange = (fromStr: string, toStr: string) => {
  if (!fromStr || !toStr) return { isSingleMonth: false, monthName: '', year: 0 };
  const dStart = new Date(fromStr);
  const dEnd = new Date(toStr);
  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) return { isSingleMonth: false, monthName: '', year: 0 };

  const startYear = dStart.getFullYear();
  const startMonth = dStart.getMonth();
  const endYear = dEnd.getFullYear();
  const endMonth = dEnd.getMonth();

  if (startYear === endYear && startMonth === endMonth) {
    const expectedLastDay = new Date(startYear, startMonth + 1, 0).getDate();
    if (dStart.getDate() === 1 && dEnd.getDate() === expectedLastDay) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return { isSingleMonth: true, monthName: monthNames[startMonth], year: startYear };
    }
  }
  return { isSingleMonth: false, monthName: '', year: 0 };
};

const getDatesForQuarter = (quarterNum: number, year: number) => {
  let from = '';
  let to = '';
  if (quarterNum === 1) {
    from = `${year}-01-01`;
    to = `${year}-03-31`;
  } else if (quarterNum === 2) {
    from = `${year}-04-01`;
    to = `${year}-06-30`;
  } else if (quarterNum === 3) {
    from = `${year}-07-01`;
    to = `${year}-09-30`;
  } else if (quarterNum === 4) {
    from = `${year}-10-01`;
    to = `${year}-12-31`;
  }
  return { from, to };
};


const getYearForQuarterSwitch = (currentFromDateStr: string, targetQuarter: number): number => {
  if (!currentFromDateStr) return new Date().getFullYear();
  const d = new Date(currentFromDateStr);
  if (isNaN(d.getTime())) return new Date().getFullYear();
  const currentYear = d.getFullYear();
  const currentMonth = d.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;

  if (currentQuarter === 4 && targetQuarter < 4) {
    return currentYear + 1;
  }
  if (currentQuarter === 1 && targetQuarter === 4) {
    return currentYear - 1;
  }
  return currentYear;
};

const getYearForMonthSwitch = (currentFromDateStr: string, targetMonth: number): number => {
  if (!currentFromDateStr) return new Date().getFullYear();
  const d = new Date(currentFromDateStr);
  if (isNaN(d.getTime())) return new Date().getFullYear();
  const currentYear = d.getFullYear();
  const currentMonth = d.getMonth() + 1;

  if (currentMonth >= 10 && targetMonth < 10) {
    return currentYear + 1;
  }
  if (currentMonth <= 3 && targetMonth >= 10) {
    return currentYear - 1;
  }
  return currentYear;
};


const toIsoDate = (dateStr?: string): string => {
  if (!dateStr || dateStr === '—') return '';
  const clean = dateStr.trim();
  const parts = clean.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (parts[0].length === 4 && parts[2].length === 2) {
      return clean;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
};

const getNextQuarterDesc = (fromDateStr: string, toDateStr: string, customerName: string, advanceQuarter: boolean = true): string => {
  if (!fromDateStr || !toDateStr) return '';
  
  const parseDateSafely = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    const parts = clean.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 2 && parts[2].length === 4) {
        // dd-mm-yyyy format
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      } else if (parts[0].length === 4 && parts[2].length === 2) {
        // yyyy-mm-dd format
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const dStart = parseDateSafely(fromDateStr);
  const dEnd = parseDateSafely(toDateStr);
  if (!dStart || !dEnd) return '';

  const { isSingleMonth, monthName, year } = isSingleMonthRange(fromDateStr, toDateStr);
  const cleanCustomer = (customerName || 'All').trim();

  if (isSingleMonth) {
    if (advanceQuarter) {
      let targetMonth = dStart.getMonth() + 1; // 0-11 -> next month 1-12
      let targetYear = dStart.getFullYear();
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[targetMonth]}-${targetYear}-MMR Change-${cleanCustomer}`;
    }
    return `${monthName}-${year}-MMR Change-${cleanCustomer}`;
  }

  const startMonth = dStart.getMonth(); // 0-indexed (Jan = 0)
  let qNum = 1;
  if (startMonth >= 0 && startMonth <= 2) qNum = 1;
  else if (startMonth >= 3 && startMonth <= 5) qNum = 2;
  else if (startMonth >= 6 && startMonth <= 8) qNum = 3;
  else if (startMonth >= 9 && startMonth <= 11) qNum = 4;

  let targetQ = qNum;
  let targetYear = dStart.getFullYear();
  if (advanceQuarter) {
    targetQ = qNum + 1;
    if (targetQ > 4) {
      targetQ = 1;
      targetYear = targetYear + 1;
    }
  }

  return `Q${targetQ}-${targetYear}-MMR Change-${cleanCustomer}`;
};

// â”€â”€ Rate Revision Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface RevisionDrawerProps {
  vendor: Vendor;
  initialGrade?: string;
  batchNumber: number;
  batches: Batch[];
  customerFilter?: string;
  onClose: () => void;
  onSaveDraft: (batch: Batch) => void;
  onCreateBatch: (batch: Batch) => void;
}

const RevisionDrawer: React.FC<RevisionDrawerProps> = ({ vendor, initialGrade, batchNumber, batches, customerFilter, onClose, onSaveDraft, onCreateBatch }) => {
  const [form, setForm] = useState({
    grade:             initialGrade ?? vendor.castings[0]?.grade ?? '',
    mmrRate:           '',
    mmrChange:         '',
    mmrDir:            'inc',
    redOxide:          '',
    redOxideChange:    '',
    roDir:             'inc',
    consumables:       '',
    consumablesChange: '',
    consDir:           'inc',
    extraFactor:       '',
    extraChange:       '',
    extraDir:          'inc',
    batchDesc:         '',
    fromDate:          '2026-07-01',
    toDate:            '2026-09-30',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [rateInputMode, setRateInputMode] = useState<'base' | 'change'>('base');
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedCasting = vendor.castings.find(c => c.grade === form.grade) ?? vendor.castings[0];

  useEffect(() => {
    if (selectedCasting) {
      setForm(p => ({
        ...p,
        fromDate: toIsoDate(selectedCasting.fromDate) || '2026-07-01',
        toDate: toIsoDate(selectedCasting.toDate) || '2026-09-30',
      }));
    }
  }, [form.grade, selectedCasting]);
  const currentMMR         = selectedCasting?.mmr         ?? 0;
  const currentCoating     = selectedCasting?.coating     ?? 0;
  const currentConsumables = selectedCasting?.consumables ?? 0;
  const currentExtra       = selectedCasting?.extra       ?? 0;
  const computedMmr = form.mmrRate 
    ? (parseFloat(form.mmrRate) || 0) 
    : (form.mmrChange ? currentMMR + (parseFloat(form.mmrChange) || 0) * (form.mmrDir === 'dec' ? -1 : 1) : currentMMR);

  const computedCoating = form.redOxide 
    ? (parseFloat(form.redOxide) || 0) 
    : (form.redOxideChange ? currentCoating + (parseFloat(form.redOxideChange) || 0) * (form.roDir === 'dec' ? -1 : 1) : currentCoating);

  const computedConsumables = form.consumables 
    ? (parseFloat(form.consumables) || 0) 
    : (form.consumablesChange ? currentConsumables + (parseFloat(form.consumablesChange) || 0) * (form.consDir === 'dec' ? -1 : 1) : currentConsumables);

  const computedExtra = form.extraFactor 
    ? (parseFloat(form.extraFactor) || 0) 
    : (form.extraChange ? currentExtra + (parseFloat(form.extraChange) || 0) * (form.extraDir === 'dec' ? -1 : 1) : currentExtra);

  const newMMR = computedMmr;
  const totalCodes = selectedCasting?.items.length ?? 0;

  const generatedDesc = useMemo(() => {
    let customerName = (customerFilter || selectedCasting?.customerName || '').trim();
    if (!customerName || customerName === 'All' || customerName === 'All Customers' || customerName === '—') {
      const firstItemCust = selectedCasting?.items?.[0]?.customer;
      if (firstItemCust && firstItemCust !== 'All' && firstItemCust !== 'All Customers' && firstItemCust !== '—') {
        customerName = firstItemCust;
      }
    }
    const isOriginalDates = selectedCasting && 
      toIsoDate(selectedCasting.fromDate) === form.fromDate && 
      toIsoDate(selectedCasting.toDate) === form.toDate;
      
    return getNextQuarterDesc(form.fromDate, form.toDate, customerName, isOriginalDates);
  }, [form.fromDate, form.toDate, customerFilter, selectedCasting]);

  // Single-direction inputs: entering on one clears the other
  const handleMmrRate = (val: string) =>
    setForm(p => ({ ...p, mmrRate: val, mmrChange: '' }));
  const handleMmrChange = (val: string) =>
    setForm(p => ({ ...p, mmrChange: val, mmrRate: '' }));
  const handleRedOxide = (val: string) =>
    setForm(p => ({ ...p, redOxide: val, redOxideChange: '' }));
  const handleRedOxideChange = (val: string) =>
    setForm(p => ({ ...p, redOxideChange: val, redOxide: '' }));
  const handleConsumables = (val: string) =>
    setForm(p => ({ ...p, consumables: val, consumablesChange: '' }));
  const handleConsumablesChange = (val: string) =>
    setForm(p => ({ ...p, consumablesChange: val, consumables: '' }));
  const handleExtraFactor = (val: string) =>
    setForm(p => ({ ...p, extraFactor: val, extraChange: '' }));
  const handleExtraChange = (val: string) =>
    setForm(p => ({ ...p, extraChange: val, extraFactor: '' }));

  const handleTogglePreview = () => {
    setShowPreview(p => {
      if (!p) setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      return !p;
    });
  };

  const makeBatch = (status: BatchStatus): Batch => ({
    id: `B-${String(batchNumber).padStart(4, '0')}`,
    vendor: vendor.name,
    vendorId: vendor.id,
    description: generatedDesc,
    grade: form.grade,
    codes: totalCodes,
    items: totalCodes,
    changeType: 'MMR change',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    status,
    mmrDelta: +(newMMR - currentMMR).toFixed(2),
    updatedMmr: form.mmrRate !== '' && !isNaN(Number(form.mmrRate)) ? parseFloat(form.mmrRate) : undefined,
    mmrChange: form.mmrChange !== '' && !isNaN(Number(form.mmrChange)) ? parseFloat(form.mmrChange) * (form.mmrDir === 'dec' ? -1 : 1) : undefined,
    updatedCoatingRate: form.redOxide !== '' && !isNaN(Number(form.redOxide)) ? parseFloat(form.redOxide) : undefined,
    roChange: form.redOxideChange !== '' && !isNaN(Number(form.redOxideChange)) ? parseFloat(form.redOxideChange) * (form.roDir === 'dec' ? -1 : 1) : undefined,
    updatedConsumablesRate: form.consumables !== '' && !isNaN(Number(form.consumables)) ? parseFloat(form.consumables) : undefined,
    consChange: form.consumablesChange !== '' && !isNaN(Number(form.consumablesChange)) ? parseFloat(form.consumablesChange) * (form.consDir === 'dec' ? -1 : 1) : undefined,
    updatedExtraFactor: form.extraFactor !== '' && !isNaN(Number(form.extraFactor)) ? parseFloat(form.extraFactor) : undefined,
    extraChange: form.extraChange !== '' && !isNaN(Number(form.extraChange)) ? parseFloat(form.extraChange) * (form.extraDir === 'dec' ? -1 : 1) : undefined,
    newMMR,
    newRedOxide: computedCoating,
    newConsumables: computedConsumables,
    newExtra: computedExtra,
    fromDate: form.fromDate,
    toDate: form.toDate,
    activeItemsData: selectedCasting?.items.map(i => ({ vendor, casting: selectedCasting, item: i })) ?? [],
    customer: customerFilter || (selectedCasting?.customerName || 'All Customers'),
  });

  const hasPendingBatch = batches.some(b =>
    (b.status === 'pending' || b.status === 'draft') &&
    b.vendorId === vendor.id &&
    b.grade === form.grade
  );
  const pendingBatch = batches.find(b =>
    (b.status === 'pending' || b.status === 'draft') &&
    b.vendorId === vendor.id &&
    b.grade === form.grade
  );

  const inp = `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 bg-white`;
  
  // Scope pills config
  const scopePills = [
    { label: 'Vendors',                value: vendor.name },
    { label: 'Grade',                  value: form.grade },
    { label: 'Customer',               value: customerFilter || 'All Customers' },
    { label: 'Casting codes in scope', value: `${totalCodes} casting codes` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900 text-base">Rate Revision — {vendor.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Q3 · Julâ€“Sep 2026</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* SCOPE */}
          <section>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Scope</p>
            <div className="flex flex-wrap gap-2">
              {scopePills.map(pill => (
                <div key={pill.label} style={{ background: BRAND.RED_LIGHT, borderColor: BRAND.RED_BORDER }} className="border rounded-lg px-3 py-1.5">
                  <p className="text-xs font-semibold text-gray-500">{pill.label}</p>
                  <p className="text-xs font-semibold" style={{ color: BRAND.RED }}>{pill.value}</p>
                </div>
              ))}
              {/* Grade selector */}
              <div style={{ background: BRAND.RED_LIGHT, borderColor: BRAND.RED_BORDER }} className="border rounded-lg px-3 py-1.5">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Change Grade</p>
                <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}
                  style={{ color: BRAND.RED }}
                  className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer">
                  {vendor.castings.map(c => <option key={c.grade} value={c.grade}>{c.grade}</option>)}
                </select>
              </div>
            </div>
          </section>


          {/* NEW RATES */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">New rates — enter only what has changed</p>
                <p className="text-xs text-gray-400">Choose whether to enter the direct new rate or the amount to change by.</p>
              </div>
              <div className="relative flex items-center bg-gray-100/80 p-1 rounded-full border border-gray-200/60 w-max shadow-inner">
                <button
                  onClick={() => {
                    setRateInputMode('base');
                    setForm(p => ({ ...p, mmrChange: '', redOxideChange: '', consumablesChange: '', extraChange: '' }));
                  }}
                  className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${rateInputMode === 'base' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                  Direct Rate
                </button>
                <button
                  onClick={() => {
                    setRateInputMode('change');
                    setForm(p => ({ ...p, mmrRate: '', redOxide: '', consumables: '', extraFactor: '' }));
                  }}
                  className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${rateInputMode === 'change' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                  Change Amount (+/-)
                </button>
              </div>
            </div>

            {/* Row 1: MMR | Red Oxide */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="px-3 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">MMR Base Rate (₹/kg)</span>
                </div>
                {rateInputMode === 'base' ? (
                  <input value={form.mmrRate} onChange={e => handleMmrRate(e.target.value)}
                    className={inp} />
                ) : (
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white mx-1 my-1">
                    <select value={form.mmrDir} onChange={e => setForm(p => ({ ...p, mmrDir: e.target.value }))}
                      className="px-2 py-1.5 text-sm bg-gray-50 border-r border-gray-200 focus:outline-none text-gray-700">
                      <option value="inc">Inc (+)</option>
                      <option value="dec">Dec (-)</option>
                    </select>
                    <input value={form.mmrChange} onChange={e => handleMmrChange(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full px-3 py-1.5 text-sm focus:outline-none bg-white transition-colors" />
                  </div>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="px-3 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Red Oxide (₹/kg)</span>
                </div>
                {rateInputMode === 'base' ? (
                  <input value={form.redOxide} onChange={e => handleRedOxide(e.target.value)}
                    className={inp} />
                ) : (
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white mx-1 my-1">
                    <select value={form.roDir} onChange={e => setForm(p => ({ ...p, roDir: e.target.value }))}
                      className="px-2 py-1.5 text-sm bg-gray-50 border-r border-gray-200 focus:outline-none text-gray-700">
                      <option value="inc">Inc (+)</option>
                      <option value="dec">Dec (-)</option>
                    </select>
                    <input value={form.redOxideChange} onChange={e => handleRedOxideChange(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full px-3 py-1.5 text-sm focus:outline-none bg-white transition-colors" />
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Consumables | Extra Factor */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="px-3 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Consumables (₹/kg)</span>
                </div>
                {rateInputMode === 'base' ? (
                  <input value={form.consumables} onChange={e => handleConsumables(e.target.value)}
                    className={inp} />
                ) : (
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white mx-1 my-1">
                    <select value={form.consDir} onChange={e => setForm(p => ({ ...p, consDir: e.target.value }))}
                      className="px-2 py-1.5 text-sm bg-gray-50 border-r border-gray-200 focus:outline-none text-gray-700">
                      <option value="inc">Inc (+)</option>
                      <option value="dec">Dec (-)</option>
                    </select>
                    <input value={form.consumablesChange} onChange={e => handleConsumablesChange(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full px-3 py-1.5 text-sm focus:outline-none bg-white transition-colors" />
                  </div>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="px-3 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Extra Factor (₹/piece)</span>
                </div>
                {rateInputMode === 'base' ? (
                  <input value={form.extraFactor} onChange={e => handleExtraFactor(e.target.value)}
                    className={inp} />
                ) : (
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white mx-1 my-1">
                    <select value={form.extraDir} onChange={e => setForm(p => ({ ...p, extraDir: e.target.value }))}
                      className="px-2 py-1.5 text-sm bg-gray-50 border-r border-gray-200 focus:outline-none text-gray-700">
                      <option value="inc">Inc (+)</option>
                      <option value="dec">Dec (-)</option>
                    </select>
                    <input value={form.extraChange} onChange={e => handleExtraChange(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full px-3 py-1.5 text-sm focus:outline-none bg-white transition-colors" />
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Batch Description full-width */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-600">Batch Description</span>
                <span className="text-xs text-gray-400 ml-1">(Automatically generated from effective period)</span>
              </div>
              <input value={generatedDesc} readOnly
                className="w-full px-3 py-2 text-sm focus:outline-none bg-gray-50 cursor-not-allowed text-gray-500 font-mono" />
            </div>
          </section>

          {/* EFFECTIVE PERIOD */}
          <section>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Effective Period</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Effective from</label>
                <DateInput value={form.fromDate} onChange={val => setForm(p => ({ ...p, fromDate: val }))} className={inp} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Valid until</label>
                <DateInput value={form.toDate} onChange={val => setForm(p => ({ ...p, toDate: val }))} className={inp} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Period / Month</label>
                <select
                  value={(() => {
                    const { isSingleMonth } = isSingleMonthRange(form.fromDate, form.toDate);
                    if (isSingleMonth) {
                      const d = new Date(form.fromDate);
                      return `M${d.getMonth() + 1}`;
                    }
                    const qStart = getQ(form.fromDate);
                    const qEnd = getQ(form.toDate);
                    if (qStart && qStart === qEnd) return `Q${qStart}`;
                    return '';
                  })()}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.startsWith('Q')) {
                      const q = parseInt(val.substring(1));
                      const year = getYearForQuarterSwitch(form.fromDate, q);
                      const { from, to } = getDatesForQuarter(q, year);
                      setForm(p => ({ ...p, fromDate: from, toDate: to }));
                    } else if (val.startsWith('M')) {
                      const m = parseInt(val.substring(1));
                      const year = getYearForMonthSwitch(form.fromDate, m);
                      const from = `${year}-${String(m).padStart(2, '0')}-01`;
                      const lastDay = new Date(year, m, 0).getDate();
                      const to = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                      setForm(p => ({ ...p, fromDate: from, toDate: to }));
                    }
                  }}
                  className={inp}
                >
                  <option value="">Select Period</option>
                  <optgroup label="Quarters">
                    <option value="Q1">Quarter 1 (Jan - Mar)</option>
                    <option value="Q2">Quarter 2 (Apr - Jun)</option>
                    <option value="Q3">Quarter 3 (Jul - Sep)</option>
                    <option value="Q4">Quarter 4 (Oct - Dec)</option>
                  </optgroup>
                  <optgroup label="Months">
                    <option value="M1">January</option>
                    <option value="M2">February</option>
                    <option value="M3">March</option>
                    <option value="M4">April</option>
                    <option value="M5">May</option>
                    <option value="M6">June</option>
                    <option value="M7">July</option>
                    <option value="M8">August</option>
                    <option value="M9">September</option>
                    <option value="M10">October</option>
                    <option value="M11">November</option>
                    <option value="M12">December</option>
                  </optgroup>
                </select>
              </div>
              <div className="flex-1">
                <div style={{ background: '#fef9c3', borderColor: '#fde047' }} className="border rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-yellow-600">Items affected</p>
                  <p className="text-sm font-bold text-yellow-700">{totalCodes} Item Codes</p>
                </div>
              </div>
            </div>
          </section>

          {/* PREVIEW TABLE */}
          {showPreview && selectedCasting && (
            <section ref={previewRef}>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">
                    Preview Impact — {selectedCasting.grade}
                    {newMMR > 0 && <span style={{ color: BRAND.RED }} className="ml-2">New MMR: ₹{newMMR.toFixed(2)}/kg</span>}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Casting Code','Description','Wt','Old Rate/kg','New Rate/kg','Current RM Price','New RM Price','Δ'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCasting.items.map((item, i) => {
                        const rate      = form.mmrRate ? parseFloat(form.mmrRate) : (selectedCasting.mmr || 0) + (parseFloat(form.mmrChange) || 0);
                        const oldRORate = selectedCasting.coating || 0;
                        const newRORate = form.redOxide ? parseFloat(form.redOxide) : oldRORate + (parseFloat(form.redOxideChange) || 0);
                        const oldConsRate = selectedCasting.consumables || 0;
                        const newConsRate = form.consumables ? parseFloat(form.consumables) : oldConsRate + (parseFloat(form.consumablesChange) || 0);
                        const oldExtRate = selectedCasting.extra || 0;
                        const newExtRate = form.extraFactor ? parseFloat(form.extraFactor) : oldExtRate + (parseFloat(form.extraChange) || 0);
                        
                        const displayWt = +numSafe(item.wt).toFixed(2);
                        const displayOldRate = +numSafe(item.oldRate).toFixed(2);
                        const oldRMCost = +(displayWt * displayOldRate).toFixed(2);
                        const newRatePerKg = +(displayOldRate + (rate - (selectedCasting.mmr || 0)) + (newRORate - oldRORate) + (newConsRate - oldConsRate) + (newExtRate - oldExtRate)).toFixed(2);
                        const newRMCost = +(displayWt * newRatePerKg).toFixed(2);
                        const newRO     = +(displayWt * newRORate).toFixed(2);
                                                                        const delta     = +(newRMCost - oldRMCost).toFixed(2);
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-700">{item.casting}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{item.desc}</td>
                            <td className="px-3 py-2 text-right">{numSafe(item.wt).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">₹{numSafe(item.oldRate).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900" style={{ color: BRAND.RED }}>₹{numSafe(newRatePerKg).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">₹{oldRMCost.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{newRMCost.toFixed(2)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                              {delta > 0 ? '+' : ''}₹{delta.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          {hasPendingBatch && pendingBatch && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-amber-500 text-sm shrink-0">âš </span>
              <p className="text-xs text-amber-700">
                A revision is already <strong>{pendingBatch.status === 'pending' ? 'pending approval' : 'saved as draft'}</strong> for <strong>{form.grade}</strong> ({pendingBatch.id}).
                Please approve or reject it before creating a new one.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <div className="flex items-center gap-3">
              <button onClick={handleTogglePreview}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100">
                {showPreview ? 'Hide Preview' : 'Preview Impact on Items'}
              </button>
              <span className="text-xs text-gray-400 italic hidden sm:block">Saves as a draft batch</span>
              <button
                onClick={() => { onSaveDraft(makeBatch('draft')); onClose(); }}
                disabled={hasPendingBatch}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                Save as Draft
              </button>
              <button
                onClick={() => { onCreateBatch(makeBatch('pending')); onClose(); }}
                disabled={hasPendingBatch}
                style={{ background: hasPendingBatch ? '#e5e7eb' : BRAND.RED, color: hasPendingBatch ? '#9ca3af' : '#fff' }}
                className="px-5 py-2 text-sm font-bold rounded-lg hover:opacity-90 disabled:cursor-not-allowed">
                Create Revision Batch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};





// â”€â”€ Batch Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface BatchRowProps {
  batch: Batch;
  expanded: boolean;
  vendorsData: Vendor[];
  filterChange: string;
  onToggle: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
  onRevert?: (itemIds?: number[]) => void;
  isCustomer?: boolean;
}

// pcell for OLD/NEW price boxes
const PCell: React.FC<{ label: string; val: string; delta?: number; changed?: boolean; suffix?: string }> = ({ label, val, delta, changed, suffix = '' }) => {
  const amber = { bg: '#FDF3E3', border: '#E8D4A0', text: '#7A5500' };
  const base  = { bg: '#F3F4F6', border: '#E5E7EB', text: '#4A4A4A' };
  const c = changed ? amber : base;
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 7, padding: '7px 9px', background: c.bg, minWidth: 0, minHeight: 60 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: c.text, opacity: changed ? 1 : 0.55, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: c.text, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 4px' }}>
        <span>{val}{suffix}</span>
        {delta !== undefined && delta !== 0 && (
          <span style={{ fontSize: 12, color: delta > 0 ? '#1A5C32' : BRAND.RED, fontWeight: 600 }}>
            ({delta > 0 ? '+' : ''}₹{Math.abs(delta).toFixed(2)}{suffix})
          </span>
        )}
      </div>
    </div>
  );
};

const BatchRow: React.FC<BatchRowProps> = ({ batch, expanded, vendorsData, filterChange, onToggle, onApprove, onReject, onDelete, onSubmit, onRevert, isCustomer }) => {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason]       = useState('');
  const [searchReview, setSearchReview]       = useState('');
  const [selectedReviewItems, setSelectedReviewItems] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving]         = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isReverting, setIsReverting]         = useState(false);

  const handleApproveClick = async () => {
    if (isApproving || selectedReviewItems.size === 0) return;
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const handleSubmitClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      await onSubmit();
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleRevertClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReverting || !onRevert) return;

    const selectedItemIds: number[] = [];
    if (selectedReviewItems.size > 0) {
      filteredReviewItems.forEach(({ apiItem, originalIndex }) => {
        if (selectedReviewItems.has(originalIndex) && apiItem?.id) {
          selectedItemIds.push(apiItem.id);
        }
      });
    }

    setIsReverting(true);
    try {
      await onRevert(selectedItemIds.length > 0 ? selectedItemIds : undefined);
    } finally {
      setIsReverting(false);
    }
  };

  const { data: apiItems = [] } = useQuery({
    queryKey: ['batch-items', batch._apiId],
    queryFn: () => pricingApi.getBatchItems(batch._apiId!),
    enabled: expanded && !!batch._apiId && (!batch.activeItemsData || batch.activeItemsData.length === 0),
  });

  const synthesizedItems = useMemo(() => {
    if (batch.activeItemsData && batch.activeItemsData.length > 0) return batch.activeItemsData;
    if (apiItems.length === 0) return [];
    const res: { vendor: Vendor; casting: Casting; item: CastingItem; apiItem?: any }[] = [];

    apiItems.forEach((a: any) => {
      // Step 1: Try exact _id match — ALWAYS search within the batch's own vendor first.
      // Without this constraint, if another vendor (e.g. Veesaa Foundry) appears earlier in
      // vendorsData and shares the same ItemCode, it would be incorrectly matched.
      let matchedVendor: Vendor | undefined;
      let matchedCasting: Casting | undefined;
      let matchedItem: CastingItem | undefined;

      if (!isCustomer) {
        // 1a: Search only within the batch's vendor
        const ownVendor = vendorsData.find(v => v.id === batch.vendorId || v.bpCode === batch.vendorId);
        if (ownVendor) {
          // Pass 1: Try exact match first
          outer1: for (const c of ownVendor.castings) {
            for (const i of c.items) {
              const cleanItemMasterId = a.itemMasterId && a.itemMasterId.includes('|')
                ? a.itemMasterId.split('|').pop()?.trim()
                : a.itemMasterId;
              const cleanItemCode = a.itemCode?.trim();
              const cleanId = String(i._id || '').includes('|')
                ? String(i._id).split('|').pop()?.trim()
                : String(i._id || '').trim();

              if (
                (cleanItemMasterId && cleanItemMasterId === cleanId) ||
                (cleanItemCode && cleanItemCode === cleanId)
              ) {
                matchedVendor = ownVendor; matchedCasting = c; matchedItem = i;
                break outer1;
              }
            }
          }

          // Pass 2: Fallback to casting code mapping
          if (!matchedItem) {
            outer1_fallback: for (const c of ownVendor.castings) {
              for (const i of c.items) {
                if (
                  (a.castingCode && (a.castingCode === i.casting || a.castingCode === c.castingCode)) ||
                  (a.itemCode && (a.itemCode === i.casting || a.itemCode === c.castingCode))
                ) {
                  matchedVendor = ownVendor; matchedCasting = c; matchedItem = i;
                  break outer1_fallback;
                }
              }
            }
          }
        }

        // 1b: If not found in own vendor, search all vendors (cross-vendor batches)
        if (!matchedItem) {
          // Pass 1: Try exact match
          outer2: for (const v of vendorsData) {
            if (v === ownVendor) continue; // already checked
            for (const c of v.castings) {
              for (const i of c.items) {
                const cleanItemMasterId = a.itemMasterId && a.itemMasterId.includes('|')
                  ? a.itemMasterId.split('|').pop()?.trim()
                  : a.itemMasterId;
                const cleanItemCode = a.itemCode?.trim();
                const cleanId = String(i._id || '').includes('|')
                  ? String(i._id).split('|').pop()?.trim()
                  : String(i._id || '').trim();

                if (
                  (cleanItemMasterId && cleanItemMasterId === cleanId) ||
                  (cleanItemCode && cleanItemCode === cleanId)
                ) {
                  matchedVendor = v; matchedCasting = c; matchedItem = i;
                  break outer2;
                }
              }
            }
          }

          // Pass 2: Fallback to casting code
          if (!matchedItem) {
            outer2_fallback: for (const v of vendorsData) {
              if (v === ownVendor) continue;
              for (const c of v.castings) {
                for (const i of c.items) {
                  if (
                    (a.castingCode && (a.castingCode === i.casting || a.castingCode === c.castingCode)) ||
                    (a.itemCode && (a.itemCode === i.casting || a.itemCode === c.castingCode))
                  ) {
                    matchedVendor = v; matchedCasting = c; matchedItem = i;
                    break outer2_fallback;
                  }
                }
              }
            }
          }
        }

        // Step 2: Match by vendor + customer name (reliable cross-reference)
        // batch.vendorId = vendor BP code; apiItem.customerName = the customer for this item
        if (!matchedItem) {
          const batchVendor = vendorsData.find(v => v.id === batch.vendorId || v.bpCode === batch.vendorId);
          if (batchVendor) {
            const castingMatch = batchVendor.castings.find(c =>
              !a.customerName || a.customerName === 'All' ||
              c.customerName === a.customerName ||
              c.customerName === 'All'
            );
            if (castingMatch) {
              // Find or synthesize item within that casting
              const itemMatch = castingMatch.items.find(i =>
                i.casting === a.castingCode || i.casting === a.itemCode || i.casting === a.itemMasterId
              ) ?? castingMatch.items[0];
              if (itemMatch) {
                matchedVendor = batchVendor;
                matchedCasting = castingMatch;
                matchedItem = itemMatch;
              }
            }
          }
        }
      }

      // Step 3: Fallback — build item from apiItem stored values
      // (may have wt=0/rate=0 if batch was created with item code mismatch, but at least shows something)
      if (!matchedItem) {
        const batchVendor = vendorsData.find(v => v.id === batch.vendorId || v.bpCode === batch.vendorId);
        const oldRate = a.oldRatePerKg != null ? Number(a.oldRatePerKg) : 0;
        const wt = Number(a.rmWeight) || Number(a.customerRmWeight) || 0;
        matchedVendor = batchVendor ?? {
          id: batch.vendorId, bpCode: batch.vendorId, name: batch.vendor,
          grades: [batch.grade], castingCodes: 0,
          currentMMR: 0, latestMMR: 0, consumables: 0, coatingRate: 0,
          lastUpdated: batch.date, castings: [],
        };
                matchedCasting = {
          grade: batch.grade, customerName: a.customerName || 'All',
          castingCode: a.castingCode || a.itemCode || '',
          rmWeight: wt, revisedRatePerKg: oldRate,
          mmr: a.oldMmr ?? 0,
          consumables: a.oldConsumables ?? 0,
          coating: a.oldRo ?? 0,
          extra: a.oldExtra ?? 0,
          codes: 1, items: [],
          fromDate: batch.fromDate || '', toDate: batch.toDate || '',
          itemCode: a.itemCode || '', itemDescription: '',
          customerApprovalFoundry: a.customerApprovalFoundry || '—'
        };
        matchedItem = {
          casting: a.castingCode || a.itemCode || '',
          desc: '', wt, customer: a.customerName || 'All',
          oldRate, oldPrice: a.oldPrice || 0,
          machining: a.machining || 0,
          coating: a.oldCoating != null ? Number(a.oldCoating) : 0,
          baseRate: oldRate, _id: a.itemMasterId,
        };
      }

      res.push({ vendor: matchedVendor!, casting: matchedCasting!, item: matchedItem!, apiItem: a });
    });

    return res;
  }, [batch.activeItemsData, apiItems, vendorsData, batch.vendorId, batch.vendor, batch.grade, batch.date, batch.fromDate, batch.toDate]);


  const filteredReviewItems = useMemo(() => {
    return synthesizedItems.map((si, i) => ({ ...si, originalIndex: i })).filter(({ item, casting, vendor, apiItem }) => {
      if (searchReview) {
        const q = searchReview.toLowerCase();
        if (![item.casting, item.desc, vendor.name, item.customer, casting.grade].join(' ').toLowerCase().includes(q)) return false;
      }
      if (filterChange !== 'all') {
        const oldMMR  = apiItem ? Number(apiItem.mmrRate ?? 0) : 0;
        const oldRO   = apiItem ? Number(apiItem.roRate ?? 0) : 0;
        const oldCons = apiItem ? Number(apiItem.consumablesRate ?? 0) : 0;
        const oldExt  = apiItem ? Number(apiItem.extraFactor ?? 0) : 0;

        const newMMR  = apiItem ? apiItem.customerRatePerKg : (batch.updatedMmr ?? batch.newMMR ?? oldMMR);
        const newRO   = batch.updatedCoatingRate   != null ? batch.updatedCoatingRate   : oldRO;
        const newCons = batch.updatedConsumablesRate != null ? batch.updatedConsumablesRate : oldCons;
        const newExt  = batch.updatedExtraFactor   != null ? batch.updatedExtraFactor   : oldExt;

        if (filterChange === 'mmr' && newMMR === oldMMR) return false;
        if (filterChange === 'ro' && newRO === oldRO) return false;
        if (filterChange === 'cons' && newCons === oldCons) return false;
        if (filterChange === 'extra' && newExt === oldExt) return false;
      }
      return true;
    });
  }, [synthesizedItems, searchReview, filterChange, batch]);

  useEffect(() => {
    if (synthesizedItems.length > 0 && selectedReviewItems.size === 0) {
      setSelectedReviewItems(new Set(synthesizedItems.map((_, i) => i)));
    }
  }, [synthesizedItems]);

  const handleToggleReviewAll = () => {
    if (selectedReviewItems.size === filteredReviewItems.length) {
      setSelectedReviewItems(new Set());
    } else {
      setSelectedReviewItems(new Set(filteredReviewItems.map(x => x.originalIndex)));
    }
  };

  const toggleReviewItem = (i: number) => {
    const next = new Set(selectedReviewItems);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelectedReviewItems(next);
  };

  // Status styling matching HTML reference
  const statusStyle = (): React.CSSProperties => {
    if (batch.status === 'approved') return { background: '#E8F4ED', color: '#1A5C32', border: '1.5px solid #A8D4B8' };
    if (batch.status === 'rejected') return { background: '#FDE8E8', color: '#8B2020', border: `1.5px solid #E8C0C0` };
    if (batch.status === 'draft')    return { background: '#F3F4F6', color: '#7A7A7A', border: '1.5px solid #D1D5DB' };
    return { background: '#FDE8E8', color: '#8B2020', border: '1.5px solid #E8C0C0' }; // pending
  };
  const statusLabel = BS[batch.status]?.label ?? batch.status;

  return (
    <div style={{ borderBottom: '1px solid #E5E7EB' }} className="last:border-0">
      {/* â”€â”€ Summary row â”€â”€ */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer', background: expanded ? '#FDF2F2' : 'transparent', transition: 'background .1s' }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#F9FAFB'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Batch chip */}
        <span style={{ background: '#1E1E1E', color: '#fff', fontFamily: 'monospace', fontSize: 14, fontWeight: 600, padding: '4px 10px', borderRadius: 5, flexShrink: 0 }}>{batch.id}</span>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#1E1E1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
            {isCustomer ? batch.description : `${batch.vendor} — ${batch.description}`}
          </p>
          <p style={{ fontSize: 11, color: '#7A7A7A', fontFamily: 'monospace' }}>
            {isCustomer 
              ? `${batch.codes} codes · ${batch.date}`
              : `${batch.grade} · ${batch.codes} codes · ${batch.changeType} · ${batch.date}`}
          </p>
          {batch.status === 'rejected' && batch.rejectReason && (
            <p style={{ fontSize: 11, color: BRAND.RED, marginTop: 2 }}>Reason: {batch.rejectReason}</p>
          )}
        </div>

        {/* MMR delta */}
        {batch.mmrDelta !== 0 && (
          <span style={{ fontSize: 14, fontWeight: 700, color: batch.mmrDelta > 0 ? '#1A5C32' : BRAND.RED, flexShrink: 0, fontFamily: 'monospace' }}>
            {batch.mmrDelta > 0 ? '+' : ''}₹{Math.abs(batch.mmrDelta).toFixed(2)}/kg
          </span>
        )}

        {/* Status badge */}
        <span style={{ ...statusStyle(), padding: '5px 14px', fontSize: 14, fontWeight: 600, borderRadius: 5, flexShrink: 0 }}>{statusLabel}</span>

        {/* Arrow */}
        <span style={{ fontSize: 13, color: '#7A7A7A', flexShrink: 0, transition: 'transform .16s', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
      </div>

      {/* â”€â”€ Expanded detail (Batch Review style) â”€â”€ */}
      {expanded && (
        <div style={{ padding: '16px 20px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: '#FFFFFF', padding: '12px 16px', borderRadius: 10, border: '1px solid #E5E7EB', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }} onClick={handleToggleReviewAll}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${selectedReviewItems.size > 0 ? BRAND.RED : '#D1D5DB'}`, background: selectedReviewItems.size === filteredReviewItems.length ? BRAND.RED : selectedReviewItems.size > 0 ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedReviewItems.size === filteredReviewItems.length ? (
                  <svg viewBox="0 0 10 8" fill="none" style={{ width: 10, height: 8 }}><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : selectedReviewItems.size > 0 ? (
                  <div style={{ width: 8, height: 2, background: BRAND.RED, borderRadius: 1 }} />
                ) : null}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#4A4A4A' }}>{selectedReviewItems.size} selected</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 300 }}>
              <input value={searchReview} onChange={e => setSearchReview(e.target.value)}
                placeholder="Search casting code, description, vendor…"
                style={{ flex: 1, padding: '7px 12px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 14, outline: 'none', background: '#FAFAFA' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {batch.status === 'draft' && (
                <>
                  <button onClick={handleSubmitClick} disabled={isSubmittingAction}
                    style={{ padding: '7px 16px', fontSize: 14, fontWeight: 700, border: `1.5px solid ${BRAND.RED}`, borderRadius: 7, background: BRAND.RED, color: '#fff', cursor: isSubmittingAction ? 'not-allowed' : 'pointer', opacity: isSubmittingAction ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isSubmittingAction ? (
                      <>
                        <svg className="animate-spin" style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Submitting...</span>
                      </>
                    ) : (
                      'Submit for Approval'
                    )}
                  </button>
                </>
              )}
              {batch.status === 'pending' && (
                <>
                  {showRejectInput ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection..."
                        style={{ border: '1.5px solid #E5E7EB', borderRadius: 7, padding: '6px 12px', fontSize: 14, width: 200, outline: 'none', fontFamily: 'inherit' }} />
                      <button onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
                        style={{ padding: '7px 12px', fontSize: 14, border: '1.5px solid #E5E7EB', borderRadius: 7, background: '#fff', color: '#4A4A4A', cursor: 'pointer' }}>Cancel</button>
                      <button disabled={!rejectReason.trim()} onClick={() => { onReject(rejectReason); setShowRejectInput(false); }}
                        style={{ padding: '7px 14px', fontSize: 14, fontWeight: 700, border: `1.5px solid ${BRAND.RED}`, borderRadius: 7, background: rejectReason.trim() ? BRAND.RED : '#E5E7EB', color: rejectReason.trim() ? '#fff' : '#AAAAAA', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>Confirm</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowRejectInput(true)}
                      style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${BRAND.RED}`, borderRadius: 7, background: '#FDE8E8', color: '#8B2020', cursor: 'pointer' }}>Reject</button>
                  )}
                  <button onClick={handleApproveClick} disabled={selectedReviewItems.size === 0 || isApproving}
                    style={{ padding: '7px 20px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 7, background: BRAND.RED, color: '#fff', cursor: (selectedReviewItems.size === 0 || isApproving) ? 'not-allowed' : 'pointer', opacity: (selectedReviewItems.size === 0 || isApproving) ? 0.6 : 1, letterSpacing: '.02em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isApproving ? (
                      <>
                        <svg className="animate-spin" style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Approving...</span>
                      </>
                    ) : (
                      'Approve Selected'
                    )}
                  </button>
                </>
              )}
              {batch.status === 'approved' && onRevert && (
                <button onClick={handleRevertClick} disabled={isReverting}
                  style={{ padding: '7px 16px', fontSize: 14, fontWeight: 700, border: `1.5px solid ${BRAND.RED}`, borderRadius: 7, background: '#fff', color: BRAND.RED, cursor: isReverting ? 'not-allowed' : 'pointer', opacity: isReverting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isReverting ? (
                    <>
                      <svg className="animate-spin" style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Reverting...</span>
                    </>
                  ) : (
                    selectedReviewItems.size > 0 && selectedReviewItems.size < filteredReviewItems.length
                      ? `Revert Selected (${selectedReviewItems.size})`
                      : 'Revert Approval'
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Affected rows matching Batch Review styling */}
          {filteredReviewItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredReviewItems.map(({ vendor, casting, item, apiItem, originalIndex }) => {
                const isSelected = selectedReviewItems.has(originalIndex);
                
                const oldMMR  = apiItem ? Number(apiItem.oldMmr ?? apiItem.mmrRate ?? 0) : casting.mmr;
                const oldRO   = apiItem ? Number(apiItem.oldRo ?? apiItem.roRate ?? 0) : casting.coating;
                const oldCons = apiItem ? Number(apiItem.oldConsumables ?? apiItem.consumablesRate ?? 0) : casting.consumables;
                const oldExt  = apiItem ? Number(apiItem.oldExtra ?? apiItem.extraFactor ?? 0) : casting.extra;

                let newMMR = oldMMR;
                if (batch.mmrChange !== undefined && batch.mmrChange !== null) {
                  newMMR = oldMMR + Number(batch.mmrChange);
                } else if (batch.updatedMmr !== undefined && batch.updatedMmr !== null) {
                  newMMR = Number(batch.updatedMmr);
                } else if (batch.newMMR !== undefined && batch.newMMR !== null) {
                  newMMR = Number(batch.newMMR);
                } else if (apiItem && apiItem.customerRatePerKg !== undefined && apiItem.customerRatePerKg !== null) {
                  newMMR = Number(apiItem.customerRatePerKg);
                }
                
                const oldRORate = oldRO;
                let newRORate = oldRORate;
                if (batch.roChange !== undefined && batch.roChange !== null) {
                  newRORate = oldRORate + Number(batch.roChange);
                } else if (batch.updatedCoatingRate !== undefined && batch.updatedCoatingRate !== null) {
                  newRORate = Number(batch.updatedCoatingRate);
                } else if (apiItem && apiItem.subcon !== undefined && item.wt > 0) {
                  newRORate = apiItem.subcon / item.wt;
                }
                                
                let newCons = oldCons;
                if (batch.consChange !== undefined && batch.consChange !== null) {
                  newCons = oldCons + Number(batch.consChange);
                } else if (batch.updatedConsumablesRate !== undefined && batch.updatedConsumablesRate !== null) {
                  newCons = Number(batch.updatedConsumablesRate);
                }

                let newExt = oldExt;
                if (batch.extraChange !== undefined && batch.extraChange !== null) {
                  newExt = oldExt + Number(batch.extraChange);
                } else if (batch.updatedExtraFactor !== undefined && batch.updatedExtraFactor !== null) {
                  newExt = Number(batch.updatedExtraFactor);
                }

                const displayWt = +numSafe(item.wt).toFixed(2);
                const displayOldRate = (apiItem && apiItem.oldRatePerKg != null)
                  ? Number(apiItem.oldRatePerKg)
                  : +numSafe(item.oldRate).toFixed(2);
                const oldRMCost = +(displayWt * displayOldRate).toFixed(2);
                const newRatePerKg = (batch.status === 'approved' && apiItem && apiItem.customerRatePerKg != null)
                  ? Number(apiItem.customerRatePerKg)
                  : +(displayOldRate + (newMMR - oldMMR) + (newRORate - oldRORate) + (newCons - oldCons) + (newExt - oldExt)).toFixed(2);
                const newRMCost = (batch.status === 'approved' && apiItem && (apiItem.customerRmPrice != null || apiItem.rmCost != null))
                  ? Number(apiItem.customerRmPrice ?? apiItem.rmCost)
                  : +(displayWt * newRatePerKg).toFixed(2);
                                const changedFields = [newMMR !== oldMMR, Math.abs(newRORate - oldRORate) > 0.01, newCons !== oldCons, newExt !== oldExt].filter(Boolean).length;

                



                return (
                  <div key={originalIndex} style={{ display: 'grid', gridTemplateColumns: '34px minmax(310px,1.15fr) minmax(245px,.95fr) minmax(245px,.95fr)', gap: 12, alignItems: 'stretch', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 12, opacity: isSelected ? 1 : 0.6, transition: 'opacity .2s' }}>
                    
                    {/* Checkbox */}
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${isSelected ? BRAND.RED : '#D1D5DB'}`, background: isSelected ? BRAND.RED : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        onClick={() => toggleReviewItem(originalIndex)}>
                        {isSelected && <svg viewBox="0 0 10 8" fill="none" style={{ width: 10, height: 8 }}><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>

                    {/* Static info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: '#F3F4F6', color: BRAND.RED, borderRadius: 10, padding: '2px 6px' }}>{originalIndex + 1}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1E1E1E' }}>{item.casting}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1A5C32', background: '#E8F4ED', border: '1px solid #A8D4B8', borderRadius: 4, padding: '2px 6px' }}>{casting.grade}</span>
                      </div>
                      
                      <div style={{ fontSize: 13, color: '#4A4A4A', fontWeight: 500, marginTop: 2 }}>{item.desc || '—'}</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13, color: '#111827', marginTop: 8 }}>
                        {!isCustomer ? (
                          <>
                            <span><b style={{ color: '#000000', fontWeight: 600 }}>Vendor:</b> {vendor.name}</span>
                            <span><b style={{ color: '#000000', fontWeight: 600 }}>Customer:</b> {item.customer || '—'}</span>
                          </>
                        ) : (
                          <>
                            <span><b style={{ color: '#000000', fontWeight: 600 }}>Customer:</b> {apiItem?.customerName || item.customer || '—'}</span>
                          </>
                        )}
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>Casting wt:</b> {numSafe(item.wt).toFixed(2)} kg</span>
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>Created Date:</b> {batch.date}</span>
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>Valid From:</b> {formatDateSafe(batch.fromDate)}</span>
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>Valid To:</b> {formatDateSafe(batch.toDate)}</span>
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>Old rate/kg:</b> ₹{numSafe(item.oldRate).toFixed(2)}</span>
                        <span><b style={{ color: '#000000', fontWeight: 600 }}>New rate/kg:</b> ₹{numSafe(newRatePerKg).toFixed(2)}</span>
                      </div>

                      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.RED, marginTop: 6 }}>
                        {changedFields} field{changedFields !== 1 ? 's' : ''} changed · RM Total: ₹{newRMCost.toFixed(2)}
                      </div>
                    </div>

                    {/* OLD price box */}
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
                      <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#4A4A4A', background: '#F3F4F6', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Old prices — <strong style={{ color: '#1E1E1E', fontSize: 12 }}>₹{numSafe(item.oldRate).toFixed(2)}/kg</strong></span><span style={{ fontWeight: 400, color: '#7A7A7A' }}>{batch.id}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, flex: 1 }}>
                        <PCell label="MMR" val={`₹${oldMMR.toFixed(2)}`} suffix="/kg" />
                        <PCell label="Red Oxide" val={`₹${oldRORate.toFixed(2)}`} suffix="/kg" />
                        <PCell label="Consumables" val={`₹${oldCons.toFixed(2)}`} suffix="/kg" />
                        <PCell label="Extra" val={`₹${oldExt.toFixed(2)}`} suffix="/pc" />
                      </div>
                    </div>

                    {/* NEW price box */}
                    <div style={{ border: `1.5px solid ${BRAND.RED}40`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FFFAFA' }}>
                      <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, background: '#FDE8E8', color: BRAND.RED, borderBottom: `1px solid ${BRAND.RED}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>New prices — <strong style={{ color: BRAND.RED, fontSize: 12 }}>₹{newRatePerKg.toFixed(2)}/kg</strong></span><span style={{ fontWeight: 500 }}>Changed highlighted</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, flex: 1 }}>
                        <PCell label="MMR" val={`₹${newMMR.toFixed(2)}`} delta={newMMR - oldMMR} changed={newMMR !== oldMMR} suffix="/kg" />
                        <PCell label="Red Oxide" val={`₹${newRORate.toFixed(2)}`} delta={newRORate - oldRORate} changed={Math.abs(newRORate - oldRORate) > 0.01} suffix="/kg" />
                        <PCell label="Consumables" val={`₹${newCons.toFixed(2)}`} delta={newCons - oldCons} changed={newCons !== oldCons} suffix="/kg" />
                        <PCell label="Extra" val={`₹${newExt.toFixed(2)}`} delta={newExt - oldExt} changed={newExt !== oldExt} suffix="/pc" />
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '28px', textAlign: 'center', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, color: '#AAAAAA', fontSize: 13 }}>
              {synthesizedItems.length === 0 ? 'Loading items…' : 'No casting codes match the current filters.'}
            </div>
          )}

          <p style={{ fontSize: 10, color: '#AAAAAA', fontStyle: 'italic', marginTop: 12, textAlign: 'right' }}>
            * Apart from RM, all other cost changes are borne by Geekeyy and not passed to customers
          </p>
        </div>
      )}
    </div>
  );
};


const OverviewBar: React.FC<{ items: { vendor: Vendor; casting: Casting; item: CastingItem; id: string }[]; vendors: Vendor[]; batches: Batch[] }> = ({ items, vendors, batches }) => {
  const uniqueVendors = new Set(items.map(x => x.vendor.id)).size;
  const uniqueCastingCodes = new Set(items.map(x => (x.item.casting || x.item._id || '').trim()).filter(Boolean)).size;
  const totalItems = items.length;
  const overdue = vendors.filter(v => getVendorStatusFromBatches(v.id, batches) === 'overdue').length;

  const stats = [
    { label: 'Vendors',       value: uniqueVendors },
    { label: 'Casting Codes', value: uniqueCastingCodes },
    { label: 'Items',         value: totalItems },
  ];

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 flex-wrap">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Overview</span>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className="text-gray-300">|</span>}
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-gray-800">{s.value.toLocaleString()}</span>
            <span className="text-xs text-gray-500">{s.label}</span>
          </div>
        </React.Fragment>
      ))}
      {overdue > 0 && (
        <span style={{ background: '#fee2e2', color: BRAND.RED }} className="px-2.5 py-0.5 rounded-full text-xs font-semibold">
          {overdue} codes at risk
        </span>
      )}
    </div>
  );
};

// â”€â”€ Vendor Status Label (editable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_OPTIONS = [
  { value: 'current',      label: 'Rates current' },
  { value: 'revision_due', label: 'Revision due' },
  { value: 'pending',      label: 'Revision pending' },
  { value: 'overdue',      label: 'Rates overdue' },
];


// â”€â”€ Duplicate Batch Warning Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DuplicateBatchWarning: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      onClick={e => e.stopPropagation()}>
      <div style={{ background: BRAND.RED }} className="px-6 py-4 flex items-center gap-3">
        <span className="text-white text-2xl">âš </span>
        <p className="text-white font-bold text-base">Revision Already in Progress</p>
      </div>
      <div className="px-6 py-5">
        <p className="text-gray-700 text-sm leading-relaxed">{message}</p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button onClick={onClose}
          style={{ background: BRAND.RED, color: '#fff' }}
          className="px-6 py-2 text-sm font-bold rounded-lg hover:opacity-90">
          OK, Got it
        </button>
      </div>
    </div>
  </div>
);

interface BatchEditDrawerProps {
  scope: BatchEditScope;
  vendorsData: Vendor[];
  batchNumber: number;
  customerFilter?: string;
  onClose: () => void;
  onSaveDraft: (batch: Batch) => void;
  onCreateBatch: (batch: Batch) => void;
  isCustomer?: boolean;
}

const BatchEditDrawer: React.FC<BatchEditDrawerProps> = ({ scope, vendorsData, batchNumber, customerFilter, onClose, onSaveDraft, onCreateBatch, isCustomer }) => {
  const [form, setForm] = useState({
    mmrRate:           '',
    mmrChange:         '',
    mmrDir:            'inc',
    redOxide:          '',
    redOxideChange:    '',
    roDir:             'inc',
    consumables:       '',
    consumablesChange: '',
    consDir:           'inc',
    extraFactor:       '',
    extraChange:       '',
    extraDir:          'inc',
    batchDesc:         '',
    fromDate:          '2026-07-01',
    toDate:            '2026-09-30',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [rateInputMode, setRateInputMode] = useState<'base' | 'change'>('change');
  const [updateMode, setUpdateMode] = useState<'rm' | 'fg'>('rm');
  const [fgForm, setFgForm] = useState({
    machining: '',
    machiningChange: '',
    powderCoating: '',
    powderCoatingChange: '',
    packing: '',
    packingChange: '',
    transCharges: '',
    transChargesChange: '',
    rejectionCost: '',
    rejectionCostChange: '',
    specialProcess: '',
    specialProcessChange: '',
    ohp: '',
    ohpChange: ''
  });
  const previewRef = useRef<HTMLDivElement>(null);

  const initialItems = useMemo(() => {
    if (scope.flatSelectedItems && scope.flatSelectedItems.length > 0) {
      return scope.flatSelectedItems;
    }
    let items: { vendor: Vendor; casting: Casting; item: CastingItem }[] = [];
    if (scope.level === 'vendor') {
      scope.vendors?.forEach(vid => {
        const vendor = vendorsData.find(v => v.id === vid);
        if (vendor) {
          vendor.castings.forEach(c => {
             c.items.forEach(i => items.push({ vendor, casting: c, item: i }));
          });
        }
      });
    } else if (scope.level === 'grade') {
      const vendor = vendorsData.find(v => v.id === scope.vendors?.[0]);
      if (vendor) {
         const c = vendor.castings.find(c => c.grade === scope.grade);
         if (c) c.items.forEach(i => items.push({ vendor, casting: c, item: i }));
      }
    } else if (scope.level === 'code') {
      vendorsData.forEach(vendor => {
         if (!scope.vendors || scope.vendors.includes(vendor.id)) {
           vendor.castings.forEach(c => {
             c.items.forEach(i => {
               if (scope.codes?.includes(String(i._id))) items.push({ vendor, casting: c, item: i });
             });
           });
         }
      });
    }
    return items;
  }, [scope, vendorsData]);

  const selectedCasting = initialItems[0]?.casting;
  useEffect(() => {
    if (selectedCasting) {
      setForm(p => ({
        ...p,
        fromDate: toIsoDate(selectedCasting.fromDate) || '2026-07-01',
        toDate: toIsoDate(selectedCasting.toDate) || '2026-09-30',
      }));
    }
  }, [selectedCasting]);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set(initialItems.map((_, idx) => String(idx))));
  
  useEffect(() => {
    setSelectedCodes(new Set(initialItems.map((_, idx) => String(idx))));
  }, [initialItems]);

  const selectedItemsData = useMemo(() => initialItems.filter((_, idx) => selectedCodes.has(String(idx))), [initialItems, selectedCodes]);

  const isSingleGrade = new Set(selectedItemsData.map(x => x.casting.grade)).size === 1;
  const isSingleVendor = new Set(selectedItemsData.map(x => x.vendor.id)).size === 1;
  const showCurrentRates = isSingleGrade && isSingleVendor && selectedItemsData.length > 0;
  const currentRateCasting = selectedItemsData[0]?.casting;
  const currentRateVendor = selectedItemsData[0]?.vendor;

  const currentMMR         = showCurrentRates ? (currentRateCasting?.mmr ?? 0) : 0;
  const currentCoating     = showCurrentRates ? (currentRateCasting?.coating ?? 0) : 0;
  const currentConsumables = showCurrentRates ? (currentRateVendor?.consumables ?? 0) : 0;
  const currentExtra       = showCurrentRates ? (currentRateCasting?.extra ?? 0) : 0;

  const computedMmr = form.mmrRate 
    ? (parseFloat(form.mmrRate) || 0) 
    : (form.mmrChange ? currentMMR + (parseFloat(form.mmrChange) || 0) : currentMMR);

  const computedCoating = form.redOxide 
    ? (parseFloat(form.redOxide) || 0) 
    : (form.redOxideChange ? currentCoating + (parseFloat(form.redOxideChange) || 0) : currentCoating);

  const computedConsumables = form.consumables 
    ? (parseFloat(form.consumables) || 0) 
    : (form.consumablesChange ? currentConsumables + (parseFloat(form.consumablesChange) || 0) : currentConsumables);

  const computedExtra = form.extraFactor 
    ? (parseFloat(form.extraFactor) || 0) 
    : (form.extraChange ? currentExtra + (parseFloat(form.extraChange) || 0) : currentExtra);

  const newMMR = computedMmr;
  const uniqueCodesCount = new Set(selectedItemsData.map(x => x.item.casting)).size;

  const generatedDesc = useMemo(() => {
    let customerName = customerFilter || '';
    if (!customerName || customerName === 'All' || customerName === 'All Customers' || customerName === '—') {
      const firstItemCust = selectedItemsData[0]?.item.customer;
      if (firstItemCust && firstItemCust !== 'All' && firstItemCust !== 'All Customers' && firstItemCust !== '—') {
        customerName = firstItemCust;
      }
    }
    
    if (isCustomer) {
      const getQuarterFromDate = (dateStr: string): string => {
        if (!dateStr) return 'Q1';
        // Parse dateSafely
        const dateParts = dateStr.split('-');
        if (dateParts.length === 3) {
          const month = parseInt(dateParts[1], 10); // 1-12
          if (month >= 1 && month <= 3) return 'Q1';
          if (month >= 4 && month <= 6) return 'Q2';
          if (month >= 7 && month <= 9) return 'Q3';
          return 'Q4';
        }
        return 'Q1';
      };
      const getYearFromDate = (dateStr: string): string => {
        if (!dateStr) return '2026';
        return dateStr.split('-')[0];
      };
      const { isSingleMonth, monthName } = isSingleMonthRange(form.fromDate, form.toDate);
      const periodLabel = isSingleMonth ? monthName : getQuarterFromDate(form.fromDate);
      const yr = getYearFromDate(form.fromDate);
      return `${periodLabel}-${yr}-MMR-${customerName}`;
    }

    const isOriginalDates = currentRateCasting && 
      toIsoDate(currentRateCasting.fromDate) === form.fromDate && 
      toIsoDate(currentRateCasting.toDate) === form.toDate;

    return getNextQuarterDesc(form.fromDate, form.toDate, customerName, isOriginalDates);
  }, [form.fromDate, form.toDate, customerFilter, selectedItemsData, currentRateCasting, isCustomer]);

  // Single-direction inputs: entering on one clears the other
  const handleMmrRate = (val: string) =>
    setForm(p => ({ ...p, mmrRate: val, mmrChange: '' }));
  const handleMmrChange = (val: string) =>
    setForm(p => ({ ...p, mmrChange: val, mmrRate: '' }));
  const handleRedOxide = (val: string) =>
    setForm(p => ({ ...p, redOxide: val, redOxideChange: '' }));
  const handleRedOxideChange = (val: string) =>
    setForm(p => ({ ...p, redOxideChange: val, redOxide: '' }));
  const handleConsumables = (val: string) =>
    setForm(p => ({ ...p, consumables: val, consumablesChange: '' }));
  const handleConsumablesChange = (val: string) =>
    setForm(p => ({ ...p, consumablesChange: val, consumables: '' }));
  const handleExtraFactor = (val: string) =>
    setForm(p => ({ ...p, extraFactor: val, extraChange: '' }));
  const handleExtraChange = (val: string) =>
    setForm(p => ({ ...p, extraChange: val, extraFactor: '' }));

  const handleTogglePreview = () => {
    setShowPreview(p => {
      if (!p) setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      return !p;
    });
  };

  const makeBatch = (status: BatchStatus): Batch => {
    let vendorName = 'Multiple Vendors';
    let vendorId = '';
    
    // Check if all selected items belong to the same vendor (only for Vendor batches)
    if (!isCustomer) {
      const isSingleVendorScope = new Set(selectedItemsData.map(x => x.vendor.id)).size === 1;
      if (isSingleVendorScope && selectedItemsData.length > 0) {
        vendorName = selectedItemsData[0].vendor.name;
        vendorId = selectedItemsData[0].vendor.id;
      } else if (scope.vendors?.length === 1) {
        const v = vendorsData.find(v => v.id === scope.vendors?.[0]);
        if (v) { vendorName = v.name; vendorId = v.id; }
      }
    }
    let gradeName = 'Multiple Grades';
    if (scope.level === 'grade') gradeName = scope.grade || gradeName;

    return {
      id: `B-${String(batchNumber).padStart(4, '0')}`,
      vendor: vendorName,
      vendorId,
      description: generatedDesc,
      grade: gradeName,
      codes: uniqueCodesCount,
      items: selectedItemsData.length,
      changeType: 'Batch update',
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      status,
      mmrDelta: +(newMMR - currentMMR).toFixed(2),
      updatedMmr: form.mmrRate ? parseFloat(form.mmrRate) : undefined,
      mmrChange: form.mmrChange ? parseFloat(form.mmrChange) : undefined,
      updatedCoatingRate: form.redOxide ? parseFloat(form.redOxide) : undefined,
      roChange: form.redOxideChange ? parseFloat(form.redOxideChange) : undefined,
      updatedConsumablesRate: form.consumables ? parseFloat(form.consumables) : undefined,
      consChange: form.consumablesChange ? parseFloat(form.consumablesChange) : undefined,
      updatedExtraFactor: form.extraFactor ? parseFloat(form.extraFactor) : undefined,
      extraChange: form.extraChange ? parseFloat(form.extraChange) : undefined,
      newMMR,
      newRedOxide: computedCoating,
      newConsumables: computedConsumables,
      newExtra: computedExtra,
      fromDate: form.fromDate,
      toDate: form.toDate,
      activeItemsData: selectedItemsData,
      customer: customerFilter || (selectedItemsData[0]?.item.customer || 'All Customers'),
    };
  };

  let title = '';
  if (scope.level === 'vendor') {
    title = `Edit — ${initialItems[0]?.vendor.name || 'Vendor'}`;
  } else if (scope.level === 'grade') {
    title = `Edit — ${scope.grade} (${initialItems.length} codes)`;
  } else {
    title = initialItems.length === 1
      ? `Edit — ${initialItems[0]?.item.casting}`
      : `Batch Edit — ${new Set(initialItems.map(x => x.item.casting)).size} selected codes`;
  }

    
  const inp = `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 bg-white`;
  
  const singleVendorName = initialItems[0]?.vendor.name || 'Unknown';
  const displayGradeName = scope.level === 'grade' ? (scope.grade || 'Unknown') : (isSingleGrade ? selectedItemsData[0]?.casting.grade : 'Multiple Grades');
  
  const scopePills = [
    ...(!isCustomer ? [{ label: 'Vendors',                value: singleVendorName }] : []),
    ...(!isCustomer ? [{ label: 'Grade',                  value: displayGradeName }] : []),
    { label: 'Customer',               value: customerFilter || 'All Customers' },
    { label: 'Casting codes in scope', value: `${uniqueCodesCount} casting codes` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900 text-base">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">Pricing Update</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* SCOPE */}
          <section>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Scope</p>
            <div className="flex flex-wrap gap-2">
              {scopePills.map(pill => (
                <div key={pill.label} style={{ background: BRAND.RED_LIGHT, borderColor: BRAND.RED_BORDER }} className="border rounded-lg px-3 py-1.5">
                  <p className="text-xs font-semibold text-gray-500">{pill.label}</p>
                  <p className="text-xs font-semibold" style={{ color: BRAND.RED }}>{pill.value}</p>
                </div>
              ))}
            </div>
          </section>


          {/* NEW RATES */}
          <section>
            {isCustomer && scope?.mode !== 'edit_selected' && (
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Update Type</p>
                  <p className="text-xs text-gray-400 mt-0.5">Select whether you are updating Raw Material or Finished Goods rates.</p>
                </div>
                <div className="relative flex items-center bg-gray-100 p-0.5 rounded-full border border-gray-200 w-max shadow-inner">
                  <button
                    onClick={() => setUpdateMode('rm')}
                    className={`relative z-10 px-5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${updateMode === 'rm' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                    Raw Material (RM)
                  </button>
                  <button
                    onClick={() => setUpdateMode('fg')}
                    className={`relative z-10 px-5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${updateMode === 'fg' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                    Finished Goods (FG)
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  {updateMode === 'fg' ? 'New Working Cost Rates — enter only what has changed' : 'New rates — enter only what has changed'}
                </p>
                <p className="text-xs text-gray-400">Choose whether to enter the direct new rate or the amount to change by.</p>
              </div>
              <div className="relative flex items-center bg-gray-100/80 p-1 rounded-full border border-gray-200/60 w-max shadow-inner">
                <button
                  onClick={() => {
                    setRateInputMode('change');
                    setForm(p => ({ ...p, mmrRate: '', redOxide: '', consumables: '', extraFactor: '' }));
                    setFgForm({
                      machining: '', machiningChange: '',
                      powderCoating: '', powderCoatingChange: '',
                      packing: '', packingChange: '',
                      transCharges: '', transChargesChange: '',
                      rejectionCost: '', rejectionCostChange: '',
                      specialProcess: '', specialProcessChange: '',
                      ohp: '', ohpChange: ''
                    });
                  }}
                  className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${rateInputMode === 'change' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                  Change Amount (+/-)
                </button>
                <button
                  onClick={() => {
                    setRateInputMode('base');
                    setForm(p => ({ ...p, mmrChange: '', redOxideChange: '', consumablesChange: '', extraChange: '' }));
                    setFgForm({
                      machining: '', machiningChange: '',
                      powderCoating: '', powderCoatingChange: '',
                      packing: '', packingChange: '',
                      transCharges: '', transChargesChange: '',
                      rejectionCost: '', rejectionCostChange: '',
                      specialProcess: '', specialProcessChange: '',
                      ohp: '', ohpChange: ''
                    });
                  }}
                  className={`relative z-10 px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${rateInputMode === 'base' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-500 hover:text-gray-700'}`}>
                  Direct Rate
                </button>
              </div>
            </div>

            {updateMode === 'rm' ? (
              <>
                {/* Row 1: MMR | Red Oxide */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">MMR Base Rate (₹/kg)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={form.mmrRate} onChange={e => handleMmrRate(e.target.value)}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={form.mmrChange} onChange={e => handleMmrChange(e.target.value)}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Red Oxide (₹/kg)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={form.redOxide} onChange={e => handleRedOxide(e.target.value)}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={form.redOxideChange} onChange={e => handleRedOxideChange(e.target.value)}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>

                {/* Row 2: Consumables | Extra Factor */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Consumables (₹/kg)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={form.consumables} onChange={e => handleConsumables(e.target.value)}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={form.consumablesChange} onChange={e => handleConsumablesChange(e.target.value)}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Extra Factor (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={form.extraFactor} onChange={e => handleExtraFactor(e.target.value)}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={form.extraChange} onChange={e => handleExtraChange(e.target.value)}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Finished Goods / Working Cost Input Grid */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Machining */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Machining Charge (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.machining} onChange={e => setFgForm(p => ({ ...p, machining: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.machiningChange} onChange={e => setFgForm(p => ({ ...p, machiningChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                  {/* Powder Coating */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Powder Coating (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.powderCoating} onChange={e => setFgForm(p => ({ ...p, powderCoating: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.powderCoatingChange} onChange={e => setFgForm(p => ({ ...p, powderCoatingChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Packing */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Packing (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.packing} onChange={e => setFgForm(p => ({ ...p, packing: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.packingChange} onChange={e => setFgForm(p => ({ ...p, packingChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                  {/* Trans Charges */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Trans Charges (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.transCharges} onChange={e => setFgForm(p => ({ ...p, transCharges: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.transChargesChange} onChange={e => setFgForm(p => ({ ...p, transChargesChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Rejection Cost */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Rejection Cost (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.rejectionCost} onChange={e => setFgForm(p => ({ ...p, rejectionCost: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.rejectionCostChange} onChange={e => setFgForm(p => ({ ...p, rejectionCostChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                  {/* Special Process */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">Special Process (₹/piece)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.specialProcess} onChange={e => setFgForm(p => ({ ...p, specialProcess: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.specialProcessChange} onChange={e => setFgForm(p => ({ ...p, specialProcessChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* OHP */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 col-span-2">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600">OHP (%)</span>
                    </div>
                    {rateInputMode === 'base' ? (
                      <input type="number" step="any" value={fgForm.ohp} onChange={e => setFgForm(p => ({ ...p, ohp: e.target.value }))}
                        placeholder="Enter new rate"
                        className={inp} />
                    ) : (
                      <input type="number" step="any" value={fgForm.ohpChange} onChange={e => setFgForm(p => ({ ...p, ohpChange: e.target.value }))}
                        placeholder="Amount to change"
                        className={inp} />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Row 3: Batch Description full-width */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-600">Batch Description</span>
                <span className="text-xs text-gray-400 ml-1">(Automatically generated from effective period)</span>
              </div>
              <input value={generatedDesc} readOnly
                className="w-full px-3 py-2 text-sm focus:outline-none bg-gray-50 cursor-not-allowed text-gray-500 font-mono" />
            </div>
          </section>

          {/* EFFECTIVE PERIOD */}
          <section>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Effective Period</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Effective from</label>
                <DateInput value={form.fromDate} onChange={val => setForm(p => ({ ...p, fromDate: val }))} className={inp} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Valid until</label>
                <DateInput value={form.toDate} onChange={val => setForm(p => ({ ...p, toDate: val }))} className={inp} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Period / Month</label>
                <select
                  value={(() => {
                    const { isSingleMonth } = isSingleMonthRange(form.fromDate, form.toDate);
                    if (isSingleMonth) {
                      const d = new Date(form.fromDate);
                      return `M${d.getMonth() + 1}`;
                    }
                    const qStart = getQ(form.fromDate);
                    const qEnd = getQ(form.toDate);
                    if (qStart && qStart === qEnd) return `Q${qStart}`;
                    return '';
                  })()}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.startsWith('Q')) {
                      const q = parseInt(val.substring(1));
                      const year = getYearForQuarterSwitch(form.fromDate, q);
                      const { from, to } = getDatesForQuarter(q, year);
                      setForm(p => ({ ...p, fromDate: from, toDate: to }));
                    } else if (val.startsWith('M')) {
                      const m = parseInt(val.substring(1));
                      const year = getYearForMonthSwitch(form.fromDate, m);
                      const from = `${year}-${String(m).padStart(2, '0')}-01`;
                      const lastDay = new Date(year, m, 0).getDate();
                      const to = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                      setForm(p => ({ ...p, fromDate: from, toDate: to }));
                    }
                  }}
                  className={inp}
                >
                  <option value="">Select Period</option>
                  <optgroup label="Quarters">
                    <option value="Q1">Quarter 1 (Jan - Mar)</option>
                    <option value="Q2">Quarter 2 (Apr - Jun)</option>
                    <option value="Q3">Quarter 3 (Jul - Sep)</option>
                    <option value="Q4">Quarter 4 (Oct - Dec)</option>
                  </optgroup>
                  <optgroup label="Months">
                    <option value="M1">January</option>
                    <option value="M2">February</option>
                    <option value="M3">March</option>
                    <option value="M4">April</option>
                    <option value="M5">May</option>
                    <option value="M6">June</option>
                    <option value="M7">July</option>
                    <option value="M8">August</option>
                    <option value="M9">September</option>
                    <option value="M10">October</option>
                    <option value="M11">November</option>
                    <option value="M12">December</option>
                  </optgroup>
                </select>
              </div>
              <div className="flex-1">
                <div style={{ background: '#fef9c3', borderColor: '#fde047' }} className="border rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-yellow-600">Items selected</p>
                  <p className="text-sm font-bold text-yellow-700">{uniqueCodesCount} casting codes</p>
                </div>
              </div>
            </div>
          </section>

          {/* PREVIEW TABLE */}
          {showPreview && (
            <section ref={previewRef}>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" className="rounded w-4 h-4 text-[#2563eb] focus:ring-[#2563eb]"
                      checked={selectedCodes.size === initialItems.length && initialItems.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCodes(new Set(initialItems.map((_, idx) => String(idx))));
                        else setSelectedCodes(new Set());
                      }}
                    />
                    <p className="text-xs font-semibold text-gray-600">
                      Preview Impact on Selected Items
                    </p>
                  </div>
                  {newMMR > 0 && <span style={{ color: BRAND.RED }} className="text-xs font-semibold ml-2">New MMR: ₹{newMMR.toFixed(2)}/kg</span>}
                </div>
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_0_#e5e7eb]">
                      <tr className="text-left text-gray-500 font-medium">
                        <th className="px-4 py-3 w-10"></th>
                        {!isCustomer && <th className="px-3 py-3">Vendor</th>}
                        {!isCustomer && <th className="p-3 font-semibold">Grade</th>}
                        {isCustomer && <th className="p-3 font-semibold">Customer</th>}
                        {isCustomer && <th className="p-3 font-semibold">Customer Approved Foundry</th>}
                        <th className="p-3 font-semibold">Casting Code</th>
                        <th className="px-3 py-3 text-right">Wt</th>
                        <th className="px-3 py-3 text-right">Old Rate/kg</th>
                        <th className="px-3 py-3 text-right">New Rate/kg</th>
                        <th className="px-3 py-3 text-right">Current RM Price</th>
                        <th className="px-3 py-3 text-right">New RM Price</th>
                        <th className="px-3 py-3 text-right">Price Impact</th>
                        <th className="px-3 py-3 text-right border-r border-gray-100">Price Impact %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {initialItems.map(({ item, casting, vendor }, i) => {
                        const rate     = form.mmrRate ? parseFloat(form.mmrRate) : (casting.mmr || 0) + (parseFloat(form.mmrChange) || 0);
                        const oldRORate = casting.coating || 0;
                        const newRORate = form.redOxide ? parseFloat(form.redOxide) : oldRORate + (parseFloat(form.redOxideChange) || 0);
                        const oldConsRate = casting.consumables || 0;
                        const newConsRate = form.consumables ? parseFloat(form.consumables) : oldConsRate + (parseFloat(form.consumablesChange) || 0);
                        const oldExtRate = casting.extra || 0;
                        const newExtRate = form.extraFactor ? parseFloat(form.extraFactor) : oldExtRate + (parseFloat(form.extraChange) || 0);

                        const itemWt = +numSafe(item.wt).toFixed(2);
                        const itemOldRate = +numSafe(item.oldRate).toFixed(2);
                        const oldRMCost = +(itemWt * itemOldRate).toFixed(2);
                        const newRatePerKg = +(itemOldRate + (rate - (casting.mmr || 0)) + (newRORate - oldRORate) + (newConsRate - oldConsRate) + (newExtRate - oldExtRate)).toFixed(2);
                        const newRMCost = +(itemWt * newRatePerKg).toFixed(2);
                        const newRO    = +(itemWt * newRORate).toFixed(2);
                                                                        const delta    = +(newRMCost - oldRMCost).toFixed(2);
                        const pct      = oldRMCost > 0 ? (delta / oldRMCost) * 100 : 0;
                        return (
                          <tr key={i} className="bg-white hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2">
                              <input type="checkbox" className="rounded w-4 h-4 text-[#2563eb] focus:ring-[#2563eb]"
                                checked={selectedCodes.has(String(i))}
                                onChange={(e) => {
                                  const s = new Set(selectedCodes);
                                  if (e.target.checked) s.add(String(i));
                                  else s.delete(String(i));
                                  setSelectedCodes(s);
                                }}
                              />
                            </td>
                            {!isCustomer && <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{vendor.name}</td>}
                            {!isCustomer && <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{casting.grade}</td>}
                            {isCustomer && <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{item.customer || '—'}</td>}
                            {isCustomer && <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{casting.customerApprovalFoundry || '—'}</td>}
                            <td className="px-3 py-2 font-mono text-gray-700">{item.casting}</td>
                            <td className="px-3 py-2 text-right">{itemWt.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">₹{itemOldRate.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{newRatePerKg.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">₹{(itemWt * itemOldRate).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{newRMCost.toFixed(2)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {delta > 0 ? '+' : ''}₹{delta.toFixed(2)}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold border-r border-gray-100 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {delta > 0 ? '+' : ''}{pct.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 italic">
                  Customer side reflects RM cost changes only. Internal process costs borne by Geekeyy.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <div className="flex items-center gap-3">
            <button onClick={handleTogglePreview}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100">
              {showPreview ? 'Hide Preview' : 'Preview Impact on Items'}
            </button>
            <span className="text-xs text-gray-400 italic hidden sm:block">Saves as a draft batch</span>
            <button onClick={() => { onSaveDraft(makeBatch('draft')); onClose(); }}
              disabled={selectedCodes.size === 0}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
              Save as Draft
            </button>
            <button onClick={() => { onCreateBatch(makeBatch('pending')); onClose(); }}
              disabled={selectedCodes.size === 0}
              style={{ background: selectedCodes.size === 0 ? '#e5e7eb' : BRAND.RED, color: selectedCodes.size === 0 ? '#9ca3af' : '#fff' }}
              className="px-5 py-2 text-sm font-bold rounded-lg hover:opacity-90 disabled:cursor-not-allowed">
              Create Revision Batch
            </button>
          </div>
        </div>
        </>
      </div>
    </div>
  );
};


const PricingUpdatePage: React.FC = () => {
    const [gradeFilter,      setGradeFilter]      = useState<string[]>([]);
  const [vendorFilter,     setVendorFilter]      = useState('');
  const [customerFilter,   setCustomerFilter]    = useState('');
  const [ctypeFilter,      setCtypeFilter]       = useState('');
  const [textSearch,       setTextSearch]        = useState('');
  const [pricingMode,      setPricingMode]       = useState<'vendor' | 'customer'>('vendor');
  const [_expandedVendors,   _setExpandedVendors]  = useState<Set<string>>(new Set());
  const [selectedItemIds,   setSelectedItemIds]  = useState<Set<string>>(new Set());
  const [batchFilter,      setBatchFilter]       = useState<BatchFilter>('Approval Pending');
  const [_batchDropdown,    _setBatchDropdown]     = useState(false);
  const [revisionVendor,   setRevisionVendor]    = useState<{ vendor: Vendor; grade?: string } | null>(null);
  const [localBatches,     setLocalBatches]      = useState<Batch[]>([]);
  const [expandedBatch,    setExpandedBatch]     = useState<string | null>(null);
  const [showAllBatches,   setShowAllBatches]    = useState(false);
  const [batchEditScope,   setBatchEditScope]    = useState<BatchEditScope | null>(null);
  const [_vendorStatusOverrides, setVendorStatusOverrides] = useState<Record<string, string>>({});
  const [batchCounter, setBatchCounter] = useState(1);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  const [filterChange, _setFilterChange] = useState('all');


  // â”€â”€ Real API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const qc = useQueryClient();
  const { data: apiVendorsData, isLoading: vendorsLoading, isFetching: vendorsFetching } = useQuery({
    queryKey: ['vendors-all', 'list-pricing'], 
    queryFn: () => vendorApi.getAll(1, 1000),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to avoid redundant DB queries and memory churn
  });
  const apiVendors = apiVendorsData?.items ?? [];
  const { data: itemsData, isLoading: itemsLoading, isFetching: itemsFetching } = useQuery({
    queryKey: ['items-all', 'pricing-update'], 
    queryFn: () => itemApi.listPricing({ pageSize: 1000, itemGroup: '109' }),
    staleTime: 5 * 60 * 1000,
  });
  const allItems = itemsData?.items ?? [];
  const selectedVendorId = useMemo(() => apiVendors.find((v: any) => (v.name || '').trim() === vendorFilter.trim())?.id, [apiVendors, vendorFilter]);
  const { data: filterOptions, isFetching: filterOptionsFetching } = useQuery({
    queryKey: ['item-filter-options', selectedVendorId, customerFilter],
    queryFn: () => itemApi.getFilterOptions({
      vendorId: selectedVendorId || undefined,
      customerName: customerFilter || undefined
    }),
  });
    const { data: apiBatches = [] } = useQuery({
    queryKey: ['pricing-batches'], queryFn: pricingApi.listBatches, refetchInterval: 30_000,
  });
  const createBatchMut = useMutation({
    mutationFn: (body: CreateBatchBody) => pricingApi.createBatch(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      showToast('Batch created successfully!');
    },
  });
  const approveMut = useMutation({
    mutationFn: (id: number) => pricingApi.approveBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      qc.invalidateQueries({ queryKey: ['vendors-all'] });
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      qc.invalidateQueries({ queryKey: ['items-all'] });
      qc.invalidateQueries({ queryKey: ['customer-items-update'] });
      showToast('Batch approved successfully!');
    },
  });
  const revertMut = useMutation({
    mutationFn: ({ id, itemIds }: { id: number; itemIds?: number[] }) => pricingApi.revertBatch(id, itemIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      qc.invalidateQueries({ queryKey: ['vendors-all'] });
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      qc.invalidateQueries({ queryKey: ['items-all'] });
      qc.invalidateQueries({ queryKey: ['customer-items-update'] });
    },
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => pricingApi.rejectBatch(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      showToast('Batch rejected successfully.');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => pricingApi.deleteBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      showToast('Batch deleted successfully.');
    },
  });
  // Silent delete used internally after revert — no separate toast (handleRevert shows one combined toast)
  const silentDeleteMut = useMutation({
    mutationFn: (id: number) => pricingApi.deleteBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
    },
  });
  const submitMut = useMutation({
    mutationFn: (id: number) => pricingApi.submitBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-batches'] });
      showToast('Batch submitted successfully!');
    },
  });

  // Enrich API vendors with item_master data
  const vendorsData: Vendor[] = useMemo(() => {
    const adapted = adaptVendors(apiVendors);
    return adapted.map(v => {
      const vItems = allItems.filter(i => i.vendorId === v.bpCode);
      
      // Only display castings explicitly present in the Vendor Master
      let vendorCastings = v.castings;

      return {
        ...v,
        grades: vendorCastings.map(c => (c.grade || '').trim()),
        castings: vendorCastings.map(c => {
          const cGrade = (c.grade || '').trim();
          const cCustomer = (c.customerName || 'All').trim();
          const cCastingCode = (c.castingCode || 'All').trim();
          const cItemCode = (c.itemCode || '').trim();
          const gi = vItems.filter(i => {
            if ((i.grade || '').trim() !== cGrade) return false;
            if (cCustomer !== 'All' && (i.customerName || '').trim() !== cCustomer) return false;
            // If the vendor casting has a specific itemCode, match by itemCode (unique SAP code)
            if (cItemCode) {
              return (i.itemCode || '').trim() === cItemCode || (i.id || '').trim() === cItemCode;
            }
            if (cCastingCode !== 'All' && (i.castingCode || i.itemCode || '').trim() !== cCastingCode) return false;
            return true;
          });
          const itemsList = gi.length > 0 
            ? gi.map(i => ({
                casting: i.castingCode || i.itemCode, desc: i.description,
                wt: c.rmWeight, customer: i.customerName, oldRate: c.revisedRatePerKg, baseRate: i.ratePerKg || 0,
                oldPrice: i.currentPrice, machining: i.machining ?? 0, coating: i.coating ? Number(i.coating) || 0 : 0, _id: i.itemCode || i.id, customerType: i.customerType,
              }))
            : [{
                casting: cCastingCode,
                desc: c.itemDescription || '—',
                wt: c.rmWeight,
                customer: cCustomer,
                oldRate: c.revisedRatePerKg,
                baseRate: c.revisedRatePerKg,
                oldPrice: c.rmWeight * c.revisedRatePerKg,
                machining: 0,
                coating: 0,
                _id: `${v.id}|${cGrade}|${cItemCode || cCastingCode}`,
                customerType: 'Domestic',
              }];

          return {
            ...c, grade: cGrade, customerName: cCustomer, castingCode: cCastingCode, codes: gi.length,
            items: itemsList,
          };
        }),
        castingCodes: vItems.length,
      };
    });
  }, [apiVendors, allItems]);

  // Adapt API batches → local Batch shape
  const apiBatchesAdapted: Batch[] = useMemo(() => apiBatches.map(b => ({
    id: b.batchNumber, vendor: b.vendorName ?? '', vendorId: b.vendorId ?? '',
    description: b.description, grade: b.grade ?? '', codes: b.itemCount,
    items: b.itemCount, changeType: 'MMR change',
    date: new Date(b.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date(b.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    status: b.status, mmrDelta: 0, _apiId: b.id,
    customer: b.customerName || 'All Customers',
    updatedMmr: b.updatedMmr,
    updatedCoatingRate: b.updatedCoatingRate,
    updatedConsumablesRate: b.updatedConsumablesRate,
    updatedExtraFactor: b.updatedExtraFactor,
  mmrChange: b.mmrChange,
  roChange: b.roChange,
  consChange: b.consChange,
  extraChange: b.extraChange,
  newMMR: b.updatedMmr,
    newRedOxide: b.updatedCoatingRate,
    newConsumables: b.updatedConsumablesRate,
    newExtra: b.updatedExtraFactor,
    fromDate: b.fromDate,
    toDate: b.toDate,
  })), [apiBatches]);

  useEffect(() => {
    if (apiBatchesAdapted && apiBatchesAdapted.length > 0) {
      const nums = apiBatchesAdapted.map(b => {
        const match = b.id.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      });
      const max = Math.max(...nums, 0);
      setBatchCounter(max + 1);
    }
  }, [apiBatchesAdapted]);

  const batches: Batch[] = useMemo(() => {
    const apiIds = new Set(apiBatchesAdapted.map(b => b.id));
    return [...localBatches.filter(b => !apiIds.has(b.id)), ...apiBatchesAdapted];
  }, [apiBatchesAdapted, localBatches]);

  const allGrades = useMemo(() => {
    return filterOptions?.grades ?? [];
  }, [filterOptions]);

  const vendorOptions = useMemo(() => {
    return Array.from(new Set((filterOptions?.vendors ?? []).map(v => (v.name || '').trim()))).filter(Boolean).sort();
  }, [filterOptions]);

  const customerOptions = useMemo(() => {
    return filterOptions?.customers ?? [];
  }, [filterOptions]);

  const handleGradeChange = (v: string[]) => {
    setGradeFilter(v);
  };

  const handleVendorChange = (v: string) => {
    setVendorFilter(v);
  };

  const handleCustomerChange = (v: string) => {
    setCustomerFilter(v);
  };

  const filteredVendors = useMemo(() =>
    vendorsData.filter(v => {
      if (gradeFilter.length > 0) {
        const normSelected = gradeFilter.map(g => g.trim().toLowerCase());
        const hasMatchingGrade = v.grades.some(vg => {
          const nVg = vg.trim().toLowerCase();
          if (!nVg || nVg === '0') return false;
          return normSelected.some(sg => nVg === sg);
        });
        if (!hasMatchingGrade) return false;
      }
      if (vendorFilter && v.name.trim() !== vendorFilter.trim())          return false;
      if (customerFilter) {
        const hasCustomer = v.castings.some(c => {
          const cName = (c.customerName || '').trim();
          if (cName === 'All' || cName === 'All Customers' || cName === '—' || cName === customerFilter.trim()) return true;
          return c.items.some(i => {
            const iCust = (i.customer || '').trim();
            return iCust === 'All' || iCust === 'All Customers' || iCust === '—' || iCust === customerFilter.trim();
          });
        });
        if (!hasCustomer) return false;
      }
      if (ctypeFilter) {
        const hasMatchingCtype = v.castings.some(c =>
          c.items.some(i => i.customerType === ctypeFilter)
        );
        if (!hasMatchingCtype) return false;
      }
      return true;
    }), [gradeFilter, vendorFilter, customerFilter, ctypeFilter, vendorsData]);

  const allFilteredItems = useMemo(() => {
    const items: { vendor: Vendor; casting: Casting; item: CastingItem; id: string }[] = [];
    const searchLower = textSearch.trim().toLowerCase();
    const normSelectedGrades = gradeFilter.map(g => g.trim().toLowerCase());

    filteredVendors.forEach(vendor => {
      vendor.castings.forEach(casting => {
        if (normSelectedGrades.length > 0) {
          const nCg = (casting.grade || '').trim().toLowerCase();
          if (!nCg || nCg === '0') return;
          const matchesGrade = normSelectedGrades.some(sg => nCg === sg);
          if (!matchesGrade) return;
        }
        casting.items.forEach(item => {
          if (customerFilter) {
            const cName = (casting.customerName || '').trim();
            const iCust = (item.customer || '').trim();
            const isMatch = cName === 'All' || cName === 'All Customers' || cName === '—' || cName === customerFilter.trim() ||
                            iCust === 'All' || iCust === 'All Customers' || iCust === '—' || iCust === customerFilter.trim();
            if (!isMatch) return;
          }
          if (ctypeFilter && item.customerType !== ctypeFilter) return;
          
          if (searchLower) {
            const castingCodeMatch = (item.casting || '').toLowerCase().includes(searchLower);
            const itemCodeMatch = (item._id || '').toLowerCase().includes(searchLower);
            const descMatch = (item.desc || '').toLowerCase().includes(searchLower);
            const vendorMatch = (vendor.name || '').toLowerCase().includes(searchLower);
            const gradeMatch = (casting.grade || '').toLowerCase().includes(searchLower);
            if (!castingCodeMatch && !itemCodeMatch && !descMatch && !vendorMatch && !gradeMatch) {
              return;
            }
          }

          const id = `${vendor.id}|${casting.grade}|${casting.customerName || 'All'}|${item._id}`;
          items.push({ vendor, casting, item, id });
        });
      });
    });
    return items;
  }, [filteredVendors, gradeFilter, customerFilter, ctypeFilter, textSearch]);

  const filteredBatches = useMemo(() =>
    batches.filter(b => {
      // Segregate customer and vendor batches
      if (pricingMode === 'customer' && b.vendorId) return false;
      if (pricingMode === 'vendor' && !b.vendorId) return false;

      if (batchFilter === 'Approval Pending' && b.status !== 'pending') return false;
      if (batchFilter === 'Approved' && b.status !== 'approved')         return false;
      if (batchFilter === 'Rejected' && b.status !== 'rejected')         return false;
      if (batchFilter === 'Draft' && b.status !== 'draft')            return false;

      // Filter by selected Vendor
      if (pricingMode === 'vendor' && vendorFilter && b.vendor.trim() !== vendorFilter.trim() && b.vendorId !== vendorFilter) return false;

      // Filter by selected Customer
      if (customerFilter) {
        const bCust = (b.customer || '').trim();
        if (bCust !== 'All Customers' && bCust !== 'All' && bCust !== customerFilter.trim()) return false;
      }

      // Filter by selected Grade
      if (pricingMode === 'vendor' && gradeFilter.length > 0 && !gradeFilter.includes(b.grade)) return false;

      return true;
    }), [batches, batchFilter, vendorFilter, customerFilter, gradeFilter, pricingMode]);

  const visibleBatches = showAllBatches ? filteredBatches : filteredBatches.slice(0, SHOWN_BY_DEFAULT);

  const isFiltered   = !!(gradeFilter.length > 0 || vendorFilter || customerFilter || ctypeFilter || textSearch.trim());

  const addBatch = useCallback(async (batch: Batch) => {
    // Block duplicate pending/draft batch for same vendor + grade
    const batchBody: any = {
      description: batch.description || 'Batch Revision',
      status: 'pending',
      vendorId: batch.vendorId || null,
      itemMasterIds: (batch.activeItemsData ?? []).map(x => (x.item as any)._id).filter(id => id !== undefined),
      fromDate: batch.fromDate,
      toDate: batch.toDate,
    };
    if (batch.updatedMmr !== undefined) batchBody.updatedMmr = parseFloat(batch.updatedMmr as any);
    if (batch.mmrChange !== undefined) batchBody.mmrChange = parseFloat(batch.mmrChange as any);
    if (batch.updatedCoatingRate !== undefined) batchBody.updatedCoatingRate = parseFloat(batch.updatedCoatingRate as any);
    if (batch.roChange !== undefined) batchBody.roChange = parseFloat(batch.roChange as any);
    if (batch.updatedConsumablesRate !== undefined) batchBody.updatedConsumablesRate = parseFloat(batch.updatedConsumablesRate as any);
    if (batch.consChange !== undefined) batchBody.consChange = parseFloat(batch.consChange as any);
    if (batch.updatedExtraFactor !== undefined) batchBody.updatedExtraFactor = parseFloat(batch.updatedExtraFactor as any);
    if (batch.extraChange !== undefined) batchBody.extraChange = parseFloat(batch.extraChange as any);



    setLocalBatches(prev => [batch, ...prev]);
    setBatchCounter(prev => prev + 1);
    const itemIds: string[] = (batch.activeItemsData ?? [])
      .map(x => x.item._id)
      .filter((id): id is string => id !== undefined);
    if (itemIds.length > 0) {
      try {
        await createBatchMut.mutateAsync({
          description: batch.description, 
          status: batch.status,
          grade: batch.grade || undefined,
          vendorId: batch.vendorId || undefined, itemMasterIds: itemIds,
          updatedMmr: batch.updatedMmr,
          mmrChange: batch.mmrChange,
          updatedCoatingRate: batch.updatedCoatingRate,
          roChange: batch.roChange,
          updatedConsumablesRate: batch.updatedConsumablesRate,
          consChange: batch.consChange,
          updatedExtraFactor: batch.updatedExtraFactor,
          extraChange: batch.extraChange,
          fromDate: batch.fromDate ?? new Date().toISOString().split('T')[0],
          toDate: batch.toDate ?? new Date().toISOString().split('T')[0],
        });
        setLocalBatches(prev => prev.filter(b => b.id !== batch.id));
      } catch (e) { console.warn('Batch API call failed:', e); }
    }
  }, [createBatchMut]);

  const updateBatchStatus = (id: string, status: BatchStatus, extra?: Partial<Batch>) =>
    setLocalBatches(prev => prev.map(b => b.id === id ? { ...b, status, ...extra } : b));

  const handleApprove = useCallback(async (batch: Batch) => {
    updateBatchStatus(batch.id, 'approved');
    setVendorStatusOverrides(prev => ({ ...prev, [batch.vendorId]: 'Rates current' }));

    if (batch._apiId) {
      try {
        await approveMut.mutateAsync(batch._apiId);
      } catch (e: any) {
        console.warn('Approve failed:', e);
        updateBatchStatus(batch.id, 'pending');
        const errMsg = e.response?.data?.message || e.message || 'Check backend server log';
        showToast(`Approve failed: ${errMsg}`);
      }
    }
  }, [approveMut, showToast]);

  const handleRevert = useCallback(async (batch: Batch, selectedItemIds?: number[]) => {
    if (batch._apiId) {
      try {
        const totalItemsCount = typeof batch.items === 'number' ? batch.items : (batch.activeItemsData?.length || 0);
        const isPartial = selectedItemIds && selectedItemIds.length > 0 && (totalItemsCount === 0 || selectedItemIds.length < totalItemsCount);

        await revertMut.mutateAsync({ id: batch._apiId, itemIds: selectedItemIds });
        if (!isPartial) {
          // After reverting whole batch (status → draft), immediately delete the batch
          // so it no longer appears in any tab (including All Batches).
          await silentDeleteMut.mutateAsync(batch._apiId);
          showToast('Batch reverted and removed successfully!');
        } else {
          showToast(`${selectedItemIds!.length} item code(s) reverted from batch!`);
        }
        qc.invalidateQueries({ queryKey: ['pricing-batches'] });
        qc.invalidateQueries({ queryKey: ['vendors-all'] });
        qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
        qc.invalidateQueries({ queryKey: ['items-all'] });
        qc.invalidateQueries({ queryKey: ['customer-items-update'] });
      } catch (e: any) {
        console.warn('Revert failed:', e);
        const errMsg = e.response?.data?.message || e.message || 'Check backend server log';
        showToast(`Revert failed: ${errMsg}`);
      }
    } else {
      updateBatchStatus(batch.id, 'draft');
    }
  }, [revertMut, silentDeleteMut, showToast, qc]);

  const sel = `text-sm rounded-lg border border-gray-300 px-3 py-2 focus:outline-none bg-white w-48 truncate`;

  return (
    <div className="flex flex-col bg-[#F3F4F6]">
      <div className="bg-white border-b border-gray-200 z-10 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">
            {pricingMode === 'customer' ? 'Customer Pricing Update' : 'Vendor Pricing Update'}
          </h1>
          <div className="relative flex items-center bg-gray-200/80 p-1 rounded-full border border-gray-300/60 w-max shadow-inner">
            <button
              onClick={() => setPricingMode('vendor')}
              className={`relative z-10 px-6 py-2 text-sm font-bold rounded-full transition-all duration-200 ${pricingMode === 'vendor' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-600 hover:text-gray-800'}`}>
              Vendor Pricing
            </button>
            <button
              onClick={() => setPricingMode('customer')}
              className={`relative z-10 px-6 py-2 text-sm font-bold rounded-full transition-all duration-200 ${pricingMode === 'customer' ? 'bg-white shadow text-[#dc2626]' : 'text-gray-600 hover:text-gray-800'}`}>
              Customer Pricing
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">

        {pricingMode === 'customer' ? (
          <CustomerPricingSection 
            onEditSelected={(flatSelectedItems: any) => {
              setBatchEditScope({
                level: 'code',
                mode: 'edit_selected',
                flatSelectedItems
              });
            }}
          />
        ) : (
          <>
            {/* FILTERS */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <div className="flex flex-wrap items-end gap-3">
          {/* Grade Multi-Select */}
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-gray-900">
              Grade
            </label>
            <SearchableMultiSelect 
              value={gradeFilter} 
              autoFocus
              onChange={val => handleGradeChange(val)} 
              className={sel}
              options={allGrades}
              placeholder="All grades"
              style={gradeFilter.length > 0 ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {[
            { label: 'Foreign Name', value: customerFilter, set: handleCustomerChange, opts: customerOptions,    ph: 'All Foreign Names' },
            { label: 'Vendor',      value: vendorFilter,   set: handleVendorChange,   opts: vendorOptions,      ph: 'All vendors' },
            { label: 'Customer type', value: ctypeFilter,   set: setCtypeFilter,      opts: ['Domestic', 'Export', 'labour', 'pin bush'], ph: 'All types' },
          ].map(f => (
            <div key={f.label} className="flex flex-col space-y-2">
              <label className="text-sm font-bold text-gray-900">
                {f.label}
              </label>
              <SearchableSelect 
                value={f.value} 
                onChange={val => f.set(val)} 
                className={sel}
                options={f.opts}
                placeholder={f.ph}
                style={f.value ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
              />
            </div>
          ))}

          <div className="flex flex-col space-y-2 w-64">
            <label className="text-sm font-bold text-gray-900">
              Search Code / Desc
            </label>
            <input
              type="text"
              value={textSearch}
              onChange={e => setTextSearch(e.target.value)}
              placeholder="Paste item code, casting code..."
              className="text-sm rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 bg-white w-full h-[38px]"
              style={textSearch ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {(gradeFilter.length > 0 || vendorFilter || ctypeFilter || customerFilter || textSearch.trim()) && (
            <button onClick={() => { setGradeFilter([]); setVendorFilter(''); setCustomerFilter(''); setCtypeFilter(''); setTextSearch(''); }}
              style={{ color: BRAND.RED, borderColor: BRAND.RED, height: '38px' }}
              className="self-end flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border hover:opacity-80 bg-white cursor-pointer">
              <span className="text-base leading-none">×</span> Clear all
            </button>
          )}
        </div>
      </div>

      {!isFiltered ? (
        <div className="border border-gray-200 rounded-xl bg-white p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
            <span className="text-2xl" style={{ color: BRAND.RED }}>🔍</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Customer and either Grade or Vendor to view data</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Please select Customer and at least one other filter (Grade or Vendor) above to begin updating pricing.
          </p>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          <OverviewBar items={allFilteredItems} vendors={filteredVendors} batches={batches} />

          {/* ITEMS TABLE */}
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <input type="checkbox" className="rounded w-4 h-4 text-[#2563eb] focus:ring-[#2563eb] border-gray-300 cursor-pointer"
                  checked={allFilteredItems.length > 0 && selectedItemIds.size === allFilteredItems.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedItemIds(new Set(allFilteredItems.map(x => x.id)));
                    } else {
                      setSelectedItemIds(new Set());
                    }
                  }}
                />
                <span className="font-semibold text-gray-800 text-sm">Items List</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedItemIds.size > 0 && <span className="text-xs text-gray-500">{selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected</span>}
                <button
                  onClick={() => {
                    const selectedData = allFilteredItems.filter(x => selectedItemIds.has(x.id));
                    setBatchEditScope({
                      level: 'code',
                      mode: 'edit_selected',
                      flatSelectedItems: selectedData
                    });
                  }}
                  disabled={selectedItemIds.size === 0}
                  style={{ background: selectedItemIds.size > 0 ? BRAND.RED : '#e5e7eb', color: selectedItemIds.size > 0 ? '#fff' : '#9ca3af' }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors">
                  Edit selected
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 w-10 text-center"></th>
                    {['Vendor', 'Foreign Name', 'Type of Machine', 'Coating', 'Cavity', 'Core or Sleeve', 'Grade', 'Casting Code', 'Description', 'RM Weight', 'Rate/kg', 'Current RM Price', 'From', 'To'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allFilteredItems.map(({ vendor, casting, item, id }) => (
                    <tr key={id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" className="rounded w-4 h-4 text-[#2563eb] border-gray-300"
                          checked={selectedItemIds.has(id)}
                          onChange={(e) => {
                            setSelectedItemIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900">{vendor.name}</td>
                      <td className="px-3 py-3 text-gray-600">{item.customer || '—'}</td>
                      <td className="px-3 py-3 text-gray-600">{casting.machineType || '—'}</td>
                      <td className="px-3 py-3 text-gray-600">{casting.coatingText || '—'}</td>
                      <td className="px-3 py-3 text-gray-600">{casting.cavity || '—'}</td>
                      <td className="px-3 py-3 text-gray-600">{casting.coreSleeve || '—'}</td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded border border-green-200">
                          {casting.grade && casting.grade !== '0' ? casting.grade : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-gray-800">{item.casting}</td>
                      <td className="px-3 py-3 text-gray-600 max-w-[200px] truncate" title={item.desc}>{item.desc || '—'}</td>
                      <td className="px-3 py-3 text-gray-700">{numSafe(item.wt).toFixed(2)}</td>
                      <td className="px-3 py-3 text-gray-700">₹{numSafe(item.oldRate).toFixed(2)}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900 group relative cursor-help">
                        <span className="border-b border-dashed border-gray-400">₹{(numSafe(item.wt) * numSafe(item.oldRate)).toFixed(2)}</span>
                        <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-max bg-gray-900 text-white text-xs rounded p-2 z-50 shadow-xl pointer-events-none">
                          <div className="font-bold mb-1 border-b border-gray-700 pb-1">Formula</div>
                          <div className="grid grid-cols-[90px_1fr] gap-x-2 leading-relaxed">
                            <span className="text-gray-400">Casting Price:</span> <span>({numSafe(item.wt).toFixed(2)} × ₹{numSafe(item.oldRate).toFixed(2)}) = ₹{(numSafe(item.wt) * numSafe(item.oldRate)).toFixed(2)}</span>
                            <span className="text-gray-400">Machining:</span> <span>₹{numSafe(item.machining).toFixed(2)}</span>
                            <span className="text-gray-400">Coating:</span> <span>₹{numSafe(item.coating).toFixed(2)}</span>
                          </div>
                          <div className="mt-1 pt-1 border-t border-gray-700 font-bold flex justify-between">
                            <span>Total:</span> <span>₹{((numSafe(item.wt) * numSafe(item.oldRate)) + numSafe(item.machining) + numSafe(item.coating)).toFixed(2)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{casting.fromDate}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{casting.toDate}</td>
                    </tr>
                  ))}
                  {allFilteredItems.length === 0 && (
                    <tr>
                      <td colSpan={15} className="px-4 py-8 text-center text-gray-500 text-sm">
                        {(vendorsLoading || vendorsFetching || itemsLoading || itemsFetching || filterOptionsFetching) ? (
                          <div className="flex justify-center items-center gap-2 py-4">
                            <Loader size="sm" />
                            <span className="text-gray-500 font-medium">Loading items...</span>
                          </div>
                        ) : (
                          "No items found matching the current filters."
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 italic">Customer side reflects RM cost only. Internal costs borne by Geekeyy.</p>
            </div>
          </div>
        </>
      )}
      </>
    )}

      {/* REVISION BATCHES */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: '#FFFFFF', overflow: 'hidden' }}>
            {/* Header with tab buttons — matches .batches-head */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap', gap: 8 }} className="shrink-0">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7A7A7A' }}>Revision Batches</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(['All Batches','Approval Pending','Approved','Rejected','Draft'] as BatchFilter[]).map(f => {
                    const active = batchFilter === f;
                    let activeSt: React.CSSProperties = {};
                    if (active && f === 'Approval Pending') activeSt = { background: '#FDE8E8', color: '#8B2020', borderColor: '#E8C0C0' };
                    else if (active && f === 'Approved')    activeSt = { background: '#E8F4ED', color: '#1A5C32', borderColor: '#A8D4B8' };
                    else if (active && f === 'All Batches') activeSt = { background: '#E8EEF8', color: '#1A3A6C', borderColor: '#B8CCE8' };
                    else if (active)                        activeSt = { background: '#F3F4F6', color: '#4A4A4A', borderColor: '#D1D5DB' };
                    return (
                      <button key={f} onClick={() => setBatchFilter(f)}
                        className="hover:bg-gray-50"
                        style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, cursor: 'pointer', border: '1.5px solid', borderColor: active ? (activeSt.borderColor as string) : 'transparent', color: active ? (activeSt.color as string) : '#6B7280', background: active ? (activeSt.background as string) : 'transparent', fontWeight: active ? 700 : 500, transition: 'all .1s' }}>
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

              {filteredBatches.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  No batches yet. Click <span className="font-medium text-gray-600">Edit</span> on a vendor to create a revision batch.
                </div>
              ) : (
                <>
                  {visibleBatches.map(batch => (
                    <BatchRow
                      key={batch.id}
                      batch={batch}
                      vendorsData={vendorsData}
                      filterChange={filterChange}
                      expanded={expandedBatch === batch.id}
                      onToggle={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                      onApprove={() => handleApprove(batch)}
                      onRevert={(itemIds?: number[]) => handleRevert(batch, itemIds)}
                      isCustomer={pricingMode === 'customer'}
                      onDelete={async () => {
                        if (batch._apiId) {
                          try { await deleteMut.mutateAsync(batch._apiId); }
                          catch (e) { console.warn('Delete failed:', e); }
                        } else { setLocalBatches(prev => prev.filter(b => b.id !== batch.id)); }
                      }}
                      onReject={async (reason) => {
                        if (batch._apiId) {
                          try { await rejectMut.mutateAsync({ id: batch._apiId, reason }); }
                          catch (e) { console.warn('Reject failed:', e); }
                        } else { updateBatchStatus(batch.id, 'rejected', { rejectReason: reason }); }
                      }}
                      onSubmit={async () => {
                        if (batch._apiId) {
                          try { await submitMut.mutateAsync(batch._apiId); }
                          catch (e) { console.warn('Submit failed:', e); }
                        } else { updateBatchStatus(batch.id, 'pending'); }
                      }}
                    />
                  ))}
                {filteredBatches.length > SHOWN_BY_DEFAULT && (
                  <div className="px-4 py-3 border-t border-gray-100 text-center">
                    <button onClick={() => setShowAllBatches(p => !p)}
                      style={{ color: BRAND.RED }}
                      className="text-sm font-medium hover:underline">
                      {showAllBatches
                        ? 'â† Show less'
                        : `View all ${filteredBatches.length} revision batches →`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

      {/* RATE REVISION DRAWER */}
      {revisionVendor && (
        <RevisionDrawer
          vendor={revisionVendor.vendor}
          initialGrade={revisionVendor.grade}
          batchNumber={batchCounter}
          batches={batches}
          customerFilter={customerFilter}
          onClose={() => setRevisionVendor(null)}
          onSaveDraft={addBatch}
          onCreateBatch={addBatch}
        />
      )}
      
      {batchEditScope && (
        <BatchEditDrawer
          scope={batchEditScope}
          vendorsData={vendorsData}
          batchNumber={batchCounter}
          customerFilter={customerFilter}
          onClose={() => setBatchEditScope(null)}
          onSaveDraft={addBatch}
          onCreateBatch={addBatch}
          isCustomer={pricingMode === 'customer'}
        />
      )}

      {warningMessage && (
        <DuplicateBatchWarning
          message={warningMessage}
          onClose={() => setWarningMessage(null)}
        />
      )}

      {toastMessage && (
        <div style={{ backgroundColor: '#10b981', color: '#ffffff' }} className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl transition-all duration-300 animate-fade-in-up font-semibold text-sm">
          <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
    </div>
  );
};

export default PricingUpdatePage;
