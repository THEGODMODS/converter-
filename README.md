# THEGODMODS FACE FORGE

Free, bidirectional PES face conversion studio by KFC GODMODS.

**Targets:** PES 2017 (MODEL/DDS) ↔ PES 2021 (FMDL/FTEX).

> Status: engineering foundation. No conversion is reported as complete until its model, material, texture, skeleton and target-game validation gates pass.

## Product principles
- One clear drag-and-drop workflow for beginners; detailed diagnostics for advanced creators.
- Bidirectional conversion is a first-class requirement, not a reverse-export afterthought.
- Preserve originals; write to a new output folder; never silently overwrite.
- Detect real source formats from content and structure, not filename extensions alone.
- Report partial support honestly and fail closed on unsupported assets.
- Respect upstream licences and credits; do not bundle proprietary game assets or paid converter code.

## Current implementation status

The initial desktop shell, local face-folder inventory, binary header inspection, PES 2017 MODEL section-container parser/writer (including ESYS compression), PES 2021 FMDL block-container parser/writer (preserving unknown blocks), FTEX ↔ DDS conversion for a supported format subset, FACE diff eye/oral placement inspection, single/batch/project workspaces, original KFC GODMODS branding and Windows icon pipeline, canonical face-scene validation contract, and initial CPK writer/validator are committed on the development branch.

**The complete face conversion is not ready yet.** We can now decode initial geometry in both source generations and review it in a static 3D viewport, but we do not yet have complete bidirectional target writers, PES 2017 bone-group/material linkage, face animation/morph transfer, textured preview, or in-game verification. Conversion buttons remain disabled. The CPK writer is an initial implementation and is not certified by independent CPK readers or either game.

## Product modes
- **Single Face:** inspect one face project and review conversion readiness.
- **Batch:** queue multiple face folders for independent inspection.
- **Project:** maintain a local face collection and prepare a future combined CPK build.

The current modes provide intake and review workflows; actual face conversion, 3D preview, persistent project database, batch execution and game installation are not yet complete.

See the [face fidelity specification](docs/FACE_FIDELITY_SPEC.md) for the head/neck, eyes/eyelids, mouth, hair, beard, skin, rig, CPK and safe installation acceptance requirements.

## Architecture
- `app/`: React desktop UI.
- `electron/`: isolated desktop main process and typed IPC.
- `engine/`: format detection, project inventory, conversion planning, validation and adapter contracts.
- `docs/`: format research, compatibility matrix, security and release gates.
- `tests/`: fixtures and regression tests (only redistributable/original fixtures).

## Conversion pipeline
1. Import folder/archive and build a bounded, safe inventory.
2. Detect PES generation and face package structure.
3. Validate required model, texture, material and auxiliary files.
4. Build a conversion plan with explicit supported/unsupported operations.
5. Decode textures and convert only supported encodings.
6. Convert geometry/material data through versioned adapters.
7. Validate output structure and hashes.
8. Preview supported assets and package to CPK only after validation.

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

The current FACE FORGE UI exposes **single model-pair conversion** only: choose one `.fmdl`
or `.model`, supply its required companion material/skeleton data, and write the translated
model into a separate empty output directory. This is not yet full face-folder conversion.
FPK/FPKD extraction/repacking, FTEX/DDS package dependency resolution, face-diff mapping,
complete multi-model face package assembly, and in-game verification remain separate release
gates. Batch and CPK conversion stay locked until those gates pass.
