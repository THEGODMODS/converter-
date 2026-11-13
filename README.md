# THEGODMODS FACE FORGE

Free, bidirectional PES face conversion studio.

**Targets:** PES 2017 (MODEL/DDS) ↔ PES 2021 (FMDL/FTEX).

> Status: engineering foundation. No conversion is reported as complete until its model, material, texture, skeleton and target-game validation gates pass.

## Product principles
- One clear drag-and-drop workflow for beginners; detailed diagnostics for advanced creators.
- Bidirectional conversion is a first-class requirement, not a reverse-export afterthought.
- Preserve originals; write to a new output folder; never silently overwrite.
- Detect real source formats from content and structure, not filename extensions alone.
- Report partial support honestly and fail closed on unsupported assets.
- Respect upstream licences and credits; do not bundle proprietary game assets or paid converter code.

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
Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
npm test
npm run build
```

## Safety and scope
The application does not include Konami game files, player likenesses, third-party face packs, or unlicensed proprietary utilities. Users supply their own assets and tools. CPK packaging is separate from model conversion: a valid archive alone does not prove a compatible face.

See [engineering roadmap](docs/ROADMAP.md), [format notes](docs/FORMATS.md), and [release gates](docs/RELEASE_GATES.md).
