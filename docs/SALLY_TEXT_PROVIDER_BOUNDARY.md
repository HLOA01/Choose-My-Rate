Sally text keeps the `openai-sally.handler` entry point and public success fields.
The server selects OpenAI and its existing primary/fallback model defaults. The
adapter accepts projected request data plus a server-selected model and an abort
signal, returning text only. It has no tools or identity/pricing authority.
Caller endpoint, provider, model and approval fields are never adapter settings.
No alternate live provider has been enabled and voice is unchanged.

The total provider budget defaults to 12 seconds (server-only
`SALLY_TEXT_TIMEOUT_MS`, integer 1–30000). Fetch cancellation and a promise race
bound an adapter that ignores abort. Timeout returns the existing 502 error
shape so the current UI retains its deterministic fallback. Explicit invocation
signal cancellation returns 499 and stops fallback-model work. Lambda does not
automatically expose browser disconnects: a hosting adapter must supply that
signal to use this capability. Provider error details are not returned.

Missing server API key still returns 500. OPTIONS and malformed-request status
codes remain compatible. Malformed/unsafe provider output returns the existing
success shape with safe deterministic text and low confidence. Primary and
fallback model results use the same validation. Tests inject fakes only through
server-side construction; the HTTP request cannot enable a fake provider.

Browser scenario values and local parser hints are untrusted and projected to
known scalar fields. Neither caller `localResult`, history nor valid model prose
can establish a scenario fact. The server accepts only a conservative single-fact
grammar in the current message and passes its canonical form through the same
deterministic parser used by the browser. The parser implementation moved without
behavior changes into `lambda/sally-scenario-parser.mjs`; `src/SallyBrain.js`
re-exports its existing API. No parser confidence is invented or taken from AI.
Model-proposed nonempty fields must all match current-message evidence, or the
whole proposal is suppressed and the server asks for explicit clarification.
Bare "yes", negation, conditional/ambiguous statements and unsupported fields
do not silently change values. Income and down-payment-percent updates are not
part of this limited server evidence grammar; direct UI editing remains available.
These are borrower assertions for scenario intake, not verified financial facts,
authorization or underwriting decisions. Common SSN/email patterns are redacted; this is not a
general PII detector. Borrower-visible provider text must exactly match one of
the server-owned intake/review phrases. Other prose is rejected in full, including
model-proposed scenario updates, intent and refresh flag. No regular expression
is presented as natural-language financial verification. The allowed phrases
preserve bounded scenario intake, not general free-form financial conversation.
Every controlled intake/review phrase has English and Spanish counterparts.
An explicit `language` preference (`en`/`es`) or a conservative current-message
language hint selects output/fallback language; this is not exhaustive language
detection. Allowed provider text is mapped to that language before returning.
The legacy numeric matching
exports remain for existing callers/tests, but the handler cannot use client
numbers to prove quote authority. Until an authenticated server quote-context
source exists, the handler provides controlled intake/review questions and directs
numerical questions to the quote UI/licensed review. This intentionally tightens prior
numeric replies rather than treating client-supplied quotes as verified.

Package `lambda/openai-sally.mjs`, `sally-text-core.mjs`,
`sally-text-provider.mjs`, `sally-text-evidence.mjs`,
`sally-scenario-parser.mjs` and the existing prompts together. No deployment or
live-provider test is included in this change. Run `npm run qa:sally-provider`
for offline contract/adversarial coverage, alongside the existing Sally QA.
