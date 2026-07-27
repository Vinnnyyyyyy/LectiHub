# Handoff: LectiHub redesign → existing Vue 3 codebase

## Overview
A full IA + visual redesign of LectiHub (class scheduling for a learning center): 20 screens
across Admin (9), Teacher (5), Student (4) and Auth (2). The central IA change is
**timetable-first**: the week grid is the admin's workspace, and unassigned booking requests
live in a drawer that is dragged onto slots — replacing the current tabbed
"review queue → detail pane" flow.

The target codebase is the attached repo: Vue 3 + TypeScript + Vite + Pinia + vue-router,
with an Express/better-sqlite3 API in `LectiHub-server/`.

## About the design files
The HTML in `designs/` is a **design reference**, not production code. Each file is a board of
full-size screen frames (1400×900 for desktop) built with inline styles. Do not copy the markup
into the app. Recreate each screen as a Vue SFC using the repo's existing patterns (Pinia stores,
`src/api/axios.ts`, scoped styles + the shared `--lh-*` token layer).

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and copy are final. Recreate pixel-faithfully.
Interaction states (hover, drag, empty, error) are described below but only partially drawn —
implement them from this README.

---

## The good news: the token layer already exists
`src/assets/theme.css` already centralizes the palette as `--lh-*` custom properties, and
`src/assets/dashboard.css` consumes them. **Step 1 of integration is replacing the values in
one file** — the whole app re-themes with zero component edits. Use
`tokens/theme.css` in this bundle as a drop-in replacement (same variable names, new values,
plus new names the redesign needs).

Two things in the current CSS actively fight the new look and must be removed, not re-themed:

1. `--lh-atmosphere` (three stacked radial/linear gradients) and the `.dashboard .atmosphere`
   fixed div. The redesign is flat: page void `#040506`, app surface `#07080a`. Delete the
   `<div class="atmosphere">` from all three dashboards.
2. `--lh-dash-max: 68rem` — the redesign is a full-bleed workspace, not a centered column.
   The rail is fixed 64px; content fills the rest.

Also drop the frosted-panel look: `--lh-panel: rgba(28,34,42,.88)` + `backdrop-filter: blur(14px)`
+ `--lh-shadow: 0 24px 60px`. In the redesign, regions are separated by **1px hairlines**
(`rgba(255,255,255,0.06)`) on a single flat surface. Card grids are built as a
`display:grid; gap:1px; background:<line>` container whose children are `background:#07080a` —
that is how the stat strips get their exact 1px dividers.

---

## Design tokens

### Color
| Token | Value | Use |
|---|---|---|
| `--lh-void` | `#040506` | Page behind the app frame |
| `--lh-bg` | `#07080a` | App surface, cards, panels |
| `--lh-rail` | `#0a0b0d` | Left icon rail, drawers |
| `--lh-bg-elevated` | `#0f1114` | Hovered rows, popovers |
| `--lh-input` | `#0d0f12` | Field fill |
| `--lh-chip` | `#1a1f24` | Avatar / neutral chip fill |
| `--lh-ink` | `#f4f6f5` | Primary text |
| `--lh-muted` | `rgba(244,246,245,0.56)` | Secondary text |
| `--lh-faint` | `rgba(244,246,245,0.42)` | Meta, inactive rail icons |
| `--lh-dim` | `rgba(244,246,245,0.34)` | Eyebrows, labels |
| `--lh-ghost` | `rgba(244,246,245,0.28)` | Placeholders, ⌘K hint |
| `--lh-line` | `rgba(255,255,255,0.06)` | Hairline dividers |
| `--lh-line-strong` | `rgba(255,255,255,0.09)` | Frame border |
| `--lh-line-inset` | `rgba(255,255,255,0.08)` | `inset 0 0 0 1px` control outline |
| `--lh-accent` | `#8fdcbb` | Sage — the only accent |
| `--lh-accent-hover` | `#b6ebd3` | Link/icon hover |
| `--lh-accent-soft` | `rgba(143,220,187,0.11)` | Active nav wash, selected slot |
| `--lh-accent-edge` | `rgba(143,220,187,0.16)` | `inset 0 0 0 1px` on active nav |
| `--lh-on-accent` | `#06110c` | Text on a sage-filled button |
| `--lh-warm` | `#d9b478` | Amber — pending / awaiting review |
| `--lh-warm-soft` | `rgba(217,180,120,0.14)` | Pending badge fill |
| `--lh-danger` | `#e8917f` | Rose — overdue / conflict / destructive |
| `--lh-danger-soft` | `rgba(232,145,127,0.14)` | Conflict badge fill |

