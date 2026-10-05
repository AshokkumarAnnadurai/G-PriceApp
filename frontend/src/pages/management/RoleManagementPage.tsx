import React,{ useEffect,useState } from 'react';
import { apiClient } from '../../api/client';
import { Badge,Button,Card,DataTable,Input,Modal,PageHeader,SlidePanel } from '../../components/ui';
import { usePermissions } from '../../hooks/usePermissions';

interface RoleData {
  id: number;
  role_name: string;
  description: string | null;
  status: string;
  users_count: number;
}

interface ScreenPermission {
  screenId: number;
  screen_name: string;
  display_name: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_import: boolean;
  can_approve: boolean;
  can_print: boolean;
}

interface ApiPermission {
  apiId: number;
  api_name: string;
  endpoint: string;
  http_method: string;
  module: string;
  permission_type: 'Allow' | 'Deny' | 'Read Only';
}

export const RoleManagementPage: React.FC = () => {
  const { check } = usePermissions();
  const screenName = 'Role Management';

  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    const timer = setTimeout(() => {
      setToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  };

  // Drawer Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Active');

  // Nested Permissions State inside edit drawer
  const [activeTab, setActiveTab] = useState<'screen' | 'api' | 'menu'>('screen');
  const [screensPerm, setScreensPerm] = useState<ScreenPermission[]>([]);
  const [apisPerm, setApisPerm] = useState<ApiPermission[]>([]);

  // Delete Confirmation Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{ id: number; roleName: string } | null>(null);

  // Fetch Roles
  const fetchRoles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/management/roles');
      setRoles(res.data as any);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleOpenAdd = () => {
    setEditMode(false);
    setSelectedRoleId(null);
    setRoleName('');
    setDescription('');
    setStatus('Active');
    setScreensPerm([]);
    setApisPerm([]);
    setError('');
    setDrawerOpen(true);
  };

  const handleOpenEdit = async (role: RoleData) => {
    setEditMode(true);
    setSelectedRoleId(role.id);
    setRoleName(role.role_name);
    setDescription(role.description || '');
    setStatus(role.status);
    setError('');
    setDrawerOpen(true);
    
    // Fetch permissions for this role
    try {
      const res = await apiClient.get(`/management/roles/${role.id}/permissions`);
      const screens = (res.data as any).screens.map((s: any) => ({
        screenId: s.screen_id,
        screen_name: s.screen_name,
        display_name: s.display_name,
        module: s.module,
        can_view: !!s.can_view,
        can_create: !!s.can_create,
        can_edit: !!s.can_edit,
        can_delete: !!s.can_delete,
        can_export: !!s.can_export,
        can_import: !!s.can_import,
        can_approve: !!s.can_approve,
        can_print: !!s.can_print
      }));

      const apis = (res.data as any).apis.map((a: any) => ({
        apiId: a.api_id,
        api_name: a.api_name,
        endpoint: a.endpoint,
        http_method: a.http_method,
        module: a.module,
        permission_type: a.permission_type || 'Allow'
      }));

      setScreensPerm(screens);
      setApisPerm(apis);
    } catch (err: any) {
      setError('Failed to fetch role permissions.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!roleName.trim()) {
      setError('Role Name is required.');
      return;
    }

    try {
      if (editMode && selectedRoleId) {
        // Save Role details
        await apiClient.put(`/management/roles/${selectedRoleId}`, {
          roleName,
          description,
          status
        });

        // Save Permissions
        const formattedScreens = screensPerm.map(s => ({
          screenId: s.screenId,
          canView: s.can_view,
          canCreate: s.can_create,
          canEdit: s.can_edit,
          canDelete: s.can_delete,
          canExport: s.can_export,
          canImport: s.can_import,
          canApprove: s.can_approve,
          canPrint: s.can_print
        }));

        const formattedApis = apisPerm.map(a => ({
          apiId: a.apiId,
          permissionType: a.permission_type
        }));

        await apiClient.put(`/management/roles/${selectedRoleId}/permissions`, {
          screens: formattedScreens,
          apis: formattedApis
        });

        showToast('Role & permissions saved successfully.');
        setDrawerOpen(false);
        fetchRoles();
      } else {
        await apiClient.post('/management/roles', {
          roleName,
          description,
          status
        });
        showToast('Role created successfully.');
        setDrawerOpen(false);
        fetchRoles();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    }
  };

  const handleClone = async (roleId: number, rName: string) => {
    const newName = window.prompt(`Clone Role: ${rName}\nEnter new role name:`);
    if (!newName || !newName.trim()) return;

    setError('');
    try {
      await apiClient.post(`/management/roles/${roleId}/clone`, { newRoleName: newName.trim() });
      showToast(`Role cloned successfully as "${newName.trim()}".`);
      fetchRoles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Cloning failed.');
    }
  };

  const triggerDeleteConfirm = (id: number, roleName: string) => {
    setRoleToDelete({ id, roleName });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roleToDelete) return;
    setError('');
    try {
      await apiClient.delete(`/management/roles/${roleToDelete.id}`);
      showToast('Role deleted successfully.');
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
      fetchRoles();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Deletion failed.');
    }
  };

  // Toggle handlers for screen permissions
  const handleToggleScreen = (screenId: number, field: keyof Omit<ScreenPermission, 'screenId' | 'screen_name' | 'display_name' | 'module'>) => {
    setScreensPerm(prev => prev.map(s => {
      if (s.screenId === screenId) {
        return { ...s, [field]: !s[field] };
      }
      return s;
    }));
  };

  // Toggle all row columns for a screen
  const handleToggleAllScreenRow = (screenId: number, val: boolean) => {
    setScreensPerm(prev => prev.map(s => {
      if (s.screenId === screenId) {
        return {
          ...s,
          can_view: val,
          can_create: val,
          can_edit: val,
          can_delete: val,
          can_export: val,
          can_import: val,
          can_approve: val,
          can_print: val
        };
      }
      return s;
    }));
  };

  const handleApiPermissionChange = (apiId: number, type: 'Allow' | 'Deny' | 'Read Only') => {
    setApisPerm(prev => prev.map(a => {
      if (a.apiId === apiId) {
        return { ...a, permission_type: type };
      }
      return a;
    }));
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader
        title="Role Management"
        actions={
          check(screenName, 'canCreate') && (
            <Button variant="primary" onClick={handleOpenAdd}>
              Add Role
            </Button>
          )
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        <Card className="flex-1 overflow-hidden flex flex-col p-4">
          <DataTable
            loading={loading}
            rows={roles}
            keyFn={r => r.id}
            emptyMessage="No roles registered in system."
            columns={[
              { key: 'id', header: 'Role ID', render: r => <span className="font-semibold text-gray-500">#{r.id}</span> },
              { key: 'role_name', header: 'Role Name', render: r => <span className="font-semibold text-gray-900">{r.role_name}</span> },
              { key: 'description', header: 'Description', render: r => r.description || <span className="text-gray-400 italic">No description</span> },
              { key: 'users_count', header: 'Assigned Users', render: r => <Badge label={`${r.users_count} users`} color="#4f46e5" /> },
              { key: 'status', header: 'Status', render: r => <Badge label={r.status} color={r.status === 'Active' ? '#16a34a' : '#6b7280'} /> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: r => (
                  <div className="flex gap-2 justify-end">
                    {check(screenName, 'canCreate') && (
                      <button
                        type="button"
                        onClick={() => handleClone(r.id, r.role_name)}
                        title="Clone Role"
                        className="p-2 text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h2m2-2h8a2 2 0 002-2V7a2 2 0 00-2-2h-8a2 2 0 00-2 2z" />
                        </svg>
                      </button>
                    )}
                    {check(screenName, 'canEdit') && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(r)}
                        title="Edit Permissions"
                        className="p-2 text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-full transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2 4a5 5 0 110-10 5 5 0 010 10zM12 14l-4 4v2h2v-2h2v-2h2v-2" />
                        </svg>
                      </button>
                    )}
                    {check(screenName, 'canDelete') && (
                      <button
                        type="button"
                        onClick={() => triggerDeleteConfirm(r.id, r.role_name)}
                        title="Delete Role"
                        className="p-2 text-rose-600 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-full transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        width={editMode ? 'w-3/4 max-w-5xl' : 'w-full max-w-md'}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-white">
            <h3 className="font-semibold text-gray-900 text-base">
              {editMode ? `Edit Role & Permissions - ${roleName}` : 'Add New Role'}
            </h3>
            <button type="button" onClick={() => setDrawerOpen(false)} className="text-gray-500 hover:text-red-600 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#fcfcfc]">
            <form onSubmit={handleSubmit} className="h-full flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            <Input
              label="Role Name *"
              value={roleName}
              onChange={e => setRoleName(e.target.value)}
              required
            />
            <Input
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {editMode && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* Permission Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('screen')}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 focus:outline-none ${
                    activeTab === 'screen' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Screen Access Matrix
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('api')}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 focus:outline-none ${
                    activeTab === 'api' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  API Level Control
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 focus:outline-none ${
                    activeTab === 'menu' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Menu Hierarchy Access
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 min-h-0 overflow-auto border rounded-lg p-4 bg-white">
                {activeTab === 'screen' && (
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="p-2 font-semibold">Screen Name</th>
                        <th className="p-2 text-center font-semibold">View</th>
                        <th className="p-2 text-center font-semibold">Create</th>
                        <th className="p-2 text-center font-semibold">Edit</th>
                        <th className="p-2 text-center font-semibold">Delete</th>
                        <th className="p-2 text-center font-semibold">Export</th>
                        <th className="p-2 text-center font-semibold">Import</th>
                        <th className="p-2 text-center font-semibold">Approve</th>
                        <th className="p-2 text-center font-semibold">Print</th>
                        <th className="p-2 text-right font-semibold">Quick toggle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {screensPerm.map(s => (
                        <tr key={s.screenId} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium text-gray-900">{s.display_name} <span className="text-gray-400">({s.module})</span></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_view} onChange={() => handleToggleScreen(s.screenId, 'can_view')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_create} onChange={() => handleToggleScreen(s.screenId, 'can_create')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_edit} onChange={() => handleToggleScreen(s.screenId, 'can_edit')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_delete} onChange={() => handleToggleScreen(s.screenId, 'can_delete')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_export} onChange={() => handleToggleScreen(s.screenId, 'can_export')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_import} onChange={() => handleToggleScreen(s.screenId, 'can_import')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_approve} onChange={() => handleToggleScreen(s.screenId, 'can_approve')} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={s.can_print} onChange={() => handleToggleScreen(s.screenId, 'can_print')} /></td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleAllScreenRow(s.screenId, true)}
                              className="text-[10px] text-green-600 mr-2 font-semibold hover:underline"
                            >
                              All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleAllScreenRow(s.screenId, false)}
                              className="text-[10px] text-red-600 font-semibold hover:underline"
                            >
                              None
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'api' && (
                  <div className="space-y-4">
                    {apisPerm.map(a => (
                      <div key={a.apiId} className="flex items-center justify-between p-2 border-b hover:bg-gray-50 text-xs">
                        <div className="flex-1">
                          <span className="font-semibold text-gray-900">{a.api_name}</span>
                          <div className="text-gray-400 font-mono mt-0.5">{a.http_method} {a.endpoint}</div>
                        </div>
                        <div className="w-[140px] shrink-0">
                          <select
                            value={a.permission_type}
                            onChange={e => handleApiPermissionChange(a.apiId, e.target.value as any)}
                            className="w-full text-xs p-1 border rounded"
                          >
                            <option value="Allow">Allow</option>
                            <option value="Deny">Deny</option>
                            <option value="Read Only">Read Only</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'menu' && (
                  <div className="space-y-6">
                    <p className="text-xs text-gray-500">Enable/disable view access for parent menus instantly.</p>
                    {['Main', 'Master', 'Pricing', 'Management'].map(modName => {
                      const modScreens = screensPerm.filter(s => s.module === modName);
                      const allView = modScreens.every(s => s.can_view);
                      
                      const toggleModule = (val: boolean) => {
                        setScreensPerm(prev => prev.map(s => {
                          if (s.module === modName) {
                            return { ...s, can_view: val };
                          }
                          return s;
                        }));
                      };

                      return (
                        <div key={modName} className="p-3 border rounded-lg bg-gray-50">
                          <div className="flex items-center justify-between border-b pb-2 mb-2">
                            <span className="font-semibold text-sm text-gray-800">{modName} Menu Cluster</span>
                            <label className="flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={allView}
                                onChange={e => toggleModule(e.target.checked)}
                              />
                              Toggle Cluster
                            </label>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {modScreens.map(s => (
                              <label key={s.screenId} className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={s.can_view}
                                  onChange={() => handleToggleScreen(s.screenId, 'can_view')}
                                />
                                {s.display_name}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t shrink-0">
            <Button variant="secondary" type="button" onClick={() => setDrawerOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="flex-1">
              {editMode ? 'Save Permissions' : 'Create Role'}
            </Button>
          </div>
        </form>
          </div>
        </div>
      </SlidePanel>

      {deleteConfirmOpen && roleToDelete && (
        <Modal title="Confirm Deletion" onClose={() => setDeleteConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-red-900">Warning: This action cannot be undone.</p>
                <p className="mt-1 text-red-700">Are you sure you want to delete role <span className="font-bold">{roleToDelete.roleName}</span>?</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white">
                Delete Role
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium ${
            toast.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{toast.message}</span>
            <button 
              type="button" 
              onClick={() => setToast(null)} 
              className={`ml-2 hover:opacity-75 ${toast.type === 'success' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}`}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default RoleManagementPage;
