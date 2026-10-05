import React,{ useEffect,useRef,useState } from 'react';
import { BRAND } from '../../constants';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { Loader } from './Loader';

// Re-export Loader as the canonical loading indicator
export { SlidePanel } from './SlidePanel';
export { ColumnFilterPopover,Loader };

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', loading, children, disabled, className = '',
  onMouseEnter, onMouseLeave, style, ...rest
}) => {
  const [hovered, setHovered] = useState(false);

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 500,
    borderRadius: '0.5rem',
    border: '1px solid',
    transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.5 : 1,
    fontSize: size === 'sm' ? '0.875rem' : '0.875rem',
    padding: size === 'sm' ? '0.375rem 0.75rem' : '0.5rem 1rem',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: hovered ? BRAND.RED_HOVER : BRAND.RED,
      color: BRAND.WHITE,
      borderColor: hovered ? BRAND.RED_HOVER : BRAND.RED,
    },
    secondary: {
      backgroundColor: hovered ? BRAND.RED_LIGHT : BRAND.WHITE,
      color: hovered ? BRAND.RED : BRAND.GRAY_TEXT,
      borderColor: hovered ? BRAND.RED_BORDER : BRAND.BORDER,
    },
    danger: {
      backgroundColor: hovered ? BRAND.RED_HOVER : BRAND.RED,
      color: BRAND.WHITE,
      borderColor: hovered ? BRAND.RED_HOVER : BRAND.RED,
    },
    ghost: {
      backgroundColor: hovered ? BRAND.RED_LIGHT : 'transparent',
      color: hovered ? BRAND.RED : BRAND.GRAY_TEXT,
      borderColor: 'transparent',
    },
  };

  return (
    <button
      style={{ ...base, ...variantStyles[variant], ...style }}
      disabled={disabled || loading}
      onMouseEnter={e => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={e => { setHovered(false); onMouseLeave?.(e); }}
      className={className}
      {...rest}
    >
      {loading && <Loader size="sm" />}
      {children}
    </button>
  );
};

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color: string; }

export const Badge: React.FC<BadgeProps> = ({ label, color }) => (
  <span
    className="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
    style={{ background: `${color}20`, color }}
  >
    {label}
  </span>
);

// ── Spinner (alias → Loader, kept for backward compatibility) ─────────────────
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => <Loader size={size} />;

// ── Empty state ───────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center py-16 text-sm" style={{ color: BRAND.GRAY_TEXT }}>{message}</div>
);

// ── Error state ───────────────────────────────────────────────────────────────
export const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div
    className="rounded-lg p-4 text-sm"
    style={{
      border: `1px solid ${BRAND.RED_BORDER}`,
      backgroundColor: BRAND.RED_LIGHT,
      color: BRAND.RED,
    }}
  >
    {message}
  </div>
);

