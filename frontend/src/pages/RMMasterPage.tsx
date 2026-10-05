import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useMemo,useState } from 'react';
import XLSX from 'xlsx-js-style';
import { itemApi } from '../api/itemApi';
import { vendorApi } from '../api/vendorApi';
import { Button,Card,ErrorState,Loader,Modal,Pagination,SearchableSelect } from '../components/ui';
import { BRAND } from '../constants';
import { PAGE_TITLES } from '../constants/pageHeaders';
import { Vendor } from '../types';

const th = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
  padding: '10px 16px',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#000000',
  backgroundColor: 'white',
  whiteSpace: 'nowrap',
  textAlign: align,
});

const RMMasterPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const qc = useQueryClient();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    rmWeight: number;
    revisedRatePerKg: number;
    mmr: number;
    ro: number;
    cons: number;
    extra: number;
  }>({
    rmWeight: 0,
    revisedRatePerKg: 0,
    mmr: 0,
    ro: 0,
    cons: 0,
    extra: 0,
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importErrorCount, setImportErrorCount] = useState(0);

  
  const confirmImportMutation = useMutation({
    mutationFn: async () => {
      const validRows = importPreviewRows.filter(r => !r.validationErrors || r.validationErrors.length === 0);
      const promises = validRows.map(r => {
        return vendorApi.addMaterial(r.vendorId, {
          grade: r.grade,
          customerName: r.customerName || 'All',
          castingCode: r.castingCode || r.itemCode || 'All',
          rmWeight: r.rmWeight,
          revisedRatePerKg: r.revisedRatePerKg,
          mmrRate: r.mmr || 0,
          roRate: r.ro || 0,
          consumablesRate: r.cons || 0,
          extraFactor: r.extra || 1,
        });
      });
      return Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      qc.invalidateQueries({ queryKey: ['items-rm-master'] });
      setIsImportModalOpen(false);
      showToast(`Successfully imported ${importPreviewRows.length - importErrorCount} items!`, 'success');
    },
    onError: (err: any) => {
      showToast(`Import failed: ${err.message}`, 'error');
    }
  });

  
  
  
    const { data: allItemsData } = useQuery({
    queryKey: ['items-all-rm-lookup'],
    queryFn: () => itemApi.listPricing({ pageSize: 5000, itemGroup: '109' }),
  });
  const allItems = allItemsData?.items ?? [];

  const { data: itemsData, isLoading: itemsLoading, isError: itemsError, error: itemsQueryError } = useQuery({
    queryKey: ['items-rm-master', page, pageSize, search, gradeFilter, vendorFilter, customerFilter],
    queryFn: () => itemApi.listPricing({
      page,
      pageSize,
      search: search || undefined,
      grade: gradeFilter || undefined,
      vendorId: vendorFilter || undefined,
      customerName: customerFilter || undefined,
      itemGroup: '109'
    }),
  });

  const { data: vendors = [] as Vendor[] } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => vendorApi.getAll(),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['item-filter-options', gradeFilter, vendorFilter, customerFilter],
    queryFn: () => itemApi.getFilterOptions({
      grade: gradeFilter || undefined,
      vendorId: vendorFilter || undefined,
      customerName: customerFilter || undefined,
    }),
  });

  // Build lookup: vendorId + grade + customerName + castingCode → rates
  const rateMap = useMemo(() => {
    const m = new Map<string, { mmr: number; ro: number; cons: number; extra: number; rmWeight: number; revisedRatePerKg: number }>();
    for (const v of vendors) {
      for (const mat of v.materials) {
        m.set(`${v.id}:${mat.grade}:${mat.customerName || 'All'}:${mat.castingCode || 'All'}`, {
          mmr: mat.mmrRate, ro: mat.roRate, cons: mat.consumablesRate, extra: mat.extraFactor,
          rmWeight: mat.rmWeight || 0, revisedRatePerKg: mat.revisedRatePerKg || 0
        });
      }
    }
    return m;
  }, [vendors]);

  const allRows = useMemo(() => {
    const items = itemsData?.items ?? [];
    return items.map(item => {
      const specificCastingSpecificCustomer = rateMap.get(`${item.vendorId}:${item.grade}:${item.customerName}:${item.castingCode || item.itemCode}`);
      const generalCastingSpecificCustomer = rateMap.get(`${item.vendorId}:${item.grade}:${item.customerName}:All`);
      const specificCastingGeneralCustomer = rateMap.get(`${item.vendorId}:${item.grade}:All:${item.castingCode || item.itemCode}`);
      const generalCastingGeneralCustomer = rateMap.get(`${item.vendorId}:${item.grade}:All:All`);

      const rates = specificCastingSpecificCustomer ?? generalCastingSpecificCustomer ?? specificCastingGeneralCustomer ?? generalCastingGeneralCustomer ?? { mmr: 0, ro: 0, cons: 0, extra: 0, rmWeight: 0, revisedRatePerKg: 0 };
      const totalRM = +((rates.rmWeight || 0) * (rates.revisedRatePerKg || 0)).toFixed(2);
      return { ...item, ...rates, totalRM };
    });
  }, [itemsData, rateMap]);

  const uniqueCustomers = filterOptions?.customers ?? [];
  const vendorOptions = useMemo(() => {
    return (filterOptions?.vendors ?? []).map(v => ({ value: String(v.id), label: v.name }));
  }, [filterOptions?.vendors]);

  const totalRecords = itemsData?.total ?? 0;
    const pageRows = allRows;

  const isFiltered = !!(search || gradeFilter || vendorFilter || customerFilter);
  const clearFilters = () => { setSearch(''); setGradeFilter(''); setVendorFilter(''); setCustomerFilter(''); setPage(1); };

  const fmt = (n: number) => n > 0 ? `₹${n.toFixed(2)}` : '₹0.00';

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
        <div className="bg-white border-b border-gray-200 z-30 shrink-0">
          <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">{PAGE_TITLES.RM_MASTER}</h1>
              <span className="text-sm text-gray-500 font-medium">({totalRecords} record{totalRecords !== 1 ? 's' : ''})</span>
            </div>
            <div className="flex gap-3 flex-wrap items-center justify-end">
              <div className="relative">
                <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input
                  type="text"
                  placeholder="Search casting code, description…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="h-[38px] pl-9 pr-8 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-white"
                  style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED, width: '240px' } as React.CSSProperties}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-lg">×</button>
                )}
              </div>

              <SearchableSelect
                value={gradeFilter}
                onChange={val => { setGradeFilter(val); setPage(1); }}
                options={filterOptions?.grades ?? []}
                placeholder="Select Grade"
                style={{ width: '160px' }}

              />

              <SearchableSelect
                value={vendorFilter}
                onChange={val => { setVendorFilter(val); setPage(1); }}
                options={vendorOptions}
                placeholder="Select Vendor"
                style={{ width: '220px' }}
              />
              <SearchableSelect
                value={customerFilter}
                onChange={val => { setCustomerFilter(val); setPage(1); }}
                options={uniqueCustomers}
                placeholder="Select Foreign Name"
                style={{ width: '220px' }}
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

        <div className="p-6 flex-1 min-h-0 flex flex-col">
          {/* Table */}
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-sm min-w-[1400px] border-collapse relative">
                <thead className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200">
                  <tr>
                    {[
                      ['FOREIGN NAME', 'left'],
                      ['ITEM NO', 'left'],
                      ['DESCRIPTION', 'left'],
                      ['GRADE', 'left'],
                      ['CASTING CODE', 'left'],
                      ['VENDOR / FOUNDRY', 'left'],
                      ['MMR', 'right'],
                      ['RED OXIDE', 'right'],
                      ['CONSUMABLES', 'right'],
                      ['EXTRA FACTOR', 'right'],
                      ['RM WT', 'right'],
                      ['REVISED RATE PER KG', 'right'],
                      ['TOTAL RM PRICE', 'right'],
                    ].map(([h, align]) => (
                      <th
                        key={h}
                        style={th(align as any)}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    <tr>
                      <td colSpan={15}>
                        <div className="flex justify-center items-center py-16">
                          <Loader size="md" />
                        </div>
                      </td>
                    </tr>
                  ) : itemsError ? (
                    <tr>
                      <td colSpan={15} className="py-16 text-center text-sm text-red-600 font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span>âš ï¸ Failed to load RM records</span>
                          <span className="text-xs font-mono font-normal text-gray-500">{String(itemsQueryError)}</span>
                        </div>
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={15} className="py-16 text-center text-sm" style={{ color: BRAND.GRAY_TEXT }}>No records found.</td></tr>
                  ) : pageRows.map(row => {
                    const isEditing = row.id === editingRowId;
                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: `1px solid ${BRAND.BORDER}` }}
                        className="transition-colors hover:bg-gray-50"
                      >
                        <td className="px-4 py-3.5 text-gray-700 whitespace-nowrap">{row.customerName || '-'}</td>
                        <td className="px-4 py-3.5">
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-800">{row.itemCode || '-'}</code>
                        </td>
                        <td className="px-4 py-3.5 text-gray-700 whitespace-nowrap">{row.description}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-gray-100 text-gray-600">{row.grade}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{row.castingCode}</code>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-medium" style={{ color: '#2563eb' }}>{row.vendorName ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                          {isEditing ? (
                            <input
                              type="number"
                              step="1"
                              value={editValues.mmr}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditValues(prev => ({
                                  ...prev,
                                  mmr: val,
                                  revisedRatePerKg: +(val + Number(prev.ro) + Number(prev.cons) + Number(prev.extra)).toFixed(2)
                                }));
                              }}
                              className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-red-500 text-right font-mono"
                            />
                          ) : (
                            fmt(row.mmr)
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                          {isEditing ? (
                            <input
                              type="number"
                              step="1"
                              value={editValues.ro}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditValues(prev => ({
                                  ...prev,
                                  ro: val,
                                  revisedRatePerKg: +(Number(prev.mmr) + val + Number(prev.cons) + Number(prev.extra)).toFixed(2)
                                }));
                              }}
                              className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-red-500 text-right font-mono"
                            />
                          ) : (
                            fmt(row.ro)
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                          {isEditing ? (
                            <input
                              type="number"
                              step="1"
                              value={editValues.cons}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditValues(prev => ({
                                  ...prev,
                                  cons: val,
                                  revisedRatePerKg: +(Number(prev.mmr) + Number(prev.ro) + val + Number(prev.extra)).toFixed(2)
                                }));
                              }}
                              className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-red-500 text-right font-mono"
                            />
                          ) : (
                            fmt(row.cons)
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                          {isEditing ? (
                            <input
                              type="number"
                              step="1"
                              value={editValues.extra}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditValues(prev => ({
                                  ...prev,
                                  extra: val,
                                  revisedRatePerKg: +(Number(prev.mmr) + Number(prev.ro) + Number(prev.cons) + val).toFixed(2)
                                }));
                              }}
                              className="w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:border-red-500 text-right font-mono"
                            />
                          ) : (
                            fmt(row.extra)
                          )}
                        </td>

                        {isEditing ? (
                          <>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                step="1"
                                value={editValues.rmWeight}
                                onChange={e => setEditValues(prev => ({ ...prev, rmWeight: parseFloat(e.target.value) || 0 }))}
                                className="w-24 px-2 py-1 text-xs border rounded focus:outline-none focus:border-red-500 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                disabled
                                value={editValues.revisedRatePerKg}
                                className="w-24 px-2 py-1 text-xs border rounded bg-gray-50 focus:outline-none text-right font-mono cursor-not-allowed text-gray-500"
                              />
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-semibold" style={{ color: BRAND.RED }}>
                              {fmt(Number(editValues.rmWeight) * Number(editValues.revisedRatePerKg))}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3.5 text-right font-mono text-gray-700">{(row.rmWeight || 0).toFixed(2)} kg</td>
                            <td className="px-4 py-3.5 text-right font-mono text-gray-700">{fmt(row.revisedRatePerKg)}</td>
                            <td className="px-4 py-3.5 text-right font-mono font-semibold" style={{ color: BRAND.RED }}>
                              {fmt(row.totalRM)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
      </div>

      {/* Excel Import Preview Modal */}
      {isImportModalOpen && (
        <Modal
          title={`Import Preview (${importPreviewRows.length} Items, ${importPreviewRows.length - importErrorCount} Valid)`}
          onClose={() => setIsImportModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            {importErrorCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <span className="text-base">âš ï¸</span>
                <div>
                  <p className="font-semibold">Validation Errors Found ({importErrorCount} issues)</p>
                  <p className="text-xs mt-0.5">Please fix these errors in your Excel file and upload again. Import is disabled while errors exist.</p>
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 sticky top-0 border-b font-semibold text-gray-600 z-10 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                  <tr>
                    <th className="px-3 py-2">Validation</th>
                    <th className="px-3 py-2">Item No</th>
                    <th className="px-3 py-2">Vendor Name</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Casting Code</th>
                    <th className="px-3 py-2 text-right">MMR</th>
                    <th className="px-3 py-2 text-right">Red Oxide</th>
                    <th className="px-3 py-2 text-right">Consumables</th>
                    <th className="px-3 py-2 text-right">Extra Factor</th>
                    <th className="px-3 py-2 text-right">RM Weight</th>
                    <th className="px-3 py-2 text-right">Revised Rate</th>
                    <th className="px-3 py-2 text-right">Total RM Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importPreviewRows.map((row) => {
                    const hasErrors = row.validationErrors && row.validationErrors.length > 0;
                    const totalRM = (row.rmWeight || 0) * (row.revisedRatePerKg || 0);
                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-gray-50/50 ${hasErrors ? 'bg-red-50/50 text-red-900 font-medium' : ''}`}
                      >
                        <td className="px-3 py-2">
                          {hasErrors ? (
                            <span className="text-red-600 flex items-center gap-1" title={row.validationErrors.join(', ')}>
                              âŒ {row.validationErrors[0]}
                            </span>
                          ) : (
                            <span className="text-emerald-600">âœ… OK</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.itemCode}</td>
                        <td className="px-3 py-2 max-w-[150px] truncate">{row.vendorName}</td>
                        <td className="px-3 py-2 font-mono">{row.grade}</td>
                        <td className="px-3 py-2 font-mono">{row.castingCode || '—'}</td>
                        <td className="px-3 py-2 text-right">{fmt(row.mmr)}</td>
                        <td className="px-3 py-2 text-right">{fmt(row.ro)}</td>
                        <td className="px-3 py-2 text-right">{fmt(row.cons)}</td>
                        <td className="px-3 py-2 text-right">{row.extra ? row.extra.toFixed(2) : '0.00'}</td>
                        <td className="px-3 py-2 text-right">{row.rmWeight ? `${row.rmWeight.toFixed(2)} kg` : '0.00 kg'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(row.revisedRatePerKg)}</td>
                        <td className="px-3 py-2 text-right font-semibold font-mono">{fmt(totalRM)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {confirmImportMutation.isError && (
              <ErrorState message={String(confirmImportMutation.error?.message || confirmImportMutation.error)} />
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button
                variant="secondary"
                onClick={() => setIsImportModalOpen(false)}
                disabled={confirmImportMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => confirmImportMutation.mutate()}
                loading={confirmImportMutation.isPending}
                disabled={importErrorCount > 0}
                style={{
                  backgroundColor: importErrorCount > 0 ? '#e5e7eb' : BRAND.RED,
                  color: importErrorCount > 0 ? '#9ca3af' : 'white',
                  cursor: importErrorCount > 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Confirm Import
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className="fixed top-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 animate-fade-in border"
          style={{
            backgroundColor: toast.type === 'success' ? '#10B981' : BRAND.RED,
            borderColor: toast.type === 'success' ? '#059669' : BRAND.RED,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          }}
        >
          {toast.type === 'success' ? (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </>
  );
};

export default RMMasterPage;
