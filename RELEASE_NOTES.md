# FACE FORGE v0.3.5

## Face conversion reliability
- Flatten Fox platform texture folders (`sourceimages/#Windx11`, `#Win`) into plain `sourceimages/` before Team Compiler runs.
- Rewrite FMDL face texture directories to plain `sourceimages/` so PES 2017 nested CPKs no longer depend on `#` platform paths.
- Keeps the v0.3.4 validator fixes for `#Windx11` / game-rooted references as a safety net.

## Why this release
v0.3.4 still failed on real faces because Team Compiler emitted `#Windx11` texture paths and the nested face CPK ended up with no packed `.dds` textures. This release fixes packing, not only validation.

## Installer
- Windows x64 NSIS installer: `KFC-GODMODS-FACE-FORGE-0.3.5-Setup.exe`
