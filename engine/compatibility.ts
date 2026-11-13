export type FaceSourceGeneration="pes2017"|"pes2021";
export type ConversionGate="blocked"|"inspectable";
export type CompatibilityCheck={label:string;status:"pass"|"warning"|"blocked";detail:string};
export type ConversionAssessment={source:FaceSourceGeneration;target:FaceSourceGeneration;gate:ConversionGate;checks:CompatibilityCheck[];blockingReasons:string[];warnings:string[]};
type ProjectFile={path:string;kind:string;formatValid?:boolean};
type ProjectInput={detectedGame:"pes2017"|"pes2021"|"mixed"|"unknown";files:ProjectFile[];models:number;textures:number};
const modelKind=(generation:FaceSourceGeneration)=>generation==="pes2021"?"model-pes2021":"model-pes2017";
export function assessFaceConversion(project:ProjectInput,source:FaceSourceGeneration):ConversionAssessment{
 const target:FaceSourceGeneration=source==="pes2021"?"pes2017":"pes2021",files=project.files;
 const sourceModels=files.filter(file=>file.kind===modelKind(source)||source==="pes2017"&&file.kind==="model-pes2017-compressed");
 const embeddedModels=files.filter(file=>file.path.includes("!/")&&file.kind==="model-pes2021");
 const fpk=files.filter(file=>file.kind==="container-fpk");
 const textures=files.filter(file=>file.kind.startsWith("texture-"));
 const mtl=files.filter(file=>file.kind==="material-metadata"&&/\.mtl$/i.test(file.path));
 const faceDiff=files.filter(file=>file.kind==="face-diff");
 const invalid=files.filter(file=>file.kind.startsWith("invalid-"));
 const checks:CompatibilityCheck[]=[],blockingReasons:string[]=[],warnings:string[]=[];
 const detected=project.detectedGame===source;
 checks.push({label:"Source generation",status:detected?"pass":project.detectedGame==="mixed"?"warning":"blocked",detail:detected?"Validated inventory identifies "+source.toUpperCase()+" assets.":"Expected "+source.toUpperCase()+", but inventory identifies "+project.detectedGame.toUpperCase()+"."});
 if(!detected)blockingReasons.push("The selected conversion direction does not match the detected source generation.");
 checks.push({label:"Source model files",status:sourceModels.length?"pass":"blocked",detail:sourceModels.length?sourceModels.length+" source model file(s) found.":"No supported source-generation model file was found."});
 if(!sourceModels.length)blockingReasons.push("A supported source model is required; texture-only folders cannot be converted.");
 checks.push({label:"Embedded FPK models",status:!fpk.length||embeddedModels.length?"pass":"warning",detail:!fpk.length?"No opaque FPK package is required for this inventory.":embeddedModels.length?embeddedModels.length+" FMDL model(s) discovered inside FPK package(s).":fpk.length+" FPK package(s) found, but no embedded FMDL model was discovered."});
 if(fpk.length&&!embeddedModels.length)warnings.push("At least one FPK package has no discovered embedded FMDL model; package contents may be unsupported or extraction may have failed.");
 checks.push({label:"Companion textures",status:textures.length?"pass":"warning",detail:textures.length?textures.length+" validated texture container(s) found.":"No validated FTEX/DDS texture containers found."});
 if(!textures.length)warnings.push("A geometry-only conversion would lose the face appearance; companion textures are missing.");
 if(source==="pes2017"){
  checks.push({label:"PES 2017 material definitions",status:mtl.length?"pass":"warning",detail:mtl.length?mtl.length+" MTL/material metadata file(s) found.":"No .mtl material definition was found."});
  if(!mtl.length)warnings.push("PES 2017 MODEL meshes reference external MTL material definitions; without them texture/shader bindings cannot be reconstructed reliably.");
 }else{
  checks.push({label:"FMDL semantic material decoding",status:sourceModels.length?"pass":"blocked",detail:"The pinned native engine decodes FMDL mesh/material structures; folder-wide external texture resolution is a separate gate."});
  warnings.push("Semantic model conversion is available, but complete face-folder texture relinking and package assembly are not yet implemented.");
 }
 checks.push({label:"Face-specific auxiliary data",status:faceDiff.length?"pass":"warning",detail:faceDiff.length?"face_diff.bin metadata found.":"No face_diff.bin metadata found."});
 if(!faceDiff.length)warnings.push("Eye placement/scale and other face-specific adjustments may need target-side defaults if face_diff.bin is absent.");
 checks.push({label:"Malformed or unsupported files",status:invalid.length?"warning":"pass",detail:invalid.length?invalid.length+" invalid or unsupported file(s) found.":"No invalid supported-format headers were reported."});
 if(invalid.length)warnings.push(invalid.length+" file(s) have invalid or unsupported headers and must not be copied into a converted output.");
 checks.push({label:"Single-model semantic converter",status:sourceModels.length?"pass":"blocked",detail:"Pinned native model_convert engine provides semantic FMDL ↔ MODEL/MTL conversion and version-specific skeleton retargeting, with structured loss findings."});
 checks.push({label:"Complete face package and dependency relinking",status:"blocked",detail:"All face/hair/oral/auxiliary models, FTEX/DDS dependencies, face_diff data and game-specific package paths are not yet converted atomically."});
 blockingReasons.push("Single-model semantic conversion is implemented, but complete face-package conversion, texture/material dependency relinking and target-game verification remain blocked.");
 return {source,target,gate:blockingReasons.length?"blocked":"inspectable",checks,blockingReasons,warnings};
}
