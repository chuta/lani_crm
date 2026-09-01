# CPO Implementation — Health Check vs Commercial Proposal Master Template v1.0

**Date:** 2026-08-31
**Scope:** Gap analysis of the Partnership Pipeline app against the Commercial Proposal Master Template v1.0 (Marketing/Sales Library controlled template).
**Status:** Analysis only — no build work performed (per instruction, health check before further development).

---

## 1. Coverage map (template section → implementation)

| Template section | App status | Notes |
|---|---|---|
| §1.1 Partnership Context | ⚠️ Partial | `executive_summary` + country/vertical only |
| §1.2 Proposed Opportunity | ❌ Missing | No field / UI / output |
| §1.3 Key Objectives (max 5–7) | ❌ Missing | No field / UI / output |
| §1.4 Non-Binding Status | ✅ Present | Static paragraph in HTML + DOCX |
| §2.1 Partnership Route | ✅ Present | Enum + selector + gate check |
| §2.2 Scope of Collaboration (+ explicit out-of-scope) | ❌ Missing | Risk: roadmap items silently become committed scope |
| §2.3 Product/Proposition (GW-00 controlled claim) | ⚠️ Partial | Claims library + gate; custom_wording/section stored but never rendered; Pending attachable (warn-only) |
| §2.4 Roles & Responsibilities (UTribe / Partner) | ❌ **Missing** | Route boilerplate sentence only; no per-party responsibility capture |
| §2.5 Joint Responsibilities | ❌ Missing | — |
| §3.1 Commercial Model Classification | ✅ Present | A/B/C/D enum + selector |
| §3.2 Selected Model Rationale | ❌ Missing | No rationale text field |
| §4.1 Primary Commercial Mechanism (+ [C/E/P], Finance status) | ❌ Missing | No mechanism field |
| §4.2 Cost & Margin Structure (confidence + **owner**) | ⚠️ Partial | Owner column missing; residual/allocations show "—" confidence |
| §4.3 Effective Economics | ✅ Present | Both residual share + effective % rendered |
| §4.4 Commercial Rationale | ❌ Missing | — |
| §5.1 Extended Fees | ⚠️ Partial | fee/category/basis/confidence; `approval_status` unused in output/gate |
| §5.2 Integration / Implementation Economics | ❌ Missing | Module toggle exists; no fields (waiver value/reason/conditions, Finance approval) |
| §5.3 Tiered Growth Incentives | ⚠️ Partial | No measurement basis/period, reassessment cadence, upgrade/downgrade rules, floor protection |
| §6.1 / §6.2 Strategic Value | ⚠️ Partial | Free-text fields rendered as prose; no benefit bullet structure |
| §7.1 Implementation Model | ✅ Present | Route, dependencies, timing (timing not gated on Product/Tech approval) |
| §7.2 Reporting & Transparency | ❌ Missing | — |
| §7.3 Compliance Alignment | ❌ Missing | — |
| §7.4 Governance Framework | ⚠️ Partial | Single `governance_cadence` reused for everything; no implementation/post-launch/commercial cadences; no named owners |
| **§7.5 Risk and Control Responsibilities** | ❌ **Critical gap** | See §2 below |
| §8 Key Assumptions | ✅ Strong | Categories + C/E/P + gate blocks open [P]; output excludes [P] |
| §9.1 Contract Term | ✅ Present | Field + gate check |
| §9.2 Commercial Review | ❌ Missing | See §3 below |
| §9.3 Pilot Phase (conditional) | ⚠️ Toggle only | Boilerplate paragraph; no segment/duration/scope/success measures/decision gate/expansion criteria |
| §9.4 Success Metrics | ❌ **Missing** | No model-linked metrics capture |
| §9.5 Payment & Reconciliation | ❌ **Missing** | Hardcoded "To be defined during implementation" |
| §9.6 Confidentiality | ⚠️ Static | One line; "Legal review required" not structurally enforced |
| §9.7 Exclusivity (conditional) | ⚠️ Toggle only | Boilerplate; no scope/geography/product/segment/duration/performance conditions; no cross-partnership conflict check |
| §10 Discussion Points | ✅ Present | Categories match template |
| §11 Next Steps | ✅ Present | Fixed 5 steps match template |
| §12 Closing | ✅ Present | — |
| Internal Release Gate | ⚠️ 13 checks | Missing: jurisdiction-claims qualification, template version confirmation, Legal commercial-clauses function, per-section approval tie-ins (see §4) |
| Claims rule (GW-00) | ⚠️ Partial | 12 claims seeded, only 2 Approved; no jurisdiction-match check |

---

## 2. Deep dive — §7.5 Risk and Control Responsibilities (CRITICAL)

