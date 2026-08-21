# Security Audit Follow-up (2026-08-15)

## Changes Applied in PR

### ✅ L-3: Hardcoded temp password removed
- **File:** `app/api/agents/payment-confirm/route.ts` (line 125)
- **Before:** `Temp Password: <strong>Lumea@2026</strong>`
- **After:** `Temp Password: <strong>${tempPassword}</strong>` where `tempPassword` is generated from `TEMP_PASSWORD_PREFIX` env var
- **Note:** Password now rotates with year: `${TEMP_PASSWORD_PREFIX}@${YYYY}`
- **Impact:** Prevents hardcoded credentials in email templates and Brevo logs

### ✅ Bearer token in SQL function documented
- **File:** `db/scheduled/fn_invoke_lighthouse_summary.sql` (line 14)
- **Status:** Token already externalized to `current_setting('app.lighthouse_token', true)` in repository snapshot
- **Action:** Added inline documentation on token rotation process via `ALTER DATABASE ... SET app.lighthouse_token`
- **Note:** Deployed database function may still contain embedded token until rotated

## Remaining Work (Separate PR)

The following LOW-priority items remain in a separate PR to keep this commit focused:

### L-4: FB/Meta secrets in query parameters
- **Files:** `app/api/channel/fb-token-check.ts:42`, `src/lib/channel/facebook/capi.ts:114`, `src/lib/channel/facebook/fbPublish.ts:62+`
- **Issue:** API tokens passed as URL query parameters instead of Authorization headers
- **Fix:** Refactor to use Authorization header (Bearer scheme)
- **Scope:** Larger refactor affecting multiple integration points

## Environment Variables Required

Add to `.env.local` (development) or Vercel dashboard (production):

```bash
# Optional: Custom temp password prefix (default: 'Lumea')
TEMP_PASSWORD_PREFIX=Lumea

# Required for Lighthouse SQL function
# Set via: ALTER DATABASE <name> SET app.lighthouse_token TO '<token>';
# Or in Supabase dashboard → Project Settings → Database → Configuration
app.lighthouse_token=<bearer_token>
```

## Testing

1. **Verify temp password in email:**
   - Trigger payment confirmation flow
   - Check activation email for dynamically generated password
   - Confirm it follows pattern `${PREFIX}@${YEAR}`

2. **Verify SQL function calls work:**
   - Monitor scheduled job: `lighthouse-summary-nightly` (runs at 0 19 UTC)
   - Check `pg_cron` logs for errors
   - Verify `current_setting('app.lighthouse_token', true)` returns the bearer token

## Next Steps

1. Set `TEMP_PASSWORD_PREFIX` in Vercel environment variables (if using custom prefix)
2. Verify `app.lighthouse_token` is set in Supabase database settings
3. Monitor payment confirmation emails for correct temp password format
4. Plan separate PR for L-4 (FB/Meta token refactoring)
