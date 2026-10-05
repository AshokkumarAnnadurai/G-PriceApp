import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import React,{ useMemo,useRef,useState } from 'react';
import AsyncSelect from 'react-select/async';
import { itemApi } from '../api/itemApi';
import { pricingApi } from '../api/pricingApi';
import { vendorApi } from '../api/vendorApi';
import {
  Button,
  Card,
  ColumnFilterPopover,
  ErrorState,Loader,
  Modal,
  Pagination,
  SearchableSelect
} from '../components/ui';
import { BRAND,PAGE_SIZE } from '../constants';
import { PAGE_TITLES } from '../constants/pageHeaders';
import { Vendor,VendorMaterial } from '../types';
import { exportVendorToExcel,parseVendorImportFile } from '../utils/vendorExcel';
import { VendorWeightDrawingsPanel } from './VendorWeightDrawingsPanel';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const computeQuarterRange = (fromStr: string | null | undefined, toStr: string | null | undefined) => {
  if (!fromStr || !toStr) return '—';
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return '—';

  const isSameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear();
  const diffDays = Math.ceil(Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (isSameMonth || diffDays <= 31) {
    return `${MONTH_NAMES[fromDate.getMonth()]} ${fromDate.getFullYear()}`;
  }

  const q = Math.ceil((toDate.getMonth() + 1) / 3);
  return `Q${q} ${toDate.getFullYear()}`;
};

const getEndOfMonth = (val: string) => {
  if (!val) return null;
  const parts = val.split('-');
  const y = parts[0];
  const m = parts[1];
  if (!y || !m) return null;
  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  return `${y}-${m}-${lastDay}`;
};

// ── Styles (matching CustomerListPage) ───────────────────────────────────────
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

const toLocalDateInputString = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Expanded Pricing Split Panel (inline edit like RM Master) ──────────────────
const PricingSplitPanel: React.FC<{
  vendor: Vendor;
  onRefresh: () => void;
  isParentFiltered?: boolean;
  globalSearch?: string;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}> = ({ vendor, onRefresh, isParentFiltered, globalSearch, onShowToast }) => {
  const qc = useQueryClient();
  const [customerFilter, setCustomerFilter] = useState<Set<string>>(new Set());
  const [castingFilter, setCastingFilter] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVals, setEditVals] = useState({
    mmrRate: 0, roRate: 0, consumablesRate: 0, extraFactor: 0,
    rmWeight: 0, revisedRatePerKg: 0, fromDate: '', toDate: '',
    machineType: '', coating: '', cavity: '', coreSleeve: '',
    itemCode: '', itemDescription: '',
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [unmapTarget, setUnmapTarget] = useState<VendorMaterial | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isDeletingMulti, setIsDeletingMulti] = useState(false);
  const [imageUploadTarget, setImageUploadTarget] = useState<VendorMaterial | null>(null);

  const recalcRate = (mmr: number, ro: number, cons: number, extra: number) =>
    +(mmr + ro + cons + extra).toFixed(2);

  const editMutation = useMutation({
    mutationFn: (m: VendorMaterial) =>
      vendorApi.updateMaterial(vendor.id, m.id, {
        customerName: m.customerName,
        castingCode: m.castingCode,
        rmWeight: editVals.rmWeight,
        revisedRatePerKg: editVals.revisedRatePerKg,
        mmrRate: editVals.mmrRate,
        roRate: editVals.roRate,
        consumablesRate: editVals.consumablesRate,
        extraFactor: editVals.extraFactor,
        fromDate: editVals.fromDate ? `${editVals.fromDate.substring(0, 7)}-01` : undefined,
        toDate: editVals.toDate ? getEndOfMonth(editVals.toDate.substring(0, 7)) || undefined : undefined,
        machineType: editVals.machineType || undefined,
        coating: editVals.coating || undefined,
        cavity: editVals.cavity || undefined,
        coreSleeve: editVals.coreSleeve || undefined,
        itemCode: editVals.itemCode || undefined,
        itemDescription: editVals.itemDescription || undefined,
      }),
    onSuccess: (updatedMaterial: any) => {
      qc.setQueriesData({ queryKey: ['vendors-paginated'] }, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((v: any) => {
            if (v.id.trim() === vendor.id.trim()) {
              return {
                ...v,
                materials: v.materials.map((m: any) =>
                  m.id === updatedMaterial.id ? updatedMaterial : m
                ),
              };
            }
            return v;
          }),
        };
      });
      qc.setQueryData(['vendors-all'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((v: any) => {
          if (v.id.trim() === vendor.id.trim()) {
            return {
              ...v,
              materials: v.materials.map((m: any) =>
                m.id === updatedMaterial.id ? updatedMaterial : m
              ),
            };
          }
          return v;
        });
      });
      qc.invalidateQueries({ queryKey: ['vendors-all'] });
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      onRefresh();
      setEditingId(null);
      setMutationError(null);
    },
    onError: (err: any) => {
      console.error('Vendor material edit error:', err);
      setMutationError(err.response?.data?.message || err.message || 'Failed to save changes.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: number) => vendorApi.deleteMaterial(vendor.id, materialId),
    onSuccess: (_, deletedMaterialId: number) => {
      qc.setQueriesData({ queryKey: ['vendors-paginated'] }, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((v: any) => {
            if (v.id.trim() === vendor.id.trim()) {
              return {
                ...v,
                materials: v.materials.filter((m: any) => m.id !== deletedMaterialId),
              };
            }
            return v;
          }),
        };
      });
      qc.setQueryData(['vendors-all'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((v: any) => {
          if (v.id.trim() === vendor.id.trim()) {
            return {
              ...v,
              materials: v.materials.filter((m: any) => m.id !== deletedMaterialId),
            };
          }
          return v;
        });
      });
      qc.invalidateQueries({ queryKey: ['vendors-all'] });
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      onRefresh();
      setMutationError(null);
    },
    onError: (err: any) => {
      console.error('Vendor material delete error:', err);
      setMutationError(err.response?.data?.message || err.message || 'Failed to remove material mapping.');
    }
  });

  const startEdit = (m: VendorMaterial) => {
    setEditingId(m.id);
    setMutationError(null);
    setEditVals({
      mmrRate: m.mmrRate,
      roRate: m.roRate,
      consumablesRate: m.consumablesRate,
      extraFactor: m.extraFactor,
      fromDate: toLocalDateInputString(m.fromDate),
      toDate: toLocalDateInputString(m.toDate),
      rmWeight: m.rmWeight ?? 0,
      revisedRatePerKg: m.revisedRatePerKg ?? recalcRate(m.mmrRate, m.roRate, m.consumablesRate, m.extraFactor),
      machineType: m.machineType ?? '',
      coating: m.coating ?? '',
      cavity: m.cavity ?? '',
      coreSleeve: m.coreSleeve ?? '',
      itemCode: m.itemCode ?? '',
      itemDescription: m.itemDescription ?? '',
    });
  };

  const customerOptions = Array.from(new Set(vendor.materials.map(m => m.customerName))).filter(Boolean).sort().map(c => ({ label: c, value: c }));
  const castingOptions = Array.from(new Set(vendor.materials.map(m => m.castingCode))).filter(Boolean).sort().map(c => ({ label: c, value: c }));
  const gradeOptions = Array.from(new Set(vendor.materials.map(m => m.grade))).filter(Boolean).sort().map(g => ({ label: g, value: g }));

  const hasItemSearchMatch = globalSearch 
    ? vendor.materials.some(m => 
        String(m.itemCode || '').toLowerCase().includes(globalSearch.toLowerCase()) ||
        String(m.castingCode || '').toLowerCase().includes(globalSearch.toLowerCase())
      )
    : false;

  const filtered = vendor.materials.filter(m => {
    const matchCust = customerFilter.size === 0 || customerFilter.has(m.customerName);
    const matchCasting = castingFilter.size === 0 || castingFilter.has(m.castingCode);
    const matchGrade = gradeFilter.size === 0 || gradeFilter.has(m.grade);
    const matchSearch = (globalSearch && hasItemSearchMatch) 
      ? (
          String(m.itemCode || '').toLowerCase().includes(globalSearch.toLowerCase()) ||
          String(m.castingCode || '').toLowerCase().includes(globalSearch.toLowerCase())
        )
      : true;
    return matchCust && matchCasting && matchGrade && matchSearch;
  });

  const inSty: React.CSSProperties = {
    width: '72px', padding: '3px 6px', fontSize: '0.75rem',
    border: `1px solid ${BRAND.RED}`, borderRadius: '4px',
    outline: 'none', textAlign: 'right', fontFamily: 'monospace',
  };

  const COLS = 15; // total column count including new ones (added Item Description)

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, background: '#f9fafb', borderBottom: `1px solid ${BRAND.BORDER}` }}>
        <div style={{ padding: '16px 24px 20px', borderTop: `2px solid ${BRAND.RED}` }}>

          {/* Sub-header */}
          {mutationError && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', border: `1px solid ${BRAND.RED}`, color: BRAND.RED, borderRadius: '4px', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 500 }}>
              Error: {mutationError}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Pricing Split — {vendor.name}
              <span style={{ marginLeft: '8px', background: '#fee2e2', color: BRAND.RED, borderRadius: '4px', padding: '1px 8px', fontSize: '0.7rem' }}>
                {vendor.materials.length} Casting Code{vendor.materials.length !== 1 ? 's' : ''}
              </span>
            </span>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="danger" onClick={() => setShowMultiDeleteModal(true)}>
                Delete Selected ({selectedIds.size})
              </Button>
            )}
          </div>

          {/* Materials sub-table */}
          {vendor.materials.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: BRAND.GRAY_TEXT, fontSize: '0.875rem' }}>
              No grades configured for this vendor.
            </div>
          ) : (
            <div className="max-w-[calc(100vw-32px)] md:max-w-[calc(100vw-340px)]" style={{ border: `1px solid ${BRAND.BORDER}`, borderRadius: '8px', overflowX: 'auto', overflowY: 'auto', background: 'white', maxHeight: isParentFiltered ? '600px' : '340px' }}>
              <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.BORDER}`, background: '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ ...th, padding: '8px 12px', width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map(m => m.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    <th style={{ ...th, padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Foreign Name
                        {customerOptions.length > 0 && <ColumnFilterPopover options={customerOptions} selectedValues={customerFilter} onChange={setCustomerFilter} title="Foreign Name" />}
                      </div>
                    </th>
                    <th style={{ ...th, padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Casting Code
                        {castingOptions.length > 0 && <ColumnFilterPopover options={castingOptions} selectedValues={castingFilter} onChange={setCastingFilter} title="Casting Code" />}
                      </div>
                    </th>
                    <th style={{ ...th, padding: '8px 12px' }}>Type of Machine</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Coating</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Cavity</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Core/sleeve</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Item Description</th>
                    <th style={{ ...th, padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Grade
                        {gradeOptions.length > 0 && <ColumnFilterPopover options={gradeOptions} selectedValues={gradeFilter} onChange={setGradeFilter} title="Grade" />}
                      </div>
                    </th>
                    <th style={{ ...th, padding: '8px 12px' }}>Valid From</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Valid To</th>
                    <th style={{ ...th, padding: '8px 12px' }}>Quarter</th>

                    <th style={{ ...th, padding: '8px 12px', textAlign: 'right' }}>RM WT</th>
                    <th style={{ ...th, padding: '8px 12px', textAlign: 'right' }}>Revised Rate/Kg</th>
                    <th style={{ ...th, padding: '8px 12px', textAlign: 'right' }}>Total RM Price</th>
                    <th style={{ ...th, padding: '8px 12px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={COLS + 1} style={{ padding: '16px', textAlign: 'center', color: BRAND.GRAY_TEXT, fontStyle: 'italic' }}>
                        No materials match the selected filters.
                      </td>
                    </tr>
                  ) : filtered.map(m => {
                    const isEditing = editingId === m.id;
                    const totalRM = isEditing
                      ? editVals.rmWeight * editVals.revisedRatePerKg
                      : (m.rmWeight || 0) * (m.revisedRatePerKg || 0);

                    return (
                      <tr key={m.id}
                        style={{ borderTop: `1px solid ${BRAND.BORDER}`, background: isEditing ? '#fef9f9' : 'white' }}
                        onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = 'white'; }}
                      >
                        {/* Checkbox column */}
                        <td style={{ ...td, padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(m.id)}
                            onChange={e => {
                              const newSet = new Set(selectedIds);
                              if (e.target.checked) newSet.add(m.id);
                              else newSet.delete(m.id);
                              setSelectedIds(newSet);
                            }}
                          />
                        </td>
                        {/* Static columns */}
                        <td style={{ ...td, padding: '8px 12px', fontWeight: 500, color: '#111827' }}>{m.customerName}</td>
                        <td style={{ ...td, padding: '8px 12px' }}>
                          <code style={{ fontSize: '0.75rem', fontWeight: 700, color: BRAND.RED }}>{m.castingCode}</code>
                        </td>

                        {/* Type of Machine */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              style={{ ...inSty, width: '110px', textAlign: 'left' }}
                              value={editVals.machineType}
                              onChange={e => setEditVals(p => ({ ...p, machineType: e.target.value }))}
                            />
                          ) : m.machineType || '—'}
                        </td>

                        {/* Coating */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              style={{ ...inSty, width: '90px', textAlign: 'left' }}
                              value={editVals.coating}
                              onChange={e => setEditVals(p => ({ ...p, coating: e.target.value }))}
                            />
                          ) : m.coating || '—'}
                        </td>

                        {/* Cavity */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              style={{ ...inSty, width: '70px', textAlign: 'left' }}
                              value={editVals.cavity}
                              onChange={e => setEditVals(p => ({ ...p, cavity: e.target.value }))}
                            />
                          ) : m.cavity || '—'}
                        </td>

                        {/* Core/sleeve */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              style={{ ...inSty, width: '90px', textAlign: 'left' }}
                              value={editVals.coreSleeve}
                              onChange={e => setEditVals(p => ({ ...p, coreSleeve: e.target.value }))}
                            />
                          ) : m.coreSleeve || '—'}
                        </td>
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>{m.itemDescription || '—'}</td>
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>{m.grade}</td>

                        {/* Valid From */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="date"
                              style={{ ...inSty, width: '150px', textAlign: 'left' }}
                              value={editVals.fromDate}
                              onChange={e => setEditVals(p => ({ ...p, fromDate: e.target.value }))}
                            />
                          ) : m.fromDate ? new Date(m.fromDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
                        </td>

                        {/* Valid To */}
                        <td style={{ ...td, padding: '8px 12px', color: '#374151' }}>
                          {isEditing ? (
                            <input
                              type="date"
                              style={{ ...inSty, width: '150px', textAlign: 'left' }}
                              value={editVals.toDate}
                              onChange={e => setEditVals(p => ({ ...p, toDate: e.target.value }))}
                            />
                          ) : m.toDate ? new Date(m.toDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
                        </td>

                        {/* Quarter & Month */}
                        <td style={{ ...td, padding: '8px 12px', color: '#6b7280', fontStyle: 'italic', fontSize: '0.75rem' }}>
                          {computeQuarterRange(
                            isEditing ? editVals.fromDate : m.fromDate,
                            isEditing ? editVals.toDate : m.toDate
                          )}
                        </td>



                        {/* RM WT */}
                        <td style={{ ...td, padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {isEditing ? (
                            <input type="number" step="1" style={inSty} value={editVals.rmWeight === 0 ? '' : editVals.rmWeight}
                              onChange={e => setEditVals(p => ({ ...p, rmWeight: parseFloat(e.target.value) || 0 }))} />
                          ) : `${(m.rmWeight || 0).toFixed(2)} kg`}
                        </td>

                        {/* Revised Rate/Kg — editable */}
                        <td style={{ ...td, padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {isEditing ? (
                            <input type="number" step="0.01"
                              value={editVals.revisedRatePerKg === 0 ? '' : editVals.revisedRatePerKg}
                              onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                setEditVals(p => ({ ...p, revisedRatePerKg: v }));
                              }}
                              style={inSty} />
                          ) : `₹${(m.revisedRatePerKg || 0).toFixed(2)}`}
                        </td>

                        {/* Total RM Price */}
                        <td style={{ ...td, padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: BRAND.RED }}>
                          ₹{totalRM.toFixed(2)}
                        </td>

                        {/* Actions */}
                        <td style={{ ...td, padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isEditing ? (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); editMutation.mutate(m); }}
                                disabled={editMutation.isPending}
                                style={{ height: '24px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 600, color: 'white', background: '#059669', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '6px' }}
                              >
                                {editMutation.isPending ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setEditingId(null); }}
                                disabled={editMutation.isPending}
                                style={{ height: '24px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 600, color: '#374151', background: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={e => { e.stopPropagation(); setImageUploadTarget(m); }}
                                title="Upload Weights & Drawings"
                                style={{ height: '24px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 600, color: BRAND.RED, border: `1px solid ${BRAND.RED}`, borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                              >
                                Image Upload
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); startEdit(m); }}
                                style={{ height: '24px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 600, color: BRAND.RED, border: `1px solid ${BRAND.RED}`, borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                              >
                                Edit
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setUnmapTarget(m);
                                }}
                                disabled={deleteMutation.isPending}
                                style={{ height: '24px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {imageUploadTarget && (
            <VendorWeightDrawingsPanel
              vendor={{ id: vendor.id, name: vendor.name, groupName: vendor.groupName ?? '' }}
              material={{ id: imageUploadTarget.id, itemCode: imageUploadTarget.itemCode ?? '', itemDescription: imageUploadTarget.itemDescription ?? '' }}
              onClose={() => setImageUploadTarget(null)}
              onShowToast={onShowToast}
            />
          )}

          {showMultiDeleteModal && (
            <Modal title="Confirm Removal" onClose={() => setShowMultiDeleteModal(false)}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {selectedIds.size === 1 
                    ? `Are you sure you want to remove the selected record?`
                    : `Are you sure you want to remove the selected ${selectedIds.size} records?`}
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="secondary" onClick={() => setShowMultiDeleteModal(false)}>Cancel</Button>
                  <Button type="button" variant="danger" loading={isDeletingMulti} onClick={async () => {
                    setIsDeletingMulti(true);
                    let successCount = 0;
                    for (const id of selectedIds) {
                      try {
                        await vendorApi.deleteMaterial(vendor.id, id);
                        successCount++;
                      } catch (err: any) {
                        console.error('Failed to delete', err);
                      }
                    }
                    qc.invalidateQueries({ queryKey: ['vendors-all'] });
                    qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
                    onRefresh();
                    if (onShowToast) {
                      onShowToast(`Successfully removed ${successCount} record(s).`, 'success');
                    }
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

          {unmapTarget && (
            <Modal
              title="Confirm Removal"
              onClose={() => setUnmapTarget(null)}
            >
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Are you sure you want to remove the mapping for <strong>{unmapTarget.castingCode}</strong>?
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setUnmapTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    loading={deleteMutation.isPending}
                    onClick={() => {
                      deleteMutation.mutate(unmapTarget.id, {
                        onSuccess: () => {
                          setUnmapTarget(null);
                        }
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      </td>
    </tr>
  );
};

// â”€â”€ Vendor Master Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VendorMasterPage: React.FC = () => {
  const qc = useQueryClient();
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchGroup, setSearchGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  // Query to get ALL vendors (without pagination) for filter dropdown options
  const { data: allVendors = [] as Vendor[] } = useQuery<Vendor[]>({
    queryKey: ['vendors-all'],
    queryFn: () => vendorApi.getAll(),
  });

  // Query to get paginated and filtered vendors for the table
  const { data: paginatedData, isLoading, isFetching, isError, error, refetch: refetchVendors } = useQuery<{ items: Vendor[]; total: number }>({
    queryKey: ['vendors-paginated', page, pageSize, search, searchName, searchCode, searchGroup],
    queryFn: () => vendorApi.getAll(page, pageSize, search, searchName, searchCode, searchGroup),
  });

  const pageRows = paginatedData?.items ?? [];
  const totalRecords = paginatedData?.total ?? 0;
  
  
  const uniqueNames = useMemo(() => {
    let list = allVendors;
    if (searchCode) list = list.filter(v => v.bpCode === searchCode);
    if (searchGroup) list = list.filter(v => (v.groupName || '') === searchGroup);
    return Array.from(new Set(list.map(v => v.name))).sort();
  }, [allVendors, searchCode, searchGroup]);

  const uniqueCodes = useMemo(() => {
    let list = allVendors;
    if (searchName) list = list.filter(v => v.name === searchName);
    if (searchGroup) list = list.filter(v => (v.groupName || '') === searchGroup);
    return Array.from(new Set(list.map(v => v.bpCode))).sort();
  }, [allVendors, searchName, searchGroup]);

  const uniqueGroups = useMemo(() => {
    let list = allVendors;
    if (searchName) list = list.filter(v => v.name === searchName);
    if (searchCode) list = list.filter(v => v.bpCode === searchCode);
    return Array.from(new Set(list.map(v => v.groupName || ''))).filter(Boolean).sort();
  }, [allVendors, searchName, searchCode]);

  const isFiltered = !!(search || searchName || searchCode || searchGroup);
  const clearFilters = () => { setSearch(''); setSearchName(''); setSearchCode(''); setSearchGroup(''); setPage(1); };

  // â”€â”€ Export / Import Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [mappingVendor, setMappingVendor] = useState<Vendor | null>(null);
  const [selectedMappingItems, setSelectedMappingItems] = useState<any[]>([]);

  const loadOptions = async (inputValue: string) => {
    try {
      const res = await itemApi.list({
        search: inputValue,
        page: 1,
        pageSize: 50
      });
      return (res.items ?? []).map(i => ({
        value: i.itemCode,
        label: `${i.itemCode} - ${i.description || 'No Description'} (Grade: ${i.grade || 'N/A'}, Casting: ${i.castingCode || 'N/A'})`
      }));
    } catch (error) {
      console.error(error);
      return [];
    }
  };

  const mapItemsMutation = useMutation({
    mutationFn: async (selectedItems: { value: string; label: string }[]) => {
      const itemCodes = selectedItems.map(i => i.value);
      return await Promise.all(itemCodes.map(code => itemApi.mapVendors(code, [mappingVendor!.id])));
    },
    onSuccess: (results: any[]) => {
      let totalMapped = 0;
      let totalSkipped = 0;
      if (results && Array.isArray(results)) {
        for (const r of results) {
          totalMapped += r?.mappedCount ?? 0;
          totalSkipped += r?.skippedCount ?? 0;
        }
      }

      // Keep the vendor row expanded so the user can see the new item appear
      const vendorIdToExpand = mappingVendor?.id ?? null;
      setMappingVendor(null);
      setSelectedMappingItems([]);
      if (vendorIdToExpand) {
        setExpandedVendorId(vendorIdToExpand);
      }

      // In TanStack Query v5, invalidateQueries is the correct API to override
      // staleTime and force an immediate background refetch for active subscribers.
      // refetchQueries skips queries that are still within their stale window.
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      qc.invalidateQueries({ queryKey: ['vendors-all'] });

      if (totalSkipped > 0 && totalMapped === 0) {
        showToast('Selected item(s) are already mapped to this vendor.', 'error');
      } else if (totalSkipped > 0 && totalMapped > 0) {
        showToast(`Mapped ${totalMapped} new item(s). ${totalSkipped} item(s) were already mapped.`, 'success');
      } else {
        showToast('Items mapped to vendor successfully!', 'success');
      }
    },
    onError: (err: any) => {
      showToast(`Mapping failed: ${err.message}`, 'error');
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingVendor, setImportingVendor] = useState<Vendor | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importErrorCount, setImportErrorCount] = useState(0);

  const confirmImportMutation = useMutation({
    mutationFn: async () => {
      const validRows = importPreviewRows.filter(r => !r.validationErrors || r.validationErrors.length === 0);
      console.log('[IMPORT SUBMIT] total rows:', importPreviewRows.length, 'valid rows:', validRows.length);
      const skipped = importPreviewRows.filter(r => r.validationErrors && r.validationErrors.length > 0);
      if (skipped.length > 0) console.log('[IMPORT SUBMIT] skipped rows (have errors):', JSON.stringify(skipped.map(r => ({ castingCode: r.castingCode, errors: r.validationErrors }))));
      const targetVendor = importingVendor;
      if (!targetVendor) throw new Error("No vendor selected for import");

      // Group rows by material key + quarter key
      // Material key: `${grade}|${customerName || 'All'}|${castingCode || 'All'}|${machineType || ''}|${coating || ''}|${cavity || ''}|${coreSleeve || ''}`
      // Quarter key: e.g. "2026-Q3"
      const materialQuarterGroups = new Map<string, any[]>();
      for (const r of validRows) {
        const date = new Date(r.fromDate || '');
        if (isNaN(date.getTime())) continue;
        const year = date.getFullYear();
        const month = date.getMonth();
        const q = Math.floor(month / 3) + 1;
        
        const matKey = `${r.grade}|${r.customerName || 'All'}|${r.castingCode || 'All'}|${r.itemCode || ''}|${r.itemDescription || ''}|${r.machineType || ''}|${r.coating || ''}|${r.cavity || ''}|${r.coreSleeve || ''}`;
        const key = `${matKey}|${year}-Q${q}`;
        
        if (!materialQuarterGroups.has(key)) {
          materialQuarterGroups.set(key, []);
        }
        materialQuarterGroups.get(key)!.push(r);
      }

      const rowsToSubmit: any[] = [];

      materialQuarterGroups.forEach((rows) => {
        // Sort chronologically by fromDate
        const sorted = [...rows].sort((a, b) => (a.fromDate || '').localeCompare(b.fromDate || ''));
        
        if (sorted.length <= 1) {
          rowsToSubmit.push(...sorted);
          return;
        }

        // Check if all months in the quarter have identical rates and weights
        const first = sorted[0];
        const isIdentical = sorted.every(r => 
          Number(r.rmWeight || 0) === Number(first.rmWeight || 0) &&
          Number(r.revisedRatePerKg || 0) === Number(first.revisedRatePerKg || 0) &&
          Number(r.mmrRate || 0) === Number(first.mmrRate || 0) &&
          Number(r.roRate || 0) === Number(first.roRate || 0) &&
          Number(r.consumablesRate || 0) === Number(first.consumablesRate || 0) &&
          Number(r.extraFactor || 0) === Number(first.extraFactor || 0)
        );

        if (isIdentical) {
          // Aggregate to a single row spanning the whole range of identical months
          const last = sorted[sorted.length - 1];
          rowsToSubmit.push({
            ...last,
            fromDate: first.fromDate,
            toDate: last.toDate
          });
        } else {
          // Submit all monthly rows individually in chronological order
          rowsToSubmit.push(...sorted);
        }
      });

      // Sort all final rows to submit chronologically by fromDate so that newer active values overwrite older ones correctly
      rowsToSubmit.sort((a, b) => (a.fromDate || '').localeCompare(b.fromDate || ''));

      const results: { status: 'fulfilled' | 'rejected'; value?: any; reason?: any }[] = [];
      for (const r of rowsToSubmit) {
        try {
          const res = await vendorApi.addMaterial(targetVendor.id, {
            grade: r.grade,
            customerName: r.customerName || 'All',
            castingCode: r.castingCode || 'All',
            fromDate: r.fromDate || '',
            toDate: r.toDate || '',
            rmWeight: r.rmWeight || 0,
            revisedRatePerKg: r.revisedRatePerKg || 0,
            mmrRate: r.mmrRate || 0,
            roRate: r.roRate || 0,
            consumablesRate: r.consumablesRate || 0,
            extraFactor: r.extraFactor ?? 0,
            machineType: r.machineType || undefined,
            coating: r.coating || undefined,
            cavity: r.cavity || undefined,
            coreSleeve: r.coreSleeve || undefined,
            itemCode: r.itemCode || undefined,
            itemDescription: r.itemDescription || undefined,
          });
          results.push({ status: 'fulfilled', value: res });
        } catch (err) {
          results.push({ status: 'rejected', reason: err });
        }
      }

      const failed = results.filter(r => r.status === 'rejected');
      const errorMsgs: string[] = [];
      if (failed.length > 0) {
        console.warn('[IMPORT SUBMIT] failed rows:', failed.map(f => f.reason?.message));
        failed.forEach((f, idx) => {
          const msg = f.reason?.response?.data?.error || f.reason?.message || 'Import failed';
          errorMsgs.push(`Row ${idx + 1}: ${msg}`);
        });
      }
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      return { succeeded, failed: failed.length, errors: errorMsgs };
    },
    onSuccess: (result) => {
      // invalidateQueries overrides staleTime (30s) and forces an immediate
      // background refetch for active subscribers — refetchQueries does not.
      qc.invalidateQueries({ queryKey: ['vendors-all'] });
      qc.invalidateQueries({ queryKey: ['vendors-paginated'] });
      // Keep the imported vendor's row expanded so the user sees changes immediately
      if (importingVendor?.id) {
        setExpandedVendorId(importingVendor.id);
      }
      setIsImportModalOpen(false);
      if (result.failed > 0) {
        if (result.errors && result.errors.length > 0) {
          alert(`Import completed with errors:\n\n${result.errors.slice(0, 15).join('\n')}${result.errors.length > 15 ? '\n...and more' : ''}`);
        }
        showToast(`Imported ${result.succeeded} rows. ${result.failed} row(s) failed.`, 'error');
      } else {
        showToast(`Successfully imported ${result.succeeded} materials!`, 'success');
      }
    },
    onError: (err: any) => {
      showToast(`Import failed: ${err.message}`, 'error');
    }
  });

  const handleExportTemplate = async (targetVendor: Vendor, isHistory: boolean = false) => {
    try {
      showToast('Exporting...', 'success');
      let priceLogs = undefined;
      if (isHistory) {
        priceLogs = await pricingApi.getPriceLog(undefined, undefined, targetVendor.bpCode);
      }
      exportVendorToExcel(targetVendor, isHistory, priceLogs);
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'error');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetVendor = importingVendor;
    if (!targetVendor) {
      showToast('Please select a vendor to import.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const { parsedRows, errCount, warnings } = await parseVendorImportFile(file);
      warnings.forEach(w => showToast(w, 'success'));
      setImportErrorCount(errCount);
      setImportPreviewRows(parsedRows);
      setIsImportModalOpen(true);
    } catch (err: any) {
      showToast(`Failed to parse Excel: ${err.message}`, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedVendorId(prev => (prev === id ? null : id));

  if (isError) return <div className="p-8"><ErrorState message={String(error)} /></div>;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3F4F6] overflow-hidden">
      <div className="bg-white border-b border-gray-200 z-30 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">{PAGE_TITLES.VENDOR_MASTER}</h1>
            <span className="text-sm text-gray-500 font-medium">({totalRecords} vendor{totalRecords !== 1 ? 's' : ''})</span>
            {isFetching && (
              <span className="inline-flex items-center gap-2 text-xs text-[#A02828] font-semibold bg-red-50/70 border border-red-100 px-2.5 py-1 rounded-lg select-none">
                <Loader size="sm" label="Syncing changes…" />
                Syncing changes...
              </span>
            )}
          </div>
          <div className="flex gap-3 items-center shrink-0">

            {/* Search */}
            <div className="relative shrink-0">
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search vendor name, code, group, casting code…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="h-[38px] pl-9 pr-8 rounded-lg border text-sm focus:outline-none focus:ring-1 bg-white"
                style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED, width: '260px' } as React.CSSProperties}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-lg">×</button>
              )}
            </div>

            <SearchableSelect value={searchName} onChange={val => { setSearchName(val); setPage(1); }} className="w-56" options={uniqueNames} placeholder="Select Vendor" align="right" />
            <SearchableSelect value={searchCode} onChange={val => { setSearchCode(val); setPage(1); }} className="w-44" options={uniqueCodes} placeholder="Select Code" align="right" />
            <SearchableSelect value={searchGroup} onChange={val => { setSearchGroup(val); setPage(1); }} className="w-44" options={uniqueGroups} placeholder="Select Group" align="right" />

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx, .xls"
              className="hidden"
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
        {/* ── Table ── */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm"><Loader size='md' /></div>
        ) : (
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
              <table className="w-full min-w-[1000px] text-sm border-collapse relative">
                <thead className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200">
                  <tr>
                    <th style={{ ...th, width: '32px' }} />
                    <th style={{ ...th, textAlign: 'left' }}>Vendor Name</th>
                    <th style={{ ...th, textAlign: 'left' }}>Vendor Code</th>
                    <th style={{ ...th, textAlign: 'left' }}>Group Name</th>
                    <th style={{ ...th, textAlign: 'center' }}>Grades Configured</th>
                    <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} style={{ ...td, padding: '64px 16px', textAlign: 'center', color: BRAND.GRAY_TEXT }}>Loading…</td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...td, padding: '64px 16px', textAlign: 'center', color: BRAND.GRAY_TEXT }}>No vendors found.</td>
                    </tr>
                  ) : pageRows.map(v => {
                    const isExpanded = expandedVendorId === v.id;
                    const gradeCount = new Set(v.materials.map(m => m.grade)).size;
                    return (
                      <React.Fragment key={v.id}>
                        {/* Main vendor row */}
                        <tr
                          onClick={() => toggleExpand(v.id)}
                          style={{
                            borderBottom: isExpanded ? 'none' : `1px solid ${BRAND.BORDER}`,
                            cursor: 'pointer',
                            background: 'white',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f9fafb'; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                        >
                          {/* Expand chevron */}
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

                          {/* Vendor name */}
                          <td style={td}>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{v.name}</span>
                          </td>

                          <td style={td}>
                            <code style={{ fontWeight: 700, color: BRAND.RED }}>{v.bpCode || '—'}</code>
                          </td>

                          <td style={{ ...td, color: '#6b7280' }}>{v.groupName || '—'}</td>

                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px',
                              borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                              background: gradeCount > 0 ? '#fee2e2' : '#f3f4f6',
                              color: gradeCount > 0 ? BRAND.RED : '#6b7280',
                            }}>
                              {gradeCount} grade{gradeCount !== 1 ? 's' : ''}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ ...td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleExportTemplate(v, true)}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded border border-[#A02828] bg-white text-[#A02828] hover:bg-[#A02828] hover:text-white hover:shadow-sm transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Export current valid periods"
                              >
                                <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                              </button>
                              <button
                                onClick={() => {
                                  setImportingVendor(v);
                                  fileInputRef.current?.click();
                                }}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded bg-[#A02828] text-white hover:bg-[#8B2323] shadow-sm hover:shadow transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Import Excel"
                              >
                                <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Import
                              </button>
                              <button
                                onClick={() => setMappingVendor(v)}
                                className="group relative px-3 py-1.5 text-[13px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm transition-all duration-200 ease-out flex items-center gap-1.5 whitespace-nowrap"
                                title="Map Items"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                Map Items
                              </button>
                            </div>
                          </td>

                        </tr>

                        {/* Expanded pricing split */}
                        {isExpanded && (
                          <PricingSplitPanel vendor={v} onRefresh={refetchVendors} isParentFiltered={isFiltered} globalSearch={search} onShowToast={showToast} />
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
        )}
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
                <span className="text-base">⚠️</span>
                <div>
                  <p className="font-semibold">Validation Errors Found ({importErrorCount} issues)</p>
                  <p className="text-xs mt-0.5">Please fix these errors in your Excel file and upload again. Import is disabled while errors exist.</p>
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-x-auto max-h-[50vh] overflow-y-auto bg-white">
              <table className="w-full text-xs text-left min-w-[1500px]">
                <thead className="bg-gray-50 sticky top-0 border-b font-semibold text-gray-600 z-10 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                  <tr>
                    <th className="px-3 py-2">Validation</th>
                    <th className="px-3 py-2">Foreign Name</th>
                    <th className="px-3 py-2">Casting Code</th>
                    <th className="px-3 py-2">Type of Machine</th>
                    <th className="px-3 py-2">Coating</th>
                    <th className="px-3 py-2">Cavity</th>
                    <th className="px-3 py-2">Core/Sleeve</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Valid From</th>
                    <th className="px-3 py-2">Valid To</th>
                    <th className="px-3 py-2 text-right">RM Weight</th>
                    <th className="px-3 py-2 text-right">Revised Rate</th>
                    <th className="px-3 py-2 text-right">Total RM Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importPreviewRows.map((row) => {
                    const formatDateDMY = (dateStr: string) => {
                      if (!dateStr) return '—';
                      const parts = dateStr.split('-');
                      if (parts.length === 3 && parts[0].length === 4) {
                        return `${parts[2]}-${parts[1]}-${parts[0]}`;
                      }
                      return dateStr;
                    };
                    const hasErrors = row.validationErrors && row.validationErrors.length > 0;
                    const totalRM = (row.rmWeight || 0) * (row.revisedRatePerKg || 0);
                    const fmt = (n: number) => n > 0 ? `₹${n.toFixed(2)}` : '₹0.00';
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50/50 ${hasErrors ? 'bg-red-50/50 text-red-900 font-medium' : ''}`}>
                        <td className="px-3 py-2">
                          {hasErrors ? (
                            <span className="text-red-600 flex items-center gap-1" title={row.validationErrors.join(', ')}>
                              ⚠️ {row.validationErrors[0]}
                            </span>
                          ) : (
                            <span className="text-emerald-600">✅ OK</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{(row.customerName === 'All' || !row.customerName) ? '—' : row.customerName}</td>
                        <td className="px-3 py-2 font-mono">{row.castingCode || 'All'}</td>
                        <td className="px-3 py-2">{row.machineType || '—'}</td>
                        <td className="px-3 py-2">{row.coating || '—'}</td>
                        <td className="px-3 py-2">{row.cavity || '—'}</td>
                        <td className="px-3 py-2">{row.coreSleeve || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.grade}</td>
                        <td className="px-3 py-2 font-mono">{formatDateDMY(row.fromDate)}</td>
                        <td className="px-3 py-2 font-mono">{formatDateDMY(row.toDate)}</td>
                        <td className="px-3 py-2 text-right">{row.rmWeight ? `${row.rmWeight.toFixed(2)} kg` : '0.00 kg'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(row.revisedRatePerKg)}</td>
                        <td className="px-3 py-2 text-right font-semibold font-mono text-red-600">{fmt(totalRM)}</td>
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
              <Button variant="secondary" onClick={() => setIsImportModalOpen(false)} disabled={confirmImportMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => confirmImportMutation.mutate()}
                loading={confirmImportMutation.isPending}
                disabled={importErrorCount > 0}
                style={{ backgroundColor: importErrorCount > 0 ? '#e5e7eb' : BRAND.RED, color: importErrorCount > 0 ? '#9ca3af' : 'white', cursor: importErrorCount > 0 ? 'not-allowed' : 'pointer' }}
              >
                Confirm Import
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {mappingVendor && (
        <Modal
          title={`Map Items to Vendor: ${mappingVendor.name} (${mappingVendor.bpCode || mappingVendor.id})`}
          onClose={() => {
            setMappingVendor(null);
            setSelectedMappingItems([]);
          }}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Select Item(s)</label>
              </div>
              <AsyncSelect
                isMulti
                cacheOptions
                defaultOptions
                loadOptions={loadOptions}
                placeholder="Search and choose one or more items..."
                value={selectedMappingItems}
                onChange={(selected: any) => setSelectedMappingItems(selected || [])}
                className="text-sm"
                noOptionsMessage={({ inputValue }) => !inputValue ? "Type to search items..." : "No items found"}
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
                  setMappingVendor(null);
                  setSelectedMappingItems([]);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={mapItemsMutation.isPending}
                disabled={selectedMappingItems.length === 0}
                onClick={() => {
                  mapItemsMutation.mutate(selectedMappingItems);
                }}
              >
                Save Mapping
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <div
          className="fixed top-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 animate-fade-in border"
          style={{ backgroundColor: toast.type === 'success' ? '#10B981' : BRAND.RED, borderColor: toast.type === 'success' ? '#059669' : BRAND.RED }}
        >
          {toast.type === 'success' ? (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          )}
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
};

export default VendorMasterPage;