### What exists
- `proposal_risks` table, `risk_type` enum already mirrors the template domains: KYC/AML, Transaction Monitoring, Customer Communication, Complaints, Data Privacy, Cybersecurity, Settlement, Reconciliation, Regulatory, Claims/Disclosures (plus Economics, Integration).
- Release gate check #11 "No Critical Open Risks" (blocks on Critical + open).
- Risks are **display-only** in the UI (no add/edit form; API routes exist but no UI).

### Gaps
1. **Section 7.5 is absent from the external document.** Neither the HTML generator nor the DOCX exporter renders a "Risk and Control Responsibilities" section. The template requires it as a partner-facing section; the app's §7 stops at implementation/governance rows.
2. **No per-party responsibility assignment.** The template requires responsibility for each control domain to be defined (KYC/AML, transaction monitoring, customer communication, complaints, operational escalation, data privacy, cybersecurity, settlement, reconciliation, regulatory engagement, controlled claims). Current model has one free-text `owner` (a person), with no UTribe / Partner / Joint dimension and no per-domain control owner.
3. **No route-based responsibility rule.** Template: "Responsibility must follow the selected partnership route" and "Do not assume responsibilities from a previous Bank, PSP, Fintech or other partner apply automatically." Nothing enforces per-route assignment; the app has no route→responsibility matrix.
4. **No care-list enforcement.** The template flags particular care before assigning: custody, insurance, redemption, liquidity, settlement, API/technical integration, customer onboarding, customer support, regulatory obligations, transaction monitoring, reporting. No gate check ensures these sensitive domains have an assigned responsible party before external release.
5. **No operational escalation owner linkage** (escalation_route exists as free text on the proposal, unconnected to risk domains; template §7.5 lists "operational escalation" as a control responsibility).

---

## 3. Deep dive — §9 Commercial and Partnership Terms (CRITICAL)

