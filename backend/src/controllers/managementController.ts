import bcrypt from 'bcrypt';
import { NextFunction,Response } from 'express';
import { pool } from '../db/pool';
import { AuthRequest } from '../middleware/auth';

// Helper to log administrative audits
async function logAudit(
  req: AuthRequest,
  action: string,
  module: string,
  oldValue: string | null = null,
  newValue: string | null = null
) {
  try {
    const username = req.user?.username || 'System';
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Parse device from user agent roughly
    let device = 'Desktop';
    if (/mobile/i.test(userAgent)) device = 'Mobile';
    else if (/tablet/i.test(userAgent)) device = 'Tablet';

    await pool.query(`
      INSERT INTO audit_logs (username, action, module, old_value, new_value, ip_address, browser, device)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [username, action, module, oldValue, newValue, ipAddress, userAgent, device]);
  } catch (err) {
    console.error('[logAudit] Failed to log audit:', err);
  }
}

// ── USER MANAGEMENT ─────────────────────────────────────────────────────────

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = req.query.search as string || '';
    const roleFilter = req.query.role as string || '';
    const statusFilter = req.query.status as string || '';

    let sql = `
      SELECT u.id, u.employee_name, u.username, u.email, u.mobile_number, u.status, u.last_login, u.created_at, u.updated_at,
             (SELECT STRING_AGG(r.role_name, ', ') FROM roles r JOIN user_role_mapping urm ON urm.role_id = r.id WHERE urm.user_id = u.id) as role
      FROM users u
      WHERE u.deleted_at IS NULL
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (search) {
      sql += ` AND (u.username ILIKE $${pIdx} OR u.employee_name ILIKE $${pIdx} OR u.email ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (statusFilter) {
      sql += ` AND u.status = $${pIdx}`;
      params.push(statusFilter);
      pIdx++;
    }

    if (roleFilter) {
      sql += ` AND EXISTS (
        SELECT 1 FROM user_role_mapping urm 
        JOIN roles r ON r.id = urm.role_id 
        WHERE urm.user_id = u.id AND r.role_name = $${pIdx}
      )`;
      params.push(roleFilter);
      pIdx++;
    }

    sql += ' ORDER BY u.created_at DESC';

    const users = await pool.query(sql, params);
    res.json({ success: true, data: users.rows });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { employeeName, username, email, mobile, password, defaultRole, status } = req.body;

    if (!employeeName || !username || !email || !password || !defaultRole) {
      res.status(400).json({ success: false, message: 'Missing required user fields.' });
      return;
    }

    // Check unique constraints
    const existsRes = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existsRes.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Username or Email already registered.' });
      return;
    }

    await client.query('BEGIN');

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const userRes = await client.query(`
      INSERT INTO users (employee_name, username, email, mobile_number, password_hash, status, created_by, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username
    `, [employeeName, username, email, mobile || null, passwordHash, status || 'Active', req.user?.username, defaultRole]);

    const newUser = userRes.rows[0];

    // Link role
    const roleRes = await client.query('SELECT id FROM roles WHERE role_name = $1', [defaultRole]);
    const role = roleRes.rows[0];
    if (role) {
      await client.query(`
        INSERT INTO user_role_mapping (user_id, role_id)
        VALUES ($1, $2)
      `, [newUser.id, role.id]);
    }

    await client.query('COMMIT');

    await logAudit(req, 'Create User', 'User Management', null, JSON.stringify({ username, defaultRole }));

    res.json({ success: true, message: 'User created successfully.', data: { id: newUser.id } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { employeeName, email, mobile, defaultRole, status } = req.body;

    // Fetch existing user
    const oldUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const oldUser = oldUserRes.rows[0];
    if (!oldUser) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    await client.query('BEGIN');

    // Update fields
    await client.query(`
      UPDATE users 
      SET employee_name = $1, email = $2, mobile_number = $3, status = $4, updated_by = $5, updated_at = NOW(), role = $6
      WHERE id = $7
    `, [employeeName, email, mobile || null, status, req.user?.username, defaultRole, id]);

    // Update role mapping
    const roleRes = await client.query('SELECT id FROM roles WHERE role_name = $1', [defaultRole]);
    const role = roleRes.rows[0];
    if (role) {
      await client.query('DELETE FROM user_role_mapping WHERE user_id = $1', [id]);
      await client.query('INSERT INTO user_role_mapping (user_id, role_id) VALUES ($1, $2)', [id, role.id]);
    }

    await client.query('COMMIT');

    await logAudit(req, 'Update User', 'User Management', JSON.stringify(oldUser), JSON.stringify({ employeeName, email, defaultRole, status }));

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const oldUserRes = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (oldUserRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    // Soft delete
    await pool.query('UPDATE users SET deleted_at = NOW(), status = \'Inactive\' WHERE id = $1', [id]);

    await logAudit(req, 'Delete User', 'User Management', oldUserRes.rows[0].username, 'Soft Deleted');

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ success: false, message: 'Password is required.' });
      return;
    }

    const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, id]);

    await logAudit(req, 'Reset Password', 'User Management', userRes.rows[0].username, 'Password Reset');

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    next(err);
  }
}

// ── ROLE MANAGEMENT ─────────────────────────────────────────────────────────

export async function listRoles(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const sql = `
      SELECT r.*, COUNT(urm.user_id)::int as users_count
      FROM roles r
      LEFT JOIN user_role_mapping urm ON urm.role_id = r.id
      GROUP BY r.id
      ORDER BY r.role_name ASC
    `;
    const roles = await pool.query(sql);
    res.json({ success: true, data: roles.rows });
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roleName, description, status } = req.body;

    if (!roleName) {
      res.status(400).json({ success: false, message: 'Role Name is required.' });
      return;
    }

    const exists = await pool.query('SELECT id FROM roles WHERE role_name = $1', [roleName]);
    if (exists.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Role already exists.' });
      return;
    }

    const resRole = await pool.query(`
      INSERT INTO roles (role_name, description, status)
      VALUES ($1, $2, $3)
      RETURNING id, role_name
    `, [roleName, description || null, status || 'Active']);

    const newRole = resRole.rows[0];

    // Seed default blank screen permissions for this role so they can edit it
    const screens = await pool.query('SELECT id FROM screens');
    for (const scr of screens.rows) {
      await pool.query(`
        INSERT INTO role_screen_permissions (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
        VALUES ($1, $2, false, false, false, false, false, false, false, false)
      `, [newRole.id, scr.id]);
    }

    await logAudit(req, 'Create Role', 'Role Management', null, roleName);

    res.json({ success: true, message: 'Role created successfully.', data: newRole });
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { roleName, description, status } = req.body;

    const oldRoleRes = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    const oldRole = oldRoleRes.rows[0];
    if (!oldRole) {
      res.status(404).json({ success: false, message: 'Role not found.' });
      return;
    }

    await pool.query(`
      UPDATE roles 
      SET role_name = $1, description = $2, status = $3, updated_at = NOW()
      WHERE id = $4
    `, [roleName, description || null, status, id]);

    await logAudit(req, 'Update Role', 'Role Management', JSON.stringify(oldRole), JSON.stringify({ roleName, description, status }));

    res.json({ success: true, message: 'Role updated successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const roleRes = await pool.query('SELECT role_name FROM roles WHERE id = $1', [id]);
    if (roleRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Role not found.' });
      return;
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [id]);

    await logAudit(req, 'Delete Role', 'Role Management', roleRes.rows[0].role_name, 'Deleted');

    res.json({ success: true, message: 'Role deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function cloneRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { newRoleName } = req.body;

    if (!newRoleName) {
      res.status(400).json({ success: false, message: 'New role name is required.' });
      return;
    }

    const sourceRoleRes = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    const sourceRole = sourceRoleRes.rows[0];
    if (!sourceRole) {
      res.status(404).json({ success: false, message: 'Source role not found.' });
      return;
    }

    const exists = await pool.query('SELECT id FROM roles WHERE role_name = $1', [newRoleName]);
    if (exists.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Target role name already exists.' });
      return;
    }

    await client.query('BEGIN');

    // Create role
    const newRoleRes = await client.query(`
      INSERT INTO roles (role_name, description, status)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [newRoleName, `Clone of ${sourceRole.role_name} - ${sourceRole.description || ''}`, sourceRole.status]);

    const newRoleId = newRoleRes.rows[0].id;

    // Clone screen permissions
    await client.query(`
      INSERT INTO role_screen_permissions (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
      SELECT $1, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print
      FROM role_screen_permissions WHERE role_id = $2
    `, [newRoleId, id]);

    // Clone API permissions
    await client.query(`
      INSERT INTO role_api_permissions (role_id, api_id, permission_type)
      SELECT $1, api_id, permission_type
      FROM role_api_permissions WHERE role_id = $2
    `, [newRoleId, id]);

    await client.query('COMMIT');

    await logAudit(req, 'Clone Role', 'Role Management', sourceRole.role_name, newRoleName);

    res.json({ success: true, message: 'Role cloned successfully.', data: { id: newRoleId } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Get screen and API permissions mapped to a role
export async function getRolePermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const screenPermissions = await pool.query(`
      SELECT rsp.*, s.screen_name, s.display_name, s.module, s.route
      FROM role_screen_permissions rsp
      JOIN screens s ON s.id = rsp.screen_id
      WHERE rsp.role_id = $1
    `, [id]);

    const apiPermissions = await pool.query(`
      SELECT rap.*, a.api_name, a.endpoint, a.http_method, a.module
      FROM role_api_permissions rap
      JOIN api_registry a ON a.id = rap.api_id
      WHERE rap.role_id = $1
    `, [id]);

    res.json({
      success: true,
      data: {
        screens: screenPermissions.rows,
        apis: apiPermissions.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

// Update screen and API permissions mapped to a role
export async function updateRolePermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { screens, apis } = req.body; // arrays of screen and api permission configurations

    await client.query('BEGIN');

    // 1. Update Screen Permissions
    if (screens && Array.isArray(screens)) {
      for (const scr of screens) {
        await client.query(`
          INSERT INTO role_screen_permissions (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (role_id, screen_id) DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_create = EXCLUDED.can_create,
            can_edit = EXCLUDED.can_edit,
            can_delete = EXCLUDED.can_delete,
            can_export = EXCLUDED.can_export,
            can_import = EXCLUDED.can_import,
            can_approve = EXCLUDED.can_approve,
            can_print = EXCLUDED.can_print
        `, [
          id, scr.screenId, 
          !!scr.canView, !!scr.canCreate, !!scr.canEdit, !!scr.canDelete, 
          !!scr.canExport, !!scr.canImport, !!scr.canApprove, !!scr.canPrint
        ]);
      }
    }

    // 2. Update API Permissions
    if (apis && Array.isArray(apis)) {
      for (const api of apis) {
        await client.query(`
          INSERT INTO role_api_permissions (role_id, api_id, permission_type)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, api_id) DO UPDATE SET
            permission_type = EXCLUDED.permission_type
        `, [id, api.apiId, api.permissionType]);
      }
    }

    await client.query('COMMIT');

    await logAudit(req, 'Update Permissions', 'Role Management', `Role ID: ${id}`, 'Permissions Updated');

    res.json({ success: true, message: 'Permissions updated successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── SCREEN & API REGISTRY MANAGEMENT ────────────────────────────────────────

export async function listScreens(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const screens = await pool.query('SELECT * FROM screens ORDER BY display_order ASC');
    res.json({ success: true, data: screens.rows });
  } catch (err) {
    next(err);
  }
}

export async function updateScreen(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { displayName, route, icon, parentMenu, displayOrder, status } = req.body;

    const oldScreen = await pool.query('SELECT * FROM screens WHERE id = $1', [id]);
    if (oldScreen.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Screen not found.' });
      return;
    }

    await pool.query(`
      UPDATE screens
      SET display_name = $1, route = $2, icon = $3, parent_menu = $4, display_order = $5, status = $6
      WHERE id = $7
    `, [displayName, route, icon, parentMenu || null, displayOrder, status, id]);

    await logAudit(req, 'Update Screen', 'Screen Management', JSON.stringify(oldScreen.rows[0]), JSON.stringify({ displayName, route, parentMenu, displayOrder, status }));

    res.json({ success: true, message: 'Screen updated successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function reorderScreens(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { orders } = req.body; // array of { id, displayOrder }

    if (!orders || !Array.isArray(orders)) {
      res.status(400).json({ success: false, message: 'Orders array is required.' });
      return;
    }

    await client.query('BEGIN');
    for (const item of orders) {
      await client.query('UPDATE screens SET display_order = $1 WHERE id = $2', [item.displayOrder, item.id]);
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Screens reordered successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function listApis(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const apis = await pool.query('SELECT * FROM api_registry ORDER BY module ASC, api_name ASC');
    res.json({ success: true, data: apis.rows });
  } catch (err) {
    next(err);
  }
}

// Get the full permission matrix for all screens across roles
export async function getPermissionsMatrix(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await pool.query('SELECT id, role_name FROM roles WHERE status = \'Active\'');
    const screens = await pool.query('SELECT id, screen_name, display_name, parent_menu FROM screens WHERE status = \'Active\' ORDER BY display_order ASC');
    
    // Fetch all screen permissions
    const perms = await pool.query('SELECT * FROM role_screen_permissions');

    res.json({
      success: true,
      data: {
        roles: roles.rows,
        screens: screens.rows,
        permissions: perms.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

// Get the full API permission matrix across roles
export async function getApiPermissionsMatrix(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await pool.query('SELECT id, role_name FROM roles WHERE status = \'Active\'');
    const apis = await pool.query('SELECT id, api_name, endpoint, http_method, module FROM api_registry WHERE status = \'Active\' ORDER BY module ASC, api_name ASC');
    const apiPerms = await pool.query('SELECT * FROM role_api_permissions');

    res.json({
      success: true,
      data: {
        roles: roles.rows,
        apis: apis.rows,
        permissions: apiPerms.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

// ── AUDIT LOGS ──────────────────────────────────────────────────────────────

export async function listAuditLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = req.query.search as string || '';
    const module = req.query.module as string || '';
    const limit = parseInt(req.query.limit as string || '100', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    let sql = `
      SELECT * FROM audit_logs
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (search) {
      sql += ` AND (username ILIKE $${pIdx} OR action ILIKE $${pIdx} OR old_value ILIKE $${pIdx} OR new_value ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (module) {
      sql += ` AND module = $${pIdx}`;
      params.push(module);
      pIdx++;
    }

    // Count total matches
    const countRes = await pool.query(`SELECT COUNT(*)::int as count FROM (${sql}) as sub`, params);
    const total = countRes.rows[0].count;

    // Apply pagination
    sql += ` ORDER BY created_at DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`;
    params.push(limit, offset);

    const logs = await pool.query(sql, params);

    res.json({
      success: true,
      data: {
        items: logs.rows,
        total,
        limit,
        offset
      }
    });
  } catch (err) {
    next(err);
  }
}
