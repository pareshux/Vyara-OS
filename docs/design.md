# Vyara OS — Design System (`design.md`)

> **Read alongside `CONSTITUTION.md`, every session.** The Constitution governs architecture; this governs how the product looks, feels, and reads. Every UI prompt references this file so the experience stays consistent across screens, devices, and contributors.
>
> **What this product is:** a data-dense operational tool for a pre-IPO manufacturer. Its users range from field sales engineers entering data on a phone between site visits, to inside-sales staff living in tables all day, to directors scanning MIS at month-end. The design job is **clarity, speed, density, and trust** — not decoration. This is software people *work in*, not a site they *visit*. Craft shows up in consistency and legibility, not in a signature hero moment.

---

## 1. Foundation: library & stack

- **Component library: shadcn/ui** (Radix primitives + Tailwind). Copy-paste, so **we own the component code** — consistent with the greenfield, fully-owned-IP decision. Theme via CSS variables mapped to the tokens below.
- **Icons: lucide-react** (pairs with shadcn; one icon set, no mixing).
- **Charts: Recharts** (or Tremor for dashboard-specific blocks).
- **Tables: TanStack Table** under shadcn's `DataTable` — the workhorse of this product; invest here.
- **Forms: react-hook-form + zod** (zod schemas already needed server-side; reuse them).
- *Untitled UI* is fine as a **Figma reference** for higher-fidelity mockups, not as the build foundation.

**Rule:** never hand-roll a component shadcn provides. Extend, don't reinvent. New shared components live in a documented internal library.

---

## 2. Design principles (in priority order)

1. **Legibility before beauty.** If a number is hard to scan, the design failed. Optimise for the 200th row, not the screenshot.
2. **Density with air.** Show enough to work without scrolling endlessly, but use whitespace and grouping so dense ≠ cramped.
3. **Consistency is the feature.** Same action, same label, same place, every screen. People learn the product once.
4. **The Project is the home.** The Project Detail page is the most-used surface — it gets the most design care (§6).
5. **Right device, right design.** A field screen is not a shrunk desktop screen (§7).
6. **Speed of entry.** Every keystroke and tap the field force avoids is adoption earned. Defaults, voice, and smart pre-fill everywhere.
7. **Trustworthy, not flashy.** This is software an IPO auditor may see. Calm, precise, professional. No gratuitous motion or gradients.
8. **States are first-class.** Empty, loading, error, and success are designed, not afterthoughts (§8).

---

## 3. Tokens

### Color — grounded in stone & concrete, one restrained accent
Warm-tinted neutrals (not cold corporate grey) evoke Vyara's material world; a single confident accent carries actions. *Swap `--primary` for Vyara's exact brand hex once confirmed.*

```
/* Neutrals — warm stone scale */
--bg            #FAF9F7   /* app background (warm off-white) */
--surface       #FFFFFF   /* cards, tables, sheets */
--surface-muted #F3F1ED   /* subtle fills, headers, hover */
--border        #E5E2DC   /* hairline borders */
--text          #1C1B19   /* primary ink (near-black, warm) */
--text-muted    #6B6862   /* secondary text */
--text-subtle   #9A968E   /* tertiary, placeholders */

/* Primary — confident, high-contrast, accessible (replace with brand) */
--primary       #1F5E55   /* deep kiln teal — trustworthy, not cliché blue */
--primary-hover #18504A
--primary-fg    #FFFFFF

/* Semantic */
--success       #2F855A
--warning       #B7791F
--danger        #C0392B
--info          #2B6CB0
/* each with a -bg (10–12% tint) for badges/alerts */
```

Use the accent **sparingly** — primary buttons, active nav, key links, focus. Status lives in semantic colors, never the accent. Most of the UI is neutral; that restraint *is* the professionalism.

### Typography
```
UI / body:   Inter or Geist  — chosen for legibility in dense tables at 13–14px
Display:     same family, tighter tracking at large sizes (no separate display face —
             this is a tool, not a brochure; one family = cohesion)
Numbers:     ALWAYS tabular figures (font-variant-numeric: tabular-nums) for money,
             quantities, dates, ageing — columns must align. This is non-negotiable
             in a CRM full of figures.
Mono:        Geist Mono / IBM Plex Mono for IDs, codes, GSTIN, invoice numbers.
```
Type scale (rem): 0.75 / 0.8125 / 0.875 (base UI) / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25. Weights: 400 body, 500 labels/UI, 600 headings. Line-height 1.5 body, 1.2 headings.

