/** Tech triage is frozen in the LANI commercial book. Classification happens at intake. */

import { Router, type Request, type Response } from 'express';

const router = Router();
const frozen = (_req: Request, res: Response): void => {
  res.status(403).json({ error: 'frozen', message: 'Tech triage is frozen. LANI classification happens at intake.' });
};

router.patch('/:id/triage', frozen);
router.post('/remind/:id', frozen);

export default router;
