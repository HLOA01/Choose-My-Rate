# Actual producer refresh regression

The offline ecosystem suite now includes nine cases. The additional case receives `quoteExpiresAt` from the actual local HLOA pricing/boundary handlers under an explicit nine-second TEST policy-expiry fixture. It prepares the local handoff, waits without another pricing request, verifies expired results and handoff removal, then reloads without restoring the application CTA.

No CMR product code change is required: the existing borrower quote contract and expiry lifecycle already consume the supplied field. This is a presentation/storage regression, not a production receiver acknowledgment or guarantee against earlier server-side revocation. The synthetic duration is not a lender policy. Partial fee estimates remain disclosed.
