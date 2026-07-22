# E-Scheduler

**Product specification & design brief**

E-Scheduler is a learning-center platform for scheduling classes, running sessions, tracking attendance and progress, and keeping students, teachers, parents, and admins aligned in one place.

This document describes the product from scratch: who uses it, what they see, what they can do, and how it should feel. It is intentionally **not** a technical implementation plan.

---

## 1. Product vision

### Problem
Learning centers juggle spreadsheets, chat apps, calendars, and paper for schedules, attendance, homework, and parent updates. Information is scattered; confirmations get lost; teachers and admins spend time coordinating instead of teaching.

### Solution
One calm workspace where:

- Students request and attend classes
- Teachers run lessons and record outcomes
- Parents stay informed without chasing updates
- Admins confirm schedules, assign teachers, and monitor the center

### Design principles (product)
1. **One primary job per screen** — don’t bury the next action
2. **Role-aware, not role-identical** — same brand language, different priorities
3. **Schedule is the spine** — calendar and class status should always be easy to find
4. **Confirmations over chaos** — every booking, change, or cancellation leaves a clear trail
5. **Quiet by default** — notify when it matters; don’t spam
6. **Works on phone first** — admins and teachers will open this between classes

---

## 2. User roles

| Role | Who | Primary goal |
|------|-----|--------------|
| **Admin / Center manager** | Front desk, academic lead, owner | Confirm requests, assign teachers, oversee operations |
| **Teacher** | Instructors | See today’s classes, conduct lessons, report & grade |
| **Student** | Learners | Request schedule, join class, submit work & feedback |
| **Parent / Guardian** | Linked to one or more students | Follow schedule, attendance, progress, and messages |
| **Staff / Coordinator** *(optional)* | Non-teaching ops | Help with scheduling without full admin powers |
| **Super-admin** *(optional multi-center)* | Platform operator | Manage centers, branding, global settings |

### Role relationships
- A **parent** can be linked to multiple **students**
- A **student** may have zero, one, or two parents on the account
- A **teacher** owns a subject profile, availability, and workload
- An **admin** can act across all students/teachers in their center
- **Staff** can review requests and send reminders, but not change center-wide settings

### Account states
- Invited → Active → Suspended → Archived
- Students can self-register or be invited by admin/parent
- Parents join via invite link tied to a student profile

---

## 3. Information architecture (pages / screens)

### Public / auth
| Screen | Purpose |
|--------|---------|
| Landing (optional) | Short explanation of the center + CTA to log in / register |
| Login | Email/username + password (and optional SSO later) |
| Register (student) | Create student account |
| Invite accept | Parent / teacher / staff completes invite |
| Forgot / reset password | Recovery flow |
| Verify email | Optional confirmation step |

### Shared (all signed-in roles)
| Screen | Purpose |
|--------|---------|
| Home / Dashboard | Role-specific “what needs attention” |
| Notifications center | All alerts, reminders, and system messages |
| Messages / Inbox | Conversations (1:1 and small groups) |
| Profile | Personal details, avatar, contact info |
| Settings | Preferences, password, notification toggles, calendar sync |
| Help / Support | FAQs, contact center |

### Admin
| Screen | Purpose |
|--------|---------|
| Operations dashboard | Queue counts, today’s classes, alerts |
| Schedule requests | Pending / approved / rejected requests |
| Request review & assign | Slot picker + teacher matching |
| Master calendar | Center-wide calendar (all classes) |
| People — Students | Directory, status, linked parents |
| People — Teachers | Directory, subjects, availability, workload |
| People — Parents | Directory and linked students |
| Courses & subjects | Catalog of offerings |
| Class sessions | List/detail of scheduled sessions |
| Attendance overview | Center attendance trends |
| Assignments overview | Cross-class homework status |
| Grades overview | Progress snapshots |
| Reports library | Lesson reports, feedback, ops reports |
| Monitoring / analytics | Scheduling health, completion rates |
| Center settings | Hours, rooms/meeting defaults, policies |
| Integrations | Calendar, video, email providers |

### Teacher
| Screen | Purpose |
|--------|---------|
| Teaching dashboard | Today / upcoming, prep cues |
| My calendar | Personal teaching schedule |
| Class detail | One session: join, conduct, notes |
| Conduct lesson | Attendance, participation, curriculum, recording |
| Lesson report form | Post-class report |
| My courses / classes | Ongoing groups or recurring series |
| Assignments | Create, collect, review submissions |
| Grades | Enter / update scores and comments |
| Students (roster) | Learners assigned to this teacher |
| Availability | Weekly hours and blocked times |
| Teaching history / archive | Completed & archived sessions |

