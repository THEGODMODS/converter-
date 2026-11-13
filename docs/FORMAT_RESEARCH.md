# PES 2017 ↔ PES 2021 face-format research

This document records format facts used by FACE FORGE and separates published format knowledge from implementation assumptions. It is not a claim that either conversion direction is complete.

## PES 2017 MODEL

The community format specification in [the4chancup/pes-model-blender format.txt](https://github.com/the4chancup/pes-model-blender/blob/master/format.txt) documents PES 2016–2017 `.model` files:

- The file begins with `MODEL\0\0\0`, a header and a section StructArray. Versions 16–19 are documented; version 19 is common.
- Files may use a 16-byte WESYS zlib wrapper. The decompressed payload is the MODEL structure.
- Section 0 contains per-bone reference transforms and bone groups. Section 5 supplies bone names; group IDs map into those names/transforms.
- Section 1 contains vertex datum buffers, face-index buffers and optional LOD ranges. Face indices are uint16 triangle-list indices.
- Section 4 ties geometry to bone groups and rendering/material metadata.
- Section 5 contains bone names. Section 6 contains material names, while actual material/shader definitions are external in companion `.mtl` files.
- Some features (cloth, locator models, material combinations and unusual section layouts) are poorly understood or unsupported by the community parser.

**Implication:** a PES 2017 adapter cannot just copy vertex positions. It must preserve or translate vertex semantics, face indices, LODs, bone groups, reference transforms, material names and external MTL bindings. A missing MTL is a material reconstruction problem, not an empty texture slot.

## PES 2021 FMDL / FPK / FTEX

The PES Facemod community workflow documents the common PES 2021 face package:

- `face.fpk` contains model assets such as `face_high.fmdl`, `hair_high.fmdl`, and optionally `oral.fmdl`.
- Textures are commonly found under `sourceimages/#windx11`, with additional dependencies potentially located in shared/common folders.
- FMDL carries mesh geometry, vertex attributes, material instances, shader/texture references, bone data and bone groups. Face packages can also contain `face_diff.bin`, which holds face-specific positioning/scale data.
- FTEX supports multiple pixel formats and chunked/mipmapped payloads. The community FTEX implementation documents legacy formats 0–4 and newer formats 8–15; not every game/version uses every format.
- Existing Blender tooling relies on GzsTool for FPK extraction/repacking and on explicit FTEX/DDS conversion logic. The existence of a file named `face.fpk` is not evidence that its contents have been successfully decoded.

References:
- [leus/PesFacemod (MIT; archived)](https://github.com/leus/PesFacemod)
- [Syahroel Blender 4.5+ PES Face/Hair Modifier (MIT)](https://github.com/Syahroel/PES-eFootball-Face-Hair-Modifier-AddOns---Blender-4.5-Edition-Upgrade-By-Ruls)
- [MJTS face/hair modifier tools overview](https://pesnewupdate.com/pes-2019-facehair-modifier-tools/)

### FPK v2 container details

The current FPK reader follows the published FoxRe v2 layout: 48-byte header; 48-byte entry rows made of 32-bit offset/size/name fields separated by reserved words; 16-byte package-reference rows; NUL-terminated names; and 16-byte-aligned payloads. The reader verifies the file-size field, table bounds, reserved fields, MD5 of stored filename bytes, package references and safe virtual paths. Real Fox package paths commonly begin with `/Assets/`; this is a package virtual root and is normalized to a relative inventory path, never used as an operating-system absolute path.

The package reference table matters: FPK and FPKD can depend on sibling packages. A face conversion report must retain those dependencies rather than assuming that a single FPK is the entire asset. The public GzsTool project also documents unpack/repack support for FPK and FPKD. FACE FORGE does not bundle GzsTool; its native reader is tested against generated fixtures matching the published layout, and still requires a real PES face package round-trip test before production certification.

Reference: [FoxRe FPK / FPKD format layout](https://wannabecoderluc.github.io/foxre-wiki/formats/fpk/), [Atvaark GzsTool](https://github.com/Atvaark/GzsTool).

## Bidirectional translation requirements

### PES 2021 → PES 2017

1. Extract the FPK and resolve all model, texture, shared/common and face-diff dependencies.
2. Decode all required FMDL meshes and retain vertex attributes, UV sets, tangents, colors, material assignments, index buffers, LODs and bone weights.
3. Map the PES 2021 face bone names/groups/transforms to the PES 2017 bone-name/group/reference-transform representation. A name match alone is insufficient: bind pose, parent hierarchy, local/global transforms and weight indices must be compatible.
4. Convert FMDL material/shader/texture semantics into PES 2017 MODEL + MTL material definitions and supported DDS formats. Preserve alpha cutouts for hair/eyelashes and normal/specular data where the target shader supports them.
5. Handle face_diff eye placement/scale and any target-specific auxiliary records.
6. Serialize the target MODEL sections, WESYS wrapper where required, MTL and DDS dependencies; package only after a structural read-back succeeds.

### PES 2017 → PES 2021

1. Parse MODEL sections 0/1/4/5/6/7 and all supported per-mesh vertex streams, LODs, bone groups and reference transforms.
2. Resolve external MTL shader/material definitions and DDS texture dependencies before translation.
3. Map PES 2017 bone names and reference transforms to the PES 2021 FMDL skeleton/bone-group representation. Do not assume that same-named bones imply equivalent transforms.
4. Construct FMDL block tables, string tables, material instances, texture references, vertex/index buffers, bone groups and mesh/LOD references.
5. Convert DDS payloads to FTEX while retaining mip levels, compression format, color-space/normal-map semantics and alpha behavior.
6. Build the face FPK package, including required face-diff/auxiliary files, then read it back with an independent compatible tool.

## FACE FORGE implementation truth as of this research pass

- MODEL and FMDL container/header parsers exist; current geometry decoders are partial.
- The FPK reader currently accepts one understood Fox FPK layout and is covered by generated synthetic fixtures. It has **not** been certified against the user's actual `face.fpk` or against GzsTool output.
- FTEX/DDS conversion supports a subset and needs broader real-world format/mipmap/alpha fixtures.
- The preview currently renders static geometry. It is not yet a complete textured, rigged, animated face scene.
- No complete target MODEL/FMDL serializer, cross-generation skeleton/weight retargeter, FPK repacker, or game-validated end-to-end converter is complete.
- A folder scan or successful header parse is an inventory result, not proof of convertibility.

## Release gates

A direction may be marked conversion-ready only after all of the following are present:
- legally obtained real source fixtures for each supported model/material/texture variation;
- semantic decode and encode round-trip tests with unknown-block preservation where applicable;
- bone hierarchy, bind/reference transforms, normalized weight and index-range checks;
- texture decode/encode image comparisons, mip/alpha/color-space checks;
- output package read-back by an independent tool;
- in-game PES 2017 / PES 2021 testing, including close-up, replay, eye/mouth and hair transparency checks.

Until then the UI must report the specific blockers and keep conversion output disabled.
