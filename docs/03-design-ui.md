# Design & UI Document — Fair Team Matcher

**Purpose of this document:** Describe the actual screens, navigation flow, and visual style, so the UI can be built directly from this without re-deciding layout or look.

---

## 1. Visual Style (proposed — adjust freely)

A calm, neutral, "utility tool" look rather than a flashy consumer app — this is a fairness tool, so the tone should feel trustworthy and unbiased, not playful.

| Element | Choice |
|---|---|
| **Primary color** | Slate blue `#3B6EA5` — used for primary buttons, links, progress bars |
| **Accent (Friend Mode)** | Soft blue tint `#EAF2FF` background for Friend Mode screens |
| **Accent (Class Mode)** | Soft warm tint `#FFFDF5` background for Class Mode screens — helps organizer/TA visually distinguish which mode they're in at a glance |
| **Success/positive** | Muted green `#3E8E41` (e.g. "submitted," "revealed") |
| **Warning** | Muted amber `#C99A2E` (e.g. "avoid" markers, incomplete state) |
| **Neutral text** | Charcoal `#2B2B2B` on off-white `#FAFAFA` background |
| **Typography** | A single clean sans-serif (e.g. Inter or system-ui stack) — one weight for body, one heavier weight for headings. No decorative fonts. |
| **Layout** | Centered single-column forms (max-width ~640px) for all participant-facing screens — this is filled out on phones as often as laptops, so avoid multi-column forms. |
| **Tone** | Plain language, no gamification, no "you got matched!" confetti — the app's credibility depends on feeling neutral and mathematical, not gimmicky. |
| **Dark mode** | Supported as a toggle (persisted per browser). Same palette relationships, inverted: charcoal background `#1C1C1C`, off-white text, same accent colors at slightly reduced saturation so they don't glare on dark backgrounds. |

## 2. Screens — Organizer Flow

![Organizer Flow](wireframe_organizer.png)

1. **Login** — organizer authenticates (Supabase Auth if enabled, else the env-credential form).
2. **Dashboard** — lists past sessions (Requirements §9, Past Sessions requirement) with mode, date, status, a button to start a new one, and a **Duplicate** action per session (clones config only — Requirements §6.3).
3. **Create Session** — pick Friend or Class mode (this choice is irreversible for that session, per Requirements §6.1), set team size, add participants:
   - **Friend Mode:** type a name, hit Add, repeat.
   - **Class Mode:** a fast roll-number entry designed to minimize repetitive typing — Batch (e.g. `24`) and Campus (`F`/`L`/`I`) are set once and stay filled in; only the Roll Number field clears after each Enter, appending to a running list. No emails are typed anywhere — the system derives them internally when a student later signs in with Google.
   - Each added participant (name or roll number) has **edit/remove** controls, available until the session locks (Requirements §6.1, §6.2).
4. **Live Monitor** — shows the shareable link, a live "X of Y submitted" counter, and a Reveal button (disabled until the organizer chooses to proceed — reveal does not require 100% submission, but the count is always visible so they can decide).
5. **Results (Organizer View)** — the winning grouping and its fairness score, the 2-3 next-best **alternative groupings** for transparency (Requirements §8.5), each team's **score breakdown** (Requirements §8.6), and (Class Mode only) a way to inspect each participant's raw answers. **Export CSV** and **Export PDF** buttons are available here.

## 3. Screens — Participant Flow

![Participant Flow](wireframe_participant.png)

1. **Identify**:
   - **Friend Mode:** a single dropdown of names pulled from the session's participant list. No password. Once submitted, that name is locked for the session (Requirements §NFR-6).
   - **Class Mode:** a "Sign in with Google" button, restricted to NU campus emails. On success, the system silently derives the student's roll number from their email and checks it against the organizer's pre-added list. A mismatch (wrong roll number, wrong/unsupported campus, or non-NU email) shows a plain rejection message — the student never types a roll number themselves, so there's nothing for them to get wrong except using the right Google account.
2. **Rank Your Teammates** — Friend Mode only. Drag-to-rank interaction for top 3-5, plus an optional "avoid" checklist. Skipped entirely in Class Mode.
3. **Questions** — one question at a time (or a short scrollable set — implementation detail), with a progress indicator. Every question is required; the "Next"/"Submit" button stays disabled until answered.
4. **Submitted** — a plain waiting screen. No live status shown to participants (only the organizer sees submission counts).
5. **Result — Friend Mode** — shown only after the organizer reveals: their team, a short plain-language reason (e.g. "mutual pick with Sara," "similar work hours with Omar"), and the team's balance score.
6. **Result — Class Mode** — students never see team assignments in-app; they just see a confirmation. The instructor shares groups however they choose (in class, on LMS, etc.) — this matches the "only organizer sees everything" rule (Requirements §5.2).

## 4. Navigation Rules

![Session Lifecycle](lifecycle_diagram.png)

- A participant cannot revisit the Rank/Questions screen after submitting (no back button that resubmits).
- The organizer cannot reach a "Reveal" state twice with different logic — reveal is a one-way action; results are then fixed and read from storage, not recomputed live.
- Mode is chosen once, at session creation, and never changed for that session (avoids the awkward case of switching a session from Friend to Class after people have already ranked each other).
- Editing or removing a participant is only possible in `draft`/`open` state — the Create Session screen's edit/remove controls disable themselves automatically once the session locks.

## 5. Accessibility & Responsiveness Notes
- All forms must be usable on a phone screen — this will very likely be opened primarily from a shared WhatsApp/group-chat link.
- Radio/checkbox targets sized for touch (not tiny desktop-style radio buttons).
- Color is never the only signal (e.g. "avoid" marked participants get a label, not just a red tint) — relevant since a portion of any group may have some degree of color vision difference.

## 6. Public "How This Works" Page
A static, unauthenticated page (linked from the login screen and from every participant-facing screen's footer) explaining, in plain language: why there's no randomness, why no one's skill is rated, and how the fairness score works at a conceptual level (no formulas needed here — that's what the Requirements doc is for). This exists to pre-empt the "why did the algorithm put me here" skepticism a fairness tool inevitably gets, especially in Class Mode where students have no visibility into the process otherwise.

## 7. Rate-Limit & Error Messaging
If a participant or student is rate-limited (Requirements NFR-12) or rejected during Class Mode sign-in (Requirements §5.2), the message must be specific enough to self-resolve where possible ("This roll number isn't registered for this session — check with your instructor") rather than a generic "Error" — since there's no support channel built into the app.

## 8. Known Limitations (intentional, documented trade-offs)
- **No identity verification in Friend Mode.** Selecting a name from a dropdown relies on the group's honesty — anyone could select someone else's name. This was an accepted trade-off (Requirements §11) to keep the tool frictionless (no accounts, no per-person links) for a casual friend-group use case. Class Mode does not have this limitation — Google sign-in verified against a pre-added roll number closes this gap where it actually matters (real student records).
- **No mid-session editing.** If someone makes a mistake in their ranking or answers, there is no self-service fix — they'd need to ask the organizer to reset their specific submission (an admin action, not exposed in v1's UI, but the data model doesn't prevent building it later).

## 9. Traceability
- Implements Requirements §4 (actors), §6 (session flow), §5 (mode differences).
- Screen names here should match component/page names used in the SDA's `/ui` folder for consistency.