### Student
| Screen | Purpose |
|--------|---------|
| Learning dashboard | Next class, tasks due, alerts |
| Request schedule | Preferred slots + remarks |
| My requests | Status of booking requests |
| My calendar | Upcoming approved classes |
| Join class | Meeting entry for live session |
| Courses | Enrolled subjects / series |
| Assignments & homework | To-do, submit, feedback received |
| Grades / progress | Scores and teacher comments |
| Lesson reports (read) | What was covered after class |
| Feedback | Rate/comment after a report |
| Learning history | Archived completed classes |

### Parent
| Screen | Purpose |
|--------|---------|
| Family dashboard | Child switcher + what’s next |
| Children’s schedules | Calendars per linked student |
| Attendance | Present / late / absent history |
| Progress | Grades, reports, teacher remarks |
| Messages | Contact teacher / center |
| Billing summary *(optional)* | Upcoming fees / receipts if enabled |
| Permissions & preferences | Which alerts they want |

---

## 4. Dashboards (by role)

### Admin — “Center operations”
**Above the fold**
- Pending schedule requests (count + list entry)
- Today’s classes (in progress / starting soon)
- Urgent alerts (unassigned confirmed slots, missing reports)

**Secondary**
- This week’s booking volume
- Attendance snapshot
- Recent lesson reports & student feedback

**UX note:** Monitoring and deep analytics stay one click away — not dumped into the first screen.

### Teacher — “Today”
- Next class card (time, student, join / conduct CTA)
- Upcoming list for the day
- Incomplete lesson reports
- Assignments waiting for review

### Student — “Up next”
- Next session with join state
- Open schedule request status
- Homework due soon
- New lesson report / feedback prompt

### Parent — “Family today”
- Child selector
- Each child’s next class
- Attendance flags (absences this week)
- New messages or progress notes

---

## 5. Feature areas

### 5.1 Scheduling & calendar

**Core flows**
1. Student (or parent on behalf of student) submits preferred slots + remarks
2. Admin reviews availability and assigns a teacher
3. System confirms class: date, time, duration, subject, meeting link/info
4. Student & teacher calendars update; notifications go out
5. Reminders fire before class (e.g. 24h and 1h)
6. Reschedule / cancel with reason and re-notification

**Calendar views**
- Day / week / month
- Role filters (my classes vs center-wide for admin)
- Color by status: requested → scheduled → in progress → completed → cancelled → archived
- List view for mobile-friendly scanning

**Availability**
- Teachers set weekly recurring availability + exceptions
- Admins see conflicts before assigning
- Optional room / resource booking (physical classroom or online only)

**Recurring classes**
- Weekly series with exceptions (holiday skip, single-date move)
- Series-level vs single-session edits

### 5.2 Courses & classes

**Course / subject**
- Name, description, level, default duration
- Materials outline (optional)
- Assigned default teachers

**Class session**
- Linked course/subject
- Teacher + student(s)
- Schedule window + meeting provider/link
- Status lifecycle: `scheduled` → `in progress` → `completed` → `archived` (after report + feedback when required)
- Curriculum plan field for the session

**Group classes** *(optional phase)*
- Multiple students, shared time, shared attendance roster

### 5.3 Conducting a lesson (live class)

Teacher tools during / around class:
- Join online meeting (Meet / Zoom / Jitsi, etc.)
- Mark **attendance** (present, late, absent, excused)
- Note **participation** level + short comment
- Track **curriculum coverage** / pages
- Attach **recording link**
- Mark lesson **complete**

Student tools:
- Join when window opens
- See meeting info and reminders

### 5.4 Attendance

- Per-session attendance status
- Teacher enters during/after class; admin can override with audit note
- Parent/student visibility into history
- Admin reports: present rate, chronic lateness, absences by student/teacher
- Optional attendance reminders to parents when marked absent

### 5.5 Assignments, homework & grades

**Assignments**
- Teacher creates assignment linked to course or session
- Due date, instructions, attachments
- Student submits text / file / link
- Teacher reviews: complete / incomplete / needs revision + comment
- Parent can view status (not necessarily edit)

**Homework from lesson reports**
- Homework field on lesson report can auto-create a lightweight task for the student

**Grades**
- Numeric or scale-based scores (configurable per center)
- Rubric optional
- Gradebook per course: assignments + assessments
- Progress comments visible to student/parent
- Admin export for reporting periods

