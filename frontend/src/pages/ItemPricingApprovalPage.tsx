import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useEffect,useMemo,useRef,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { itemApi } from '../api/itemApi';
import { pricingApi } from '../api/pricingApi';
import { Button,Loader } from '../components/ui';
import { BRAND } from '../constants';

// SAP Status Cell Component
const SapStatusCell: React.FC<{ itemCode: string; vendorId?: string; customerName?: string; statusLabel: string; statusType: string; sapStatus?: any; setErrorModal: any }> = ({
  itemCode,
  vendorId,
  customerName,
  statusLabel,
  statusType,
  sapStatus,
  setErrorModal
}) => {
  const [pushDate, setPushDate] = useState<string | null>(null);
  const cardCode = vendorId || customerName;
  const type = vendorId ? 'vendor' : 'customer';

  useEffect(() => {
    if (cardCode && type) {
      pricingApi.getLatestPushDate(itemCode, cardCode, type)
        .then(data => {
          if (data?.pushedAt) {
            const date = new Date(data.pushedAt);
            setPushDate(date.toLocaleDateString() + ' ' + date.toLocaleTimeString());
          }
        })
        .catch(() => {});
    }
  }, [itemCode, cardCode, type]);

  const statusColor = statusType === 'exact' ? 'text-green-600' : statusType === 'patch' ? 'text-yellow-600' : statusType === 'failure' ? 'text-red-600' : 'text-gray-600';

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`${statusColor} cursor-pointer hover:underline`}
        onClick={(e) => {
          e.stopPropagation();
          if (sapStatus?.vendorError || sapStatus?.customerError) {
            setErrorModal({
              isOpen: true,
              itemCode: itemCode,
              code: sapStatus?.vendorError ? vendorId : customerName,
              type: sapStatus?.vendorError ? 'vendor' : 'customer',
              error: sapStatus?.vendorError || sapStatus?.customerError || ''
            });
          }
        }}
      >
        {statusLabel}
      </span>
      {pushDate && (
        <span className="text-xs text-gray-500">{pushDate}</span>
      )}
    </div>
  );
};

