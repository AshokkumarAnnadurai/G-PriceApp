import React,{ useEffect,useState } from 'react';
import { apiClient } from '../../api/client';
import { Badge,Button,Card,DataTable,Input,Modal,Select,SlidePanel } from '../../components/ui';
import { usePermissions } from '../../hooks/usePermissions';


interface UserData {
  id: number;
  employee_name: string;
  username: string;
  email: string;
  mobile_number: string | null;
  status: string;
  last_login: string | null;
  created_at: string;
  role: string;
}

export const UserManagementPage: React.FC = () => {
  const { check } = usePermissions();
  const screenName = 'User Management';

  const [users, setUsers] = useState<UserData[]>([]);
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

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Drawer Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [employeeName, setEmployeeName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [assignedRole, setAssignedRole] = useState('Admin');
  const [status, setStatus] = useState('Active');
  
  // Password reset inside Edit Drawer
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: number; username: string } | null>(null);



  // Fetch Users
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/management/users', {
        params: {
          search,
          role: roleFilter,
          status: statusFilter
        }
      });
      setUsers(res.data as any);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, statusFilter]);

  const handleOpenAdd = () => {
    setEditMode(false);
    setSelectedUserId(null);
    setEmployeeName('');
    setUsername('');
    setEmail('');
    setMobile('');
    setPassword('');
    setAssignedRole('Admin');
    setStatus('Active');
    setNewPassword('');
    setError('');
    setDrawerOpen(true);
  };

  const handleOpenEdit = (user: UserData) => {
    setEditMode(true);
    setSelectedUserId(user.id);
    setEmployeeName(user.employee_name);
    setUsername(user.username);
    setEmail(user.email);
    setMobile(user.mobile_number || '');
    setAssignedRole(user.role || 'Manager');
    setStatus(user.status);
    setNewPassword('');
    setError('');
    setDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Simple validations
    if (!employeeName.trim() || !username.trim() || !email.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!editMode && !password.trim()) {
      setError('Password is required for new users.');
      return;
    }

    const payload = {
      employeeName,
      username,
      email,
      mobile,
      password: editMode ? undefined : password,
      defaultRole: assignedRole,
      status
    };

    try {
      if (editMode && selectedUserId) {
         await apiClient.put(`/management/users/${selectedUserId}`, payload);
        showToast('User updated successfully.');
        setDrawerOpen(false);
        fetchUsers();
      } else {
        await apiClient.post('/management/users', payload);
        showToast('User created successfully.');
        setDrawerOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      setError('Please enter a new password.');
      return;
    }
    setResettingPassword(true);
    setError('');
    try {
      await apiClient.post(`/management/users/${selectedUserId}/reset-password`, { password: newPassword });
      showToast('Password reset successfully.');
      setNewPassword('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Password reset failed.');
    } finally {
      setResettingPassword(false);
    }
  };

  const triggerDeleteConfirm = (id: number, username: string) => {
    setUserToDelete({ id, username });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setError('');
    try {
      await apiClient.delete(`/management/users/${userToDelete.id}`);
      showToast('User deleted successfully.');
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Deletion failed.');
    }
  };



  const roleColors: Record<string, string> = {
    Admin: '#16a34a',
    Manager: '#d97706',
    QA: '#7c3aed',
    Production: '#2563eb'
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Unified Header with Filters */}
      <div className="bg-white border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wider">User Management</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[300px]">
            <Input
              placeholder="Search by Employee name, Username or Email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Admin">Admin</option>
              <option value="User">User</option>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </div>
          {check(screenName, 'canCreate') && (
            <Button variant="primary" onClick={handleOpenAdd} className="shrink-0 bg-red-700 hover:bg-red-800 border-red-700 text-white font-medium px-5">
              Add User
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
        {/* Alerts */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        {/* Data Table */}
        <Card className="flex-1 overflow-hidden flex flex-col p-4">
          <DataTable
            loading={loading}
            rows={users}
            keyFn={r => r.id}
            emptyMessage="No users found matching current filters."
            columns={[
              { key: 'id', header: 'User ID', render: r => <span className="font-semibold text-gray-500">#{r.id}</span> },
              { key: 'employee_name', header: 'Employee Name', render: r => <span className="font-medium text-gray-900">{r.employee_name}</span> },
              { key: 'username', header: 'Username', render: r => r.username },
              { key: 'email', header: 'Email', render: r => r.email },
              { key: 'mobile_number', header: 'Mobile Number', render: r => r.mobile_number || '-' },
              {
                key: 'role',
                header: 'Assigned Role',
                render: r => <Badge label={r.role || 'None'} color={roleColors[r.role] || '#6b7280'} />
              },
              {
                key: 'status',
                header: 'Status',
                render: r => <Badge label={r.status} color={r.status === 'Active' ? '#16a34a' : '#6b7280'} />
              },
              {
                key: 'last_login',
                header: 'Last Login',
                render: r => r.last_login ? new Date(r.last_login).toLocaleString() : <span className="text-gray-400 italic">Never</span>
              },
              {
                key: 'created_at',
                header: 'Created Date',
                render: r => new Date(r.created_at).toLocaleDateString()
              },
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
                        title="Edit User"
                        className="p-2 text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    {check(screenName, 'canDelete') && (
                      <button
                        type="button"
                        onClick={() => triggerDeleteConfirm(r.id, r.username)}
                        title="Delete User"
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

      {/* Add / Edit Slide Drawer */}
      <SlidePanel
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="w-full max-w-md"
      >
        <div className="flex flex-col h-full bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <h3 className="font-semibold text-gray-900 text-base">{editMode ? 'Edit User details' : 'Add New User'}</h3>
            <button type="button" onClick={() => setDrawerOpen(false)} className="text-gray-500 hover:text-red-600 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#fcfcfc]">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Employee Name *"
                value={employeeName}
                onChange={e => setEmployeeName(e.target.value)}
                required
              />
              <Input
                label="Username *"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={editMode}
                required
              />
              <Input
                label="Email Address *"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <Input
                label="Mobile Number"
                type="tel"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
              />

              {!editMode && (
                <Input
                  label="Password *"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              )}

              <Select
                label="Assigned Role *"
                value={assignedRole}
                onChange={e => setAssignedRole(e.target.value)}
              >
                <option value="Super Admin">Super Admin</option>
                <option value="Admin">Admin</option>
                <option value="User">User</option>
              </Select>

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
                  {editMode ? 'Save Changes' : 'Create User'}
                </Button>
              </div>
            </form>

            {editMode && check(screenName, 'canEdit') && (
              <div className="mt-8 pt-8 border-t space-y-4">
                <h4 className="font-semibold text-gray-900 text-sm">Reset Password</h4>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      label="New Password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>
                  <Button variant="secondary" onClick={handleResetPassword} loading={resettingPassword}>
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SlidePanel>

      {deleteConfirmOpen && userToDelete && (
        <Modal title="Confirm Deletion" onClose={() => setDeleteConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-red-900">Warning: This action cannot be undone.</p>
                <p className="mt-1 text-red-700">Are you sure you want to delete user <span className="font-bold">@{userToDelete.username}</span>?</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white">
                Delete User
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
export default UserManagementPage;