### 5.6 Messaging & notifications

**Notifications** (system-generated)
- Schedule submitted / approved / rejected
- Teacher assigned
- Class reminders
- Lesson report published
- Feedback requested
- Assignment due / graded
- Attendance marked absent
- Message received

**Channels**
- In-app notification center (required)
- Email (required for confirmations)
- Optional push / SMS later

**Messaging**
- Student ↔ teacher (about a class/course)
- Parent ↔ teacher / admin
- Admin announcements to a role or course cohort
- Attach context: link to a class, assignment, or request
- Mute / notification preferences per conversation type

**Rules of thumb**
- Transactional events always notify
- Marketing-style noise never appears in the core product

### 5.7 Reports & feedback

**Lesson report** (teacher → student/parent/admin)
- Date/time, topic, pages, attendance, homework, remarks, progress notes

**Student feedback** (student → teacher/admin)
- After report: rating, comments, suggestions, learning experience

**Ops reports** (admin)
- Scheduling funnel (requests → approvals → completed classes)
- Teacher workload
- Attendance summary
- Assignment completion rates
- Feedback scores

**Archive rule**
- When both lesson report and required feedback exist, session can move to completed/archived history for clean dashboards

### 5.8 Profiles & people

- Avatar, name, contact, timezone
- Teacher: subjects, bio, workload indicators
- Student: level, enrolled courses, linked parents
- Parent: linked children, preferred contact method
- Emergency contact fields (optional)

### 5.9 Settings

**User settings**
- Password / security
- Language & timezone
- Notification preferences (per event type + channel)
- Calendar sync connections
- Appearance: light / dark / system

**Center settings (admin)**
- Center name, logo, contact
- Working hours & blackout dates
- Default class duration & meeting provider
- Policies: cancellation window, feedback required yes/no
- Grade scale
- Role permissions for staff

### 5.10 Integrations

| Integration | Why |
|-------------|-----|
| Google Calendar / Outlook | Two-way or export of confirmed classes |
| Google Meet / Zoom / Jitsi | Online classroom links |
| Email provider | Confirmations & reminders |
| File storage | Assignment attachments & materials |
| SMS gateway *(later)* | High-priority reminders |
| Payment *(optional later)* | Tuition invoices for parents |

Integrations screen should show connection status, last sync, and disconnect — not a wall of developer jargon.

### 5.11 Other valuable features

- **Waitlist** when preferred slots are full
- **Substitute teacher** flow when assignee is unavailable
- **Holiday calendar** that blocks booking
- **Materials library** per course
- **Certificates / completion badges** for finished courses
- **Audit log** for admin (who approved, reassigned, edited grades)
- **Multi-child parent switcher** without re-login
- **Offline-friendly day sheet** (printable today’s roster for teachers)
- **Accessibility**: keyboardable controls, readable contrast, reduced-motion respect

---

## 6. Key end-to-end journeys

### A. Book a class
Student requests slots → Admin assigns teacher → Calendars + emails update → Reminders send → Class runs

### B. Run a class
Teacher opens session → Joins meeting → Takes attendance & notes → Completes lesson → Files report → Student feedback → Session archives

### C. Homework loop
Teacher assigns work (or via report) → Student submits → Teacher grades/comments → Parent sees status on family dashboard

### D. Parent stays informed
Parent receives confirmation of schedule → Sees attendance after class → Reads lesson report → Messages teacher if needed

### E. Reschedule
Requester asks to move → Admin approves new slot / teacher → Old session cancelled with note → Everyone notified

---

## 7. Design system & UX

### Intent
Clean, modern, calm — **good for daily work**, not a marketing spectacle. Responsive from phone to desktop. No visual noise.

### Brand feel
- Quiet confidence: a learning center tool people trust
- Warm-neutral surfaces with one clear accent (sage / soft green works well; avoid generic purple gradients and glow trends)
- Typography: one readable UI sans + an optional restrained display face for titles only
- Plenty of whitespace; clear hierarchy; few borders

### Layout patterns
- **Top bar:** brand, role context, notifications, profile
- **Primary navigation:** left rail on desktop; bottom tabs or drawer on mobile (role-specific items)
- **Content:** single column on mobile; 2-column only when comparing list ↔ detail (e.g. request queue)
- **Dashboards:** one hero “next action” zone, then short sections — not a widget collage

