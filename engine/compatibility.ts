export type FaceSourceGeneration="pes2017"|"pes2021";
export type ConversionGate="blocked"|"inspectable";
export type CompatibilityCheck={label:string;status:"pass"|"warning"|"blocked";detail:string};
export type ConversionAssessment={source:FaceSourceGeneration;target:FaceSourceGeneration;gate:ConversionGate;checks:CompatibilityCheck[];blockingReasons:string[];warnings:string[]};
type ProjectFile={path:string;kind:string;formatValid?:boolean};
type ProjectInput={detectedGame:"pes2017"|"pes2021"|"mixed"|"unknown";files:ProjectFile[];models:number;textures:number};
const modelKind=(generation:FaceSourceGeneration)=>generation==="pes2021"?"model-pes2021":"model-pes2017";
const basename=(value:string)=>value.split(/[\\/]/).at(-1)??value;
export function assessFaceConversion(project:ProjectInput,source:FaceSourceGeneration):ConversionAssessment{
 const target:FaceSourceGeneration=source==="pes2021"?"pes2017":"pes2021",files=project.files;
 const sourceModels=files.filter(file=>file.kind===modelKind(source)||source==="pes2017"&&file.kind==="model-pes2017-compressed");
 const embeddedModels=files.filter(file=>file.path.includes("!/")&&file.kind==="model-pes2021");
 const fpk=files.filter(file=>file.kind==="container-fpk");
 const textures=files.filter(file=>file.kind.startsWith("texture-"));
 const mtl=files.filter(file=>file.kind==="material-pes2017");
 const faceDiff=files.filter(file=>file.kind==="face-diff");
 const invalid=files.filter(file=>file.kind.startsWith("invalid-"));
 const hasFaceHigh=sourceModels.some(file=>basename(file.path).toLowerCase()===(source==="pes2021"?"face_high.fmdl":"face_high.model"));
 const checks:CompatibilityCheck[]=[],blockingReasons:string[]=[],warnings:string[]=[];
 const detected=project.detectedGame===source;
 checks.push({label:"Source generation",status:detected?"pass":project.detectedGame==="mixed"?"warning":"blocked",detail:detected?"Validated inventory identifies "+source.toUpperCase()+" assets.":"Expected "+source.toUpperCase()+", but inventory identifies "+project.detectedGame.toUpperCase()+"."});
 if(!detected)blockingReasons.push("The selected conversion direction does not match the detected source generation.");
 checks.push({label:"Source model files",status:sourceModels.length?"pass":"blocked",detail:sourceModels.length?sourceModels.length+" source model file(s) found.":"No supported source-generation model file was found."});
 if(!sourceModels.length)blockingReasons.push("A supported source model is required; texture-only folders cannot be converted.");
 checks.push({label:"Required face_high head model",status:hasFaceHigh?"pass":"blocked",detail:hasFaceHigh?"The required face_high head model is present.":"The source does not contain the required face_high model."});
 if(!hasFaceHigh)blockingReasons.push("A face_high head model is required for a complete face conversion.");
 checks.push({label:"Embedded FPK models",status:!fpk.length||embeddedModels.length?"pass":"warning",detail:!fpk.length?"No opaque FPK package is required for this inventory.":embeddedModels.length?embeddedModels.length+" FMDL model(s) discovered inside FPK package(s).":fpk.length+" FPK package(s) found, but no embedded FMDL model was discovered."});
 if(fpk.length&&!embeddedModels.length)warnings.push("At least one FPK package has no discovered embedded FMDL model; package contents may be unsupported or extraction may have failed.");
 checks.push({label:"Companion textures",status:textures.length?"pass":"warning",detail:textures.length?textures.length+" validated texture container(s) found.":"No validated FTEX/DDS texture containers found."});
 if(!textures.length)warnings.push("The target face may lack its authored appearance because no validated texture containers were found.");
 if(source==="pes2017"){
  checks.push({label:"PES 2017 material definitions",status:mtl.length?"pass":"warning",detail:mtl.length?mtl.length+" MTL/material metadata file(s) found.":"No .mtl material definition was found."});
  if(!mtl.length)warnings.push("PES 2017 MODEL meshes reference external MTL material definitions; without them texture/shader bindings cannot be reconstructed reliably.");
 }else{
  checks.push({label:"FMDL semantic material decoding",status:sourceModels.length?"pass":"blocked",detail:"The pinned Team Compiler converts FMDL geometry and material sets for PES 2017 output."});
 }
 checks.push({label:"Face-specific calibration",status:faceDiff.length?"pass":"warning",detail:faceDiff.length?"A structurally recognized face_diff.bin was found.":"No face_diff.bin was found; the compiler will use its target-generation default calibration."});
 if(!faceDiff.length)warnings.push("No source FACE diff was found. Target defaults will be used for eye/oral calibration rather than preserving authored offsets.");
 checks.push({label:"Malformed or unsupported files",status:invalid.length?"warning":"pass",detail:invalid.length?invalid.length+" invalid or unsupported file(s) found.":"No invalid supported-format headers were reported."});
 if(invalid.length)warnings.push(invalid.length+" file(s) have invalid or unsupported headers and need review.");
 if(source==="pes2021"){
  checks.push({label:"PES 2021 → PES 2017 package compiler",status:"pass",detail:"The complete-folder route uses the pinned Team Compiler for FMDL/MTL/FTEX conversion, face.xml generation and nested face CPK packaging."});
  checks.push({label:"Nested face CPK verification",status:"warning",detail:"The output gate checks the outer team CPK and nested player-face CPK before publishing; actual PES 2017 game validation remains outstanding."});
  warnings.push("A structurally verified CPK is not yet an in-game result. Review hair, oral, eye placement, textures and animation in PES 2017.");
 }else{
  checks.push({label:"PES 2017 → PES 2021 package compiler",status:"blocked",detail:"The reverse conversion direction is intentionally deferred until PES 2021 → PES 2017 is validated."});
  blockingReasons.push("PES 2017 → PES 2021 is not part of the first release.");
 }
 return {source,target,gate:blockingReasons.length?"blocked":"inspectable",checks,blockingReasons,warnings};
}