export const ItemPricingApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // ── Filters & Pagination State ──────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pricingMonth, setPricingMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [pricingYear, setPricingYear] = useState<string>(String(new Date().getFullYear()));
  const [pricingDay, setPricingDay] = useState<string>('1');
  // Derived date for filtering validity (YYYY-MM-DD)
  const pricingDate = `${pricingYear}-${pricingMonth}`;
  const effectiveDate = new Date(`${pricingYear}-${pricingMonth}-${String(pricingDay).padStart(2, '0')}T00:00:00Z`);
  const [_page] = useState(1);
    // ── Tab State ─────────────────────────────────────────────────────────────
  // ── Tab State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [selectedCategory, setSelectedCategory] = useState<'Domestic' | 'Export' | 'Labour / Job Work' | 'Pin & Bush'>('Domestic');
  // Local map of items actioned this session (before server refresh)
  const [actionedItems, setActionedItems] = useState<Map<string, 'approved' | 'disputed'>>(new Map());
  // Multi-select state for bulk approval / dispute
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionType: 'approve' | 'dispute';
    onConfirm: () => void;
  } | null>(null);

  // ── Details Expansion State ─────────────────────────────────────────────────
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [expandedItemDetail, setExpandedItemDetail] = useState<any | null>(null);
  const [_selectedVendorCode, setSelectedVendorCode] = useState<string | null>(null);
  const [_vendorDetail, setVendorDetail] = useState<any | null>(null);
  const [expandedVendors, setExpandedVendors] = useState<any[]>([]);
  const [weightDrawings, setWeightDrawings] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const pushedItemsRef = useRef<any[]>([]);

  // Memoized filtered vendors by effective date
  const filteredExpandedVendors = useMemo(() => {
    return expandedVendors;
  }, [expandedVendors]);

  // SAP Push state
  const [sapPushModal, setSapPushModal] = useState<{
    isOpen: boolean;
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
    details: any;
    itemsInProgress?: Array<{ itemCode: string; cardCode: string; action: 'POST' | 'PATCH' | 'SKIP' }>;
  }>({ isOpen: false, status: 'idle', message: '', details: null, itemsInProgress: [] });

  // SAP existence check state
  const [sapExistence, setSapExistence] = useState<Map<string, any>>(new Map());
  const [_isCheckingExistence, setIsCheckingExistence] = useState(false);
  const isCheckingRef = useRef(false);
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    itemCode: string;
    code: string;
    type: 'vendor' | 'customer';
    error: string;
  } | null>(null);

  // SAP sync status from sap_sync_log
  const [syncStatus, setSyncStatus] = useState<Map<string, any>>(new Map());

  // SAP Push Mutation
  const sapPushMutation = useMutation({
    mutationFn: () => {
      // Convert sapExistence Map to array for API, filtering out SKIP items
      const existenceData = Array.from(sapExistence.entries())
        .map(([key, value]) => ({
          key,
          ...value
        }))
        .filter((item: any) => {
          // Skip items that have action='SKIP' for both customer and vendor
          const bothSkip = item.customerAction === 'SKIP' && item.vendorAction === 'SKIP';
          return !bothSkip;
        });

      // Build list of items in progress
      const itemsInProgress: Array<{ itemCode: string; cardCode: string; action: 'POST' | 'PATCH' | 'SKIP' }> = [];

      existenceData.forEach((item: any) => {
        if (item.vendorCode && item.vendorAction !== 'SKIP') {
          itemsInProgress.push({
            itemCode: item.itemCode,
            cardCode: item.vendorCode,
            action: item.vendorAction
          });
        }
        if (item.customerName && item.customerAction !== 'SKIP') {
          itemsInProgress.push({
            itemCode: item.itemCode,
            cardCode: item.customerName,
            action: item.customerAction
          });
        }
      });

      // Show loading modal with items
      pushedItemsRef.current = itemsInProgress; // Save for later recheck
      setSapPushModal({
        isOpen: true,
        status: 'loading',
        message: `Pushing ${itemsInProgress.length} items to SAP...`,
        details: null,
        itemsInProgress
      });

      return pricingApi.pushApprovedItemsToSap({
        customerName: selectedCustomer?.value,
        vendorId: selectedVendor?.code,
        itemCode: selectedItem?.value,
        searchQuery: searchQuery || undefined,
        date: pricingDate || undefined,
        sapExistenceData: existenceData,
        vendorsData: sourceItems
      });
    },
    onSuccess: (data: any) => {
      const summary = data?.summary || { total: 0, succeeded: 0, failed: 0 };
      setSapPushModal({
        isOpen: true,
        status: 'success',
        message: `Successfully pushed to SAP! ${summary.succeeded} succeeded, ${summary.failed} failed. Rechecking...`,
        details: summary,
        itemsInProgress: pushedItemsRef.current
      });

      // Recheck SAP existence for pushed items to verify data now matches
      setTimeout(async () => {
        console.log('[RECHECK] Starting recheck, pushedItemsRef.current:', pushedItemsRef.current);
        try {
          const formatDateForCheck = (dateStr: string) => {
            if (!dateStr) return '';
            return dateStr.split('T')[0];
          };

          const itemsToCheck: any[] = [];
          console.log('[RECHECK] pushedItemsRef.current length:', pushedItemsRef.current?.length);

          // Build items to check using EXACT pushed items (itemCode + cardCode)
          pushedItemsRef.current.forEach((item: any) => {
            // Find the exact source item that matches both itemCode AND cardCode
            const sourceItem = sourceItems.find((si: any) =>
              si.item_code === item.itemCode && si.customer_code === item.cardCode
            );

            if (sourceItem) {
              // This is a customer row - check as customer
              itemsToCheck.push({
                itemCode: item.itemCode,
                customerName: item.cardCode,
                finalPrice: Number(sourceItem.final_price),
                validFrom: formatDateForCheck(sourceItem.valid_from),
                validTo: formatDateForCheck(sourceItem.valid_through)
              });

              // Also check all vendors for this customer
              let vendors = sourceItem.vendors;
              if (typeof vendors === 'string') {
                try {
                  vendors = JSON.parse(vendors);
                } catch {
                  vendors = [];
                }
              }
              if (Array.isArray(vendors)) {
                vendors.forEach((vendor: any) => {
                  itemsToCheck.push({
                    itemCode: item.itemCode,
                    vendorCode: vendor.id,
                    castingPrice: Number(vendor.revised_price || 0),
                    validFrom: formatDateForCheck(vendor.valid_from),
                    validTo: formatDateForCheck(vendor.valid_through)
                  });
                });
              }
            } else {
              // Try to find as vendor (cardCode might be a vendor code)
              const vendorItem = sourceItems.find((si: any) => {
                let vendors = si.vendors;
                if (typeof vendors === 'string') {
                  try {
                    vendors = JSON.parse(vendors);
                  } catch {
                    vendors = [];
                  }
                }
                return si.item_code === item.itemCode &&
                       Array.isArray(vendors) &&
                       vendors.some((v: any) => v.id === item.cardCode);
              });

              if (vendorItem) {
                let vendorList = vendorItem.vendors;
                if (typeof vendorList === 'string') {
                  try {
                    vendorList = JSON.parse(vendorList);
                  } catch {
                    vendorList = [];
                  }
                }
                if (Array.isArray(vendorList)) {
                  const vendor = vendorList.find((v: any) => v.id === item.cardCode);
                  if (vendor) {
                    itemsToCheck.push({
                      itemCode: item.itemCode,
                      vendorCode: item.cardCode,
                      castingPrice: Number(vendor.revised_price || 0),
                      validFrom: formatDateForCheck(vendor.valid_from),
                      validTo: formatDateForCheck(vendor.valid_through)
                    });
                  }
                }
              }
            }
          });

          console.log('[RECHECK] Items to check:', itemsToCheck);
          if (itemsToCheck.length > 0) {
            console.log('[RECHECK] Calling checkExistenceInSap with', itemsToCheck.length, 'items');
            const result = await pricingApi.checkExistenceInSap(itemsToCheck);
            console.log('[RECHECK] Got result:', result);
            const existenceMap = new Map(sapExistence);
            result.forEach((res: any) => {
              const key = `${res.itemCode}_${res.vendorCode || 'null'}_${res.customerName || 'null'}`;
              existenceMap.set(key, res);
            });
            setSapExistence(existenceMap);
            console.log('[RECHECK] Updated sapExistence map');
          } else {
            console.log('[RECHECK] No items to check');
          }
        } catch (error) {
          console.error('[RECHECK] Failed to recheck SAP after push:', error);
        }
      }, 2000);
    },
    onError: (error: any) => {
      setSapPushModal({
        isOpen: true,
        status: 'error',
        message: `Failed to push to SAP: ${error.response?.data?.message || error.message}`,
        details: null,
        itemsInProgress: []
      });
    }
  });

  // ── Load Mapped Dropdown Data (Linked Filters) ──────────────────────────────
  const { data: filterOptions } = useQuery({
    queryKey: ['pricing-approval-filters', selectedCustomer?.value, selectedVendor?.code],
    queryFn: () => itemApi.getFilterOptions({
      customerName: selectedCustomer?.value || undefined,
      vendorId: selectedVendor?.code || undefined
    })
  });

  const customerOptions = useMemo(() => {
    return (filterOptions?.customers || []).map((name: string) => ({
      value: name,
      label: name
    }));
  }, [filterOptions?.customers]);

  const vendorOptions = useMemo(() => {
    return (filterOptions?.vendors || []).map((v: any) => ({
      value: v.id,
      label: `${v.name} (${v.id})`,
      code: v.id
    }));
  }, [filterOptions?.vendors]);

  const itemOptions = useMemo(() => {
    return (filterOptions?.itemCodes || []).map((code: string) => ({
      value: code,
      label: code
    }));
  }, [filterOptions?.itemCodes]);

  // ── Filter Check ───────────────────────────────────────────────────────────
  
  // ── Load Price Audit Items (Pending) ──────────────────────────────────────────
  const { data: auditItems = [], isLoading, refetch: refetchPending } = useQuery({
    queryKey: [
      'pricing-audit-items',
      selectedCustomer?.value,
      selectedVendor?.code,
      selectedItem?.value,
      pricingMonth,
      pricingYear
    ],
    queryFn: () => pricingApi.getPricingAudit({
      customerCode: selectedCustomer?.value,
      vendorId: selectedVendor?.code,
      itemCode: selectedItem?.value
    }),
    staleTime: 0, // Always stale - trigger background refetch
    gcTime: 10 * 60 * 1000, // Keep cached for 10 min (fast if unused)
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch when reconnecting
    refetchOnMount: 'always' // Refetch on mount/tab switch
  });

  // ── Load Approved Items (all approved items regardless of date) ──────────────────
  const { data: approvedItems = [], isLoading: isLoadingApproved, refetch: refetchApproved } = useQuery({
    queryKey: [
      'pricing-approved-items'
    ],
    queryFn: () => pricingApi.getApprovedAudit(),
    staleTime: 0, // Always stale - trigger background refetch
    gcTime: 10 * 60 * 1000, // Keep cached for 10 min (fast if unused)
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch when reconnecting
    refetchOnMount: 'always' // Refetch on mount/tab switch
  });

  // ── Toast Helper (auto-dismiss after 2 seconds) ────────────────────────────────
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };

  // ── Refresh Handler ────────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchPending(), refetchApproved()]);
      setActionedItems(new Map()); // Clear local state after refetch
      showToast('Data refreshed');
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── Select data based on active tab ────────────────────────────────────────────
  const sourceItems = (activeTab === 'approved' ? approvedItems : auditItems) as any[];
  const isLoadingData = activeTab === 'approved' ? isLoadingApproved : isLoading;

  // Group by item_code for display

  // Apply all filters to audit items
  const items = useMemo(() => {
    if (sourceItems.length > 0) {
      console.log('DEBUG sourceItems[0]:', sourceItems[0]);
    }
    return sourceItems.filter((item: any) => {
      // Parse vendors JSON if it's a string
      let vendors = item.vendors;
      if (typeof vendors === 'string') {
        try {
          vendors = JSON.parse(vendors);
        } catch {
          vendors = [];
        }
      }
      if (!Array.isArray(vendors)) {
        vendors = [];
      }

      // Filter by customer
      if (selectedCustomer) {
        const val = (selectedCustomer.value || '').toString().trim().toLowerCase();
        const code = (item.customer_code || '').toString().trim().toLowerCase();
        const name = (item.customer_name || '').toString().trim().toLowerCase();
        const matchCode = code && code === val;
        const matchName = name && (name === val || name.includes(val) || val.includes(name));
        if (!matchCode && !matchName) {
          return false;
        }
      }

      // Filter by vendor
      if (selectedVendor) {
        // Check if this item+customer pair has the selected vendor
        const hasVendor = vendors.some((v: any) => v.id === selectedVendor.code);
        if (!hasVendor) {
          return false;
        }
      }

      // Filter by item
      if (selectedItem && item.item_code !== selectedItem.value) {
        return false;
      }

      // Filter by search query (item code or description)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesCode = item.item_code && item.item_code.toLowerCase().includes(query);
        const matchesDesc = item.item_description && item.item_description.toLowerCase().includes(query);
        if (!matchesCode && !matchesDesc) {
          return false;
        }
      }

      // Filter by effective date - only for pending items (approved items show all)
      if (activeTab === 'pending') {
        if (!item.valid_from || !item.valid_through) {
          return false;
        }
        const itemValidFrom = new Date(item.valid_from + 'T00:00:00Z');
        const itemValidThrough = new Date(item.valid_through + 'T23:59:59Z');
        if (isNaN(itemValidFrom.getTime()) || isNaN(itemValidThrough.getTime())) {
          return false; // Hide if customer dates are invalid
        }
        if (effectiveDate < itemValidFrom || effectiveDate > itemValidThrough) {
          return false;
        }
      }

      // Check if at least one vendor (115 or 118) has pricing valid on the effective date (pending tab only)
      if (activeTab === 'pending') {
        const hasValidVendor = vendors.some((vendor: any) => {
          if (vendor.groupcode !== '115' && vendor.groupcode !== '118') {
            return false;
          }
          if (!vendor.valid_from || !vendor.valid_through) {
            return false;
          }
          // Parse dates without time component for proper comparison
          const vendorValidFrom = new Date(vendor.valid_from + 'T00:00:00Z');
          const vendorValidThrough = new Date(vendor.valid_through + 'T23:59:59Z');
          if (isNaN(vendorValidFrom.getTime()) || isNaN(vendorValidThrough.getTime())) {
            return false;
          }
          return effectiveDate >= vendorValidFrom && effectiveDate <= vendorValidThrough;
        });
        return hasValidVendor;
      }

      // Approved tab shows all items
      return true;
    }).map((item: any) => {
      let vendors = item.vendors;
      if (typeof vendors === 'string') {
        try {
          vendors = JSON.parse(vendors);
        } catch {
          vendors = [];
        }
      }

      const vendorNames = Array.isArray(vendors)
        ? [...new Set(vendors
            .filter((v: any) => v.groupcode === '115' || v.groupcode === '118')
            .map((v: any) => v.name))]
            .join(', ')
        : '—';

      return {
        ...item,
        vendor_names: vendorNames
      };
    });
  }, [sourceItems, selectedCustomer, selectedVendor, selectedItem, searchQuery, effectiveDate]);

  // Check SAP existence for approved items
  const checkItemsExistenceInSap = async () => {
    if (activeTab !== 'approved' || !sourceItems || sourceItems.length === 0) return;
    if (isCheckingRef.current) return; // Prevent concurrent checks

    isCheckingRef.current = true;
    setIsCheckingExistence(true);
    try {
      const itemsToCheck: any[] = [];

      // Process customer rows and extract vendors from JSON
      sourceItems.forEach((row: any) => {
        if (row.type === 'customer') {
          // Add customer check
          itemsToCheck.push({
            itemCode: row.item_code,
            vendorCode: null,
            customerName: row.customer_code,
            finalPrice: Number(row.final_price),
            validFrom: row.valid_from,
            validTo: row.valid_through
          });

          // Add vendor checks from JSON expansion
          let vendors = row.vendors;
          if (typeof vendors === 'string') {
            try {
              vendors = JSON.parse(vendors);
            } catch {
              vendors = [];
            }
          }
          if (Array.isArray(vendors)) {
            vendors.forEach((vendor: any) => {
              itemsToCheck.push({
                itemCode: row.item_code,
                vendorCode: vendor.id,
                customerName: null,
                castingPrice: Number(vendor.revised_price || 0),
                validFrom: vendor.valid_from,
                validTo: vendor.valid_through
              });
            });
          }
        }
      });

      const result = await pricingApi.checkExistenceInSap(itemsToCheck);

      const existenceMap = new Map();
      result.forEach((res: any) => {
        const key = `${res.itemCode}_${res.vendorCode || 'null'}_${res.customerName || 'null'}`;
        existenceMap.set(key, res);
      });

      setSapExistence(existenceMap);
    } catch (error) {
      console.error('Failed to check SAP existence:', error);
    } finally {
      setIsCheckingExistence(false);
      isCheckingRef.current = false;
    }
  };

  const getSapExistenceStatus = (item: any): any => {
    const key = `${item.item_code}_${item.vendor_id || 'null'}_${item.customer_code || 'null'}`;
    const status = sapExistence.get(key);

    if (!status) return <span className="text-gray-500">Checking...</span>;

    // Build tooltip with customer + all vendors for this item
    const tooltipLines: string[] = [];

    // Find the customer for this item (match both item_code and customer_code)
    const customerRow = sourceItems.find((row: any) => row.item_code === item.item_code && row.customer_code === item.customer_code);
    if (customerRow) {
      const customerKey = `${item.item_code}_null_${customerRow.customer_code}`;
      const customerStatus = sapExistence.get(customerKey);
      const customerExists = customerStatus?.existsInSapCustomer ?? false;
      tooltipLines.push(`Customer (${customerRow.customer_code}) - ${customerExists ? 'Yes' : 'No'}`);
    }

    // Get vendors from this customer row's expansion (vendors JSON)
    let vendors = customerRow?.vendors;
    if (typeof vendors === 'string') {
      try {
        vendors = JSON.parse(vendors);
      } catch {
        vendors = [];
      }
    }
    if (!Array.isArray(vendors)) {
      vendors = [];
    }

    vendors.forEach((vendor: any) => {
      const vendorKey = `${item.item_code}_${vendor.id}_null`;
      const vendorStatus = sapExistence.get(vendorKey);
      const vendorExists = vendorStatus?.existsInSapVendor ?? false;
      tooltipLines.push(`Vendor (${vendor.id}) - ${vendorExists ? 'Yes' : 'No'}`);
    });

    const tooltip = tooltipLines.join('\n');

    // Overall: Show "Yes" only if customer AND all vendors exist
    const customerExists = customerRow ? (sapExistence.get(`${item.item_code}_null_${customerRow.customer_code}`)?.existsInSapCustomer ?? false) : true;
    const allVendorsExist = vendors.length === 0 || vendors.every((v: any) => sapExistence.get(`${item.item_code}_${v.id}_null`)?.existsInSapVendor ?? false);
    const allExist = customerExists && allVendorsExist;

    return (
      <span className="relative group font-semibold cursor-help inline-block">
        {allExist ? <span className="text-green-600">✓ Yes</span> : <span className="text-red-600">✗ No</span>}
        <div className="absolute left-0 top-full mt-1 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal w-max max-w-xs">
          {tooltipLines.map((line, idx) => (
            <div key={idx} className="text-left">{line}</div>
          ))}
        </div>
      </span>
    );
  };

  const getSapSyncStatus = (item: any): { label: string; type: 'exact' | 'patch' | 'success' | 'failure' | 'none' } => {
    const customerRow = sourceItems.find((row: any) => row.item_code === item.item_code && row.customer_code === item.customer_code);

    if (!customerRow) {
      return { label: '—', type: 'none' };
    }

    const key = `${item.item_code}_${customerRow.customer_code}`;
    const lastSync = syncStatus.get(key);

    if (!lastSync) {
      return { label: '—', type: 'none' };
    }

    if (!lastSync.success) {
      return { label: '✗ Failed', type: 'failure' };
    }

    if (lastSync.action === 'POST') {
      return { label: '✓ Posted', type: 'success' };
    }

    if (lastSync.action === 'PATCH') {
      return { label: '◇ Patched', type: 'patch' };
    }

    return { label: '—', type: 'none' };
  };

  const getSapDataMatchStatus = (item: any): any => {
    // Check if still checking existence
    if (_isCheckingExistence) {
      return <span className="text-gray-500">Checking...</span>;
    }

    // Check customer + vendors for this item + customer combination
    const customerRow = sourceItems.find((row: any) => row.item_code === item.item_code && row.customer_code === item.customer_code);

    // Get vendors from this customer row's expansion
    let vendors = customerRow?.vendors;
    if (typeof vendors === 'string') {
      try {
        vendors = JSON.parse(vendors);
      } catch {
        vendors = [];
      }
    }
    if (!Array.isArray(vendors)) {
      vendors = [];
    }

    const tooltipLines: string[] = [];
    let allDataMatch = true;
    let isChecked = false;

    // Check customer data match
    if (customerRow) {
      const customerKey = `${item.item_code}_null_${customerRow.customer_code}`;
      const customerStatus = sapExistence.get(customerKey);
      const customerExists = customerStatus?.existsInSapCustomer ?? false;
      const customerDataMatch = customerStatus?.customerDataMatches ?? false;

      if (customerStatus) isChecked = true;

      if (!customerExists) {
        tooltipLines.push(`Customer (${customerRow.customer_code}) - Not in SAP`);
        allDataMatch = false;
      } else {
        tooltipLines.push(`Customer (${customerRow.customer_code}) - ${customerDataMatch ? 'Match' : 'Mismatch'}`);
        if (!customerDataMatch) allDataMatch = false;
      }
    }

    // Check vendor data matches
    for (const vendor of vendors) {
      const vendorKey = `${item.item_code}_${vendor.id}_null`;
      const vendorStatus = sapExistence.get(vendorKey);
      const vendorExists = vendorStatus?.existsInSapVendor ?? false;
      const vendorDataMatch = vendorStatus?.vendorDataMatches ?? false;

      if (vendorStatus) isChecked = true;

      if (!vendorExists) {
        tooltipLines.push(`Vendor (${vendor.id}) - Not in SAP`);
        allDataMatch = false;
      } else {
        tooltipLines.push(`Vendor (${vendor.id}) - ${vendorDataMatch ? 'Match' : 'Mismatch'}`);
        if (!vendorDataMatch) allDataMatch = false;
      }
    }

    // If no check has been done yet, show Checking...
    if (!isChecked) {
      return <span className="text-gray-500">Checking...</span>;
    }

    const tooltip = tooltipLines.join('\n');

    return (
      <span title={tooltip} className="font-semibold">
        {allDataMatch ? <span className="text-green-600">✓ Yes</span> : <span className="text-red-600">✗ No</span>}
      </span>
    );
  };

  // Check SAP existence when approved items load
  useEffect(() => {
    if (activeTab === 'approved' && sourceItems.length > 0) {
      checkItemsExistenceInSap();
    }
  }, [activeTab, sourceItems]);

  // Load SAP sync status for approved items
  useEffect(() => {
    const loadSyncStatus = async () => {
      if (activeTab === 'approved' && sourceItems.length > 0) {
        try {
          const logs = await pricingApi.getSyncStatus();
          const statusMap = new Map();
          logs.forEach((log: any) => {
            const key = `${log.item_code}_${log.card_code}`;
            if (!statusMap.has(key) || new Date(log.pushed_at) > new Date(statusMap.get(key).pushed_at)) {
              statusMap.set(key, log);
            }
          });
          setSyncStatus(statusMap);
        } catch (err) {
          console.error('Failed to load sync status:', err);
        }
      }
    };
    loadSyncStatus();
  }, [activeTab, sourceItems]);

  // Toast notification & active tab navigation auto-dismiss effect
  useEffect(() => {
    if (location.state?.toastMessage) {
      showToast(location.state.toastMessage);
    }
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
    if (location.state?.toastMessage || location.state?.activeTab) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Reset expanded keys and local session actioned items on filter / tab changes
  useEffect(() => {
    setExpandedRowKey(null);
    setActionedItems(new Map());
  }, [selectedCustomer, selectedVendor, selectedItem, searchQuery, pricingMonth, pricingYear, pricingDay, activeTab]);

  // Clear filters when switching to approved tab (approved items show all regardless of pending filters)
  useEffect(() => {
    if (activeTab === 'approved') {
      setSelectedCustomer(null);
      setSelectedVendor(null);
      setSelectedItem(null);
      setSearchQuery('');
    }
  }, [activeTab]);

  // Set inner table details loading state when pricingDate changes
  useEffect(() => {
    if (expandedRowKey) {
      setIsLoadingDetails(true);
    }
  }, [pricingDate]);

  // Re-fetch item detail only when pricingDate changes
  useEffect(() => {
    if (expandedRowKey && !isLoadingData) {
      const [itemCode, customerCode] = expandedRowKey.split('_');
      const itemObj = sourceItems.find((i: any) => i.item_code === itemCode && i.customer_code === customerCode);
      if (itemObj) {
        handleToggleExpand(itemObj, true);
      } else {
        setExpandedRowKey(null);
        setExpandedItemDetail(null);
        setVendorDetail(null);
        setExpandedVendors([]);
        setIsLoadingDetails(false);
      }
    }
  }, [pricingDate, isLoadingData]);

  // Helper to resolve the correct tab group name for API lookup
  const getItemCategory = (item: any): string => {
    // Use category from API response if available
    if (item.category) return item.category;

    // Fallback to deriving from item properties
    if (item.boughtOutJobWork === 'Job Work' || item.itemGroup === 'Labour / Job Work') return 'Labour / Job Work';
    if (item.itemGroup === 'Pin & Bush' || (item.exportDomestic && item.exportDomestic.toLowerCase().includes('pin'))) return 'Pin & Bush';
    if (item.exportDomestic && item.exportDomestic.trim().toLowerCase() === 'export') return 'Export';
    return 'Domestic';
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {
      'Domestic': [],
      'Export': [],
      'Labour / Job Work': [],
      'Pin & Bush': []
    };
    items.forEach((item: any) => {
      const itemKey = `${item.item_code}_${item.customer_code}`;
      if (activeTab !== 'approved' && actionedItems.get(itemKey) === 'approved') return;
      if (activeTab === 'pending' && actionedItems.get(itemKey) === 'disputed') return;

      const cat = getItemCategory(item);
      if (groups[cat]) {
        groups[cat].push(item);
      } else {
        groups[cat] = [item];
      }
    });
    return groups;
  }, [items, actionedItems, activeTab]);

  // ── Fetch Item & Vendor pricing detail upon expanding row ───────────────────
  const handleToggleExpand = async (item: any, forceRefresh = false) => {
    const key = `${item.item_code}_${item.customer_code}`;
    if (expandedRowKey === key && !forceRefresh) {
      setExpandedRowKey(null);
      setExpandedItemDetail(null);
      setVendorDetail(null);
      setExpandedVendors([]);
      setSelectedVendorCode(null);
      setWeightDrawings([]);
      return;
    }

    setExpandedRowKey(key);
    setIsLoadingDetails(true);
    if (!forceRefresh) {
      setExpandedItemDetail(null);
      setVendorDetail(null);
      setExpandedVendors([]);
      setWeightDrawings([]);
    }

    try {
      // Extract vendor IDs from already-filtered list (deduplicate)
      let vendorIds: string[] = [];
      if (item.vendors) {
        try {
          const vendors = typeof item.vendors === 'string' ? JSON.parse(item.vendors) : item.vendors;
          if (Array.isArray(vendors)) {
            vendorIds = [...new Set(vendors.map((v: any) => v.id))]; // Deduplicate
          }
        } catch {
          vendorIds = [];
        }
      }

      // Fetch detailed pricing info using pre-filtered vendors
      const details = await pricingApi.getItemPricingDetails(item.item_code, item.customer_code, activeTab, vendorIds);
      setExpandedItemDetail({
        ...details.customer,
        item_code: details.itemCode,
        casting_code: details.castingCode,
        itemCode: details.itemCode,
        castingCode: details.castingCode,
      });
      let vendors = details.vendors;
      if (typeof vendors === 'string') {
        try {
          vendors = JSON.parse(vendors);
        } catch {
          vendors = [];
        }
      }
      if (!Array.isArray(vendors)) {
        vendors = [];
      }

      setExpandedVendors(vendors.filter((v: any, idx: number, arr: any[]) => {
        // Remove duplicates by checking if this is the first occurrence of this vendor_id
        return arr.findIndex(vendor => vendor.id === v.id) === idx;
      }));

      if (vendors && vendors.length > 0) {
        setSelectedVendorCode(vendors[0].id);
        setVendorDetail(vendors[0]);
      }

      // Fetch customer master weight drawings
      try {
        const drawings = await itemApi.getWeightDrawings(item.item_code);
        setWeightDrawings(drawings || []);
      } catch (e) {
        console.error('Failed to load item weight drawings:', e);
        setWeightDrawings([]);
      }
    } catch (err) {
      console.error('Failed to load pricing details:', err);
      setExpandedItemDetail(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Helper to retrieve verified weight from drawings (average of non-zero weights, or falls back to customer drawing average)
  
  // Helper formatting styles
  const formatCurrency = (val: number | string) => {
    if (val === null || val === undefined || val === '') return '—';
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return typeof val === 'string' ? val : '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getProfitLossStatus = (item: any) => {
    const custPrice = Number(item.finalPrice || item.ratePerKg || 0);
    if (!custPrice) return 'neutral';

    const hasRmCost = item.vendorRmCost != null && Number(item.vendorRmCost) > 0;
    const hasProcessCost = item.vendorProcessCost != null && Number(item.vendorProcessCost) > 0;

    if (!hasRmCost && !hasProcessCost) {
      return 'neutral';
    }

    let rmProfit = true;
    if (hasRmCost) {
      const custCastingPrice = Number(item.weight || 0) * Number(item.ratePerKg || 0);
      const vendCastingPrice = Number(item.vendorRmCost);
      rmProfit = custCastingPrice >= vendCastingPrice;
    }

    let processProfit = true;
    if (hasProcessCost) {
      const custProcessCost = Number(item.process || 0);
      const vendProcessCost = Number(item.vendorProcessCost);
      processProfit = custProcessCost >= vendProcessCost;
    }

    if (rmProfit && processProfit) {
      return 'profit';
    } else {
      return 'loss';
    }
  };

  
  const renderDifference = (custVal: number, vendVal: number, mode: boolean | string = true) => {
    const c = Number(custVal || 0);
    const v = Number(vendVal || 0);
    if (c === 0 && v === 0) {
      return <span className="text-gray-400">—</span>;
    }
    if (Math.abs(c - v) < 0.01) {
      return <span className="text-green-600 font-bold">Match</span>;
    }
    const diff = c - v;
    let formatted = '';
    if (mode === 'kg') {
      formatted = `${Math.abs(diff).toFixed(2)} kg`;
    } else if (mode === true) {
      formatted = formatCurrency(Math.abs(diff));
    } else {
      formatted = Math.abs(diff).toFixed(2);
    }
    if (diff > 0) {
      return <span className="text-orange-500 font-bold">+{formatted}</span>;
    } else {
      return <span className="text-red-600 font-bold">-{formatted}</span>;
    }
  };

  const appendActionsColumn = (cols: any[]) => {
    if (!selectedCustomer) return cols;
    return [
      ...cols,
      {
        header: 'Status',
        className: 'px-6 py-4 text-center whitespace-nowrap',
        render: (item: any) => {
          const itemKey = `${item.item_code}_${item.customer_code}`;
          const localAction = actionedItems.get(itemKey);
          const serverStatus = item.approvalStatus;

          // If server status is pending/resubmitted/dispute_raised or not approved_master, show action buttons
          // dispute_raised items in the Pending tab should still allow Approve/Dispute actions
          const effectiveStatus = localAction === 'approved'
            ? 'approved'
            : localAction === 'disputed'
              ? 'disputed'
              : serverStatus === 'approved_master'
                ? 'approved'
                : null; // null = show Approve + Dispute buttons

          if (effectiveStatus === 'approved') {
            return (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                ✔ Approved
              </span>
            );
          }
          if (effectiveStatus === 'disputed') {
            return (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                ⚠ Disputed
              </span>
            );
          }

          // Approved tab: read-only, only show badge
          if (activeTab === 'approved') {
            return (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                ✔ Approved
              </span>
            );
          }

          return (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded text-xs"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await pricingApi.approveItemFromMaster({
                      itemCode: item.item_code,
                      customerCode: item.customer_code,
                      customerName: item.customer_code,
                      castingCode: item.casting_code,
                      approvalDate: effectiveDate.toISOString().split('T')[0],
                      fromDate: item.fromDate,
                      toDate: item.toDate
                    });
                    setActionedItems(prev => new Map(prev).set(itemKey, 'approved'));
                    setSelectedRowKeys(new Set());
                    setActiveTab('approved');
                    // Wait for trigger to fire, then refetch both tables and check SAP for new item
                    setTimeout(async () => {
                      await refetchPending();
                      await refetchApproved();

                      // Auto-check newly approved item in SAP
                      setIsCheckingExistence(true);
                      isCheckingRef.current = true;
                      try {
                        const formatDateForCheck = (dateStr: string) => {
                          if (!dateStr) return '';
                          return dateStr.split('T')[0]; // Convert ISO to YYYY-MM-DD
                        };

                        const itemsToCheck = [];
                        itemsToCheck.push({
                          itemCode: item.item_code,
                          customerName: item.customer_code,
                          finalPrice: Number(item.final_price),
                          validFrom: formatDateForCheck(item.valid_from),
                          validTo: formatDateForCheck(item.valid_through)
                        });

                        // Add vendors if available
                        let vendors = item.vendors;
                        if (typeof vendors === 'string') {
                          try {
                            vendors = JSON.parse(vendors);
                          } catch {
                            vendors = [];
                          }
                        }
                        if (Array.isArray(vendors)) {
                          vendors.forEach((vendor: any) => {
                            itemsToCheck.push({
                              itemCode: item.item_code,
                              vendorCode: vendor.id,
                              castingPrice: Number(vendor.revised_price || 0),
                              validFrom: formatDateForCheck(vendor.valid_from),
                              validTo: formatDateForCheck(vendor.valid_through)
                            });
                          });
                        }

                        const result = await pricingApi.checkExistenceInSap(itemsToCheck);
                        const existenceMap = new Map(sapExistence);
                        result.forEach((res: any) => {
                          const key = `${res.itemCode}_${res.vendorCode || 'null'}_${res.customerName || 'null'}`;
                          existenceMap.set(key, res);
                        });
                        setSapExistence(existenceMap);
                      } catch (error) {
                        console.error('Failed to check SAP existence after approval:', error);
                      } finally {
                        setIsCheckingExistence(false);
                        isCheckingRef.current = false;
                        setActionedItems(new Map());
                      }
                    }, 1500);
                  } catch (err: any) {
                    console.error('Failed to approve item:', err);
                    alert('Failed to approve item: ' + (err.message || err));
                  }
                }}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="bg-[#A02828] hover:bg-[#B83232] text-white font-bold border-transparent px-3 py-1.5 rounded text-xs"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const hasCastingDiff = Math.abs(Number(item.vendorRmCost || 0) - (Number(item.weight || 0) * Number(item.ratePerKg || 0))) > 0.01;
                    const hasSPDiff = (item.vendorProcessCost != null && Number(item.vendorProcessCost) > 0) && Math.abs(Number(item.vendorProcessCost || 0) - Number(item.specialProcess || 0)) > 0.01;

                    const disputes = [];

                    if (hasCastingDiff || (!hasCastingDiff && !hasSPDiff)) {
                      disputes.push({
                        disputedField: 'Casting Price',
                        newPrice: Number(item.vendorRmCost || 0),
                        customerTotalPrice: Number(item.weight || 0) * Number(item.ratePerKg || 0)
                      });
                    }

                    if (hasSPDiff) {
                      disputes.push({
                        disputedField: 'Special Process',
                        newPrice: Number(item.vendorProcessCost || 0),
                        customerTotalPrice: Number(item.specialProcess || 0)
                      });
                    }
                    await pricingApi.raiseDisputeFromMaster({
                      itemCode: item.item_code,
                      customerCode: item.customer_code,
                      customerName: item.customer_name || item.customerName || selectedCustomer?.label || item.customer_code,
                      castingCode: item.casting_code,
                      approvalDate: effectiveDate.toISOString().split('T')[0],
                      vendorId: item.vendor_id || item.vendorName || '',
                      disputes,
                      fromDate: item.valid_from || item.validFrom || (effectiveDate ? effectiveDate.toISOString().split('T')[0] : undefined),
                      toDate: item.valid_through || item.validTo || undefined
                    });
                    setActionedItems(prev => new Map(prev).set(itemKey, 'disputed'));
                    // Wait for trigger to fire, then refetch both tables
                    setTimeout(() => {
                      refetchPending();
                      refetchApproved();
                      setActionedItems(new Map()); // Clear local state
                    }, 1500);
                    // Navigate to dispute register page with state
                    navigate('/disputes', { state: { item, customerName: item.customer_name || selectedCustomer?.label || selectedCustomer?.value || '', effectiveMonth: pricingMonth, effectiveYear: pricingYear } });
                  } catch (err: any) {
                    console.error('Failed to raise dispute:', err);
                    alert('Failed to raise dispute: ' + (err.message || err));
                  }
                }}
              >
                Dispute
              </Button>
            </div>
          );
        }
      }
    ];
  };

  // ── Multi-select Selection Helpers ────────────────────────────────────────
  const allVisibleKeys = useMemo(() => {
    return items.map((i: any) => `${i.item_code}_${i.customer_code}`);
  }, [items]);

  const isAllSelected = useMemo(() => {
    if (allVisibleKeys.length === 0) return false;
    return allVisibleKeys.every((key: string) => selectedRowKeys.has(key));
  }, [allVisibleKeys, selectedRowKeys]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRowKeys(new Set());
    } else {
      setSelectedRowKeys(new Set(allVisibleKeys));
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Bulk Actions Handlers ─────────────────────────────────────────────────
  const executeBulkApprove = async (selectedItemsList: any[]) => {
    setIsBulkLoading(true);
    try {
      let successCount = 0;
      for (const item of selectedItemsList) {
        const itemKey = `${item.item_code}_${item.customer_code}`;
        try {
          await pricingApi.approveItemFromMaster({
            itemCode: item.item_code,
            customerCode: item.customer_code,
            customerName: item.customer_code,
            castingCode: item.casting_code,
            approvalDate: effectiveDate.toISOString().split('T')[0],
            fromDate: item.fromDate,
            toDate: item.toDate
          });
          setActionedItems(prev => new Map(prev).set(itemKey, 'approved'));
          successCount++;
        } catch (err) {
          console.error(`Failed to approve ${item.item_code}:`, err);
        }
      }
      showToast(`Successfully approved ${successCount} of ${selectedItemsList.length} items.`);
      setSelectedRowKeys(new Set());
      setActiveTab('approved');
      // Wait for trigger to fire, then refetch both tables and check SAP for new items
      setTimeout(async () => {
        await refetchPending();
        await refetchApproved();

        // Auto-check newly approved items in SAP
        setIsCheckingExistence(true);
        isCheckingRef.current = true;
        try {
          const formatDateForCheck = (dateStr: string) => {
            if (!dateStr) return '';
            return dateStr.split('T')[0]; // Convert ISO to YYYY-MM-DD
          };

          const itemsToCheck: any[] = [];

          for (const item of selectedItemsList) {
            itemsToCheck.push({
              itemCode: item.item_code,
              customerName: item.customer_code,
              finalPrice: Number(item.final_price),
              validFrom: formatDateForCheck(item.valid_from),
              validTo: formatDateForCheck(item.valid_through)
            });

            // Add vendors if available
            let vendors = item.vendors;
            if (typeof vendors === 'string') {
              try {
                vendors = JSON.parse(vendors);
              } catch {
                vendors = [];
              }
            }
            if (Array.isArray(vendors)) {
              vendors.forEach((vendor: any) => {
                itemsToCheck.push({
                  itemCode: item.item_code,
                  vendorCode: vendor.id,
                  castingPrice: Number(vendor.revised_price || 0),
                  validFrom: formatDateForCheck(vendor.valid_from),
                  validTo: formatDateForCheck(vendor.valid_through)
                });
              });
            }
          }

          const result = await pricingApi.checkExistenceInSap(itemsToCheck);
          const existenceMap = new Map(sapExistence);
          result.forEach((res: any) => {
            const key = `${res.itemCode}_${res.vendorCode || 'null'}_${res.customerName || 'null'}`;
            existenceMap.set(key, res);
          });
          setSapExistence(existenceMap);
        } catch (error) {
          console.error('Failed to check SAP existence after bulk approval:', error);
        } finally {
          setIsCheckingExistence(false);
          isCheckingRef.current = false;
          setActionedItems(new Map());
        }
      }, 1500);
    } catch (err: any) {
      console.error('Bulk approve error:', err);
      alert('Bulk approve failed: ' + (err.message || err));
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkApprove = () => {
    if (selectedRowKeys.size === 0) return;
    const selectedItemsList = items.filter((i: any) => selectedRowKeys.has(`${i.item_code}_${i.customer_code}`));
    if (!selectedItemsList.length) return;

    setConfirmModal({
      isOpen: true,
      title: 'Confirm Bulk Approval',
      message: `Are you sure you want to approve ${selectedItemsList.length} selected ${selectedItemsList.length === 1 ? 'item' : 'items'}?`,
      actionType: 'approve',
      onConfirm: () => executeBulkApprove(selectedItemsList)
    });
  };

  const executeBulkDispute = async (selectedItemsList: any[]) => {
    setIsBulkLoading(true);
    try {
      let successCount = 0;
      for (const item of selectedItemsList) {
        const itemKey = `${item.item_code}_${item.customer_code}`;
        try {
          const hasCastingDiff = Math.abs(Number(item.vendorRmCost || 0) - (Number(item.weight || 0) * Number(item.ratePerKg || 0))) > 0.01;
          const hasSPDiff = (item.vendorProcessCost != null && Number(item.vendorProcessCost) > 0) && Math.abs(Number(item.vendorProcessCost || 0) - Number(item.specialProcess || 0)) > 0.01;

          const disputes = [];
          if (hasCastingDiff || (!hasCastingDiff && !hasSPDiff)) {
            disputes.push({
              disputedField: 'Casting Price',
              newPrice: Number(item.vendorRmCost || 0),
              customerTotalPrice: Number(item.weight || 0) * Number(item.ratePerKg || 0)
            });
          }
          if (hasSPDiff) {
            disputes.push({
              disputedField: 'Special Process',
              newPrice: Number(item.vendorProcessCost || 0),
              customerTotalPrice: Number(item.specialProcess || 0)
            });
          }
          await pricingApi.raiseDisputeFromMaster({
            itemCode: item.item_code,
            customerCode: item.customer_code,
            customerName: item.customer_code,
            castingCode: item.casting_code,
            approvalDate: effectiveDate.toISOString().split('T')[0],
            vendorId: item.vendor_id || item.vendorName || '',
            disputes,
            fromDate: item.fromDate,
            toDate: item.toDate
          });
          setActionedItems(prev => new Map(prev).set(itemKey, 'disputed'));
          successCount++;
        } catch (err) {
          console.error(`Failed to dispute ${item.item_code}:`, err);
        }
      }
      showToast(`Raised disputes for ${successCount} of ${selectedItemsList.length} items.`);
      setSelectedRowKeys(new Set());
      // Wait for trigger to fire, then refetch both tables
      setTimeout(() => {
        refetchPending();
        refetchApproved();
        setActionedItems(new Map()); // Clear local state
      }, 1500);
    } catch (err: any) {
      console.error('Bulk dispute error:', err);
      alert('Bulk dispute failed: ' + (err.message || err));
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkDispute = () => {
    if (selectedRowKeys.size === 0) return;
    const selectedItemsList = items.filter((i: any) => selectedRowKeys.has(`${i.item_code}_${i.customer_code}`));
    if (!selectedItemsList.length) return;

    setConfirmModal({
      isOpen: true,
      title: 'Confirm Bulk Dispute',
      message: `Are you sure you want to raise disputes for ${selectedItemsList.length} selected ${selectedItemsList.length === 1 ? 'item' : 'items'}?`,
      actionType: 'dispute',
      onConfirm: () => executeBulkDispute(selectedItemsList)
    });
  };

  // Main visible row columns (stops at Domestic/Export)
  const getBaseCols = () => {
    const cols: any[] = [];
    if (activeTab === 'pending') {
      cols.push({
        header: (
          <input
            type="checkbox"
            className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-[#A02828] cursor-pointer"
            checked={isAllSelected}
            onChange={toggleSelectAll}
            title="Select all on this page"
          />
        ),
        className: 'px-3 py-3 text-center w-10',
        render: (i: any) => {
          const key = `${i.item_code}_${i.customer_code}`;
          const isSelected = selectedRowKeys.has(key);
          return (
            <input
              type="checkbox"
              className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-[#A02828] cursor-pointer"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                toggleSelectRow(key);
              }}
            />
          );
        }
      });
    }
    cols.push(
      { header: 'Item Code', className: 'px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap', render: (i: any) => i.item_code || '—' },
      { header: 'Casting Code', className: 'px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap', render: (i: any) => i.casting_code || '—' },
      { header: 'Customer Code', className: 'px-4 py-3 font-mono text-xs text-gray-600', render: (i: any) => i.customer_code || '—' },
      { header: 'Customer Name', className: 'px-4 py-3 font-semibold text-gray-900', render: (i: any) => i.customer_name || '—' },
      { header: 'Vendors', className: 'px-4 py-3 text-xs text-gray-700 font-semibold max-w-xs', render: (i: any) => i.vendor_names ? <span title={i.vendor_names} className="truncate block">{i.vendor_names}</span> : <span className="italic text-gray-400">—</span> },
      { header: 'Item Description', className: 'px-4 py-3 text-gray-600 max-w-sm', render: (i: any) => i.item_description || '—' },
      { header: 'Final Price', className: 'px-4 py-3 text-right font-mono text-gray-700', render: (i: any) => i.final_price ? `₹${Number(i.final_price).toFixed(2)}` : '—' },
      { header: 'Valid From', className: 'px-4 py-3 text-sm text-gray-600', render: (i: any) => i.valid_from ? new Date(i.valid_from).toLocaleDateString() : '—' },
      { header: 'Valid To', className: 'px-4 py-3 text-sm text-gray-600', render: (i: any) => i.valid_through ? new Date(i.valid_through).toLocaleDateString() : '—' },
      ...(activeTab === 'approved' ? [
        { header: 'Exists in SAP', className: 'px-4 py-3 text-gray-600 whitespace-nowrap', render: (i: any) => getSapExistenceStatus(i) },
        { header: 'Data Match', className: 'px-4 py-3 text-gray-600 whitespace-nowrap', render: (i: any) => getSapDataMatchStatus(i) },
        { header: 'SAP Status', className: 'px-4 py-3 text-gray-600 whitespace-nowrap', render: (i: any) => {
          const status = getSapSyncStatus(i);
          const key = `${i.item_code}_${i.vendorId}_${i.customerName}`;
          const sapStatus = sapExistence.get(key);
          return (
            <SapStatusCell
              itemCode={i.item_code}
              vendorId={i.vendorId}
              customerName={i.customerName}
              statusLabel={status.label}
              statusType={status.type}
              sapStatus={sapStatus}
              setErrorModal={setErrorModal}
            />
          );
        } }
      ] : [])
    );
    return cols;
  };

  
  // All category tables use getBaseCols() which stops at Domestic/Export
  const getDomesticCols = getBaseCols;
  const getLabourCols = getBaseCols;
  const getExportCols = getBaseCols;
  const getPinBushCols = getBaseCols;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* ── Toast Notification Banner ── */}
      {toastMessage && (
        <div className="fixed top-5 right-8 z-50 bg-green-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-green-800 text-sm font-bold animate-bounce">
          <span className="text-base bg-white text-green-700 rounded-full w-5 h-5 flex items-center justify-center font-black text-xs">✓</span>
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)} 
            className="ml-3 text-green-200 hover:text-white font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="p-6 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Pricing Audit</h1>
          {/* ── Tab Bar + Refresh Button ── */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setActiveTab('pending'); setSelectedRowKeys(new Set()); }}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 ${
                  activeTab === 'pending'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📋 Pending
              </button>

              <button
                onClick={() => { setActiveTab('approved'); setSelectedRowKeys(new Set()); }}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 ${
                  activeTab === 'approved'
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ✅ Approved
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading || isLoadingApproved}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 flex items-center gap-2 ${
                isRefreshing
                  ? 'bg-blue-100 text-blue-700 cursor-wait'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
              title="Refresh data"
            >
              {isRefreshing ? (
                <>
                  <span className="inline-block animate-spin">⟳</span>
                  Refreshing...
                </>
              ) : (
                <>
                  <span>⟳</span>
                  Refresh
                </>
              )}
            </button>

          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-end">
          {/* Customer Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Customer</label>
            <Select
              isClearable
              placeholder="Search Customer..."
              options={customerOptions}
              value={selectedCustomer}
              onChange={setSelectedCustomer}
              className="text-sm"
              isSearchable
              maxMenuHeight={200}
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '38px',
                  height: '38px',
                  borderColor: '#E5E7EB',
                  boxShadow: 'none',
                  '&:hover': { borderColor: BRAND.RED }
                }),
                valueContainer: (base) => ({
                  ...base,
                  padding: '0 12px',
                  whiteSpace: 'nowrap'
                }),
                singleValue: (base) => ({
                  ...base,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }),
                input: (base) => ({
                  ...base,
                  whiteSpace: 'nowrap'
                }),
                placeholder: (base) => ({
                  ...base,
                  whiteSpace: 'nowrap'
                })
              }}
            />
          </div>

          {/* Vendor Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Vendor</label>
            <Select
              isClearable
              placeholder="Search Vendor..."
              options={vendorOptions}
              value={selectedVendor}
              onChange={setSelectedVendor}
              className="text-sm"
              styles={{
                control: (base) => ({
                  ...base,
                  borderColor: '#E5E7EB',
                  boxShadow: 'none',
                  '&:hover': { borderColor: BRAND.RED }
                })
              }}
            />
          </div>

          {/* Item No Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Item No</label>
            <Select
              isClearable
              placeholder="Search Item..."
              options={itemOptions}
              value={selectedItem}
              onChange={setSelectedItem}
              className="text-sm"
              styles={{
                control: (base) => ({
                  ...base,
                  borderColor: '#E5E7EB',
                  boxShadow: 'none',
                  '&:hover': { borderColor: BRAND.RED }
                })
              }}
            />
          </div>

          {/* Effective Month */}
          {/* Date filters - only show for Pending tab */}
          {activeTab === 'pending' && (
            <>
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Effective Month</label>
                <select
                  value={pricingMonth}
                  onChange={(e) => setPricingMonth(e.target.value)}
                  className="h-[38px] px-3 rounded-lg border text-sm focus:outline-none bg-white w-full font-semibold text-gray-700"
                  style={{ borderColor: '#E5E7EB' }}
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

              {/* Effective Year */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Effective Year</label>
                <select
                  value={pricingYear}
                  onChange={(e) => setPricingYear(e.target.value)}
                  className="h-[38px] px-3 rounded-lg border text-sm focus:outline-none bg-white w-full font-semibold text-gray-700"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              {/* Effective Day (Optional) */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Effective Day (Opt.)</label>
                <select
                  value={pricingDay}
                  onChange={(e) => setPricingDay(e.target.value)}
                  className="h-[38px] px-3 rounded-lg border text-sm focus:outline-none bg-white w-full font-semibold text-gray-700"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  <option value="1">1st (default)</option>
                  {Array.from({ length: 28 }, (_, i) => String(i + 2)).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Item No / Search */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Item No / Description</label>
            <input
              type="text"
              placeholder="Type to search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[38px] px-3 rounded-lg border text-sm focus:outline-none bg-white w-full"
              style={{ borderColor: '#E5E7EB' }}
            />
          </div>

          {/* Reset Filters */}
          <div>
            {(selectedCustomer || selectedVendor || selectedItem || searchQuery) && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setSelectedCustomer(null);
                  setSelectedVendor(null);
                  setSelectedItem(null);
                  setSearchQuery('');
                  setPricingMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
                  setPricingYear(String(new Date().getFullYear()));
                  setPricingDay('1');
                }}
                className="w-full text-sm font-semibold"
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Push to SAP Button */}
          {activeTab === 'approved' && (
            <div className="flex flex-col justify-end col-span-1 md:col-span-2 md:ml-auto">
              <Button
                variant="primary"
                size="md"
                disabled={sapPushMutation.isPending || items.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold px-4 py-2 rounded-lg border-transparent flex items-center justify-center gap-2 shadow-md transition-all text-xs uppercase tracking-wider w-full"
                onClick={() => {
                  if (items.length === 0) {
                    setSapPushModal({
                      isOpen: true,
                      status: 'error',
                      message: 'No items to push',
                      details: null
                    });
                  } else {
                    setSapPushModal({
                      isOpen: true,
                      status: 'loading',
                      message: 'Pushing to SAP...',
                      details: null
                    });
                    sapPushMutation.mutate();
                  }
                }}
              >
                {sapPushMutation.isPending ? (
                  <>
                    <span className="animate-spin">⏳</span> Pushing...
                  </>
                ) : (
                  <>
                    🚀 Push SAP ({items.length})
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          {(['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'] as const).map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 text-sm font-semibold transition-all duration-150 border-b-2 ${
                selectedCategory === category
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Bulk Actions */}
        {activeTab === 'pending' && selectedRowKeys.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={isBulkLoading}
              onClick={handleBulkApprove}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded text-xs border-transparent flex items-center gap-1 shadow-sm"
            >
              {isBulkLoading ? 'Processing...' : `✔ Approve (${selectedRowKeys.size})`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isBulkLoading}
              onClick={handleBulkDispute}
              className="bg-[#A02828] hover:bg-[#B83232] text-white font-bold px-3 py-1.5 rounded text-xs border-transparent flex items-center gap-1 shadow-sm"
            >
              {isBulkLoading ? 'Processing...' : `🛑 Dispute (${selectedRowKeys.size})`}
            </Button>
          </div>
        )}
      </div>

      {/* ── Main Data View ── */}
      <div className="flex-1 p-6 overflow-y-auto">
        {isLoadingData ? (
          <div className="flex justify-center items-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <Loader size="md" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-gray-200 shadow-sm text-gray-400">
            No pricing master records found matching the applied filter.
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const catItems = groupedItems[selectedCategory] || [];
              if (catItems.length === 0) return null;

              const catCols = appendActionsColumn(
                selectedCategory === 'Export'
                  ? getExportCols()
                  : selectedCategory === 'Labour / Job Work'
                    ? getLabourCols()
                    : selectedCategory === 'Pin & Bush'
                      ? getPinBushCols()
                      : getDomesticCols()
              );

              return (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-gray-700 px-1 uppercase tracking-wider flex items-center gap-2">
                    <span>{selectedCategory}</span>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">
                      {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </h2>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse min-w-max">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs">
                        <tr>
                          {catCols.map((col, cIdx) => {
                            const isStringHeader = typeof col.header === 'string';
                            const isNumericCol = isStringHeader && (
                              col.header.includes('Price') || 
                              col.header.includes('Difference') || 
                              col.header.includes('Rate') || 
                              col.header.includes('Cost') || 
                              col.header.includes('Charges') || 
                              col.header.includes('OHP') || 
                              col.header.includes('Packing')
                            );

                            return (
                              <th 
                                key={cIdx} 
                                className={`${isNumericCol ? 'text-right ' : ''}px-6 py-4`}
                              >
                                {col.header}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {catItems.map((item: any) => {
                          const isExpanded = expandedRowKey === `${item.item_code}_${item.customer_code}`;
                          return (
                            <React.Fragment key={`${item.item_code}_${item.customer_code}`}>
                              {/* Standard row */}
                              <tr
                                className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-red-50/20' : ''}`}
                                onClick={(e) => {
                                  // Don't expand if clicking on checkbox
                                  if ((e.target as any).type === 'checkbox') {
                                    return;
                                  }
                                  handleToggleExpand(item);
                                }}
                              >
                                {catCols.map((col, cIdx) => {
                                  const cellClass = typeof (col.className as any) === 'function' ? (col.className as any)(item) : col.className;
                                  return (
                                    <td key={cIdx} className={cellClass}>
                                      {col.render(item)}
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* Expandable comparison row */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={catCols.length} className="px-8 py-6 bg-gray-50/50 border-t border-b border-gray-100">
                                    {isLoadingDetails ? (
                                      <div className="flex justify-center items-center py-8">
                                        <Loader size="sm" />
                                      </div>
                                    ) : !expandedItemDetail ? (
                                      <div className="text-sm text-gray-500 italic text-center">
                                        Failed to retrieve customer pricing details for comparison.
                                      </div>
                                    ) : (
                                      <div className="space-y-6 max-w-5xl ml-0 sticky left-6" style={{ position: 'sticky', left: 24, width: 'fit-content', minWidth: '800px', maxWidth: 'calc(100vw - 320px)' }}>


                                        {/* Vendor selection row */}
                                        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                                          <div className="text-md font-bold text-gray-900 flex items-center gap-2">
                                            <span>Comparison Details (Customer Master vs Vendor Master)</span>
                                            <span className="text-xs font-normal text-gray-500">
                                              ({expandedItemDetail.itemCode} | {expandedItemDetail.castingCode})
                                            </span>
                                          </div>
                                        </div>

                                        {/* Single unified comparison table */}
                                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                          <table className="w-full text-xs text-left border-collapse">
                                            <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                                              <tr>
                                                <th className="px-4 py-2 border-r border-gray-200 w-[20%]">Vendor Name</th>
                                                <th className="px-4 py-2 border-r border-gray-200 w-[18%]">Rates / Values</th>
                                                <th className="px-4 py-2 text-right border-r border-gray-200 w-[15%] bg-blue-50 text-blue-800 font-bold">Vendor Verified wt</th>
                                                <th className="px-4 py-2 text-right border-r border-gray-200 w-[16%]">Vendor Master</th>
                                                <th className="px-4 py-2 text-right border-r border-gray-200 w-[16%]">Customer Master</th>
                                                <th className="px-4 py-2 text-right w-[15%]">Difference</th>
                                              </tr>
                                            </thead>
                                            <tbody>

                                              {/* ── RM / Casting & Special Price Fields ── */}
                                              {expandedVendors && expandedVendors.length > 0 ? (
                                                <>
                                                  {expandedVendors.some((v: any) => v.groupcode === '115') && (
                                                    <tr>
                                                      <td colSpan={6} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A02828] bg-red-50 border-y border-red-100">
                                                        RM / CASTING FIELDS
                                                      </td>
                                                    </tr>
                                                  )}
                                                  {filteredExpandedVendors.some((v: any) => v.groupcode === '118') && (
                                                    <tr>
                                                      <td colSpan={6} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A02828] bg-red-50 border-y border-red-100">
                                                        SPECIAL PRICING FIELDS
                                                      </td>
                                                    </tr>
                                                  )}
                                                </>
                                              ) : null}
                                              {expandedVendors && expandedVendors.length > 0 ? (
                                                expandedVendors.map((vendor, vidx) => {
                                                  const isRawMaterial = vendor.groupcode === '115';
                                                  const isSpecialPrice = vendor.groupcode === '118';

                                                  if (isRawMaterial) {
                                                    const vWeight = Number(vendor.rm_weight || 0);
                                                    const vRate = Number(vendor.revised_rate_per_kg || 0);
                                                    const vPrice = Number(vendor.revised_price || 0);

                                                    const cWeight = Number(expandedItemDetail?.cast_weight || 0);
                                                    const cRate = Number(expandedItemDetail?.cast_rate || 0);
                                                    const cCastPrice = cWeight * cRate;

                                                    return (
                                                      <React.Fragment key={`vendor-${vendor.id}`}>
                                                        <tr className={`${vidx > 0 ? 'border-t-2 border-gray-300' : 'border-t'} border-gray-100`}>
                                                          <td className="px-4 py-2 font-semibold text-gray-900 border-r border-gray-200 bg-gray-50/30 align-top" rowSpan={3}>
                                                            <div className="font-bold text-sm">{vendor.name}</div>
                                                            <div className="text-[10px] text-gray-400 font-normal mt-1">{vendor.id}</div>
                                                          </td>
                                                          <td className="px-4 py-2 text-sm text-gray-700 border-r border-gray-200 w-32">Casting Wt</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/50 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono font-semibold text-gray-700 w-24">{vWeight > 0 ? `${vWeight.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono font-semibold text-gray-700 w-24">{cWeight > 0 ? `${cWeight.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cWeight, vWeight, 'kg')}
                                                          </td>
                                                        </tr>
                                                        <tr className="border-t border-gray-100">
                                                          <td className="px-4 py-2 text-sm text-gray-700 border-r border-gray-200 w-32">Casting Rate/Kg</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono text-gray-700 w-24 text-sm">{vRate > 0 ? `₹${vRate.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono text-gray-700 w-24 text-sm">{cRate > 0 ? `₹${cRate.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cRate, vRate)}
                                                          </td>
                                                        </tr>
                                                        <tr className="border-t border-gray-100">
                                                          <td className="px-4 py-2 text-sm text-gray-700 font-semibold border-r border-gray-200 w-32">Casting Price</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right font-mono font-bold text-gray-900 w-24 text-sm">{vPrice > 0 ? `₹${vPrice.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono font-bold text-gray-900 w-24 text-sm">{cCastPrice > 0 ? `₹${cCastPrice.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cCastPrice, vPrice)}
                                                          </td>
                                                        </tr>
                                                        {vendor.valid_from && vendor.valid_through ? (
                                                          <tr className="border-t border-gray-100 bg-blue-50/30">
                                                            <td className="px-4 py-2 text-sm text-gray-700 font-semibold border-r border-gray-200 w-32">Effective Validity</td>
                                                            <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                            <td colSpan={3} className="px-4 py-2 text-right font-mono font-semibold text-gray-900 text-sm">
                                                              {`${new Date(vendor.valid_from).toLocaleDateString('en-IN')} to ${new Date(vendor.valid_through).toLocaleDateString('en-IN')}`}
                                                            </td>
                                                          </tr>
                                                        ) : (
                                                          <tr className="border-t border-gray-100 bg-gray-100/40">
                                                            <td colSpan={6} className="px-4 py-2 text-sm text-gray-400 border-r border-gray-200 w-32"></td>
                                                          </tr>
                                                        )}
                                                      </React.Fragment>
                                                    );
                                                  } else if (isSpecialPrice) {
                                                    const vWeight = Number(vendor.rm_weight || 0);
                                                    const vRate = Number(vendor.revised_rate_per_kg || 0);
                                                    const vPrice = Number(vendor.revised_price || 0);

                                                    const cWeight = Number(expandedItemDetail?.special_price_weight || 0);
                                                    const cRate = Number(expandedItemDetail?.special_price_rate || 0);
                                                    const cSpecPrice = cWeight * cRate;

                                                    return (
                                                      <React.Fragment key={`vendor-${vendor.id}`}>
                                                        <tr className={`${vidx > 0 ? 'border-t-2 border-gray-300' : 'border-t'} border-gray-100`}>
                                                          <td className="px-4 py-2 font-semibold text-gray-900 border-r border-gray-200 bg-gray-50/30 align-top" rowSpan={3}>
                                                            <div className="font-bold text-sm">{vendor.name}</div>
                                                            <div className="text-[10px] text-gray-400 font-normal mt-1">{vendor.id}</div>
                                                          </td>
                                                          <td className="px-4 py-2 text-sm text-gray-700 border-r border-gray-200 w-32">Special Pricing Wt</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/50 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono font-semibold text-gray-700 w-24">{vWeight > 0 ? `${vWeight.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono font-semibold text-gray-700 w-24">{cWeight > 0 ? `${cWeight.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cWeight, vWeight, 'kg')}
                                                          </td>
                                                        </tr>
                                                        <tr className="border-t border-gray-100">
                                                          <td className="px-4 py-2 text-sm text-gray-700 border-r border-gray-200 w-32">Special Pricing Rate</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono text-gray-700 w-24 text-sm">{vRate > 0 ? `₹${vRate.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 font-mono text-gray-700 w-24 text-sm">{cRate > 0 ? `₹${cRate.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cRate, vRate)}
                                                          </td>
                                                        </tr>
                                                        <tr className="border-t border-gray-100">
                                                          <td className="px-4 py-2 text-sm text-gray-700 font-semibold border-r border-gray-200 w-32">Special Pricing Price</td>
                                                          <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                          <td className="px-4 py-2 text-right font-mono font-bold text-gray-900 w-24 text-sm">{vPrice > 0 ? `₹${vPrice.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono font-bold text-gray-900 w-24 text-sm">{cSpecPrice > 0 ? `₹${cSpecPrice.toFixed(2)}` : '—'}</td>
                                                          <td className="px-4 py-2 text-right font-mono text-sm text-orange-500 font-bold">
                                                            {renderDifference(cSpecPrice, vPrice)}
                                                          </td>
                                                        </tr>
                                                        {vendor.valid_from && vendor.valid_through ? (
                                                          <tr className="border-t border-gray-100 bg-blue-50/30">
                                                            <td className="px-4 py-2 text-sm text-gray-700 font-semibold border-r border-gray-200 w-32">Effective Validity</td>
                                                            <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm w-24">—</td>
                                                            <td colSpan={3} className="px-4 py-2 text-right font-mono font-semibold text-gray-900 text-sm">
                                                              {`${new Date(vendor.valid_from).toLocaleDateString('en-IN')} to ${new Date(vendor.valid_through).toLocaleDateString('en-IN')}`}
                                                            </td>
                                                          </tr>
                                                        ) : (
                                                          <tr className="border-t border-gray-100 bg-gray-100/40">
                                                            <td colSpan={6} className="px-4 py-2 text-sm text-gray-400 border-r border-gray-200 w-32"></td>
                                                          </tr>
                                                        )}
                                                      </React.Fragment>
                                                    );
                                                  }

                                                  return null;
                                                })
                                              ) : (
                                                <tr>
                                                  <td colSpan={6} className="px-4 py-3 text-center text-gray-400 italic border-b border-gray-100">
                                                    No vendors with groupcode 115 (RM) or 118 (Special Prices) mapped to this item.
                                                  </td>
                                                </tr>
                                              )}

                                              {/* ── Operational Costs & Customer Master Rates ── */}
                                              <tr>
                                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A02828] bg-red-50 border-y border-red-100">
                                                  OPERATIONAL COSTS & CUSTOMER MASTER RATES
                                                </td>
                                              </tr>
                                              {expandedItemDetail ? (
                                                <>
                                                   {(() => {
                                                     const calcTwc = Number(expandedItemDetail.rejection_cost || 0) + Number(expandedItemDetail.powder_coating || 0) + Number(expandedItemDetail.special_process || 0) + Number(expandedItemDetail.process_machining || 0) + Number(expandedItemDetail.trans_charges || 0) + Number(expandedItemDetail.ohp || 0) + Number(expandedItemDetail.packing || 0);
                                                     const twcDisplay = calcTwc > 0 ? calcTwc : (expandedItemDetail.total_working_cost ?? expandedItemDetail.actual_cost);
                                                     const castPrice = (Number(expandedItemDetail.cast_weight || 0) * Number(expandedItemDetail.cast_rate || 0)) || Number(expandedItemDetail.cast_price || 0);
                                                     const finalPriceDisplay = (castPrice > 0 && twcDisplay > 0) ? (castPrice + Number(twcDisplay || 0)) : expandedItemDetail.final_price;

                                                     return [
                                                       { label: 'Rejection Cost', value: expandedItemDetail.rejection_cost },
                                                       { label: 'Powder Coating', value: expandedItemDetail.powder_coating },
                                                       { label: 'Special Process', value: expandedItemDetail.special_process },
                                                       { label: 'Process (Machining+others)', value: expandedItemDetail.process_machining },
                                                       { label: 'Trans Charges', value: expandedItemDetail.trans_charges },
                                                       { label: 'OHP', value: expandedItemDetail.ohp },
                                                       { label: 'Packing', value: expandedItemDetail.packing },
                                                       { label: 'Total Working Cost', value: twcDisplay, isBold: true },
                                                       { label: 'Final Price', value: finalPriceDisplay, isBold: true },
                                                     ];
                                                   })().map((item) => (
                                                    <tr key={item.label} className={`border-b border-gray-100 ${item.isBold ? 'bg-gray-50/50 font-bold' : ''}`}>
                                                      <td className="px-4 py-2 font-semibold text-gray-400 border-r border-gray-200 bg-gray-50/30">—</td>
                                                      <td className={`px-4 py-2 border-r border-gray-200 ${item.isBold ? 'font-bold text-gray-900' : 'text-gray-700'} text-sm`}>{item.label}</td>
                                                      <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm">—</td>
                                                      <td className="px-4 py-2 text-right border-r border-gray-200 text-gray-400 font-mono text-sm">—</td>
                                                      <td className={`px-4 py-2 text-right border-r border-gray-200 font-mono text-sm ${item.isBold ? 'font-bold text-gray-900' : ''}`}>
                                                        {item.value !== null && item.value !== undefined && item.value !== '' ? formatCurrency(item.value) : '—'}
                                                      </td>
                                                      <td className="px-4 py-2 text-right text-gray-400 font-mono text-sm">—</td>
                                                    </tr>
                                                  ))}
                                                  {/* Effective Validity Row */}
                                                  <tr className="border-b border-gray-100 bg-blue-50/30 font-bold">
                                                    <td className="px-4 py-2 font-semibold text-gray-400 border-r border-gray-200 bg-gray-50/30">—</td>
                                                    <td className="px-4 py-2 border-r border-gray-200 font-bold text-gray-900 text-sm">Effective Validity</td>
                                                    <td className="px-4 py-2 text-right border-r border-gray-200 bg-blue-50/20 text-gray-400 font-mono text-sm">—</td>
                                                    <td className="px-4 py-2 text-right border-r border-gray-200 text-gray-400 font-mono text-sm">—</td>
                                                    <td colSpan={2} className="px-4 py-2 text-right font-mono font-semibold text-gray-900 text-sm">
                                                      {expandedItemDetail.valid_from && expandedItemDetail.valid_through
                                                        ? `${new Date(expandedItemDetail.valid_from).toLocaleDateString('en-IN')} to ${new Date(expandedItemDetail.valid_through).toLocaleDateString('en-IN')}`
                                                        : '—'}
                                                    </td>
                                                  </tr>
                                                </>
                                              ) : (
                                                <tr>
                                                  <td colSpan={6} className="px-4 py-3 text-center text-gray-400 italic">
                                                    No customer pricing data
                                                  </td>
                                                </tr>
                                              )}

                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

          </div>
        )}
      </div>

      {/* ── Custom Confirmation Modal Box Popup ── */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-black ${
              confirmModal.actionType === 'approve' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {confirmModal.actionType === 'approve' ? '✓' : '⚠️'}
            </div>
            <h3 className="text-lg font-bold text-gray-900">{confirmModal.title}</h3>
            <p className="text-sm text-gray-600 font-medium">{confirmModal.message}</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                className="w-28 text-xs font-semibold"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className={`w-36 text-xs font-bold text-white border-transparent ${
                  confirmModal.actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                onClick={() => {
                  const action = confirmModal.onConfirm;
                  setConfirmModal(null);
                  action();
                }}
              >
                Confirm {confirmModal.actionType === 'approve' ? 'Approve' : 'Dispute'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAP Push Modal ── */}
      {sapPushModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transition-all duration-300 ${
            sapPushModal.status === 'loading' ? 'border-l-4 border-blue-500' :
            sapPushModal.status === 'success' ? 'border-l-4 border-green-500' :
            'border-l-4 border-red-500'
          }`}>
            {/* Header */}
            <div className={`px-6 py-6 text-center ${
              sapPushModal.status === 'loading' ? 'bg-gradient-to-r from-blue-50 to-blue-100' :
              sapPushModal.status === 'success' ? 'bg-gradient-to-r from-green-50 to-green-100' :
              'bg-gradient-to-r from-red-50 to-red-100'
            }`}>
              {/* Animated loading spinner */}
              {sapPushModal.status === 'loading' && (
                <div className="flex justify-center mb-4">
                  <div className="relative w-16 h-16">
                    {/* Outer rotating ring */}
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-300 animate-spin"></div>
                    {/* Inner pulsing circle */}
                    <div className="absolute inset-2 rounded-full bg-blue-100 animate-pulse"></div>
                    {/* Center icon */}
                    <div className="absolute inset-0 flex items-center justify-center text-xl">⏳</div>
                  </div>
                </div>
              )}
              {sapPushModal.status === 'success' && (
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-200 text-green-600 text-3xl font-bold mx-auto mb-3">
                  ✓
                </div>
              )}
              {sapPushModal.status === 'error' && (
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-200 text-red-600 text-3xl font-bold mx-auto mb-3">
                  ✗
                </div>
              )}

              <h2 className={`text-2xl font-bold ${
                sapPushModal.status === 'loading' ? 'text-blue-900' :
                sapPushModal.status === 'success' ? 'text-green-900' :
                'text-red-900'
              }`}>
                {sapPushModal.status === 'loading' ? 'Pushing to SAP' :
                 sapPushModal.status === 'success' ? 'Push Successful' :
                 'Push Failed'}
              </h2>
            </div>

            {/* Items List */}
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {sapPushModal.itemsInProgress && sapPushModal.itemsInProgress.length > 0 ? (
                <div className="space-y-2">
                  {sapPushModal.itemsInProgress.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {item.itemCode}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          CardCode: <span className="font-mono font-bold">{item.cardCode}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {sapPushModal.status === 'loading' && (
                          <>
                            <div className="w-5 h-5 rounded-full border-2 border-transparent border-t-blue-500 animate-spin"></div>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                              item.action === 'POST' ? 'bg-purple-100 text-purple-700' :
                              item.action === 'PATCH' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-200 text-gray-700'
                            }`}>
                              {item.action === 'POST' ? 'posting...' :
                               item.action === 'PATCH' ? 'patching...' :
                               'skipping...'}
                            </span>
                          </>
                        )}
                        {sapPushModal.status !== 'loading' && (
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            item.action === 'POST' ? 'bg-purple-100 text-purple-700' :
                            item.action === 'PATCH' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {item.action === 'POST' ? 'posted' :
                             item.action === 'PATCH' ? 'patched' :
                             'skipped'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 text-sm py-4">{sapPushModal.message}</p>
              )}
            </div>

            {/* Summary Stats */}
            {sapPushModal.details && (
              <div className={`px-6 py-4 space-y-2 text-sm font-medium border-t ${
                sapPushModal.status === 'success' ? 'bg-green-50 border-green-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">📊 Total</span>
                  <span className="font-bold text-gray-900">{sapPushModal.details.total}</span>
                </div>
                <div className="flex justify-between items-center text-green-700">
                  <span>✓ Succeeded</span>
                  <span className="font-bold">{sapPushModal.details.succeeded}</span>
                </div>
                {sapPushModal.details.failed > 0 && (
                  <div className="flex justify-between items-center text-red-700 pt-1 border-t border-red-200">
                    <span>✗ Failed</span>
                    <span className="font-bold">{sapPushModal.details.failed}</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <Button
                variant="primary"
                size="md"
                className="w-full text-sm font-semibold"
                disabled={sapPushModal.status === 'loading'}
                onClick={() => setSapPushModal({ isOpen: false, status: 'idle', message: '', details: null, itemsInProgress: [] })}
              >
                {sapPushModal.status === 'loading' ? 'Pushing...' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAP Error Detail Modal ── */}
      {errorModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-black bg-red-100 text-red-700">
              ✗
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">SAP Sync Error Details</h3>
            <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-2 text-left">
              <div>
                <span className="font-semibold text-gray-700">Item Code:</span>
                <span className="text-gray-900 font-mono ml-2">{errorModal.itemCode}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Code:</span>
                <span className="text-gray-900 font-mono ml-2">{errorModal.code}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Type:</span>
                <span className="text-gray-900 ml-2 capitalize">{errorModal.type}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <span className="font-semibold text-red-700 block mb-1">Error Message:</span>
                <div className="bg-white p-2 rounded border border-red-200 text-red-700 font-mono text-xs max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {errorModal.error}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                className="text-xs font-semibold"
                onClick={() => setErrorModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemPricingApprovalPage;
