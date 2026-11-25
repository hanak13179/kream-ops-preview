# Daily reservation cake messages

WordPress sends only order reference, pickup date/time/location, cake items/options and the customer note to the signed staff workspace. Contact, payment and address details are not exported. Only the server-side connection token can ingest data; its SHA-256 hash is stored in a private table. No token belongs in Git.

## Staff use

Open **예약 케이크**. The default date is today in America/Toronto. Store employees see their assigned locations. The owner can inspect all locations. Write the original request on the box window, then select **문구 작성완료**. This only records the staff check in Ops; it does not update the customer order, payment or pickup status. A source change invalidates the prior check. Cancelled, refunded and unpaid orders cannot be marked written.

## Sync

The WordPress connector queues an update after order saves, sends cancellation/deletion tombstones, reconciles modified orders every five minutes through WP-Cron, and backfills recent/future pickups in bounded pages. The staff screen refreshes every minute while open and has an explicit Refresh button. Server hooks and cron operate without an employee computer being open. WP-Cron delays are possible on an inactive site; the staff screen shows the last successful received time.

Connection health and manual backfill are in WordPress Tools → Kream Ops order connection. Install only the separately generated private import JSON; the repository PHP template intentionally contains a token placeholder. Never export the installed secret-bearing snippet into Git.

## Checks

Run node --test integrations/preorders/normalize.test.mjs staff/tests/reservations.test.mjs. The database transaction tests roll back all fixtures and cover invalid tokens, out-of-order events, branch isolation, stale review hashes and undo. The ingest endpoint returns 401 without a connection token.