### Components (keep a small set)
- Page header (title + one supporting line + primary CTA)
- Panels / sections (light surface, soft radius — not heavy card stacks)
- Lists with clear row actions
- Status chips (scheduled, in progress, done…) — short, not pill candy
- Forms with labeled fields and inline validation
- Empty states that explain the next step
- Toasts for success/error after actions
- Confirm dialogs for destructive or irreversible actions

### Scheduler UX specifics
- Prefer **list + calendar toggle** over calendar-only on mobile
- Drag-and-drop optional on desktop; always offer precise date/time fields
- Conflicts shown **before** confirm, in plain language
- “Starting soon” and “Join” states must be unmistakable

### Attendance UX
- Large tap targets for Present / Late / Absent / Excused
- Default to Present for online join when appropriate, still editable
- Summary strip: “3 present · 1 late · 0 absent”

### Messaging UX
- Threads sorted by recent activity
- Unread badges only where useful
- Class context chip at top of thread (“Algebra · Thu 4:00”)

### Accessibility & responsiveness
- Breakpoints: phone, tablet, desktop
- Touch-friendly controls (min ~44px targets)
- Respect `prefers-reduced-motion`
- Dark mode supported as a first-class preference, not an afterthought
- Clear focus states; don’t rely on color alone for status

### UX improvements worth baking in
1. **Sticky “Next class” bar** on student/teacher mobile dashboards
2. **Smart defaults** when assigning teachers (availability + subject + workload)
3. **Bulk remind** for admins (tomorrow’s classes)
4. **Undo** on common mistakes (wrong attendance mark) within a short window
5. **Progressive disclosure** on review screens — summary first, conflict details expandable
6. **Child switcher** always visible for parents
7. **Done-for-today** checklist for teachers (reports left, assignments to review)

### What to avoid
- Dense newspaper layouts and hairline-grid overload
- Decorative hero imagery on authenticated app screens
- Dashboard “stat card” spam above the real work
- Fancy motion that delays interaction
- Hidden critical actions behind overflow menus on mobile

---

## 8. Screen-by-screen design notes (priority surfaces)

### Login / register
- Centered, short form; brand name prominent
- No cluttered side marketing panels in the app shell
- Clear error text (“Wrong password”), not generic failure only

### Dashboards
- Greeting + role
- **One** primary CTA (e.g. “Review 4 requests”, “Join Algebra”, “Submit report”)
- Secondary lists below

### Scheduler / request review (admin)
- Left: request queue  
- Right: student context + slot select + ranked teachers  
- Sticky assign button  
- Success banner with what happens next (emails, calendar)

### Calendar
- Week default for teachers; agenda/list default on mobile
- Filters: course, status, person

### Conduct lesson
- Single scrolling form grouped: Attendance → Participation → Curriculum → Recording → Complete
- Autosave draft where possible

### Assignments
- Kanban optional; simple **Due / Submitted / Graded** tabs are enough for v1

### Messages
- Two-pane on desktop; full-screen thread on mobile with back button

### Settings
- Grouped list (Account, Notifications, Calendar, Appearance)
- Dangerous actions separated

---

## 9. Suggested delivery phases (product, not engineering)

### Phase 1 — Scheduling spine
Auth (admin/teacher/student), schedule requests, assign teacher, calendars, notifications, join online class, basic profiles

### Phase 2 — Lesson quality loop
Conduct lesson, attendance, lesson reports, student feedback, archive/history, admin monitoring

### Phase 3 — Learning loop
Courses catalog, assignments/homework, grades, parent accounts & family dashboard

### Phase 4 — Communication & polish
Full messaging, announcements, richer integrations, substitutes, waitlists, audit log

---

## 10. Success metrics (product)

- Time for admin to approve & assign a request
- % classes with attendance recorded same day
- % completed classes with lesson report within 24h
- Student/parent notification open rate for reminders
- Reduction in no-shows after reminder launch
- Teacher weekly active use of dashboard “today” view

---

## 11. Open product decisions

Document these as the center defines policy:

1. Can parents book on behalf of students from day one?
2. Is student feedback required before archive?
3. Are classes 1:1 only in v1, or groups too?
4. Who may message whom by default?
5. Are grades visible to parents immediately or after publish?
6. Single center first, or multi-center ready?

---

## 12. Document status

| Item | Detail |
|------|--------|
| Type | Product specification & design brief |
| Scope | E-Scheduler platform (all roles) |
| Out of scope here | Tech stack, APIs, database, coding tasks |
| Next artifacts | User flows (wireframes), content guidelines, phase-1 acceptance criteria |

---

*E-Scheduler should feel like a well-run front desk: clear, calm, and always sure what happens next.*