### What exists
- 9.1 Contract term ✅ (field `contract_term` + gate check #12).
- 9.6 Confidentiality ⚠️ static one-liner in output.
- 9.3 / 9.7 ⚠️ conditional module toggles + one boilerplate paragraph each in output ("A pilot phase is proposed with defined success measures and an expansion decision gate." / "Exclusivity terms, if applicable, are defined by scope, geography, product… subject to mutual agreement.").

### Gaps
1. **§9.2 Commercial Review — missing entirely.** Template requires: what is reviewed, performance data required, circumstances terms may be reconsidered, approval process for changes. App reuses `governance_cadence` as "Review cadence" — double-duty, losing the §7.4 meaning.
2. **§9.3 Pilot — no structured fields.** Missing: target segment, duration, scope, success measures, decision gate, expansion criteria. A partner-facing proposal cannot state a credible pilot with a toggle + sentence.
3. **§9.4 Success Metrics — missing entirely.** Template says metrics must be selected according to the partnership model (volume, AUM, active customers, conversion, recurring participation, retention, revenue, acquisition, channel adoption, partner-specific) and must be measurable. Nothing is captured or rendered — critical for post-launch governance.
4. **§9.5 Payment & Reconciliation — missing entirely.** Reconciliation cadence, payment cadence, dispute window, settlement mechanism are hardcoded as "To be defined during implementation" in the output. Template requires Finance/Commercial **and** Legal approval of these terms — none of that is structured or gated.
5. **§9.7 Exclusivity — no structure.** Missing: exact scope, geography, product, customer segment, duration, performance conditions, check against other active partnerships, Commercial + Legal approval. The current boilerplate ("subject to mutual agreement") is weaker than the template's default position ("No exclusivity assumed") and its approval chain.

---

## 4. Release gate gaps (External Release Conditions)

Template release conditions that the gate does not fully enforce:

| Template condition | Gate status |
|---|---|
| No [P] placeholder remains | ✅ check #1 |
| Unapproved commercial figure presented as confirmed | ⚠️ via Finance_Economics approval only |
| Selected commercial model not validated | ✅ check #3 + Finance_Model approval |
| Product/Technology scope unresolved | ⚠️ via approvals only; no scope fields to check |
| Claims conflict with GW-00 | ✅ checks #5/#6 (deprecated/pending) |
| **Jurisdiction-specific claims lack required qualification** | ❌ **Not checked** — claim `jurisdiction` never validated against proposal `country` |
| Responsibilities materially unclear | ❌ **Not checked** — no responsibilities model exists |
| Unapproved SLA / timeline / integration / liquidity / fee inserted | ⚠️ approximated by Finance_Fees + Technology_Implementation approvals; no per-item flags |
| Definitive-agreement language presented as agreed | ❌ Not checked (content scan needed) |
| Required functional approval outstanding | ✅ check #9 (all 13 functions) |
| Marketing: correct template version / GW-00 migration confirmed | ⚠️ Marketing_Template approval exists; no template-version field tracked per proposal |

**Approval matrix gaps:** template's Compliance/Legal row includes **"Commercial clauses"** — the app has Legal_Claims, Legal_Regulatory, Legal_Risk but **no `Legal_Commercial`** function. Operations is a single function per plan; template separates operating responsibilities vs settlement/reconciliation sign-offs (acceptable as one, but weaker).

---

## 5. Other hardening items

1. **§2.4 / §2.5 Roles & Responsibilities** are the biggest content gap besides §7.5 — no UTribe/Partner/Joint responsibility lists are captured or rendered (the output only prints a route-dependent single sentence).
2. **§1.2 / §1.3 / §3.2 / §4.1 / §4.4** — opportunity, objectives, model rationale, commercial mechanism (+ approval status), commercial rationale: no fields, no UI, no output.
3. **§5.2 Integration economics** — module toggle without fields for waiver value/reason/conditions; Finance-approval requirement not modeled.
4. **§5.3 Tiers** — missing measurement basis, period, reassessment cadence, upgrade/downgrade rules, floor protection.
5. **§7.2 Reporting / §7.3 Compliance Alignment** — missing; §7.4 governance needs 3 cadences + named owners (UTribe/Partner), not one reused field.
6. **Claims**: `custom_wording` and section mapping stored but never rendered; Pending claims are attachable (gate blocks at release — acceptable, but note template says Pending must never appear externally; generator filters them out correctly); jurisdiction field unused.
7. **Version header bug**: output hardcodes "v1.0" in the doc header instead of `external_release_version` (misleads once a proposal is re-released).
8. **Claims register readiness**: 12 claims seeded, only 2 Approved (CLM-007, CLM-009); 10 Pending. Under §4 of the template, Pending wording must not go external, so every proposal today can use at most 2 claims. Legal/Compliance review backlog is a business blocker, not a code blocker.
9. **Risk UI is read-only** — users cannot add/update risks from the app despite API support.

---

## 6. Prioritized hardening roadmap (no build yet — agreed plan)

### P0 — Required before company-wide rollout (schema + gate + output)
1. **Responsibilities model** — new `proposal_responsibilities` table (party: UTribe|Partner|Joint, control domain, description, per-route default from a route↔responsibility matrix). Seed per-route defaults so caretakers start from the approved route, per template control rule.
2. **§7.5 in output** — render Risk & Control Responsibilities section in both HTML and DOCX.
3. **§2.4/§2.5 capture + output** — UTribe/Partner/Joint responsibility editors.
4. **§9 Terms data model** — commercial review, success metrics (model-linked), payment & reconciliation (cadences, dispute window, settlement mechanism), pilot (segment/duration/scope/success measures/decision gate/expansion criteria), exclusivity (scope/geography/product/segment/duration/performance conditions).
5. **Gate additions** — "Risk & Control Responsibilities Complete" (incl. care-list domains: custody, insurance, redemption, liquidity, settlement, API/integration, onboarding, support, regulatory, monitoring, reporting), "Commercial Terms Complete" (metrics + payment/reconciliation + commercial review), "Jurisdiction Claims Qualified" (claim jurisdiction vs proposal country), add `Legal_Commercial` approval function.
6. **Fix header version** → `external_release_version`.

### P1 — Governance fidelity
7. Add §1.2/§1.3/§3.2/§4.1(+approval status)/§4.2 owner+confidence/§4.4/§5.2 fields/§5.3 tier mechanics/§7.2 reporting/§7.3 compliance/§7.4 named owners + 3 cadences.
8. Risk add/edit UI (API already supports it).
9. Render `custom_wording` when present, or block custom wording at release.
10. Track template version per proposal; gate on Marketing_Template confirmation of current version + GW-00 migration.

### P2 — Data & operations readiness
11. Drive claims register to full approval (10 Pending → Approved/Deprecated) with evidence URLs; add jurisdiction data per claim.
12. Route↔responsibility matrix maintenance process + ownership (Marketing/Sales Library version control per template maintenance rule).
13. Dashboard attention items for proposals missing responsibilities or commercial terms.

---

## 7. Bottom line

The app's skeleton is faithful — pre-flight, confidence tags, claims library, approval matrix, release gate, versioning, discussion points, DOCX/print — and the risk/assumption enums were clearly built from this template. The **substance is missing where the template is most contractual**: §2.4 responsibilities, §7.5 Risk & Control Responsibilities, and §9 Commercial & Partnership Terms. None of these three appear in the external document at all, and only two conditional modules (fees, tiers) have real data structures.

For a company-wide commercial workload, P0 items 1–6 are the minimum to reach template compliance; items 7–13 harden governance fidelity and data readiness. P0 is estimated as schema + service + route + gate + output changes — no UI framework change required.