// ── Card ──────────────────────────────────────────────────────────────────────
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl shadow-sm ${className}`}
    style={{ border: `1px solid ${BRAND.BORDER}` }}
  >
    {children}
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
export const SectionHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({
  title, subtitle, actions,
}) => (
  <div className="flex items-start justify-between gap-4 mb-6">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm mt-0.5" style={{ color: BRAND.GRAY_TEXT }}>{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// ── Page header ───────────────────────────────────────────────────────────────
/** Single source of truth for top-level page title style.
 *  All font, weight, color, tracking and case decisions live here — not in pages. */
export const PageHeader: React.FC<{ title: string; actions?: React.ReactNode }> = ({ title, actions }) => (
  <div
    className="pl-8 pr-20 flex items-center justify-between shrink-0 bg-white"
    style={{
      height: '68px',
      borderBottom: '1px solid transparent',
    }}
  >
    <h1 className="text-xl font-semibold text-gray-900 tracking-wide uppercase">{title}</h1>
    {actions && <div className="flex items-center gap-3">{actions}</div>}
  </div>
);

// ── Data table ────────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  filterValue?: string;
  onFilterChange?: (val: string) => void;
  // Excel-like filter support
  filterOptions?: { label: string; value: string }[];
  filterSelectedValues?: Set<string>;
  onFilterSelectedChange?: (val: Set<string>) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyFn: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, rows, keyFn, onRowClick, loading, emptyMessage = 'No records' }: DataTableProps<T>) {
  const [hoveredKey, setHoveredKey] = useState<string | number | null>(null);
  const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

  return (
    <div className="flex-1 overflow-auto pb-4" style={{ minHeight: 0 }}>
      <table className="w-full text-sm">
        {/* Header always rendered — never causes layout shift */}
        <thead className="sticky top-0 bg-white z-10">
          <tr style={{ borderBottom: `1px solid ${BRAND.BORDER}` }}>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium text-xs uppercase tracking-wide whitespace-nowrap align-top ${alignClass[col.align ?? 'left']}`}
                style={{ color: '#000000' }}
              >
                <div>
                  {col.header}
                  {col.filterOptions && col.onFilterSelectedChange && (
                    <ColumnFilterPopover
                      title={typeof col.header === 'string' ? col.header : undefined}
                      options={col.filterOptions}
                      selectedValues={col.filterSelectedValues || new Set()}
                      onChange={col.onFilterSelectedChange}
                    />
                  )}
                </div>
                {col.onFilterChange !== undefined && !col.filterOptions && (
                  <div className="mt-2 font-normal">
                    <input
                      type="text"
                      value={col.filterValue ?? ''}
                      onChange={e => col.onFilterChange!(e.target.value)}
                      placeholder="Filter..."
                      className="w-full px-2 py-1 text-xs border rounded font-normal normal-case tracking-normal text-gray-800 focus:outline-none"
                      style={{ borderColor: BRAND.BORDER, minWidth: '100px' }}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            /* Loader sits inside tbody — header stays, page height is stable */
            <tr>
              <td colSpan={columns.length}>
                <div
                  className="flex items-center justify-center pl-16"
                  style={{ minHeight: '280px' }}
                >
                  <Loader size="md" />
                </div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length}><EmptyState message={emptyMessage} /></td></tr>
          ) : rows.map(row => {
            const key = keyFn(row);
            const isHovered = hoveredKey === key;
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  borderBottom: `1px solid ${BRAND.BORDER}`,
                  backgroundColor: isHovered ? BRAND.RED_LIGHT : BRAND.WHITE,
                  cursor: onRowClick ? 'pointer' : undefined,
                  transition: 'background-color 0.12s',
                }}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-gray-800 whitespace-nowrap ${alignClass[col.align ?? 'left']}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Input / Select ────────────────────────────────────────────────────────────
const useInputFocus = () => {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
};

const inputStyle = (focused: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  borderRadius: '0.5rem',
  border: `1px solid ${focused ? BRAND.RED : BRAND.BORDER}`,
  backgroundColor: BRAND.WHITE,
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: '#111827',
  outline: focused ? `2px solid ${BRAND.RED_BORDER}` : 'none',
  outlineOffset: '1px',
  transition: 'border-color 0.15s, outline 0.15s',
});

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string; leftIcon?: React.ReactNode }> = ({
  label, id, className = '', onFocus, onBlur, style, leftIcon, ...rest
}) => {
  const focus = useInputFocus();
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <label htmlFor={id} className="block text-xs font-medium" style={{ color: BRAND.GRAY_TEXT }}>{label}</label>}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-gray-400 pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}
        <input
          id={id}
          style={{
            ...inputStyle(focus.focused),
            paddingLeft: leftIcon ? '2.25rem' : '0.75rem',
            ...style
          }}
          onFocus={e => { focus.onFocus(); onFocus?.(e); }}
          onBlur={e => { focus.onBlur(); onBlur?.(e); }}
          {...rest}
        />
      </div>
    </div>
  );
};

