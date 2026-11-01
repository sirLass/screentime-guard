# Chrome Dev Profile (isolated testing environment)

The implementation plan requires a **separate Chrome test profile** so that your own
browsing is never tracked, limited, or affected while developing the extension.

## Quick start

```pwsh
# one command: builds the extension, creates .chrome-dev-profile/, launches Chrome
pnpm dev:chrome

# with WXT hot reload / auto-refresh (recommended while coding)
pnpm dev:chrome -- -Dev
```

What this does:

1. Builds (or dev-builds) the extension into `apps/extension/.output/chrome-mv3`.
2. Creates an isolated profile at `.chrome-dev-profile/` (gitignored) — separate
   bookmarks, storage, and extension state from your daily browser.
3. Launches Chrome with `--load-extension` pointing at the build output and opens
   `chrome://extensions` for you.

### Note on Chrome 137+

Recent stable Chrome versions may ignore the `--load-extension` flag. If in doubt:

1. On `chrome://extensions`, enable **Developer mode** (top right toggle).
2. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.

That manual step only needs to be done once per profile; it persists.

## Verifying hot reload (DoD for Phase 0)

1. Run `pnpm dev:chrome -- -Dev` and load the extension.
2. Open the popup (or any extension page).
3. Edit a visible string in `apps/extension/entrypoints` (e.g., popup text).
4. Save: WXT should rebuild and Chrome should reload the extension automatically;
   the popup reverts to showing your change.
5. **Reset and restore** the string when done (avoid noise in diffs).

## Resetting the test environment

All tracker data, PINs, and test rules live only in the isolated profile:

```pwsh
Remove-Item -Recurse -Force .chrome-dev-profile
```

Then re-run `pnpm dev:chrome` to start clean (handy for testing the setup wizard repeatedly).

## Why not use your normal Chrome profile?

- Tracker limits could block sites you actually need during development.
- Extensions you install for testing would see your day-to-day history.
- Every "delete all data" test can be done fearlessly.
