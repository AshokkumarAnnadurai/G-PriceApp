import React,{ useEffect,useState } from 'react';
import { apiClient } from '../../api/client';
import { Badge,Card,DataTable,Input,PageHeader,Select } from '../../components/ui';

interface ApiData {
  id: number;
  api_name: string;
  endpoint: string;
  http_method: string;
  module: string;
  auth_required: boolean;
  status: string;
}

export const ApiPermissionPage: React.FC = () => {
  const [apis, setApis] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  // Fetch APIs
  const fetchApis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/management/apis');
      setApis(res.data as any);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch API registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApis();
  }, []);

  const methodColors: Record<string, string> = {
    GET: '#16a34a',
    POST: '#2563eb',
    PUT: '#ca8a04',
    DELETE: '#dc2626',
    PATCH: '#7c3aed'
  };

  // Filter local rows
  const filteredApis = apis.filter(api => {
    const matchesSearch = api.api_name.toLowerCase().includes(search.toLowerCase()) || 
                          api.endpoint.toLowerCase().includes(search.toLowerCase());
    const matchesModule = moduleFilter ? api.module === moduleFilter : true;
    return matchesSearch && matchesModule;
  });

  const uniqueModules = Array.from(new Set(apis.map(a => a.module).filter(Boolean)));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="API Permission Registry" />

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
              placeholder="Search by API name or endpoint pattern..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="w-[180px]">
            <Select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} label="Filter by Module">
              <option value="">All Modules</option>
              {uniqueModules.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
        </Card>

        {/* List Registry */}
        <Card className="flex-1 overflow-hidden flex flex-col p-4">
          <DataTable
            loading={loading}
            rows={filteredApis}
            keyFn={r => r.id}
            emptyMessage="No APIs registered under current filters."
            columns={[
              { key: 'id', header: 'API ID', render: r => <span className="font-semibold text-gray-500">#{r.id}</span> },
              { key: 'api_name', header: 'API Endpoint Name', render: r => <span className="font-semibold text-gray-900">{r.api_name}</span> },
              {
                key: 'http_method',
                header: 'HTTP Method',
                render: r => <Badge label={r.http_method} color={methodColors[r.http_method.toUpperCase()] || '#6b7280'} />
              },
              { key: 'endpoint', header: 'Endpoint Pattern', render: r => <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded border">{r.endpoint}</span> },
              { key: 'module', header: 'API Module', render: r => r.module },
              {
                key: 'auth_required',
                header: 'Security Level',
                render: r => <Badge label={r.auth_required ? 'JWT Authorized' : 'Public'} color={r.auth_required ? '#dc2626' : '#16a34a'} />
              },
              { key: 'status', header: 'Status', render: r => <Badge label={r.status} color={r.status === 'Active' ? '#16a34a' : '#6b7280'} /> }
            ]}
          />
        </Card>
      </div>
    </div>
  );
};
export default ApiPermissionPage;
