# BANDAI WATCH 1.1 — Monitoring & Notification Engine

## What this milestone adds
- Server-side source polling with bounded fetch timeouts
- JSON-LD Product and Open Graph/title extraction
- Conservative page-state signals: booking open, upcoming, sold out, unknown
- Snapshot comparison and deduplicated booking/restock/info-change events
- Protected cron endpoint
- Web Push subscription API and service worker
- APNs device-token registration and server dispatch scaffold
- Supabase tables for products, events, web subscriptions and iOS devices
- Vercel Cron target configured to every five minutes

## Critical status
This is an integration-ready engine scaffold, not a verified live Bandai feed. The included sample source URLs are broad official landing pages and are not guaranteed to expose machine-readable product inventory or booking states. Add specific official product/listing URLs or implement source-specific adapters after checking each site's terms, robots rules and access controls. The parser deliberately marks ambiguous pages as `unknown`; it must not infer an exact booking date from vague text. It currently detects status transitions and explicit ISO-like dates, and queues a once-per-booking-time 24-hour reminder when an explicit parseable booking timestamp is within the next 24 hours. Exact date extraction remains source-dependent and should be validated per official site.

## Requirements
- Node.js 20+
- Supabase project
- HTTPS deployment for web push
- Vercel or another scheduler capable of calling the monitor endpoint every 5 minutes
- For native iOS push: Apple Developer account, APNs auth key, native iOS app that obtains and registers an APNs device token

## Local run
```bash
npm install
cp .env.example .env.local
npm run dev
```

Run the SQL in `supabase/schema.sql` in Supabase SQL Editor. Configure the environment variables. Set a strong random `CRON_SECRET`.

## Configure monitoring sources
Set `MONITOR_SOURCES_JSON` to a JSON array. Each entry:
```json
{
  "id": "unique-source-key",
  "name": "Human readable source",
  "url": "https://official.example/product-list",
  "region": "日本",
  "category": "奥特曼",
  "kind": "listing"
}
```
Use specific official product/listing pages that are permitted for automated access. The initial generic URLs in `.env.example` are placeholders only. Broad listing pages may not contain structured Product data, so for reliable monitoring write source-specific adapters in `lib/monitor.ts`.

## Cron
The included `vercel.json` requests `*/5 * * * *`. Confirm the selected hosting plan supports the required schedule and execution duration. The endpoint requires:
`Authorization: Bearer <CRON_SECRET>`

Test:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/monitor
```

## Web Push
Generate keys:
```bash
npx web-push generate-vapid-keys
```
Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. The dashboard includes a Web Push opt-in control. Set both `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY`, then the control registers `/sw.js`, requests permission, subscribes, and stores the subscription through `/api/push/subscribe`. Serve the app over HTTPS (localhost is allowed for development).

## iPhone system push
The APNs dispatch adapter is present. Native app work is still required to request notification permission, obtain an APNs device token, and POST it to `/api/push/ios`. Configure APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID and APNS_PRODUCTION. For hosted deployment, store the APNs key securely as a secret/file mount; do not commit it.

## Security
- Keep this as a private single-owner app.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, VAPID private key or APNs key to browser code.
- Add authentication/rate limiting to subscription registration before public exposure.
- Apply owner-scoped RLS policies before client-side database access.
- Respect source terms, robots rules, rate limits and anti-bot controls. Do not bypass access controls.
