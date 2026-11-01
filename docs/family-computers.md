# Shared Family Computers — Recommended Approach

Open decision from the PRD (section 14). This documents the recommended default so
we can move on; it affects no core architecture.

## Recommendation: one Chrome profile per child (and one for parents)

Each person who shares the computer uses their own **Chrome profile**:

- Child's profile: ScreenTime Guard installed, PIN-protected, their own daily limits.
- Parent profile: their own installs, no child extension present, available to manage rules.
- `Guest` and non-monitored profiles toggled **off** where the family wants strictness
  (Chrome profile customization → "Other profiles" / guest browsing), or surfaced to
  parents via the Phase 2 dashboard as an alert if re-enabled.

## Why profiles, not a single shared profile

| Factor                          | Separate profiles                              | One shared profile                              |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Accurate attribution            | Time is naturally scoped to the child using it | Impossible — all usage lands in one bucket      |
| Limits                          | Per-child, fair                                | Whichever child is using it when the limit hits |
| Self-honesty                    | Each child learns to manage their own time     | Blame shifts between siblings                   |
| Chromecast/work apps unaffected | Yes, parents keep their own profile            | Children's limits apply to parents' tabs too    |

## What we do and don't support

**In scope (v1):** the standard one-child-one-browser case with clear docs;
documented guidance for shared PCs (this file).

**Out of scope for v1 (revisit for Phase 2+):**

- Multiple children on one Chrome profile — fundamentally an attribution problem,
  not something the extension can solve; we document that it is unsupported.
- OS-level Windows/macOS usernames as the boundary — the extension is Chrome-bound;
  keep the boundary inside the browser.
- Family "device tokens" for shared machines — Phase 2 sync can model them, but
  usage will still be attributed jointly.

## Parent checklist for a shared PC (plain-language, for the README/FAQ later)

1. Give each child their own Chrome profile with a password-protected Chrome account.
2. Install ScreenTime Guard in each child profile and set a PIN (one PIN per device is fine).
3. Customize the parent's profile so it does not show children's extensions.
4. Turn off Guest mode / prevent unmonitored profiles (see the future
   `make-it-harder-to-remove` guide for registry/GPO steps per OS).
5. Set the Chrome profile as "recommended"/default so the browser starts in the
   child's profile with limits active.
