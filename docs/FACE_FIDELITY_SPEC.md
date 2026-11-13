# FACE FORGE — Face Fidelity & Compatibility Specification

Product owner: KFC GODMODS  
Product: THEGODMODS FACE FORGE  
Target: Windows desktop · PES 2017 ↔ PES 2021  
Promise: Free to use. No paid-converter dependency. No false "game-ready" status.

## User workflows

### Single Face
- Drop or browse one extracted face project.
- Detect the source generation and all companion assets.
- Show a compatibility report before conversion.
- Convert into a separate output folder; never modify the source.
- Open a 3D review scene with orbit, pan, zoom, wireframe/solid/material modes, texture-channel inspection and before/after comparison.
- Let the user correct supported mapping/scale/texture choices and rebuild.
- Export a validated target project and optionally a CPK.

### Batch
- Select many independent face folders.
- Show a per-face queue with source generation, model/texture counts, warnings and progress.
- Run the exact same conversion pipeline as Single Face for each item.
- Isolate failures so one bad face does not corrupt or cancel other jobs.
- Support pause, resume, cancel, retry failed items and export a batch report.
- Never silently skip unsupported files.

### Project
- Maintain a searchable face database with player label, source path, source/target generation, asset hashes, conversion version, status and notes.
- Detect duplicate IDs and conflicting output paths.
- Select a group of validated faces and build one CPK.
- Preview the exact archive file list and destination paths before packaging.
- Verify the CPK by reopening it with an independent parser and compare every entry hash.

## Installation and recovery

- Detect the PES 2017 installation and Download directory, but require the user to confirm the selected game root.
- Show the exact CPK filename, destination, DpFileList order and conflicts before applying changes.
- Create timestamped backups of any replaced CPK and DpFileList file before writing.
- Integrate with a verified DpFileList Generator or documented compatible workflow; do not guess at undocumented binary edits.
- Validate that the generated CPK can be listed and extracted before installation.
- After installation, show a transaction report and offer one-click rollback from the backup.
- Never delete a user's existing mod or overwrite a file without an explicit confirmation.

## Face and hair fidelity requirements

| Feature | Required behaviour | Acceptance evidence |
|---|---|---|
| Head and neck | Preserve face proportions, neck seam alignment, scale, pivot and skin continuity | Front/side/three-quarter review and in-game close-up; no visible seam |
| Eyes and eyelids | Preserve eye object placement, eyelid geometry, eye materials and required facial rig links | Eye alignment at rest and during blink/eyelid animation |
| Mouth and oral | Preserve oral mesh, teeth/tongue assets, jaw linkage and mouth animation | Open/close, speech and expression animation tests without clipping |
| Hair geometry | Preserve strand-card layout, alpha coverage, normals, UVs and LODs where present | Replay/camera-distance review; no blocky alpha, flicker or missing cards |
| Hair colour | Map diffuse, alpha, specular/roughness and colour-space semantics without tint shifts | Side-by-side source/target texture and rendered colour comparison |
| Beard | Preserve beard mesh, alpha, weights and jaw/mouth-related rigging where authored | Mouth/jaw animation test; no detached or rigid beard |
| Skin | Preserve diffuse/alpha, normal and specular/roughness intent | Neutral-light review; no plastic skin, crushed pores or inverted normal details |
| Facial rig | Preserve required bones, parent hierarchy, inverse bind transforms, weights and morph/blendshape data | Bone/weight validation and animation regression suite |
| Shading | Rebuild target-game material/shader semantics rather than copying incompatible shader identifiers | Rendered material preview and in-game lighting check |

A feature is not "supported" because a similarly named file was copied. It must be decoded, mapped, re-encoded and verified.

## Conversion architecture

1. Inventory the complete face package: face/head, neck, hair, oral, eyes/eyelids, textures, material metadata, skeleton/face-diff data, LODs and package metadata.
2. Decode source assets into the versioned canonical FaceScene representation.
3. Preserve source chunks/metadata that are understood to be safe; record every dropped or transformed field.
4. Convert coordinate systems, units, handedness, vertex layouts, UV sets, tangent basis, index buffers, mesh splitting and material slots explicitly.
5. Retarget skeletons and facial controls using documented bone maps. Never guess a missing bone or silently normalize away authored animation data.
6. Convert texture encoding and semantic channels independently (diffuse/alpha, normal, specular/roughness, eye, hair).
7. Encode target-generation assets and re-parse them with the target reader.
8. Render the target scene in the preview and compare against source/reference renders.
9. Package only after all required gates pass.

## Release gates

A direction is "supported" only after:
- redistributable, legally supplied fixtures cover each supported source schema/version;
- source parser and target writer have unit, fuzz and malformed-input tests;
- round-trip tests preserve supported mesh attributes, material references, skeleton data and morph targets;
- texture fixtures cover alpha, channel order, colour spaces, mipmaps, cube/volume cases and supported compression formats;
- preview tests check face, neck, eyes, oral, hair and beard separately;
- independent CPK tooling can list and extract the produced archive with matching hashes;
- a human tester verifies the face in the actual target game, including replays and facial animation.

Unsupported versions and features must be reported in the UI. No "flawless" or "100% compatible" claim until a broad real-world test matrix supports it.

## Research and clean-room implementation notes

Community documentation describes the common generation split as PES 2014–2017 MODEL/DDS and PES 2018–2022 FMDL/FTEX. It also documents face, hair and oral as separate model assets, with material, shader, skeleton, bone-group and bounding-box data; face_diff.bin may carry eye-position data. These are reasons to treat a face as a package, not a lone head mesh.

Useful research:
- PES Classic Editor conversion overview: https://pesclassiceditor.wordpress.com/2022/09/26/convertir-faces-de-fmdl-ftex-2018-2022-a-model-dds-2014-2017/
- PES Face/Hair Modifier community project: https://github.com/MjTs140914/PES_Face_Hair_Modifier
- Updated Blender 4.5+ community edition and feature notes: https://github.com/luckyfacemaker/PES_Face_Hair_Modifier

Research update: the pinned Unlimited Tool Works revision exposes a canonical model IR, FMDL and PES MODEL import/export, material translation, version-specific skeleton retargeting and structured loss findings. Its Team compiler also demonstrates the package-level work a complete converter needs: multi-model pairing, texture lookup and relocation, model merging, face XML/diff handling, texture codec selection, and validation before CPK emission. That compiler is a full team-export pipeline, not a drop-in single-face-folder API; FACE FORGE must not claim it has inherited that complete workflow merely by depending on model_convert. The FPK/FPKD format uses the same Fox package structure with a distinct kind marker; a companion FPKD may contain scene data such as .fox2 and should be preserved/understood, not blindly treated as a model. A `.kpfd` extension is not accepted as FPKD without a validated foxfpk signature.\n\nReferences: [Unlimited Tool Works model conversion and Team compiler](https://github.com/the4chancup/unlimited-tool-works), [GzsTool FPK/FPKD reader/writer](https://github.com/Atvaark/GzsTool), [PES Face/Hair Modifier](https://github.com/MjTs140914/PES_Face_Hair_Modifier), [PES MODEL format notes](https://github.com/the4chancup/pes-model-blender/blob/master/format.txt). The upstream project is dual-licensed MIT OR Apache-2.0; retain its authoritative notices. Do not copy paid converter binaries, game assets or proprietary data. FACE FORGE remains an original KFC GODMODS application.
