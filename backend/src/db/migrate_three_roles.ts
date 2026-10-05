import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration to three roles (Super Admin, Admin, User)...');
    await client.query('BEGIN');

    // 1. Clear existing roles and role permissions
    await client.query('DELETE FROM role_screen_permissions');
    await client.query('DELETE FROM role_api_permissions');
    await client.query('DELETE FROM user_role_mapping');
    await client.query('DELETE FROM roles');

    // 2. Insert the exactly three roles
    const insertRolesRes = await client.query(`
      INSERT INTO roles (role_name, description) VALUES
      ('Super Admin', 'Full access to the entire application including system administration'),
      ('Admin', 'Operations administrator with access to all screens except Management'),
      ('User', 'View-only access to standard application menus')
      RETURNING id, role_name
    `);

    const rolesMap = new Map<string, number>();
    for (const r of insertRolesRes.rows) {
      rolesMap.set(r.role_name, r.id);
    }

    const superAdminId = rolesMap.get('Super Admin')!;
    const adminRoleId = rolesMap.get('Admin')!;
    const userId = rolesMap.get('User')!;

    // 3. Fetch all registered screens
    const screenRes = await client.query('SELECT id, screen_name FROM screens');
    const screens = screenRes.rows;

    // 4. Fetch all registered APIs
    const apiRes = await client.query('SELECT id, endpoint, http_method FROM api_registry');
    const apis = apiRes.rows;

    // ── SUPER ADMIN PERMISSIONS ──────────────────────────────────────────────
    // Full access on all screens
    for (const scr of screens) {
      await client.query(`
        INSERT INTO role_screen_permissions 
        (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
        VALUES ($1, $2, true, true, true, true, true, true, true, true)
      `, [superAdminId, scr.id]);
    }
    // Allow all APIs
    for (const api of apis) {
      await client.query(`
        INSERT INTO role_api_permissions (role_id, api_id, permission_type)
        VALUES ($1, $2, 'Allow')
      `, [superAdminId, api.id]);
    }

    // ── ADMIN ROLE PERMISSIONS ────────────────────────────────────────────────
    // Access everything EXCEPT management screens and management APIs
    for (const scr of screens) {
      const isManagement = [
        'User Management', 
        'Role Management', 
        'Screen Management', 
        'API Permission Management', 
        'Audit Logs'
      ].includes(scr.screen_name);

      await client.query(`
        INSERT INTO role_screen_permissions 
        (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
        VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, $3)
      `, [adminRoleId, scr.id, !isManagement]);
    }
    // Allow all non-management APIs
    for (const api of apis) {
      const isManagementApi = api.endpoint.startsWith('/management/');
      await client.query(`
        INSERT INTO role_api_permissions (role_id, api_id, permission_type)
        VALUES ($1, $2, $3)
      `, [adminRoleId, api.id, isManagementApi ? 'Deny' : 'Allow']);
    }

    // ── USER ROLE PERMISSIONS ─────────────────────────────────────────────────
    // View-only access to standard screens (no management screens)
    for (const scr of screens) {
      const isManagement = [
        'User Management', 
        'Role Management', 
        'Screen Management', 
        'API Permission Management', 
        'Audit Logs'
      ].includes(scr.screen_name);

      await client.query(`
        INSERT INTO role_screen_permissions 
        (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
        VALUES ($1, $2, $3, false, false, false, $3, false, false, $3)
      `, [userId, scr.id, !isManagement]);
    }
    // Set 'Read Only' on non-management APIs
    for (const api of apis) {
      const isManagementApi = api.endpoint.startsWith('/management/');
      await client.query(`
        INSERT INTO role_api_permissions (role_id, api_id, permission_type)
        VALUES ($1, $2, $3)
      `, [userId, api.id, isManagementApi ? 'Deny' : 'Read Only']);
    }

    // 5. Update and Map existing users
    // Map 'Admin' user to 'Super Admin'
    const adminUserRes = await client.query('SELECT id FROM users WHERE username = \'Admin\'');
    if (adminUserRes.rows[0]) {
      await client.query(`
        INSERT INTO user_role_mapping (user_id, role_id)
        VALUES ($1, $2)
      `, [adminUserRes.rows[0].id, superAdminId]);
    }

    // Map 'Employee' user to 'Admin'
    const employeeUserRes = await client.query('SELECT id FROM users WHERE username = \'Employee\'');
    if (employeeUserRes.rows[0]) {
      await client.query(`
        INSERT INTO user_role_mapping (user_id, role_id)
        VALUES ($1, $2)
      `, [employeeUserRes.rows[0].id, adminRoleId]);
    }

    await client.query('COMMIT');
    console.log('Migration to three roles completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
