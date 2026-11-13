# FACE FORGE implementation audit

Audit date: 2026-11-13  
Audited ref: `feature/face-rig-calibration-audit`  
Product target: Windows desktop, PES 2017 MODEL/DDS ↔ PES 2021 FMDL/FTEX

This audit describes the implementation in the repository, not the product ambition. A visible screen, parser, package writer or successful binary round-trip is not evidence that the game accepts a converted face.

## Executive result

**Release status: NOT READY.** The repository has a substantial engineering foundation and a limited native single-model conversion path. It does not yet provide a complete, fidelity-preserving, bidirectional face-folder converter. Batch and project screens are primarily intake/review workflows, not complete conversion workflows. No actual target-game validation is recorded.

## Confirmed implemented foundations

| Capability | Evidence in repository | Boundary |
|---|---|---|
| Electron/React desktop shell | `app/`, `electron/main.ts`, `electron/preload.ts` | Windows build must still pass current CI |
| Folder inventory and signatures | `engine/inventory.ts`, tests | No complete semantic package graph |
| PES 2017 MODEL container | `engine/formats/model-container.ts` | Section-level parsing is not full model semantic coverage |
| PES 2021 FMDL container | `engine/formats/fmdl-container.ts` | Preserves unknown blocks; not every block decoded |
| Initial geometry decoders | `engine/formats/model-geometry.ts`, `engine/formats/fmdl-geometry.ts` | LOD/split/auxiliary cases remain incomplete |
| Texture subset conversion | `engine/formats/texture.ts`, `electron/texture-bundle.ts` | Only supported encodings; semantic bindings and broad fixtures incomplete |
| MTL inspection | `engine/formats/mtl.ts` | Regex/XML subset, not a complete material/shader translator |
| Native semantic model bridge | `native/src/main.rs`, pinned upstream crates | Single model pairs and discovered multi-model inputs; not a complete face package |
| FACE diff inspection | `engine/formats/face-diff.ts` | Inspection only; no verified cross-generation writer/semantic transform |
| FPK/FPKD parsing and writer | `engine/formats/fpk.ts` | Reference tables are rejected; full archive metadata preservation unproven |
| Fox package output | `electron/package-builder.ts` | PES 2021 output only; requires already-converted files and does not prove game readiness |
| CPK writer/validator | `engine/packaging/cpk.ts` | Not independently certified by CRI tooling or target game |
| Geometry preview | `app/FacePreview.tsx` | Untextured geometry; no material/texture-semantic rendering |
| Manifest and project scan | `engine/manifest.ts`, `engine/database.ts` | Local UI persistence is not a complete durable conversion database |
| Rig analysis | `engine/model/rig-analysis.ts`, `engine/model/face-rig-calibration.ts` | Audit/reporting; no proven facial rig retargeter |

## Critical release blockers

### P0 — conversion correctness and data loss

1. **Whole-face package orchestration is incomplete.** The converter must treat head, neck, hair, beard, eyes, eyelids, oral/teeth/tongue, skeleton, face diff, XML/config and all referenced textures as one dependency graph. Current native conversion translates model candidates, not every semantic asset in the face.
2. **Package sidecar semantics are incomplete.** XML, face_diff, FOX scene and unknown members need explicit parse/map/write or safe preservation. The native package path previously accepted an archive and emitted only converted model outputs, risking silent loss of unhandled members. A fail-closed guard has now been added for members other than FMDL, SKL and FTEX; this deliberately blocks packages until their sidecars have converters.
3. **Face-diff conversion is not implemented.** The v5/v6 inspector is not a target writer. Eye placement, eyelid values, jaw/oral values, facial bone offsets and ear transforms cannot be copied or reinterpreted without verified coordinate and bind-pose conventions.
4. **Target serializers and semantic coverage are incomplete.** The upstream bridge covers supported model structures, but FACE FORGE has not demonstrated round-trip preservation for every mesh split, LOD, vertex channel, bone group, material, auxiliary face payload and morph/blendshape.
5. **Dependency rewriting needs package-wide guarantees.** Every material sampler and model reference must resolve to exactly one output asset after conversion. Case-insensitive collisions, shared references, package-relative paths, common-folder references and texture semantic conflicts must be reported and validated.
6. **No end-to-end real face fixture suite.** Current tests are mostly synthetic format fixtures and upstream model tests. FACE FORGE needs legally supplied, anonymized/redistributable real face-package fixtures for both generations, including hair/oral/auxiliary assets.

