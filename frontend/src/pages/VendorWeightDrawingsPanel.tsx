import { useQuery } from '@tanstack/react-query';
import React,{ useEffect,useState } from 'react';
import { vendorApi } from '../api/vendorApi';
import { SlidePanel } from '../components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const blobToBase64 = (blobUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    fetch(blobUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });

const getImageUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const serverRoot = window.location.origin.includes('localhost')
    ? 'http://localhost:4001'
    : window.location.origin.replace('-pricingapp', '-pricingapi');
  return `${serverRoot}${url}`;
};

const getCategoryForGroup = (groupName: string): string => {
  if (groupName?.toLowerCase().includes('raw') || groupName?.toLowerCase() === 'raw material') {
    return 'Casting Weight';
  }
  return 'Special Process Weight';
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const computeQuarterRange = (fromStr: string | null | undefined, toStr: string | null | undefined) => {
  if (!fromStr || !toStr) return '-';
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return '-';
  
  const year = fromDate.getFullYear();
  const isSameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear();
  const diffDays = Math.ceil(Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (isSameMonth || diffDays <= 31) {
    return `${year}-${MONTH_NAMES[fromDate.getMonth()]}`;
  }

  const month = toDate.getMonth();
  const q = Math.floor(month / 3) + 1;
  return `${year}-Q${q}`;
};

// ─── Slot type ─────────────────────────────────────────────────────────────────

interface Slot {
  id: string;
  url: string;
  name: string;
  weight: number;
}

const makeEmptySlots = (): Slot[] =>
  [1, 2, 3, 4, 5].map(i => ({ id: String(i), url: '', name: '', weight: 0 }));

// ─── Props ─────────────────────────────────────────────────────────────────────

interface VendorWeightDrawingsPanelProps {
  vendor: { id: string; name: string; groupName: string };
  material: { id: number; itemCode: string; itemDescription?: string };
  onClose: () => void;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const VendorWeightDrawingsPanel: React.FC<VendorWeightDrawingsPanelProps> = ({
  vendor,
  material,
  onClose,
  onShowToast,
}) => {
  const category = getCategoryForGroup(vendor.groupName);

  const [selectedMaterialId, setSelectedMaterialId] = useState<number>(material.id);
  const [slots, setSlots] = useState<Slot[]>(makeEmptySlots());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync selectedMaterialId when material prop changes
  useEffect(() => {
    setSelectedMaterialId(material.id);
  }, [material.id]);

  // 1. Fetch available periods for the dropdown list
  const { data: periodsData } = useQuery({
    queryKey: ['vendor-material-periods', vendor.id, material.id],
    queryFn: () => vendorApi.getMaterialPeriods(vendor.id, material.id),
    enabled: !!vendor.id && !!material.id,
  });

  // 2. Fetch drawings/weights data for the selected period
  const { data: dbData, isLoading, refetch } = useQuery({
    queryKey: ['vendor-weight-drawings', vendor.id, selectedMaterialId],
    queryFn: () => vendorApi.getWeightDrawings(vendor.id, selectedMaterialId),
    enabled: !!vendor.id && !!selectedMaterialId,
  });

  // Populate slots when data arrives (either current dbData or empty)
  useEffect(() => {
    if (dbData && dbData.length > 0 && dbData.some((row: any) => row.image_path || row.weight)) {
      setSlots(prev => {
        const next = prev.map(s => ({ ...s, url: '', name: '', weight: 0 }));
        (dbData as any[]).forEach((row: any) => {
          const idx = row.slot_index;
          if (idx >= 0 && idx < next.length) {
            next[idx] = {
              id: String(idx + 1),
              url: row.image_path || '',
              name: row.image_path ? row.image_path.split('/').pop() || '' : '',
              weight: Number(row.weight) || 0,
            };
          }
        });
        return next;
      });
    } else {
      setSlots(makeEmptySlots());
    }
  }, [dbData]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleWeightChange = (index: number, val: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], weight: val };
      return next;
    });
  };

  const handleFileUpload = (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], url, name: file.name };
      return next;
    });
  };

  const handleRemoveFile = (index: number) => {
    setSlots(prev => {
      const next = [...prev];
      // Also clear weight when image is removed
      next[index] = { ...next[index], url: '', name: '', weight: 0 };
      return next;
    });
    setDeleteConfirm(null);
  };

  const handleSave = async () => {
    // Validation 1: Check for negative weight values
    const hasNegativeWeight = slots.some(s => Number(s.weight || 0) < 0);
    if (hasNegativeWeight) {
      const msg = 'Negative weight is not allowed';
      if (onShowToast) onShowToast(msg, 'error');
      else alert(msg);
      return;
    }

    // Validation 2: Image without weight or 0 weight
    const imageWithoutWeight = slots.find(s => s.url && Number(s.weight || 0) === 0);
    if (imageWithoutWeight) {
      const msg = 'Please enter a weight value for all uploaded images before saving.';
      if (onShowToast) onShowToast(msg, 'error');
      else alert(msg);
      return;
    }

    setIsSaving(true);
    try {
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

      await vendorApi.saveWeightDrawings(vendor.id, selectedMaterialId, category, processedSlots);
      await refetch();

      if (onShowToast) {
        onShowToast('Weights & Drawings saved successfully!', 'success');
      } else {
        alert('Weights & Drawings saved successfully!');
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      if (onShowToast) {
        onShowToast(`Error saving: ${msg}`, 'error');
      } else {
        alert(`Error saving: ${msg}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const activeWeights = slots.map(s => Number(s.weight) || 0).filter(w => w > 0);
  const avgWeight = activeWeights.length > 0 
    ? activeWeights.reduce((sum, w) => sum + w, 0) / activeWeights.length 
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <SlidePanel isOpen onClose={onClose} width="w-[480px] max-w-full">
        <div className="p-6 bg-[#F3F4F6] min-h-full space-y-6">
          {/* Header card */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  {vendor.name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {material.itemCode}{material.itemDescription ? ` — ${material.itemDescription}` : ''}
                </p>
                <span className="inline-block mt-1.5 text-[11px] font-bold uppercase tracking-wider text-[#A02828]">
                  {category}
                </span>

                {/* Period selector dropdown */}
                <div className="mt-3 flex items-center gap-2">
                  <label htmlFor="period-select" className="text-xs font-semibold text-gray-600">Period:</label>
                  <select
                    id="period-select"
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(Number(e.target.value))}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#A02828]"
                  >
                    {periodsData?.map((p) => {
                      const range = computeQuarterRange(p.fromDate, p.toDate);
                      const suffix = p.id === material.id ? ' (Active)' : '';
                      const countIndicator = p.hasAttachments ? ' 🖼️' : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {range}{suffix}{countIndicator}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50"
                  style={{ background: '#A02828' }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Upload drawings and specify individual weights for each slot.
            </p>
          </div>

          {/* Slots grid */}
          {isLoading ? (
            <div className="bg-white p-8 rounded-lg border border-gray-200 text-center text-gray-500 text-sm">
              Loading saved weights and drawings...
            </div>
          ) : (
            <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {slots.map((slot, index) => (
                  <div key={slot.id} className="flex flex-col items-center">
                    {/* Thumbnail / Upload Box */}
                    <div className="relative w-full aspect-square border border-gray-200 rounded-lg overflow-hidden group shadow-sm bg-gray-50 flex flex-col items-center justify-center">
                      {/* Delete confirm overlay */}
                      {deleteConfirm === index ? (
                        <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center p-1 text-center select-none z-20">
                          <span className="text-[10px] font-bold text-white mb-2">Delete drawing?</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(index)}
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
                          <img
                            src={getImageUrl(slot.url)}
                            alt={slot.name}
                            className="w-full h-full object-cover"
                          />
                          {/* Hover overlay */}
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
                              onClick={() => setDeleteConfirm(index)}
                              className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded shadow-sm text-xs transition-colors"
                              title="Remove drawing"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      ) : (
                        <div
                          onClick={() =>
                            document
                              .getElementById(`vwd-${vendor.id}-${selectedMaterialId}-${index}`)
                              ?.click()
                          }
                          className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-red-50/10 transition-colors p-2 text-center"
                        >
                          <input
                            id={`vwd-${vendor.id}-${selectedMaterialId}-${index}`}
                            type="file"
                            accept="image/*"
                            onChange={e => handleFileUpload(index, e.target.files)}
                            className="hidden"
                          />
                          <svg
                            className="w-6 h-6 text-gray-400 mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          <span className="text-[10px] font-semibold text-gray-500">Image {index + 1}</span>
                        </div>
                      )}
                    </div>

                    {/* Weight field */}
                    <div className="w-full mt-2" title={!slot.url ? 'Upload an image first to enter weight' : ''}>
                      <input
                        type="number"
                        step="0.01"
                        value={slot.weight || ''}
                        disabled={!slot.url}
                        onChange={e =>
                          handleWeightChange(index, parseFloat(e.target.value) || 0)
                        }
                        className={`w-full px-2 py-1 border rounded text-center text-xs font-mono transition-colors ${
                          Number(slot.weight || 0) < 0
                            ? 'border-red-500 bg-red-50 text-red-900 focus:outline-none focus:border-red-500 font-bold'
                            : slot.url && Number(slot.weight || 0) === 0
                            ? 'border-red-400 bg-red-50 text-gray-900 focus:outline-none focus:border-red-500'
                            : slot.url
                            ? 'border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-[#A02828]'
                            : 'border-gray-100 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                        placeholder={slot.url ? 'Enter kg ↑' : '—'}
                      />
                      {Number(slot.weight || 0) < 0 ? (
                        <p className="text-[10px] text-red-600 text-center mt-0.5 font-bold">Negative weight is not allowed</p>
                      ) : slot.url && Number(slot.weight || 0) === 0 ? (
                        <p className="text-[10px] text-red-500 text-center mt-0.5 font-medium">Weight required</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Average Weight display */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average Weight</span>
                <span className="text-sm font-bold text-gray-900 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 font-mono shadow-inner">
                  {avgWeight > 0 ? `${avgWeight.toFixed(2)} kg` : '0.00 kg'}
                </span>
              </div>
            </div>
          )}
        </div>
      </SlidePanel>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] p-4"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={lightbox}
              alt="Drawing"
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 bg-white/20 hover:bg-white/40 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default VendorWeightDrawingsPanel;