### Spacing, radius, elevation
- **Spacing:** 4px base → 4 / 8 / 12 / 16 / 24 / 32 / 48. Consistent rhythm; don't freestyle.
- **Radius:** 8px default (`--radius`), 6px inputs, 12px cards/sheets, full for pills/avatars.
- **Elevation:** enterprise tools lean on **borders + subtle shadows**, not heavy drop-shadows. Two levels: `sm` (cards) and `md` (popovers/sheets). Flat by default.
- **Focus ring:** 2px `--primary` at 40% + 2px offset. Always visible — keyboard users are power users here.

---

## 4. Layout & app shell

- **Desktop:** persistent left sidebar (collapsible) + top bar (global search, notifications, profile) + content. Max content width on dashboards; tables go full-width.
- **Tablet (warehouse/dispatch):** condensed sidebar or top tabs, larger touch targets, scan/POD flows front-and-centre.
- **Mobile (field):** bottom tab bar (Today · Projects · Quick-Add · Search · Me), no sidebar, single-column, sheets over modals.
- **Grid:** 12-col desktop, 8-col tablet, 4-col mobile; 16–24px gutters.

---

## 5. Core component patterns

**Data table (the workhorse).** Sticky header, zebra-free with hairline row borders, right-aligned tabular numbers, column sort, **saved views**, a persistent filter bar, density toggle (comfortable/compact), row selection + bulk actions, and a row-click → detail. Always paginate or virtualise; never dump 1,000 rows raw. Empty/loading/error states required.

**Cards.** Entity cards (summary + status badge + key facts + quick actions), KPI cards (label + tabular number + delta), grouped by clear headings. No nested cards-in-cards.

**Forms.** Logical sections, labels above fields, inline validation on blur (tied to zod/Business Rules), sensible defaults and pre-fill, clear primary action, keyboard-navigable, autosave drafts where the flow is long (quotes). Required fields marked; errors say what to fix.

**Badges & status.** Pill badges in semantic colors with a text label (never color alone — accessibility). One status vocabulary across the product, defined in masters.

**Stage stepper.** Horizontal on desktop, compact on mobile; shows current stage, allows valid transitions only (driven by the workflow engine), requires a remark on advance.

**Kanban.** For pipeline-by-stage views; cards draggable where a transition is valid; column = pipeline stage from the active template.

**Timeline / activity feed.** The common spine (Constitution §3) rendered consistently on every core object: chronological, typed icons (created/assigned/advanced/document/message/call/AI-action), expandable entries.

**Scannable project-progress header.** The canonical project-state component — one read-model assembled from domain events, rendered on the Project Detail header, the projects list (as a status dot), the dashboard, and mobile Today. Encodes three things at once so a viewer understands the whole project at a glance:

- **POSITION** — a macro stepper rendered from `pipeline_template` stages: done / current / upcoming. Data-driven, never hardcoded.
- **HEALTH** — the active segment's colour is `on-track` (green) / `needs-attention` (amber) / `blocked` (red), rolled up into a single status pill on the header **and** a matching dot in the list/dashboard views. Computed by one rule: blocked gate → red; overdue task or stalled-too-long → amber; else green. Same rule everywhere — no module-specific drift.
- **COMPLETENESS** —
  - the active stage expands into its sub-pipeline (a second, finer stepper from `pipeline_substage`);
  - **gates** (required documents + required fields, declared on the stage/substage in the `gate_requirement` master) render as done / blocked chips; a missing required doc shows as a red gate without the user opening the Documents tab;
  - **phased mini-bars** read from child records, not flags — dispatch: "3 of 5 tranches"; billing: "₹25.2L of ₹42L · 60%"; reservation: "8 of 10 lines reserved";
  - the **next action** surfaces as a task banner — who · what · due.

**Architecture rule (load-bearing).** All cross-module reads needed for the project header — sales_order, dispatch, invoice, stock_reservation, and their line tables — go **only through the project-progress read-model assembler** (`lib/read-models/project-progress.ts`). The header component itself, the list-view status dot, the dashboard tile, and the mobile Today card all receive one assembled object; **no other component or module reads cross-module on the project's behalf**. New modules (Complaints, Tenders, batch tracking) surface in the header by extending the assembler with one more query — never by adding direct table reads in a UI component. Consistent with Constitution Principle #0; see `docs/adr/0001-project-progress-read-model.md` for the full review rule.

**States.** Empty (project just created, no stages advanced) — show the macro stepper at stage 1 with all-green and a "Start" CTA. Loading — skeleton the stepper rail and the mini-bars individually so the rest of the header doesn't jank. Error — fall back to a degraded view showing position + a "could not load progress detail" banner rather than blocking the whole project page.

