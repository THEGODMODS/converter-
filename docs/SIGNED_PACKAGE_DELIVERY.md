# Signed package delivery (Phase 2)

FACE FORGE package delivery uses detached Ed25519 signatures over a canonical JSON manifest. The manifest binds the package ID/version, display name, every relative output path, exact byte length, SHA-256 digest and HTTPS asset URL.

## Trust and fail-closed behavior

The application accepts only exact HTTPS hostnames in `electron/package-trust.ts` and Ed25519 public keys provisioned in that same trusted application code. Redirects, non-HTTPS URLs, non-standard ports, URL credentials, untrusted hosts, unknown key IDs, malformed signatures, invalid paths, duplicate/case-colliding paths, oversized manifests/files/packages and digest mismatches are rejected. There is no unsigned fallback.

The trust arrays are intentionally empty until KFC GODMODS provisions the official package hostname and independently verified public key. Do not insert a private key in the app or repository. A package cannot be downloaded while trust roots are empty.

## Manifest format

Create an unsigned JSON document:

```json
{
  "schema": 1,
  "packageId": "example-face-pack",
  "version": "1.0.0",
  "displayName": "Example Face Pack",
  "files": [
    {
      "path": "Assets/pes16/model/character/face/12345/face.fpk",
      "size": 1234,
      "sha256": "64-lowercase-hex-characters",
      "url": "https://packages.example.invalid/example-face-pack/1.0.0/face.fpk"
    }
  ]
}
```

Every URL host must be on the exact approved-host list. Paths are relative to the package installation directory. The current bounds are 500 files, 128 MiB per file, 512 MiB total and a 1 MiB manifest.

## Publisher key and signing

Generate an Ed25519 key pair in a secure offline directory outside the repository. The included utility writes a PKCS#8 private key with restrictive file permissions and an SPKI public key:

```sh
npm run package:keygen -- godmods-2026 /secure/offline/face-forge-keys
```

Keep the private key offline and never distribute it with FACE FORGE. Provision the public key through a separately reviewed application update. The key ID is a short stable identifier.

```sh
npm run package:sign -- unsigned-manifest.json /secure/offline/face-forge-keys/godmods-2026.private.pem godmods-2026
```

The tool creates `unsigned-manifest.signed.json` without overwriting an existing file. Publish the signed manifest and the exact assets over the approved HTTPS host. The manifest signature covers every asset URL, path, size and digest.

## Install transaction

The Electron main process downloads the manifest with redirects disabled, verifies the signature before trusting any asset URL, downloads into a fresh staging directory, enforces byte limits while streaming, verifies exact size and SHA-256 for every file, then atomically renames the complete package into the local package store. Any failure removes staging data. Existing package versions are never overwritten. Resumable downloads are intentionally not implemented.

## Release provisioning checklist

- [ ] Confirm the official package hostname and TLS ownership.
- [ ] Generate the publisher Ed25519 key pair offline.
- [ ] Independently verify and provision the public key and key ID in `electron/package-trust.ts`.
- [ ] Add the exact production hostname to `hosts`.
- [ ] Produce a signed test package and run the Windows integration tests.
- [ ] Review key rotation and revocation procedures before public package distribution.

Until the official hostname and public key are provisioned, signed-package installation deliberately fails closed. This is a trust-provisioning dependency, not a signature bypass.
