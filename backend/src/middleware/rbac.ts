import { NextFunction,Response } from 'express';
import { pool } from '../db/pool';
import { AuthRequest } from './auth';

// Helper to match request path to registry pattern (e.g., /vendors/:id -> /vendors/5)
export function matchPath(pattern: string, path: string): boolean {
  const cleanPattern = pattern.replace(/\/$/, '');
  const cleanPath = path.replace(/\/$/, '');

  // Convert colon params (e.g., :id) to regex
  const regexStr = '^' + cleanPattern.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
  try {
    const regex = new RegExp(regexStr);
    return regex.test(cleanPath);
  } catch {
    return false;
  }
}

export const verifyPermission = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const userId = req.user.id;

    // 1. Verify User Status
    const userRes = await pool.query('SELECT status, username FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    if (!user) {
      res.status(401).json({ success: false, message: 'User account not found.' });
      return;
    }

    if (user.status !== 'Active') {
      res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact the administrator.'
      });
      return;
    }

    // 2. Fetch User Roles
    const rolesRes = await pool.query(`
      SELECT r.id, r.role_name 
      FROM roles r 
      JOIN user_role_mapping urm ON urm.role_id = r.id 
      WHERE urm.user_id = $1 AND r.status = 'Active'
    `, [userId]);
    
    const roles = rolesRes.rows;
    const roleIds = roles.map(r => r.id);
    const roleNames = roles.map(r => r.role_name.toLowerCase());

    // 3. Bypass checks for Super Admin role
    if (roleNames.includes('super admin')) {
      return next();
    }

    // 4. Resolve clean path (relative to API, stripping leading /api if present)
    let cleanPath = req.path;
    if (cleanPath.startsWith('/api')) {
      cleanPath = cleanPath.slice(4);
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    const method = req.method.toUpperCase();

    // 5. Fetch all registered APIs
    const apisRes = await pool.query('SELECT * FROM api_registry WHERE status = \'Active\'');
    const apis = apisRes.rows;

    // Find matching API
    const matchedApi = apis.find(api => api.http_method.toUpperCase() === method && matchPath(api.endpoint, cleanPath));

    if (!matchedApi) {
      // If endpoint is not in registry, allow by default if auth_required is handled
      return next();
    }

    if (!matchedApi.auth_required) {
      return next();
    }

    if (roleIds.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have any active roles assigned.'
      });
      return;
    }

    // 6. Check Role API Permissions
    const permRes = await pool.query(`
      SELECT permission_type 
      FROM role_api_permissions 
      WHERE api_id = $1 AND role_id = ANY($2::int[])
    `, [matchedApi.id, roleIds]);

    const permissions = permRes.rows.map(p => p.permission_type);

    // If any role denies it explicitly, block it
    if (permissions.includes('Deny')) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
      return;
    }

    // Check if mutation method is allowed under 'Read Only'
    if (permissions.includes('Read Only')) {
      const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
      if (isMutation) {
        res.status(403).json({
          success: false,
          message: 'Read-only access. Write operations are not allowed.'
        });
        return;
      }
    }

    // Must have at least one explicit 'Allow' or 'Read Only'
    const hasAccess = permissions.includes('Allow') || permissions.includes('Read Only');
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[verifyPermission] Middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server authorization error.' });
  }
};
