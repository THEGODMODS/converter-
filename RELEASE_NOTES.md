# FACE FORGE v0.3.4

## Face conversion reliability
- Accept PES 2021 platform texture folders (`#Windx11`, `#windx11`, `#Win`) inside nested PES 2017 face CPK validation.
- Resolve game-rooted `/Assets/pes16/.../sourceimages/...` texture references against packed relative paths, including platform-stripped fallbacks.
- Treat face-local `sourceimages/...` paths without a leading `./` as package-local.
- Keep outer Team Compiler uniform textures (`model/character/uniform/common/...`) resolving in the outer team CPK (not inside the nested face CPK).
- Missing-texture errors list sample `.dds` paths present in the nested CPK.
- Regression tests cover the reported `#Windx11` and full `/Assets/.../face_bsm_alp.dds` conversion failures.

## Release note
- v0.3.3 was published from a quality-failed intermediate commit. Install **0.3.4** instead.

## Installer
- Windows x64 NSIS installer: `KFC-GODMODS-FACE-FORGE-0.3.4-Setup.exe`
- Automatic updates use the GitHub release feed for this repository.

---

# FACE FORGE v0.3.3

## Face conversion reliability
- Accept PES 2021 platform texture folders (`#Windx11`, `#windx11`, `#Win`) inside nested PES 2017 face CPK validation.
- Resolve game-rooted `/Assets/pes16/.../sourceimages/...` texture references against packed relative paths, including platform-stripped fallbacks.
- Treat face-local `sourceimages/...` paths without a leading `./` as package-local instead of rejecting them as unsafe.
- Missing-texture errors now list sample `.dds` paths present in the nested CPK so packing mismatches are easier to diagnose.
- Added regression tests covering the reported `#Windx11` and full `/Assets/.../face_bsm_alp.dds` conversion failures.

## Validation status
- Automated quality checks run on every main push (typecheck, Vitest, native tests, app build).
- Windows installer build and GitHub release publish run from the main-branch release job.
- Genuine in-game PES 2017 validation of every face folder is still required by the user before treating a converted pack as final.

## Installer
- Windows x64 NSIS installer: `KFC-GODMODS-FACE-FORGE-0.3.3-Setup.exe`
- Automatic updates use the GitHub release feed for this repository.

---

# FACE FORGE v0.3.0

## Reliability and format handling
- Correctly handle 2D FTEX textures whose depth field is zero.
- Decode chunked FTEX frames that use an unknown uncompressed-size sentinel while validating aggregate compressed chunk sizes.
- Ignore FPK XML metadata as a standalone asset and clean empty directories after duplicate archive-member cleanup.
- Improve conversion diagnostics so full native compiler output is visible when conversion fails.

## Validation status
- Automated quality checks pass on the development branch.
- The automated package smoke test uses synthetic hair geometry and verifies packaging only.
- Genuine head-model conversion, visual fidelity, and loading in PES 2017 have not yet been validated. This build must not be described as game-ready or as proof that every face folder converts successfully.

## Installer
- Windows x64 NSIS installer is built and SHA-256 verified by the Windows CI workflow.
- This is an installer build candidate; it is not a public release until real-face validation is completed.
