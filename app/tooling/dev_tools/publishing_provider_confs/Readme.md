# publishing_provider_confs

Bootstrap bundles for `MeadowHome/app/publishing_providers/`. After launching
the app against a fresh config, drop one of these in to skip retyping
provider settings (and especially secrets) by hand.

## Layout

```
publishing_provider_confs/
  <profile name>/
    <ProviderClassName>/
      pp_resources.yaml
      pp_secrets.yaml
```

- **`<profile name>`** — a friendly label for the bundle (e.g. `meadow dev
  S3PublishingProvider`). Free-form; only the contents matter.
- **`<ProviderClassName>/`** — mirrors a folder under
  `MeadowHome/app/publishing_providers/`. The folder name must match the
  provider class.
- **`pp_resources.yaml`** / **`pp_secrets.yaml`** — copied verbatim into the
  matching provider folder in MeadowHome.

A profile may contain more than one `<ProviderClassName>/` folder if you want
to bootstrap several providers together.

## Why gitignored

These bundles contain real credentials (S3 keys, etc.). Everything in this
directory is gitignored except this readme and `.gitignore`.