Status colors are **only** amber and rose. Sage is never a status; it's the interaction accent.
Never introduce a fourth hue.

### Typography
- Display: **Fraunces** — weights 400 / 500 / 600, `letter-spacing: -0.025em` to `-0.035em`.
  Used for page titles, big numbers, and section headings only.
- UI: **Manrope** — 400 / 500 / 600 / 700 / 800.
- Base `font-size: 15px`, `line-height: 1.55`, `font-variant-numeric: tabular-nums` on
  `html, body` (tabular figures matter — this app is wall-to-wall times and counts).

| Role | Family / size / weight |
|---|---|
| Board title | Fraunces 44px / 400 / `-0.035em` |
| Screen title (h1) | Fraunces 29px / 500 / `-0.025em` |
| Section heading (h2) | Fraunces 20px / 500 |
| Stat number | Fraunces 34px / 400 / `-0.03em` |
| Eyebrow / label | Manrope 9.5–10.5px / 800 / `0.14em` / uppercase |
| Column head | Manrope 12px / 800 / `0.1em` / uppercase |
| Body | Manrope 15px / 400 |
| Dense row text | Manrope 12.5–13px / 400–600 |
| Control label | Manrope 12.5px / 700 |

Font loading is already correct in the repo (Fraunces + Manrope). Verify the `<link>` in
`index.html` requests `Fraunces:opsz,wght@9..144,400;500;600` and `Manrope:wght@400;500;600;700;800`.

### Radius, spacing, motion
- Radii: frame `12px`, card group `10px`, rail item / tile `8px`, control `7px`, pill `999px`.
  (Replaces the current rem-based `--lh-radius-*`; keep the token names, change the values.)
- Spacing scale: 5 / 7 / 9 / 12 / 14 / 18 / 22 / 24 / 44px. Screen padding `22px 24px`;
  header `18px 24px 14px`.
- Control heights: 31px (compact toolbar), 38px (rail item), 44px (touch target, mobile only).
- Motion: 0.18s ease for color/border/transform on controls; nothing longer. No entrance
  animations on panels — delete `lh-fade-down`.

---

## The shell (build this once, use everywhere)

Replaces the current `.dash-topbar` + `role="tablist"` pattern in all three dashboards.

**`AppRail.vue`** — 64px fixed column, `background: var(--lh-rail)`,
`border-right: 1px solid var(--lh-line)`, `padding: 18px 0 14px`, `gap: 5px`, centered.
- Wordmark: Fraunces "L", 24px / 600, `var(--lh-accent)`, 26px tall, 14px bottom margin.
- Item: 38×38, `border-radius: 8px`, 17px stroke icon (`stroke-width: 1.4`, `viewBox="0 0 16 16"`).
  Inactive `color: var(--lh-faint)`; active `background: var(--lh-accent-soft)`,
  `color: var(--lh-accent)`, `box-shadow: inset 0 0 0 1px var(--lh-accent-edge)`.
- Badge dot: 6px circle, `var(--lh-warm)`, absolute `top:5px; right:5px` — on Requests when the
  queue is non-empty.
- Footer: 30px circle avatar, `var(--lh-chip)` fill, initials Manrope 11px / 800 / `var(--lh-accent)`.
  Click → menu with Log out (the current top-right "Log out" button moves here).
- Every item needs a `title`/`aria-label` — icons are unlabeled by design; add a tooltip on hover.

Reference implementation: `components/AppRail.vue` (icon paths included, driven by a nav array
so each role passes its own items). Extracted from `designs/` — the SVG paths are exact.

**`AppShell.vue`** — `display:flex`; `<AppRail>` + a `min-width:0` column containing a sticky
header and `<router-view>`. Header: `18px 24px 14px`, `border-bottom: 1px solid var(--lh-line)`,
`align-items: flex-end`; left = eyebrow (date · center name) + Fraunces h1; right =
search field (220×31, `inset 0 0 0 1px var(--lh-line-inset)`, ⌘K hint) + one sage primary action.

