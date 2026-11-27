import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db.ts';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
    created_at: string;
  };
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
}

export function isMultiUserAuthEnabled(): boolean {
  if (process.env.LOCAL_SINGLE_USER_MODE === 'false' && process.env.ENABLE_MULTI_USER_AUTH === 'true') {
    return true;
  }
  return process.env.ENABLE_MULTI_USER_AUTH === 'true';
}

export function isAllowedLocalAdminRequest(req: Request): boolean {
  if (process.env.ALLOW_NON_LOCAL_ADMIN === 'true') return true;
  const host = (req.headers.host || '').toLowerCase();
  const ip = (req.ip || req.socket.remoteAddress || '').toLowerCase();
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    !isMultiUserAuthEnabled()
  );
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function attachLocalSingleUserAuth(req: AuthRequest): boolean {
  const db = getDb();
  const user = db
    .prepare(`SELECT id, email, name FROM users ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string; email: string; name: string } | undefined;
  const workspace = db
    .prepare(
      `SELECT w.id, w.name, w.slug, w.plan, COALESCE(wm.role, 'owner') AS role, w.created_at
       FROM workspaces w
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
       ORDER BY w.created_at ASC LIMIT 1`
    )
    .get() as AuthContext['workspace'] | undefined;

  if (!user || !workspace) return false;
  req.auth = { user, workspace };
  return true;
}

export function createSessionForUser(res: Response, userId: string, workspaceId: string): string {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  db.prepare(
    `INSERT INTO sessions (id, user_id, workspace_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), userId, workspaceId, tokenHash, expires.toISOString(), now.toISOString());

  res.cookie('kresna_session', rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return rawToken;
}

export function clearSession(req: Request, res: Response): void {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const token =
    cookies.kresna_session ||
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
  }
  res.clearCookie('kresna_session', { path: '/' });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isMultiUserAuthEnabled()) {
    if (attachLocalSingleUserAuth(req)) {
      next();
      return;
    }
    res.status(500).json({ error: 'Local workspace initialization failed.' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const token =
    cookies.kresna_session ||
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getDb();
  const session = db
    .prepare(
      `SELECT s.user_id, s.workspace_id, s.expires_at, u.email, u.name,
              w.name AS ws_name, w.slug AS ws_slug, w.plan AS ws_plan, w.created_at AS ws_created_at,
              COALESCE(wm.role, 'member') AS role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspaces w ON w.id = s.workspace_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = u.id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!session || new Date(String(session.expires_at)).getTime() < Date.now()) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }

  req.auth = {
    user: {
      id: String(session.user_id),
      email: String(session.email),
      name: String(session.name),
    },
    workspace: {
      id: String(session.workspace_id),
      name: String(session.ws_name),
      slug: String(session.ws_slug),
      plan: String(session.ws_plan),
      role: String(session.role),
      created_at: String(session.ws_created_at),
    },
  };
  next();
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isMultiUserAuthEnabled()) {
      next();
      return;
    }
    const role = req.auth?.workspace.role || '';
    if (!roles.includes(role)) {
      res.status(403).json({ error: 'Insufficient workspace role permissions.' });
      return;
    }
    next();
  };
}
