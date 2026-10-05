export function usePermissions() {
  const rolesJson = localStorage.getItem('gk_role');
  let roles: string[] = [];
  if (rolesJson) {
    try {
      const parsed = JSON.parse(rolesJson);
      roles = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      roles = [rolesJson];
    }
  }
  const isAdmin = roles.map((r: string) => r.toLowerCase()).includes('super admin');

  const permissionsJson = localStorage.getItem('gk_screen_permissions');
  let permissions: any[] = [];
  if (permissionsJson) {
    try {
      permissions = JSON.parse(permissionsJson);
    } catch {
      permissions = [];
    }
  }

  const check = (
    screenName: string,
    action: 'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canExport' | 'canImport' | 'canApprove' | 'canPrint'
  ): boolean => {
    if (isAdmin) return true;
    const perm = permissions.find((p: any) => p.screenName === screenName);
    return perm ? !!perm[action] : false;
  };

  return { isAdmin, roles, check };
}
