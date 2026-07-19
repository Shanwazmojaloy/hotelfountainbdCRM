# [Hotel-CRM] Channel Manager - OTA Go-Live Runbook

Built + staging-proven 2026-07-12. Everything below is the ONLY work
remaining; the engineering is done and live in prod (migrations cm_p1_01..09,
commits 30bbe44..fe32001). Estimated cutover time: ~1 hour + OTA approval lag.

## Current state (do not redo)
- DB: inventory_ledger / channel_accounts / sync_queue / fn_guard_and_book /
  triggers / nightly reconcile / 15-min pg_cron drain - ALL LIVE.
- Code: Channex adapter, webhook route, drainer, feed backstop, REVIEW emails.
- Staging: property 33ee8274 fully wired, bidirectional sync proven
  (bookings, cancels, multi-room, rates, OOO capacity).
- Vercel: CHANNEL_WEBHOOK_SECRET + CHANNEX_API_KEY (staging value) set;
  firewall bypass rule covers /api/channel/*.

## Decision gate (owner)
Channex billing starts ONLY when a property has >= 1 active channel:
$130/mo platform + $7/property = $137/mo + VAT, monthly, no contract.
Alternative: Beds24 (~$25-45/mo) = write one new adapter file, keep all else.

## Cutover steps

### Owner (needs your logins)
1. Create PRODUCTION Channex account at app.channex.io (staging login is separate).
   Generate a production user-api-key (User Profile -> API keys).
2. Put the PROD key in `.env.local` as CHANNEX_API_KEY (replace staging value), then:
   `vercel env rm CHANNEX_API_KEY production` + `vercel env add ...` (paste prod key)
   + empty-commit redeploy. (Paste carefully - first attempt was corrupted last time.)
3. Run: `node scripts/channex-provision.mjs production`
   -> creates property, 6 room types, rate plans, webhook; prints config JSON.
4. Give Claude (or run yourself) the SQL update below with the printed config.
5. In the Channex dashboard: Channels -> add Booking.com / Agoda -> follow their
   extranet connection flow (needs your extranet logins; OTA approval can take days).
   Map each OTA room/rate to the Channex room types the script created.

### SQL after provisioning (step 4)
```sql
UPDATE channel_accounts
SET config = '<printed JSON>'::jsonb, status = 'active'
WHERE provider = 'channex' AND channel = 'booking_com';
-- then seed full pushes:
SELECT fn_enqueue_availability_updates('46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  (SELECT array_agg(DISTINCT category) FROM rooms WHERE tenant_id='46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'),
  (now() AT TIME ZONE 'Asia/Dhaka')::date, (now() AT TIME ZONE 'Asia/Dhaka')::date + 365);
SELECT fn_enqueue_rate_updates('46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  (SELECT array_agg(DISTINCT category) FROM rooms WHERE tenant_id='46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'));
```

### Verification before opening channels (Claude can run all of it)
- Drain once (x-drain-key) -> availability + rates visible in Channex prod
  inventory screen and MATCH the CRM ledger (incl. OOO exclusions).
- POST /webhooks/test -> 200 {ok, ignored:true} from fountainbd.com.
- Supervised first booking: place a real test booking on the OTA extranet
  (or Channex test tools) -> confirm it lands RESERVED in the Room Matrix,
  availability decrements everywhere, then cancel it on the OTA side ->
  confirm guarded delete + availability restore.

## Safety rails already active
- Overbook detector emails nightly; REVIEW emails on every drain sweep.
- Money guard: paid/checked-in/transacted reservations are never auto-deleted.
- Date-change modifications go to REVIEW (deliberate - apply manually).
- Feed poll self-heals lost webhooks within 15 min.

## Rollback
Set the channex channel_accounts row status='inactive' (stops all sync both
ways; webhook 403s). Channex-side: pause channels in their dashboard.
DB rollback SQL for all objects: outputs/00_REVIEW.md from the build session.