### P1 — user workflows

7. **Batch is not a conversion queue yet.** It needs bounded concurrency, per-item progress, cancellation, retry, resume, isolated failures, output validation and machine-readable reports.
8. **Project database is not production persistence.** Current renderer storage keeps a limited summary. A durable versioned database needs file hashes, conversion jobs, provenance, source/target versions, notes, statuses, output references, migrations and recovery.
9. **Preview is not fidelity QA.** Add texture loading, material/shader preview, alpha handling, channel inspection, face-part visibility, camera presets and before/after comparison. Facial animation playback needs actual animation data and rig support.
10. **Install and rollback are absent.** Add explicit game-root confirmation, path and version checks, install plan preview, timestamped backups, verified DpFileList adapter, atomic file replacement and tested rollback.

### P2 — packaging and release

11. **CPK writer is not independently certified.** Add an independent reader/extractor validation pass, compare entry hashes, test alignment/UTF/TOC edge cases and verify the produced archive in PES 2017.
12. **Fox package output needs stricter completeness gates.** Verify required models, SKL, XML/config, face diff and texture references; verify archive read-back and package pair consistency. Do not emit a package for a partial face.
13. **Windows release pipeline must be green.** CI must pass native tests, upstream engine tests, TypeScript typecheck, Vitest, app build, Windows installer build and installer-content verification. Release artifacts need checksums and a documented supported-format matrix.
14. **Game validation is mandatory.** Test both directions in actual PES 2017 and PES 2021 installations, including close-up/replay, eyes/blinks, mouth/jaw, hair alpha, beard, neck seam and lighting.

## UI and code-path observations

- `createConversionPlan` in `engine/model/adapters.ts` deliberately sets `executable: false` and adds a whole-face assembly blocker. This is correct; do not remove the gate merely to enable a button.
- The renderer's Batch mode queues scanned folders; it does not call a per-item conversion executor with progress/cancel/retry.
- The project-library summary is stored in renderer localStorage. It is not the full durable database described in the product spec.
- `FacePreview.tsx` creates a neutral untextured material for every mesh. It cannot judge skin/hair/material fidelity.
- The current package builder creates paired FPK/FPKD from already-converted files. It does not perform the conversion or validate the face's complete semantic dependency closure.
- The CPK builder is not an installation wizard and has no verified DpFileList transaction/rollback.
- The native bridge's model read-back is valuable structural validation, but it is not a substitute for an independent game parser or in-game test.

## Work added during this audit

- Native Fox-package conversion now rejects archive members outside the explicitly handled FMDL/SKL/FTEX subset instead of silently dropping XML, face-diff, FOX scene or unknown sidecar data.
- Rig calibration audit now detects invalid parent references and cycles, and measures hierarchy coverage over mapped landmarks.
- Synthetic regression tests cover the rig-audit cases. CI is pending for the current feature branch; no passing result is claimed here.

## Release acceptance checklist

A release candidate remains blocked until every applicable item is evidenced:

- [ ] Full face dependency graph and role classification, including package members.
- [ ] Explicit converters or lossless preservation for XML, face diff, SKL, FOX scene and all supported auxiliary files.
- [ ] Both directions decode → convert → encode → re-decode every supported asset.
- [ ] Texture references and material bindings all resolve after conversion.
- [ ] No unsupported source asset is silently skipped.
- [ ] Textured preview and part-by-part fidelity review.
- [ ] Batch execution with cancellation, retry and recovery.
- [ ] Durable project database and conversion history.
- [ ] CPK/FPK/FPKD independent read-back and entry-hash verification.
- [ ] Install preview, backup, verified DpFileList handling and rollback.
- [ ] Green Windows installer CI and artifact verification.
- [ ] Real target-game validation for PES 2017 and PES 2021.

**Do not describe FACE FORGE as complete, flawless, game-ready or fully bidirectional until these gates are passed.**
