# FACE FORGE v0.3.6

## PES 2021 → PES 2017 conversion recovery
- Do not reject a face during folder inspection because of preliminary texture/model warnings; allow the native Team Compiler to process the selected face.
- Preserve Team Compiler diagnostics while inspecting any CPK archive it managed to generate.
- Allow generated CPK files to proceed to independent PES 2017 archive validation, even when the compiler reports warnings, an incomplete completion event, or a non-zero status.
- Continue to reject conversion when no CPK is generated or when the generated package fails structural validation.

## Installer and updates
- Windows x64 NSIS installer: `KFC-GODMODS-FACE-FORGE-0.3.6-Setup.exe`
- Version increment ensures installed 0.3.5 clients can detect the new release through the existing GitHub updater.
