# Supabase database CA

`supabase-root-2021.pem` is a public CA certificate, not a secret or a client key.
Downloaded over verified HTTPS on 2026-10-29 from the same production URL used
by Supabase Studio's `ssl:certificate_url` setting:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Official URL template source:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json

Official usage guidance:
https://supabase.com/docs/guides/platform/ssl-enforcement

Subject: Supabase Root 2021 CA, Supabase Inc.
Valid until: 2031-04-26 10:56:53 GMT.
SHA-256 fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

The Postgres adapter adds this CA only for `*.pooler.supabase.com` and
`*.supabase.co`. Existing system/Node trust roots are retained. Both certificate
chain validation and hostname validation remain enabled. No OS trust store is changed.
