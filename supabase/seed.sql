-- Seed data for local `supabase db reset` and optional remote load.
-- Full archetype templates also live in api/src/seed.ts for the SQLite API.

insert into public.archetype_library (
  id, name, one_line_test, effort_tier, description, standard_components, precedent_name
) values
  (
    'I',
    'Embedded Account / Dashboard',
    'Does the partner''s own platform need to show individual customers their GIFT balance and let them transact?',
    2.5,
    'SSO federation, individual KYC, live balance/transaction API. Medium-High effort.',
    '["OAuth2 / SSO session federation","KYC verification API","Balance API plus webhook","Live pricing feed API","Transaction API for Receive and Send","Notification integration"]'::jsonb,
    'Ubuntu Tribe × Lifestyle Hub $GIFT Integration Proposal'
  ),
  (
    'II',
    'Institutional Custody / Fund Wrapper',
    'Is the partner a licensed asset manager pooling client money into a fund that holds GIFT?',
    1.5,
    'Single institutional custody account. Partner runs its own client-facing layer. Low-Medium effort.',
    '["Single institutional custody account","NAV / reporting API","No consumer-facing UI build required","Trustee / Registrar coordination sits with the partner","BSILC compliance review"]'::jsonb,
    'Institutional Commercial Playbook v1.0'
  ),
  (
    'III',
    'Payment Rails / Infrastructure',
    'Does this partner move money for us, eg. mobile money, banking rails, OTC, treasury?',
    3.0,
    'The broadest, most bespoke build. Multiple rails, phased delivery. High effort.',
    '["Mobile money integration","Banking rail integration","OTC functionality via API","FX conversion and treasury/liquidity management","Phased delivery against UAT milestones"]'::jsonb,
    'Swypt MSA, Schedule 1 Part B'
  ),
  (
    'IV',
    'Card Acceptance / Payment Gateway',
    'Does this let $GIFT-funded customers pay merchants via card?',
    2.0,
    'Gateway/acquiring integration so GIFT-funded value can pay merchants. Medium effort.',
    '["Card acquiring / gateway API integration","PCI-DSS compliance scoping","Merchant category code configuration","Sponsor-bank relationship verification"]'::jsonb,
    'Gladys Technologies Business Case'
  ),
  (
    'V',
    'Card Issuance',
    'Does this partner issue a branded card to GIFT holders for spending?',
    2.5,
    'Opposite direction from Archetype IV — the partner issues cards, not accepts them. Medium-High effort.',
    '["BIN sponsorship coordination","Card issuance API","Wallet infrastructure for the issued card","Cardholder KYC/AML responsibility assignment"]'::jsonb,
    'BananaTech Business Case'
  ),
  (
    'VI',
    'Exchange Listing / Liquidity',
    'Does GIFT trade on this partner''s own exchange?',
    1.5,
    'Minimal ongoing API embed. Real weight sits in listing diligence and treasury risk.',
    '["Listing diligence pack","Treasury counterparty limits","Market surveillance coordination","Competitive firewall protocol"]'::jsonb,
    'Yellow Card Business Case'
  ),
  (
    'VII',
    'Non-Technical / Zero-Integration',
    'Is this a commercial, CSR, or advocacy relationship with no API or platform touchpoint at all?',
    0.5,
    'No technical components. BD closes independently. No Tech queue entry needed.',
    '["No technical components"]'::jsonb,
    'She''s Included CSR Strategy & Letter Template'
  )
on conflict (id) do nothing;

insert into public.proposal_claims_library (id, category, claim, status) values
  ('CLM-001', 'Value Proposition', 'GIFT is fully gold-backed at 1:1 ratio with allocated gold reserves.', 'Approved'),
  ('CLM-002', 'Regulatory', 'Ubuntu Tribe holds a VASP license in compliance with local regulations.', 'Approved'),
  ('CLM-003', 'Security', 'Customer assets are held in regulated custodial wallets with multi-signature protection.', 'Approved'),
  ('CLM-004', 'Performance', 'Transaction settlement occurs within T+1 for standard transactions.', 'Pending'),
  ('CLM-005', 'Market', 'GIFT is listed on multiple exchanges providing deep liquidity for holders.', 'Pending')
on conflict (id) do nothing;

insert into public.bd_prospecting_targets (id, firm_name, tier, category, why_this_fits, status, bd_owner) values
  ('BDP-001', 'Example Bank Ltd', 1, 'Category A', 'Large retail banking network in East Africa with 5M+ customers', 3, 'Chimezie Chuta'),
  ('BDP-002', 'Sample Payments Co', 2, 'Category B', 'Mobile money provider with existing agent network across 3 countries', 5, 'Chimezie Chuta'),
  ('BDP-003', 'Test Asset Management', 1, 'Screening Queue', 'Fund manager exploring tokenised gold products for institutional clients', 1, 'Chimezie Chuta')
on conflict (id) do nothing;

insert into public.deals (
  id, partner_name, sector, archetype, is_repeat, novelty_level, revenue_potential,
  strategic_fit, effort_tier, novelty_penalty, priority_score, queue_position,
  current_stage, bd_owner, description
) values (
  'DEMO-DEV-001', 'Demo Partner Ltd', 'Asset Management', 'II', true, 1, 3, 3,
  1.5, 1, 6.0, 1, 5, 'Chimezie Chuta',
  'Demo deal for local development and testing of the partnership pipeline.'
)
on conflict (id) do nothing;
