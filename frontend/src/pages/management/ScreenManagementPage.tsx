import React,{ useEffect,useState } from 'react';
import { apiClient } from '../../api/client';
import { Badge,Button,Card,DataTable,Input,PageHeader,Select,SlidePanel } from '../../components/ui';
import { usePermissions } from '../../hooks/usePermissions';

interface ScreenData {
  id: number;
  screen_name: string;
  display_name: string;
  module: string;
  route: string;
  icon: string | null;
  parent_menu: string | null;
  display_order: number;
  status: string;
}

export const ScreenManagementPage: React.FC = () => {
  const { check } = usePermissions();
  const screenName = 'Screen Management';

  const [screens, setScreens] = useState<ScreenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Drawer Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedScreenId, setSelectedScreenId] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [route, setRoute] = useState('');
  const [icon, setIcon] = useState('');
  const [parentMenu, setParentMenu] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [status, setStatus] = useState('Active');

  // Fetch Screens
  const fetchScreens = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/management/screens');
      setScreens(res.data as any);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch screens.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreens();
  }, []);

  const handleOpenEdit = (scr: ScreenData) => {
    setSelectedScreenId(scr.id);
    setDisplayName(scr.display_name);
    setRoute(scr.route);
    setIcon(scr.icon || '');
    setParentMenu(scr.parent_menu || '');
    setDisplayOrder(scr.display_order);
    setStatus(scr.status);
    setError('');
    setSuccessMsg('');
    setDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!displayName.trim() || !route.trim()) {
      setError('Display Name and Route are required.');
      return;
    }

    try {
      if (selectedScreenId) {
        await apiClient.put(`/management/screens/${selectedScreenId}`, {
          displayName,
          route,
          icon,
          parentMenu,
          displayOrder,
          status
        });
        setSuccessMsg('Screen registry updated successfully.');
        setDrawerOpen(false);
        fetchScreens();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Update failed.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="Screen Management" />

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium">
            {successMsg}
          </div>
        )}

        <Card className="flex-1 overflow-hidden flex flex-col p-4">
          <DataTable
            loading={loading}
            rows={screens}
            keyFn={r => r.id}
            emptyMessage="No screens registered."
            columns={[
              { key: 'id', header: 'Screen ID', render: r => <span className="font-semibold text-gray-500">#{r.id}</span> },
              { key: 'screen_name', header: 'Technical Name', render: r => r.screen_name },
              { key: 'display_name', header: 'Display Name', render: r => <span className="font-semibold text-gray-900">{r.display_name}</span> },
              { key: 'module', header: 'Module', render: r => r.module },
              { key: 'route', header: 'Frontend Route', render: r => <span className="font-mono text-xs">{r.route}</span> },
              { key: 'icon', header: 'Icon Key', render: r => r.icon || '-' },
              { key: 'parent_menu', header: 'Parent Menu', render: r => r.parent_menu || <span className="text-gray-400 italic">None (Root)</span> },
              { key: 'display_order', header: 'Order Index', render: r => r.display_order },
              { key: 'status', header: 'Status', render: r => <Badge label={r.status} color={r.status === 'Active' ? '#16a34a' : '#6b7280'} /> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: r => (
                  <div className="flex gap-2 justify-end">
                    {check(screenName, 'canEdit') && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(r)}
                        title="Edit Config"
                        className="p-2 text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              }
            ]}
          />
        </Card>
      </div>

      <SlidePanel
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="w-full max-w-md"
      >
        <div className="flex flex-col h-full bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <h3 className="font-semibold text-gray-900 text-base">Edit Screen Configuration</h3>
            <button type="button" onClick={() => setDrawerOpen(false)} className="text-gray-500 hover:text-red-600 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#fcfcfc]">
            <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Display Name *"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
          />
          <Input
            label="Frontend Route *"
            value={route}
            onChange={e => setRoute(e.target.value)}
            required
          />
          <Input
            label="Icon (Lucide/SVG key)"
            value={icon}
            onChange={e => setIcon(e.target.value)}
          />
          <Input
            label="Parent Menu Group"
            value={parentMenu}
            onChange={e => setParentMenu(e.target.value)}
            placeholder="e.g. Masters, Pricing, Management"
          />
          <Input
            label="Display Order (Order index)"
            type="number"
            value={displayOrder}
            onChange={e => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
          />
          <Select
            label="Status *"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </Select>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="secondary" type="button" onClick={() => setDrawerOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="flex-1">
              Save Screen Config
            </Button>
          </div>
        </form>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
};
export default ScreenManagementPage;
