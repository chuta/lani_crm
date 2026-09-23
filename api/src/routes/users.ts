import { Router, type Request, type Response } from 'express';
import { getSupabase } from '../supabase.js';
import { requireRootAdmin } from '../middleware/auth.js';
import type { AppRole } from '../auth-types.js';

const router = Router();
const ALLOWED: AppRole[] = ['pending', 'bd_user', 'root_admin'];

router.get('/', requireRootAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, email, full_name, role, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[users] list failed:', error);
    res.status(500).json({ error: 'internal_error' });
    return;
  }
  res.json({ ok: true, users: data || [] });
});

router.patch('/:id/role', requireRootAdmin, async (req: Request, res: Response) => {
  const role = req.body?.role as AppRole;
  if (!ALLOWED.includes(role)) {
    res.status(400).json({ error: 'invalid_role' });
    return;
  }

  if (req.auth?.id === req.params.id && role !== 'root_admin') {
    res.status(400).json({ error: 'cannot_demote_self' });
    return;
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select('id, email, full_name, role, created_at, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[users] role update failed:', error);
    res.status(500).json({ error: 'internal_error' });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const { error: metaError } = await sb.auth.admin.updateUserById(req.params.id, {
    app_metadata: { role },
  });
  if (metaError) {
    console.error('[users] app_metadata sync failed:', metaError);
  }

  res.json({ ok: true, user: data });
});

export default router;
