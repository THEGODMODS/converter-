export type Vec2=[number,number];
export type Vec3=[number,number,number];
export type Vec4=[number,number,number,number];
export type FaceVertex={position:Vec3;normal?:Vec3;tangent?:Vec4;uvs:Vec2[];color?:Vec4;boneIndices:number[];boneWeights:number[]};
export type FaceMaterial={name:string;shader:string|null;textures:Record<string,string>;parameters:Record<string,number|string|boolean>};
export type FaceMesh={name:string;materialIndex:number;vertices:FaceVertex[];indices:number[];lodRanges?:Array<[number,number]>};
export type FaceBone={name:string;parentIndex:number|null;inverseBindMatrix:number[]};
export type FaceMorphTarget={name:string;meshIndex:number;positionDeltas:Vec3[];normalDeltas?:Vec3[]};
export type FaceScene={schemaVersion:1;sourceFormat:"PES2017_MODEL"|"PES2021_FMDL";meshes:FaceMesh[];materials:FaceMaterial[];bones:FaceBone[];morphTargets:FaceMorphTarget[];metadata:Record<string,string|number|boolean>};
export type ValidationIssue={severity:"error"|"warning";code:string;message:string;mesh?:string};
const finite=(n:number)=>Number.isFinite(n);
function isFiniteVector(value:unknown,length:number):boolean{return Array.isArray(value)&&value.length===length&&value.every(item=>typeof item==="number"&&Number.isFinite(item));}
export function validateFaceScene(scene:FaceScene):ValidationIssue[]{
 const issues:ValidationIssue[]=[];
 if(scene.schemaVersion!==1)issues.push({severity:"error",code:"SCHEMA_VERSION",message:"Unsupported intermediate scene schema."});
 if(!scene.meshes.length)issues.push({severity:"error",code:"NO_MESHES",message:"The face scene contains no mesh geometry."});
 if(!scene.materials.length)issues.push({severity:"warning",code:"NO_MATERIALS",message:"No material definitions were found."});
 for(const [mi,mesh] of scene.meshes.entries()){
  if(mesh.materialIndex<0||mesh.materialIndex>=scene.materials.length)issues.push({severity:"error",code:"MATERIAL_INDEX",message:"Mesh references a missing material.",mesh:mesh.name});
  if(mesh.indices.length%3!==0)issues.push({severity:"error",code:"NON_TRIANGLE_INDEX_COUNT",message:"Index buffer is not a triangle list.",mesh:mesh.name});
  for(const index of mesh.indices)if(!Number.isInteger(index)||index<0||index>=mesh.vertices.length){issues.push({severity:"error",code:"INDEX_OUT_OF_RANGE",message:"Mesh index references a vertex outside the vertex buffer.",mesh:mesh.name});break;}
  for(const vertex of mesh.vertices){
   if(!isFiniteVector(vertex.position,3))issues.push({severity:"error",code:"INVALID_POSITION",message:"Vertex position is missing or non-finite.",mesh:mesh.name});
   if(vertex.normal&&!isFiniteVector(vertex.normal,3))issues.push({severity:"error",code:"INVALID_NORMAL",message:"Vertex normal is invalid.",mesh:mesh.name});
   if(vertex.tangent&&!isFiniteVector(vertex.tangent,4))issues.push({severity:"error",code:"INVALID_TANGENT",message:"Vertex tangent is invalid.",mesh:mesh.name});
   if(vertex.uvs.some(uv=>!isFiniteVector(uv,2)))issues.push({severity:"error",code:"INVALID_UV",message:"Vertex UV coordinates are invalid.",mesh:mesh.name});
   if(vertex.boneIndices.length!==vertex.boneWeights.length)issues.push({severity:"error",code:"BONE_WEIGHT_LAYOUT",message:"Bone index and weight counts differ.",mesh:mesh.name});
   if(vertex.boneIndices.some(i=>!Number.isInteger(i)||i<0||i>=scene.bones.length))issues.push({severity:"error",code:"BONE_INDEX",message:"Vertex references a missing skeleton bone.",mesh:mesh.name});
   if(vertex.boneWeights.some(w=>!finite(w)||w<0))issues.push({severity:"error",code:"BONE_WEIGHT",message:"Bone weights must be finite and non-negative.",mesh:mesh.name});
   const sum=vertex.boneWeights.reduce((a,b)=>a+b,0);if(vertex.boneWeights.length&&Math.abs(sum-1)>0.02)issues.push({severity:"warning",code:"BONE_WEIGHT_SUM",message:"Bone weights are not normalized to 1.",mesh:mesh.name});
  }
  if(mesh.lodRanges?.some(([start,end])=>start<0||end<start||end>mesh.indices.length))issues.push({severity:"error",code:"LOD_RANGE",message:"Mesh LOD range is invalid.",mesh:mesh.name});
  if(mi>10000)break;
 }
 for(const [i,bone] of scene.bones.entries()){
  if(bone.parentIndex!==null&&(bone.parentIndex<0||bone.parentIndex>=scene.bones.length||bone.parentIndex===i))issues.push({severity:"error",code:"BONE_PARENT",message:"Bone parent reference is invalid: "+bone.name});
  if(bone.inverseBindMatrix.length!==12&&bone.inverseBindMatrix.length!==16)issues.push({severity:"error",code:"BONE_MATRIX",message:"Bone bind matrix must contain 12 or 16 values: "+bone.name});
  if(!bone.inverseBindMatrix.every(finite))issues.push({severity:"error",code:"BONE_MATRIX_FINITE",message:"Bone bind matrix contains non-finite values: "+bone.name});
 }
 for(const morph of scene.morphTargets){const mesh=scene.meshes[morph.meshIndex];if(!mesh){issues.push({severity:"error",code:"MORPH_MESH",message:"Morph target references a missing mesh: "+morph.name});continue;}if(morph.positionDeltas.length!==mesh.vertices.length)issues.push({severity:"error",code:"MORPH_VERTEX_COUNT",message:"Morph target vertex count does not match its mesh: "+morph.name});if(morph.normalDeltas&&morph.normalDeltas.length!==mesh.vertices.length)issues.push({severity:"error",code:"MORPH_NORMAL_COUNT",message:"Morph normal count does not match its mesh: "+morph.name});}
 return issues;
}