**Accessibility.** Health is *never* color-only — the pill carries a text label ("Blocked: drawing approval missing"), and the list-view dot is paired with the same label as a tooltip + aria-label. Tabular figures on the mini-bar numbers.

---

## 6. The Project Detail hub (signature surface)

The most-used screen — design it best. **Header:** the scannable project-progress component (§5) — POSITION + HEALTH + COMPLETENESS in one place — plus project name, segment, owner, value, key actions. Tabbed body: **Overview · Stakeholders · Specifications · Samples · Quotes · Orders · Documents · Timeline · Tasks.** Right rail (desktop): next actions, key dates, AI suggestions. On mobile, tabs collapse to a scrollable segmented control; the right rail moves inline; the macro stepper compresses to dots-with-current-label and the sub-stepper appears below. Everything a user needs about a project is reachable here without hunting.

---

## 7. Device-tier rules

| | Mobile (field) | Tablet (warehouse) | Desktop (mgmt/inside sales) |
|---|---|---|---|
| Targets | ≥44px, thumb-zone | ≥40px | mouse-precise OK |
| Nav | bottom tabs | top tabs / condensed rail | sidebar |
| Overlays | sheets (bottom) | sheets/dialogs | dialogs/popovers |
| Density | low, one task at a time | medium | high, multi-pane |
| Entry | **voice-first**, pre-fill, minimal typing | scan/tap | keyboard + shortcuts |
| Offline | tolerant, clear sync state | tolerant | online assumed |

Field-first specifics: large "Log visit (voice)" affordance, quick-quote and sample-request in ≤3 taps, offline/sync banner, never block on a spinner — optimistic UI with reconciliation.

---

## 8. State & interaction patterns

- **Loading:** skeletons for content (not spinners) on first load; inline spinners only for in-place actions.
- **Empty:** a sentence of direction + the primary action. "No quotes yet. Create the first quote for this project." Never a blank panel.
- **Error:** plain cause + fix, in the product's voice, with a retry. Never a raw stack trace; never an apology.
- **Success:** toast that names what happened ("Quote sent"), matching the button verb ("Send quote").
- **Confirmation:** only for destructive or irreversible actions; name the consequence.
- **Optimistic updates** for field actions; reconcile on sync.
- **Motion:** functional only — 150–200ms ease for enter/exit, respect `prefers-reduced-motion`. No decorative animation.

---

## 9. AI UI pattern (consistent everywhere)

AI output uses one recognisable treatment: a subtly marked **AI suggestion card** (small spark/AI glyph, muted accent border) showing the suggestion + a one-line rationale, with **Accept · Edit · Reject** actions. Per Constitution §7, nothing AI-generated touches a customer without a human action. Draft state is always visually distinct from sent/committed. Voice-note transcripts show as editable structured fields, not raw text.

---

## 10. Microcopy & content

- Write from the **user's** side: name things by what people do ("Log payment", "Request sample"), not system terms.
- **Active voice, sentence case, plain verbs.** "Save changes", not "Submit".
- An action keeps its name through the flow: button "Send quote" → toast "Quote sent".
- Errors explain and direct; empties invite action; labels label and nothing does double duty.
- Keep it simple and unambiguous for a multilingual Surat user base — clarity over cleverness. English UI, plain words.

---

## 11. Accessibility floor (non-negotiable)

WCAG 2.1 AA: text contrast ≥4.5:1 (large ≥3:1); status never by color alone; visible keyboard focus everywhere; full keyboard operability (Radix handles most); proper labels/aria; 44px mobile targets; `prefers-reduced-motion` respected. Pre-IPO software should pass an accessibility review without scramble.

---

## 12. Do / Don't

**Do:** use tabular figures for all numbers · lean on neutrals + borders · design every state · keep one status vocabulary · make the field flow voice-first · extend shadcn, don't reinvent.

**Don't:** color-only status · decorative gradients/animation · nested cards · raw error dumps · shrink desktop layouts onto mobile · introduce a second icon set or font family · block the field user on a spinner · let two elements do the same job.

---

## How to use this in the build

Add `design.md` to the **read-first set** in every UI-related prompt (alongside `CONSTITUTION.md`). In the UX prompt (Prompt 4) and any component/screen work, instruct Claude Code to derive all visual and interaction decisions from this file and to flag — not silently override — anything it needs to deviate from. Set the tokens in §3 as the shadcn theme (`globals.css` CSS variables + `tailwind.config`) before building any screen, so every component inherits them from day one.
