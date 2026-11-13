# FACE FORGE implementation audit

Audit date: 2026-11-13  
Audited ref: `feature/face-rig-calibration-audit`  
First release target: Windows desktop, PES 2021 FMDL/FTEX → PES 2017 MODEL/DDS (reverse direction deferred)

This audit describes the implementation in the repository, not the product ambition. A visible screen, parser, package writer or successful binary round-trip is not evidence that the game accepts a converted face.

## First-release scope: PES 2021 → PES 2017

The reverse PES 2017 → PES 2021 route is intentionally disabled in the UI and rejected at the complete-folder IPC/native boundary. Work is focused on one route until it has real-package and in-game evidence.

The complete-folder path stages a single source face for the pinned Unlimited Tool Works Team Compiler. Before compilation, FACE FORGE now requires a valid `face_high.fmdl`, parses every FMDL and its internal references, validates supplied SKL and FTEX files, rejects legacy MODEL/MTL inputs and structurally validates an optional `face_diff.bin`. The report records model paths, texture count, whether a source FACE diff was supplied, and sidecars such as `.fclo` that the pre-Fox target does not represent.

The compiler's PES 2017 output is a team CPK containing a nested player-face CPK. The Electron publish gate independently reopens both archive levels and requires `face.xml`, `oral_face_high_win32.model` and `face_high.mtl` inside the nested face CPK. It records SHA-256 hashes for entries at both levels. This is archive and core-asset verification, not proof of every dependency or target-game acceptance.

### FACE diff correction from upstream test evidence

The earlier assumption that every PES 2021 FACE v5 payload must be semantically rewritten into a v4 payload before PES 2017 packaging is not supported by the pinned Team Compiler's implementation. At revision `ca4fe4a32500ffc2d932a1a669a42a6f932d571a`, `crates/tools/team_compiler/src/face_diff.rs` validates the FACE magic and count-derived minimum length without gating on the version word. Its `tests/cli/prefox_faces.rs::a_player_s_face_model_compiles_into_its_face_cpk_with_the_generated_face_xml` test compiles a Fox-source player face for PES 2017 and asserts that the source `face_diff.bin` is preserved byte-for-byte inside the generated `face.xml` `<dif>`. FACE FORGE follows that proven upstream packaging behavior: structural validation, then lossless Base64 wrapping. No invented bone remap is applied. Actual PES 2017 in-game acceptance of our assembled output still must be tested.

## FACE diff handling update

- Fox package conversion now accepts the explicitly recognized `face_diff.bin` sidecar; unrelated `.bin`, XML, scene and unknown members remain blocked.
- For PES 2017 output from an FPK, emit a `face.xml` even when the optional FACE diff is absent. The XML uses the documented model-role table: `face_high` maps to `face_neck`; `hair_high` and `oral` map to `parts`. Emitted pre-Fox model filenames use `oral_<stem>_win32.model`, and XML paths use the wildcard platform spelling. When a FACE diff is present, validate supported v4/v5/v6 record tables and preserve the original payload byte-for-byte as Base64 in `<dif>`. This is preservation, not a semantic v5/v6-to-v4 rig transform.
- The generated legacy XML explicitly registers supported `face_high`, `hair_high` and `oral` model stems with their converted MTL companions. Unsupported model stems fail closed.
- This is byte-preserving format wrapping, not a claimed v5-to-v4 rig transform. It still requires PES 2017 in-game validation for the user's package; no game-level success is claimed.

## FACE diff fixture findings and safety boundary

The upstream Unlimited Tool Works repository contains real FACE binary fixtures: a 944-byte v4 file and 960-byte v5 files. The 960-byte v5 data is not one universal record-count profile: the checked fixtures include 33 + 6 canonical records and a 32 + 6 variant with a 16-byte first entry in the second block. The TypeScript and native validators recognize only the observed v4/v5 layouts and do not assign guessed extents to unknown profiles.

A second, substantially more complete reverse-engineering source is the [GodotFootball PES 2021 face report](https://github.com/zocram4cc/GodotFootball/blob/986303d57edbaf901a25ffa98ba1a574e1e68538/docs/re/pes-re-face.md). It documents the canonical PES 2021 v5 960-byte layout from runtime and 60 vanilla samples: 16 scalar calibration values; 33 facial offsets in `sk_head` local space; six ear transforms; the exact 33-bone order and six ear-bone order; and the jaw relationship `jawOffset = R_head * skf_jawOffset`, with `R_head * [x,y,z] = [-z,x,-y]`. It also reports the face_diff offsets matching the scanned face model's `skf_*` bone positions within 4e-5 m across 16 vanilla packs.

FACE FORGE now decodes the full canonical v5 33+6 profile, including named facial and ear records, checks the jaw relationship, and exposes those landmarks to the rig audit. It only decodes the two independently documented eye-position records for other observed profiles; remaining records stay opaque. The older 32+6/v4 data still lacks a verified semantic record map, and v6 has no independently validated binary fixture in this project. Therefore no v4↔v5/v6 retarget is claimed or enabled yet.

The PES-FMDL issue [#1](https://github.com/the4chancup/pes-fmdl-blender/issues/1) independently documents the 16 scalar fields and facial-bone names; its list omits the label 17, while the runtime-derived GodotFootball order resolves the missing `skf_cheek_r` entry. The Blender add-on reads eye-position vectors at fixed offsets 0x150 and 0x160, consistent with the eye records decoded here.

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

1. **Whole-face package orchestration is integrated for the first direction but not yet proven complete.** The single-face route stages the source through the pinned Team Compiler, which converts FMDL models/materials and FTEX textures, builds the PES 2017 nested face CPK and writes face.xml. FACE FORGE now checks the head model, companion formats and both archive levels. It still needs real-package dependency-closure tests and in-game validation for hair, oral, beard, eyes and all optional assets.
2. **Package sidecar semantics are incomplete.** XML, face_diff, FOX scene and unknown members need explicit parse/map/write or safe preservation. The dedicated first-direction folder route extracts FPK/FPKD members, validates FMDL/SKL/FTEX and FACE diff, and delegates model/material/texture/package conversion to Team Compiler. The generic low-level FPK path remains narrower and rejects unhandled sidecars. The complete-folder report identifies .fclo sidecars that the pre-Fox target does not represent; the app surfaces these as losses instead of claiming they were preserved.
3. **FACE diff semantic retargeting is not required by the current PES 2021 → PES 2017 Team Compiler route.** The pinned upstream compiler preserves the source FACE payload byte-for-byte as the legacy XML `<dif>` and has a PES 2017 compile regression test for this behavior. FACE FORGE validates structure and preserves the payload; target-game acceptance of the generated package remains unverified. Do not generalize this behavior to the reverse direction.
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
- The complete-folder Electron path now independently reopens the Team Compiler's outer CPK and nested player-face CPK before publishing. It requires face.xml, oral_face_high_win32.model and face_high.mtl in the nested archive and records entry hashes for both archive levels. This is structural/core-asset verification; it does not prove all model/material references resolve or that PES 2017 accepts the face in-game.
- The native bridge's model read-back is valuable structural validation, but it is not a substitute for an independent game parser or in-game test.

## Work added during this audit

- Added nested CPK verification for the Team Compiler's real output shape and regression tests for missing nested archives, face.xml, head model and head MTL. Both outer and nested entries receive SHA-256 hashes. These changes are awaiting CI and do not certify target-game compatibility. The UI, IPC and native complete-folder command now expose only PES 2021 → PES 2017 for the first release.

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