---

## Routing: sections become routes

Today each dashboard holds every section in one SFC and toggles with `v-show` + `activeSection`
(`AdminDashboard.vue` is 1358 lines). The rail navigates, and deep links / back-button need to
work, so make sections **child routes**. Keep the existing `beforeEach` role guard as-is; it
already works on the parent `meta.role`.

```ts
{
  path: '/admin',
  component: () => import('../views/admin/AdminShell.vue'),
  meta: { requiresAuth: true, role: 'admin' },
  children: [
    { path: '', redirect: '/admin/timetable' },
    { path: 'overview',      component: () => import('../views/admin/OverviewView.vue') },
    { path: 'timetable',     component: () => import('../views/admin/TimetableView.vue') },
    { path: 'requests',      component: () => import('../views/admin/RequestsView.vue') },
    { path: 'people',        component: () => import('../views/admin/PeopleView.vue') },
    { path: 'courses',       component: () => import('../views/admin/CoursesView.vue') },
    { path: 'reports',       component: () => import('../views/admin/ReportsView.vue') },
    { path: 'announcements', component: () => import('../views/admin/AnnouncementsView.vue') },
    { path: 'audit',         component: () => import('../views/admin/AuditView.vue') },
    { path: 'settings',      component: () => import('../views/admin/SettingsView.vue') },
  ],
}
```

Teacher: `week` (default), `session/:classId`, `report/:classId`, `records`, `hours`.
Student: `week` (default), `book`, `homework`.
`scrollBehavior` currently forces `top: 0` on every navigation — scope that to auth routes; the
workspace panes scroll internally.

---

## Screen map: design → existing files

### Admin — `designs/admin.html`
| # | Screen | Purpose | Build from |
|---|---|---|---|
| 01 | Overview | Morning triage: 4-up stat strip (awaiting review · classes this week · attendance · reports overdue), today's classes, needs-attention list | `AdminMonitoringPanel.vue` + new stat strip |
| 02 | **Timetable** | The workspace. Week grid Mon–Sat × time rows; unassigned-request drawer on the right; drag a request onto a slot to assign | `CalendarPanel.vue` + `CalendarGrid.vue` (major rework) |
| 03 | Requests | Full review & assign: list + detail with preferred slots, teacher suggestions, approve/decline | the inline `.review-workspace` in `AdminDashboard.vue` |
| 04 | People | Teachers & students table, role filter, capacity per teacher, invite | `AdminUsersPanel.vue` |
| 05 | Courses | Courses + learning materials per course | **new** (no route/store today) |
| 06 | Reports & feedback | Lesson reports in/overdue, student feedback | `AdminReportsFeedbackWorkspace.vue`, `LessonReportsPanel.vue` |
| 07 | Announcements | Compose + sent list, audience targeting | `NotificationsPanel.vue` |
| 08 | Audit log | Chronological action log, actor + target + time | **new** |
| 09 | Settings | Center hours, slot length, roles, billing/receipts | `AdminPaymentReceiptsPanel.vue` + **new** |

### Teacher — `designs/teacher.html`
| # | Screen | Build from |
|---|---|---|
| 01 | My teaching week | `UpcomingClassesPanel.vue` |
| 02 | In session | `ConductLessonPanel.vue` (+ `ClassChatWidget.vue`, restyled) |
| 03 | Lesson report | `LessonReportFormPanel.vue` |
| 04 | Records | `LessonReportsPanel.vue` + `ClassHistoryPanel.vue` |
| 05 | Open hours & calendar sync | `TeacherAvailabilityPanel.vue` + `CalendarConnectionsPanel.vue` |

### Student — `designs/student.html`
| # | Screen | Build from |
|---|---|---|
| 01 | My week | `UpcomingClassesPanel.vue` |
| 02 | Book a class | `ScheduleBookingSection.vue` (+ `constants/timeSlots.ts`) |
| 03 | Homework & grades | `StudentHistoryWorkspace.vue`, `StudentFeedbackPanel.vue` (+ **new** homework model) |
| 04 | Mobile | responsive treatment of 01–03; rail collapses to a bottom tab bar, 44px targets |

### Auth — `designs/auth.html`
| # | Screen | Build from |
|---|---|---|
| 01 | Log in | `LoginView.vue` |
| 02 | Create a student account | `RegisterView.vue` (+ `FreeTrialView.vue` shares the shell) |

