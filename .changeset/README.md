# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) for **independent** package versioning.

```bash
pnpm changeset          # declare which packages bump and why
pnpm version-packages   # apply version bumps locally (CI does this on master)
pnpm release            # build + publish with npm provenance
```

Empty `fixed: []` in `config.json` means packages release on their own cadence.
