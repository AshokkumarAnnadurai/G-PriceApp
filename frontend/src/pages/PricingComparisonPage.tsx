import React,{ useEffect,useMemo,useState } from 'react';
import { pricingApi } from '../api/pricingApi';
import { DateInput,ErrorState,Loader,SearchableSelect } from '../components/ui';
import { BRAND } from '../constants';

// ── Styles (matching the rest of the app) ─────────────────────────────────────
const th: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#000000',
  backgroundColor: '#FFFFFF',
  whiteSpace: 'nowrap',
  borderBottom: '1.5px solid #E5E7EB',
  textAlign: 'left',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};


const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '0.875rem',
  color: '#000000',
  borderBottom: '1px solid #E5E7EB',
  verticalAlign: 'middle',
};

const tdMono: React.CSSProperties = {
  ...td,
  textAlign: 'right',
};

const fmt = (v: number | null | undefined, cur: string = 'INR') => {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur.toUpperCase(), maximumFractionDigits: 2 }).format(v);
  } catch (err) {
    return `${cur} ${v.toFixed(2)}`;
  }
};

const fmtNum = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-IN').format(v);

function VarianceBadge({ value, pct, currency = 'INR', mode }: { value: number | null; pct: number | null; currency?: string; mode: 'customer' | 'vendor' }) {
  if (value == null) return <span style={{ color: '#9CA3AF' }}>-</span>;
  const isZero = Math.abs(value) < 0.01;
  
  let bg = '#F3F4F6';
  let color = '#6B7280';
  
  if (!isZero) {
    if (mode === 'vendor') {
      const isLoss = value > 0; // paid more than master
      if (isLoss) {
        bg = '#FEE2E2'; // Red background
        color = '#991B1B'; // Red text
      } else {
        bg = '#FEF3C7'; // Yellow/Amber background
        color = '#b45309'; // Yellow/Amber text
      }
    } else { // customer
      const isLoss = value < 0; // billed less than master
      if (isLoss) {
        bg = '#FEE2E2';
        color = '#991B1B';
      } else {
        bg = '#FEF3C7';
        color = '#b45309';
      }
    }
  } else {
    // No mismatch
    bg = '#DCFCE7'; // Green background
    color = '#15803d'; // Green text
  }

  const absValue = Math.abs(value);
  const absPct = pct != null ? Math.abs(pct) : null;

  return (
    <span
      className="font-mono"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 7px', borderRadius: 5,
        background: bg, color,
        fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {isZero ? '= ' : ''}{fmt(absValue, currency)}
      {absPct != null && <span style={{ opacity: 0.8 }}>({absPct}%)</span>}
    </span>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid #E5E7EB`, borderRadius: 9,
      padding: '12px 16px',
      borderLeft: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 5 }}>{label}</div>
      <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1E1E1E' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.63rem', color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export const PricingComparisonPage: React.FC = () => {
  const [mode, setMode] = useState<'customer' | 'vendor'>('vendor');
  const [filters, setFilters] = useState<{ customers: string[]; vendors: string[] }>({ customers: [], vendors: [] });
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load filter options on mount
  useEffect(() => {
    setFiltersLoading(true);
    pricingApi.getPricingComparisonFilters()
      .then(f => setFilters(f))
      .catch(() => {})
      .finally(() => setFiltersLoading(false));
  }, []);

  // Reset party when mode changes
  useEffect(() => {
    setPartyName('');
    setRows([]);
    setSearched(false);
    setError(null);
    setSearchQuery('');
  }, [mode]);

  const partyOptions = mode === 'customer' ? filters.customers : filters.vendors;

  const handleSearch = async () => {
    if (!partyName || !fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const data = await pricingApi.getPricingComparison(mode, partyName, fromDate, toDate);
      setRows(data || []);
      setSearched(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPartyName('');
    setFromDate('');
    setToDate('');
    setRows([]);
    setSearched(false);
    setError(null);
    setSearchQuery('');
  };

  const isCustomer = mode === 'customer';

  // Apply search query (Item Code or Invoice Number) and sort by invoice_num ascending
  const processedRows = useMemo(() => {
    let result = rows;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = rows.filter(r => {
        const matchesItem = (r.item_code || '').toLowerCase().includes(q);
        const matchesInvoice = (r.invoice_num || '').toString().toLowerCase().includes(q);
        const matchesDesc = (r.description || '').toLowerCase().includes(q);
        return matchesItem || matchesInvoice || matchesDesc;
      });
    }
    // Sort by invoice_num ascending (natural alphanumeric sort)
    return [...result].sort((a, b) => {
      const aNum = String(a.invoice_num || '');
      const bNum = String(b.invoice_num || '');
      return aNum.localeCompare(bNum, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [rows, searchQuery]);

  // Excel (HTML formatted) Export
  const handleExport = () => {
    if (!processedRows.length) return;

    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Status',
      'Item Code',
      'Description',
      isCustomer ? 'Category' : 'Grade',
      ...(!isCustomer ? ['Customer'] : []),
      'Qty',
      isCustomer ? 'AR Invoice Price' : 'AP Invoice Price',
      isCustomer ? 'AR Total' : 'AP Total',
      isCustomer ? 'Customer Master Unit Price' : 'Vendor Master Unit Price',
      isCustomer ? 'Customer Master Total' : 'Vendor Master Total',
      'Unit Variance',
      'Total Variance'
    ];

    // Build metadata rows
    const partyLabel = isCustomer ? 'Customer' : 'Vendor';
    const dateRangeStr = `${new Date(fromDate).toLocaleDateString('en-GB')} to ${new Date(toDate).toLocaleDateString('en-GB')}`;
    const exportedAt = new Date().toLocaleString();

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Pricing Comparison</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Calibri, sans-serif; font-size: 10pt; }
          .title { font-size: 16pt; font-weight: bold; color: #1e3a8a; }
          .meta-label { font-weight: bold; color: #4b5563; font-size: 10pt; }
          .meta-value { color: #1f2937; font-size: 10pt; }
          th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #94a3b8; padding: 8px 10px; text-align: left; }
          td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: middle; }
          .text { text-align: left; mso-number-format: "\\@"; }
          .num { text-align: right; mso-number-format: "#,##0.00"; }
          .qty { text-align: right; mso-number-format: "#,##0"; }
          .date { text-align: center; mso-number-format: "dd/mm/yyyy"; }
          .variance-loss { color: #b91c1c; font-weight: bold; }
          .variance-profit { color: #b45309; font-weight: bold; }
          .variance-none { color: #15803d; font-weight: bold; }
          .variance-neutral { color: #4b5563; }
          .total-row { background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #475569; }
        </style>
      </head>
      <body>
        <table>
          <!-- Title Block -->
          <tr>
            <td colspan="${headers.length}" class="title" style="height: 40px; vertical-align: middle;">PRICING COMPARISON REPORT</td>
          </tr>
          <tr>
            <td class="meta-label">Party Type:</td>
            <td colspan="${headers.length - 1}" class="meta-value">${partyLabel}</td>
          </tr>
          <tr>
            <td class="meta-label">${partyLabel} Name:</td>
            <td colspan="${headers.length - 1}" class="meta-value">${partyName}</td>
          </tr>
          <tr>
            <td class="meta-label">Date Range:</td>
            <td colspan="${headers.length - 1}" class="meta-value">${dateRangeStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Exported On:</td>
            <td colspan="${headers.length - 1}" class="meta-value">${exportedAt}</td>
          </tr>
          <tr style="height: 20px;"><td colspan="${headers.length}"></td></tr> <!-- Spacer -->

          <!-- Table Headers -->
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
    `;

    processedRows.forEach(row => {
      const qty = Number(isCustomer ? row.sales_qty : row.purchase_qty);
      const unitVar = row.unit_variance != null ? Number(row.unit_variance) : null;
      const totalVar = row.total_variance != null ? Number(row.total_variance) : null;
      const invoiceDateStr = row.invoice_date
        ? new Date(row.invoice_date).toLocaleDateString('en-GB')
        : '';

      let varClass = 'variance-none';
      const isNotInMaster = row.app_master_price == null;
      if (isNotInMaster) {
        varClass = 'variance-neutral';
      } else if (totalVar !== null && Math.abs(totalVar) >= 0.01) {
        if (mode === 'vendor') {
          varClass = totalVar > 0 ? 'variance-loss' : 'variance-profit';
        } else {
          varClass = totalVar < 0 ? 'variance-loss' : 'variance-profit';
        }
      } else if (totalVar === null) {
        varClass = 'variance-neutral';
      }

      const masterUnitCell = row.export_unit_price != null ? Number(row.export_unit_price) : '';
      const masterTotalCell = row.app_master_price != null ? Number(row.app_master_price) : '';

      html += `
        <tr>
          <td class="text">${row.invoice_num || '—'}</td>
          <td class="date">${invoiceDateStr}</td>
          <td class="text">${String(row.doc_status).trim().toUpperCase() === 'O' ? 'Open' : 'Closed'}</td>
          <td class="text">${row.item_code || ''}</td>
          <td class="text">${row.description || ''}</td>
          <td class="text">${isCustomer ? (row.category || '') : (row.grade || '')}</td>
          ${!isCustomer ? `<td class="text">${row.customer_name || ''}</td>` : ''}
          <td class="qty">${qty}</td>
          <td class="num">${Number(row.sap_unit_price || 0)}</td>
          <td class="num">${Number(row.sap_total_price || 0)}</td>
          <td class="num">${masterUnitCell !== '' ? masterUnitCell : '—'}</td>
          <td class="num">${masterTotalCell !== '' ? masterTotalCell : '—'}</td>
          <td class="num ${varClass}">${!isNotInMaster && unitVar !== null ? Math.abs(unitVar) : '-'}</td>
          <td class="num ${varClass}">${!isNotInMaster && totalVar !== null ? Math.abs(totalVar) : '-'}</td>
        </tr>
      `;
    });

    if (summary) {
      const isZero = Math.abs(summary.totalVar) < 0.01;
      let totalVarClass = 'variance-none';
      if (!isZero) {
        if (mode === 'vendor') {
          totalVarClass = summary.totalVar > 0 ? 'variance-loss' : 'variance-profit';
        } else {
          totalVarClass = summary.totalVar < 0 ? 'variance-loss' : 'variance-profit';
        }
      }
      html += `
        <tr class="total-row">
          <td colspan="6" style="text-align: left;">Aggregate Total</td>
          ${!isCustomer ? `<td></td>` : ''}
          <td class="qty">${summary.qty}</td>
          <td></td>
          <td class="num">${summary.sapTotal}</td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num ${totalVarClass}">${Math.abs(summary.totalVar)}</td>
        </tr>
      `;
    }

    html += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filename = `Pricing_Comparison_${partyName.replace(/[^a-zA-Z0-9]/g, '_')}_${fromDate}_to_${toDate}.xls`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Summary calculations
  const summary = useMemo(() => {
    if (!processedRows.length) return null;
    const qty = processedRows.reduce((s, r) => s + Number(mode === 'customer' ? r.sales_qty : r.purchase_qty || 0), 0);
    const sapTotal = processedRows.reduce((s, r) => s + Number(r.sap_total_price || 0), 0);
    const totalVar = processedRows.reduce((s, r) => s + Number(r.total_variance || 0), 0);
    const matched = processedRows.filter(r => r.app_master_price != null).length;
    return { qty, sapTotal, totalVar, matched, total: processedRows.length };
  }, [processedRows, mode]);

  const currencyCode = processedRows[0]?.currency || 'INR';

  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#F3F4F6', flex: '1 0 auto' }}>

      {/* ── PAGE HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">
              {mode === 'vendor' ? 'Vendor Pricing Comparison' : 'Customer Pricing Comparison'}
            </h1>
          </div>

          {/* ── TOGGLE ── */}
          <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: 9999, padding: 4, gap: 4, border: '1px solid #d1d5db90' }}>
            {(['vendor', 'customer'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '8px 24px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                  fontSize: '0.875rem', fontWeight: 700,
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? BRAND.RED : '#4b5563',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {m === 'customer' ? '🧾 Customer Pricing' : '🏭 Vendor Pricing'}
              </button>
            ))}
          </div>
        </div>

        {/* ── FILTERS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          
          {/* Row 1: Selectors & Live Table Search / Export */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            
            {/* Party */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 220 }}>
              <div className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {isCustomer ? 'Customer' : 'Vendor'} <span style={{ color: BRAND.RED }}>*</span>
              </div>
              <SearchableSelect
                value={partyName}
                onChange={setPartyName}
                options={partyOptions}
                placeholder={`Select ${isCustomer ? 'customer' : 'vendor'}…`}
                loading={filtersLoading}
                style={{ height: 34, fontSize: '0.78rem' }}
              />
            </div>

            {/* From Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 140 }}>
              <div className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                From Date <span style={{ color: BRAND.RED }}>*</span>
              </div>
              <DateInput
                value={fromDate}
                onChange={setFromDate}
                className="w-full h-[34px] border border-gray-300 rounded-[7px] px-3 pr-10 text-[0.78rem] font-medium text-gray-700 bg-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            {/* To Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 140 }}>
              <div className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                To Date <span style={{ color: BRAND.RED }}>*</span>
              </div>
              <DateInput
                value={toDate}
                onChange={setToDate}
                className="w-full h-[34px] border border-gray-300 rounded-[7px] px-3 pr-10 text-[0.78rem] font-medium text-gray-700 bg-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            {/* Table Live Search (Only when searched) */}
            {searched && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 280, flex: '1 1 auto' }}>
                <div className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Filter Table Results
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 10, fontSize: '0.85rem', color: '#9CA3AF' }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search item code, description or invoice no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      height: 34, padding: '0 10px 0 28px', fontSize: '0.78rem', fontWeight: 500,
                      color: '#4A4A4A', background: '#fff', border: '1.5px solid #D1D5DB',
                      borderRadius: 7, outline: 'none', width: '100%'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Export Button (Only when searched) */}
            {searched && (
              <button
                onClick={handleExport}
                disabled={!processedRows.length}
                style={{
                  height: 34, padding: '0 14px',
                  background: !processedRows.length ? '#E5E7EB' : '#16a34a',
                  color: !processedRows.length ? '#9CA3AF' : '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: '0.78rem', fontWeight: 600,
                  cursor: !processedRows.length ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: '0.9rem' }}>📥</span> Export Excel
              </button>
            )}

          </div>

          {/* Row 2: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSearch}
              disabled={!partyName || !fromDate || !toDate || loading}
              style={{
                height: 34, padding: '0 18px',
                background: (!partyName || !fromDate || !toDate || loading) ? '#E5E7EB' : BRAND.RED,
                color: (!partyName || !fromDate || !toDate || loading) ? '#9CA3AF' : '#fff',
                border: 'none', borderRadius: 7,
                fontSize: '0.78rem', fontWeight: 600, cursor: (!partyName || !fromDate || !toDate) ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Loading…' : 'Search'}
            </button>

            <button
              onClick={handleClear}
              style={{
                height: 34, padding: '0 14px', background: '#fff', color: '#4A4A4A',
                border: '1.5px solid #D1D5DB', borderRadius: 7,
                fontSize: '0.78rem', cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>

        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Error */}
        {error && <ErrorState message={error} />}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader size="md" />
          </div>
        )}

        {/* No selection prompt */}
        {!loading && !searched && !error && (
          <div style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
            padding: '56px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.2rem', marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4A4A4A', marginBottom: 6 }}>
              Select a {isCustomer ? 'customer' : 'vendor'} and date range to begin
            </div>
            <p style={{ fontSize: '0.72rem', color: '#6B7280', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
              The table will show all items {isCustomer ? 'sold to' : 'purchased from'} the selected {isCustomer ? 'customer' : 'vendor'} within the date range,
              comparing the actual SAP invoice price against your application's master price.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <>
            {/* Summary cards */}
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <SummaryCard
                  label="Total Invoice Lines"
                  value={String(summary.total)}
                  sub=""
                  accent="#3b82f6"
                />
                <SummaryCard
                  label={isCustomer ? 'Total Sales Qty' : 'Total Purchase Qty'}
                  value={fmtNum(summary.qty) + ' pcs'}
                  sub=""
                />
                <SummaryCard
                  label={isCustomer ? 'Total AR Invoice Value' : 'Total AP Invoice Value'}
                  value={fmt(summary.sapTotal, currencyCode)}
                  sub=""
                />
                {(() => {
                  const isZero = Math.abs(summary.totalVar) < 0.01;
                  let subText = 'No variance';
                  let accentColor = '#16a34a'; // Green
                  if (!isZero) {
                    if (mode === 'vendor') {
                      const isLoss = summary.totalVar > 0;
                      subText = isLoss ? 'Loss (Over-paid)' : 'Profit (Under-paid)';
                      accentColor = isLoss ? '#dc2626' : '#d97706'; // Red vs Yellow/Amber
                    } else {
                      const isLoss = summary.totalVar < 0;
                      subText = isLoss ? 'Loss (Under-billed)' : 'Profit (Over-billed)';
                      accentColor = isLoss ? '#dc2626' : '#d97706';
                    }
                  }
                  return (
                    <SummaryCard
                      label="Total Variance"
                      value={fmt(Math.abs(summary.totalVar), currencyCode)}
                      sub={subText}
                      accent={accentColor}
                    />
                  );
                })()}
              </div>
            )}

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '11px 16px', borderBottom: '1px solid #E5E7EB',
                background: 'rgba(249,250,251,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E1E1E' }}>
                    {isCustomer ? 'AR Invoice vs Customer Master Price' : 'AP Invoice vs Vendor Master Price'}
                  </div>
                </div>
                <span className="font-mono" style={{
                  fontSize: '0.68rem',
                  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4,
                  padding: '2px 8px', color: '#6B7280',
                }}>
                  {processedRows.length} shown
                </span>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {/* Column headers */}
                    <tr>
                      <th style={th}>Invoice Number</th>
                      <th style={th}>Invoice Date</th>
                      <th style={th}>Status</th>
                      <th style={th}>Item Code</th>
                      <th style={th}>Description</th>
                      {!isCustomer && <th style={{ ...th, minWidth: 110 }}>Grade</th>}
                      {!isCustomer && <th style={th}>Customer</th>}
                      {isCustomer && <th style={th}>Category</th>}

                      {/* Qty */}
                      <th style={{ ...th, textAlign: 'right' }}>
                        {isCustomer ? 'Sales Qty' : 'Purchase Qty'}
                      </th>

                      {/* Invoice Prices */}
                      <th style={{ ...th, textAlign: 'right' }}>
                        {isCustomer ? 'AR Invoice Price' : 'AP Invoice Price'}
                      </th>
                      <th style={{ ...th, textAlign: 'right' }}>
                        {isCustomer ? 'AR Total' : 'AP Total'}
                      </th>

                      {/* Master */}
                      <th style={{ ...th, textAlign: 'right' }}>{isCustomer ? 'Customer' : 'Vendor'} Master Unit Price</th>
                      <th style={{ ...th, textAlign: 'right' }}>{isCustomer ? 'Customer' : 'Vendor'} Master Total</th>

                      {/* Variance */}
                      <th style={{ ...th, textAlign: 'right' }}>Unit Variance</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedRows.length === 0 ? (
                      <tr>
                        <td colSpan={isCustomer ? 13 : 14} style={{ ...td, textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
                          No invoice records found for <strong>{partyName}</strong> matching current search.
                        </td>
                      </tr>
                    ) : processedRows.map((row, idx) => {
                      const qty = Number(isCustomer ? row.sales_qty : row.purchase_qty);
                      const unitVar = row.unit_variance != null ? Number(row.unit_variance) : null;
                      const totalVar = row.total_variance != null ? Number(row.total_variance) : null;
                      const varPct = row.variance_pct != null ? Number(row.variance_pct) : null;
                      const rowBg = idx % 2 === 0 ? '#fff' : '#FAFAFA';
                      return (
                        <tr key={idx} style={{ background: rowBg }}>
                          {/* Invoice Number */}
                          <td style={{ ...td, fontWeight: 600, color: '#4B5563' }}>
                            {row.invoice_num || '—'}
                          </td>
                          {/* Invoice Date */}
                          <td style={td}>
                            {row.invoice_date ? new Date(row.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                          </td>
                          {/* Status */}
                          <td style={td}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2.5px 6px',
                              borderRadius: 4,
                              textTransform: 'uppercase',
                              background: String(row.doc_status).trim().toUpperCase() === 'O' ? '#FEF3C7' : '#E5E7EB',
                              color: String(row.doc_status).trim().toUpperCase() === 'O' ? '#B45309' : '#374151',
                              border: `1px solid ${String(row.doc_status).trim().toUpperCase() === 'O' ? '#FCD34D' : '#D1D5DB'}`,
                            }}>
                              {String(row.doc_status).trim().toUpperCase() === 'O' ? 'Open' : 'Closed'}
                            </span>
                          </td>

                          {/* Item code */}
                          <td style={td}>
                            {row.item_code}
                          </td>
                          {/* Description */}
                          <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.description || '—'}
                          </td>

                          {/* Vendor-mode extras */}
                          {!isCustomer && (
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '0.78rem', color: '#4B5563', fontWeight: 500 }}>{row.grade || '—'}</span>
                            </td>
                          )}
                          {!isCustomer && (
                            <td style={{ ...td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.customer_name}>
                              {row.customer_name || '—'}
                            </td>
                          )}

                          {/* Customer-mode category */}
                          {isCustomer && (
                            <td style={td}>
                              <span style={{
                                display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                                fontSize: '0.62rem', fontWeight: 600,
                                background: row.category === 'Domestic' ? '#EEF2FF'
                                  : row.category === 'Export' ? '#F0FDF4'
                                  : row.category === 'Labour / Job Work' ? '#FFFBEB'
                                  : row.category === 'Pin & Bush' ? '#FDF4FF'
                                  : '#F3F4F6',
                                color: row.category === 'Domestic' ? '#3730A3'
                                  : row.category === 'Export' ? '#166534'
                                  : row.category === 'Labour / Job Work' ? '#92400E'
                                  : row.category === 'Pin & Bush' ? '#6B21A8'
                                  : '#6B7280',
                              }}>
                                {row.category || '—'}
                              </span>
                            </td>
                          )}

                          {/* Qty */}
                          <td style={tdMono}>
                            {fmtNum(qty)} pcs
                          </td>

                          {/* invoice prices */}
                          <td style={tdMono}>
                            {fmt(Number(row.sap_unit_price), row.currency)}
                          </td>
                          <td style={{ ...tdMono, fontWeight: 600 }}>
                            {fmt(Number(row.sap_total_price), row.currency)}
                          </td>

                          {/* Master Price */}
                          <td style={tdMono}>
                            {row.export_unit_price != null ? (
                              fmt(Number(row.export_unit_price), row.currency)
                            ) : (
                              <span style={{ color: '#9CA3AF' }}>—</span>
                            )}
                          </td>
                          <td style={tdMono}>
                            {row.app_master_price != null ? (
                              fmt(Number(row.app_master_price), row.currency)
                            ) : (
                              <span style={{ color: '#9CA3AF' }}>Not in master</span>
                            )}
                          </td>

                          {/* Variance */}
                          <td style={tdMono}>
                            <VarianceBadge value={row.app_master_price != null ? unitVar : null} pct={row.app_master_price != null ? varPct : null} currency={row.currency} mode={mode} />
                          </td>
                          <td style={tdMono}>
                            {row.app_master_price != null && totalVar != null ? (() => {
                              const isZero = Math.abs(totalVar) < 0.01;
                              let color = '#15803d'; // Green for no mismatch
                              if (!isZero) {
                                if (mode === 'vendor') {
                                  const isLoss = totalVar > 0;
                                  color = isLoss ? '#991B1B' : '#b45309';
                                } else {
                                  const isLoss = totalVar < 0;
                                  color = isLoss ? '#991B1B' : '#b45309';
                                }
                              }
                              return (
                                <span style={{ fontWeight: 700, color }}>
                                  {fmt(Math.abs(totalVar), row.currency)}
                                </span>
                              );
                            })() : '-'}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Total row */}
                    {processedRows.length > 0 && summary && (
                      <tr style={{ background: '#F9FAFB', borderTop: '1.5px solid #D1D5DB' }}>
                        <td colSpan={isCustomer ? 5 : 6} style={{ ...td, fontWeight: 700, color: '#1E1E1E' }}>
                          Aggregate Total
                        </td>
                        <td style={{ ...tdMono, fontWeight: 700, color: '#1e3a8a' }}>
                           {fmtNum(summary.qty)} pcs
                        </td>
                        <td style={tdMono}>—</td>
                        <td style={{ ...tdMono, fontWeight: 700 }}>
                          {fmt(summary.sapTotal, currencyCode)}
                        </td>
                        <td style={tdMono}>—</td>
                        <td style={tdMono}>—</td>
                        <td style={tdMono}>—</td>
                        <td style={{
                          ...tdMono, fontWeight: 700,
                          color: (() => {
                            const isZero = Math.abs(summary.totalVar) < 0.01;
                            if (isZero) return '#15803d'; // Green
                            if (mode === 'vendor') {
                              return summary.totalVar > 0 ? '#991B1B' : '#b45309'; // Red vs Yellow/Amber
                            } else {
                              return summary.totalVar < 0 ? '#991B1B' : '#b45309';
                            }
                          })()
                        }}>
                          {fmt(Math.abs(summary.totalVar), currencyCode)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PricingComparisonPage;
