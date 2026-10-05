import bcrypt from 'bcrypt';
import { Request,Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db/pool';
import { logger } from '../middleware/logger';

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.accessTokenExpiresIn as any }
    );

    // Generate Refresh Token
    const refreshToken = jwt.sign(
      { id: user.id, username: user.username },
      config.auth.jwtSecret,
      { expiresIn: config.auth.refreshTokenExpiresIn as any }
    );

    // Fetch user's roles
    const userRolesRes = await pool.query(`
      SELECT r.role_name 
      FROM roles r
      JOIN user_role_mapping urm ON urm.role_id = r.id
      WHERE urm.user_id = $1 AND r.status = 'Active'
    `, [user.id]);
    const rolesList = userRolesRes.rows.map((r: any) => r.role_name);
    
    // Fetch screen permissions
    let screenPermissions: any[] = [];
    if (rolesList.map(r => r.toLowerCase()).includes('super admin')) {
      const allScreens = await pool.query("SELECT * FROM screens WHERE status = 'Active'");
      screenPermissions = allScreens.rows.map((s: any) => ({
        screenName: s.screen_name,
        displayName: s.display_name,
        route: s.route,
        icon: s.icon,
        parentMenu: s.parent_menu,
        displayOrder: s.display_order,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
        canImport: true,
        canApprove: true,
        canPrint: true
      }));
    } else {
      const permsRes = await pool.query(`
        SELECT s.screen_name as "screenName", s.display_name as "displayName", s.route, s.icon, s.parent_menu as "parentMenu", s.display_order as "displayOrder",
               COALESCE(BOOL_OR(rsp.can_view), false) as "canView",
               COALESCE(BOOL_OR(rsp.can_create), false) as "canCreate",
               COALESCE(BOOL_OR(rsp.can_edit), false) as "canEdit",
               COALESCE(BOOL_OR(rsp.can_delete), false) as "canDelete",
               COALESCE(BOOL_OR(rsp.can_export), false) as "canExport",
               COALESCE(BOOL_OR(rsp.can_import), false) as "canImport",
               COALESCE(BOOL_OR(rsp.can_approve), false) as "canApprove",
               COALESCE(BOOL_OR(rsp.can_print), false) as "canPrint"
        FROM role_screen_permissions rsp
        JOIN screens s ON s.id = rsp.screen_id
        JOIN user_role_mapping urm ON urm.role_id = rsp.role_id
        WHERE urm.user_id = $1 AND s.status = 'Active'
        GROUP BY s.id, s.screen_name, s.display_name, s.route, s.icon, s.parent_menu, s.display_order
      `, [user.id]);
      screenPermissions = permsRes.rows;
    }

    res.json({
      user: {
        id: user.id.toString(),
        username: user.username,
        employeeName: user.employee_name || user.username,
        email: user.email || '',
        roles: rolesList,
        screenPermissions
      },
      token,
      refreshToken
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refresh successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid or expired refresh token
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, config.auth.jwtSecret);
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    const newToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.accessTokenExpiresIn as any }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id, username: user.username },
      config.auth.jwtSecret,
      { expiresIn: config.auth.refreshTokenExpiresIn as any }
    );

    // Fetch user's roles
    const userRolesRes = await pool.query(`
      SELECT r.role_name 
      FROM roles r
      JOIN user_role_mapping urm ON urm.role_id = r.id
      WHERE urm.user_id = $1 AND r.status = 'Active'
    `, [user.id]);
    const rolesList = userRolesRes.rows.map((r: any) => r.role_name);
    
    // Fetch screen permissions
    let screenPermissions: any[] = [];
    if (rolesList.map(r => r.toLowerCase()).includes('super admin')) {
      const allScreens = await pool.query("SELECT * FROM screens WHERE status = 'Active'");
      screenPermissions = allScreens.rows.map((s: any) => ({
        screenName: s.screen_name,
        displayName: s.display_name,
        route: s.route,
        icon: s.icon,
        parentMenu: s.parent_menu,
        displayOrder: s.display_order,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
        canImport: true,
        canApprove: true,
        canPrint: true
      }));
    } else {
      const permsRes = await pool.query(`
        SELECT s.screen_name as "screenName", s.display_name as "displayName", s.route, s.icon, s.parent_menu as "parentMenu", s.display_order as "displayOrder",
               COALESCE(BOOL_OR(rsp.can_view), false) as "canView",
               COALESCE(BOOL_OR(rsp.can_create), false) as "canCreate",
               COALESCE(BOOL_OR(rsp.can_edit), false) as "canEdit",
               COALESCE(BOOL_OR(rsp.can_delete), false) as "canDelete",
               COALESCE(BOOL_OR(rsp.can_export), false) as "canExport",
               COALESCE(BOOL_OR(rsp.can_import), false) as "canImport",
               COALESCE(BOOL_OR(rsp.can_approve), false) as "canApprove",
               COALESCE(BOOL_OR(rsp.can_print), false) as "canPrint"
        FROM role_screen_permissions rsp
        JOIN screens s ON s.id = rsp.screen_id
        JOIN user_role_mapping urm ON urm.role_id = rsp.role_id
        WHERE urm.user_id = $1 AND s.status = 'Active'
        GROUP BY s.id, s.screen_name, s.display_name, s.route, s.icon, s.parent_menu, s.display_order
      `, [user.id]);
      screenPermissions = permsRes.rows;
    }

    res.json({
      user: {
        id: user.id.toString(),
        username: user.username,
        employeeName: user.employee_name || user.username,
        email: user.email || '',
        roles: rolesList,
        screenPermissions
      },
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

