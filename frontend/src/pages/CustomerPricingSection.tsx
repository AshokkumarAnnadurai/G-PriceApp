import { useQuery } from '@tanstack/react-query';
import React,{ useEffect,useMemo,useRef,useState } from 'react';
import { customerApi } from '../api/customerApi';
import { itemApi } from '../api/itemApi';
import { vendorApi } from '../api/vendorApi';
import { Loader } from '../components/ui';
import { BRAND } from '../constants';
import { getCustomerPricingColumns } from '../constants/itemColumns';
import { Customer } from '../types';

// Local Searchable Select Component matching the styling of PricingUpdatePage.tsx
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

// Local Searchable Multi-Select Component matching the styling of PricingUpdatePage.tsx
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
                className="text-[#d92d20] hover:underline cursor-pointer bg-transparent border-none p-0"
                onClick={(e) => { e.stopPropagation(); onChange([...options]); }}
              >
                Select All
              </button>
              <span>|</span>
              <button 
                type="button"
                className="text-gray-500 hover:underline cursor-pointer bg-transparent border-none p-0"
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

interface CustomerPricingSectionProps {
  onEditSelected: (flatSelectedItems: any[]) => void;
}

export const CustomerPricingSection: React.FC<CustomerPricingSectionProps> = ({ onEditSelected }) => {
  // Filter States
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [localNameFilter, setLocalNameFilter] = useState('');
  const [customerCodeFilter, setCustomerCodeFilter] = useState('');
  const [foundryFilter, setFoundryFilter] = useState('');
  const [textSearch, setTextSearch] = useState('');

  // Selection States
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Fetch all customers directly from Customer Master API for consistent filter naming/codes
  const { data: allCustomersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customerApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });
  const allCustomers: Customer[] = (allCustomersData?.items || allCustomersData || []) as Customer[];

  // Fetch filter options (which now contains customerApprovalFoundries from argit tables)
  const { data: filterOptions } = useQuery({
    queryKey: ['item-filter-options-all'],
    queryFn: () => itemApi.getFilterOptions(),
    staleTime: 5 * 60 * 1000,
  });

  // Resolve selected Customer
  const selectedCustomer = useMemo(() => {
    if (customerCodeFilter) {
      return allCustomers.find(c => c.bpCode === customerCodeFilter);
    }
    if (localNameFilter) {
      return allCustomers.find(c => c.name === localNameFilter || c.localName === localNameFilter);
    }
    return null;
  }, [customerCodeFilter, localNameFilter, allCustomers]);

  const [userSelectedCategory, setUserSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    setUserSelectedCategory(null);
  }, [selectedCustomer?.bpCode]);

  // Determine category dynamically (Export, Domestic, Labour, or Pin & Bush)
  const resolvedCategory = useMemo(() => {
    if (userSelectedCategory) return userSelectedCategory;
    if (!selectedCustomer) return 'Domestic';
    const group = (selectedCustomer.groupName || '').trim();
    const validGroups = ['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'];
    return validGroups.includes(group) ? group : 'Domestic';
  }, [selectedCustomer, userSelectedCategory]);

  // Query actual customer items from its database table (pld1, ple1, plp1, pll1)
  const { data: customerItemsData, isLoading: itemsLoading, isFetching: itemsFetching } = useQuery({
    queryKey: ['customer-items-update', selectedCustomer?.bpCode, resolvedCategory],
    queryFn: () => customerApi.getItems(selectedCustomer!.bpCode, resolvedCategory),
    enabled: !!selectedCustomer?.bpCode,
    staleTime: 1 * 60 * 1000,
  });
  const customerItems = customerItemsData?.items ?? [];

  // Fetch all vendors to look up names
  const { data: vendorsList } = useQuery({
    queryKey: ['vendors-list-names'],
    queryFn: () => vendorApi.getAll(1, 1000),
  });
  const vendorMap = useMemo(() => {
    const items = vendorsList?.items ?? [];
    return new Map<string, string>(items.map((v: any) => [v.bpCode, String(v.name)]));
  }, [vendorsList]);
  
  const getVendorName = (code: string): string => {
    return vendorMap.get(code) || code || '—';
  };

  // Extract filter options dynamically
  const gradeOptions = useMemo<string[]>(() => {
    if (selectedCustomer) {
      const grades = customerItems
        .map((item: any) => String(item.grade || '').trim())
        .filter(Boolean);
      return Array.from(new Set(grades)).sort() as string[];
    }
    return (filterOptions?.grades as string[]) ?? [];
  }, [filterOptions, selectedCustomer, customerItems]);

  // Sync dual customer filters symmetrically
  const handleLocalNameChange = (val: string) => {
    setLocalNameFilter(val);
    setGradeFilter([]);
    if (!val) {
      setCustomerCodeFilter('');
    } else {
      const cust = allCustomers.find(c => (c.localName || c.name || '').trim() === val);
      if (cust) setCustomerCodeFilter(cust.bpCode);
    }
  };

  const handleCustomerCodeChange = (val: string) => {
    setCustomerCodeFilter(val);
    setGradeFilter([]);
    if (!val) {
      setLocalNameFilter('');
    } else {
      const cust = allCustomers.find(c => c.bpCode === val);
      if (cust) setLocalNameFilter(cust.localName || cust.name);
    }
  };

  // Local Names Option list (uses localName / cardName fallback matching Customer List)
  const localNameOptions = useMemo(() => {
    let list = allCustomers;
    if (foundryFilter && filterOptions?.customerFoundryMappings) {
      const activeCodes = new Set(
        filterOptions.customerFoundryMappings
          .filter((m: any) => m.foundry === foundryFilter)
          .map((m: any) => m.customerCode)
      );
      list = list.filter(c => activeCodes.has(c.bpCode));
    }
    if (customerCodeFilter) {
      list = list.filter(c => c.bpCode === customerCodeFilter);
    }
    return Array.from(new Set(list.map(c => (c.localName || c.name || '').trim()))).filter(Boolean).sort();
  }, [allCustomers, foundryFilter, customerCodeFilter, filterOptions]);

  // Customer Code Option list (uses cardCode matching Customer List)
  const customerCodeOptions = useMemo(() => {
    let list = allCustomers;
    if (foundryFilter && filterOptions?.customerFoundryMappings) {
      const activeCodes = new Set(
        filterOptions.customerFoundryMappings
          .filter((m: any) => m.foundry === foundryFilter)
          .map((m: any) => m.customerCode)
      );
      list = list.filter(c => activeCodes.has(c.bpCode));
    }
    if (localNameFilter) {
      list = list.filter(c => (c.localName || c.name || '').trim() === localNameFilter);
    }
    return Array.from(new Set(list.map(c => (c.bpCode || '').trim()))).filter(Boolean).sort();
  }, [allCustomers, foundryFilter, localNameFilter, filterOptions]);

  // Foundry options
  const foundryOptions = useMemo(() => {
    if (selectedCustomer && filterOptions?.customerFoundryMappings) {
      return Array.from(new Set(
        filterOptions.customerFoundryMappings
          .filter((m: any) => m.customerCode === selectedCustomer.bpCode)
          .map((m: any) => m.foundry)
      )).filter(Boolean).sort();
    }
    return filterOptions?.customerApprovalFoundries ?? [];
  }, [filterOptions, selectedCustomer]);

  // Filter items based on remaining filters
  const filteredCustomerItems = useMemo(() => {
    return customerItems.filter((item: any) => {
      if (gradeFilter.length > 0 && (!item.grade || !gradeFilter.map(g => g.trim().toLowerCase()).includes(item.grade.trim().toLowerCase()))) return false;
      if (foundryFilter && item.customerApprovalFoundry !== foundryFilter) return false;
      
      if (textSearch.trim()) {
        const q = textSearch.toLowerCase();
        const match = [
          item.castingCode, item.itemCode, item.description,
          item.customerName, item.foreignName, item.grade
        ].join(' ').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [customerItems, gradeFilter, foundryFilter, textSearch]);

  const columns = useMemo(() => {
    return getCustomerPricingColumns();
  }, []);

  // Clear selections when filter changes
  useEffect(() => {
    setSelectedItemIds(new Set());
  }, [gradeFilter, localNameFilter, customerCodeFilter, foundryFilter, textSearch]);

  const clearAllFilters = () => {
    setGradeFilter([]);
    setLocalNameFilter('');
    setCustomerCodeFilter('');
    setFoundryFilter('');
    setTextSearch('');
    setSelectedItemIds(new Set());
  };

  const isCustomerSelected = !!selectedCustomer;

  const handleEditSelected = () => {
    const selectedData = filteredCustomerItems.filter((i: any) => selectedItemIds.has(i.itemCode || i.id));
    const adapted = selectedData.map((item: any) => {
      // Synthesize vendor
      const vendor = {
        id: item.vendorId || '',
        bpCode: item.vendorId || '',
        name: item.vendorName || getVendorName(item.vendorId) || 'Unknown',
        grades: [item.grade || ''],
        castingCodes: 1,
        currentMMR: item.mmrRate || 0,
        latestMMR: item.mmrRate || 0,
        consumables: item.consumablesRate || 0,
        coatingRate: item.roRate || 0,
        lastUpdated: '',
        castings: []
      };

      // Synthesize casting
      const casting = {
        grade: item.grade || 'Unknown',
        customerName: item.customerName || item.foreignName || 'All',
        castingCode: item.castingCode || 'All',
        rmWeight: item.weight || 0,
        revisedRatePerKg: item.ratePerKg || 0,
        mmr: item.mmrRate || 0,
        coating: item.roRate || 0,
        consumables: item.consumablesRate || 0,
        extra: item.extraFactor || 0,
        codes: 1,
        items: [],
        fromDate: item.fromDate || '',
        toDate: item.toDate || '',
        customerApprovalFoundry: item.customerApprovalFoundry || '—'
      };

      // Synthesize item
      const castingItem = {
        casting: item.castingCode || item.itemCode,
        desc: item.description || '',
        wt: item.weight || 0,
        customer: item.customerName || item.foreignName || '—',
        oldRate: item.ratePerKg || 0,
        oldPrice: item.currentPrice || item.finalPrice || 0,
        machining: item.machining || 0,
        coating: item.roRate || 0,
        baseRate: item.mmrRate || 0,
        _id: `${item.customerCode || selectedCustomer?.bpCode || ''}|${item.castingCode || ''}|${item.id || item.itemCode || ''}`
      };

      return {
        vendor,
        casting,
        item: castingItem,
        id: item.id || item.itemCode
      };
    });

    onEditSelected(adapted);
  };

  const selClass = "text-sm rounded-lg border border-gray-300 px-3 py-2 focus:outline-none bg-white w-48 truncate h-[38px]";

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {/* Grade Filter */}
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-gray-900">Grade</label>
            <SearchableMultiSelect
              value={gradeFilter}
              onChange={setGradeFilter}
              className={selClass}
              options={gradeOptions}
              placeholder="All grades"
              style={gradeFilter.length > 0 ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {/* Customer Name Filter */}
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-gray-900">Customer Name</label>
            <SearchableSelect
              value={localNameFilter}
              onChange={handleLocalNameChange}
              className={selClass}
              options={localNameOptions}
              placeholder="All Customer Names"
              style={localNameFilter ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {/* Customer Code Filter */}
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-gray-900">Customer Code</label>
            <SearchableSelect
              value={customerCodeFilter}
              onChange={handleCustomerCodeChange}
              className={selClass}
              options={customerCodeOptions}
              placeholder="All Customer Codes"
              style={customerCodeFilter ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {/* Customer Approval Foundry Filter */}
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-bold text-gray-900">Customer Approval Foundry</label>
            <SearchableSelect
              value={foundryFilter}
              onChange={setFoundryFilter}
              className={selClass}
              options={foundryOptions}
              placeholder="All Foundries"
              style={foundryFilter ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {/* Search Bar */}
          <div className="flex flex-col space-y-2 w-64">
            <label className="text-sm font-bold text-gray-900">Search Code / Desc</label>
            <input
              type="text"
              value={textSearch}
              onChange={e => setTextSearch(e.target.value)}
              placeholder="Paste item code, casting code..."
              className="text-sm rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 bg-white w-full h-[38px]"
              style={textSearch ? { borderColor: BRAND.RED, boxShadow: `0 0 0 2px ${BRAND.RED}25` } : {}}
            />
          </div>

          {/* Clear Filters Button */}
          {isCustomerSelected && (
            <button
              onClick={clearAllFilters}
              style={{ color: BRAND.RED, borderColor: BRAND.RED, height: '38px' }}
              className="self-end flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border hover:opacity-80 bg-white"
            >
              <span className="text-base leading-none">×</span> Clear all
            </button>
          )}
        </div>
      </div>

      {(itemsLoading || itemsFetching || customersLoading) && (
        <div className="flex justify-center py-6">
          <Loader size="md" />
        </div>
      )}

      {/* Main Display Area */}
      {!isCustomerSelected ? (
        <div className="border border-gray-200 rounded-xl bg-white p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
            <span className="text-2xl" style={{ color: BRAND.RED }}>🔍</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Customer to view Customer Pricing data</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Please select Customer Code, Customer Name, or Foreign Name above to load customer pricing records.
          </p>
        </div>
      ) : (
        <div className="shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border border-gray-200 border-b-0 rounded-t-xl bg-gray-50">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox" 
                className="rounded w-4 h-4 text-[#2563eb] border-gray-300 cursor-pointer"
                checked={filteredCustomerItems.length > 0 && selectedItemIds.size === filteredCustomerItems.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedItemIds(new Set(filteredCustomerItems.map((i: any) => i.itemCode || i.id)));
                  } else {
                    setSelectedItemIds(new Set());
                  }
                }}
              />
              <span className="font-semibold text-gray-800 text-sm">Customer Items List</span>
              <select
                value={resolvedCategory}
                onChange={(e) => setUserSelectedCategory(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-0.5 outline-none bg-white text-gray-700 font-medium cursor-pointer hover:border-gray-400"
              >
                <option value="Domestic">Domestic</option>
                <option value="Export">Export</option>
                <option value="Pin & Bush">Pin & Bush</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              {selectedItemIds.size > 0 && (
                <span className="text-xs text-gray-500 font-medium">{selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected</span>
              )}
              <button
                onClick={handleEditSelected}
                disabled={selectedItemIds.size === 0}
                style={{ 
                  background: selectedItemIds.size > 0 ? BRAND.RED : '#e5e7eb', 
                  color: selectedItemIds.size > 0 ? '#fff' : '#9ca3af' 
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Edit selected
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-gray-200 rounded-b-xl bg-white">
            <table className="w-full text-sm text-left min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">
                    {/* Master checkbox moved to heading */}
                  </th>
                  {columns.map(col => (
                    <th key={col.key || col.header} className="px-3 py-3 whitespace-nowrap">{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {filteredCustomerItems.map((item: any) => {
                  const itemId = item.itemCode || item.id;
                  const isSelected = selectedItemIds.has(itemId);
                  return (
                    <tr key={itemId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded w-4 h-4 text-[#2563eb] border-gray-300 cursor-pointer"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedItemIds);
                            if (e.target.checked) next.add(itemId);
                            else next.delete(itemId);
                            setSelectedItemIds(next);
                          }}
                        />
                      </td>
                      {columns.map(col => (
                        <td key={col.key || col.header} className="px-3 py-3 text-gray-700">
                          {col.render ? col.render(item) : (item[col.key] || '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {filteredCustomerItems.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-400 italic">
                      No items found matching the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
