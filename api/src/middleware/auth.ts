import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../supabase.js';
import type { AppRole, AuthUser } from '../auth-types.js';

const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || '').trim().toLowerCase();

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
};

export function isAppUser(role: AppRole): boolean {
  return role === 'bd_user' || role === 'root_admin';
}

export function isRootAdmin(role: AppRole): boolean {
  return role === 'root_admin';
}

async function loadProfile(userId: string, email: string, fullName?: string | null): Promise<ProfileRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data as ProfileRow;
  }

  const insert = {
    id: userId,
    email,
    full_name: fullName || null,
    role: 'pending' as AppRole,
  };
  const { data: created, error: insertError } = await sb
    .from('profiles')
    .insert(insert)
    .select('id, email, full_name, role')
    .single();

  if (insertError) {
    throw insertError;
  }
  return created as ProfileRow;
}

async function promoteToRootAdmin(profile: ProfileRow): Promise<ProfileRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .update({ role: 'root_admin', email: profile.email })
    .eq('id', profile.id)
    .select('id, email, full_name, role')
    .single();
  if (error) throw error;

  await sb.auth.admin.updateUserById(profile.id, {
    app_metadata: { role: 'root_admin' },
  });
  return data as ProfileRow;
}

async function maybeBootstrapRootAdmin(profile: ProfileRow): Promise<ProfileRow> {
  if (!ROOT_ADMIN_EMAIL || profile.email.toLowerCase() !== ROOT_ADMIN_EMAIL) {
    return profile;
  }
  if (profile.role === 'root_admin') {
    return profile;
  }
  return promoteToRootAdmin(profile);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const sb = getSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user?.email) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const fullName = typeof data.user.user_metadata?.full_name === 'string'
      ? data.user.user_metadata.full_name
      : null;
    let profile = await loadProfile(data.user.id, data.user.email, fullName);
    profile = await maybeBootstrapRootAdmin(profile);

    const auth: AuthUser = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      full_name: profile.full_name,
    };
    req.auth = auth;
    next();
  } catch (e) {
    console.error('[auth] requireAuth failed:', e);
    res.status(500).json({ error: 'auth_error' });
  }
}

export function requireAppUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  if (!isAppUser(req.auth.role)) {
    res.status(403).json({ error: 'pending_approval', message: 'Your account is waiting for Root Admin approval.' });
    return;
  }
  next();
}

export function requireRootAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  if (!isRootAdmin(req.auth.role)) {
    res.status(403).json({ error: 'forbidden', message: 'Root Admin access required.' });
    return;
  }
  next();
}
