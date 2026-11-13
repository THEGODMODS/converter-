import path from "node:path";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,mkdir,readFile,rename,rm,writeFile,lstat,copyFile} from "node:fs/promises";
import {inspectFaceFolder} from "../engine/inventory";
import {parseFpkArchive} from "../engine/formats/fpk";
import {buildFoxFacePackage} from "./package-builder";
import {convertFaceTextureDependencies} from "./texture-bundle";
import {verifyPes2021FaceFpk} from "../engine/packaging/face-fpk-validation";
import {publishStagedOutput} from "./output-publish";
import {canonicalFoxModelStem,parseLegacyFaceXmlModelTypes,resolveLegacyMtlForModel} from "./legacy-mtl-selection";
const execFileAsync=promisify(execFile);
type InputModel={path:string;kind:string};
async function canonicalizeModelOutputs(output:string,models:InputModel[],modelTypes:Map<string,string>):Promise<void>{
 const sourceStems=new Set(models.map(model=>path.posix.basename(model.path,path.posix.extname(model.path)).toLowerCase()));
 const outputBySource=new Map<string,string>(),destinations=new Set<string>();
 for(const model of models){
  const stem=path.posix.basename(model.path,path.posix.extname(model.path));
  const target=canonicalFoxModelStem(stem,modelTypes.get(stem.toLowerCase()),sourceStems);
  if(destinations.has(target.toLowerCase()))throw new Error("Multiple PES 2017 models map to the same PES 2021 model role: "+target+". Check face.xml model types and source filenames.");
  destinations.add(target.toLowerCase());outputBySource.set(stem,target);
 }
 for(const [sourceStem,targetStem] of outputBySource){
  if(sourceStem.toLowerCase()===targetStem.toLowerCase())continue;
  for(const extension of [".fmdl",".skl"]){
   const from=path.join(output,sourceStem+extension),to=path.join(output,targetStem+extension);
   try{await lstat(from);}catch{continue;}
   try{await lstat(to);throw new Error("Converted output already contains "+targetStem+extension+"; refusing to overwrite it.");}
   catch(error){if(error instanceof Error&&error.message.includes("refusing to overwrite"))throw;}
   await rename(from,to);
  }
 }
}
function parseNativeReport(output:string):Record<string,unknown>{
 const start=output.indexOf("{"),end=output.lastIndexOf("}");
 if(start<0||end<start)throw new Error("The native batch model converter returned no JSON report.");
 return JSON.parse(output.slice(start,end+1)) as Record<string,unknown>;
}
export async function convertPes2017FaceFolderTo2021(input:{root:string;realRoot:string;realOutput:string;binary:string;playerId:string}){
 const {root,realRoot,realOutput,binary,playerId}=input,project=await inspectFaceFolder(root);
 if(project.detectedGame!=="pes2017")throw new Error("The reverse converter requires a PES 2017 source folder containing loose .model/.mtl assets.");
 const models=project.files.filter(file=>file.kind==="model-pes2017"||file.kind==="model-pes2017-compressed") as InputModel[];
 if(!models.length)throw new Error("No loose PES 2017 .model assets were found. CPK-only source folders are not supported by this route yet.");
 const invalidMaterials=project.files.filter(file=>file.kind==="invalid-mtl");
 if(invalidMaterials.length)throw new Error("Invalid PES 2017 material files must be repaired before conversion: "+invalidMaterials.map(file=>file.path).join(", "));
 const invalidDiffs=project.files.filter(file=>file.kind==="invalid-face-diff");
 if(invalidDiffs.length)throw new Error("Invalid FACE diff files must be repaired before conversion: "+invalidDiffs.map(file=>file.path).join(", "));
 const materialFiles=project.files.filter(file=>file.kind==="material-pes2017");
 const selectedMaterials=models.map(model=>({model,materialPath:resolveLegacyMtlForModel(model.path,materialFiles)}));
 const missingMaterials=selectedMaterials.filter(item=>!item.materialPath);
 if(missingMaterials.length)throw new Error("The upstream MTL selection rules found no material file for these PES 2017 models: "+missingMaterials.map(item=>item.model.path).join(", "));
 const selectedMaterialPaths=new Set(selectedMaterials.map(item=>item.materialPath!.toLowerCase()));
 const relevantDependencies=project.dependencies.filter(dep=>selectedMaterialPaths.has(dep.source.toLowerCase()));
 const unresolved=relevantDependencies.filter(dep=>dep.status!=="resolved");
 if(unresolved.length)throw new Error("The source face has unresolved texture references; conversion would lose textures: "+unresolved.map(dep=>dep.source+" -> "+dep.reference+" ("+dep.status+")").join("; "));
 const conversionProject={...project,dependencies:relevantDependencies};
 if(project.files.some(file=>(file.packageReferences??[]).length))throw new Error("The source folder contains cross-package references that cannot be resolved safely.");
 const stems=new Set(models.map(model=>path.posix.basename(model.path,path.posix.extname(model.path)).toLowerCase()));
 if(stems.size!==models.length)throw new Error("Duplicate source model names would collide in the converted package.");
 const faceDiffFiles=project.files.filter(file=>file.kind==="face-diff"&&!file.path.includes("!/"));
 const faceXmlFiles=project.files.filter(file=>path.posix.basename(file.path).toLowerCase()==="face.xml"&&!file.path.includes("!/"));
 if(faceDiffFiles.length>1||faceXmlFiles.length>1)throw new Error("The source folder contains ambiguous FACE diff sources.");
 let faceXmlText="";
 if(faceXmlFiles[0]){
  const xmlBytes=await readFile(path.join(realRoot,...faceXmlFiles[0].path.split("/")));
  faceXmlText=xmlBytes[0]===0xff&&xmlBytes[1]===0xfe?xmlBytes.subarray(2).toString("utf16le"):xmlBytes.toString("utf8").replace(/^\uFEFF/,"");
 }
 const modelTypes=parseLegacyFaceXmlModelTypes(faceXmlText);
 const stageParent=await mkdtemp(path.join(path.dirname(realOutput),".face-forge-pes2017-to-2021-"));
 const stageOutput=path.join(stageParent,"output"),stageConverted=path.join(stageParent,"converted"),stageSource=path.join(stageParent,"source");
 try{
  await mkdir(stageOutput,{recursive:true});await mkdir(stageConverted,{recursive:true});await mkdir(stageSource,{recursive:true});
  const stagedModels:string[]=[];
  for(const {model,materialPath} of selectedMaterials){
   const stem=path.posix.basename(model.path,path.posix.extname(model.path));
   const stagedModel=path.join(stageSource,stem+path.posix.extname(model.path));
   await copyFile(path.join(realRoot,...model.path.split("/")),stagedModel);
   await copyFile(path.join(realRoot,...materialPath!.split("/")),path.join(stageSource,stem+".mtl"));
   stagedModels.push(stagedModel);
  }
  const args=["convert-model","--source-format","model","--target","2021"];
  if(faceDiffFiles[0])args.push("--face-diff",path.join(realRoot,...faceDiffFiles[0].path.split("/")));
  else if(faceXmlFiles[0])args.push("--face-xml",path.join(realRoot,...faceXmlFiles[0].path.split("/")));
  for(const stagedModel of stagedModels)args.push("--model",stagedModel);
  args.push("--out",stageConverted);
  const {stdout}=await execFileAsync(binary,args,{timeout:600000,maxBuffer:16*1024*1024,windowsHide:true});
  const nativeReport=parseNativeReport(stdout);
  if(nativeReport.ok!==true)throw new Error("The native PES 2017 to PES 2021 model conversion did not complete successfully.");
  await canonicalizeModelOutputs(stageConverted,models,modelTypes);
  await convertFaceTextureDependencies(conversionProject,realRoot,stageConverted,"2021");
  const virtualRoot="Assets/pes16/model/character/face/real/"+playerId;
  const built=await buildFoxFacePackage(stageConverted,path.join(stageOutput,"face"),virtualRoot);
  const fpkBytes=await readFile(built.fpk),fpkdBytes=await readFile(built.fpkd);
  const verification=verifyPes2021FaceFpk(fpkBytes,fpkdBytes),fpk=parseFpkArchive(fpkBytes),fpkd=parseFpkArchive(fpkdBytes);
  const entries=(archive:ReturnType<typeof parseFpkArchive>)=>archive.entries.map(entry=>({path:entry.name,size:entry.data.length,sha256:createHash("sha256").update(entry.data).digest("hex")}));
  const findings=Array.isArray(nativeReport.findings)?nativeReport.findings as Array<{detail?:string}>:[];
  const warnings=[...findings.map(item=>item.detail).filter((value):value is string=>typeof value==="string"),...verification.warnings];
  if(built.faceDiffDefaulted)warnings.push("No source FACE diff was supplied; a validated neutral v5 FACE diff was added.");
  const report={ok:true,target:2021,targetPlayerId:playerId,sourceGeneration:"pes2017",engine:"native batch model converter + FTEX converter + Fox FPK/FPKD builder",
   sourceModels:models.map(model=>model.path),modelCount:fpk.entries.filter(entry=>entry.name.toLowerCase().endsWith(".fmdl")).length,
   textureCount:verification.texturePaths.length,faceDiffVersion:verification.faceDiffVersion,faceDiffDefaulted:built.faceDiffDefaulted,fpk:"face.fpk",fpkd:"face.fpkd",warnings};
  const archiveVerification={method:"FPK/FPKD read-back with per-entry SHA-256",faceDiffVersion:verification.faceDiffVersion,warnings,archives:[
   {archive:"face.fpk",kind:"fpk",fileCount:fpk.entries.length,entries:entries(fpk)},
   {archive:"face.fpkd",kind:"fpkd",fileCount:fpkd.entries.length,entries:entries(fpkd)}
  ]};
  await writeFile(path.join(stageOutput,"FACE-FORGE-report.json"),JSON.stringify({report,archiveVerification},null,2));
  const destination=await publishStagedOutput(stageOutput,realOutput);
  return {destination,outputFormat:"fpk",report:{...report,archiveVerification}};
 }finally{await rm(stageParent,{recursive:true,force:true}).catch(()=>{});}
}
