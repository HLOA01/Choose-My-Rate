# Hosted LendingPad link (wording and configuration notes)

This note documents a link, not an integration. Nothing here installs a destination, adds a default URL or changes what the Continue button does.

## What the code does

- The destination is the existing build-time URL, read in this order: `VITE_APPLICATION_URL`, `VITE_APPLY_URL`, `VITE_LOAN_APPLICATION_URL`. If none is set, the original "Continue to Application" label and the "not configured yet" message stay as they were.
- Provider wording is presentation-only: exact HTTPS host prod.lendingpad.com, default port, no credentials/search, empty or #/ fragment, and the observed /tenant/GUID/pos route form receives Open LendingPad. Other destinations (including unrelated sites, staff login paths and same-origin QA) retain the generic Continue to Application label. This is not a host allowlist, routing authorization, tenant/LO verification or guarantee of future availability; navigation is not changed or blocked by this wording helper.
- New button/notice copy has English and Spanish variants, selected from the browser locale (es and es-* use Spanish; other locales use English). The current screen has no language selector. Sally and the rest of the Funnel are unchanged; this does not claim full-screen translation.
- The notice always discloses the temporary in-tab copy of entries and the selected quote. Configured web links also explain same-tab navigation and that opening a page is not confirmation of receipt. There is no blanket zero-transmission claim, rate-lock assertion or invented external acceptance semantics.
- Navigation is unchanged: same tab, only after a valid selected quote, with the same local handoff written first. If that local write fails, the button still stops with "could not be saved" and does not navigate.
- This code appends no body and no query to the destination. The browser may still send a Referer according to its own policy. The TEST fixture observed an origin-only referrer for a synthetic source-query sentinel in Chromium; that is not a promise for every browser or setting.
- No `application.started` event, receiver acknowledgement, prefill, handle transfer or storage is added. Existing temporary local storage remains, with the same failure gate and return/reset clearing behavior.

## Verified public destination (documentation only)

Profile-sourced public Portal Link, as supplied in the source packet for base `86c8bab`:

`https://prod.lendingpad.com/home-lenders-of-georgia/cbf6fda4-93ed-4273-8424-1aa4f3690bc2/pos`

The packet reports that a fresh local browser read this exact URL (HTTP 200, a registration link rendered, nothing entered or submitted). That was reported by the packet author and was not repeated by this change. It verifies a hosted consumer entry route only. It does not verify loan creation, loan-officer assignment on a created loan, prefill, API rights or receiving acknowledgement.

Do not use the generic `/home-lenders-of-georgia/pos` form of the address: an account worker observed a staff login there. Do not infer other tenant addresses from this one.

This URL is not installed anywhere in source, tests, fixtures or `.env.example`. Setting it is a separate deployment decision made outside this change, in the hosting provider's build settings.

## Before anyone sets it in a deployment

- The helper recognizes only the provider/route form for its label. Whoever configures the destination must still verify company/LO attribution and the actual public borrower route; no hardcoded runtime default is provided.
- A page that loads, redirects to a login or returns an error status cannot show that an application was accepted. The existing cross-origin tests (`npm run qa:cross-origin-application`) use a synthetic loopback receiver only and never contact LendingPad.
- The local handoff is still written to this tab's `sessionStorage` before navigation and is cleared on return or reload. It never crosses origins and is not a borrower identity or an LOS integration.
- `src/SimplifiedBorrowerApp.jsx` reads the same variables but is not changed here.

## Authorship and verification scope

Claude authored the initial wording/docs/storage-failure test proposal. Codex corrected blanket provider labeling, supplied bilingual presentation and disclosed existing local storage. Unit tests use synthetic route strings (no provider requests) for exact provider recognition and lookalike-host/staff/generic/query/locale cases. Actual browser tests use loopback receivers only: generic wording, English/Spanish accessibility and mobile flow, storage failure, HTTP302 login, HTTP503, exact GET/body/referrer, and preserved synthetic routing query without borrower data appended. Positive provider recognition is unit-tested without navigating a browser to LendingPad. No live calls are made by tests.
