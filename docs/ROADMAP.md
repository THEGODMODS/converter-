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
- [ ] Face package report: models, textures, materials, IDs, missing dependencies.
- [ ] Project manifest and reproducible diagnostics.

## Phase 2 — texture conversion
- [ ] FTEX header/format research and independent decoder tests.
- [x] DDS header inspection for common legacy and DX10 formats.
- [x] Initial FTEX ↔ DDS container conversion for supported formats, mip levels and compressed payloads (needs broad fixture coverage and game testing).
- [ ] Explicit unsupported-format reporting.

## Phase 3 — model conversion adapters
- [x] Parse and serialize PES 2017 MODEL section containers, including ESYS zlib wrappers.
- [x] Parse and serialize PES 2021 FMDL block containers while preserving unknown blocks.
- [ ] Decode PES 2017 MODEL mesh, material and skeleton structures.
- [ ] Decode PES 2021 FMDL mesh, material and skeleton structures.
- [ ] Mesh topology, vertex attributes, UV sets, normals, tangents and material mapping.
- [ ] Skeleton, bone weights, facial morph/blendshape and auxiliary face data compatibility.
- [ ] Separate tested adapters for each direction.
- [ ] Round-trip and reference-scene regression tests.

## Phase 4 — preview, packaging and installation
- [ ] Embedded 3D viewer with texture/material inspection and source/target comparison.
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
- [ ] Batch queue, resume/cancel, logs and conversion history.
- [ ] Windows installer, portable build, checksums and signed release metadata.
- [ ] Test against legally obtained sample assets and real target installations.
- [ ] Publish supported-format matrix and known limitations.

A phase is not complete merely because its UI exists. Each conversion capability requires fixtures, automated checks and target-game verification.
