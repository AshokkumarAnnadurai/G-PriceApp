import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { ChevronDown,ChevronUp,Save } from 'lucide-react';
import React,{ useMemo,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { itemApi } from '../api/itemApi';
import { pricingApi } from '../api/pricingApi';
import { vendorApi } from '../api/vendorApi';
import { Button,Loader } from '../components/ui';

export const DisputeRegisterPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stateItem = location.state?.item;
  const queryClient = useQueryClient();

  const { data: apiDisputes = [], isLoading } = useQuery({
    queryKey: ['disputes'],
    queryFn: pricingApi.getDisputes,
  });
  const reviseMutation = useMutation({
    mutationFn: (data: { 
      id: string | number; 
      cRate: number; 
      vRate: number; 
      cWeight?: number; 
      vWeight?: number;
      rejectionCost?: number;
      powderCoating?: number;
      specialProcess?: number;
      process?: number;
      transCharges?: number;
      ohp?: number;
      packing?: number;
      itemCode?: string;
      castingCode?: string;
      customerCode?: string;
      customerName?: string;
      vendorId?: string;
      vendorName?: string;
    }) => 
      pricingApi.reviseDispute(
        data.id, 
        data.cRate, 
        data.vRate, 
        data.cWeight, 
        data.vWeight,
        data.rejectionCost,
        data.powderCoating,
        data.specialProcess,
        data.process,
        data.transCharges,
        data.ohp,
        data.packing,
        data.itemCode,
        data.castingCode,
        data.customerCode,
        data.customerName,
        data.vendorId,
        data.vendorName
      ),
    onSuccess: (_, variables) => {
      // Optimistically remove from local query cache so item disappears instantly
      queryClient.setQueryData(['disputes'], (oldData: any[]) => {
        if (!Array.isArray(oldData)) return [];
        return oldData.filter((d: any) => {
          if (d.id && d.id === variables.id) return false;
          if (d.itemCode && variables.itemCode && d.itemCode === variables.itemCode) return false;
          const rawId = d.dbId || d.item_id || d.id;
          let numericId = 0;
          if (typeof rawId === 'number') numericId = rawId;
          else if (typeof rawId === 'string') {
            if (rawId.startsWith('DSP-')) numericId = parseInt(rawId.replace('DSP-', ''), 10);
            else if (d.dbId) numericId = Number(d.dbId);
            else if (!isNaN(Number(rawId))) numericId = parseInt(rawId, 10);
          }
          return numericId !== variables.id;
        });
      });
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.refetchQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['leakage-items'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-approval-filters'] });
      setExpandedRow(null);
      navigate('/item-pricing-approval', {
        state: { toastMessage: 'Item rates revised and approved successfully!', activeTab: 'approved' }
      });
    },
    onError: (err: any) => {
      console.error('Failed to revise dispute:', err);
      alert('Failed to revise dispute: ' + (err.response?.data?.message || err.message || err));
    }
  });
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState(
    location.state?.customerName || location.state?.customer || stateItem?.customerName || ''
  );
  const [pricingMonth, setPricingMonth] = useState<string>(
    location.state?.effectiveMonth || stateItem?.effectiveMonth || String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [pricingYear, setPricingYear] = useState<string>(
    location.state?.effectiveYear || stateItem?.effectiveYear || String(new Date().getFullYear())
  );
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editRates, setEditRates] = useState<any>(null);
  const [_expandedData, setExpandedData] = useState<{ cWeight: number, vWeight: number, cRate: number, vRate: number } | null>(null);
  const [expandedVendors, setExpandedVendors] = useState<any[]>([]);
  const [selectedVendorCode, setSelectedVendorCode] = useState<string | null>(null);
  const [_expandedItemDetail, setExpandedItemDetail] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);

  const handleSelectVendor = (vendor: any) => {
    if (!vendor) return;
    const vCode = vendor.cardcode || vendor.bpCode || vendor.id || vendor.name;
    const vName = vendor.cardname || vendor.name || vendor.bpCode || vendor.id;
    setSelectedVendorCode(vCode);
    const fetchedItem = _expandedItemDetail;
    let m = vendor.materials?.find((mat: any) => {
      const isItemMatch = 
        (mat.itemCode && fetchedItem?.itemCode && mat.itemCode.trim().toLowerCase() === fetchedItem.itemCode.trim().toLowerCase()) ||
        (mat.castingCode && fetchedItem?.castingCode && mat.castingCode.trim().toLowerCase() === fetchedItem.castingCode.trim().toLowerCase());
      return isItemMatch;
    });
    if (!m && vendor.materials?.length > 0) {
      m = vendor.materials[0];
    }
    const matchedWeight = Number(m?.rmWeight || m?.weight || 0);
    const matchedRate = Number(m?.revisedRatePerKg || m?.ratePerKg || m?.baseRatePerKg || 0);

    setEditRates((prev: any) => ({
      ...prev,
      vWeight: matchedWeight > 0 ? matchedWeight : (prev?.vWeight || 0),
      vRate: matchedRate > 0 ? matchedRate : (prev?.vRate || 0),
      vendorId: vCode,
      vendorName: vName
    }));
  };

  const handleReviseSubmit = (d: any) => {
    if (!editRates) return;

    const pcCost = (editRates.powderCoatingWeight && editRates.powderCoatingRate) 
      ? (editRates.powderCoatingWeight * editRates.powderCoatingRate) 
      : (editRates.powderCoating || 0);

    const spCost = (editRates.specialProcessWeight && editRates.specialProcessRate) 
      ? (editRates.specialProcessWeight * editRates.specialProcessRate) 
      : (editRates.specialProcess || 0);

    reviseMutation.mutate({
      id: d.dbId || d.id,
      itemCode: d.itemCode,
      castingCode: d.castingCode,
      customerCode: d.customerCode,
      customerName: d.customer,
      vendorId: editRates.vendorId || d.vendorId || d.vendor_id,
      vendorName: editRates.vendorName || d.vendorName || d.vendor,
      cRate: editRates.cRate,
      vRate: editRates.vRate,
      cWeight: editRates.cWeight,
      vWeight: editRates.vWeight,
      rejectionCost: editRates.rejectionCost,
      powderCoating: pcCost,
      specialProcess: spCost,
      process: editRates.process,
      transCharges: editRates.transCharges,
      ohp: editRates.ohp,
      packing: editRates.packing,
    });
  };

  const toggleExpand = (d: any) => {
    if (expandedRow === d.id) {
      setExpandedRow(null);
      setExpandedVendors([]);
      setSelectedVendorCode(null);
      setExpandedItemDetail(null);
      setIsDetailLoading(false);
    } else {
      // 1. Immediately toggle UI expansion & set initial state for zero-latency response
      setExpandedRow(d.id);
      setIsDetailLoading(true);
      
      let cWeight = Number(d.cWeight || d.weight || 0);
      let vWeight = Number(d.vWeight || 0);
      let cRate = Number(d.cRate || 0);
      let vRate = Number(d.vRate || 0);

      if (!vRate && vWeight > 0 && d.vPrice) {
        vRate = Number(d.vPrice) / vWeight;
      }
      if (!cRate && cWeight > 0 && d.cPrice) {
        cRate = Number(d.cPrice) / cWeight;
      }

      let pcCost = Number(d.powderCoating || 0);
      let pcWeight = Number(d.powderCoatingWeight || 0);
      let pcRate = Number(d.powderCoatingRate || 0);
      if (pcCost > 0) {
        if (pcWeight === 0 && pcRate === 0) {
          pcWeight = cWeight || 1;
          pcRate = pcCost / pcWeight;
        } else if (pcWeight === 0 && pcRate > 0) {
          pcWeight = pcCost / pcRate;
        } else if (pcRate === 0 && pcWeight > 0) {
          pcRate = pcCost / pcWeight;
        }
      }

      let spCost = Number(d.specialProcess || 0);
      let spWeight = Number(d.specialProcessWeight || 0);
      let spRate = Number(d.specialProcessRate || 0);
      if (spCost > 0) {
        if (spWeight === 0 && spRate === 0) {
          spWeight = cWeight || 1;
          spRate = spCost / spWeight;
        } else if (spWeight === 0 && spRate > 0) {
          spWeight = spCost / spRate;
        } else if (spRate === 0 && spWeight > 0) {
          spRate = spCost / spWeight;
        }
      }

      setExpandedData({ cWeight, vWeight, cRate, vRate });
      setEditRates({
        cRate,
        vRate,
        cWeight,
        vWeight,
        rejectionCost: Number(d.rejectionCost || 0),
        powderCoatingWeight: pcWeight,
        powderCoatingRate: pcRate,
        powderCoating: pcCost,
        specialProcessWeight: spWeight,
        specialProcessRate: spRate,
        specialProcess: spCost,
        process: Number(d.process || 0),
        transCharges: Number(d.transCharges || 0),
        ohp: Number(d.ohp || 0),
        packing: Number(d.packing || 0)
      });

      // 2. Fetch full item details & vendor material breakdowns asynchronously in background
      (async () => {
        try {
          const searchParams = { page: 1, limit: 1, search: d.itemCode, customerName: d.customer };
          const pData = await itemApi.listPricing(searchParams);
          const fetchedItem = pData.items?.find((i: any) => i.itemCode === d.itemCode);
          
          if (fetchedItem) {
            setExpandedItemDetail(fetchedItem);
            const itemWeight = Number(fetchedItem.weight || cWeight || 0);
            const itemRate = Number(fetchedItem.ratePerKg || cRate || 0);
            if (itemWeight > 0) cWeight = itemWeight;
            if (itemRate > 0) cRate = itemRate;
            
            const pcCost = Number(fetchedItem.powderCoating ?? d.powderCoating ?? 0);
            let pcWeight = (fetchedItem.powderCoatingWeight !== undefined && fetchedItem.powderCoatingWeight !== null && Number(fetchedItem.powderCoatingWeight) > 0)
              ? Number(fetchedItem.powderCoatingWeight) 
              : ((d.powderCoatingWeight !== undefined && d.powderCoatingWeight !== null && Number(d.powderCoatingWeight) > 0)
                  ? Number(d.powderCoatingWeight)
                  : (fetchedItem.powderCoatingRate > 0 && pcCost > 0 
                      ? pcCost / Number(fetchedItem.powderCoatingRate) 
                      : (pcCost > 0 && itemWeight > 0 ? itemWeight : 0)));

            let pcRate = (fetchedItem.powderCoatingRate !== undefined && fetchedItem.powderCoatingRate !== null && Number(fetchedItem.powderCoatingRate) > 0)
              ? Number(fetchedItem.powderCoatingRate)
              : ((d.powderCoatingRate !== undefined && d.powderCoatingRate !== null && Number(d.powderCoatingRate) > 0)
                  ? Number(d.powderCoatingRate)
                  : (pcCost > 0 && pcWeight > 0 ? pcCost / pcWeight : 0));

            const spCost = Number(fetchedItem.specialProcess ?? d.specialProcess ?? 0);
            let spWeight = (fetchedItem.specialProcessWeight !== undefined && fetchedItem.specialProcessWeight !== null && Number(fetchedItem.specialProcessWeight) > 0)
              ? Number(fetchedItem.specialProcessWeight) 
              : ((d.specialProcessWeight !== undefined && d.specialProcessWeight !== null && Number(d.specialProcessWeight) > 0)
                  ? Number(d.specialProcessWeight)
                  : (fetchedItem.specialProcessRate > 0 && spCost > 0 
                      ? spCost / Number(fetchedItem.specialProcessRate) 
                      : (spCost > 0 && itemWeight > 0 ? itemWeight : 0)));

            let spRate = (fetchedItem.specialProcessRate !== undefined && fetchedItem.specialProcessRate !== null && Number(fetchedItem.specialProcessRate) > 0)
              ? Number(fetchedItem.specialProcessRate)
              : ((d.specialProcessRate !== undefined && d.specialProcessRate !== null && Number(d.specialProcessRate) > 0)
                  ? Number(d.specialProcessRate)
                  : (spCost > 0 && spWeight > 0 ? spCost / spWeight : 0));

            setEditRates((prev: any) => ({
              ...prev,
              cWeight: cWeight,
              cRate: cRate,
              rejectionCost: Number(fetchedItem.rejectionCost || 0),
              powderCoatingWeight: pcWeight,
              powderCoatingRate: pcRate,
              powderCoating: pcCost,
              specialProcessWeight: spWeight,
              specialProcessRate: spRate,
              specialProcess: spCost,
              process: Number(fetchedItem.process || 0),
              transCharges: Number(fetchedItem.transCharges || 0),
              ohp: Number(fetchedItem.ohp || 0),
              packing: Number(fetchedItem.packing || 0)
            }));

            const vendorCodes = (fetchedItem.vendorId || fetchedItem.LastVendorCode)
              ? String(fetchedItem.vendorId || fetchedItem.LastVendorCode).split(',').map((c: string) => c.trim()).filter(Boolean)
              : [];
              
            const currentPricingDate = `${pricingYear}-${pricingMonth}`;

            if (vendorCodes.length > 0) {
              const loadedVendors = await Promise.all(
                vendorCodes.map(async (code) => {
                  try {
                    const vendor = await vendorApi.getOne(code, currentPricingDate);
                    let m = vendor.materials?.find((mat: any) => {
                      const isItemMatch = 
                        (mat.itemCode && fetchedItem.itemCode && mat.itemCode.trim().toLowerCase() === fetchedItem.itemCode.trim().toLowerCase()) ||
                        (mat.castingCode && fetchedItem.castingCode && mat.castingCode.trim().toLowerCase() === fetchedItem.castingCode.trim().toLowerCase()) ||
                        (mat.itemCode && fetchedItem.itemCode && mat.itemCode.trim().toLowerCase().replace(/-rm$/i, '') === fetchedItem.itemCode.trim().toLowerCase().replace(/-rm$/i, ''));
                      return isItemMatch && Number(mat.revisedRatePerKg || mat.ratePerKg || 0) > 0;
                    });
                    
                    if (!m) {
                      m = vendor.materials?.find((mat: any) => {
                        const isItemMatch = 
                          (mat.itemCode && fetchedItem.itemCode && mat.itemCode.trim().toLowerCase() === fetchedItem.itemCode.trim().toLowerCase()) ||
                          (mat.castingCode && fetchedItem.castingCode && mat.castingCode.trim().toLowerCase() === fetchedItem.castingCode.trim().toLowerCase()) ||
                          (mat.itemCode && fetchedItem.itemCode && (
                            mat.itemCode.trim().toLowerCase().includes(fetchedItem.itemCode.trim().toLowerCase()) ||
                            fetchedItem.itemCode.trim().toLowerCase().includes(mat.itemCode.trim().toLowerCase())
                          )) ||
                          (mat.castingCode && fetchedItem.itemCode && (
                            mat.castingCode.trim().toLowerCase().includes(fetchedItem.itemCode.trim().toLowerCase()) ||
                            fetchedItem.itemCode.trim().toLowerCase().includes(mat.castingCode.trim().toLowerCase())
                          )) ||
                          (mat.itemCode && fetchedItem.itemCode && (
                            mat.itemCode.trim().toLowerCase().replace(/-rm$/i, '') === fetchedItem.itemCode.trim().toLowerCase().replace(/-rm$/i, '')
                          ));
                        return isItemMatch;
                      });
                    }
                    
                    if (m) {
                      const matchedWeight = Number(m.rmWeight || (m as any).weight || 0);
                      const matchedRate = Number(m.revisedRatePerKg || (m as any).ratePerKg || (m as any).baseRatePerKg || 0);
                      if (matchedWeight > 0) vWeight = matchedWeight;
                      if (matchedRate > 0) vRate = matchedRate;
                      setEditRates((prev: any) => ({
                        ...prev,
                        vWeight: prev?.vWeight || vWeight,
                        vRate: prev?.vRate || vRate
                      }));
                      return { ...vendor, materials: [m] };
                    }
                    return null;
                  } catch (e) {
                    return null;
                  }
                })
              );
              const validVendors: any[] = loadedVendors.filter(Boolean);
              setExpandedVendors(validVendors);
              if (validVendors.length > 0) {
                const firstV = validVendors[0];
                const firstVCode = firstV?.cardcode || firstV?.bpCode || firstV?.id || firstV?.name || '';
                const firstVName = firstV?.cardname || firstV?.name || firstV?.bpCode || firstV?.id || '';
                setSelectedVendorCode(firstVCode);
                setEditRates((prev: any) => ({
                  ...prev,
                  vendorId: prev?.vendorId || firstVCode,
                  vendorName: prev?.vendorName || firstVName
                }));
              }
            } else {
              setExpandedVendors([]);
              setSelectedVendorCode(null);
            }
          }
        } catch(e) {
          console.error('Failed to fetch item details', e);
        } finally {
          setIsDetailLoading(false);
        }
      })();
    }
  };

  // Parse difference numeric value from string (e.g., "₹120.00" -> 120)
  const getNumericDiff = (diffStr: string) => {
    const clean = diffStr.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  // Helper to parse dates in DD/MM/YYYY, YYYY-MM-DD, or ISO formats safely
  const parseFlexibleDate = (val: any): Date | null => {
    if (!val || val === '?' || val === 'null' || val === 'undefined') return null;
    const str = String(val).trim();
    if (!str) return null;

    // DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(str)) {
      const parts = str.split(/[\/\-]/);
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }

    // YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(str)) {
      const parts = str.split(/[\/\-]/);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }

    // YYYYMMDD
    if (/^\d{8}$/.test(str)) {
      const year = parseInt(str.substring(0, 4), 10);
      const month = parseInt(str.substring(4, 6), 10) - 1;
      const day = parseInt(str.substring(6, 8), 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // Sort and filter disputes by leakage (descending order)
  const orderedDisputes = useMemo(() => {
    const filtered = apiDisputes.filter(d => {
      // 1. Search filter
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.itemCode && d.itemCode.toLowerCase().includes(q)) ||
        (d.castingCode && d.castingCode.toLowerCase().includes(q));

      // 2. Customer filter
      const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const custF = cleanStr(customerFilter);
      const itemCust = cleanStr(d.customer);
      const itemCustCode = cleanStr(d.customerCode || d.customer_code);
      const matchesCustomer = !custF || itemCust.includes(custF) || (itemCustCode && itemCustCode === custF);
      
      // 3. Date range filter
      let matchesDate = true;
      const targetYear = parseInt(pricingYear, 10);
      const targetMonth = parseInt(pricingMonth, 10);

      const fStart = parseFlexibleDate(d.fromDate);
      const fEnd = parseFlexibleDate(d.toDate);

      if (fStart || fEnd) {
        const targetStart = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0);
        const targetEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        const start = fStart || new Date(2000, 0, 1);
        const end = fEnd || new Date(2099, 11, 31);

        matchesDate = (start <= targetEnd && end >= targetStart);
      }
      // Note: If user explicitly searched for an item code or navigated from an item dispute, bypass date range filtering only if customer filter matches or isn't set!
      const isExplicitItemMatch = Boolean(
        (q && (d.itemCode?.toLowerCase().includes(q) || d.castingCode?.toLowerCase().includes(q))) ||
        (stateItem && (d.itemCode === stateItem.item_code || d.itemCode === stateItem.itemCode))
      );

      return matchesSearch && matchesCustomer && (matchesDate || isExplicitItemMatch);
    });

    // Sort by highest leakage (difference) first
    return [...filtered].sort((a, b) => getNumericDiff(b.difference) - getNumericDiff(a.difference));
  }, [apiDisputes, search, customerFilter, pricingMonth, pricingYear]);

  // Statistics
  const stats = useMemo(() => {
    let totalLeakage = 0;
    let highLeakageCount = 0;
    const customerMap: Record<string, number> = {};

    apiDisputes.forEach(d => {
      const diff = getNumericDiff(d.difference);
      totalLeakage += diff;
      if (diff > 50) highLeakageCount++;
      customerMap[d.customer] = (customerMap[d.customer] || 0) + diff;
    });

    let topCustomer = 'None';
    let maxCustLeakage = 0;
    Object.entries(customerMap).forEach(([cust, val]) => {
      if (val > maxCustLeakage) {
        maxCustLeakage = val;
        topCustomer = cust;
      }
    });

    return { totalLeakage, highLeakageCount, topCustomer };
  }, [apiDisputes]);

  const uniqueCustomers = useMemo(() => {
    return Array.from(new Set(apiDisputes.map(d => d.customer))).sort();
  }, [apiDisputes]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 z-10 shrink-0">
        <div className="px-8 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-wide uppercase flex items-center gap-2">
              <span className="w-2.5 h-6 bg-[#A02828] rounded-full inline-block"></span>
              Dispute Register
            </h1>
            <p className="text-xs text-gray-500 mt-1">Leakage dashboard showing unapproved pricing gaps ordered by highest leakage priority.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
              High Priority Order
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto min-h-0 flex flex-col space-y-6">
        
        {/* KPI Dashboard cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Leakage Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full z-0 opacity-50"></div>
            <div className="z-10">
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Total Est. Leakage</span>
              <h2 className="text-3xl font-extrabold text-red-600 mt-2">
                ₹{stats.totalLeakage.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="mt-4 text-xs text-gray-400 font-semibold z-10">Cumulative unresolved price delta</div>
          </div>

          {/* High Gaps Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Critical Gaps (&gt; ₹50)</span>
              <h2 className="text-3xl font-extrabold text-orange-600 mt-2">
                {stats.highLeakageCount} <span className="text-xs text-gray-400 font-semibold">items</span>
              </h2>
            </div>
            <div className="mt-4 text-xs text-gray-400 font-semibold">Requires immediate customer escalation</div>
          </div>

          {/* Worst Affected Customer Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Worst Affected Partner</span>
              <h2 className="text-xl font-extrabold text-gray-900 mt-3 truncate" title={stats.topCustomer}>
                {stats.topCustomer}
              </h2>
            </div>
            <div className="mt-4 text-xs text-gray-400 font-semibold">Accounts for highest share of leakage</div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-4 shadow-sm shrink-0">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search Items</label>
            <input
              type="text"
              placeholder="Search code, casting..."
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 w-60"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filter Customer</label>
            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white w-60"
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
            >
              <option value="">All Customers</option>
              {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Month</label>
            <select
              value={pricingMonth}
              onChange={(e) => setPricingMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white w-32"
            >
              {[
                ['01','January'],['02','February'],['03','March'],['04','April'],
                ['05','May'],['06','June'],['07','July'],['08','August'],
                ['09','September'],['10','October'],['11','November'],['12','December']
              ].map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Year</label>
            <select
              value={pricingYear}
              onChange={(e) => setPricingYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white w-24"
            >
              {[2024, 2025, 2026, 2027].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="self-end">
            {(search || customerFilter) && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 border-transparent font-bold h-[34px]"
                onClick={() => {
                  setSearch('');
                  setCustomerFilter('');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>

        {/* Disputes Ordered List */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Leakage Priority Queue ({orderedDisputes.length} items)
          </h3>

          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 shadow-sm">
              Loading disputes register...
            </div>
          ) : orderedDisputes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 shadow-sm">
              No disputes found. Select a customer or adjust filters to view items.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orderedDisputes.map((d, index) => {
                const diffVal = getNumericDiff(d.difference);
                const isHigh = diffVal > 50;
                const isMedium = diffVal <= 50 && diffVal > 10;

                return (
                  <div 
                    key={`${d.id}-${d.itemCode || ''}-${d.castingCode || ''}-${d.customerCode || d.customer || ''}`} 
                    className={`bg-white rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md relative overflow-hidden ${
                      isHigh ? 'border-l-4 border-l-red-500' : isMedium ? 'border-l-4 border-l-orange-500' : 'border-l-4 border-l-blue-500'
                    }`}
                  >
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer" onClick={() => toggleExpand(d)}>
                      {/* Rank Badge */}
                      <div className="absolute top-2 left-2 text-[10px] font-extrabold text-gray-300">
                        #{index + 1}
                      </div>
  
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#A02828] bg-red-50 px-2 py-0.5 rounded border border-red-100">
                            {d.id}
                          </span>
                          <span className="text-xs font-bold text-gray-500 font-mono">
                            {d.itemCode}
                          </span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                            Casting Code: {d.castingCode}
                          </span>
                          <span className="text-xs font-bold text-gray-500 font-semibold">
                            Raw Material
                          </span>
                          {isHigh ? (
                            <span className="text-[10px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase">
                              High Leakage
                            </span>
                          ) : isMedium ? (
                            <span className="text-[10px] font-extrabold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded uppercase">
                              Medium Leakage
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase">
                              Low Leakage
                            </span>
                          )}
                        </div>
  
                        <h4 className="text-sm font-bold text-gray-900">{d.itemDescription}</h4>
  
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-1">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Item Code</span>
                            <span className="text-xs font-semibold text-gray-700 font-mono">{d.itemCode}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block truncate max-w-[200px]" title={d.vendorName}>
                              VENDOR {d.vendorName ? `(${d.vendorName})` : 'MASTER'}
                            </span>
                            <span className="text-xs font-semibold text-gray-800">{d.updatedValue}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block truncate max-w-[200px]" title={d.customer}>
                              CUSTOMER {d.customer ? `(${d.customer})` : 'MASTER'}
                            </span>
                            <span className="text-xs font-semibold text-gray-800">{d.custApprovedValue}</span>
                          </div>
                        </div>
                      </div>
  
                      {/* Leakage Value Pill */}
                      <div className="flex items-center justify-end border-t md:border-t-0 pt-3 md:pt-0 gap-4 border-gray-100 min-w-[200px]">
                        <div className="text-right">
                          <span className={`text-xl font-extrabold ${isHigh ? 'text-red-600' : isMedium ? 'text-orange-600' : 'text-blue-600'}`}>
                            {d.difference}
                          </span>
                        </div>
                        {expandedRow === d.id ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                      </div>
                    </div>
                    
                    {expandedRow === d.id && editRates && (() => {
                      const castingPriceCust = (editRates.cWeight || 0) * (editRates.cRate || 0);
                      const castingPriceVend = (editRates.vWeight || 0) * (editRates.vRate || 0);
                      const totalWorkingCost = 
                        (editRates.rejectionCost || 0) + 
                        (editRates.powderCoating || 0) + 
                        (editRates.specialProcess || 0) + 
                        (editRates.process || 0) + 
                        (editRates.transCharges || 0) + 
                        (editRates.ohp || 0) + 
                        (editRates.packing || 0);
                      const finalPrice = castingPriceCust + totalWorkingCost;

                      return (
                        <div className="bg-gray-50 p-5 border-t border-gray-200 cursor-default" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-gray-900">Revise Pricing Parameters & Master Rates</h4>
                            {isDetailLoading && (
                              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 animate-pulse flex items-center gap-1.5">
                                <Loader size="sm" /> Loading parameters from Master...
                              </span>
                            )}
                          </div>
                          {isDetailLoading ? (
                            <div className="p-8 text-center bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col items-center justify-center gap-2">
                              <Loader size="md" />
                              <span className="text-xs font-semibold text-gray-500">Fetching pricing parameters...</span>
                            </div>
                          ) : (
                          <>
                          {expandedVendors.length > 0 && (
                            <div className="mb-4 bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
                              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                  🏢 Mapped Vendors for Raw Material ({expandedVendors.length})
                                </span>
                                <span className="text-[11px] text-gray-500 font-medium">Select vendor to inspect and update its specific master rate</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {expandedVendors.map((v: any) => {
                                  const vCode = v?.cardcode || v?.bpCode || v?.id || v?.name || '';
                                  const vName = v?.cardname || v?.name || v?.bpCode || v?.id || '';
                                  const isSelected = selectedVendorCode === vCode || (editRates?.vendorId && editRates.vendorId === vCode);
                                  const mat = v?.materials?.[0];
                                  const rateVal = Number(mat?.revisedRatePerKg || mat?.ratePerKg || mat?.baseRatePerKg || 0);

                                  return (
                                    <button
                                      key={vCode}
                                      type="button"
                                      onClick={() => handleSelectVendor(v)}
                                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-2 ${
                                        isSelected
                                          ? 'bg-[#A02828] text-white border-[#A02828] shadow-sm ring-2 ring-red-200'
                                          : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400'
                                      }`}
                                    >
                                      <span>{vName}</span>
                                      {vCode && <span className={`font-mono text-[10px] ${isSelected ? 'text-red-100' : 'text-gray-500'}`}>({vCode})</span>}
                                      {rateVal > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                                          ₹{rateVal.toFixed(2)}/kg
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left font-bold text-gray-600 text-xs uppercase tracking-wider">Parameter</th>
                                  <th className="px-4 py-3 text-right font-bold text-gray-600 text-xs uppercase tracking-wider border-x border-gray-200 w-1/4">
                                    {editRates?.vendorName 
                                      ? `VENDOR (${editRates.vendorName.toUpperCase()})` 
                                      : (d.vendorName ? `VENDOR (${d.vendorName.toUpperCase()})` : 'VENDOR MASTER')}
                                  </th>
                                  <th className="px-4 py-3 text-right font-bold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 w-1/4">
                                    {d.customer ? `CUSTOMER (${d.customer.toUpperCase()})` : 'CUSTOMER MASTER'}
                                  </th>
                                  <th className="px-4 py-3 text-right font-bold text-gray-600 text-xs uppercase tracking-wider w-1/5">Delta (Diff)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {/* Casting Weight */}
                                <tr>
                                  <td className="px-4 py-2.5 font-semibold text-gray-900">Casting Weight (kg)</td>
                                  <td className="px-4 py-2.5 text-right border-x border-gray-200 bg-yellow-50/20">
                                    <input 
                                      type="number" 
                                      className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                      value={editRates.vWeight ?? 0}
                                      onChange={(e) => setEditRates({ ...editRates, vWeight: parseFloat(e.target.value) || 0 })}
                                      step="0.01"
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                    <input 
                                      type="number" 
                                      className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                      value={editRates.cWeight ?? 0}
                                      onChange={(e) => setEditRates({ ...editRates, cWeight: parseFloat(e.target.value) || 0 })}
                                      step="0.01"
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-700 bg-gray-50">
                                    {((editRates.cWeight || 0) - (editRates.vWeight || 0)).toFixed(2)} kg
                                  </td>
                                </tr>

                                {/* Casting Rate */}
                                <tr>
                                  <td className="px-4 py-2.5 font-semibold text-gray-900">Casting Rate (per kg)</td>
                                  <td className="px-4 py-2.5 text-right border-x border-gray-200 bg-yellow-50/20">
                                    <div className="flex justify-end items-center gap-1">
                                      <span className="text-gray-400 font-mono text-xs">₹</span>
                                      <input 
                                        type="number" 
                                        className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                        value={editRates.vRate ?? 0}
                                        onChange={(e) => setEditRates({ ...editRates, vRate: parseFloat(e.target.value) || 0 })}
                                        step="0.01"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                    <div className="flex justify-end items-center gap-1">
                                      <span className="text-gray-400 font-mono text-xs">₹</span>
                                      <input 
                                        type="number" 
                                        className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                        value={editRates.cRate ?? 0}
                                        onChange={(e) => setEditRates({ ...editRates, cRate: parseFloat(e.target.value) || 0 })}
                                        step="0.01"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold" style={{ color: ((editRates.cRate || 0) - (editRates.vRate || 0)) < 0 ? '#DC2626' : ((editRates.cRate || 0) - (editRates.vRate || 0)) > 0 ? '#16A34A' : '#6B7280' }}>
                                    ₹{((editRates.cRate || 0) - (editRates.vRate || 0)).toFixed(2)}
                                  </td>
                                </tr>

                                {/* Casting Price (Calculated) */}
                                <tr>
                                  <td className="px-4 py-2.5 font-bold text-gray-900 bg-gray-50">Casting Price (Wt × Rate)</td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-800 border-x border-gray-200 bg-gray-50">
                                    ₹{castingPriceVend.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-800 border-r border-gray-200 bg-gray-50">
                                    ₹{castingPriceCust.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold bg-gray-50" style={{ color: (castingPriceCust - castingPriceVend) < 0 ? '#DC2626' : (castingPriceCust - castingPriceVend) > 0 ? '#16A34A' : '#6B7280' }}>
                                    ₹{(castingPriceCust - castingPriceVend).toFixed(2)}
                                  </td>
                                </tr>

                                 {/* Rejection Cost */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-semibold text-gray-900">Rejection Cost</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                     <div className="flex justify-end items-center gap-1">
                                       <span className="text-gray-400 font-mono text-xs">₹</span>
                                       <input 
                                         type="number" 
                                         className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                         value={editRates.rejectionCost ?? 0}
                                         onChange={(e) => setEditRates({ ...editRates, rejectionCost: parseFloat(e.target.value) || 0 })}
                                         step="0.01"
                                       />
                                     </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Powder Coating Wt(Kg) */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-semibold text-gray-900">Powder Coating Wt(Kg)</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                     <div className="flex justify-end items-center gap-1">
                                       <input 
                                         type="number" 
                                         className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                         value={editRates.powderCoatingWeight ?? 0}
                                         onChange={(e) => {
                                           const w = parseFloat(e.target.value) || 0;
                                           const cost = w * (editRates.powderCoatingRate || 0);
                                           setEditRates({ ...editRates, powderCoatingWeight: w, powderCoating: cost });
                                         }}
                                         step="0.0001"
                                       />
                                       <span className="text-gray-500 text-xs">kg</span>
                                     </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Powder Coating Rate/kg */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-semibold text-gray-900">Powder Coating Rate/kg</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                     <div className="flex justify-end items-center gap-1">
                                       <span className="text-gray-400 font-mono text-xs">₹</span>
                                       <input 
                                         type="number" 
                                         className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                         value={editRates.powderCoatingRate ?? 0}
                                         onChange={(e) => {
                                           const r = parseFloat(e.target.value) || 0;
                                           const cost = (editRates.powderCoatingWeight || 0) * r;
                                           setEditRates({ ...editRates, powderCoatingRate: r, powderCoating: cost });
                                         }}
                                         step="0.0001"
                                       />
                                     </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Powder Coating Price */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-bold text-gray-900 bg-gray-50">Powder Coating Price</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-800 border-r border-gray-200 bg-gray-50">
                                     ₹{((editRates.powderCoatingWeight || 0) * (editRates.powderCoatingRate || 0) || editRates.powderCoating || 0).toFixed(2)}
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Special Process Wt(Kg) */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-semibold text-gray-900">Special Process Wt(Kg)</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                     <div className="flex justify-end items-center gap-1">
                                       <input 
                                         type="number" 
                                         className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                         value={editRates.specialProcessWeight ?? 0}
                                         onChange={(e) => {
                                           const w = parseFloat(e.target.value) || 0;
                                           const cost = w * (editRates.specialProcessRate || 0);
                                           setEditRates({ ...editRates, specialProcessWeight: w, specialProcess: cost });
                                         }}
                                         step="0.0001"
                                       />
                                       <span className="text-gray-500 text-xs">kg</span>
                                     </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Special Process Rate/kg */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-semibold text-gray-900">Special Process Rate/kg</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                     <div className="flex justify-end items-center gap-1">
                                       <span className="text-gray-400 font-mono text-xs">₹</span>
                                       <input 
                                         type="number" 
                                         className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                         value={editRates.specialProcessRate ?? 0}
                                         onChange={(e) => {
                                           const r = parseFloat(e.target.value) || 0;
                                           const cost = (editRates.specialProcessWeight || 0) * r;
                                           setEditRates({ ...editRates, specialProcessRate: r, specialProcess: cost });
                                         }}
                                         step="0.0001"
                                       />
                                     </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Special Process Price */}
                                 <tr>
                                   <td className="px-4 py-2.5 font-bold text-gray-900 bg-gray-50">Special Process Price</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-gray-800 border-r border-gray-200 bg-gray-50">
                                     ₹{((editRates.specialProcessWeight || 0) * (editRates.specialProcessRate || 0) || editRates.specialProcess || 0).toFixed(2)}
                                   </td>
                                   <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                 </tr>

                                 {/* Other Operational Costs */}
                                 {[
                                   { label: 'Process (Machining+others)', key: 'process' },
                                   { label: 'Trans Charges', key: 'transCharges' },
                                   { label: 'OHP', key: 'ohp' },
                                   { label: 'Packing', key: 'packing' },
                                 ].map(({ label, key }) => (
                                   <tr key={key}>
                                     <td className="px-4 py-2.5 font-semibold text-gray-900">{label}</td>
                                     <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 border-x border-gray-200 bg-gray-50/50">—</td>
                                     <td className="px-4 py-2.5 text-right border-r border-gray-200 bg-yellow-50/20">
                                       <div className="flex justify-end items-center gap-1">
                                         <span className="text-gray-400 font-mono text-xs">₹</span>
                                         <input 
                                           type="number" 
                                           className="w-28 text-right px-2 py-1 text-xs font-mono font-bold text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#A02828] bg-white" 
                                           value={(editRates as any)[key] ?? 0}
                                           onChange={(e) => setEditRates({ ...editRates, [key]: parseFloat(e.target.value) || 0 })}
                                           step="0.01"
                                         />
                                       </div>
                                     </td>
                                     <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 bg-gray-50/50">—</td>
                                   </tr>
                                 ))}

                                 {/* Total Working Cost */}
                                 <tr className="bg-gray-100/70 border-t-2 border-gray-300">
                                   <td className="px-4 py-3 font-extrabold text-gray-900">Total Working Cost</td>
                                   <td className="px-4 py-3 text-right font-mono text-xs text-gray-400 border-x border-gray-200">—</td>
                                   <td className="px-4 py-3 text-right font-mono text-sm font-extrabold text-gray-900 border-r border-gray-200">
                                     ₹{totalWorkingCost.toFixed(2)}
                                   </td>
                                   <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">—</td>
                                 </tr>

                                 {/* Final Price */}
                                 <tr className="bg-green-50 border-t border-green-200">
                                   <td className="px-4 py-3 font-extrabold text-green-900">Final Price</td>
                                   <td className="px-4 py-3 text-right font-mono text-xs text-gray-400 border-x border-gray-200">—</td>
                                   <td className="px-4 py-3 text-right font-mono text-sm font-extrabold text-green-900 border-r border-gray-200">
                                     ₹{finalPrice.toFixed(2)}
                                   </td>
                                   <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">—</td>
                                 </tr>
                              </tbody>
                            </table>
                          </div>
                          </>
                          )}
                          
                          <div className="mt-4 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setExpandedRow(null)} disabled={reviseMutation.isPending}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={() => handleReviseSubmit(d)}
                              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 border-transparent font-bold"
                            >
                              {reviseMutation.isPending ? 'Saving...' : <><Save size={16} /> Save & Re-submit</>}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DisputeRegisterPage;


