# Release gates

A conversion direction is marked supported only when all applicable gates pass:

1. **Input integrity:** source is readable; archive paths are safe; required companions are present.
2. **Format recognition:** signatures and version fields match a documented supported schema.
3. **Model integrity:** all buffers are in bounds; indices and attributes validate; no unexpected topology loss.
4. **Texture integrity:** dimensions, formats, mipmaps, channels and alpha validate.
5. **Material integrity:** every material reference resolves and texture semantics are mapped.
6. **Rig integrity:** required bones, weights and face-specific data are valid for the target.
7. **Output integrity:** target files parse again; package paths and IDs are correct.
8. **Preview:** model and textures render without missing assets or obvious material corruption.
9. **Game test:** target game loads the face in a real installation with the documented patch/toolchain.

If a gate is not implemented or cannot be verified, report it as unknown or unsupported. Never label a package "game-ready" based solely on successful CPK creation.
