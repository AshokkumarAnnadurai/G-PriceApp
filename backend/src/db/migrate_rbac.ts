import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting RBAC migration...');
    await client.query('BEGIN');

    // 1. Roles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        role_name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Alter users table
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_name VARCHAR(150);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    // Populate existing users with email and employee_name
    await client.query(`
      UPDATE users SET 
        employee_name = COALESCE(employee_name, username),
        email = COALESCE(email, username || '@geekeyy.com')
      WHERE employee_name IS NULL OR email IS NULL;
    `);

    // 3. User Role Mapping
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_role_mapping (
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        role_id INT REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
    `);

    // 4. Screens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS screens (
        id SERIAL PRIMARY KEY,
        screen_name VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(150) NOT NULL,
        module VARCHAR(100) NOT NULL,
        route VARCHAR(150) NOT NULL,
        icon VARCHAR(50),
        parent_menu VARCHAR(100),
        display_order INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Active'
      );
    `);

    // 5. Role Screen Permissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_screen_permissions (
        role_id INT REFERENCES roles(id) ON DELETE CASCADE,
        screen_id INT REFERENCES screens(id) ON DELETE CASCADE,
        can_view BOOLEAN DEFAULT FALSE,
        can_create BOOLEAN DEFAULT FALSE,
        can_edit BOOLEAN DEFAULT FALSE,
        can_delete BOOLEAN DEFAULT FALSE,
        can_export BOOLEAN DEFAULT FALSE,
        can_import BOOLEAN DEFAULT FALSE,
        can_approve BOOLEAN DEFAULT FALSE,
        can_print BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (role_id, screen_id)
      );
    `);

    // 6. API Registry table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_registry (
        id SERIAL PRIMARY KEY,
        api_name VARCHAR(150) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        http_method VARCHAR(10) NOT NULL,
        module VARCHAR(100),
        description TEXT,
        auth_required BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'Active',
        UNIQUE(endpoint, http_method)
      );
    `);

    // 7. Role API Permissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_api_permissions (
        role_id INT REFERENCES roles(id) ON DELETE CASCADE,
        api_id INT REFERENCES api_registry(id) ON DELETE CASCADE,
        permission_type VARCHAR(20) DEFAULT 'Allow',
        PRIMARY KEY (role_id, api_id)
      );
    `);

    // 8. Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        module VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        ip_address VARCHAR(45),
        browser TEXT,
        device TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 9. Seed default roles
    await client.query(`
      INSERT INTO roles (role_name, description) VALUES
      ('Admin', 'System administrator with full permissions'),
      ('Manager', 'Pricing and approval manager'),
      ('QA', 'Quality Assurance team'),
      ('Production', 'Production planning team')
      ON CONFLICT (role_name) DO NOTHING;
    `);

    // Get Admin and Manager role IDs
    const rolesRes = await client.query('SELECT id, role_name FROM roles');
    const adminRoleId = rolesRes.rows.find(r => r.role_name === 'Admin')?.id;
    const managerRoleId = rolesRes.rows.find(r => r.role_name === 'Manager')?.id;
    const qaRoleId = rolesRes.rows.find(r => r.role_name === 'QA')?.id;
    const prodRoleId = rolesRes.rows.find(r => r.role_name === 'Production')?.id;

    // Link existing users to roles based on their old role column
    const usersRes = await client.query('SELECT id, role FROM users');
    for (const user of usersRes.rows) {
      let rId = managerRoleId; // default
      if (user.role && user.role.toLowerCase() === 'admin') rId = adminRoleId;
      if (user.role && user.role.toLowerCase() === 'qa') rId = qaRoleId;
      if (user.role && user.role.toLowerCase() === 'production') rId = prodRoleId;

      if (rId) {
        await client.query(`
          INSERT INTO user_role_mapping (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [user.id, rId]);
      }
    }

    // 10. Seed default screens
    const screens = [
      { name: 'Dashboard', display: 'Dashboard', module: 'Main', route: '/dashboard', icon: 'LayoutDashboard', parent: null, order: 1 },
      { name: 'RM Master', display: 'RM Master', module: 'Master', route: '/rm-master', icon: 'Database', parent: 'Masters', order: 2 },
      { name: 'Vendor Master', display: 'Vendor Master', module: 'Master', route: '/vendor-master', icon: 'Users', parent: 'Masters', order: 3 },
      { name: 'Item Master', display: 'Item Master', module: 'Master', route: '/item-master', icon: 'Package', parent: 'Masters', order: 4 },
      { name: 'Pricing Update', display: 'Pricing Update', module: 'Pricing', route: '/pricing-update', icon: 'RefreshCw', parent: 'Pricing', order: 5 },
      { name: 'Pricing Approval', display: 'Item Pricing Approval', module: 'Pricing', route: '/pricing-approval', icon: 'CheckSquare', parent: 'Pricing', order: 6 },
      { name: 'User Management', display: 'User Management', module: 'Management', route: '/management/users', icon: 'UserCog', parent: 'Management', order: 7 },
      { name: 'Role Management', display: 'Role Management', module: 'Management', route: '/management/roles', icon: 'ShieldAlert', parent: 'Management', order: 8 },
      { name: 'Screen Management', display: 'Screen Management', module: 'Management', route: '/management/screens', icon: 'Monitor', parent: 'Management', order: 9 },
      { name: 'API Permission Management', display: 'API Permission', module: 'Management', route: '/management/apis', icon: 'Key', parent: 'Management', order: 10 },
      { name: 'Audit Logs', display: 'Audit Logs', module: 'Management', route: '/management/audit-logs', icon: 'History', parent: 'Management', order: 11 }
    ];

    for (const scr of screens) {
      await client.query(`
        INSERT INTO screens (screen_name, display_name, module, route, icon, parent_menu, display_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (screen_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          module = EXCLUDED.module,
          route = EXCLUDED.route,
          icon = EXCLUDED.icon,
          parent_menu = EXCLUDED.parent_menu,
          display_order = EXCLUDED.display_order
      `, [scr.name, scr.display, scr.module, scr.route, scr.icon, scr.parent, scr.order]);
    }

    // Get all screen IDs
    const screenRes = await client.query('SELECT id, screen_name FROM screens');

    // Give Admin full permissions on all screens
    if (adminRoleId) {
      for (const scr of screenRes.rows) {
        await client.query(`
          INSERT INTO role_screen_permissions (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, true, true, true, true, true, true, true, true)
          ON CONFLICT (role_id, screen_id) DO NOTHING
        `, [adminRoleId, scr.id]);
      }
    }

    // Give Manager partial permissions on screens (exclude Screen/API Management)
    if (managerRoleId) {
      for (const scr of screenRes.rows) {
        const isMgmt = ['Screen Management', 'API Permission Management'].includes(scr.screen_name);
        await client.query(`
          INSERT INTO role_screen_permissions (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, $3)
          ON CONFLICT (role_id, screen_id) DO NOTHING
        `, [managerRoleId, scr.id, !isMgmt]);
      }
    }

    // 11. Seed default API routes
    const apis = [
      { name: 'Get Vendors', endpoint: '/vendors', method: 'GET', module: 'Vendor' },
      { name: 'Get Vendor By ID', endpoint: '/vendors/:id', method: 'GET', module: 'Vendor' },
      { name: 'Sync Materials', endpoint: '/vendors/sync-materials', method: 'POST', module: 'Vendor' },
      { name: 'Add Material', endpoint: '/vendors/:id/materials', method: 'POST', module: 'Vendor' },
      { name: 'Update Material', endpoint: '/vendors/:id/materials/:materialId', method: 'PUT', module: 'Vendor' },
      { name: 'Get Customers', endpoint: '/customers', method: 'GET', module: 'Customer' },
      { name: 'List Items', endpoint: '/items', method: 'GET', module: 'Item' },
      { name: 'Create Item', endpoint: '/items', method: 'POST', module: 'Item' },
      { name: 'List Pricing Items', endpoint: '/items/pricing', method: 'GET', module: 'Item' },
      { name: 'Get Filter Options', endpoint: '/items/filter-options', method: 'GET', module: 'Item' },
      { name: 'Import Pricing', endpoint: '/items/import', method: 'POST', module: 'Item' },
      { name: 'Get Item Detail', endpoint: '/items/:id', method: 'GET', module: 'Item' },
      { name: 'Update Item Detail', endpoint: '/items/:id', method: 'PUT', module: 'Item' },
      { name: 'Get Item BOM', endpoint: '/items/:id/bom', method: 'GET', module: 'Item' },
      { name: 'List Batches', endpoint: '/pricing/batches', method: 'GET', module: 'Pricing' },
      { name: 'Create Batch', endpoint: '/pricing/batches', method: 'POST', module: 'Pricing' },
      { name: 'Get Batch Detail', endpoint: '/pricing/batches/:id', method: 'GET', module: 'Pricing' },
      { name: 'Get Batch Items', endpoint: '/pricing/batches/:id/items', method: 'GET', module: 'Pricing' },
      { name: 'Approve Batch', endpoint: '/pricing/batches/:id/approve', method: 'POST', module: 'Pricing' },
      { name: 'Reject Batch', endpoint: '/pricing/batches/:id/reject', method: 'PATCH', module: 'Pricing' },
      { name: 'Submit Batch', endpoint: '/pricing/batches/:id/submit', method: 'PATCH', module: 'Pricing' },
      { name: 'Delete Batch', endpoint: '/pricing/batches/:id', method: 'DELETE', module: 'Pricing' },
      { name: 'Price Log Filters', endpoint: '/pricing/log/filters', method: 'GET', module: 'Pricing' },
      { name: 'Get Price Log', endpoint: '/pricing/log', method: 'GET', module: 'Pricing' },
      { name: 'Get Item Approvals', endpoint: '/pricing/item-approvals', method: 'GET', module: 'Pricing' },
      { name: 'Approve Item Approvals', endpoint: '/pricing/item-approvals/approve', method: 'POST', module: 'Pricing' },
      { name: 'Hold Item Approvals', endpoint: '/pricing/item-approvals/hold', method: 'POST', module: 'Pricing' },
      { name: 'Dispute Item Approvals', endpoint: '/pricing/item-approvals/dispute', method: 'POST', module: 'Pricing' },
      { name: 'Get Disputes', endpoint: '/pricing/disputes', method: 'GET', module: 'Pricing' },
      { name: 'Update Batch Item', endpoint: '/pricing/batches/items/:id', method: 'PUT', module: 'Pricing' },
      // Management module APIs
      { name: 'List Users', endpoint: '/management/users', method: 'GET', module: 'Management' },
      { name: 'Create User', endpoint: '/management/users', method: 'POST', module: 'Management' },
      { name: 'Update User', endpoint: '/management/users/:id', method: 'PUT', module: 'Management' },
      { name: 'Delete User', endpoint: '/management/users/:id', method: 'DELETE', module: 'Management' },
      { name: 'List Roles', endpoint: '/management/roles', method: 'GET', module: 'Management' },
      { name: 'Create Role', endpoint: '/management/roles', method: 'POST', module: 'Management' },
      { name: 'Update Role', endpoint: '/management/roles/:id', method: 'PUT', module: 'Management' },
      { name: 'Delete Role', endpoint: '/management/roles/:id', method: 'DELETE', module: 'Management' },
      { name: 'Clone Role', endpoint: '/management/roles/:id/clone', method: 'POST', module: 'Management' },
      { name: 'List Screens', endpoint: '/management/screens', method: 'GET', module: 'Management' },
      { name: 'Update Screen', endpoint: '/management/screens/:id', method: 'PUT', module: 'Management' },
      { name: 'Get Audit Logs', endpoint: '/management/audit-logs', method: 'GET', module: 'Management' }
    ];

    for (const api of apis) {
      await client.query(`
        INSERT INTO api_registry (api_name, endpoint, http_method, module, auth_required)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (endpoint, http_method) DO UPDATE SET
          api_name = EXCLUDED.api_name,
          module = EXCLUDED.module
      `, [api.name, api.endpoint, api.method, api.module]);
    }

    // Get all API IDs
    const apiRes = await client.query('SELECT id FROM api_registry');

    // Give Admin 'Allow' on all APIs
    if (adminRoleId) {
      for (const api of apiRes.rows) {
        await client.query(`
          INSERT INTO role_api_permissions (role_id, api_id, permission_type)
          VALUES ($1, $2, 'Allow')
          ON CONFLICT (role_id, api_id) DO NOTHING
        `, [adminRoleId, api.id]);
      }
    }

    await client.query('COMMIT');
    console.log('RBAC Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('RBAC Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
