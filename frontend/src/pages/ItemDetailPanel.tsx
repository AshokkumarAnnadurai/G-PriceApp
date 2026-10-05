import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useState } from 'react';
import { itemApi } from '../api/itemApi';
import { pricingApi } from '../api/pricingApi';
import { Button,SlidePanel } from '../components/ui';
import { ItemMaster } from '../types';


interface ItemDetailPanelProps {
  item: ItemMaster | null;
  onClose: () => void;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
  parentTab?: string;
   tabsOnly?: string[];
   onRemoveMapping?: (itemCode: string) => void;
}

const toLocalMonthString = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const numToInputStr = (val: any) => {
  if (val === undefined || val === null || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return '';
  if (num === 0) return '';
  // Round to 4 decimal places to eliminate floating-point noise while preserving exact small decimals (e.g. 0.021)
  return String(parseFloat(num.toFixed(4)));
};

const blobToBase64 = (blobUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fetch(blobUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });
};

const getCategoriesForTab = (parentTab: string | undefined): string[] => {
  const tab = parentTab || 'Domestic';
  if (tab === 'Labour / Job Work') {
    return ['Powder Coating Weight', 'Special Process Weight', 'Machining'];
  }
  if (tab === 'Pin & Bush') {
    return ['Casting Weight', 'Machining', 'Hardening', 'Hard Chrome'];
  }
  if (tab === 'Export') {
    return ['Casting Weight', 'Powder Coating Weight', 'Special Process Weight', 'Machining'];
  }
  // Default/Domestic
  return ['Casting Weight', 'Powder Coating Weight', 'Special Process Weight', 'Machining'];
};

