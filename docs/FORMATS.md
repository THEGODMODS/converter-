# Format research notes

## Known generation split
Community format references describe PES 2014–2017 face assets as MODEL + DDS and PES 2018–2022 face assets as FMDL + FTEX. Typical PES 2018–2021 workflows use FMDL/FPK model containers and FTEX textures. These labels describe families, not a guarantee that every patch or face uses an identical schema.

## Commonly observed face assets
- Newer generation: `face_high.fmdl`, `hair_high.fmdl`, `oral.fmdl`, `.ftex` textures and FPK containers.
- Older generation: `.model` mesh assets, material metadata and DDS textures. Some MODEL files use a 16-byte ESYS-prefixed zlib wrapper before the uncompressed MODEL stream; detection must validate the decompressed header and bound output size.
- Texture naming conventions vary; examples include face diffuse/alpha, normal, specular/roughness, hair and oral maps.
- Face packages may include `face_diff.bin` with a `FACE` signature. The current reader validates and extracts stable eye-scale, mouth-position, and left/right eye-position vectors at documented offsets. These values are retained in PES-native component order; coordinate conversion and any eyelid/facial-rig rewrite remain separate, fixture-gated work.

## Conversion is not extension renaming
A working adapter must understand the binary model schema and translate mesh buffers, vertex layouts, indices, UVs, normals, tangents, materials, skeleton/bone weights and any face-specific auxiliary data. Texture conversion must preserve supported compression, channel order, alpha semantics and mip levels. A CPK is only a delivery container.

## Geometry and rig details that affect conversion

The PES 2017 MODEL format reference describes a StructArray-based container whose sections carry different structures. A MODEL mesh does not itself contain shader settings; those are generally resolved from companion MTL metadata. The MODEL file also does not define a complete animation skeleton: it references bone names and stores reference orientations. This means a correct adapter must resolve companion material and rig data rather than treating MODEL as a self-contained face.

The FMDL ecosystem exposes explicit block families for bone definitions, mesh groups and assignments, mesh information, material instances, bone groups, texture/material assignments, mesh/vertex format definitions, strings, bounding boxes, buffer offsets, LODs and face indices. Vertex layouts can include multiple UV channels, weights, bone-group IDs and auxiliary data. The decoder must preserve or explicitly report semantics it does not understand.

The FACE diff binary can contain eye-scale and eye/mouth placement data. It must be included in project inventory and mapped with validated coordinate transforms; a file copy alone does not guarantee eye alignment.

These findings directly inform the canonical scene and acceptance tests: face, hair and oral are separate mesh groups; companion MTL/material data, bone groups, eye placement, multiple UVs, LODs and animation-related weights all matter.

## Research references
- PESClassicEditor format comparison and workflow: https://pesclassiceditor.wordpress.com/2022/09/26/convertir-faces-de-fmdl-ftex-2018-2022-a-model-dds-2014-2017/
- Community PES FMDL/FTEX Blender tooling (inspect upstream licence and credits before integration): https://github.com/MjTs140914/PES_Face_Hair_Modifier
- PES 2017 MODEL binary format reference: https://github.com/the4chancup/pes-model-blender/blob/master/format.txt
- PES 2021 FMDL skeleton and vertex-block definitions: https://github.com/pes-modding/fmdl-tools/blob/master/fmdl_skel.py
- PES FMDL importer mesh/UV/bone-weight implementation: https://github.com/PanosPasch/pes-fmdl/blob/master/fmdl_import.py
- PES face/hair modifier and texture workflow background: https://pesnewupdate.com/pes-2019-facehair-modifier-tools/

## Implementation policy
Use clean-room format documentation and original tests. Integrate upstream code only when its licence explicitly permits the intended use; preserve notices and attribution. Do not bundle proprietary game files or paid converter code. Unknown chunks must be preserved when safe or cause a clear unsupported result; never silently discard them.
