import { useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useEffect,useMemo,useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { customerApi } from '../api/customerApi';
import { itemApi } from '../api/itemApi';
import { vendorApi } from '../api/vendorApi';
import { CustomerItemsPanel } from '../components/customer/CustomerItemsPanel';
import { Button,Card,Modal,Pagination,SearchableSelect } from '../components/ui';
import { BRAND,PAGE_SIZE } from '../constants';
import { PAGE_TITLES } from '../constants/pageHeaders';
import { Customer } from '../types';
import { exportItemsToExcel } from '../utils/exportUtils';

const COLS = [
  ['', '32px', 'center'],
  ['FOREIGN NAME', 'auto', 'left'],
  ['CUSTOMER NAME', 'auto', 'left'],
  ['CUSTOMER NAME CODE', '150px', 'left'],
  ['GROUP CODE', '150px', 'left'],
  ['GROUP NAME', '200px', 'left'],
  ['ACTIONS', '240px', 'center'],
] as const;

const th: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#000000',
  backgroundColor: 'white',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = { padding: '12px 16px', fontSize: '0.875rem' };

const CustomerListPage: React.FC = () => {
  const { data: vendors } = useQuery({ queryKey: ['all-vendors'], queryFn: () => vendorApi.getAll(undefined, 1000).then(r => r.data?.items || []) });
  const vendorMap = useMemo(() => new Map<string, string>((vendors || []).map((v: any) => [v.bpCode, String(v.name)])), [vendors]);
  const getVendorName = (code: string | null | undefined): string => {
    if (!code) return '';
    return vendorMap.get(code) || code;
  };

  const [search, setSearch] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchGroup, setSearchGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [addMappingCustomerId, setAddMappingCustomerId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedCustomerId(prev => prev === id ? null : id);
  };

  // Query to get ALL customers (without pagination) for filter dropdown options
  const { data: allCustomers = [] as Customer[], error: allCustomersError, isError: isAllCustomersError } = useQuery<Customer[]>({
    queryKey: ['customers-all'],
    queryFn: () => customerApi.getAll(),
  });

  // Query to get paginated and filtered customers for the table
  const { data: paginatedData, isLoading, error: paginatedError, isError: isPaginatedError } = useQuery<{ items: Customer[]; total: number }>({
    queryKey: ['customers-paginated', page, pageSize, search, searchName, searchCode, searchGroup],
    queryFn: () => customerApi.getAll(page, pageSize, search, searchName, searchCode, searchGroup),
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const queryClient = useQueryClient();
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [importModalCustomer, setImportModalCustomer] = useState<Customer | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const getActiveTabForCustomer = (c: Customer) => {
    return activeTabs[c.bpCode] || (['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'].includes(c.groupName || '') ? (c.groupName || 'Domestic') : 'Domestic');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleExportRow = async (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeTab = getActiveTabForCustomer(c);
    showToast(`Fetching items to export for ${activeTab}...`, 'success');
    try {
      // Pass activeTab so backend queries the correct pricing table
      const res = await customerApi.getItems(c.bpCode, activeTab);
      const items = res.items || [];
      await exportItemsToExcel(items, activeTab, getVendorName, `Customer_${c.bpCode}`);
    } catch(err) {
      showToast('Export failed', 'error');
    }
  };

  const handleImportRow = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setImportModalCustomer(c);
  };

  const handleParseExcel = async () => {
    if (!importFile || !importModalCustomer) return;
    try {
      const bstr = await importFile.arrayBuffer();
      const wb = XLSX.read(bstr, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { raw: false });
      if (data.length === 0) {
        showToast('No rows found in Excel.', 'error');
        return;
      }

      // Check if Excel customer code matches the selected customer code context
      const firstRow: any = data[0];
      const excelCustomerCode = String(firstRow?.['Customer Code'] || firstRow?.['customerCode'] || '').trim();
      const expectedCode = String(importModalCustomer.bpCode || '').trim();

      if (excelCustomerCode && excelCustomerCode !== expectedCode) {
        showToast(`Import rejected: Excel file is for Customer Code '${excelCustomerCode}', but you are importing into '${expectedCode}'.`, 'error');
        setImportFile(null);
        return;
      }

      // Timezone-safe date parsing function
      const parseDateCellValue = (val: any): string => {
        if (val === undefined || val === null || val === '') return '';
        if (typeof val === 'number') {
          // Convert Excel serial number to YYYY-MM-DD timezone-safely
          const date = new Date((val - 25569) * 86400 * 1000);
          const y = date.getUTCFullYear();
          const m = String(date.getUTCMonth() + 1).padStart(2, '0');
          const d = String(date.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        const str = String(val).trim();
        const dmYMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (dmYMatch) {
          const d = dmYMatch[1].padStart(2, '0');
          const m = dmYMatch[2].padStart(2, '0');
          const y = dmYMatch[3];
          return `${y}-${m}-${d}`;
        }
        const YmdMatch = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
        if (YmdMatch) {
          return `${YmdMatch[1]}-${YmdMatch[2]}-${YmdMatch[3]}`;
        }
        if (val instanceof Date) {
          const y = val.getUTCFullYear();
          const m = String(val.getUTCMonth() + 1).padStart(2, '0');
          const d = String(val.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        return str;
      };

      // Sanitize dates and round numeric fields to 2 decimal places to prevent floating point noise and extra decimals
      const sanitizedData = data.map((row: any) => {
        const newRow: any = {};
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (['From Date', 'To Date'].includes(key)) {
            newRow[key] = parseDateCellValue(val);
          } else if (typeof val === 'number') {
            newRow[key] = Number(val.toFixed(2));
          } else {
            newRow[key] = val;
          }
        }
        return newRow;
      });

      setImportPreviewRows(sanitizedData);
      setIsImportPreviewOpen(true);
      // Keep importModalCustomer so we have the correct customer and activeTab context during confirmImport
      setImportErrors([]);
    } catch (err) {
      console.error(err);
      showToast('Failed to parse file.', 'error');
    }
  };

  const confirmImport = async () => {
    setIsImporting(true);
    const activeTab = getActiveTabForCustomer(importModalCustomer || { bpCode: '', name: '' } as any);
    try {
      const res = await itemApi.importPricing(importPreviewRows, activeTab === 'Domestic', activeTab, 'CustomerList');
      if (res.success) {
        showToast('Import successful!', 'success');
        queryClient.invalidateQueries({ queryKey: ['customers-paginated'] });
        queryClient.invalidateQueries({ queryKey: ['customer-items'] });
        setIsImportPreviewOpen(false);
        setImportPreviewRows([]);
        setImportFile(null);
        setImportModalCustomer(null);
      } else {
        setImportErrors(res.errors || []);
        showToast('Import completed with errors. See details below.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to import file.', 'error');
    }
    setIsImporting(false);
  };

  useEffect(() => {
    if (isAllCustomersError && allCustomersError) {
      setToast({ message: (allCustomersError as any).message || 'Failed to load customers.', type: 'error' });
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [isAllCustomersError, allCustomersError]);

  useEffect(() => {
    if (isPaginatedError && paginatedError) {
      setToast({ message: (paginatedError as any).message || 'Failed to load customer list.', type: 'error' });
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [isPaginatedError, paginatedError]);

  const pageRows = paginatedData?.items ?? [];
  const totalRecords = paginatedData?.total ?? 0;
  
  const uniqueNames = useMemo(() => {
    const subset = allCustomers.filter(c => {
      const q = search.trim().toLowerCase();
      const matchSearch = q ? (
        c.name.toLowerCase().includes(q) ||
        c.bpCode.toLowerCase().includes(q) ||
        (c.groupCode || '').toLowerCase().includes(q)
      ) : true;
      const matchCode = searchCode ? c.bpCode === searchCode : true;
      const matchGroup = searchGroup ? (c.groupName || '') === searchGroup : true;
      return matchSearch && matchCode && matchGroup;
    });
    return Array.from(new Set(subset.map(c => c.name))).sort();
  }, [allCustomers, search, searchCode, searchGroup]);

  const uniqueCodes = useMemo(() => {
    const subset = allCustomers.filter(c => {
      const q = search.trim().toLowerCase();
      const matchSearch = q ? (
        c.name.toLowerCase().includes(q) ||
        c.bpCode.toLowerCase().includes(q) ||
        (c.groupCode || '').toLowerCase().includes(q)
      ) : true;
      const matchName = searchName ? c.name === searchName : true;
      const matchGroup = searchGroup ? (c.groupName || '') === searchGroup : true;
      return matchSearch && matchName && matchGroup;
    });
    return Array.from(new Set(subset.map(c => c.bpCode))).sort();
  }, [allCustomers, search, searchName, searchGroup]);

  const uniqueGroups = useMemo(() => {
    const subset = allCustomers.filter(c => {
      const q = search.trim().toLowerCase();
      const matchSearch = q ? (
        c.name.toLowerCase().includes(q) ||
        c.bpCode.toLowerCase().includes(q) ||
        (c.groupCode || '').toLowerCase().includes(q)
      ) : true;
      const matchName = searchName ? c.name === searchName : true;
      const matchCode = searchCode ? c.bpCode === searchCode : true;
      return matchSearch && matchName && matchCode;
    });
    return Array.from(new Set(subset.map(c => c.groupName || ''))).filter(Boolean).sort();
  }, [allCustomers, search, searchName, searchCode]);

  const isFiltered = !!(search || searchName || searchCode || searchGroup);
  const clearFilters = () => { setSearch(''); setSearchName(''); setSearchCode(''); setSearchGroup(''); setPage(1); };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
      <div className="bg-white border-b border-gray-200 z-30 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">{PAGE_TITLES.CUSTOMER_LIST}</h1>
            <span className="text-sm text-gray-500 font-medium">({totalRecords} customer{totalRecords !== 1 ? 's' : ''})</span>
          </div>
          <div className="flex gap-3 flex-wrap items-center justify-end">
            <div className="relative">
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                placeholder="Search Foreign Name, Code, Item No..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-[38px] pl-9 pr-8 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-white"
                style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED, width: '270px' } as React.CSSProperties}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-lg">×</button>
              )}
            </div>

            <SearchableSelect
              value={searchName}
              onChange={val => { setSearchName(val); setPage(1); }}
              className="w-56"
              options={uniqueNames}
              placeholder="Select Foreign Name"
              align="right"
            />

            <SearchableSelect
              value={searchCode}
              onChange={val => { setSearchCode(val); setPage(1); }}
              className="w-40"
              options={uniqueCodes}
              placeholder="Select Code"
              align="right"
            />

            <SearchableSelect
              value={searchGroup}
              onChange={val => { setSearchGroup(val); setPage(1); }}
              className="w-40"
              options={uniqueGroups}
              placeholder="Select Group Name"
              align="right"
            />

            {isFiltered && (
              <button
                onClick={clearFilters}
                className="h-[38px] px-3.5 text-sm font-medium rounded-lg border transition-colors"
                style={{ color: BRAND.RED, borderColor: BRAND.RED, backgroundColor: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = BRAND.RED_LIGHT)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                × Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 min-h-0 flex flex-col bg-[#F3F4F6]">
        {/* Table */}
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 pb-4">
              <table className="w-full text-sm border-collapse min-w-[1100px]">
                <thead className="sticky top-0 bg-white z-20 shadow-sm">
                  <tr style={{ borderBottom: `1px solid ${BRAND.BORDER}` }}>
                    {COLS.map(([label, width, align]) => (
                      <th key={label} style={{ ...th, width, textAlign: align }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} style={{ ...td, padding: '64px 16px', textAlign: 'center', color: BRAND.GRAY_TEXT }}>
                        Loading…
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ ...td, padding: '64px 16px', textAlign: 'center', color: BRAND.GRAY_TEXT }}>
                        No records found.
                      </td>
                    </tr>
                  ) : pageRows.map(c => {
                    const isExpanded = expandedCustomerId === c.bpCode;
                    return (
                      <React.Fragment key={c.bpCode}>
                        <tr
                          onClick={() => toggleExpand(c.bpCode)}
                          style={{
                            borderBottom: isExpanded ? 'none' : `1px solid ${BRAND.BORDER}`,
                            cursor: 'pointer',
                            background: isExpanded ? '#fef2f2' : 'white',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f9fafb'; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                        >
                          <td style={{ ...td, width: '32px', paddingRight: '4px', paddingLeft: '16px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '20px', height: '20px', borderRadius: '4px',
                              background: isExpanded ? BRAND.RED : '#f3f4f6',
                              color: isExpanded ? 'white' : '#6b7280',
                              fontSize: '0.7rem', fontWeight: 700,
                              transition: 'all 0.15s',
                              transform: isExpanded ? 'rotate(90deg)' : 'none',
                            }}>›</span>
                          </td>
                          <td style={td}>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{c.foreignName || c.name}</span>
                          </td>
                          <td style={td}>
                            <span style={{ fontWeight: 500, color: BRAND.GRAY_TEXT }}>{c.localName || c.name}</span>
                          </td>
                          <td style={td}>
                            <code style={{ fontWeight: 700, color: BRAND.RED }}>{c.bpCode || '—'}</code>
                          </td>
                          <td style={td}>
                            <span style={{ color: BRAND.GRAY_TEXT }}>{c.groupCode || '—'}</span>
                          </td>
                          <td style={td}>
                            <span style={{ color: BRAND.GRAY_TEXT }}>{c.groupName || '—'}</span>
                          </td>

                          <td style={{ ...td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={(e) => handleExportRow(c, e)}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded border border-[#A02828] bg-white text-[#A02828] hover:bg-[#A02828] hover:text-white hover:shadow-sm transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Export to Excel"
                              >
                                <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                              </button>
                              <button
                                onClick={(e) => handleImportRow(c, e)}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded bg-[#A02828] text-white hover:bg-[#8B2323] shadow-sm hover:shadow transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Import from Excel"
                              >
                                <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Import
                              </button>
                               <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedCustomerId(c.bpCode);
                                  setAddMappingCustomerId(c.bpCode);
                                }}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Add Item Mapping"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                + Map
                              </button>

                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${BRAND.BORDER}` }}>
                              <CustomerItemsPanel
                                customer={{ bpCode: c.bpCode, name: c.name, groupName: c.groupName || '' }}
                                getVendorName={getVendorName}
                                onShowToast={showToast}
                                activeTab={activeTabs[c.bpCode]}
                                onActiveTabChange={(tab) => setActiveTabs(prev => ({...prev, [c.bpCode]: tab}))}
                                forceShowAddModal={addMappingCustomerId === c.bpCode}
                                onAddModalClosed={() => setAddMappingCustomerId(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              pageSize={pageSize}
              totalRecords={totalRecords}
              onPageChange={newPage => setPage(newPage)}
              onPageSizeChange={newSize => { setPageSize(newSize); setPage(1); }}
            />
          </Card>
        </div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium ${
            toast.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{toast.message}</span>
            <button 
              type="button" 
              onClick={() => setToast(null)} 
              className={`ml-2 hover:opacity-75 ${toast.type === 'success' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}`}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {importModalCustomer && !isImportPreviewOpen && (
        <Modal 
          onClose={() => setImportModalCustomer(null)}
          title={`Import Pricing (${getActiveTabForCustomer(importModalCustomer)})`}
        >
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600">
              Upload an Excel file to update pricing for the selected tab.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-red-50 file:text-red-700
                hover:file:bg-red-100"
            />
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setImportModalCustomer(null)}>Cancel</Button>
              <Button 
                onClick={handleParseExcel} 
                disabled={!importFile}
              >
                Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {isImportPreviewOpen && (() => {
        const previewHeaders = importPreviewRows.length > 0 ? Object.keys(importPreviewRows[0]) : [];
        return (
          <Modal title={`Preview Excel Import (${importPreviewRows.length} rows)`} onClose={() => {
            setIsImportPreviewOpen(false);
            setImportModalCustomer(null);
            setImportFile(null);
            setImportPreviewRows([]);
            setImportErrors([]);
          }} wide>
            <div className="text-xs text-gray-500 mb-4 -mt-3">
              Please review the items and prices below before final import.
            </div>
            
            {importErrors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg max-h-40 overflow-y-auto">
                <div className="font-bold mb-1">Import failed with the following errors:</div>
                <ul className="list-disc pl-5 space-y-1">
                  {importErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[50vh] overflow-x-auto overflow-y-auto bg-white mb-6">
              <table className="w-full text-xs text-left table-auto">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase sticky top-0">
                  <tr>
                    {previewHeaders.map(h => (
                      <th key={h} className="px-4 py-2.5 whitespace-nowrap bg-gray-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importPreviewRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {previewHeaders.map(h => (
                        <td key={h} className="px-4 py-2 whitespace-nowrap text-gray-700">
                          {(() => {
                            const v = row[h];
                            if (v === undefined || v === null) return '-';
                            if (v instanceof Date) {
                              const y = v.getUTCFullYear();
                              const m = String(v.getUTCMonth() + 1).padStart(2, '0');
                              const d = String(v.getUTCDate()).padStart(2, '0');
                              return `${d}-${m}-${y}`;
                            }
                            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                              const [y, m, d] = v.split('-');
                              return `${d}-${m}-${y}`;
                            }
                            if (typeof v === 'number') {
                              return v.toFixed(2);
                            }
                            return String(v);
                          })()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importPreviewRows.length > 50 && (
              <div className="text-xs text-gray-500 mb-4 italic">
                Showing first 50 rows of {importPreviewRows.length} total rows.
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={() => {
                setIsImportPreviewOpen(false);
                setImportModalCustomer(null);
                setImportFile(null);
                setImportPreviewRows([]);
                setImportErrors([]);
              }}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={confirmImport} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Confirm & Import'}
              </Button>
            </div>
          </Modal>
        );
      })()}

    </div>
  );
};
export default CustomerListPage;
