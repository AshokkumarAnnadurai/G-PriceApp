import { useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useState } from 'react';
import AsyncSelect from 'react-select/async';
import { customerApi } from '../../api/customerApi';
import { itemApi } from '../../api/itemApi';
import { getDomesticColumns,getExportColumns,getLabourColumns,getPinBushColumns } from '../../constants/itemColumns';
import { ItemDetailPanel } from '../../pages/ItemDetailPanel';
import { Button,DataTable,Loader,Modal } from '../ui';

interface CustomerItemsPanelProps {
  customer: {
    bpCode: string;
    name: string;
    groupName: string;
  };
  getVendorName: (id: string | null | undefined) => string;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
  activeTab?: string;
  onActiveTabChange?: (tab: string) => void;
  /** When true, auto-opens the Add Mapping modal */
  forceShowAddModal?: boolean;
  /** Called when the Add Mapping modal closes so the parent can reset the trigger */
  onAddModalClosed?: () => void;
  /** Set of customer+casting_code combinations that have been audited/approved */
  approvedItems?: Set<string>;
}

export const CustomerItemsPanel: React.FC<CustomerItemsPanelProps> = ({ customer, getVendorName, onShowToast, activeTab: externalActiveTab, onActiveTabChange, forceShowAddModal, onAddModalClosed, approvedItems = new Set<string>() }) => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedNewItems, setSelectedNewItems] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isDeletingMulti, setIsDeletingMulti] = useState(false);

  const loadItemOptions = async (inputValue: string) => {
    try {
      const res = await itemApi.list({
        search: inputValue,
        customerType: 'All',
        page: 1,
        pageSize: 50
      });
      return (res.items ?? [])
        .filter(item => {
          const ig = (item.itemGroup || '').toString().trim().toLowerCase();
          return ig === '101' || ig === 'finished goods' || ig === 'finished goods pin and bush' || ig === 'finished goods pin & bush';
        })
        .map(item => ({
          value: item.itemCode,
          label: `${item.itemCode} - ${item.description || 'No Description'}`,
          item: item
        }));
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  // Open modal automatically when parent triggers it via forceShowAddModal
  React.useEffect(() => {
    if (forceShowAddModal) setShowAddModal(true);
  }, [forceShowAddModal]);

  const [internalActiveTab, setInternalActiveTab] = useState(() => {
    const validTabs = ['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'];
    return validTabs.includes(customer.groupName) ? customer.groupName : 'Domestic';
  });
  
  const activeTab = externalActiveTab || internalActiveTab;

  const { data: itemData, isLoading } = useQuery({
    queryKey: ['customer-items', customer.bpCode, activeTab],
    queryFn: () => customerApi.getItems(customer.bpCode, activeTab),
    refetchInterval: 30000,
  });

  const items = itemData?.items || [];
  
  const handleTabChange = (tab: string) => {
    setSelectedIds(new Set());
    setInternalActiveTab(tab);
    if (onActiveTabChange) onActiveTabChange(tab);
  };

  const availableTabs = React.useMemo(() => {
    const group = (customer.groupName || '').trim().toLowerCase();
    if (group === 'export') {
      return ['Export'];
    } else if (group === 'domestic') {
      return ['Domestic', 'Labour / Job Work', 'Pin & Bush'];
    }
    return ['Domestic', 'Export', 'Labour / Job Work', 'Pin & Bush'];
  }, [customer.groupName]);

  React.useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      if (availableTabs.includes(customer.groupName)) {
        handleTabChange(customer.groupName);
      } else {
        handleTabChange(availableTabs[0]);
      }
    }
  }, [availableTabs, activeTab, customer.groupName]);

  const filteredItems = items;

  const handleAddMapping = async () => {
    if (selectedNewItems.length === 0) return;

    // Validate selected items against activeTab
    const invalidItems: string[] = [];
    for (const option of selectedNewItems) {
      const item = option.item;
      if (!item) continue;

      const exportDom = (item.exportDomestic || '').trim().toLowerCase();
      const boughtOut = (item.boughtOutJobWork || '').trim().toLowerCase();
      const groupName = (item.itemGroup || '').trim().toLowerCase();

      let actualCategory = 'N/A';
      if (boughtOut.includes('job work')) {
        actualCategory = 'Job Work / Labour';
      } else if (exportDom.includes('domestic')) {
        actualCategory = 'Domestic';
      } else if (exportDom.includes('export')) {
        actualCategory = 'Export';
      } else if (exportDom.includes('pin bush') || exportDom.includes('pin push') || exportDom.includes('pin & bush') || groupName.includes('pin') || groupName.includes('bush')) {
        actualCategory = 'Pin & Bush';
      } else if (item.exportDomestic) {
        actualCategory = item.exportDomestic;
      }

      if (activeTab === 'Domestic') {
        // Can allow domestic items only for domestic
        if (!exportDom.includes('domestic')) {
          invalidItems.push(`Item ${item.itemCode} is not a Domestic item (Category: ${actualCategory})`);
        }
      } else if (activeTab === 'Export') {
        // Can allow export items only for export
        if (!exportDom.includes('export')) {
          invalidItems.push(`Item ${item.itemCode} is not an Export item (Category: ${actualCategory})`);
        }
      } else if (activeTab === 'Labour / Job Work') {
        // Bought out / job work to labour
        if (!boughtOut.includes('job work')) {
          invalidItems.push(`Item ${item.itemCode} is not a Labour/Job Work item (Category: ${actualCategory})`);
        }
      } else if (activeTab === 'Pin & Bush') {
        // Pinpush to pinpush (Pin & Bush)
        const isPinBush = exportDom.includes('pin bush') || exportDom.includes('pin push') || exportDom.includes('pin & bush') || groupName.includes('pin') || groupName.includes('bush');
        if (!isPinBush) {
          invalidItems.push(`Item ${item.itemCode} is not a Pin & Bush item (Category: ${actualCategory})`);
        }
      }
    }

    if (invalidItems.length > 0) {
      const errMsg = invalidItems.join('\n');
      if (onShowToast) onShowToast(errMsg, 'error'); else alert(errMsg);
      return; // Stop and do not add mapping
    }

    setIsAdding(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const item of selectedNewItems) {
      try {
        await customerApi.addItem(customer.bpCode, item.value.trim(), activeTab);
        successCount++;
      } catch (err: any) {
        const msg = err.message || 'Failed';
        errors.push(msg.includes(item.value) ? msg : `${item.value}: ${msg}`);
      }
    }
    if (successCount > 0) {
      const msg = successCount === 1 ? 'Item mapped successfully!' : `${successCount} items mapped successfully!`;
      if (onShowToast) onShowToast(msg, 'success'); else alert(msg);
      // Invalidate all tabs for this customer so new mappings are visible immediately
      queryClient.invalidateQueries({ queryKey: ['customer-items', customer.bpCode] });
    }
    if (errors.length > 0) {
      const errMsg = errors.join('\n');
      if (onShowToast) onShowToast(errMsg, 'error'); else alert(errMsg);
    }
    setIsAdding(false);
    closeAddModal();
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedNewItems([]);
    if (onAddModalClosed) onAddModalClosed();
  };

  const handleRemoveMapping = (itemCode: string) => {
    setItemToRemove(itemCode);
  };

  const confirmRemoveMapping = async () => {
    if (!itemToRemove) return;
    const itemCode = itemToRemove;
    setItemToRemove(null);
    try {
      await customerApi.deleteItem(customer.bpCode, itemCode, activeTab);
      if (onShowToast) {
        onShowToast(`Item ${itemCode} mapping removed successfully!`, 'success');
      } else {
        alert(`Item ${itemCode} mapping removed successfully!`);
      }
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ['customer-items', customer.bpCode] });
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to remove mapping';
      if (onShowToast) onShowToast(errMsg, 'error'); else alert(errMsg);
    }
  };
  let columns = getDomesticColumns(getVendorName);
  if (activeTab === 'Export') columns = getExportColumns(getVendorName);
  else if (activeTab === 'Labour / Job Work') columns = getLabourColumns();
  else if (activeTab === 'Pin & Bush') columns = getPinBushColumns(getVendorName);

  const finalColumns = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
          onChange={e => {
            if (e.target.checked) setSelectedIds(new Set(filteredItems.map((i: any) => i.itemCode)));
            else setSelectedIds(new Set());
          }}
        />
      ),
      align: 'center' as const,
      render: (row: any) => (
        <div onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(row.itemCode)}
            onChange={e => {
              const newSet = new Set(selectedIds);
              if (e.target.checked) newSet.add(row.itemCode);
              else newSet.delete(row.itemCode);
              setSelectedIds(newSet);
            }}
          />
        </div>
      ),
    },
    ...columns
  ];

  return (
    <div className="p-4 bg-gray-50 border-t border-b border-gray-200">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-bold text-gray-700">Items supplied to {customer.name}</h4>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="danger" onClick={() => setShowMultiDeleteModal(true)}>
            Delete Selected ({selectedIds.size})
          </Button>
        )}
      </div>
      
      <div className="flex gap-4 border-b border-gray-200 mb-4 px-1">
        {availableTabs.length > 0 ? availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab}
          </button>
        )) : (
          <div className="pb-2 px-1 text-sm font-medium text-gray-400">No matching items for this customer.</div>
        )}
      </div>
      
      <div className="bg-white rounded shadow-sm border border-gray-200 p-2 max-w-[calc(100vw-64px)] md:max-w-[calc(100vw-320px)] overflow-hidden flex flex-col max-h-[400px]">
        {isLoading ? (
          <div className="py-10 text-center shrink-0"><Loader /></div>
        ) : (
          <DataTable columns={finalColumns} rows={filteredItems} keyFn={(i: any) => i.itemCode} onRowClick={(row: any) => setSelectedItem(row)} emptyMessage={`No records found for ${activeTab}.`} />
        )}
      </div>

      {showAddModal && (
        <Modal onClose={closeAddModal} title={`Add Item Mapping to ${customer.name}`}>
           <div className="p-6">
<div className="mb-6">
               <div className="flex items-center justify-between mb-2">
                 <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Item</label>
               </div>
               <AsyncSelect
                  isMulti
                  cacheOptions
                  defaultOptions
                  loadOptions={loadItemOptions}
                  placeholder="Search and choose one or more items..."
                  value={selectedNewItems}
                  onChange={(options: any) => setSelectedNewItems(options || [])}
                  isClearable
                  noOptionsMessage={({ inputValue }) => !inputValue ? "Type to search items..." : "No items found"}
                  menuPortalTarget={document.body}
                  styles={{
                    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
                    control: (base: any) => ({ ...base, borderColor: '#e5e7eb', boxShadow: 'none', '&:hover': { borderColor: '#d1d5db' } })
                  }}
                />
             </div>
             
             <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
               <Button variant="ghost" onClick={closeAddModal}>Cancel</Button>
               <Button variant="primary" onClick={handleAddMapping} disabled={selectedNewItems.length === 0 || isAdding}>
                 {isAdding ? 'Adding...' : `Add Mapping${selectedNewItems.length > 1 ? ` (${selectedNewItems.length})` : ''}`}
               </Button>
             </div>
           </div>
        </Modal>
      )}

      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onShowToast={onShowToast}
          parentTab={activeTab}
          tabsOnly={['Price Build-up', 'BOM / Route Flow', 'Weights & Drawings']}
          onRemoveMapping={handleRemoveMapping}
        />
      )}

      {itemToRemove && (
        <Modal onClose={() => setItemToRemove(null)} title="Confirm Removal">
          <div className="p-6">
            <p className="text-sm text-gray-700 mb-6">
              Are you sure you want to remove the mapping for item <span className="text-[#A02828] font-semibold">{itemToRemove}</span>?
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setItemToRemove(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmRemoveMapping}>
                Remove
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showMultiDeleteModal && (
        <Modal onClose={() => setShowMultiDeleteModal(false)} title="Confirm Removal">
          <div className="p-6">
            <p className="text-sm text-gray-700 mb-6">
              {selectedIds.size === 1 
                ? `Are you sure you want to remove the selected record?`
                : `Are you sure you want to remove the selected ${selectedIds.size} records?`}
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setShowMultiDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={isDeletingMulti} onClick={async () => {
                setIsDeletingMulti(true);
                let successCount = 0;
                for (const code of selectedIds) {
                  try {
                    await customerApi.deleteItem(customer.bpCode, code, activeTab);
                    successCount++;
                  } catch (err: any) {
                    console.error('Failed to delete', err);
                  }
                }
                queryClient.invalidateQueries({ queryKey: ['customer-items', customer.bpCode] });
                if (onShowToast) onShowToast(`Successfully removed ${successCount} record(s).`, 'success');
                setSelectedIds(new Set());
                setShowMultiDeleteModal(false);
                setIsDeletingMulti(false);
              }}>
                Remove
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
