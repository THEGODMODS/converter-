# Engineering roadmap

## Phase 0 — foundations
- [x] Establish clean repository and product contract.
- [x] Define bidirectional PES 2017 ↔ PES 2021 scope.
- [ ] Desktop shell, typed IPC, safe file intake and project inventory.
- [ ] Automated tests and Windows CI.

## Phase 1 — reliable intake and inspection
- [ ] Drag/drop folders and ZIP archives.
- [ ] Safe archive extraction (path traversal, symlink, size and file-count defenses).
- [ ] Identify MODEL/DDS and FMDL/FTEX by signatures, paths and companion metadata.
- [ ] Face package report: models, textures, materials, IDs, missing dependencies.
- [ ] Project manifest and reproducible diagnostics.

## Phase 2 — texture conversion
- [ ] FTEX header/format research and independent decoder tests.
- [ ] DDS format/mipmap/alpha inspection.
- [ ] FTEX ↔ DDS conversion with channel, alpha and mip preservation where possible.
- [ ] Explicit unsupported-format reporting.

## Phase 3 — model conversion adapters
- [ ] Document PES 2017 MODEL structures and PES 2021 FMDL structures.
- [ ] Mesh topology, vertex attributes, UV sets, normals, tangents and material mapping.
- [ ] Skeleton, bone weights, facial morph/blendshape and auxiliary face data compatibility.
- [ ] Separate tested adapters for each direction.
- [ ] Round-trip and reference-scene regression tests.

## Phase 4 — preview and packaging
- [ ] Embedded 3D viewer with texture/material inspection.
- [ ] CPK writer, directory validation and manifest.
- [ ] Export profiles for both target games.
- [ ] Optional user-configured external tool adapters.

## Phase 5 — release quality
- [ ] Batch queue, resume/cancel, logs and conversion history.
- [ ] Windows installer, portable build, checksums and signed release metadata.
- [ ] Test against legally obtained sample assets and real target installations.
- [ ] Publish supported-format matrix and known limitations.

A phase is not complete merely because its UI exists. Each conversion capability requires fixtures, automated checks and target-game verification.
