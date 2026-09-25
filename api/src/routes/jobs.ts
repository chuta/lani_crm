/**
 * Secret-protected trigger for the weekly qualified-pipeline digest.
 */

import { Router, type Request, type Response } from 'express';
import { runPipelineDigest } from '../services/pipeline-digest.js';

const router = Router();

router.post('/pipeline-digest', async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.PIPELINE_DIGEST_SECRET || '';
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || token !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const force = req.query.force === '1' || req.body?.force === true || req.body?.force === 1;
  const slot = typeof req.query.slot === 'string' ? req.query.slot : req.body?.slot;
  try {
    const result = await runPipelineDigest({ force, slot });
    res.json(result);
  } catch (e: any) {
    const status = e?.status || 500;
    if (status === 409) {
      res.status(409).json({ error: 'outside_window' });
      return;
    }
    console.error('[digest]', e?.message || e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
