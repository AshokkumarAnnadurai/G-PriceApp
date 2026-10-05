import React,{ useEffect,useState } from 'react';
import { apiClient } from '../../api/client';
import { Card,DataTable,Input,PageHeader,Pagination,Select,SlidePanel } from '../../components/ui';

interface AuditLogData {
  id: number;
  username: string;
  action: string;
  module: string;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  browser: string | null;
  device: string | null;
  created_at: string;
}

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  // Selected Log Row for detail display
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/management/audit-logs', {
        params: {
          search,
          module: moduleFilter,
          limit: pageSize,
          offset: (page - 1) * pageSize
        }
      });
      setLogs((res.data as any).items || []);
      setTotal((res.data as any).total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, search, moduleFilter]);

  // Format cell value cleanly, parsing JSON if applicable
  const formatValue = (val: string | null) => {
    if (!val) return '-';
    try {
      const parsed = JSON.parse(val);
      return <pre className="text-[11px] font-mono leading-relaxed bg-gray-50 border p-2 rounded overflow-auto max-h-[160px] whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <span className="font-mono text-xs break-all">{val}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="System Audit Logs" />

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        {/* Filters */}
        <Card className="p-4 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[240px]">
            <Input
              placeholder="Search by User, Action, or Log values..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-[200px]">
            <Select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(1); }} label="Module">
              <option value="">All Modules</option>
              <option value="User Management">User Management</option>
              <option value="Role Management">Role Management</option>
              <option value="Screen Management">Screen Management</option>
              <option value="Pricing Update">Pricing Update</option>
              <option value="Auth">Auth</option>
            </Select>
          </div>
        </Card>

        {/* Audit Log Table */}
        <Card className="flex-1 overflow-hidden flex flex-col p-4">
          <DataTable
            loading={loading}
            rows={logs}
            keyFn={r => r.id}
            emptyMessage="No audit logs recorded matching search criteria."
            columns={[
              { key: 'id', header: 'Log ID', render: r => <span className="font-semibold text-gray-500">#{r.id}</span> },
              { key: 'created_at', header: 'Timestamp', render: r => new Date(r.created_at).toLocaleString() },
              { key: 'username', header: 'Performed By', render: r => <span className="font-semibold text-gray-900">{r.username}</span> },
              { key: 'action', header: 'Action', render: r => <span className="font-medium">{r.action}</span> },
              { key: 'module', header: 'Module', render: r => r.module },
              { key: 'ip_address', header: 'IP Address', render: r => r.ip_address || '-' },
              { key: 'device', header: 'Device', render: r => r.device || 'Desktop' },
              {
                key: 'details',
                header: 'Audit details',
                align: 'right',
                render: r => (
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(expandedLogId === r.id ? null : r.id)}
                    className="p-2 text-violet-600 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 rounded-full transition-all duration-200"
                    title={expandedLogId === r.id ? 'Hide Details' : 'View Changes'}
                  >
                    {expandedLogId === r.id ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                )
              }
            ]}
          />

          {/* Pagination Footer */}
          <Pagination
            page={page}
            pageSize={pageSize}
            totalRecords={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
      </div>

      {/* SlidePanel for Audit Log Detail View */}
      <SlidePanel
        isOpen={expandedLogId !== null}
        onClose={() => setExpandedLogId(null)}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <h3 className="font-semibold text-gray-900 text-base">Audit Log Detail & Value Changes</h3>
            <button onClick={() => setExpandedLogId(null)} className="text-gray-500 hover:text-red-600 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {expandedLogId !== null && (() => {
              const activeLog = logs.find(l => l.id === expandedLogId);
              if (!activeLog) return null;

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 text-xs border-b pb-4">
                    <div>
                      <span className="font-semibold text-gray-500 block">Log ID</span>
                      <span className="font-medium text-gray-900">#{activeLog.id}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 block">Timestamp</span>
                      <span className="font-medium text-gray-900">{new Date(activeLog.created_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 block">Performed By</span>
                      <span className="font-medium text-gray-900">{activeLog.username}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 block">Action & Module</span>
                      <span className="font-medium text-gray-900">{activeLog.action} ({activeLog.module})</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 block">IP & Device</span>
                      <span className="font-medium text-gray-900">{activeLog.ip_address} | {activeLog.device}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 block">Browser / User Agent</span>
                      <span className="font-medium text-gray-900 truncate block max-w-xs" title={activeLog.browser || ''}>{activeLog.browser || 'Unknown'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 text-xs mb-2">Previous State / Value</h4>
                      {formatValue(activeLog.old_value)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-xs mb-2">New State / Value</h4>
                      {formatValue(activeLog.new_value)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </SlidePanel>
    </div>
  );
};
export default AuditLogPage;
