/**
 * BD Prospecting Tracker — sales-stage pipeline for $GIFT distribution partnerships
 *
 * Stages:
 *  1 — Not Started
 *  2 — Researching
 *  3 — Ready for Outreach
 *  4 — Outreach Sent
 *  5 — In Conversation
 *  6 — Meeting Scheduled
 *  7 — Proposal Sent         ← shown in both trackers (links to proposal_projects)
 *  8 — On Hold
 *  9 — Closed – Won          ← auto-creates a deal in the main deals table
 * 10 — Closed – Lost / No Fit
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { randomUUID } from 'node:crypto';
import { requireRootAdmin } from '../middleware/auth.js';

const router = Router();

const BD_STAGES = [
  { id: 1,  label: 'Not Started' },
  { id: 2,  label: 'Researching' },
  { id: 3,  label: 'Ready for Outreach' },
  { id: 4,  label: 'Outreach Sent' },
  { id: 5,  label: 'In Conversation' },
  { id: 6,  label: 'Meeting Scheduled' },
  { id: 7,  label: 'Proposal Sent' },
  { id: 8,  label: 'On Hold' },
  { id: 9,  label: 'Closed – Won' },
  { id: 10, label: 'Closed – Lost / No Fit' },
];

/** ─── LIST ─── */
router.get('/', (req: Request, res: Response): void => {
  try {
    const { tier, category, status, search, archived } = req.query;

    let sql = 'SELECT * FROM bd_prospecting_targets WHERE 1=1';
    const params: any[] = [];

    if (tier) {
      sql += ' AND tier = ?';
      params.push(Number(tier));
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(Number(status));
    }
    if (archived === 'true') {
      sql += ' AND is_archived = 1';
    } else if (archived !== 'all') {
      sql += ' AND is_archived = 0';
    }
    if (search) {
      sql += ' AND (firm_name LIKE ? OR notes LIKE ? OR contact_email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY tier ASC, status ASC, firm_name ASC';

    const targets = db.prepare(sql).all(...params);
    res.json({ ok: true, targets, total: (targets as any[]).length, stages: BD_STAGES });
  } catch (e: any) {
    console.error('[bd-prospecting] List error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── GET SINGLE ─── */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const target = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id) as any;
    if (!target) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ ok: true, target });
  } catch (e: any) {
    console.error('[bd-prospecting] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── CREATE ─── */
router.post('/', (req: Request, res: Response): void => {
  try {
    const {
      firm_name, tier = 2, category = 'Screening Queue',
      why_this_fits, contact_email, notes, status = 1,
      special_flags, bd_owner, next_action,
    } = req.body;

    if (!firm_name?.trim()) {
      res.status(400).json({ error: 'firm_name is required' });
      return;
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO bd_prospecting_targets (id, firm_name, tier, category, why_this_fits, contact_email, notes, status, special_flags, bd_owner, next_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, firm_name.trim(), Number(tier), category, why_this_fits || null, contact_email || null, notes || null, Number(status), special_flags || null, bd_owner || null, next_action || null);

    const target = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(id);
    res.status(201).json({ ok: true, target });
  } catch (e: any) {
    console.error('[bd-prospecting] Create error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── UPDATE STATUS (with auto-promotion + deal creation) ─── */
router.patch('/:id/status', (req: Request, res: Response): void => {
  try {
    const target = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id) as any;
    if (!target) { res.status(404).json({ error: 'not_found' }); return; }

    const { status, note } = req.body;
    const newStatus = Number(status);

    if (newStatus < 1 || newStatus > 10) {
      res.status(400).json({ error: 'invalid_stage', message: 'Stage must be 1-10' });
      return;
    }

    const oldStatus = target.status;

    // Auto-promote tier-2 → tier-1 when status advances past "Not Started"
    const shouldPromote = target.tier === 2 && newStatus > 1 && oldStatus <= 1;

    // Track last contacted
    const touchedNow = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.prepare(`
      UPDATE bd_prospecting_targets
      SET status = ?, tier = CASE WHEN ? THEN 1 ELSE tier END,
          auto_promoted = CASE WHEN ? THEN 1 ELSE auto_promoted END,
          last_contacted_at = CASE WHEN status > 1 THEN ? ELSE last_contacted_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, shouldPromote ? 1 : 0, shouldPromote ? 1 : 0, touchedNow, req.params.id);

    // --- Stage 9: Closed-Won → auto-create deal in main deals table ---
    let createdDeal = null;
    if (newStatus === 9 && !target.deal_id) {
      const dealId = randomUUID();
      const stageTransferNote = note || `Auto-created from BD prospecting: ${target.firm_name}`;
      try {
        db.prepare(`
          INSERT INTO deals (id, partner_name, description, bd_owner, current_stage, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run(dealId, target.firm_name, stageTransferNote, target.bd_owner);
        // Link back
        db.prepare('UPDATE bd_prospecting_targets SET deal_id = ? WHERE id = ?')
          .run(dealId, req.params.id);
        createdDeal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
      } catch (e: any) {
        console.error('[bd-prospecting] Deal creation error:', e);
        // Non-fatal — don't block the status update
      }
    }

    // --- Stage 10: Closed-Lost → archive if desired (optional, we keep for history) ---

    const updated = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id);
    res.json({ ok: true, target: updated, created_deal: createdDeal });
  } catch (e: any) {
    console.error('[bd-prospecting] Status update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── UPDATE FIELDS ─── */
router.patch('/:id', (req: Request, res: Response): void => {
  try {
    const target = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id) as any;
    if (!target) { res.status(404).json({ error: 'not_found' }); return; }

    const updatable = [
      'firm_name', 'tier', 'category', 'why_this_fits', 'contact_email',
      'notes', 'special_flags', 'bd_owner', 'next_action',
    ];

    const updates: string[] = [];
    const params: any[] = [];
    for (const f of updatable) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'no_fields' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    db.prepare(`UPDATE bd_prospecting_targets SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id);
    res.json({ ok: true, target: updated });
  } catch (e: any) {
    console.error('[bd-prospecting] Update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── LINK TO PROPOSAL (Stage 7 handoff) ─── */
router.patch('/:id/link-proposal', (req: Request, res: Response): void => {
  try {
    const { proposal_id } = req.body;
    if (!proposal_id) { res.status(400).json({ error: 'proposal_id required' }); return; }

    db.prepare('UPDATE bd_prospecting_targets SET proposal_id = ?, status = 7, updated_at = datetime(\'now\') WHERE id = ?')
      .run(proposal_id, req.params.id);
    const updated = db.prepare('SELECT * FROM bd_prospecting_targets WHERE id = ?').get(req.params.id);
    res.json({ ok: true, target: updated });
  } catch (e: any) {
    console.error('[bd-prospecting] Link proposal error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── ARCHIVE ─── */
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    db.prepare('UPDATE bd_prospecting_targets SET is_archived = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[bd-prospecting] Archive error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/** ─── SEED ─── */
router.post('/seed', requireRootAdmin, (_req: Request, res: Response): void => {
  res.json({
    ok: true,
    skipped: true,
    frozen: true,
    message: 'GIFT prospect seed is frozen. Start from a clean LANI book and add accounts manually.',
  });
});

export default router;

/** ─── SEED DATA ─── */
function getSeedData() {
  const uuid = () => randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const targets: any[] = [];

  // ── TIER 1: Working Tracker ──
  const tier1: any[] = [
    // Category A — Sharpest Product Fit
    { firm_name: 'Chapel Hill Denham Management Limited', category: 'Category A', why_this_fits: 'Nigeria\'s established alternative-assets pioneer — least internal education required', contact_email: 'compliance@chapelhilldenham.com', status: 1, notes: 'Recommended first outreach' },
    { firm_name: 'Lotus Capital Limited', category: 'Category A', why_this_fits: 'Nigeria\'s pioneering Shari\'ah-compliant asset manager — gold has distinct standing in Islamic finance', contact_email: 'compliance@lotuscapitallimited.com', status: 1, notes: 'Recommended second outreach' },
    { firm_name: 'ARM Capital Partners Limited', category: 'Category A', why_this_fits: 'ARM Group\'s alternative/private-capital arm — closer product match than ARM\'s mutual-fund business', contact_email: 'arm.compliance@arm.com.ng', status: 1, notes: 'Distinct from ARM Investment Managers' },
    { firm_name: 'Meristem Wealth Management Limited', category: 'Category A', why_this_fits: 'Wealth management, not generic fund management — closer to an HNI-advisory model', contact_email: 'infowealth@meristemng.com', status: 1 },

    // Category B — Strong Institutional Credibility
    { firm_name: 'Stanbic IBTC Asset Management Limited', category: 'Category B', why_this_fits: '#1 by AUM (~₦841bn); existing Dollar Fund and alternatives/private equity products', contact_email: 'mutualfunds@stanbicibtc.com', status: 1, notes: 'Bank-affiliated — expect longer cycle' },
    { firm_name: 'United Capital Asset Management Limited', category: 'Category B', why_this_fits: 'Independent investment-bank heritage; large scale (~₦284bn+ AUM)', contact_email: 'uamlfundmgmt@unitedcapitalplcgroup.com', status: 1, notes: 'Verify naming vs UBA AM' },
    { firm_name: 'Coronation Asset Management Limited', category: 'Category B', why_this_fits: 'Established, credible independent institutional player', contact_email: 'investmentmanagement@coronationam.com', status: 1 },
    { firm_name: 'Coronation Capital Limited', category: 'Category B', why_this_fits: 'Same group — confirm whether same relationship or distinct entry point', contact_email: 'compliance@coronationcapital.com.ng', status: 1 },
    { firm_name: 'Afrinvest Asset Management Limited', category: 'Category B', why_this_fits: 'Well-known, credible independent research/banking group', contact_email: 'aaml@afrinvest.com', status: 1 },
    { firm_name: 'CardinalStone Asset Management', category: 'Category B', why_this_fits: 'Established independent, solid institutional reputation', contact_email: 'pm@cardinalstone.com', status: 1 },
    { firm_name: 'Vetiva Fund Managers Limited', category: 'Category B', why_this_fits: 'Established independent investment banking/AM group', contact_email: 'assetmanagement@vetiva.com', status: 1 },
    { firm_name: 'Norrenberger Asset Management Limited', category: 'Category B', why_this_fits: 'Growing independent wealth-focused group, private-wealth orientation', contact_email: 'customerservice@norrenberger.com', status: 1 },

    // Category C — Different Fit / Already Engaged
    { firm_name: 'Cowrywise Financial Technology Limited', category: 'Category C', why_this_fits: 'Retail-facing digital wealth app — poor fit for institutional custody but plausible for embedded distribution archetype', contact_email: 'compliance@cowrywise.com', status: 1, notes: 'Different archetype — do not force into AM-partner template' },
    { firm_name: 'FCMB Asset Management Limited', category: 'Category C', why_this_fits: 'Already in pipeline — existing relationship', contact_email: 'fcmbamenquiries@fcmb.com', status: 5, notes: 'Existing relationship — track separately, not new outreach' },
    { firm_name: 'Guaranty Trust Fund Managers Limited', category: 'Category C', why_this_fits: 'Already in pipeline — existing relationship', contact_email: 'complianceteam@gtfundmanagers.com', status: 5, notes: 'Existing relationship — track separately, not new outreach' },

    // Hold — Do Not Approach
    { firm_name: 'AFC Capital Partners Nigeria Limited', category: 'Hold', why_this_fits: 'AFC\'s own Nigerian subsidiary — hold for warm introduction once group-level AFC facility matures', contact_email: 'contact@africafc.org', status: 1, special_flags: 'warm_intro_hold', notes: 'DO NOT approach cold — wait for warm introduction path' },
  ];

  for (const t of tier1) {
    targets.push({ id: uuid(), firm_name: t.firm_name, tier: 1, category: t.category, why_this_fits: t.why_this_fits || null, contact_email: t.contact_email || null, status: t.status, special_flags: t.special_flags || null, notes: t.notes || null });
  }

  // ── TIER 2: Screening Queue (190+ firms from FMAN list) ──
  const tier2Firms = [
    'ABS Capital Limited', 'ACQ Investment Managers', 'Actis West Africa Income Manager Limited',
    'Adino Asset Management Limited', 'Africa Plus Partners Nigeria Limited', 'Afrivalue Asset Management Limited',
    'AIICO Capital Limited', 'ALM Capital Limited', 'Alpha Morgan Capital Managers Limited',
    'Alpha10 Fund Management Limited', 'Anchoria Asset Management Limited', 'Apel Wealth Management Limited',
    'Aquilla Asset Management Limited', 'Argentil Asset Management Limited', 'ARM Investment Managers Limited',
    'ARM-Harith Infrastructure Investment Limited', 'ASAM Capital Limited', 'Ascend Investment Managers Limited',
    'Ascent Capital Ltd', 'Assist Investment Advisory Limited', 'Asteric Asset Management Limited',
    'AT&T Asset Management Limited', 'AVA Global Asset Managers Limited', 'AXA Mansard Investments Limited',
    'Aztran Global Investment Limited', 'Bancorp Asset Management Limited', 'BAS Financial Services Limited',
    'Berkshire Asset Management Limited', 'BGL Asset Management Limited', 'Blackaion Capital Management Limited',
    'BlackCod Asset Management Limited', 'BlackRose Asset Management Limited', 'Blue Marina Asset Management Limited',
    'BRB Financial Advisory Limited', 'Bucksfield Asset Management Limited', 'CAN Fund Managers Limited',
    'Canary Points Capital Limited', 'Capital Assets Limited', 'Capital Express Global Asset Management Limited',
    'Capital Plus Management Limited', 'Capital Trust Investment and Asset Management Limited',
    'Capitalfield Asset Management Company Limited', 'CB Capital Limited', 'CCA Fund Managers Limited',
    'Cedar Asset Plus Limited', 'Cedrus Asset Management Limited', 'Certari Asset Management Limited',
    'Ceviant Asset Management Limited', 'CFG Asset Management Limited', 'Chapters and Heights Investment Partners Limited',
    'Cherry Hills Portfolio Management Ltd', 'Citadele Capitals Investment Managers Limited', 'Cititrust Asset Management Limited',
    'Citycode Investment Limited', 'Coinage Capital Managers Limited', 'Commercio Partners Asset Management Limited',
    'Consonance Investment Management Limited', 'Constant Capital Fund Managers Limited', 'Cordros Asset Management Limited',
    'Core Asset Management Limited', 'Coremars Asset Management Limited', 'Cowry Asset Management Limited',
    'Credent Investment Managers Limited', 'CRL Africa Wealth Management Limited', 'Custodian Asset Management Limited',
    'Dane Investments Limited', 'Deutsche Assets Management Limited', 'DFC Asset Management Company Limited',
    'DLM Asset Management Limited', 'DMB Capital Limited', 'D\'Namaz Capital Limited',
    'DSC Asset Management Company Limited', 'ECOB Portfolio Management Limited', 'Ecoops Financial Services Limited',
    'EDC Fund Management Limited', 'Emerging Africa Asset Management Limited', 'EPM Assets Limited',
    'Ethica Capital Ltd', 'Famous Capital Limited', 'FBNQuest Funds Limited',
    'FCSL Phoenix Funds Limited', 'FDC Advisory Limited', 'Ficus Capital and Investment & Management Limited',
    'FIL Capital and Advisory Limited', 'Finance Teque Nigeria Limited', 'Financial Care Advisers Limited',
    'First Ally Asset Management Limited', 'First Asset Management Limited', 'First Icon Mutual Capital Limited',
    'First Trustees Limited', 'Flamestar Capital Limited', 'Flourish Securities Investment and Trust Limited',
    'Folsort Investment Services Limited', 'Foremost Capital Limited', 'Fortitudinal Asset Managers Limited',
    'Fortrust Asset Management Limited', 'FSDH Asset Management Limited', 'FSL Asset Management Limited',
    'Fullrange Capital Limited', 'Fundco Capital Managers Limited', 'Fundvine Berkshire Assets Management Limited',
    'Futureview Asset Management Limited', 'GABS Financial Services Limited', 'Greencity Financial Limited',
    'Greenwich Asset Management Limited', 'Gresham Asset Management Limited', 'Growth and Development Asset Management Limited',
    'GTI Asset Management and Trust Limited', 'Halo Nigeria Capital Management Limited', 'Hebron Capital Limited',
    'Helios Capital Management Limited', 'Hillcrest Capital Management Limited', 'HV Capital Limited',
    'IHL Assets Management Limited', 'Imperial Capital Advisers Limited', 'Inverness Wealth Management Limited',
    'Invest-Trust Assets Management Limited', 'Investment One Financial Services Limited', 'Iroko Capital Investment Management Limited',
    'Iron Fund Management Limited', 'Jupiter Fund Management Company Limited', 'Kedari Capital Limited',
    'Konooz Investments Limited', 'Kudimata Capital Limited', 'Kudy Financials Limited',
    'Kuramo Capital Limited', 'Kwik Kapital Limited', 'Ladder Investment Limited',
    'Lancelot Fund and Portfolio Management Limited', 'Lead Asset Management Limited', 'Leadway Asset Management Company Limited',
    'Lightsource Associates Limited', 'Linkbridge Partners Limited', 'Ma\'am Asset Management Limited',
    'Mainstreet Capital Limited', 'Mango Asset Management Limited', 'Marathon Asset and Fund Management Limited',
    'Marble Capital Limited', 'MBO Capital Management Limited', 'Mega Capital Asset Management & Trust Limited',
    'Merit Capital Limited', 'Meritex Asset Management Limited', 'Metroreal Capital Limited',
    'Morgan Capital Investment Limited', 'Mute Swan Capital Limited', 'Myrtle Asset Management and Trust Limited',
    'NEM Asset Management Company Limited', 'Networth Portfolio and Asset Management Limited', 'Nexus CR Asset Management Limited',
    'Nigerian Life and Provident Company Limited', 'Noble Assets Management Limited', 'Nova MBL Asset Management Limited',
    'Novare Fund Manager Nigeria Limited', 'OGR Asset Management Limited', 'Old Shoreham Investment Management Limited',
    'Olive Asset Management Company Limited', 'One Trust Asset Management Company Limited', 'One17 Capital Limited',
    'Optimum Global Capital Management Limited', 'ORC Capital Limited', 'Orchidbay Investment Company Limited',
    'PAC Asset Management Limited', 'Page Asset Management Limited', 'Park End Capital Partners Limited',
    'Parthian Capital Limited', 'Pathway Asset Management Limited', 'Pennington Promise Capital Limited',
    'PlanetCap Asset Management Limited', 'Plethoria Asset Management Limited', 'Ploutos Asset Management Limited',
    'Possibility Fund Limited', 'Precision Assets Management Limited', 'Prime Capital and Investment Limited',
    'Purple Asset Managers Limited', 'PV Capital Limited', 'Quant Investment Limited',
    'Quinoa Asset Managers Limited', 'Radix Asset Management Company Limited', 'Rasmal Capital Limited',
    'RC Brown Capital Limited', 'Rectangle Capital Limited', 'Redwood Asset Management Limited',
    'Regius Asset Management Limited', 'Reliance Capital Limited', 'Richgreen Master\'s Capital Limited',
    'RMB Nigeria Asset Management Limited', 'Royal Exchange Finance Company Limited', 'Ruby Trust Capital and Investment Ltd',
    'RV Fund Management Limited', 'Sahel Capital Fund Manager Limited', 'SAMTL Fund Managers Limited',
    'Sankore Securities Limited', 'SCM Capital Asset Management Limited', 'SEWA Assets Management Limited',
    'SFL Asset Management Limited', 'SFS Capital Nigeria Limited', 'Sigma Asset Management Limited',
    'Sky Capital Asset Management Limited', 'Skymark Partners Investment Management Limited', 'Smadac Capital Limited',
    'Smooth Capital Limited', 'Sohcahtoa Partners Limited', 'Sovereign Asset Management Limited',
    'Spok Capital Limited', 'SterlingFi Wealth Management Limited', 'Sthenic Capital Management Limited',
    'STI Assets Management Limited', 'STL Asset Management Limited', 'Stremvans Fund Management Limited',
    'SVC Mutual Limited', 'Sycamore Investment and Asset Management Limited', 'The Brook Fund Management Service Limited',
    'The Lion King Capital', 'The Mellanby Trust Company Limited', 'The Oak Capital Fund Managers Limited',
    'Torch Asset Management Limited', 'Transsnet Asset Management Limited', 'Treegar Capital Management Limited',
    'Trium Limited', 'Tro-Vest Asset Management Limited', 'TrustArthur Limited',
    'Trustbanc Asset Management Limited', 'Trustline Capital Limited', 'Tsarumi Capital Limited',
    'Uhuru Capital Limited', 'Utica Capital Limited', 'UTL Asset Management Limited',
    'Valiente Asset Management Limited', 'ValuAlliance Asset Management Limited', 'Verdant Vault Limited',
    'Verod Advisory Services Limited', 'VNL Capital Asset Management Limited', 'Volition Capital Investments Limited',
    'WakaInvest Limited', 'Watershed Fund Management Limited', 'Wealthbridge Asset Management Limited',
    'Whitecrust Asset Management Company Limited', 'Widestride International Limited', 'Woodland Asset Management Company Limited',
    'WSTC Financial Services Limited', 'YCP Fund Manager Limited', 'Zedcrest Investment Managers Limited',
    'Zigma Alpha Asset Management Limited', 'Zitra Fund Managers Limited', 'Zrosk Investment Management Limited',
  ];

  const tier2Emails: Record<string, string> = {
    'ABS Capital Limited': 'abscapital@abscapital.com',
    'ACQ Investment Managers': 'yinka@acqmanagers.com',
    'Actis West Africa Income Manager Limited': 'tikiseh@act.is',
    'Adino Asset Management Limited': 'compliance@adinoinvest.com',
    'Africa Plus Partners Nigeria Limited': 'info@africaplusfund.com',
    'Afrivalue Asset Management Limited': 'info@afrivalue.com.ng',
    'AIICO Capital Limited': 'compliance@aiicocapital.com',
    'ALM Capital Limited': 'compliance@almfundmanagers.com',
    'Alpha Morgan Capital Managers Limited': 'info@alphamorgan.com',
    'Alpha10 Fund Management Limited': 'enquiries@alpha10group.com',
    'Anchoria Asset Management Limited': 'info@anchoriaam.com',
    'Apel Wealth Management Limited': 'apelwealth@apel.ng',
    'Aquilla Asset Management Limited': 'contact@aquila-am.com',
    'Argentil Asset Management Limited': 'aaml@argentilcp.com',
    'ARM Investment Managers Limited': 'imgroup@arm.com.ng',
    'ARM-Harith Infrastructure Investment Limited': 'armhiil.compliance@arm.com.ng',
    'ASAM Capital Limited': 'compliance@asamcapitalltd.com',
    'Ascend Investment Managers Limited': 'info@ascend.ng',
    'Ascent Capital Ltd': 'compliance@ascentcapital.ng',
    'Assist Investment Advisory Limited': 'info@assistinvestmentadvisory.com',
    'Asteric Asset Management Limited': 'info@astericassetmanagement.com',
    'AVA Global Asset Managers Limited': 'info@avacapitalgroup.com',
    'AXA Mansard Investments Limited': 'clientservices@axamansard.com',
    'Bancorp Asset Management Limited': 'info@capitalbancorpgroup.com',
    'BAS Financial Services Limited': 'basfinancialservices@basgroup.ng',
    'Berkshire Asset Management Limited': 'info@berkshireassetmgt.com',
    'BGL Asset Management Limited': 'info@bglgroup.ng',
    'Blackaion Capital Management Limited': 'info@blackaion.com',
    'BlackCod Asset Management Limited': 'info@blackcodassetmgt.com',
    'BlackRose Asset Management Limited': 'info@blackrosellp.com',
    'Blue Marina Asset Management Limited': 'info@bluemarinaam.com',
    'BRB Financial Advisory Limited': 'info@brbcapital.co.uk',
    'Bucksfield Asset Management Limited': 'compliance@bucksfield.com.ng',
    'Canary Points Capital Limited': 'info@canarypoint.com',
    'Capital Assets Limited': 'info@capitalassets.com.ng',
    'Capital Express Global Asset Management Limited': 'info@capitalexpressassetandtrust.com',
    'Capital Plus Management Limited': 'contactus@capitalplusmgt.com',
    'Capital Trust Investment and Asset Management Limited': 'info@capitaltrustnigeria.com',
    'Capitalfield Asset Management Company Limited': 'info@capitalfieldassetmanagement.com',
    'CB Capital Limited': 'iajator@cbcapitalng.com',
    'CCA Fund Managers Limited': 'ccafundmanagers@cardinalstone.com',
    'Cedar Asset Plus Limited': 'admin@cedarassetmanagement.com',
    'Cedrus Asset Management Limited': 'info@cedrusgroup.africa',
    'Certari Asset Management Limited': 'enquiry@certariassetmanagement.com',
    'Ceviant Asset Management Limited': 'compliance@ceviant.co',
    'CFG Asset Management Limited': 'info@cfgafrica.com',
    'Chapters and Heights Investment Partners Limited': 'info@chaptersandheights.com',
    'Cherry Hills Portfolio Management Ltd': 'cherryhillsportfolio@gmail.com',
    'Citadele Capitals Investment Managers Limited': 'Info@citadelecapitals.com',
    'Cititrust Asset Management Limited': 'info@cititrustassetmgt.com',
    'Citycode Investment Limited': 'info@citycodeinvestment.com',
    'Coinage Capital Managers Limited': 'deals@coinagegroup.net',
    'Commercio Partners Asset Management Limited': 'info@comerciopartners.com',
    'Consonance Investment Management Limited': 'info@consonanceinvest.com',
    'Constant Capital Fund Managers Limited': 'info@constantcap.com',
    'Cordros Asset Management Limited': 'info@cordros.com',
    'Core Asset Management Limited': 'Info@coreasset.ng',
    'Coremars Asset Management Limited': 'hello@coremars.com',
    'Credent Investment Managers Limited': 'compliance@credent.ng',
    'CRL Africa Wealth Management Limited': 'support@crlafrica.com',
    'Custodian Asset Management Limited': 'fundmanagement@custodianassetmanagement.com',
    'Dane Investments Limited': 'globalmarkets@daneinvestments.com',
    'Deutsche Assets Management Limited': 'projects@deutschepartners.com',
    'DFC Asset Management Company Limited': 'info@dfcassetmanagement.com',
    'DLM Asset Management Limited': 'hello@dlm.group',
    'DMB Capital Limited': 'info@dmbcapital.co',
    'D\'Namaz Capital Limited': 'enquiries@dnamazcapital.com',
    'DSC Asset Management Company Limited': 'info@digitalspacecapital.com',
    'ECOB Portfolio Management Limited': 'enquiry@ecobpm.com',
    'Ecoops Financial Services Limited': 'contact@ecoopsfinancial.com',
    'EDC Fund Management Limited': 'edcfundmanagement@ecobank.com',
    'Emerging Africa Asset Management Limited': 'assetmanagement@emergingafricagroup.com',
    'EPM Assets Limited': 'info@epmlassets.org',
    'Ethica Capital Ltd': 'info@ethicacapitalltd.com',
    'Famous Capital Limited': 'info@famouscapitalng.com',
    'FBNQuest Funds Limited': 'info@firstcapltd.com',
    'FCSL Phoenix Funds Limited': 'phoenixcompliance@fcslng.com',
    'FDC Advisory Limited': 'info@fdc-ng.com',
    'Ficus Capital and Investment & Management Limited': 'info@ficuscap.com',
    'FIL Capital and Advisory Limited': 'info@finserveinvestment.com',
    'Finance Teque Nigeria Limited': 'info@financetequecv.com',
    'Financial Care Advisers Limited': 'customercare@financialcareadvisers.com',
    'First Ally Asset Management Limited': 'sales@first-ally.com',
    'First Asset Management Limited': 'ccu@fbnquestmb.com',
    'First Icon Mutual Capital Limited': 'info@firsticon.com',
    'First Trustees Limited': 'compliance@firsttrustees.com',
    'Flamestar Capital Limited': 'compliance@flamestarcapital.com',
    'Flourish Securities Investment and Trust Limited': 'contact@flourishsecng.com',
    'Folsort Investment Services Limited': 'customer@folsortinvestmentservices.com',
    'Foremost Capital Limited': 'alukman@tajcapitalltd.com',
    'Fortitudinal Asset Managers Limited': 'fisayo.bejide@fortitudinalassetmanagers.com',
    'Fortrust Asset Management Limited': 'contactcenter@fortrustassetmanagement.com',
    'FSDH Asset Management Limited': 'amcustomercare@fsdhgroup.com',
    'FSL Asset Management Limited': 'assetmanagement@fsl.ng',
    'Fullrange Capital Limited': 'fullrangecapital@gmail.com',
    'Fundco Capital Managers Limited': 'info@fundco.ng',
    'Fundvine Berkshire Assets Management Limited': 'invest@fundvineberkshire.com',
    'Futureview Asset Management Limited': 'info@futureviewgroup.com',
    'GABS Financial Services Limited': 'gabsfinancial@gmail.com',
    'Greencity Financial Limited': 'info@greencityfin.com',
    'Greenwich Asset Management Limited': 'info@greenwichmerchantz.com',
    'Gresham Asset Management Limited': 'info@greshamassetng.com',
    'Growth and Development Asset Management Limited': 'info@gdl.com.ng',
    'GTI Asset Management and Trust Limited': 'gtiamt@gti.com.ng',
    'Halo Nigeria Capital Management Limited': 'assetmanagement@haloasset.com',
    'Hebron Capital Limited': 'info@hebroncap.com',
    'Helios Capital Management Limited': 'Info@HeliosLLP.com',
    'Hillcrest Capital Management Limited': 'info@hillcrestcapmgt.com',
    'IHL Assets Management Limited': 'info@ihlassetsmgt.com',
    'Imperial Capital Advisers Limited': 'compliance_ical@imperialasset.com.ng',
    'Inverness Wealth Management Limited': 'iwm@nm.com',
    'Invest-Trust Assets Management Limited': 'info@investtrustasset.com',
    'Investment One Financial Services Limited': 'compliance@investment-one.com',
    'Iroko Capital Investment Management Limited': 'info@irokocapital.com',
    'Iron Fund Management Limited': 'info@ironfund.africa',
    'Jupiter Fund Management Company Limited': 'admin@jupiterfundmanagement.com',
    'Kedari Capital Limited': 'info@kedaricapital.com',
    'Konooz Investments Limited': 'info@konoozinvestments.com',
    'Kudimata Capital Limited': 'support@kudimata.capital',
    'Kudy Financials Limited': 'experience@kudy.io',
    'Kuramo Capital Limited': 'kclcompliance@netorg710072.onmicrosoft.com',
    'Kwik Kapital Limited': 'info@kwikkapital.com',
    'Ladder Investment Limited': 'ladderinvestmentlimited@gmail.com',
    'Lancelot Fund and Portfolio Management Limited': 'info@lancelotltd.com',
    'Lead Asset Management Limited': 'customerservice@leadcapitalng.com',
    'Leadway Asset Management Company Limited': 'assetmanager@leadway.com',
    'Lightsource Associates Limited': 'lclcompliance@lighthousecapital.ng',
    'Linkbridge Partners Limited': 'info@linkbridgepartners.com',
    'Ma\'am Asset Management Limited': 'md@maamassetmgt.com',
    'Mainstreet Capital Limited': 'info@mainstreetcapltd.com',
    'Mango Asset Management Limited': 'operations@mangoam.com',
    'Marathon Asset and Fund Management Limited': 'info@marathon.ng',
    'Marble Capital Limited': 'info@marble.capital',
    'MBO Capital Management Limited': 'legal@mbocapital.com',
    'Mega Capital Asset Management & Trust Limited': 'assetmanagement@megacapitalng.com',
    'Merit Capital Limited': 'ifo@meritcapital.ng',
    'Meritex Asset Management Limited': 'info@meritexassetmanagement.com',
    'Metroreal Capital Limited': 'admin@metrorealcapital.com',
    'Morgan Capital Investment Limited': 'info@morgancapitalgroup.com',
    'Mute Swan Capital Limited': 'info@muteswancapital.com',
    'Myrtle Asset Management and Trust Limited': 'compliance@myrtleng.com',
    'NEM Asset Management Company Limited': 'info@nemasset.com',
    'Networth Portfolio and Asset Management Limited': 'info@networtham.com',
    'Nexus CR Asset Management Limited': 'yusufshoetan@gmail.com',
    'Nigerian Life and Provident Company Limited': 'mails@nlpc-ng.com',
    'Noble Assets Management Limited': 'nobleassetsmanagement@gmail.com',
    'Nova MBL Asset Management Limited': 'info@novamblassetmgt.com',
    'Novare Fund Manager Nigeria Limited': 'chineme@novare.com',
    'OGR Asset Management Limited': 'info@ograsset.com',
    'Old Shoreham Investment Management Limited': 'welcome@oldshoreham.com',
    'Olive Asset Management Company Limited': 'info@oliveassetmgt.com',
    'One17 Capital Limited': 'compliance@one17capital.com',
    'Optimum Global Capital Management Limited': 'enquiries@optimum-g.com',
    'Orchidbay Investment Company Limited': 'info@orchidbayinvest.com',
    'PAC Asset Management Limited': 'info@pacassetmanagement.com',
    'Page Asset Management Limited': 'info@pageaml.com',
    'Park End Capital Partners Limited': 'eimohe@parkendcapital.com',
    'Parthian Capital Limited': 'info@parthiancapitalng.com',
    'Pathway Asset Management Limited': 'info@pathway.ng',
    'Pennington Promise Capital Limited': 'info@penningtonpromise.com',
    'Plethoria Asset Management Limited': 'info@plethoriaassetmanagement.com',
    'Ploutos Asset Management Limited': 'info@ploutos.com',
    'Possibility Fund Limited': 'info@possibilityfundltd.com',
    'Precision Assets Management Limited': 'admin@precisionassetmgt.com',
    'Prime Capital and Investment Limited': 'info@primecapital.ng',
    'Purple Asset Managers Limited': 'contact@purple.xyz',
    'PV Capital Limited': 'compliance@pvcapital.com.ng',
    'Quinoa Asset Managers Limited': 'info@quinoawealth.com',
    'Radix Asset Management Company Limited': 'globalmarket@radixng.com',
    'Rasmal Capital Limited': 'info@rasmalcapital.com',
    'RC Brown Capital Limited': 'info@rcbrowncapital.com',
    'Rectangle Capital Limited': 'rectanglecapital@gmail.com',
    'Redwood Asset Management Limited': 'info@redwoodaml.com',
    'Regius Asset Management Limited': 'compliance@residentcap.com',
    'Reliance Capital Limited': 'info@reliancecapitalng.com',
    'Richgreen Master\'s Capital Limited': 'clientservice@richgreenmasterscapital.com',
    'RMB Nigeria Asset Management Limited': 'dlrmbnassetmanagement@rmb.com.ng',
    'Royal Exchange Finance Company Limited': 'finance@royalexchangeplc.com',
    'Ruby Trust Capital and Investment Ltd': 'management@rubytrustcapital.com',
    'RV Fund Management Limited': 'askus@rvcapital.com',
    'Sahel Capital Fund Manager Limited': 'info@sahelcp.com',
    'SAMTL Fund Managers Limited': 'samtlfundmanagers@sterlingassetng.com',
    'Sankore Securities Limited': 'info@sankore.com',
    'SCM Capital Asset Management Limited': 'assetmanagement@scmcapitalng.com',
    'SEWA Assets Management Limited': 'info@sewaassetsmanagement.com',
    'SFL Asset Management Limited': 'info@sflassetsltd.com',
    'SFS Capital Nigeria Limited': 'compliance@sfsnigeria.com',
    'Sigma Asset Management Limited': 'info@sigmaamltd.com',
    'Sky Capital Asset Management Limited': 'info@skycapitalassetmanagement.com',
    'Skymark Partners Investment Management Limited': 'info@skymarkpartners.com',
    'Smadac Capital Limited': 'info@smadacsecuritiesltd.com',
    'Smooth Capital Limited': 'info@smoothcapital.ng',
    'Sohcahtoa Partners Limited': 'info@sohcahtoapartners.com',
    'Sovereign Asset Management Limited': 'hello@sovereignassetmgt.ng',
    'Spok Capital Limited': 'corporates@spokcapital.com',
    'SterlingFi Wealth Management Limited': 'sterlingfiwealth@sterling.ng',
    'Sthenic Capital Management Limited': 'olateju@sthenicfinance.com',
    'STI Assets Management Limited': 'info@stiassetmgt.com',
    'STL Asset Management Limited': 'stl@stlassetmgt.com',
    'Stremvans Fund Management Limited': 'sfml@stremvans.com',
    'SVC Mutual Limited': 'info@svcmutual.com',
    'Sycamore Investment and Asset Management Limited': 'assetmgt@sycamore.ng',
    'The Brook Fund Management Service Limited': 'info@thebrookfundmanagement.com',
    'The Lion King Capital': 'info@thelionkingcapital.com',
    'The Mellanby Trust Company Limited': 'clarify@mellanbytrust.com',
    'The Oak Capital Fund Managers Limited': 'info@theoakcapitalfundmanagers.com',
    'Torch Asset Management Limited': 'contact@torchasset.ng',
    'Transsnet Asset Management Limited': 'transsnetassetng@transsnet.com',
    'Treegar Capital Management Limited': 'hello@treegarcapitalmgt.com',
    'Trium Limited': 'info@trium.ng',
    'Tro-Vest Asset Management Limited': 'customercare@tro-vestassetmngt.com',
    'TrustArthur Limited': 'info@trustarthurgroup.com',
    'Trustbanc Asset Management Limited': 'info@trustbancgroup.com',
    'Trustline Capital Limited': 'info@trustlinecapitallimited.com',
    'Tsarumi Capital Limited': 'tsarumicap@yahoo.com',
    'Uhuru Capital Limited': 'info@uhurucap.com',
    'Utica Capital Limited': 'info@uticacap.com',
    'UTL Asset Management Limited': 'info@utlam.com',
    'Valiente Asset Management Limited': 'asset@thevaliente.com',
    'ValuAlliance Asset Management Limited': 'info@valualliance.com',
    'Verdant Vault Limited': 'verdantvault@verdantvault.io',
    'Verod Advisory Services Limited': 'info@verod.com',
    'VNL Capital Asset Management Limited': 'info@vnlcapital.com',
    'Volition Capital Investments Limited': 'ask@volitioncap.com',
    'WakaInvest Limited': 'info@wakainvest.com',
    'Watershed Fund Management Limited': 'operations@watershedfundmanagers.com',
    'Wealthbridge Asset Management Limited': 'wealthbridgeasset.compliance@wealthbridge.com.ng',
    'Whitecrust Asset Management Company Limited': 'info@whitecrust.com',
    'Widestride International Limited': 'hello@widestrideco.com',
    'Woodland Asset Management Company Limited': 'assetmgt@woodlandcapitalplc.com',
    'WSTC Financial Services Limited': 'info@wstc.com.ng',
    'Zedcrest Investment Managers Limited': 'ask@zedcrestwealth.com',
    'Zigma Alpha Asset Management Limited': 'info@zigmaalpha.com',
    'Zitra Fund Managers Limited': 'info@zitrafundmanagers.com',
    'Zrosk Investment Management Limited': 'investment@zrosk.com',
  };

  for (const firmName of tier2Firms) {
    const email = tier2Emails[firmName] || null;
    targets.push({ id: uuid(), firm_name: firmName, tier: 2, category: 'Screening Queue', why_this_fits: null, contact_email: email, status: 1, special_flags: null, notes: null });
  }

  return targets;
}