interface DateInputProps {
  value: string; // expects 'yyyy-mm-dd'
  onChange: (value: string) => void;
  className?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ value, onChange, className }) => {
  const toDisplay = (val: string): string => {
    if (!val) return '';
    const parts = val.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  };

  const toRaw = (val: string): string => {
    const parts = val.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (d.length === 2 && m.length === 2 && y.length === 4) {
        return `${y}-${m}-${d}`;
      }
    }
    return val;
  };

  const [inputValue, setInputValue] = useState(toDisplay(value));

  useEffect(() => {
    setInputValue(toDisplay(value));
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;
    text = text.replace(/[^0-9/]/g, '');

    if (text.length === 2 && !text.includes('/')) {
      text = text + '/';
    } else if (text.length === 5 && text.split('/').length === 2) {
      text = text + '/';
    }
    
    if (text.length <= 10) {
      setInputValue(text);
      if (text.length === 10) {
        const raw = toRaw(text);
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          onChange(raw);
        }
      }
    }
  };

  const handleBlur = () => {
    const raw = toRaw(inputValue);
    const d = new Date(raw);
    if (isNaN(d.getTime()) || inputValue.length !== 10) {
      setInputValue(toDisplay(value));
    } else {
      onChange(raw);
    }
  };

  const dateInputRef = useRef<HTMLInputElement>(null);

  const triggerDatePicker = () => {
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.click();
        }
      } catch (err) {
        dateInputRef.current.click();
      }
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        type="text"
        placeholder="dd/mm/yyyy"
        value={inputValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className={`${className} pr-10`}
      />
      <input
        ref={dateInputRef}
        type="date"
        value={value || ''}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        style={{ width: 0, padding: 0, border: 'none' }}
      />
      <button
        type="button"
        onClick={triggerDatePicker}
        className="absolute right-3 text-gray-400 hover:text-gray-600 focus:outline-none flex items-center justify-center"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      </button>
    </div>
  );
};

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; leftIcon?: React.ReactNode }> = ({
  label, id, className = '', children, onFocus, onBlur, style, leftIcon, ...rest
}) => {
  const focus = useInputFocus();
  return (
    <div className={`space-y-1 ${className}`}>
      {label && <label htmlFor={id} className="block text-xs font-medium" style={{ color: BRAND.GRAY_TEXT }}>{label}</label>}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-gray-400 pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}
        <select
          id={id}
          style={{
            ...inputStyle(focus.focused),
            paddingLeft: leftIcon ? '2.25rem' : '0.75rem',
            ...style
          }}
          onFocus={e => { focus.onFocus(); onFocus?.(e); }}
          onBlur={e => { focus.onBlur(); onBlur?.(e); }}
          {...rest}
        >
          {children}
        </select>
      </div>
    </div>
  );
};

interface SearchableSelectOption {
  value: string;
  label: string;
}

