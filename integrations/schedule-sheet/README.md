# Private schedule sync

The company-account standalone Apps Script project synchronizes the existing Kream Ops Schedule spreadsheet with Operations. There is no public Google web app and no Google web-app URL in the client.

- Sheet edits queue all affected store/week blocks through an installable edit trigger.
- A one-minute `syncCycle` imports pending changes, then pulls changed server snapshots using a private credential.
- The credential is generated and retained inside Google Script Properties. Only its SHA256 fingerprint is configured in the server's encrypted Vault.
- Only stores 1 (downtown), 3 (Richmond Hill), and 4 (Finch) participate.
- `T` is a training marker retained in the sheet and excluded from Operations.
- Unknown or ambiguous names remain unpublished manager drafts and cannot be claimed or bulk-published as open shifts.
- Pending sheet edits take priority over outgoing snapshots. Server imports commit atomically and reject stale concurrent writes.
- All schedule API pages are read before export. An oversized/incomplete snapshot fails without clearing source rows.
- Existing weekly blocks are replaced in place, keeping previous values until replacement values are ready.

## Setup

Create a private standalone Apps Script project under the company account, copy `Code.gs` and the manifest, and give that account editor access only to the intended schedule spreadsheet. The manifest requests Sheets access, external requests, and background execution.

Set Script Property `FUNCTION_URL` to the existing `kream-team-sheet` Edge Function. Run `preparePrivateConnection`, configure the logged fingerprint (never the actual credential) as `team_sheet_fingerprint` in `kream_live_integrations`, then run `installLiveConnection`. This installs `onEditInstalled` and the one-minute `syncCycle` trigger and imports the source blocks.

The frontend's `SCHEDULE_AUTO_SYNC` enables the status message. `SCHEDULE_SHEET_URL` stays blank; legacy direct Google exports for availability/payroll are separate and are not enabled by this schedule connection.

## Verification

Use a manager-only unresolved draft for temporary round-trip testing, restore its original time and identifier, verify all three store counts and training markers, and inspect actual edit-trigger/time-trigger executions. Sheet edits must be made through the UI for the installed edit trigger to fire; API writes do not fire it.
