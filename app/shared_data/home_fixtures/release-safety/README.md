# Release-safety Meadow Home fixtures

These fixtures are synthetic and contain no credentials. Service names use the
reserved `.invalid` suffix.

- `public-format-1` is the first public compatibility baseline.
- `future-format` must be refused without writes by a format-1 app.
- `corrupt-home` and `corrupt-bootstrap` exercise Electron-owned recovery.

Never replace these fixtures with a copy of a user's Meadow Home.

For each public release, copy only a sanitized synthetic Home, remove ignored
and private documents, replace identifiers with fixed test values, and retain
its migration ledger exactly. Keep an accepted fixture immutable; add a new
directory for a later release. The production-startup upgrade matrix must open
every supported fixture twice, prove the second start byte-stable, and refuse
future or corrupt fixtures without writes.
