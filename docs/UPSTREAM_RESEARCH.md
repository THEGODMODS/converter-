# Upstream format research and attribution

Research was conducted against public community documentation and format tools. This repository does not copy their source code or bundle their binaries.

## PES 2017 MODEL
The published MODEL specification describes a 16-byte WESYS wrapper: three version bytes, the ASCII `WESYS` marker, compressed byte count, uncompressed byte count, then zlib data. The implementation validates both lengths before parsing. MODEL sections use relative-pointer StructArrays; section 1 stores vertex attribute streams and uint16 triangle indices, while section 4 connects geometry to bone groups and material names. Section 5 stores bone names, and companion MTL files define shader/material settings. Cloth and material-combination structures remain unsupported until documented and fixture-tested.

Reference: https://github.com/the4chancup/pes-model-blender/blob/master/format.txt

The community-maintained PES MODEL format document describes the PES 2016–2017 mesh container, versioned section arrays, geometry buffers, vertex datum types, face indices, material references, bone groups and embedded reference bone transforms. It also documents limitations and partially understood sections. Those unknown areas must be preserved or rejected, not silently rewritten.

Reference: https://github.com/the4chancup/pes-model-blender/blob/master/format.txt

## PES 2021 FMDL
The current clean-room decoder maps the documented FMDL block families for bones (0), mesh groups (1–2), mesh/material instances (3–4), bone groups (5), textures and material assignments (6–8), vertex layouts (9–11), strings (12), buffer offsets (14), LOD metadata (16), and face-index ranges (17). Segment-1 data block 2 contains the interleaved vertex and face-index buffers; block 3 contains referenced strings. Vertex decoding currently supports common float32 positions, half-float normals/tangents/UVs, byte colours, and 8-bit skin weights/indices. Unknown block semantics and extended LOD/morph behavior must remain explicit limitations.

Reference documentation: https://github.com/leus/PesFacemod/blob/master/fdml.md

The FMDL community tooling documents a segmented container with block descriptors, vertex data, mesh metadata and texture links. The FMDL parser and mesh export workflow have evolved over time; compatibility must be tied to actual version values and test fixtures rather than assuming every FMDL is identical.

Reference: https://github.com/the4chancup/pes-fmdl-blender

## FTEX and CPK
The PES file tools project documents FTEX mipmap/frame chunking, zlib-compressed image payloads, supported pixel format IDs, and CRI CPK/UTF table structure. This is useful format research, not permission to copy or redistribute implementation code. The FACE FORGE implementation must be independently authored unless an upstream licence is verified and its terms are followed.

Reference: https://github.com/the4chancup/pes-file-tools

## Clean-room and licensing policy
The public PES FMDL Blender repository is useful for format research, but its current repository tree does not expose a licence file. FACE FORGE must not copy or bundle its implementation. Use the published format references to independently author parsers, preserve upstream attribution for documentation, and only add code dependencies when their exact revision and licence are verified.

## Legal review
The upstream repositories' source files and any licence files must be checked at the exact revision before code reuse. Public visibility alone does not grant redistribution rights. Any later dependency must include a recorded repository URL, pinned revision, licence identifier, notices and compatibility tests.
