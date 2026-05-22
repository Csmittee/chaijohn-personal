# Lessons Learned — Chaijohn Dashboard

## Airtable API — multipleRecordLinks field creation
**Bug:** Creating a table with linkedTableId in multipleRecordLinks
options fails if you include prefersSingleRecordLink or isReversed.
**Root cause:** Airtable table-creation endpoint only accepts
linkedTableId in multipleRecordLinks options. The field-add
endpoint accepts more properties, but table creation is strict.
**Fix:** When creating tables, use only:
  { type: 'multipleRecordLinks', options: { linkedTableId: id } }
**Do not add:** prefersSingleRecordLink or isReversed at table
creation time.

## Schema init — seeding timeout
**Bug:** 84 records × 250ms delay = 21 seconds, hits Cloudflare
Function timeout.
**Fix:** Use Airtable batch create (10 records per POST) to reduce
API calls from 84 to ~10.

## Checkbox color values
**Bug:** Airtable Meta API rejects 'green'/'blue' for checkbox color.
**Fix:** Always use 'greenBright'/'blueBright'.
