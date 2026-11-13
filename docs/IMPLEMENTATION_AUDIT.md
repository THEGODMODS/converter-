# FACE FORGE implementation audit

Audit date: 2026-11-13  
Audited ref: `feature/face-rig-calibration-audit`  
Product target: Windows desktop, PES 2017 MODEL/DDS ↔ PES 2021 FMDL/FTEX

This audit describes the implementation in the repository, not the product ambition. A visible screen, parser, package writer or successful binary round-trip is not evidence that the game accepts a converted face.

## FACE diff handling update

- Fox package conversion now accepts the explicitly recognized `face_diff.bin` sidecar; unrelated `.bin`, XML, scene and unknown members remain blocked.
- For PES 2017 output from an FPK, emit a `face.xml` even when the optional FACE diff is absent. The XML uses the documented model-role table: `face_high` maps to `face_neck`; `hair_high` and `oral` map to `parts`. Emitted pre-Fox model filenames use `oral_<stem>_win32.model`, and XML paths use the wildcard platform spelling. When a FACE diff is present, validate supported v4/v5/v6 record tables and preserve the original payload byte-for-byte as Base64 in `<dif>`. This is preservation, not a semantic v5/v6-to-v4 rig transform.
- The generated legacy XML explicitly registers supported `face_high`, `hair_high` and `oral` model stems with their converted MTL companions. Unsupported model stems fail closed.
- This is byte-preserving format wrapping, not a claimed v5-to-v4 rig transform. It still requires PES 2017 in-game validation for the user's package; no game-level success is claimed.

## FACE diff fixture findings and safety boundary

The pinned upstream Unlimited Tool Works repository contains independently sourced binary fixtures for legacy FACE v4 (944 bytes) and newer FACE v5 (960 bytes). Inspecting their headers shows that record counts are not safely inferred from the version integer alone: the v4 fixture declares 32 16-byte records plus six 32-byte records; one v5 fixture also declares 32 plus six and carries 16 trailing bytes; another v5 fixture declares 33 plus six and uses the full 960-byte count-derived extent. The observed v4 profile uses 32 16-byte records followed by six 32-byte records. The observed v5 profiles include both 33 + 6 (33 16-byte records followed by six 32-byte records) and 32 + 6 where the first second-block entry is 16 bytes and the remaining five are 32 bytes. The TypeScript and native validators recognize and range-check only these evidenced layouts; unknown profiles are not assigned guessed record extents. Auxiliary semantics other than the two independently documented eye-position records remain opaque.

The public PES-FMDL issue documents the 16 scalar values (eye scale, eye rotations, eyelids and oral offset) and a facial-bone position list, but its list numbering omits item 17. The face/hair add-on also reads eye-position vectors at fixed offsets 0x150 and 0x160. These references are useful, but they do not establish a complete, version-specific mapping for every v4/v5/v6 record, nor the coordinate and bind-pose transforms needed to translate between generations. No v4↔v5/v6 writer is enabled on this evidence.

## External format research

The converter already pins the native model engine from `the4chancup/unlimited-tool-works` at revision `ca4fe4a32500ffc2d932a1a669a42a6f932d571a`. Its model-conversion library provides a canonical IR, FMDL and pre-Fox import/export, per-version skeleton retargeting, material-family mapping and structured loss findings. The upstream repository is dual-licensed MIT/Apache-2.0 for code, but its own README describes the wider suite as in development; it is an engine dependency, not proof that FACE FORGE's face-package workflow is complete.

Additional references inspected:
- `the4chancup/pes-model-blender`: PES 2016–2017 MODEL container and mesh format documentation.
- `the4chancup/pes-fmdl-blender`: FMDL parsing/export and FACE-diff issue discussion.
- `MjTs140914/PES_Face_Hair_Modifier`, `leus/PES_Face_Hair_Modifier`, and the updated `luckyfacemaker/PES_Face_Hair_Modifier`: face/hair/oral FMDL import/export, FPK workflows, FTEX handling and eye positioning from FACE diff.
- `the4chancup/unlimited-tool-works` face compiler specs: legacy model role mapping, `face.xml` `<dif>` Base64 semantics, model filename affixes and the per-face package contents.

Integration decision: reuse the pinned native IR conversion engine and independently test its behavior in FACE FORGE. Treat the Blender projects as format/behavior references, not runtime dependencies. Preserve attribution and each upstream license if any source is ever incorporated. No upstream binary, game data or executable is redistributed by this audit.

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
2. **Package sidecar semantics are incomplete.** XML, face_diff, FOX scene and unknown members need explicit parse/map/write or safe preservation. The native package path previously accepted an archive and emitted only converted model outputs, risking silent loss of unhandled members. The Fox-to-PES 2017 package path accepts FMDL, same-virtual-path companion SKL and FTEX members. In the Electron workflow, the native bridge converts models and the dependency-aware texture stage converts each resolved FTEX dependency to DDS at the material sampler's rewritten target path; the native CLI can also convert embedded FTEX members directly when not using the external texture stage. The package guard rejects unsafe paths, orphan SKL members, case-insensitive duplicate paths and all unhandled members (including FACE diff, XML and FOX scene data). This is still not a complete face package: FACE diff and metadata semantics remain unsupported and intentionally block conversion.
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

- Native Fox-package conversion now validates the complete member set, converts FMDL/SKL models and resolves FTEX dependencies through the Electron texture stage (including embedded FPK members), and rejects XML, face-diff, FOX scene and unknown sidecars instead of silently dropping them. It normalizes the format's canonical `/Assets/...` entry prefix before writing, and rejects other absolute/traversal paths, orphan skeletons and case-insensitive duplicate virtual paths. Regression coverage now exercises embedded FPK texture extraction and conversion. Package-wide material-reference equivalence still needs real face fixtures and target-game validation.
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
