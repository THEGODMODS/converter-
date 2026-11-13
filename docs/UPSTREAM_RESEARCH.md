# Upstream format research and attribution

Research was conducted against public community documentation and format tools. This repository does not copy their source code or bundle their binaries.

## PES 2017 MODEL
The community-maintained PES MODEL format document describes the PES 2016–2017 mesh container, versioned section arrays, geometry buffers, vertex datum types, face indices, material references, bone groups and embedded reference bone transforms. It also documents limitations and partially understood sections. Those unknown areas must be preserved or rejected, not silently rewritten.

Reference: https://github.com/the4chancup/pes-model-blender/blob/master/format.txt

## PES 2021 FMDL
The FMDL community tooling documents a segmented container with block descriptors, vertex data, mesh metadata and texture links. The FMDL parser and mesh export workflow have evolved over time; compatibility must be tied to actual version values and test fixtures rather than assuming every FMDL is identical.

Reference: https://github.com/the4chancup/pes-fmdl-blender

## FTEX and CPK
The PES file tools project documents FTEX mipmap/frame chunking, zlib-compressed image payloads, supported pixel format IDs, and CRI CPK/UTF table structure. This is useful format research, not permission to copy or redistribute implementation code. The FACE FORGE implementation must be independently authored unless an upstream licence is verified and its terms are followed.

Reference: https://github.com/the4chancup/pes-file-tools

## Legal review
The upstream repositories' source files and any licence files must be checked at the exact revision before code reuse. Public visibility alone does not grant redistribution rights. Any later dependency must include a recorded repository URL, pinned revision, licence identifier, notices and compatibility tests.
