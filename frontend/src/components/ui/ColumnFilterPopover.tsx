import React,{ useEffect,useMemo,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { BRAND } from '../../constants';

interface FilterOption {
  label: string;
  value: string;
}

interface ColumnFilterPopoverProps {
  options: FilterOption[];
  selectedValues: Set<string>;
  onChange: (newValues: Set<string>) => void;
  title?: string;
}

export const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({ options, selectedValues, onChange, title }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Local state for checkboxes
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Sync local state when popover opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(selectedValues));
      setSearch(''); // clear search when opening
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left,
        });
      }
    }
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close when scrolling (to prevent floating disconnected popover)
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const handleToggle = (val: string) => {
    const next = new Set(localSelected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setLocalSelected(next);
  };

  const handleToggleSelectAll = () => {
    const next = new Set(localSelected);
    const allFilteredSelected = filteredOptions.every(o => next.has(o.value));
    
    if (allFilteredSelected) {
      // Deselect all filtered
      filteredOptions.forEach(o => next.delete(o.value));
    } else {
      // Select all filtered
      filteredOptions.forEach(o => next.add(o.value));
    }
    setLocalSelected(next);
  };

  const handleApply = () => {
    onChange(localSelected);
    setIsOpen(false);
  };

  const isFilterActive = selectedValues.size > 0;
  
  // Check if all filtered options are currently selected (for the Select All checkbox state)
  const isAllSelected = filteredOptions.length > 0 && filteredOptions.every(o => localSelected.has(o.value));
  const isIndeterminate = filteredOptions.some(o => localSelected.has(o.value)) && !isAllSelected;

  return (
    <div className="relative inline-block ml-2 align-middle font-normal normal-case tracking-normal" ref={popoverRef}>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`p-1 rounded hover:bg-gray-200 transition-colors ${isFilterActive ? 'text-[#A02828]' : 'text-gray-400'}`}
        title={`Filter ${title || ''}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-white border rounded shadow-xl z-[9999] overflow-hidden text-left text-gray-800 flex flex-col"
          style={{ 
            top: coords.top + 4, 
            left: Math.min(coords.left, window.innerWidth - 270),
            width: '250px', 
            borderColor: BRAND.BORDER 
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search Box */}
          <div className="p-2 border-b border-gray-200 bg-white">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                <svg className="w-3.5 h-3.5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="flex-1 overflow-y-auto max-h-40 py-1 bg-white">
            {/* Select All Checkbox */}
            {filteredOptions.length > 0 && (
              <div 
                className="flex items-center px-3 py-1.5 hover:bg-gray-100 cursor-pointer"
                onClick={(e) => { e.preventDefault(); handleToggleSelectAll(); }}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={input => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  readOnly
                  className="mr-2 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                />
                <span className="text-xs text-gray-900 font-medium">(Select All)</span>
              </div>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-gray-500">No matches</div>
            ) : (
              filteredOptions.map(opt => (
                <div 
                  key={opt.value} 
                  className="flex items-center px-3 py-1.5 hover:bg-gray-100 cursor-pointer" 
                  onClick={(e) => { e.preventDefault(); handleToggle(opt.value); }}
                >
                  <input
                    type="checkbox"
                    checked={localSelected.has(opt.value)}
                    readOnly
                    className="mr-2 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                  />
                  <span className="text-xs truncate flex-1 text-gray-700 font-normal" title={opt.label}>{opt.label || '(Blank)'}</span>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
            <button
              onClick={handleApply}
              className="px-4 py-1.5 bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-xs font-semibold rounded shadow-sm transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
