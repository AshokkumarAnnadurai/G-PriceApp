import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useState } from 'react';
import Select from 'react-select';
import XLSX from 'xlsx-js-style';
import { itemApi } from '../api/itemApi';
import { Button,Card,DataTable,ErrorState,Input,Modal,Pagination,SearchableSelect,Select as UiSelect } from '../components/ui';
import { BRAND,PAGE_SIZE } from '../constants';
import { PAGE_TITLES } from '../constants/pageHeaders';
import { ItemListFilters,ItemMaster } from '../types';
import { exportItemsToExcel } from '../utils/exportUtils';
import { ItemDetailPanel } from './ItemDetailPanel';




const icons = {
  tag: (
    <svg className="w-4 h-4 text-gray-400 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  fileText: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  pointing: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  globe: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  layers: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polygon points="2 17 12 22 22 17" />
      <polygon points="2 12 12 17 22 12" />
    </svg>
  ),
  ruler: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21.3 8.11l-8-8a1 1 0 0 0-1.4 0l-11 11a1 1 0 0 0 0 1.4l8 8a1 1 0 0 0 1.4 0l11-11a1 1 0 0 0 0-1.4z" />
      <line x1="10.5" y1="18.5" x2="9.5" y2="17.5" />
      <line x1="12.5" y1="16.5" x2="10.5" y2="14.5" />
      <line x1="14.5" y1="14.5" x2="13.5" y2="13.5" />
      <line x1="16.5" y1="12.5" x2="14.5" y2="10.5" />
      <line x1="18.5" y1="10.5" x2="17.5" y2="9.5" />
    </svg>
  ),
  rupee: (
    <span className="text-gray-400 font-semibold text-xs leading-none">₹</span>
  ),
  box: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  briefcase: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  stairs: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M2 20h4v-4h4v-4h4V8h4V4h4" />
    </svg>
  ),
  cart: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  trends: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  database: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  ),
  folder: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export default function ItemMasterPage() {
  const [filters, setFilters] = useState<ItemListFilters>({ page: 1, pageSize: PAGE_SIZE, customerType: 'All' });
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemMaster | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [mappingItem, setMappingItem] = useState<ItemMaster | null>(null);
  const [selectedMappingVendors, setSelectedMappingVendors] = useState<any[]>([]);

  const mapVendorsMutation = useMutation({
    mutationFn: (vendorIds: string[]) => itemApi.mapVendors(mappingItem!.itemCode, vendorIds),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['items-all'] });
      queryClient.invalidateQueries({ queryKey: ['item-filter-options'] });
      setMappingItem(null);
      setSelectedMappingVendors([]);
      
      if (res && res.skippedCount > 0 && res.mappedCount === 0) {
        showToast('Item is already mapped to these vendor(s).', 'error');
      } else if (res && res.skippedCount > 0 && res.mappedCount > 0) {
        showToast(`Mapped ${res.mappedCount} new vendor(s). ${res.skippedCount} vendor(s) were already mapped.`, 'success');
      } else {
        showToast('Item mapped to vendors successfully!', 'success');
      }
    },
    onError: (err: any) => {
      showToast(`Mapping failed: ${err.message}`, 'error');
    }
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const importMutation = useMutation({
    mutationFn: (rows: any[]) => itemApi.importPricing(rows, activeTab === 'Domestic', activeTab),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['items-all'] });
      queryClient.invalidateQueries({ queryKey: ['item-filter-options'] });
      if (res.success === false && res.errors && res.errors.length > 0) {
        alert(`Import completed with errors:\n\n${res.errors.slice(0, 10).join('\n')}${res.errors.length > 10 ? '\n...and more' : ''}`);
      } else {
        setIsImportModalOpen(false);
        showToast(`Successfully imported ${res?.count || importPreviewRows.length} items!`, 'success');
      }
    },
    onError: (err: any) => {
      showToast(`Import failed: ${err.message}`, 'error');
    }
  });

  const parseExcelDate = (val: any): string => {
    if (val === undefined || val === null || val === '') return '';
    if (val instanceof Date) {
      // Bypasses browser local timezone shifts by using UTC methods
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const d = String(val.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof val === 'number') {
      // Excel serial date number conversion (handling Leap Year bug in Excel)
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    // If it's a string in MM/DD/YYYY format or similar, let's normalize it to YYYY-MM-DD
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [mm, dd, yyyy] = str.split('/').map(Number);
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
      const [yyyy, mm, dd] = str.split('-').map(Number);
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return str;
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        const headers = data[0] as string[];
        if (!headers) {
          showToast('Excel sheet is empty.', 'error');
          return;
        }

        const rows = data.slice(1).map((rowArr: any) => {
          const rowObj: Record<string, any> = {};
          headers.forEach((header: string, index: number) => {
            if (header) {
              const cleanedHeader = header.trim();
              let val = rowArr[index];
              if (['from date', 'to date', 'from_date', 'to_date', 'fromdate', 'todate'].includes(cleanedHeader.toLowerCase())) {
                val = parseExcelDate(val);
              }
              rowObj[cleanedHeader] = val;
            }
          });
          return rowObj;
        });

        if (rows.length === 0) {
          showToast('No rows found in Excel.', 'error');
          return;
        }

        setImportPreviewRows(rows);
        setIsImportModalOpen(true);
      } catch (err: any) {
        showToast(`Failed to parse Excel: ${err.message}`, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const [newItem, setNewItem] = useState({
    itemCode: '',
    description: '',
    foreignName: '',
    inStock: 0,
    castingCode: '',
    grade: '',
    boughtOutJobWork: '',
    purchasingItem: 'Yes',
    salesItem: 'Yes',
    inventoryItem: 'Yes',
    subGroup1: '',
    active: 'Yes',
    stage: '',
    uom: '',
    price: 0,
    kit: '',
    exportDomestic: 'Domestic',
    itemGroup: '',
    vendorId: '',
  });

  const createMutation = useMutation({
    mutationFn: (item: Partial<ItemMaster>) => itemApi.create(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items-all'] });
      queryClient.invalidateQueries({ queryKey: ['item-filter-options'] });
      setIsAddModalOpen(false);
      setNewItem({
        itemCode: '',
        description: '',
        foreignName: '',
        inStock: 0,
        castingCode: '',
        grade: '',
        boughtOutJobWork: '',
        purchasingItem: 'Yes',
        salesItem: 'Yes',
        inventoryItem: 'Yes',
        subGroup1: '',
        active: 'Yes',
        stage: '',
        uom: '',
        price: 0,
        kit: '',
        exportDomestic: 'Domestic',
        itemGroup: '',
        vendorId: '',
      });
      showToast('Item created successfully!', 'success');
    },
    onError: (err: any) => {
      showToast(`Error creating item: ${err?.response?.data?.message || err.message}`, 'error');
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newItem as any);
  };


  React.useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(prev => ({
        ...prev,
        search: searchTerm || undefined,
        page: 1
      }));
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data: filterOptions } = useQuery({
    queryKey: ['item-filter-options', filters.grade],
    queryFn: () => itemApi.getFilterOptions(filters.grade),
  });

  const [isCastingDropdownOpen, setIsCastingDropdownOpen] = useState(false);

  const filteredCastingCodes = React.useMemo(() => {
    const val = newItem.castingCode.toLowerCase().trim();
    if (!filterOptions?.castingCodes) return [];
    if (!val) {
      return filterOptions.castingCodes.slice(0, 8);
    }
    return filterOptions.castingCodes
      .filter((code: string) => code.toLowerCase().includes(val))
      .slice(0, 8);
  }, [newItem.castingCode, filterOptions?.castingCodes]);

  const [isGradeDropdownOpen, setIsGradeDropdownOpen] = useState(false);

  const filteredGrades = React.useMemo(() => {
    const val = newItem.grade.toLowerCase().trim();
    if (!filterOptions?.grades) return [];
    if (!val) {
      return filterOptions.grades.slice(0, 8);
    }
    return filterOptions.grades
      .filter((g: string) => g.toLowerCase().includes(val))
      .slice(0, 8);
  }, [newItem.grade, filterOptions?.grades]);

  const [isForeignDropdownOpen, setIsForeignDropdownOpen] = useState(false);

  const filteredForeignNames = React.useMemo(() => {
    const val = newItem.foreignName.toLowerCase().trim();
    if (!filterOptions?.customers) return [];
    if (!val) {
      return filterOptions.customers.slice(0, 8);
    }
    return filterOptions.customers
      .filter((name: string) => name.toLowerCase().includes(val))
      .slice(0, 8);
  }, [newItem.foreignName, filterOptions?.customers]);

  const [isStageDropdownOpen, setIsStageDropdownOpen] = useState(false);

  const filteredStages = React.useMemo(() => {
    const val = newItem.stage.toLowerCase().trim();
    if (!filterOptions?.stages) return [];
    if (!val) {
      return filterOptions.stages.slice(0, 8);
    }
    return filterOptions.stages
      .filter((s: string) => s.toLowerCase().includes(val))
      .slice(0, 8);
  }, [newItem.stage, filterOptions?.stages]);

  const vendorOptions = React.useMemo(() => {
    return (filterOptions?.vendors ?? []).map(v => ({ value: String(v.id), label: `${v.id} - ${v.name}` }));
  }, [filterOptions?.vendors]);




  const apiFilters = React.useMemo(() => {
    const f: ItemListFilters = { ...filters };
    if (colFilters.grade && colFilters.grade.size > 0 && (!filterOptions?.grades || colFilters.grade.size < filterOptions.grades.length)) {
      f.grade = Array.from(colFilters.grade).join(',');
    }
    if (colFilters.exportDomestic && colFilters.exportDomestic.size > 0 && (!filterOptions?.customerTypes || colFilters.exportDomestic.size < filterOptions.customerTypes.length)) {
      f.customerType = Array.from(colFilters.exportDomestic)[0];
    }
    if (colFilters.castingCode && colFilters.castingCode.size > 0 && (!filterOptions?.castingCodes || colFilters.castingCode.size < filterOptions.castingCodes.length)) {
      f.castingCode = Array.from(colFilters.castingCode).join(',');
    }
    if (colFilters.boughtOutJobWork && colFilters.boughtOutJobWork.size > 0 && colFilters.boughtOutJobWork.size < 2) {
      f.boughtOutJobWork = Array.from(colFilters.boughtOutJobWork).join(',');
    }
    if (colFilters.itemCode && colFilters.itemCode.size > 0 && (!filterOptions?.itemCodes || colFilters.itemCode.size < filterOptions.itemCodes.length)) {
      f.itemCode = Array.from(colFilters.itemCode).join(',');
    }
    if (colFilters.description && colFilters.description.size > 0 && (!filterOptions?.descriptions || colFilters.description.size < filterOptions.descriptions.length)) {
      f.description = Array.from(colFilters.description).join(',');
    }
    if (colFilters.foreignName && colFilters.foreignName.size > 0 && (!filterOptions?.foreignNames || colFilters.foreignName.size < filterOptions.foreignNames.length)) {
      f.foreignName = Array.from(colFilters.foreignName).join(',');
    }
    if (colFilters.itemGroup && colFilters.itemGroup.size > 0 && (!filterOptions?.itemGroups || colFilters.itemGroup.size < filterOptions.itemGroups.length)) {
      f.itemGroup = Array.from(colFilters.itemGroup).join(',');
    }

    return f;
  }, [filters, colFilters, filterOptions]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['items-all', apiFilters],
    queryFn: () => itemApi.list(apiFilters),
    placeholderData: prev => prev,
    staleTime: 5 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  
  const getFilterOptions = (key: string, _formatter?: (val: string) => string) => {
    if (!filterOptions) return [];
    if (key === 'grade') return filterOptions.grades.map(g => ({ label: g, value: g }));
    if (key === 'exportDomestic') return filterOptions.customerTypes.map(c => ({ label: c, value: c }));
    if (key === 'castingCode') return (filterOptions.castingCodes || []).map(c => ({ label: c, value: c }));
    if (key === 'itemCode') return (filterOptions.itemCodes || []).map(c => ({ label: c, value: c }));
    if (key === 'description') return (filterOptions.descriptions || []).map(d => ({ label: d, value: d }));
    if (key === 'foreignName') return (filterOptions.foreignNames || []).map(c => ({ label: c, value: c }));
    if (key === 'itemGroup') return (filterOptions.itemGroups || []).map(g => ({ label: g.name, value: String(g.code || (g as any).id) }));
    if (key === 'boughtOutJobWork') {
      return [
        { label: 'Bought Out', value: 'Bought Out' },
        { label: 'Job Work', value: 'Job Work' }
      ];
    }
    return [];
  };

  
  const handleColFilter = (key: string, val: Set<string>) => {
    setColFilters(prev => ({ ...prev, [key]: val }));
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const DEFAULT_FILTERS: ItemListFilters = { page: 1, pageSize: PAGE_SIZE, customerType: 'All' };
  const isFiltered = !!(apiFilters.grade || apiFilters.vendorId || apiFilters.customerName || searchTerm || apiFilters.itemCode || apiFilters.description || apiFilters.castingCode || apiFilters.boughtOutJobWork || Object.values(colFilters).some(s => s && s.size > 0));

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setColFilters({});
    setSearchTerm('');
  };

    const activeTab = filters.customerType || 'All';

  const getVendorName = React.useCallback((code: string | null | undefined) => {
    if (!code) return '';
    const v = (filterOptions?.vendors ?? []).find(v => String(v.id) === code || String(v.name) === code);
    return v ? v.name : code;
  }, [filterOptions?.vendors]);

  const handleExportExcel = async () => {
    try {
      showToast('Preparing export... Please wait.', 'success');
      const allMatchingData = await itemApi.list({
        ...apiFilters,
        page: 1,
        pageSize: total > 0 ? total : 100000,
      });
      const exportItems = allMatchingData?.items ?? [];

      if (!exportItems.length) {
        alert('No data to export.');
        return;
      }

      await exportItemsToExcel(exportItems, activeTab, getVendorName, 'ItemMaster');

    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export Excel');
    }
  };

  const columns = [
    { key: 'itemCode', header: 'Item No', render: (i: any) => i.itemCode || '' },
    { key: 'description', header: 'Item Description', render: (i: any) => <div className="w-64 max-w-sm truncate" title={i.description || ''}>{i.description || ''}</div>, filterSelectedValues: colFilters['description'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('description', v), filterOptions: getFilterOptions('description') },
    { key: 'inStock', header: 'In Stock', render: (i: any) => i.inStock ?? 0, align: 'right' as const },
    { key: 'itemGroup', header: 'Item Group', render: (i: any) => i.itemGroup || '', filterSelectedValues: colFilters['itemGroup'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('itemGroup', v), filterOptions: getFilterOptions('itemGroup') },
    { key: 'castingCode', header: 'Casting Code', render: (i: any) => i.castingCode || '', filterSelectedValues: colFilters['castingCode'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('castingCode', v), filterOptions: getFilterOptions('castingCode') },
    { key: 'foreignName', header: 'Foreign Name', render: (i: any) => i.foreignName || '', filterSelectedValues: colFilters['foreignName'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('foreignName', v), filterOptions: getFilterOptions('foreignName') },
    { key: 'grade', header: 'Grade', render: (i: any) => i.grade || '', filterSelectedValues: colFilters['grade'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('grade', v), filterOptions: getFilterOptions('grade') },
    { key: 'boughtOutJobWork', header: 'Bought Out/Job Work', render: (i: any) => i.boughtOutJobWork || '', filterSelectedValues: colFilters['boughtOutJobWork'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('boughtOutJobWork', v), filterOptions: getFilterOptions('boughtOutJobWork') },
    { key: 'purchasingItem', header: 'Purchasing Item', render: (i: any) => i.purchasingItem || '' },
    { key: 'salesItem', header: 'Sales Item', render: (i: any) => i.salesItem || '' },
    { key: 'inventoryItem', header: 'Inventory Item', render: (i: any) => i.inventoryItem || '' },
    { key: 'subGroup1', header: 'Sub Group 1', render: (i: any) => i.subGroup1 || '' },
    { key: 'active', header: 'Active', render: (i: any) => i.active || '' },
    { key: 'stage', header: 'Stage', render: (i: any) => i.stage || '' },
    { key: 'uom', header: 'UOM', render: (i: any) => i.uom || '' },
    { key: 'kit', header: 'Kit', render: (i: any) => i.kit || '' },
    { key: 'exportDomestic', header: 'Export/Domestic', render: (i: any) => i.exportDomestic || '', filterSelectedValues: colFilters['exportDomestic'], onFilterSelectedChange: (v: Set<string>) => handleColFilter('exportDomestic', v), filterOptions: getFilterOptions('exportDomestic') },
  ];



  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
      <div className="bg-white border-b border-gray-200 z-10 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">{PAGE_TITLES.ITEM_MASTER}</h1>
            <span className="text-sm text-gray-500 font-medium">({total.toLocaleString()} items)</span>
          </div>
          <div className="flex items-center gap-3">
            
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 hover:text-red-600 hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
            >
              <svg className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export {activeTab}</span>
            </button>
            {(activeTab === 'Domestic' || activeTab === 'Export' || activeTab === 'Labour / Job Work' || activeTab === 'Pin & Bush') && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 border border-transparent rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
                >
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Import Prices</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportExcel}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
              </>
            )}
            {isFiltered && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg shadow-sm hover:bg-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
              >
                <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Clear Filters</span>
              </button>
            )}

            <div className="relative ml-2">
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                placeholder="Search item code, description..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-[280px] h-[38px] pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-gray-50"
                style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 min-h-0 flex flex-col">
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {isError ? (
            <div className="p-4"><ErrorState message={String(error)} /></div>
          ) : (
            <div className="flex flex-col h-full min-h-0">
              <DataTable columns={columns} rows={items} keyFn={i => i.itemCode} loading={isLoading} onRowClick={setSelectedItem} />
              <Pagination
                page={filters.page ?? 1}
                pageSize={filters.pageSize ?? PAGE_SIZE}
                totalRecords={total}
                onPageChange={newPage => setFilters(p => ({ ...p, page: newPage }))}
                onPageSizeChange={newSize => setFilters(p => ({ ...p, page: 1, pageSize: newSize }))}
              />
            </div>
          )}
        </Card>
      </div>

      {isAddModalOpen && (
        <Modal title="Add New Item" onClose={() => setIsAddModalOpen(false)} wide>
          <div className="text-xs text-gray-500 mb-6 -mt-3">Enter the details of the new item</div>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Input
                label="Item No / Code *"
                required
                placeholder="Enter item number or code"
                leftIcon={icons.tag}
                value={newItem.itemCode}
                onChange={e => setNewItem(prev => ({ ...prev, itemCode: e.target.value }))}
              />
              <Input
                label="Item Description *"
                required
                placeholder="Enter item description"
                leftIcon={icons.fileText}
                value={newItem.description}
                onChange={e => setNewItem(prev => ({ ...prev, description: e.target.value }))}
              />
              <div className="relative">
                <Input
                  label="Casting Code"
                  placeholder="Enter casting code"
                  leftIcon={icons.pointing}
                  value={newItem.castingCode}
                  onChange={e => {
                    setNewItem(prev => ({ ...prev, castingCode: e.target.value }));
                    setIsCastingDropdownOpen(true);
                  }}
                  onFocus={() => setIsCastingDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsCastingDropdownOpen(false), 200);
                  }}
                  autoComplete="off"
                />
                {isCastingDropdownOpen && filteredCastingCodes.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    {filteredCastingCodes.map((code: string) => (
                      <div
                        key={code}
                        onMouseDown={() => {
                          setNewItem(prev => ({ ...prev, castingCode: code }));
                          setIsCastingDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  label="Foreign Name"
                  placeholder="Enter foreign name (if any)"
                  leftIcon={icons.globe}
                  value={newItem.foreignName}
                  onChange={e => {
                    setNewItem(prev => ({ ...prev, foreignName: e.target.value }));
                    setIsForeignDropdownOpen(true);
                  }}
                  onFocus={() => setIsForeignDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsForeignDropdownOpen(false), 200);
                  }}
                  autoComplete="off"
                />
                {isForeignDropdownOpen && filteredForeignNames.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    {filteredForeignNames.map((name: string) => (
                      <div
                        key={name}
                        onMouseDown={() => {
                          setNewItem(prev => ({ ...prev, foreignName: name }));
                          setIsForeignDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  label="Grade"
                  placeholder="Select grade"
                  leftIcon={icons.layers}
                  value={newItem.grade}
                  onChange={e => {
                    setNewItem(prev => ({ ...prev, grade: e.target.value }));
                    setIsGradeDropdownOpen(true);
                  }}
                  onFocus={() => setIsGradeDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsGradeDropdownOpen(false), 200);
                  }}
                  autoComplete="off"
                />
                {isGradeDropdownOpen && filteredGrades.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    {filteredGrades.map((g: string) => (
                      <div
                        key={g}
                        onMouseDown={() => {
                          setNewItem(prev => ({ ...prev, grade: g }));
                          setIsGradeDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <UiSelect
                label="Export / Domestic"
                leftIcon={icons.globe}
                value={newItem.exportDomestic}
                onChange={e => setNewItem(prev => ({ ...prev, exportDomestic: e.target.value }))}
              >
                <option value="Domestic">Domestic</option>
                <option value="Export">Export</option>
              </UiSelect>

              <UiSelect
                label="Item Group"
                leftIcon={icons.folder}
                value={newItem.itemGroup}
                onChange={e => setNewItem(prev => ({ ...prev, itemGroup: e.target.value }))}
              >
                <option value="">Select Item Group</option>
                {filterOptions?.itemGroups?.map(g => (
                  <option key={g.code} value={g.code}>{g.name}</option>
                ))}
              </UiSelect>

              <SearchableSelect
                label="Vendor / Foundry"
                value={newItem.vendorId}
                onChange={val => setNewItem(prev => ({ ...prev, vendorId: val }))}
                options={vendorOptions}
                placeholder="Select Vendor (Optional)"
                leftIcon={icons.users}
              />

              <Input
                label="Price"
                type="number"
                step="0.01"
                placeholder="Enter price"
                leftIcon={icons.rupee}
                value={newItem.price || ''}
                onChange={e => setNewItem(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
              />
              <Input
                label="In Stock"
                type="number"
                placeholder="Enter stock quantity"
                leftIcon={icons.box}
                value={newItem.inStock || ''}
                onChange={e => setNewItem(prev => ({ ...prev, inStock: parseInt(e.target.value, 10) || 0 }))}
              />
              <Input
                label="Bought Out / Job Work"
                placeholder="Enter BO / Job Work details"
                leftIcon={icons.briefcase}
                value={newItem.boughtOutJobWork}
                onChange={e => setNewItem(prev => ({ ...prev, boughtOutJobWork: e.target.value }))}
              />
              <div className="relative">
                <Input
                  label="Stage"
                  placeholder="Select stage"
                  leftIcon={icons.stairs}
                  value={newItem.stage}
                  onChange={e => {
                    setNewItem(prev => ({ ...prev, stage: e.target.value }));
                    setIsStageDropdownOpen(true);
                  }}
                  onFocus={() => setIsStageDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsStageDropdownOpen(false), 200);
                  }}
                  autoComplete="off"
                />
                {isStageDropdownOpen && filteredStages.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    {filteredStages.map((s: string) => (
                      <div
                        key={s}
                        onMouseDown={() => {
                          setNewItem(prev => ({ ...prev, stage: s }));
                          setIsStageDropdownOpen(false);
                        }}
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="Kit"
                placeholder="Enter kit"
                leftIcon={icons.box}
                value={newItem.kit}
                onChange={e => setNewItem(prev => ({ ...prev, kit: e.target.value }))}
              />

              <div className="space-y-1">
                <label className="block text-xs font-medium" style={{ color: BRAND.GRAY_TEXT }}>Active</label>
                <div className="flex items-center h-[38px] px-3 border rounded-lg bg-white" style={{ borderColor: BRAND.BORDER }}>
                  <button
                    type="button"
                    onClick={() => setNewItem(prev => ({ ...prev, active: prev.active === 'Yes' ? 'No' : 'Yes' }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newItem.active === 'Yes' ? 'bg-[#2563EB]' : 'bg-gray-300'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newItem.active === 'Yes' ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                  </button>
                  <span className="ml-3 text-sm text-gray-700 font-medium">{newItem.active}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <UiSelect
                label="Purchasing Item"
                leftIcon={icons.cart}
                value={newItem.purchasingItem}
                onChange={e => setNewItem(prev => ({ ...prev, purchasingItem: e.target.value }))}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </UiSelect>
              <UiSelect
                label="Sales Item"
                leftIcon={icons.trends}
                value={newItem.salesItem}
                onChange={e => setNewItem(prev => ({ ...prev, salesItem: e.target.value }))}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </UiSelect>
              <UiSelect
                label="Inventory Item"
                leftIcon={icons.database}
                value={newItem.inventoryItem}
                onChange={e => setNewItem(prev => ({ ...prev, inventoryItem: e.target.value }))}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </UiSelect>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={createMutation.isPending}>
                Create Item
              </Button>
            </div>
          </form>
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
      {isImportModalOpen && (() => {
        const previewHeaders = importPreviewRows.length > 0 ? Object.keys(importPreviewRows[0]) : [];
        return (
          <Modal title={`Preview Excel Import (${importPreviewRows.length} rows)`} onClose={() => setIsImportModalOpen(false)} wide>
            <div className="text-xs text-gray-500 mb-4 -mt-3">
              Please review the items and prices below before final import.
            </div>
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
                          {row[h] !== undefined && row[h] !== null ? String(row[h]) : '-'}
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
              <Button type="button" variant="secondary" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" loading={importMutation.isPending} onClick={() => importMutation.mutate(importPreviewRows)}>
                Confirm & Import
              </Button>
            </div>
          </Modal>
        );
      })()}
      {mappingItem && (
        <Modal
          title={`Map Vendors to Item: ${mappingItem.itemCode}`}
          onClose={() => {
            setMappingItem(null);
            setSelectedMappingVendors([]);
          }}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded-lg border">
              <div>
                <span className="block text-xs text-gray-500 font-medium">Description</span>
                <span className="font-semibold text-gray-900">{mappingItem.description || '-'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-500 font-medium">Casting Code</span>
                <span className="font-semibold text-gray-900">{mappingItem.castingCode || '-'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-500 font-medium">Grade</span>
                <span className="font-semibold text-gray-900">{mappingItem.grade || '-'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-500 font-medium">Customer Name</span>
                <span className="font-semibold text-gray-900">{mappingItem.foreignName || '-'}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Select Vendor(s)</label>
              <Select
                isMulti
                placeholder="Choose one or more vendors..."
                value={selectedMappingVendors}
                onChange={(selected: any) => setSelectedMappingVendors(selected || [])}
                options={(filterOptions?.vendors ?? []).map(v => ({
                  value: v.id,
                  label: v.name ? `${v.name} (${v.id})` : v.id
                }))}
                className="text-sm"
                menuPortalTarget={document.body}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 })
                }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMappingItem(null);
                  setSelectedMappingVendors([]);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={mapVendorsMutation.isPending}
                disabled={selectedMappingVendors.length === 0}
                onClick={() => {
                  mapVendorsMutation.mutate(selectedMappingVendors.map(v => v.value));
                }}
              >
                Save Mapping
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {selectedItem && (
        <ItemDetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} onShowToast={showToast} parentTab={activeTab} />
      )}
    </div>
  );
}
