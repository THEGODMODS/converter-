# THEGODMODS FACE FORGE

PES face conversion studio by KFC GODMODS.

**First-release target:** PES 2021 (FMDL/FTEX) → PES 2017 (MODEL/DDS). PES 2017 → PES 2021 is marked **In Development** and remains disabled until this direction is proven.

> Status: pre-release. The complete-folder pipeline is integrated with the pinned Unlimited Tool Works Team Compiler and independently checks the generated team CPK and nested player-face CPK. A complete real head-face fixture and PES 2017 in-game acceptance test are still required before claiming production readiness.

## Product principles
- One clear drag-and-drop workflow for beginners; detailed diagnostics for advanced creators.
- Finish and validate PES 2021 → PES 2017 before starting reverse conversion.
- Preserve originals; write to a new output folder; never silently overwrite.
- Detect real source formats from content and structure, not filename extensions alone.
- Report partial support honestly and fail closed on unsupported assets.
- Respect upstream licences and credits; do not bundle proprietary game assets or paid converter code.

## Current implementation status

The desktop shell, face-folder inventory, binary inspection, PES 2017 MODEL and PES 2021 FMDL parsers, supported FTEX/DDS conversion, FACE diff inspection, FPK/FPKD extraction, native model conversion and Windows installer pipeline are implemented. The single-face route stages a PES 2021 folder, extracts paired Fox archives, validates FMDL/SKL/FTEX/FACE diff inputs, delegates the full player-folder conversion and package build to the pinned Team Compiler, then independently reopens the outer team CPK and nested player-face CPK and hashes their entries.

**Release status remains pre-release.** The repository's upstream `79205` archive fixture is hair-only and correctly fails the required-head check. CI also exercises a synthetic structural package fixture; this proves the conversion and packaging pipeline can run, not that the synthetic geometry is a usable face. A complete real head-face package and PES 2017 in-game validation are still outstanding. Textured/animated preview, batch execution, install/rollback and reverse conversion are not first-release capabilities.

## Product modes
- **Single Face:** inspect one face project and review conversion readiness.
- **Batch:** queue multiple face folders for inspection; batch conversion is not enabled.
- **Project:** maintain a local face collection for review; this is not a conversion queue.

Only Single Face performs the first-release PES 2021 → PES 2017 conversion. Preview is static and does not prove material, animation or in-game fidelity. Batch execution, durable project storage and game installation/rollback remain future work.

See the [face fidelity specification](docs/FACE_FIDELITY_SPEC.md) for the head/neck, eyes/eyelids, mouth, hair, beard, skin, rig, CPK and safe installation acceptance requirements.

See the [full evidence-based implementation audit](docs/IMPLEMENTATION_AUDIT.md) for the current release blockers and acceptance checklist.

## Architecture
- `app/`: React desktop UI.
- `electron/`: isolated desktop main process and typed IPC.
- `engine/`: format detection, project inventory, conversion planning, validation and adapter contracts.
- `docs/`: format research, compatibility matrix, security and release gates.
- `tests/`: fixtures and regression tests (only redistributable/original fixtures).

## Conversion pipeline
1. Import the source face folder and build a bounded, safe inventory.
2. Extract paired FPK/FPKD archives and validate the PES 2021 head model, other FMDLs, skeletons, textures and FACE diff.
3. Stage the source into an isolated Team Compiler workspace.
4. Convert the player folder's models, materials and textures through the pinned native engine.
5. Build the PES 2017 player-face CPK inside the outer team CPK.
6. Independently read both CPK levels, verify required head assets and preserved sidecars, and record per-entry SHA-256 hashes.
7. Publish to a separate empty output folder only after validation.
8. Validate the generated package in PES 2017 before treating it as game-ready.

## Development
Requires Node.js 24+ and npm.

```bash
npm install
npm run dev
npm test
npm run build
```

## Safety and scope
The application does not include Konami game files, player likenesses, third-party face packs, or unlicensed proprietary utilities. Users supply their own assets and tools. CPK packaging is separate from model conversion: a valid archive alone does not prove a compatible face.

See [engineering roadmap](docs/ROADMAP.md), [format notes](docs/FORMATS.md), and [release gates](docs/RELEASE_GATES.md).


## Native model conversion bridge

FACE FORGE now bundles a pinned native conversion bridge backed by the dual-licensed
[Unlimited Tool Works](https://github.com/the4chancup/unlimited-tool-works) model conversion
crates (revision `ca4fe4a32500ffc2d932a1a669a42a6f932d571a`). This engine provides PES FMDL and
PES MODEL semantic import/export, a canonical model representation, material translation and
version-specific skeleton retargeting. Its upstream test suite includes real PES 2017 and PES
2021 model fixtures. Licence notices are in `native/UPSTREAM_NOTICES.md`.

The current FACE FORGE UI exposes **single-face folder conversion** for PES 2021 → PES 2017. It uses the pinned Team Compiler for multi-model conversion and CPK package assembly, then performs independent archive read-back and hash verification. The reverse route is visibly marked **In Development** and remains disabled. The release still requires a complete real head-face fixture and target-game validation; the synthetic CI package test is structural only. Batch conversion, textured preview, game installation/rollback and reverse conversion are not enabled.