Split-screen: left = form column on `--lh-bg`, right = flat sage-tinted panel with the wordmark
and one line of positioning copy. No gradient, no imagery.

### Delete on the way through
`HelloWorld.vue`, `TheWelcome.vue`, `WelcomeItem.vue`, `components/icons/*` (Vue scaffold),
`views/AboutView.vue`, `stores/counter.ts`. `HomeView.vue` is unrouted — remove or repurpose as
the marketing page.

---

## Interactions & behavior

**Timetable drag-to-assign (02) — the one genuinely new interaction.**
- Drawer request cards are `draggable="true"`; use HTML5 DnD (`dataTransfer.setData`) or
  pointer events — no new dependency needed.
- On dragover a slot: if the teacher is free, `background: var(--lh-accent-soft)` +
  `inset 0 0 0 1px var(--lh-accent-edge)`. If it collides, `--lh-danger-soft` + rose hairline and
  block the drop.
- On drop: optimistic insert, then `POST` the assignment; on failure roll back and surface a rose
  inline error on the card. The existing `adminSchedule` store owns this state.
- Slot height maps to the center's slot length (`constants/timeSlots.ts`); 1 row = 1 slot.
- Keyboard path required: select a request, then arrow to a slot and Enter to assign.

**Everything else**
- Hover on rows: `background: var(--lh-bg-elevated)`, 0.18s ease. Never move rows on hover.
- Long lists are capped with an "N more" affordance rather than scrolling inside cards.
- Loading: skeleton hairline rows, not spinners — keep the existing `loadingRequests` flags.
- Empty states: one line of `--lh-muted` copy, no illustration.
- Destructive actions confirm inline (row expands), never in a modal.
- Focus ring: `box-shadow: 0 0 0 1px var(--lh-accent)` — visible on every control.

## State management
No new stores needed for phases 0–2; the redesign maps onto the existing Pinia stores
(`auth`, `adminSchedule`, `schedule`, `classes`, `availability`, `calendar`, `users`,
`lessonReports`, `studentFeedback`, `notifications`, `paymentReceipts`, `chat`,
`adminMonitoring`). Add per-role nav state to the shell component, not a store — the route is
the source of truth.

Phase 3 screens need backing that doesn't exist yet. `LectiHub-server/routes/` has no courses,
materials, audit, or homework routes, so:
- `courses` store + `/api/courses`, `/api/courses/:id/materials`
- `audit` store + `/api/admin/audit`
- homework/grades on the student side — likely an extension of `lessonReportRoutes` rather than
  a new resource. Confirm the data model before building screens 05 / 08 / student 03.

---

## Suggested sequence
1. **Retheme (hours).** Drop in `tokens/theme.css`, remove `.atmosphere`, unset `--lh-dash-max`,
   flatten `--lh-panel`/shadow/blur in `dashboard.css`. The current app now reads as the new
   design system. Ship this alone if you want an early win.
2. **Shell (1–2 days).** Add `AppRail.vue` + `AppShell.vue`, convert the three dashboards to
   nested routes, move Log out into the rail avatar menu. Sections still render their current
   markup inside the new frame.
3. **Port panel by panel.** Work down the screen map; each existing panel becomes a route view
   restyled to the reference. Start with Admin 01/03/04 — highest reuse.
4. **Timetable + new screens.** Rework `CalendarGrid.vue` into the drag-to-assign week grid,
   then Courses / Audit / Settings once the API exists.

## Assets
None. All icons are inline 16px-grid SVG strokes defined in `components/AppRail.vue` and the
reference HTML — no icon library, no images. Fonts come from Google Fonts (already wired).

## Files in this bundle
- `designs/admin.html` — 9 admin screens
- `designs/teacher.html` — 5 teacher screens
- `designs/student.html` — 4 student screens (incl. mobile)
- `designs/auth.html` — 2 auth screens
- `tokens/theme.css` — drop-in replacement for `src/assets/theme.css`
- `tokens/ui.css` — optional shared primitives (frame, hairline grid, chips, buttons, fields)
- `components/AppRail.vue` — reference implementation of the rail
- `components/AppShell.vue` — rail + sticky header + `<router-view>`

Open the `designs/*.html` files in a browser; they are self-contained.
