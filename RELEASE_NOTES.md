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
