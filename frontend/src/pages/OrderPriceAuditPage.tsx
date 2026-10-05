import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useMemo,useState } from 'react';
import { pricingApi } from '../api/pricingApi';
import { Badge,Button,Card,Loader,SlidePanel } from '../components/ui';
import { BRAND } from '../constants';
import { PAGE_TITLES } from '../constants/pageHeaders';

interface AuditItem {
  docEntry: string;
  lineNum: string;
  orderNumber: string;
  orderDate: string;
  partnerCode: string;
  partnerName: string;
  itemCode: string;
  castingCode: string;
  description: string;
  orderPrice: number;
  quantity: number;
  masterPrice: number;
  rmWeight: number;
  ratePerKg: number;
  variance: number;
  totalLeakage: number;
  isVerified: boolean;
  // Splits for details panel
  mmrSplit: number;
  coating: number;
  consumables: number;
  extraFactor: number;
  machining: number;
  subcon: number;
  overhead: number;
  packing: number;
  rejection: number;
}





interface GroupedOrder {
  orderNumber: string;
  orderDate: string;
  partnerCode: string;
  partnerName: string;
  items: AuditItem[];
  totalLeakage: number;
  hasMismatch: boolean;
  isAllVerified: boolean;
}

export default function OrderPriceAuditPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'PO' | 'SO'>('PO');
  const [search, setSearch] = useState('');
  const [showVerified, _setShowVerified] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AuditItem | null>(null);
  const [expandedOrderNumbers, setExpandedOrderNumbers] = useState<Record<string, boolean>>({});
  // Fallback state for SO mock data
  const [toast, setToast] = useState<string | null>(null);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fetch PO Data from Backend ──
  const { data: poItems = [], isLoading: isLoadingPO } = useQuery<any[]>({
    queryKey: ['po-audit'],
    queryFn: () => pricingApi.getPoPriceAudit(),
    enabled: activeTab === 'PO',
  });

  // Adapter to map backend PO payload to local AuditItem structure
  const adaptedPoItems = useMemo<AuditItem[]>(() => {
    return poItems.map(item => ({
      docEntry: String(item.doc_entry),
      lineNum: String(item.line_num),
      orderNumber: item.po_number,
      orderDate: item.po_date,
      partnerCode: item.vendor_code,
      partnerName: item.vendor_name,
      itemCode: item.item_code,
      castingCode: item.item_code,
      description: item.description,
      orderPrice: Number(item.po_price),
      quantity: Number(item.quantity),
      masterPrice: Number(item.master_price),
      rmWeight: Number(item.rm_weight),
      ratePerKg: Number(item.rate_per_kg),
      variance: Number(item.variance),
      totalLeakage: Number(item.total_leakage),
      isVerified: !!item.is_verified,
      mmrSplit: Number(item.mmr_split || 0),
      coating: Number(item.coating || 0),
      consumables: Number(item.consumables || 0),
      extraFactor: Number(item.extra_factor || 0),
      machining: 0,
      subcon: 0,
      overhead: 0,
      packing: 0,
      rejection: 0,
    }));
  }, [poItems]);

  // ── Fetch SO Data from Backend ──
  const { data: soItemsData = [], isLoading: isLoadingSO } = useQuery<any[]>({
    queryKey: ['so-audit'],
    queryFn: () => pricingApi.getSoPriceAudit(),
    enabled: activeTab === 'SO',
  });

  // Adapter to map backend SO payload to local AuditItem structure
  const adaptedSoItems = useMemo<AuditItem[]>(() => {
    return soItemsData.map(item => ({
      docEntry: String(item.doc_entry),
      lineNum: String(item.line_num),
      orderNumber: item.so_number,
      orderDate: item.so_date,
      partnerCode: item.customer_code,
      partnerName: item.customer_name,
      itemCode: item.item_code,
      castingCode: item.item_code,
      description: item.description,
      orderPrice: Number(item.so_price),
      quantity: Number(item.quantity),
      masterPrice: Number(item.master_price),
      rmWeight: 0,
      ratePerKg: 0,
      variance: Number(item.variance),
      totalLeakage: Number(item.total_leakage),
      isVerified: !!item.is_verified,
      mmrSplit: 0,
      coating: 0,
      consumables: 0,
      extraFactor: 0,
      machining: 0,
      subcon: 0,
      overhead: 0,
      packing: 0,
      rejection: 0,
    }));
  }, [soItemsData]);

  const activeItems = activeTab === 'PO' ? adaptedPoItems : adaptedSoItems;

  // ── Mutation to Verify PO Mismatch ──
  const verifyMutation = useMutation({
    mutationFn: (item: AuditItem) => pricingApi.verifyPoLine(item.docEntry, item.lineNum, activeTab),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ['po-audit'] });
      // Update locally if selected item matches
      if (selectedItem?.docEntry === item.docEntry && selectedItem?.lineNum === item.lineNum) {
        setSelectedItem(prev => prev ? { ...prev, isVerified: true } : null);
      }
      showToastMsg('Line price deviation verified successfully!');
    },
    onError: (err: any) => {
      showToastMsg(`Failed to verify: ${err.message || 'Error'}`);
    }
  });

  // ── Toggle Verification ──
  
  // ── Stats Calculations ──
  const stats = useMemo(() => {
    const uniqueOrders = new Set(activeItems.map(i => i.orderNumber));
    const mismatches = activeItems.filter(i => !i.isVerified && i.variance !== 0);
    const totalLeakage = mismatches.reduce((acc, curr) => acc + Math.abs(curr.totalLeakage), 0);

    const activeGroups = new Map<string, AuditItem[]>();
    activeItems.forEach(item => {
      if (!activeGroups.has(item.orderNumber)) {
        activeGroups.set(item.orderNumber, []);
      }
      activeGroups.get(item.orderNumber)!.push(item);
    });

    let mismatchOrdersCount = 0;
    activeGroups.forEach(items => {
      const activeMismatches = items.filter(i => !i.isVerified && i.variance !== 0);
      if (activeMismatches.length > 0) {
        mismatchOrdersCount++;
      }
    });

    return {
      totalCount: uniqueOrders.size,
      mismatchCount: mismatchOrdersCount,
      totalLeakage,
    };
  }, [activeItems]);

  // ── Filtered Data ──
  const filteredItems = useMemo(() => {
    return activeItems.filter(item => {
      const matchesSearch = 
        item.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        item.partnerName.toLowerCase().includes(search.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());

      const matchesVerification = showVerified ? true : !item.isVerified;

      return matchesSearch && matchesVerification;
    });
  }, [activeItems, search, showVerified]);

  // Group filtered items by Order Number for expandable row logic
  const groupedOrders = useMemo<GroupedOrder[]>(() => {
    const groupsMap = new Map<string, AuditItem[]>();
    filteredItems.forEach(item => {
      if (!groupsMap.has(item.orderNumber)) {
        groupsMap.set(item.orderNumber, []);
      }
      groupsMap.get(item.orderNumber)!.push(item);
    });

    const list: GroupedOrder[] = [];
    groupsMap.forEach((items, orderNumber) => {
      const first = items[0];
      const totalLeakage = items.reduce((acc, curr) => acc + Math.abs(curr.totalLeakage), 0);
      const hasMismatch = items.some(i => i.variance !== 0);
      const isAllVerified = items.every(i => i.isVerified);

      list.push({
        orderNumber,
        orderDate: first.orderDate,
        partnerCode: first.partnerCode,
        partnerName: first.partnerName,
        items,
        totalLeakage,
        hasMismatch,
        isAllVerified,
      });
    });

    return list.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [filteredItems]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 z-10 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">
                {PAGE_TITLES.ORDER_PRICE_AUDIT}
              </h1>
              <span className="text-sm text-gray-500 font-medium hidden lg:inline">(Live audit dashboard)</span>
            </div>

            {/* Sliding Pill Tab bar */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 border shadow-sm" style={{ borderColor: BRAND.BORDER }}>
              <button
                onClick={() => { setActiveTab('PO'); setSearch(''); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'PO' 
                    ? 'bg-red-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                PO Audit (Purchasing)
              </button>
              <button
                onClick={() => { setActiveTab('SO'); setSearch(''); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'SO' 
                    ? 'bg-red-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                SO Audit (Sales)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <svg 
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} 
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search order number, item, vendor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-[280px] h-[38px] pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-gray-50"
                style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 flex-1 min-h-0 flex flex-col gap-6 overflow-y-auto">
        


        {/* Stats Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Total Orders Audited</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-gray-900">{stats.totalCount}</span>
              <Badge label="Active" color="#3b82f6" />
            </div>
          </Card>
          
          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Price Mismatches</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-[#dc2626]">{stats.mismatchCount}</span>
              <Badge label="Alerts" color="#dc2626" />
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Total Price Leakage</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-amber-600">₹{stats.totalLeakage.toLocaleString()}</span>
              <Badge label="Leakage" color="#d97706" />
            </div>
          </Card>
        </div>

        {/* DataTable Card */}
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <table className="w-full min-w-[1100px] text-sm border-collapse relative">
              <thead className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[48px]"></th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Order No / Date</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">{activeTab === 'PO' ? 'Vendor' : 'Customer'}</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Mismatched Items</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Total Value Deviation</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {((activeTab === 'PO' && isLoadingPO) || (activeTab === 'SO' && isLoadingSO)) ? (
                  <tr>
                    <td colSpan={6} className="py-20">
                      <div className="flex justify-center items-center">
                        <Loader size="md" />
                      </div>
                    </td>
                  </tr>
                ) : groupedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20 text-gray-500 font-medium">
                      No price mismatches found matching your search.
                    </td>
                  </tr>
                ) : (
                  groupedOrders.map((order) => {
                    const isExpanded = !!expandedOrderNumbers[order.orderNumber];
                    return (
                      <React.Fragment key={order.orderNumber}>
                        <tr 
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedOrderNumbers(prev => ({ ...prev, [order.orderNumber]: !prev[order.orderNumber] }))}
                          style={{
                            background: isExpanded ? '#fef2f2' : 'white',
                          }}
                        >
                          <td className="px-5 py-4 whitespace-nowrap text-center">
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
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="font-semibold text-gray-900">{order.orderNumber}</div>
                            <div className="text-xs text-gray-500">{new Date(order.orderDate).toLocaleDateString()}</div>
                          </td>
                          <td className="px-5 py-4 max-w-xs truncate">
                            <div className="font-semibold text-gray-900 truncate" title={order.partnerName}>
                              {order.partnerName}
                            </div>
                            <div className="text-xs text-gray-500">{order.partnerCode}</div>
                          </td>
                          <td className="px-5 py-4 text-center whitespace-nowrap">
                            <div className="font-semibold text-gray-700">{order.items.length} line item(s)</div>
                          </td>
                          <td className="px-5 py-4 text-right font-black text-amber-600 whitespace-nowrap">
                            ₹{order.totalLeakage.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-center whitespace-nowrap">
                            {order.isAllVerified ? (
                              <Badge label="Verified Exceptions" color="#16a34a" />
                            ) : (
                              <Badge label="Price Mismatch" color="#dc2626" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-gray-50/50 px-8 py-4">
                              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Row</th>
                                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Item Details</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Quantity</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Order Price</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Master Price</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Variance</th>
                                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total Diff</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {order.items.map(subItem => (
                                      <tr 
                                        key={subItem.lineNum} 
                                        className="hover:bg-gray-50/70 cursor-pointer"
                                        onClick={() => setSelectedItem(subItem)}
                                      >
                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-500">
                                          Row {Number(subItem.lineNum) + 1}
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="font-semibold text-gray-900">{subItem.itemCode}</div>
                                          <div className="text-xs text-gray-500 truncate max-w-[220px]" title={subItem.description}>
                                            {subItem.description}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-700">
                                          {subItem.quantity}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                                          ₹{subItem.orderPrice.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                                          ₹{subItem.masterPrice.toFixed(2)}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${subItem.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          ₹{subItem.variance.toFixed(2)}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${subItem.totalLeakage < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          ₹{Math.abs(subItem.totalLeakage).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* SlidePanel Detailed Breakdowns */}
      <SlidePanel isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} width="w-2/5 max-w-xl">
        {selectedItem && (
          <div className="h-full flex flex-col bg-white">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Audit Detail Inspection</h3>
                <span className="text-xs text-gray-500">Order Ref: {selectedItem.orderNumber}</span>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-2xl"
              >
                ×
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {/* Order summary info */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border">
                <div>
                  <span className="block text-xs text-gray-500 font-medium">Order Number</span>
                  <span className="font-bold text-gray-900">{selectedItem.orderNumber}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 font-medium">Row Number (SAP)</span>
                  <span className="font-bold text-gray-900">Row {Number(selectedItem.lineNum) + 1}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 font-medium">Order Date</span>
                  <span className="font-semibold text-gray-900">{new Date(selectedItem.orderDate).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 font-medium">Partner / Account</span>
                  <span className="font-bold text-gray-900 truncate block">{selectedItem.partnerName}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-500 font-medium">Item Code</span>
                  <span className="font-semibold text-gray-900">{selectedItem.itemCode}</span>
                </div>
              </div>

              {/* Price Audit Comparison Detail */}
              <div>
                <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-3">Price Audit Breakdown</h4>
                <div className="border rounded-xl overflow-hidden divide-y">
                  <div className="flex justify-between p-3.5 bg-gray-50/50">
                    <span className="text-sm text-gray-600 font-medium">Quantity Ordered</span>
                    <span className="text-sm font-bold text-gray-900">{selectedItem.quantity} units</span>
                  </div>
                  <div className="flex justify-between p-3.5">
                    <span className="text-sm text-gray-600 font-medium">Transactional Order Rate</span>
                    <span className="text-sm font-bold text-gray-900">₹{selectedItem.orderPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-3.5">
                    <span className="text-sm text-gray-600 font-medium">Pricing Master Active Rate</span>
                    <span className="text-sm font-bold text-gray-900">₹{selectedItem.masterPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-3.5 bg-red-50/20">
                    <span className="text-sm text-red-700 font-bold">Variance Per Unit</span>
                    <span className={`text-sm font-black ${selectedItem.variance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ₹{selectedItem.variance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3.5 bg-red-50/40">
                    <span className="text-sm text-red-700 font-black">Estimated Value Leakage</span>
                    <span className={`text-sm font-black ${selectedItem.totalLeakage < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ₹{Math.abs(selectedItem.totalLeakage).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Master Pricing Splits Breakdown */}
              <div>
                <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-3">Master Price Calculation Splits</h4>
                <div className="border rounded-xl p-4 bg-gray-50/30 space-y-3.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Raw Material Weight</span>
                    <span className="font-semibold text-gray-900">{selectedItem.rmWeight.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Casting Rate Per Kg</span>
                    <span className="font-semibold text-gray-900">₹{selectedItem.ratePerKg.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">MMR Split (Change)</span>
                    <span className="font-semibold text-gray-900">+₹{selectedItem.mmrSplit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Coating / Coating Change</span>
                    <span className="font-semibold text-gray-900">+₹{selectedItem.coating.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Consumables Split</span>
                    <span className="font-semibold text-gray-900">+₹{selectedItem.consumables.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Extra Factor</span>
                    <span className="font-semibold text-gray-900">+₹{selectedItem.extraFactor.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Machining / Process Charge</span>
                    <span className="font-semibold text-gray-900">₹{selectedItem.machining.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Subcon Fee / Hardening</span>
                    <span className="font-semibold text-gray-900">₹{selectedItem.subcon.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Rejection / Scrap Allowance</span>
                    <span className="font-semibold text-gray-900">₹{selectedItem.rejection.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Drawer Footer Actions */}
            <div className="px-6 py-4 border-t flex justify-end bg-gray-50">
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>
                Close Panel
              </Button>
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 animate-fade-in border"
          style={{
            backgroundColor: '#10B981',
            borderColor: '#059669',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          }}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
