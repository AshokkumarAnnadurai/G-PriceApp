import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Registering missing legacy screens in screens table and setting role permissions...');
    await client.query('BEGIN');

    // 1. Insert missing screens into 'screens' table if they do not exist
    const screensToInsert = [
      {
        name: 'Customer List',
        display: 'Customer List',
        module: 'Master',
        route: '/customers',
        icon: 'Users',
        parent: 'Masters',
        order: 12
      },
      {
        name: 'Price History',
        display: 'Price History',
        module: 'Master',
        route: '/price-history',
        icon: 'History',
        parent: 'Masters',
        order: 13
      },
      {
        name: 'Customer Pricing Upload',
        display: 'Customer Pricing Upload',
        module: 'Pricing',
        route: '/customer-pricing',
        icon: 'Upload',
        parent: 'Pricing',
        order: 14
      },
      {
        name: 'Dispute Register',
        display: 'Dispute Register',
        module: 'Pricing',
        route: '/dispute-register',
        icon: 'Flag',
        parent: 'Pricing',
        order: 15
      },
      {
        name: 'Order Price Audit',
        display: 'Order Price Audit',
        module: 'Pricing',
        route: '/order-price-audit',
        icon: 'ClipboardCheck',
        parent: 'Pricing',
        order: 16
      }
    ];

    const screenIds: number[] = [];
    for (const scr of screensToInsert) {
      const insertRes = await client.query(`
        INSERT INTO screens (screen_name, display_name, module, route, icon, parent_menu, display_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (screen_name) DO UPDATE 
        SET display_name = EXCLUDED.display_name, route = EXCLUDED.route, icon = EXCLUDED.icon, parent_menu = EXCLUDED.parent_menu, display_order = EXCLUDED.display_order
        RETURNING id
      `, [scr.name, scr.display, scr.module, scr.route, scr.icon, scr.parent, scr.order]);
      screenIds.push(insertRes.rows[0].id);
    }

    // 2. Fetch role IDs
    const rolesRes = await client.query('SELECT id, role_name FROM roles');
    const roles = rolesRes.rows;

    const superAdminRole = roles.find(r => r.role_name === 'Super Admin');
    const adminRole = roles.find(r => r.role_name === 'Admin');
    const userRole = roles.find(r => r.role_name === 'User');

    // 3. Insert Permissions for newly inserted screens
    for (const screenId of screenIds) {
      // Super Admin - Full Access
      if (superAdminRole) {
        await client.query(`
          INSERT INTO role_screen_permissions 
          (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, true, true, true, true, true, true, true, true)
          ON CONFLICT (role_id, screen_id) DO UPDATE
          SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true, can_import=true, can_approve=true, can_print=true
        `, [superAdminRole.id, screenId]);
      }

      // Admin - Full Access (excluding Management module)
      if (adminRole) {
        await client.query(`
          INSERT INTO role_screen_permissions 
          (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, true, true, true, true, true, true, true, true)
          ON CONFLICT (role_id, screen_id) DO UPDATE
          SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true, can_import=true, can_approve=true, can_print=true
        `, [adminRole.id, screenId]);
      }

      // User - View-Only Access
      if (userRole) {
        await client.query(`
          INSERT INTO role_screen_permissions 
          (role_id, screen_id, can_view, can_create, can_edit, can_delete, can_export, can_import, can_approve, can_print)
          VALUES ($1, $2, true, false, false, false, true, false, false, true)
          ON CONFLICT (role_id, screen_id) DO UPDATE
          SET can_view=true, can_create=false, can_edit=false, can_delete=false, can_export=true, can_import=false, can_approve=false, can_print=true
        `, [userRole.id, screenId]);
      }
    }

    await client.query('COMMIT');
    console.log('Legacy screens successfully registered in system!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