const WeightsDrawingsTab: React.FC<{ itemCode: string; parentTab?: string; onShowToast?: (message: string, type: 'success' | 'error') => void }> = ({ itemCode, parentTab, onShowToast }) => {
  const categories = React.useMemo(() => getCategoriesForTab(parentTab), [parentTab]);

  const [data, setData] = useState<Record<string, Array<{ id: string; url: string; name: string; weight: number }>>>(() => {
    const initial: Record<string, Array<{ id: string; url: string; name: string; weight: number }>> = {};
    [
      'Casting Weight',
      'Powder Coating Weight',
      'Special Process Weight',
      'Machining',
      'Hardening',
      'Hard Chrome'
    ].forEach(cat => {
      initial[cat] = [
        { id: '1', url: '', name: '', weight: 0 },
        { id: '2', url: '', name: '', weight: 0 },
        { id: '3', url: '', name: '', weight: 0 },
        { id: '4', url: '', name: '', weight: 0 },
        { id: '5', url: '', name: '', weight: 0 },
      ];
    });
    return initial;
  });

  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ category: string; index: number } | null>(null);

  // Fetch weights and drawings from the backend
  const { data: dbData, isLoading, refetch } = useQuery({
    queryKey: ['weight-drawings', itemCode],
    queryFn: () => itemApi.getWeightDrawings(itemCode),
    enabled: !!itemCode
  });

  // Populate data when fetched
  React.useEffect(() => {
    if (dbData) {
      setData(prev => {
        // Deep clone initial state structure to prevent mutation side-effects
        const next: typeof prev = {};
        Object.keys(prev).forEach(cat => {
          next[cat] = prev[cat].map(slot => ({ ...slot, url: '', name: '', weight: 0 }));
        });
        dbData.forEach((row: any) => {
          const cat = row.category;
          const idx = row.slot_index;
          if (next[cat] && next[cat][idx]) {
            next[cat][idx] = {
              id: String(idx + 1),
              url: row.image_path || '',
              name: row.image_path ? row.image_path.split('/').pop() || '' : '',
              weight: Number(row.weight) || 0
            };
          }
        });
        return next;
      });
    }
  }, [dbData]);

  const handleWeightChange = (category: string, index: number, val: number) => {
    setData(prev => {
      const list = [...prev[category]];
      list[index] = { ...list[index], weight: val };
      return { ...prev, [category]: list };
    });
  };

  const handleFileUpload = (category: string, index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setData(prev => {
      const list = [...prev[category]];
      list[index] = { ...list[index], url, name: file.name };
      return { ...prev, [category]: list };
    });
  };

  const handleRemoveFile = (category: string, index: number) => {
    setData(prev => {
      const list = [...prev[category]];
      list[index] = { ...list[index], url: '', name: '' };
      return { ...prev, [category]: list };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const category of categories) {
        const slots = data[category];
        // Convert local blob URLs to base64
        const processedSlots = await Promise.all(
          slots.map(async slot => {
            if (slot.url && slot.url.startsWith('blob:')) {
              try {
                const base64 = await blobToBase64(slot.url);
                return { ...slot, url: base64 };
              } catch (e) {
                console.error('Failed to convert blob to base64', e);
              }
            }
            return slot;
          })
        );
        await itemApi.saveWeightDrawings(itemCode, category, processedSlots);
      }
      refetch();
      if (onShowToast) {
        onShowToast('Weights and Drawings saved successfully!', 'success');
      } else {
        alert('Weights and Drawings saved successfully!');
      }
    } catch (err: any) {
      const msg = err.message || err;
      if (onShowToast) {
        onShowToast(`Error saving: ${msg}`, 'error');
      } else {
        alert(`Error saving: ${msg}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    
    // Resolve backend domain from the window context
    const serverRoot = window.location.origin.includes('localhost') 
      ? 'http://localhost:4001'
      : window.location.origin.replace('-pricingapp', '-pricingapi');
    return `${serverRoot}${url}`;
  };

  return (
    <div className="p-6 bg-[#F3F4F6] min-h-full space-y-6">
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base">Weights & Engineering Drawings</h3>
          <p className="text-xs text-gray-500 mt-1">Upload drawings and specify individual weights for each image across process stages.</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50"
          style={{ background: '#A02828' }}
        >
          {isSaving ? 'Saving...' : 'Save Weights & Drawings'}
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white p-8 rounded-lg border border-gray-200 text-center text-gray-500">
          Loading saved weights and drawings...
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category} className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
              <h4 className="font-bold text-gray-800 text-sm mb-4 border-b border-gray-100 pb-2">{category}</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {data[category].map((slot, index) => (
                  <div key={slot.id} className="flex flex-col items-center">
                    {/* Thumbnail / Upload Box */}
                    <div className="relative w-full aspect-square border border-gray-200 rounded-lg overflow-hidden group shadow-sm bg-gray-50 flex flex-col items-center justify-center">
                      {deleteConfirm?.category === category && deleteConfirm?.index === index ? (
                        <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center p-1 text-center select-none z-20">
                          <span className="text-[10px] font-bold text-white mb-2">Delete drawing?</span>
                          <div className="flex gap-2">
                            <button 
                              type="button" 
                              onClick={() => {
                                handleRemoveFile(category, index);
                                setDeleteConfirm(null);
                              }}
                              className="px-2 py-0.5 bg-white text-red-900 rounded text-[10px] font-bold hover:bg-gray-100 transition-colors"
                            >
                              Yes
                            </button>
                            <button 
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-0.5 bg-black/30 text-white rounded text-[10px] font-bold hover:bg-black/50 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {slot.url ? (
                        <>
                          <img src={getImageUrl(slot.url)} alt={slot.name} className="w-full h-full object-cover" />
                          {/* Overlay on Hover */}
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-1.5">
                            <button 
                              type="button"
                              onClick={() => setLightbox(getImageUrl(slot.url))}
                              className="p-1.5 bg-white hover:bg-gray-100 text-gray-800 rounded shadow-sm text-xs transition-colors"
                              title="View drawing"
                            >
                              🔍
                            </button>
                            <button 
                              type="button"
                              onClick={() => setDeleteConfirm({ category, index })}
                              className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded shadow-sm text-xs transition-colors"
                              title="Remove drawing"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      ) : (
                        <div 
                          onClick={() => document.getElementById(`file-${category}-${index}`)?.click()}
                          className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-red-50/10 transition-colors p-2 text-center"
                        >
                          <input 
                            id={`file-${category}-${index}`} 
                            type="file" 
                            accept="image/*"
                            onChange={e => handleFileUpload(category, index, e.target.files)} 
                            className="hidden" 
                          />
                          <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[10px] font-semibold text-gray-500">Image {index + 1}</span>
                        </div>
                      )}
                    </div>

                    {/* Weight Field directly below */}
                    <div className="w-full mt-2 flex items-center gap-1">
                      <input 
                        type="number" 
                        step="0.001" 
                        value={slot.weight || ''} 
                        onChange={e => handleWeightChange(category, index, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-center text-xs font-mono text-gray-900 bg-white focus:outline-none focus:border-[#A02828]"
                        placeholder="0.000 kg"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightbox && (
        <div 
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent">
            <button 
              onClick={() => setLightbox(null)} 
              className="absolute -top-10 right-0 text-white text-3xl font-light hover:text-gray-300"
            >
              ×
            </button>
            <img 
              src={lightbox} 
              alt="Preview" 
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl border border-white/10" 
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const ItemDetailPanel: React.FC<ItemDetailPanelProps> = (props) => {
  const { item: propItem, onClose, onShowToast, parentTab, onRemoveMapping } = props;
  const isAllTab = parentTab === 'All';
  const [activeTab, setActiveTab] = useState('Price Build-up');
  const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<any>(() => ({
    description: propItem?.description || '',
    castingCode: propItem?.castingCode || '',
    grade: propItem?.grade || '',
    customerApprovalFoundry: propItem?.customerApprovalFoundry || '',
    weight: numToInputStr(propItem?.weight),
    ratePerKg: numToInputStr(propItem?.ratePerKg),
    rejectionCost: numToInputStr(propItem?.rejectionCost),
    rejectionPercent: propItem?.rejectionCost && propItem?.weight && propItem?.ratePerKg ? numToInputStr(propItem.rejectionCost / (propItem.weight * propItem.ratePerKg) * 100) : '',
    powderCoatingRate: (propItem?.powderCoatingRate && Number(propItem.powderCoatingRate) > 0) ? numToInputStr(propItem.powderCoatingRate) : (propItem?.powderCoating && propItem?.weight ? numToInputStr(Number(propItem.powderCoating) / Number(propItem.weight)) : ''),
    powderCoatingWeight: (propItem?.powderCoatingWeight && Number(propItem.powderCoatingWeight) > 0) ? numToInputStr(propItem.powderCoatingWeight) : numToInputStr(propItem?.weight),
    powderCoating: numToInputStr(propItem?.powderCoating),
    specialCoating: propItem?.specialCoating || '',
    specialProcessRate: (propItem?.specialProcessRate && Number(propItem.specialProcessRate) > 0) ? numToInputStr(propItem.specialProcessRate) : (propItem?.specialProcess && propItem?.weight ? numToInputStr(Number(propItem.specialProcess) / Number(propItem.weight)) : ''),
    specialProcessWeight: (propItem?.specialProcessWeight && Number(propItem.specialProcessWeight) > 0) ? numToInputStr(propItem.specialProcessWeight) : numToInputStr(propItem?.weight),
    specialProcess: numToInputStr(propItem?.specialProcess),
    process: numToInputStr(propItem?.process),
    transCharges: numToInputStr(propItem?.transCharges),
    ohp: numToInputStr(propItem?.ohp),
    packing: numToInputStr(propItem?.packing),
    fromDate: propItem?.fromDate || '',
    toDate: propItem?.toDate || '',
    customerCode: propItem?.customerCode || '',
    customerName: propItem?.customerName || '',
    foreignName: propItem?.foreignName || '',
    itemGroup: propItem?.itemGroup || '',
    exportDomestic: propItem?.exportDomestic || '',
    boughtOutJobWork: propItem?.boughtOutJobWork || '',
    active: propItem?.active || '',
    stage: propItem?.stage || '',
    uom: propItem?.uom || '',
    kit: propItem?.kit || '',
    vendorId: propItem?.vendorId || '',
    lessDomesticPacking: numToInputStr(propItem?.lessDomesticPacking),
    assemblyCost: numToInputStr(propItem?.assemblyCost),
    exportPackingCost: propItem?.exportPackingCost || '',
    fobCost: numToInputStr(propItem?.fobCost),
    ohIccExport: numToInputStr(propItem?.ohIccExport),
    addedExportOverheads: numToInputStr(propItem?.addedExportOverheads),
    forex: numToInputStr(propItem?.forex),
    hardeningWt: numToInputStr(propItem?.hardeningWt),
    hardeningRate: numToInputStr(propItem?.hardeningRate),
    grinding: numToInputStr(propItem?.grinding),
    hardChromeWt: numToInputStr(propItem?.hardChromeWt),
    hardChromeRate: numToInputStr(propItem?.hardChromeRate),
    cuttingRate: propItem?.cuttingRate !== undefined && propItem?.cuttingRate !== null ? numToInputStr(propItem.cuttingRate) : (propItem?.cutting && propItem?.weight ? numToInputStr(Number(propItem.cutting) / Number(propItem.weight)) : ''),
    cuttingWeight: propItem?.cuttingWeight !== undefined && propItem?.cuttingWeight !== null ? numToInputStr(propItem.cuttingWeight) : numToInputStr(propItem?.weight),
    cutting: numToInputStr(propItem?.cutting),
  }));

  const queryClient = useQueryClient();

  const { data: fetchedItem } = useQuery({
    queryKey: ['item-detail', propItem?.itemCode, propItem?.customerCode, parentTab],
    queryFn: async () => {
      const res = await itemApi.getOne(propItem!.itemCode, propItem?.customerCode, parentTab);
      return res;
    },
    enabled: !!propItem?.itemCode,
  });

  React.useEffect(() => {
    if (fetchedItem && !isEditing) {
      // Only update item-master metadata fields from the fetched item.
      // Customer pricing fields (weight, ratePerKg, specialProcess, etc.) come from customer records.
      setFormData((prev: any) => ({
        ...prev,
        description: fetchedItem.description || prev.description,
        castingCode: fetchedItem.castingCode || prev.castingCode,
        grade: fetchedItem.grade || prev.grade,
        active: fetchedItem.active || prev.active,
        stage: fetchedItem.stage || prev.stage,
        uom: fetchedItem.uom || prev.uom,
        kit: fetchedItem.kit || prev.kit,
        boughtOutJobWork: fetchedItem.boughtOutJobWork || prev.boughtOutJobWork,
        exportDomestic: fetchedItem.exportDomestic || prev.exportDomestic,
        itemGroup: fetchedItem.itemGroup || prev.itemGroup,
      }));
    }
  }, [fetchedItem, isEditing]);

  const updateMutation = useMutation({
    mutationFn: (updated: any) => itemApi.update(propItem!.itemCode, updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items-all'] });
      queryClient.invalidateQueries({ queryKey: ['item-detail', propItem?.itemCode] });
      queryClient.invalidateQueries({ queryKey: ['customer-items'] });
      setIsEditing(false);
      if (onShowToast) {
        onShowToast('Item saved successfully!', 'success');
      } else {
        alert('Item saved successfully!');
      }
    },
    onError: (err: any) => {
      if (onShowToast) {
        onShowToast(`Save failed: ${err.message}`, 'error');
      } else {
        alert(`Save failed: ${err.message}`);
      }
    }
  });

  const isLabourTab = parentTab === 'Labour / Job Work' || (propItem && (propItem.exportDomestic === 'Labour / Job Work' || propItem.boughtOutJobWork === 'Job Work'));

  const getQuarterFromDate = (dateStr: string | null | undefined) => {
    if (!dateStr || !dateStr.includes('-')) return 'Q1';
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const month = parts[1];
      if (month >= 1 && month <= 3) return 'Q1';
      if (month >= 4 && month <= 6) return 'Q2';
      if (month >= 7 && month <= 9) return 'Q3';
      return 'Q4';
    }
    return 'Q1';
  };

  const getYearFromDate = (dateStr: string | null | undefined) => {
    if (!dateStr || !dateStr.includes('-')) return new Date().getFullYear();
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return parts[0];
    }
    return new Date().getFullYear();
  };

  const getCoveredQuarters = (fDate: string | null | undefined, tDate: string | null | undefined) => {
    if (!fDate || !tDate) return '';
    const dStart = new Date(fDate);
    const dEnd = new Date(tDate);
    if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
      const startYear = dStart.getFullYear();
      const startMonth = dStart.getMonth();
      const endYear = dEnd.getFullYear();
      const endMonth = dEnd.getMonth();
      if (startYear === endYear && startMonth === endMonth) {
        const expectedLastDay = new Date(startYear, startMonth + 1, 0).getDate();
        if (dStart.getDate() === 1 && dEnd.getDate() === expectedLastDay) {
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `Covers: ${monthNames[startMonth]} ${startYear}`;
        }
      }
    }
    const q1 = getQuarterFromDate(fDate);
    const q2 = getQuarterFromDate(tDate);
    const y1 = getYearFromDate(fDate);
    const y2 = getYearFromDate(tDate);
    if (q1 === q2 && y1 === y2) return `Covers: ${q1} ${y1}`;

    const qList = ['Q1', 'Q2', 'Q3', 'Q4'];
    if (y1 === y2) {
      const idx1 = qList.indexOf(q1);
      const idx2 = qList.indexOf(q2);
      if (idx1 !== -1 && idx2 !== -1 && idx1 <= idx2) {
        return `Covers: ${qList.slice(idx1, idx2 + 1).join(', ')} ${y1}`;
      }
    }
    return `Covers: ${q1} ${y1} to ${q2} ${y2}`;
  };

  const handleFromMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM
    if (!val) {
      setFormData({ ...formData, fromDate: '' });
      return;
    }
    setFormData({ ...formData, fromDate: `${val}-01` });
  };

  const handleToMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM
    if (!val) {
      setFormData({ ...formData, toDate: '' });
      return;
    }
    const [year, month] = val.split('-');
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    setFormData({ ...formData, toDate: `${val}-${lastDay}` });
  };
  const handleSave = () => {
    const cp = isLabourTab ? 0 : (Number(formData.weight) || 0) * (Number(formData.ratePerKg) || 0);
    const rejectionCost = isLabourTab ? 0 : (Number(formData.rejectionCost) || 0);
    const rejectionPercent = isLabourTab ? 0 : (Number(formData.rejectionPercent) || 0);
    const ratePerKg = isLabourTab ? 0 : (Number(formData.ratePerKg) || 0);

    const twc =
      rejectionCost +
      (isPinBushTab ? (Number(formData.cutting) || 0) : ((Number(formData.powderCoating) || 0) + (Number(formData.specialProcess) || 0))) +
      (Number(formData.process) || 0) +
      (Number(formData.transCharges) || 0) +
      (Number(formData.ohp) || 0) +
      (Number(formData.packing) || 0) +
      (isPinBushTab ? ((Number(formData.hardeningWt) || 0) * (Number(formData.hardeningRate) || 0)) +
                     (Number(formData.grinding) || 0) +
                     ((Number(formData.hardChromeWt) || 0) * (Number(formData.hardChromeRate) || 0)) : 0);
    const fp = cp + twc;
    // When editing from Customer Master tabs, only argit pricing tables should be updated.
    // oitm_sftp must not be touched — signal this to the backend.
    const isCustomerMasterEdit = ['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'].includes(parentTab || '');
    updateMutation.mutate({
      ...formData,
      exportDomestic: parentTab || formData.exportDomestic,
      ratePerKg,
      rejectionCost,
      rejectionPercent,
      totalWorkingCost: twc,
      finalPrice: fp,
      _skipOitmUpdate: isCustomerMasterEdit,
    });
  };

  const { data: bomData, isLoading: isLoadingBom } = useQuery({
    queryKey: ['item-bom', propItem?.itemCode],
    queryFn: () => itemApi.getBom(propItem!.itemCode),
    enabled: !!propItem?.itemCode && activeTab === 'BOM / Route Flow',
  });

  const { data: priceLogData, isLoading: isLoadingPriceLog } = useQuery({
    queryKey: ['item-price-log', propItem?.itemCode],
    queryFn: () => pricingApi.getPriceLog(undefined, propItem!.itemCode),
    enabled: !!propItem?.itemCode && activeTab === 'Pricing History',
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['item-filter-options-all'],
    queryFn: () => itemApi.getFilterOptions(),
  });
  const vendors = filterOptions?.vendors || [];
  
  
  const item = React.useMemo(() => {
    if (!propItem) return fetchedItem;
    if (!fetchedItem) return propItem;
    return { ...fetchedItem, ...propItem };
  }, [fetchedItem, propItem]);

  if (!item) return null;

  const allTabs = [
    'Price Build-up',
    'Customers Supplied / Rates',
    'BOM / Route Flow',
    'Pricing History',
  ];
  
  const tabs = props.tabsOnly ? props.tabsOnly : allTabs;

  // Calculations for Price Build-up
  const currentWeight = isEditing ? Number(formData.weight) : Number(item.weight || 0);
  const currentRate = isLabourTab ? 0 : (isEditing ? Number(formData.ratePerKg) : Number(item.ratePerKg || item.price || 0));
  const castingPrice = isLabourTab ? 0 : (currentWeight * currentRate);

  const currentRejection = isLabourTab ? 0 : (isEditing ? Number(formData.rejectionCost) : Number(item.rejectionCost || 0));
  const currentPowder = isEditing ? Number(formData.powderCoating) : Number(item.powderCoating || 0);
  const currentPowderWeight = isEditing ? Number(formData.powderCoatingWeight) : (item.powderCoatingWeight !== undefined && item.powderCoatingWeight !== null ? Number(item.powderCoatingWeight) : Number(item.weight || 0));
  const currentPowderRate = isEditing ? Number(formData.powderCoatingRate) : (item.powderCoatingRate !== undefined && item.powderCoatingRate !== null ? Number(item.powderCoatingRate) : (item.powderCoating && item.weight ? (Number(item.powderCoating) / Number(item.weight)) : 0));
    const currentSpecial = isEditing ? Number(formData.specialProcess) : Number(item.specialProcess || 0);
  const currentSpecialWeight = isEditing ? Number(formData.specialProcessWeight) : (item.specialProcessWeight !== undefined && item.specialProcessWeight !== null ? Number(item.specialProcessWeight) : Number(item.weight || 0));
  const currentSpecialRate = isEditing ? Number(formData.specialProcessRate) : (item.specialProcessRate !== undefined && item.specialProcessRate !== null ? Number(item.specialProcessRate) : (item.specialProcess && item.weight ? (Number(item.specialProcess) / Number(item.weight)) : 0));
  const currentProcess = isEditing ? Number(formData.process) : Number(item.process || 0);
  const currentTrans = isEditing ? Number(formData.transCharges) : Number(item.transCharges || 0);
  const currentOHP = isEditing ? Number(formData.ohp) : Number(item.ohp || 0);
  const currentPacking = isEditing ? Number(formData.packing) : Number(item.packing || 0);

  const isPinBushTab = parentTab === 'Pin & Bush' || (propItem && propItem.exportDomestic === 'Pin & Bush');

  const currentCutting = isEditing ? Number(formData.cutting) : Number(item.cutting || 0);
      
  const currentHardeningWt = isEditing ? Number(formData.hardeningWt) : Number(item.hardeningWt || 0);
  const currentHardeningRate = isEditing ? Number(formData.hardeningRate) : Number(item.hardeningRate || 0);
  const currentHardeningPrice = currentHardeningWt * currentHardeningRate;
  const currentGrinding = isEditing ? Number(formData.grinding) : Number(item.grinding || 0);
  const currentHardChromeWt = isEditing ? Number(formData.hardChromeWt) : Number(item.hardChromeWt || 0);
  const currentHardChromeRate = isEditing ? Number(formData.hardChromeRate) : Number(item.hardChromeRate || 0);
  const currentHardChromePrice = currentHardChromeWt * currentHardChromeRate;

  let totalCost = castingPrice + currentRejection + (isPinBushTab ? currentCutting : (currentPowder + currentSpecial)) + currentProcess + currentTrans + currentOHP + currentPacking;
  if (isPinBushTab) {
    totalCost += currentHardeningPrice + currentGrinding + currentHardChromePrice;
  }

  const currentLessDomesticPacking = isEditing ? Number(formData.lessDomesticPacking) : Number(item.lessDomesticPacking || 0);
  const currentAssemblyCost = isEditing ? Number(formData.assemblyCost) : Number(item.assemblyCost || 0);
  const currentExportPackingCost = isEditing ? Number(formData.exportPackingCost) : Number(item.exportPackingCost || 0);
  const currentFobCost = isEditing ? Number(formData.fobCost) : Number(item.fobCost || 0);
  const currentOhIccExport = isEditing ? Number(formData.ohIccExport) : Number(item.ohIccExport || 0);
  const currentAddedExportOverheads = isEditing ? Number(formData.addedExportOverheads) : Number(item.addedExportOverheads || 0);
  const currentForex = isEditing ? Number(formData.forex) : Number(item.forex || 0);

  const unitPriceForExport = totalCost - currentLessDomesticPacking + currentAssemblyCost + currentExportPackingCost + currentFobCost + currentOhIccExport + currentAddedExportOverheads;
  const unitPriceForeignCurrency = currentForex > 0 ? unitPriceForExport / currentForex : 0;

  const safeToFixed = (val: any, decimals = 2): string => {
    if (val === undefined || val === null || val === '') return '0.00';
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(decimals);
  };

  const isExportItem = parentTab === 'Export' || 
    ((!parentTab || parentTab === 'All') && !!item.exportDomestic && item.exportDomestic !== 'Domestic/Export' && item.exportDomestic.includes('Export'));

  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Customers Supplied / Rates':
        return (
          <div className="p-6">
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#F8F9FA] text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Cust Code</th>
                    <th className="px-4 py-3">Cust Name</th>
                    <th className="px-4 py-3">Customer Type</th>
                    <th className="px-4 py-3">Currency</th>
                    <th className="px-4 py-3">Final Price</th>
                    <th className="px-4 py-3">From Date</th>
                    <th className="px-4 py-3">To Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 text-gray-700">{item.customerCode || '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.customerName || item.foreignName || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{item.customerGroup || item.customerType || item.exportDomestic || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{isExportItem ? (item.currency || 'USD') : 'INR'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {isExportItem ? `${item.currency || 'USD'} ${safeToFixed(unitPriceForeignCurrency, 2)}` : `₹ ${safeToFixed(totalCost, 2)}`}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{item.fromDate ? new Date(item.fromDate).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{item.toDate ? new Date(item.toDate).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.toDate && new Date(item.toDate) < new Date() ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                        {item.toDate && new Date(item.toDate) < new Date() ? 'Expired' : 'Active'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'Price Build-up':
        return (
          <div className="p-6 bg-[#F3F4F6] min-h-full">
            <div className="bg-[#F3F4F6] rounded-t-lg flex items-center justify-between pb-2">
              <h3 className="font-semibold text-gray-800 text-sm">Price Build-up ({item.exportDomestic || 'Domestic'} - {item.customerName || item.foreignName})</h3>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#F8F9FA] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-1/3">Cost Component</th>
                    <th className="px-4 py-3 w-1/4">Value Unit</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!isLabourTab && (
                    <>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Casting Weight</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <input type="number" step="any" value={formData.weight} onChange={e => {
                              const valStr = e.target.value;
                              const newWeight = parseFloat(valStr) || 0;
                              const newCastingPrice = newWeight * (parseFloat(formData.ratePerKg) || 0);
                              const newRejectionCost = ((parseFloat(formData.rejectionPercent) || 0) / 100) * newCastingPrice;
                              const newPowderCoating = newWeight * (parseFloat(formData.powderCoatingRate) || 0);
                              const newSpecialProcess = newWeight * (parseFloat(formData.specialProcessRate) || 0);
                              setFormData({
                                ...formData,
                                weight: valStr,
                                rejectionCost: parseFloat(safeToFixed(newRejectionCost, 4)),
                                powderCoating: parseFloat(safeToFixed(newPowderCoating, 4)),
                                specialProcess: parseFloat(safeToFixed(newSpecialProcess, 4))
                              });
                            }} className="w-24 px-2 py-1 border rounded text-sm" />
                          ) : (
                            `${safeToFixed(currentWeight, 2)} kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Net weight</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Casting Rate / Kg</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.ratePerKg} onChange={e => {
                              const valStr = e.target.value;
                              const newRate = parseFloat(valStr) || 0;
                              const newCastingPrice = (parseFloat(formData.weight) || 0) * newRate;
                              const newRejectionCost = ((parseFloat(formData.rejectionPercent) || 0) / 100) * newCastingPrice;
                              setFormData({
                                ...formData,
                                ratePerKg: valStr,
                                rejectionCost: parseFloat(safeToFixed(newRejectionCost, 2))
                              });
                            }} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentRate, 2)} INR/kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Foundry rate</td>
                      </tr>
                      <tr className="bg-[#EAF1F8] font-bold">
                        <td className="px-4 py-3 text-gray-900">Casting Price</td>
                        <td className="px-4 py-3 font-medium text-gray-900 text-[#A02828]">₹ {safeToFixed(castingPrice, 2)} INR</td>
                        <td className="px-4 py-3 text-gray-900">Weight × Rate/Kg</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Rejection %</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1"><input type="number" step="any" value={formData.rejectionPercent} onChange={e => {
                              const valStr = e.target.value;
                              const percent = parseFloat(valStr) || 0;
                              const weight = parseFloat(formData.weight) || 0;
                              const rate = parseFloat(formData.ratePerKg) || 0;
                              const cost = weight && rate ? parseFloat(safeToFixed(((percent / 100) * (weight * rate)), 2)) : 0;
                              setFormData({ ...formData, rejectionPercent: valStr, rejectionCost: cost });
                            }} className="w-20 px-2 py-1 border rounded text-sm" /> %</div>
                          ) : (
                            `${safeToFixed(((currentRejection / (castingPrice || 1)) * 100), 2)} %`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">(Rejection Cost / Casting Price) × 100</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Rejection Cost</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.rejectionCost} onChange={e => {
                              const valStr = e.target.value;
                              const cost = parseFloat(valStr) || 0;
                              const weight = parseFloat(formData.weight) || 0;
                              const rate = parseFloat(formData.ratePerKg) || 0;
                              const percent = weight && rate ? parseFloat(safeToFixed((cost / (weight * rate) * 100), 2)) : 0;
                              setFormData({ ...formData, rejectionCost: valStr, rejectionPercent: percent });
                            }} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentRejection, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">(Rejection % / 100) × Casting Price</td>
                      </tr>
                    </>
                  )}
                  
                  {/* Cutting Row (only for Pin & Bush) */}
                  {isPinBushTab && (
                    <tr>
                      <td className="px-4 py-3 text-gray-700">Cutting</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isEditing ? (
                          <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.cutting} onChange={e => setFormData({ ...formData, cutting: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                        ) : (
                          `₹ ${safeToFixed(currentCutting, 2)} INR`
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">Cutting cost</td>
                    </tr>
                  )}

                  {/* Powder Coating and Special Process Rows (NOT for Pin & Bush) */}
                  {!isPinBushTab && (
                    <>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Powder Coating Wt(Kg)</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1"><input type="number" step="any" value={formData.powderCoatingWeight} onChange={e => {
                          const valStr = e.target.value;
                          const newWeight = parseFloat(valStr) || 0;
                          const cost = parseFloat(safeToFixed((newWeight * (parseFloat(formData.powderCoatingRate) || 0)), 2));
                          setFormData({ ...formData, powderCoatingWeight: valStr, powderCoating: cost });
                        }} className="w-24 px-2 py-1 border rounded text-sm text-gray-900" /> kg</div>
                      ) : (
                        `${safeToFixed(currentPowderWeight, 2)} kg`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Weight used for powder coating</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Powder Coating Rate/kg</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.powderCoatingRate} onChange={e => {
                          const valStr = e.target.value;
                          const rate = parseFloat(valStr) || 0;
                          const cost = parseFloat(safeToFixed(((parseFloat(formData.powderCoatingWeight) || 0) * rate), 2));
                          setFormData({ ...formData, powderCoatingRate: valStr, powderCoating: cost });
                        }} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentPowderRate, 2)} INR/kg`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Rate per Kg for powder coating</td>
                  </tr>
                  <tr className="bg-[#EAF1F8] font-bold">
                    <td className="px-4 py-3 text-gray-900">Powder Coating Price</td>
                    <td className="px-4 py-3 font-medium text-gray-900 text-[#A02828]">
                      ₹ {safeToFixed(isEditing ? (formData.powderCoating || 0) : currentPowder, 2)} INR
                    </td>
                    <td className="px-4 py-3 text-gray-500">Powder Coating Wt × Rate/kg</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Special Process Wt(Kg)</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1"><input type="number" step="any" value={formData.specialProcessWeight} onChange={e => {
                          const valStr = e.target.value;
                          const newWeight = parseFloat(valStr) || 0;
                          const cost = parseFloat(safeToFixed((newWeight * (parseFloat(formData.specialProcessRate) || 0)), 4));
                          setFormData({ ...formData, specialProcessWeight: valStr, specialProcess: cost });
                        }} className="w-24 px-2 py-1 border rounded text-sm text-gray-900" /> kg</div>
                      ) : (
                        `${safeToFixed(currentSpecialWeight, 2)} kg`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Weight used for special process</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Special Process Rate/kg</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.specialProcessRate} onChange={e => {
                          const valStr = e.target.value;
                          const rate = parseFloat(valStr) || 0;
                          const cost = parseFloat(safeToFixed(((parseFloat(formData.specialProcessWeight) || 0) * rate), 4));
                          setFormData({ ...formData, specialProcessRate: valStr, specialProcess: cost });
                        }} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentSpecialRate, 2)} INR/kg`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Rate per Kg for special process</td>
                  </tr>
                  <tr className="bg-[#EAF1F8] font-bold">
                    <td className="px-4 py-3 text-gray-900">Special Process Price</td>
                    <td className="px-4 py-3 font-medium text-gray-900 text-[#A02828]">
                      ₹ {safeToFixed(isEditing ? (formData.specialProcess || 0) : currentSpecial, 2)} INR
                    </td>
                    <td className="px-4 py-3 text-gray-500">Special Process Wt × Rate/kg</td>
                  </tr>
                </>
              )}
              <tr>
                    <td className="px-4 py-3 text-gray-700">Machining / Process</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.process} onChange={e => setFormData({ ...formData, process: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentProcess, 2)} INR`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Machining cost</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Transport Charges</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.transCharges} onChange={e => setFormData({ ...formData, transCharges: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentTrans, 2)} INR`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Local transport</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Overhead & Profit (OHP)</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.ohp} onChange={e => setFormData({ ...formData, ohp: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentOHP, 2)} INR`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Overheads</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Packing</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.packing} onChange={e => setFormData({ ...formData, packing: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                      ) : (
                        `₹ ${safeToFixed(currentPacking, 2)} INR`
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Packaging</td>
                  </tr>
                  {isPinBushTab && (
                    <>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Hardening Wt(Kg)</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1"><input type="number" step="0.01" value={formData.hardeningWt} onChange={e => setFormData({ ...formData, hardeningWt: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm text-gray-900" /> kg</div>
                          ) : (
                            `${safeToFixed(currentHardeningWt, 2)} kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Weight for hardening</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Hardening Rate/kg</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="0.01" value={formData.hardeningRate} onChange={e => setFormData({ ...formData, hardeningRate: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentHardeningRate, 2)} INR/kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Rate per Kg for hardening</td>
                      </tr>
                      <tr className="bg-[#EAF1F8] font-bold">
                        <td className="px-4 py-3 text-gray-900">Hardening Price</td>
                        <td className="px-4 py-3 font-medium text-gray-900 text-[#A02828]">
                          ₹ {safeToFixed(currentHardeningPrice, 2)} INR
                        </td>
                        <td className="px-4 py-3 text-gray-500">Hardening Wt × Rate/kg</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Grinding</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="0.01" value={formData.grinding} onChange={e => setFormData({ ...formData, grinding: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentGrinding, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Grinding cost</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Hard Chrome Wt(Kg)</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1"><input type="number" step="0.01" value={formData.hardChromeWt} onChange={e => setFormData({ ...formData, hardChromeWt: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm text-gray-900" /> kg</div>
                          ) : (
                            `${safeToFixed(currentHardChromeWt, 2)} kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Weight for hard chrome</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Hard Chrome Rate/kg</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="0.01" value={formData.hardChromeRate} onChange={e => setFormData({ ...formData, hardChromeRate: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentHardChromeRate, 2)} INR/kg`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Rate per Kg for hard chrome</td>
                      </tr>
                      <tr className="bg-[#EAF1F8] font-bold">
                        <td className="px-4 py-3 text-gray-900">Hard Chrome Price</td>
                        <td className="px-4 py-3 font-medium text-gray-900 text-[#A02828]">
                          ₹ {safeToFixed(currentHardChromePrice, 2)} INR
                        </td>
                        <td className="px-4 py-3 text-gray-500">Hard Chrome Wt × Rate/kg</td>
                      </tr>
                    </>
                  )}
                  <tr className="bg-[#F8F9FA] font-bold">
                    <td className="px-4 py-3 text-gray-900">Total Working Cost</td>
                    <td className="px-4 py-3 font-medium text-gray-900">₹ {safeToFixed(currentRejection + (isPinBushTab ? currentCutting : (currentPowder + currentSpecial)) + currentProcess + currentTrans + currentOHP + currentPacking + (isPinBushTab ? currentHardeningPrice + currentGrinding + currentHardChromePrice : 0), 2)} INR</td>
                    <td className="px-4 py-3 text-gray-500">Sum of Process Costs</td>
                  </tr>
                  <tr className="bg-[#F8F9FA] font-bold">
                    <td className="px-4 py-3 text-gray-900">Final Price</td>
                    <td className="px-4 py-3 font-medium text-gray-900">₹ {safeToFixed(totalCost, 2)} INR</td>
                    <td className="px-4 py-3 text-gray-900">Casting Price + Total Working Cost</td>
                  </tr>
                  {isExportItem && (
                    <>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Less Domestic Packing</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.lessDomesticPacking} onChange={e => setFormData({ ...formData, lessDomesticPacking: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentLessDomesticPacking, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Deduction</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Assembly Cost</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.assemblyCost} onChange={e => setFormData({ ...formData, assemblyCost: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentAssemblyCost, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Addition</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Export Packing Cost</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.exportPackingCost} onChange={e => setFormData({ ...formData, exportPackingCost: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentExportPackingCost, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Addition</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">FOB Cost/piece</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.fobCost} onChange={e => setFormData({ ...formData, fobCost: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentFobCost, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Addition</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">OH & ICC on Export</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.ohIccExport} onChange={e => setFormData({ ...formData, ohIccExport: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentOhIccExport, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Addition</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Added Export Overheads</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1">₹ <input type="number" step="any" value={formData.addedExportOverheads} onChange={e => setFormData({ ...formData, addedExportOverheads: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            `₹ ${safeToFixed(currentAddedExportOverheads, 2)} INR`
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Addition</td>
                      </tr>
                      <tr className="bg-[#EAF1F8] font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900">Unit Price for Export</td>
                        <td className="px-4 py-3 font-medium text-[#1E3A8A]">₹ {safeToFixed(unitPriceForExport, 2)} INR</td>
                        <td className="px-4 py-3 text-gray-500">Final Price - Dom Packing + Export Costs</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Forex</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {isEditing ? (
                            <div className="flex items-center gap-1"><input type="number" step="any" value={formData.forex} onChange={e => setFormData({ ...formData, forex: e.target.value })} className="w-24 px-2 py-1 border rounded text-sm" /></div>
                          ) : (
                            safeToFixed(currentForex, 2)
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">Exchange Rate</td>
                      </tr>
                      <tr className="bg-[#EAF1F8] font-bold">
                        <td className="px-4 py-3 text-gray-900">Unit Price in Foreign Currency</td>
                        <td className="px-4 py-3 font-medium text-[#1E3A8A]">{item.currency || 'USD'} {safeToFixed(unitPriceForeignCurrency, 2)}</td>
                        <td className="px-4 py-3 text-gray-500">Unit Price for Export / Forex</td>
                      </tr>
                    </>
                  )}
                  {!isLabourTab && (
                    <tr>
                      <td className="px-4 py-3 text-gray-700">Customer Approval Foundry</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={formData.customerApprovalFoundry || ''}
                            onChange={e => setFormData({ ...formData, customerApprovalFoundry: e.target.value })}
                            className="w-full px-2 py-1 border rounded text-sm bg-white"
                            placeholder="Enter foundry name"
                          />
                        ) : (
                          item.customerApprovalFoundry || '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">Approved Foundry</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Special Coating</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.specialCoating || ''}
                          onChange={e => setFormData({ ...formData, specialCoating: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm bg-white"
                          placeholder="Enter special coating details"
                        />
                      ) : (
                        (!isNaN(Number(item.specialCoating)) && String(item.specialCoating).trim() !== '') 
                          ? Number(item.specialCoating).toFixed(2) 
                          : (item.specialCoating || '-')
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Special Coating Details</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-gray-700">Validity Period</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isEditing ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">Valid From (Month)</label>
                              <input
                                type="month"
                                value={toLocalMonthString(formData.fromDate)}
                                onChange={handleFromMonthChange}
                                className="px-2 py-1 border rounded text-sm bg-white"
                              />
                            </div>
                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">Valid To (Month)</label>
                              <input
                                type="month"
                                value={toLocalMonthString(formData.toDate)}
                                onChange={handleToMonthChange}
                                className="px-2 py-1 border rounded text-sm bg-white"
                              />
                            </div>
                          </div>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-blue-600 font-medium">
                              Covers: {getCoveredQuarters(formData.fromDate, formData.toDate)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          return item.fromDate ? `${getCoveredQuarters(item.fromDate, item.toDate)} (${item.fromDate} to ${item.toDate})` : '-';
                        })()
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">Validity Quarter & Year</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'BOM / Route Flow':
        return (
          <div className="p-6 bg-[#F3F4F6] min-h-full space-y-6">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Bill of Materials (BOM)</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#F8F9FA] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Level</th>
                      <th className="px-4 py-3">Comp Code</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Item Type</th>
                      <th className="px-4 py-3">Qty</th>
                      <th className="px-4 py-3">Scrap %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoadingBom ? (
                      <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-500">Loading BOM...</td></tr>
                    ) : bomData?.bom?.length ? (
                      bomData.bom.map((b, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 font-medium text-gray-900 text-gray-700">{b.level}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{b.compCode}</td>
                          <td className="px-4 py-3 text-gray-700">{b.description || '-'}</td>
                          <td className="px-4 py-3 text-gray-700">{b.itemType}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{b.qty}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{b.scrap}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-500">No Bill of Materials found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Route Details / Work Centers</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#F8F9FA] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Seq</th>
                      <th className="px-4 py-3">Op Code</th>
                      <th className="px-4 py-3">Operation Name</th>
                      <th className="px-4 py-3">Inhouse/Subcon</th>
                      <th className="px-4 py-3">Work Center</th>
                      <th className="px-4 py-3">In Item</th>
                      <th className="px-4 py-3">Out Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoadingBom ? (
                      <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">Loading Routes...</td></tr>
                    ) : bomData?.routeFlow?.length ? (
                      bomData.routeFlow.map((r, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 font-medium text-gray-900 text-gray-700">{r.seq}</td>
                          <td className="px-4 py-3 text-gray-600">{r.opCode}</td>
                          <td className="px-4 py-3 text-gray-700">{r.operationName}</td>
                          <td className="px-4 py-3 text-gray-700">{r.inhouseSubcon}</td>
                          <td className="px-4 py-3 text-gray-600">{r.workCenter}</td>
                          <td className="px-4 py-3 text-gray-600">{r.inItem}</td>
                          <td className="px-4 py-3 text-gray-600">{r.outItem}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">No Route Flow found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'Pricing History': {
        const handleExportHistory = () => {
          if (!priceLogData || priceLogData.length === 0) {
            if (onShowToast) onShowToast('No history to export', 'error');
            else alert('No history to export');
            return;
          }
          const getVal = (fields: any, key: string, type: 'old' | 'new') => {
            if (!fields) return '-';
            try {
              const obj = typeof fields === 'string' ? JSON.parse(fields) : fields;
              if (obj[key] && obj[key][type] !== undefined) {
                return obj[key][type];
              }
            } catch (_err) {
              // Fallback to '-' if field is non-JSON formatted text string
            }
            return '-';
          };

          const headers = [
            'Valid From', 'Valid To', 'Customer Name', 'Cust Type', 'Price List', 'Currency',
            'Old Weight', 'New Weight',
            'Old Rate/Kg', 'New Rate/Kg',
            'Old Rejection Cost', 'New Rejection Cost',
            'Old Powder Coating', 'New Powder Coating',
            'Old Special Process', 'New Special Process',
            'Old Machining', 'New Machining',
            'Old Transport Charges', 'New Transport Charges',
            'Old OHP', 'New OHP',
            'Old Packing', 'New Packing',
            'Old Total Working Cost', 'New Total Working Cost',
            'Old Final Price', 'New Final Price',
            'Price Batch Source', 'Updated By', 'Updated On'
          ];
          const rows = priceLogData.map((log: any) => [
            log.fromDate || '-', log.toDate || '-', log.customerName || item.customerName || '-',
            item.exportDomestic || 'Domestic', 'Domestic Price List', 'INR',
            getVal(log.changedFields, 'weight', 'old'), getVal(log.changedFields, 'weight', 'new'),
            log.oldRatePerKg !== undefined ? log.oldRatePerKg : getVal(log.changedFields, 'ratePerKg', 'old'),
            log.newRatePerKg !== undefined ? log.newRatePerKg : getVal(log.changedFields, 'ratePerKg', 'new'),
            getVal(log.changedFields, 'rejectionCost', 'old'), getVal(log.changedFields, 'rejectionCost', 'new'),
            getVal(log.changedFields, 'powderCoating', 'old'), getVal(log.changedFields, 'powderCoating', 'new'),
            getVal(log.changedFields, 'specialProcess', 'old'), getVal(log.changedFields, 'specialProcess', 'new'),
            getVal(log.changedFields, 'process', 'old'), getVal(log.changedFields, 'process', 'new'),
            getVal(log.changedFields, 'transCharges', 'old'), getVal(log.changedFields, 'transCharges', 'new'),
            getVal(log.changedFields, 'ohp', 'old'), getVal(log.changedFields, 'ohp', 'new'),
            getVal(log.changedFields, 'packing', 'old'), getVal(log.changedFields, 'packing', 'new'),
            getVal(log.changedFields, 'totalWorkingCost', 'old'), getVal(log.changedFields, 'totalWorkingCost', 'new'),
            log.oldPrice !== undefined ? log.oldPrice : getVal(log.changedFields, 'finalPrice', 'old'),
            log.newPrice !== undefined ? log.newPrice : getVal(log.changedFields, 'finalPrice', 'new'),
            log.batchNumber || 'Manual Update', log.updatedBy || 'System', log.createdAt ? new Date(log.createdAt).toLocaleDateString() : '-'
          ]);
          const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          ].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `${item.itemCode || 'Item'}_Pricing_History.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        const getChangesStringUI = (fields: any) => {
          if (!fields) return '-';
          try {
            const obj = typeof fields === 'string' ? JSON.parse(fields) : fields;
            const changes = [];
            for (const [key, val] of Object.entries(obj)) {
              changes.push(`${key}: ${(val as any).old} -> ${(val as any).new}`);
            }
            return changes.join(' | ') || '-';
          } catch (e) {
            return '-';
          }
        };

        return (
          <div className="p-6 bg-[#F3F4F6] min-h-full">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800 text-sm">Historical Price Log</h3>
              <Button size="sm" variant="secondary" onClick={handleExportHistory}>Export History</Button>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#F8F9FA] text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-200 whitespace-nowrap">
                    <tr>
                      <th className="px-4 py-3">Valid From</th>
                      <th className="px-4 py-3">Valid To</th>
                      <th className="px-4 py-3">Customer Name</th>
                      <th className="px-4 py-3">Cust Type</th>
                      <th className="px-4 py-3 max-w-[200px]">Changed Fields</th>
                      <th className="px-4 py-3">Currency</th>
                      <th className="px-4 py-3">Price Batch Source</th>
                      <th className="px-4 py-3">Updated By</th>
                      <th className="px-4 py-3">Updated On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoadingPriceLog ? (
                      <tr><td colSpan={9} className="px-4 py-4 text-center text-gray-500">Loading Price History...</td></tr>
                    ) : priceLogData && priceLogData.length > 0 ? (
                      priceLogData.map((log, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{log.fromDate || '-'}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{log.toDate || '-'}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{log.customerName || item.customerName || item.foreignName || '-'}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{item.exportDomestic || 'Domestic'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[200px]" title={getChangesStringUI(log.changedFields)}>{getChangesStringUI(log.changedFields)}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">INR</td>
                          <td className="px-4 py-3 text-gray-600">{log.batchNumber || 'Manual Update'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.updatedBy || 'System'}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={9} className="px-4 py-4 text-center text-gray-500">No Pricing History found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      }
      case 'Weights & Drawings':
        return <WeightsDrawingsTab itemCode={item.itemCode} parentTab={props.parentTab} onShowToast={onShowToast} />;
      default:
        return null;
    }
  };

  return (
    <SlidePanel isOpen={!!item} onClose={onClose}>
      <div className="flex flex-col h-full animate-slide-in">
        {/* Header Section */}
        <div className="px-6 pt-6 pb-2 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Item Detail: <span className="text-[#A02828]">{item.itemCode}</span>
            </h2>
            <div className="flex items-center gap-2">
              {onRemoveMapping && (
                <Button size="sm" variant="danger" onClick={() => onRemoveMapping(item.itemCode)}>
                  🗑️ Remove Mapping
                </Button>
              )}
              {!isAllTab && (
                isEditing ? (
                  <>
                    <Button size="sm" variant="primary" loading={updateMutation.isPending} onClick={handleSave}>
                      💾 Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => {
                    setIsEditing(true);
                    if (!formData.fromDate) {
                      const currentY = new Date().getFullYear();
                      setFormData((prev: any) => ({
                        ...prev,
                        fromDate: `${currentY}-01-01`,
                        toDate: `${currentY}-03-31`
                      }));
                    }
                  }}>
                    ✏️ Edit Item
                  </Button>
                )
              )}
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                <span>✕</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600 mb-6">
            <div>
              <span className="text-gray-400">Description:</span> <span className="font-semibold text-gray-800">{item.description || '-'}</span>
            </div>
            <div>
              <span className="text-gray-400">Casting Code:</span> <span className="font-semibold text-gray-800">{item.castingCode || '-'}</span>
            </div>
            <div>
              <span className="text-gray-400">Grade:</span> <span className="font-semibold text-gray-800">{item.grade || '-'}</span>
            </div>
            <div>
              <span className="text-gray-400">Final Price:</span> <span className="font-semibold text-gray-800">₹ {safeToFixed(totalCost, 2)}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-8 border-b border-transparent">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === tab
                  ? 'text-[#A02828] border-[#A02828]'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {renderTabContent()}
        </div>
      </div>
    </SlidePanel>
  );
};
