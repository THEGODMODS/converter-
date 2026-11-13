# Engineering roadmap

## Phase 0 — foundations
- [x] Establish clean repository and product contract.
- [x] Define bidirectional PES 2017 ↔ PES 2021 scope.
- [x] Desktop shell, typed IPC, safe folder intake and project inventory.
- [x] Binary header recognition for PES 2017 MODEL/DDS and PES 2021 FMDL/FTEX.
- [ ] Green Windows CI run and security audit sign-off.
- [ ] Automated tests and Windows CI.

## Phase 1 — reliable intake and inspection
- [ ] Drag/drop folders and ZIP archives.
- [ ] Safe archive extraction (path traversal, symlink, size and file-count defenses).
- [x] Identify MODEL/DDS and FMDL/FTEX by signatures, paths and companion metadata.
- [x] Initial direction-aware compatibility report with explicit source checks and hard conversion blockers.
- [x] Research dossier for PES 2017 MODEL, PES 2021 FMDL/FPK/FTEX and both translation pipelines.
- [ ] Deep face-package report: semantic meshes, materials, texture bindings, IDs, missing dependencies.
- [x] Deterministic SHA-256 project manifest export with format inventory and coverage diagnostics.

## Phase 2 — texture conversion
- [x] FTEX header/format research and initial decoder tests.
- [x] DDS header inspection for common legacy and DX10 formats.
- [x] Initial FTEX ↔ DDS container conversion for supported formats, mip levels and compressed payloads (needs broad fixture coverage and game testing).
- [ ] Explicit unsupported-format reporting.

## Phase 3 — model conversion adapters
- [x] Parse and serialize PES 2017 MODEL section containers, including ESYS zlib wrappers.
- [x] Parse and serialize PES 2021 FMDL block containers while preserving unknown blocks.
- [ ] Decode PES 2017 MODEL mesh, material and skeleton structures.
- [ ] Decode PES 2021 FMDL mesh, material and skeleton structures.
- [x] Initial PES 2017 MODEL section-1 vertex/face decoder with strict bounds and semantic validation.
- [x] Initial PES 2021 FMDL vertex/index, material instance, texture reference and bone-group decoder.
- [ ] Complete PES 2017 section 0/4/5 bone-group, mesh/material linkage and companion MTL/XML mapping.
- [ ] Expand FMDL LOD, mesh split, face-specific auxiliary and edge-case support.
- [ ] Skeleton, bone weights, facial morph/blendshape and auxiliary face data compatibility.
- [ ] Separate tested adapters for each direction.
- [x] Explicitly gate both directions until target writers and rig/weight retargeting exist; do not emit placeholder output.
- [ ] Round-trip and reference-scene regression tests.

## Phase 4 — preview, packaging and installation
- [x] Embedded interactive static geometry viewer with orbit/zoom controls for decoded MODEL and FMDL meshes.
- [ ] Textured material preview, face-part visibility controls, camera presets and facial-rig animation playback.
- [x] Single Face, Batch and Project work-mode UI with local folder intake and review queues.
- [x] Original KFC GODMODS brand artwork and Windows icon-generation pipeline.
- [x] Initial deterministic CPK writer and structural TOC/payload validator (not yet independently certified).
- [ ] Export profiles for both target games and face-ID/path validation.
- [ ] CPK validation against independent CRI tooling and actual PES 2017.
- [ ] Game install wizard: detect PES 2017 root and Download folder; preview all file operations.
- [ ] DpFileList integration through a verified supported generator/tool adapter.
- [ ] Automatic timestamped backups of replaced CPKs and DpFileList; restore/rollback workflow.
- [ ] Optional user-configured external tool adapters; never bundle tools without licence review.

## Phase 5 — premium face fidelity
- [ ] Head/neck alignment and seam QA.
- [ ] Eyes, eyelids, oral mesh, jaw and facial-animation compatibility.
- [ ] Hair alpha, normals, UVs, LOD/replay sharpness and colour-semantic preservation.
- [ ] Beard mesh and jaw-weight compatibility.
- [ ] Skin diffuse/alpha, normal and specular/roughness semantic mapping.
- [ ] Skeleton retargeting, bone weights, facial morph/blendshape and auxiliary face data.
- [ ] Animation regression fixtures and actual in-game close-up/replay testing.

## Phase 6 — release quality
- [x] Single-face, batch intake and local project-database workspaces.
- [ ] Batch conversion execution, resume/cancel, logs and conversion history.
- [ ] Windows installer, portable build, checksums and signed release metadata.
- [ ] Test against legally obtained sample assets and real target installations.
- [ ] Publish supported-format matrix and known limitations.

A phase is not complete merely because its UI exists. Each conversion capability requires fixtures, automated checks and target-game verification.


## Native engine integration (2026-11-13)

- [x] Pin and document dual-licensed upstream PES model conversion crates.
- [x] Add native CLI wrapper for single FMDL ↔ MODEL + MTL/SKL conversion.
- [x] Bundle native Windows executable in installer build and add native test gate.
- [ ] Integrate FPK/FPKD extraction and repacking around face package conversion.
- [ ] Resolve and convert all FTEX/DDS dependencies, material/shader semantics and face-diff data.
- [ ] Convert all face, hair, oral and auxiliary models as one atomic face package.
- [ ] Add FACE FORGE-owned real face package fixtures and round-trip tests in both directions.
- [ ] Verify generated packages in PES 2017 and PES 2021 in-game before unlocking batch/CPK.
