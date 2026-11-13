# Format research notes

## Known generation split
Community format references describe PES 2014–2017 face assets as MODEL + DDS and PES 2018–2022 face assets as FMDL + FTEX. Typical PES 2018–2021 workflows use FMDL/FPK model containers and FTEX textures. These labels describe families, not a guarantee that every patch or face uses an identical schema.

## Commonly observed face assets
- Newer generation: `face_high.fmdl`, `hair_high.fmdl`, `oral.fmdl`, `.ftex` textures and FPK containers.
- Older generation: `.model` mesh assets, material metadata and DDS textures.
- Texture naming conventions vary; examples include face diffuse/alpha, normal, specular/roughness, hair and oral maps.

## Conversion is not extension renaming
A working adapter must understand the binary model schema and translate mesh buffers, vertex layouts, indices, UVs, normals, tangents, materials, skeleton/bone weights and any face-specific auxiliary data. Texture conversion must preserve supported compression, channel order, alpha semantics and mip levels. A CPK is only a delivery container.

## Research references
- PESClassicEditor format comparison and workflow: https://pesclassiceditor.wordpress.com/2022/09/26/convertir-faces-de-fmdl-ftex-2018-2022-a-model-dds-2014-2017/
- Community PES FMDL/FTEX Blender tooling (inspect upstream licence and credits before integration): https://github.com/MjTs140914/PES_Face_Hair_Modifier
- PES 2017 MODEL importer workflow background: https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2018/Faces
- PES face/hair modifier and texture workflow background: https://pesnewupdate.com/pes-2019-facehair-modifier-tools/

## Implementation policy
Use clean-room format documentation and original tests. Integrate upstream code only when its licence explicitly permits the intended use; preserve notices and attribution. Do not bundle proprietary game files or paid converter code. Unknown chunks must be preserved when safe or cause a clear unsupported result; never silently discard them.
