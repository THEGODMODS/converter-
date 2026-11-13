import path from "node:path";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,mkdir,readFile,rename,rm,writeFile,lstat} from "node:fs/promises";
import {inspectFaceFolder} from "../engine/inventory";
import {parseFpkArchive} from "../engine/formats/fpk";
import {buildFoxFacePackage} from "./package-builder";
import {convertFaceTextureDependencies} from "./texture-bundle";
import {verifyPes2021FaceFpk} from "../engine/packaging/face-fpk-validation";
import {publishStagedOutput} from "./output-publish";
const execFileAsync=promisify(execFile);
type InputModel={path:string;kind:string};
function modelRole(stem:string):"face_high"|"hair_high"|"oral"|null{
 const normalized=stem.toLowerCase().replace(/_win32$/i,"").replace(/^oral_/i,"");
 if(normalized==="face_high")return "face_high";
 if(normalized==="hair_high")return "hair_high";
 if(normalized==="oral"||normalized==="oral_high")return "oral";
 return null;
}
async function canonicalizeModelOutputs(output:string,models:InputModel[]):Promise<void>{
 const roleSources=new Map<string,string>(),stems=new Set<string>();
 for(const model of models){
  const stem=path.posix.basename(model.path,path.posix.extname(model.path)),key=stem.toLowerCase();
  if(stems.has(key))throw new Error("Two source models would write the same converted filename: "+stem);
  stems.add(key);const role=modelRole(stem);
  if(role){if(roleSources.has(role))throw new Error("The source folder contains more than one "+role+" model; conversion would be ambiguous.");roleSources.set(role,stem);}
 }
 for(const role of ["face_high","hair_high"])if(!roleSources.has(role))throw new Error("PES 2017 source folder is missing the required "+role+".model asset.");
 for(const [role,stem] of roleSources){
  if(role.toLowerCase()===stem.toLowerCase())continue;
  for(const extension of [".fmdl",".skl"]){
   const from=path.join(output,stem+extension),to=path.join(output,role+extension);
   try{await lstat(from);}catch{continue;}
   try{await lstat(to);throw new Error("Converted output already contains "+role+extension+"; refusing to overwrite it.");}
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
 const materialPaths=new Set(project.files.filter(file=>file.kind==="material-pes2017").map(file=>file.path.toLowerCase()));
 const missingMaterials=models.filter(model=>!materialPaths.has(model.path.replace(/\.[^/.]+$/,".mtl").toLowerCase()));
 if(missingMaterials.length)throw new Error("Every PES 2017 model needs its matching .mtl material file: "+missingMaterials.map(file=>file.path).join(", "));
 const relevantDependencies=project.dependencies.filter(dep=>materialPaths.has(dep.source.toLowerCase()));
 const unresolved=relevantDependencies.filter(dep=>dep.status!=="resolved");
 if(unresolved.length)throw new Error("The source face has unresolved texture references; conversion would lose textures: "+unresolved.map(dep=>dep.source+" -> "+dep.reference+" ("+dep.status+")").join("; "));
 if(project.files.some(file=>(file.packageReferences??[]).length))throw new Error("The source folder contains cross-package references that cannot be resolved safely.");
 const stems=new Set(models.map(model=>path.posix.basename(model.path,path.posix.extname(model.path)).toLowerCase()));
 if(stems.size!==models.length)throw new Error("Duplicate source model names would collide in the converted package.");
 const faceDiffFiles=project.files.filter(file=>file.kind==="face-diff"&&!file.path.includes("!/"));
 const faceXmlFiles=project.files.filter(file=>path.posix.basename(file.path).toLowerCase()==="face.xml"&&!file.path.includes("!/"));
 if(faceDiffFiles.length>1||faceXmlFiles.length>1)throw new Error("The source folder contains ambiguous FACE diff sources.");
 const stageParent=await mkdtemp(path.join(path.dirname(realOutput),".face-forge-pes2017-to-2021-"));
 const stageOutput=path.join(stageParent,"output"),stageConverted=path.join(stageParent,"converted");
 try{
  await mkdir(stageOutput,{recursive:true});await mkdir(stageConverted,{recursive:true});
  const args=["convert-model","--source-format","model","--target","2021"];
  if(faceDiffFiles[0])args.push("--face-diff",path.join(realRoot,...faceDiffFiles[0].path.split("/")));
  else if(faceXmlFiles[0])args.push("--face-xml",path.join(realRoot,...faceXmlFiles[0].path.split("/")));
  for(const model of models)args.push("--model",path.join(realRoot,...model.path.split("/")));
  args.push("--out",stageConverted);
  const {stdout}=await execFileAsync(binary,args,{timeout:600000,maxBuffer:16*1024*1024,windowsHide:true});
  const nativeReport=parseNativeReport(stdout);
  if(nativeReport.ok!==true)throw new Error("The native PES 2017 to PES 2021 model conversion did not complete successfully.");
  await canonicalizeModelOutputs(stageConverted,models);
  await convertFaceTextureDependencies(project,realRoot,stageConverted,"2021");
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