export const SearchableSelect: React.FC<{
  value: string;
  onChange: (val: string) => void;
  options: (string | SearchableSelectOption)[];
  placeholder: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  leftIcon?: React.ReactNode;
  align?: 'left' | 'right';
  loading?: boolean;
}> = ({
  value,
  onChange,
  options,
  placeholder,
  label,
  className = '',
  style,
  leftIcon,
  align = 'left',
  loading = false,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
      if (open && inputRef.current) {
        inputRef.current.focus();
      }
    }, [open]);

    const normalizedOptions = options.map(o =>
      typeof o === 'string' ? { value: o, label: o } : o
    );

    const filtered = normalizedOptions.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase())
    );

    const selectedOption = normalizedOptions.find(o => o.value === value);

    return (
      <div ref={wrapperRef} className={`space-y-1 relative ${className}`} style={{ minWidth: '150px' }}>
        {label && <label className="block text-xs font-medium" style={{ color: BRAND.GRAY_TEXT }}>{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-gray-400 pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <div
            onClick={() => !loading && setOpen(!open)}
            style={{
              ...inputStyle(open),
              paddingLeft: leftIcon ? '2.25rem' : '0.75rem',
              paddingRight: '1.75rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
              height: '38px',
              opacity: loading ? 0.7 : 1,
              ...style
            }}
            tabIndex={loading ? -1 : 0}
          >
            <span className={value ? 'text-gray-900 truncate' : 'text-gray-400 truncate'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            {loading ? (
              <span className="absolute right-3 pointer-events-none flex items-center justify-center">
                <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
            ) : (
              <span className="absolute right-3 text-gray-400 text-xs pointer-events-none">▼</span>
            )}
          </div>
        </div>

        {open && (
          <div
            className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col"
            style={{
              maxHeight: '300px',
              minWidth: '220px',
              width: 'max-content',
              maxWidth: '320px',
              left: align === 'right' ? 'auto' : 0,
              right: align === 'right' ? 0 : 'auto',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div className="p-2 border-b border-gray-100 shrink-0 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#d92d20]"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
            <div className="overflow-y-auto flex-1 py-1" style={{ maxHeight: '200px' }}>
              {loading ? (
                <div className="px-3 py-6 text-sm text-center text-gray-500 flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Loading options...</span>
                </div>
              ) : (
                <>
                  <div
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 truncate ${!value ? 'bg-red-50 text-[#d92d20] font-medium' : 'text-gray-600'}`}
                    onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                  >
                    {placeholder}
                  </div>
                  {filtered.map(o => (
                    <div
                      key={o.value}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 truncate ${value === o.value ? 'bg-red-50 text-[#d92d20] font-medium' : 'text-gray-900'}`}
                      title={o.label}
                      onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                    >
                      {o.label}
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-3 py-3 text-sm text-center text-gray-400 italic">No results found</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; }

export const Modal: React.FC<ModalProps> = ({ title, onClose, children, wide }) => {
  const [closeHovered, setCloseHovered] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col`}
        style={{ maxWidth: wide ? '64rem' : '36rem', maxHeight: '90vh' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BRAND.BORDER}` }}
        >
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
            style={{
              color: closeHovered ? BRAND.RED : BRAND.GRAY_TEXT,
              fontSize: '1.25rem',
              lineHeight: 1,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>
  );
};

// ── Pagination ────────────────────────────────────────────────────────────────
interface PaginationProps {
  page: number;
  pageSize: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalRecords,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100, 250],
}) => {
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalRecords);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    return pages;
  };

  const btnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '32px',
    minWidth: '32px',
    padding: '0 6px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '0.375rem',
    border: `1px solid ${active ? BRAND.RED : BRAND.BORDER}`,
    backgroundColor: active ? BRAND.RED : BRAND.WHITE,
    color: active ? BRAND.WHITE : (disabled ? '#D1D5DB' : BRAND.GRAY_TEXT),
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
    outline: 'none',
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 border-t select-none" style={{ borderColor: BRAND.BORDER }}>
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        <span>
          Showing <span className="font-semibold text-gray-800">{totalRecords === 0 ? 0 : startRecord}</span>–
          <span className="font-semibold text-gray-800">{endRecord}</span> of{' '}
          <span className="font-semibold text-gray-800">{totalRecords.toLocaleString()}</span> records
        </span>

        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={e => {
              const newSize = parseInt(e.target.value, 10);
              onPageSizeChange(newSize);
            }}
            className="h-8 rounded-md border bg-white px-2 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: BRAND.BORDER, '--tw-ring-color': BRAND.RED } as React.CSSProperties}
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => page > 1 && onPageChange(1)}
          disabled={page === 1}
          style={btnStyle(false, page === 1)}
          className="hover:bg-gray-50 hover:text-gray-900 disabled:hover:bg-white"
          title="First Page"
        >
          «
        </button>

        <button
          onClick={() => page > 1 && onPageChange(page - 1)}
          disabled={page === 1}
          style={btnStyle(false, page === 1)}
          className="hover:bg-gray-50 hover:text-gray-900 disabled:hover:bg-white px-2.5"
        >
          Prev
        </button>

        {getPageNumbers().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                ...
              </span>
            );
          }
          const isCurrent = p === page;
          return (
            <button
              key={`page-${p}`}
              onClick={() => onPageChange(p as number)}
              style={btnStyle(isCurrent, false)}
              className={isCurrent ? '' : 'hover:bg-gray-50 hover:text-gray-900'}
            >
              {p}
            </button>
          );
        })}

        <button
          onClick={() => page < totalPages && onPageChange(page + 1)}
          disabled={page === totalPages}
          style={btnStyle(false, page === totalPages)}
          className="hover:bg-gray-50 hover:text-gray-900 disabled:hover:bg-white px-2.5"
        >
          Next
        </button>

        <button
          onClick={() => page < totalPages && onPageChange(totalPages)}
          disabled={page === totalPages}
          style={btnStyle(false, page === totalPages)}
          className="hover:bg-gray-50 hover:text-gray-900 disabled:hover:bg-white"
          title="Last Page"
        >
          »
        </button>
      </div>
    </div>
  );
};

