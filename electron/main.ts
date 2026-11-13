import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync=promisify(execFile);
import { inspectFaceFolder } from "../engine/inventory";
import { inspectFaceDatabase } from "../engine/database";
import { buildFaceProjectManifest } from "../engine/manifest";
import { ddsToFtex, ftexToDds, type TextureColorSpace } from "../engine/formats/texture";
import { parseModelContainer } from "../engine/formats/model-container";
import { decodePes2017Model } from "../engine/formats/model-scene";
import { parseFmdlContainer } from "../engine/formats/fmdl-container";
import { decodePes2021Fmdl } from "../engine/formats/fmdl-geometry";
import { parseFpkArchive } from "../engine/formats/fpk";
import { convertFaceTextureDependencies } from "./texture-bundle";
import { buildFoxFacePackage } from "./package-builder";
import { publishStagedOutput } from "./output-publish";
import { verifyPes2017FaceCpk } from "../engine/packaging/face-cpk-validation";

let mainWindow:BrowserWindow|null=null;
function trusted(event:Electron.IpcMainInvokeEvent){
 const url=event.senderFrame?.url??"";
 if(app.isPackaged){const expected=pathToFileURL(path.join(__dirname,"../../dist/index.html")).href;if(url!==expected)throw new Error("Untrusted renderer.");}
 else {const parsed=new URL(url);if(parsed.origin!=="http://127.0.0.1:5173"||(parsed.pathname!=="/"&&parsed.pathname!=="/index.html"))throw new Error("Untrusted renderer.");}
}
function registerIpc(){
 ipcMain.handle("face:choose-folder",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose PES face project folder",properties:["openDirectory"]});return result.canceled?null:result.filePaths[0]??null;});
 ipcMain.handle("face:choose-folders",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose face folders for batch or project",properties:["openDirectory","multiSelections"]});return result.canceled?[]:result.filePaths;});
 ipcMain.handle("face:inspect-database",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid database path.");if(!fs.existsSync(folder))throw new Error("The selected database folder no longer exists.");return inspectFaceDatabase(folder);});
 ipcMain.handle("face:inspect-folder",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");if(!fs.existsSync(folder))throw new Error("The selected folder no longer exists.");return inspectFaceFolder(folder);});
 ipcMain.handle("face:export-manifest",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");const project=await inspectFaceFolder(folder);const manifest=buildFaceProjectManifest(project);if(!manifest.integrity.complete)throw new Error("Manifest integrity check failed; export was stopped.");const suggested=path.join(path.dirname(folder),path.basename(folder)+"-FACE-FORGE-manifest.json");const picked=await dialog.showSaveDialog(mainWindow!,{title:"Export face project manifest",defaultPath:suggested,filters:[{name:"FACE FORGE manifest",extensions:["json"]}]});if(picked.canceled||!picked.filePath)return null;if(path.extname(picked.filePath).toLowerCase()!==".json")throw new Error("Choose a .json manifest destination.");const payload=JSON.stringify(manifest,null,2)+"\n";await writeFile(picked.filePath,payload,{flag:"wx"});return {destination:picked.filePath,files:manifest.summary.fileCount,bytes:Buffer.byteLength(payload)};});
 ipcMain.handle("face:convert-native-model",async(event,folder:unknown)=>{
  trusted(event);
  if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid source project folder.");
  const root=path.resolve(folder),rootStat=await fs.promises.lstat(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error("The source project is not a safe directory.");
  const realRoot=await fs.promises.realpath(root),inventory=await inspectFaceFolder(root);
  const packages=inventory.files.filter(file=>file.kind==="container-fpk"&&!file.path.includes("!/"));
  const packageFiles=inventory.files.filter(file=>(file.kind==="container-fpk"||file.kind==="container-fpkd")&&!file.path.includes("!/"));
  const referencedPackages=packageFiles.filter(file=>(file.packageReferences?.length??0)>0);
  if(referencedPackages.length)throw new Error("This face package declares inter-package references. The current native conversion bridge cannot yet preserve or remap referenced package paths; conversion was stopped rather than silently dropping them.");
  const unresolvedTextureDependencies=inventory.dependencies.filter(item=>item.status!=="resolved"&&inventory.files.some(file=>file.path===item.source&&(file.kind==="model-pes2021"||file.kind==="material-pes2017")));
  if(unresolvedTextureDependencies.length){const examples=unresolvedTextureDependencies.slice(0,5).map(item=>item.reference).join(", ");throw new Error("Conversion stopped: "+unresolvedTextureDependencies.length+" FMDL texture reference(s) are missing or ambiguous. Resolve these dependencies before model export. Examples: "+examples);}
  if(inventory.files.some(file=>file.kind==="model-pes2021"&&(file.assetReferences?.length??0)===0))throw new Error("Conversion stopped: at least one FMDL has no semantically decoded material/texture references. The current inspector cannot prove that its external dependencies are preserved.");
  if(inventory.files.some(file=>file.kind==="invalid-mtl"))throw new Error("Conversion stopped: a PES 2017 MTL file is malformed or unsupported. Repair the material definition before converting.");
  const looseModels=inventory.files.filter(file=>["model-pes2017","model-pes2017-compressed","model-pes2021"].includes(file.kind)&&!file.path.includes("!/"));
  let selectedPaths:string[]=[];
  if(packages.length===1){
   const packagePath=packages[0].path,packageDir=path.posix.dirname(packagePath),packageStem=path.posix.basename(packagePath,path.posix.extname(packagePath)).toLowerCase();
   const companion=inventory.files.find(file=>file.kind==="container-fpkd"&&!file.path.includes("!/")&&path.posix.dirname(file.path)===packageDir&&path.posix.basename(file.path,path.posix.extname(file.path)).toLowerCase()===packageStem);
   selectedPaths=[path.resolve(root,...packagePath.split("/"))];
   if(companion)selectedPaths.push(path.resolve(root,...companion.path.split("/")));
  }else if(packages.length>1)throw new Error("This folder contains multiple FPK face packages. Convert each face package separately until player/package identity mapping is supported.");
  else selectedPaths=looseModels.map(file=>path.resolve(root,...file.path.split("/")));
  if(!selectedPaths.length)throw new Error("No supported loose models or FPK package were discovered in this face folder.");
  const prefix=realRoot.endsWith(path.sep)?realRoot:realRoot+path.sep;
  for(const modelPath of selectedPaths){
   const realModel=await fs.promises.realpath(modelPath);
   if(!realModel.startsWith(prefix))throw new Error("A selected model is outside the inspected source folder.");
   const stat=await fs.promises.lstat(modelPath);
   if(stat.isSymbolicLink()||!stat.isFile()||stat.size>512*1024*1024)throw new Error("A selected model is not a safe supported file.");
  }
  const extensions=new Set(selectedPaths.map(file=>path.extname(file).toLowerCase()));
  const isFoxPackage=selectedPaths.every(file=>[".fpk",".fpkd"].includes(path.extname(file).toLowerCase()));
  if(extensions.size!==1&&!isFoxPackage)throw new Error("Mixed model generations detected. Separate the PES 2017 and PES 2021 assets before conversion.");
  const extension=[...extensions][0],sourceFormat=isFoxPackage?"fpk":extension===".fmdl"?"fmdl":extension===".model"?"model":null;
  if(!sourceFormat)throw new Error("Select .fmdl, .model or a face .fpk package. The paired .fpkd file is a companion archive, not a standalone model.");
  const target=sourceFormat==="fmdl"||sourceFormat==="fpk"?"2017":"2021",args=["convert-model","--source-format",sourceFormat,"--target",target];
  if(sourceFormat==="fpk")args.push("--textures-managed-externally");
  if(sourceFormat==="model"){
   const diffFile=inventory.files.find(file=>file.kind==="face-diff"&&!file.path.includes("!/")&&path.posix.dirname(file.path)===".");
   const xmlFile=inventory.files.find(file=>file.path.toLowerCase()==="face.xml");
   const auxiliary=diffFile??xmlFile;
   if(auxiliary){
    const auxiliaryPath=path.resolve(root,...auxiliary.path.split("/")),realAuxiliary=await fs.promises.realpath(auxiliaryPath);
    if(!realAuxiliary.startsWith(prefix))throw new Error("A face calibration sidecar is outside the inspected source folder.");
    const auxiliaryStat=await fs.promises.lstat(auxiliaryPath);
    if(auxiliaryStat.isSymbolicLink()||!auxiliaryStat.isFile()||auxiliaryStat.size>16*1024*1024)throw new Error("The face calibration sidecar is not a safe regular file.");
    args.push(diffFile?"--face-diff":"--face-xml",auxiliaryPath);
   }
  }
  for(const modelPath of selectedPaths)args.push("--model",modelPath);
  for(const modelPath of selectedPaths){
   const sibling=(suffix:string)=>path.join(path.dirname(modelPath),path.basename(modelPath,path.extname(modelPath))+suffix);
   if(sourceFormat==="model"){
    const mtlPath=sibling(".mtl");if(!fs.existsSync(mtlPath))throw new Error("The PES 2017 model "+path.basename(modelPath)+" needs its matching .mtl file.");
    const mtlStat=await fs.promises.lstat(mtlPath);if(mtlStat.isSymbolicLink()||!mtlStat.isFile())throw new Error("A companion MTL is not a safe regular file.");
   }else if(sourceFormat==="fmdl"){
    const sklPath=sibling(".skl");if(fs.existsSync(sklPath)){const sklStat=await fs.promises.lstat(sklPath);if(sklStat.isSymbolicLink()||!sklStat.isFile())throw new Error("A companion SKL is not a safe regular file.");}
   }
  }
  const destination=await dialog.showOpenDialog(mainWindow!,{title:"Choose an empty output folder for converted model files",properties:["openDirectory"]});
  if(destination.canceled||!destination.filePaths[0])return null;
  const output=destination.filePaths[0],outputStat=await fs.promises.lstat(output);if(outputStat.isSymbolicLink()||!outputStat.isDirectory())throw new Error("Choose a real output directory, not a symbolic link.");const realOutput=await fs.promises.realpath(output);if(realOutput===realRoot||realOutput.startsWith(prefix))throw new Error("Choose an output folder outside the inspected source project.");const outputEntries=await fs.promises.readdir(realOutput);if(outputEntries.length)throw new Error("Choose an empty output folder. FACE FORGE will not overwrite existing files.");
  const binary=app.isPackaged?path.join(process.resourcesPath,"face-forge-native.exe"):path.resolve(__dirname,"../../native/target/release/face-forge-native.exe");
  if(!fs.existsSync(binary))throw new Error("The native conversion engine is missing. Rebuild FACE FORGE with the native engine enabled.");
  const dependencySources=new Set<string>();
  for(const modelPath of selectedPaths){
   const relative=path.relative(root,modelPath).replaceAll("\\","/");
   if(sourceFormat==="model")dependencySources.add(relative.slice(0,relative.lastIndexOf("."))+".mtl");
   else if(sourceFormat==="fmdl")dependencySources.add(relative);
   else for(const file of inventory.files)if(file.path.startsWith(relative+"!/")&&file.kind==="model-pes2021")dependencySources.add(file.path);
  }
  const conversionProject={...inventory,dependencies:inventory.dependencies.filter(item=>dependencySources.has(item.source))};
  const stageParent=await fs.promises.mkdtemp(path.join(path.dirname(realOutput),".face-forge-stage-"));
  const stageOutput=path.join(stageParent,"output");
  args.push("--out",stageOutput);
  try{
   await fs.promises.mkdir(stageOutput);
   const result=await execFileAsync(binary,args,{timeout:180000,maxBuffer:4*1024*1024,windowsHide:true});
   let report:unknown;try{report=JSON.parse(result.stdout.trim());}catch{throw new Error("Native converter returned an invalid result report.");}
   const textures=await convertFaceTextureDependencies(conversionProject,root,stageOutput,target);
   const published=await publishStagedOutput(stageOutput,realOutput);
   try{await fs.promises.rm(stageParent,{recursive:true,force:true});}catch{}
   return {destination:published,report,textures};
  }catch(error){
   try{await fs.promises.rm(stageParent,{recursive:true,force:true});}catch{}
   const detail=error instanceof Error?error.message:String(error);
   throw new Error("Native PES conversion failed; the selected output folder was not intentionally cleared: "+detail);
  }
 });
 ipcMain.handle("face:convert-complete-folder",async(event,folder:unknown,target:unknown)=>{
  trusted(event);
  if(typeof folder!=="string"||!path.isAbsolute(folder)||(target!==2017&&target!==2021))throw new Error("Invalid complete-face conversion request.");
  const root=path.resolve(folder),rootStat=await fs.promises.lstat(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error("The source face folder is not a safe directory.");
  const realRoot=await fs.promises.realpath(root),inventory=await inspectFaceFolder(root);
  const expected=target===2017?"pes2021":"pes2017";
  if(inventory.detectedGame!==expected)throw new Error("The selected route requires "+expected.toUpperCase()+" source assets; detected "+inventory.detectedGame+". Mixed or unknown-generation folders must be resolved before conversion.");
  if(inventory.files.some(file=>(file.packageReferences?.length??0)>0))throw new Error("This face package declares inter-package references. The current single-face export cannot safely resolve those external package links.");
  const destination=await dialog.showOpenDialog(mainWindow!,{title:"Choose an empty output folder for the complete converted face CPK",properties:["openDirectory"]});
  if(destination.canceled||!destination.filePaths[0])return null;
  const output=path.resolve(destination.filePaths[0]),outputStat=await fs.promises.lstat(output);
  if(outputStat.isSymbolicLink()||!outputStat.isDirectory())throw new Error("Choose a real output directory, not a symbolic link.");
  const realOutput=await fs.promises.realpath(output),rootPrefix=realRoot.endsWith(path.sep)?realRoot:realRoot+path.sep,outputPrefix=realOutput.endsWith(path.sep)?realOutput:realOutput+path.sep;
  if(realOutput===realRoot||realOutput.startsWith(rootPrefix)||realRoot.startsWith(outputPrefix))throw new Error("Source and output folders must be separate and cannot contain one another.");
  if((await fs.promises.readdir(realOutput)).length)throw new Error("Choose an empty output folder; existing files will never be overwritten.");
  const binary=app.isPackaged?path.join(process.resourcesPath,"face-forge-native.exe"):path.resolve(__dirname,"../../native/target/release/face-forge-native.exe");
  if(!fs.existsSync(binary))throw new Error("The native conversion engine is missing. Rebuild FACE FORGE with the upstream Team compiler enabled.");
  const stageParent=await fs.promises.mkdtemp(path.join(path.dirname(realOutput),".face-forge-complete-stage-"));
  const stageOutput=path.join(stageParent,"output");
  try{
   await fs.promises.mkdir(stageOutput);
   const result=await execFileAsync(binary,["convert-face-folder","--input",realRoot,"--target",String(target),"--out",stageOutput],{timeout:600000,maxBuffer:16*1024*1024,windowsHide:true});
   let parsedReport:unknown;try{parsedReport=JSON.parse(result.stdout.trim());}catch{throw new Error("The upstream face compiler returned an invalid conversion report.");}
   if(!parsedReport||typeof parsedReport!=="object"||(parsedReport as {ok?:unknown}).ok!==true||!Array.isArray((parsedReport as {cpkFiles?:unknown}).cpkFiles)||(parsedReport as {cpkFiles:string[]}).cpkFiles.length===0)throw new Error("The upstream compiler did not produce a conversion report with CPK outputs.");
   const cpkNames=(parsedReport as {cpkFiles:string[]}).cpkFiles;
   const archiveVerification:Array<{archive:string;fileCount:number;entries:Array<{path:string;size:number;sha256:string}>}>=[];
   for(const archiveName of cpkNames){
    if(typeof archiveName!=="string"||!archiveName||path.basename(archiveName)!==archiveName||!archiveName.toLowerCase().endsWith(".cpk"))throw new Error("The native report contains an unsafe CPK output name.");
    const archivePath=path.join(stageOutput,archiveName),archiveStat=await fs.promises.lstat(archivePath);
    if(archiveStat.isSymbolicLink()||!archiveStat.isFile()||archiveStat.size<0x800)throw new Error("The compiler's CPK output is missing, unsafe or truncated: "+archiveName);
    const archiveBytes=await readFile(archivePath),verification=verifyPes2017FaceCpk(archiveBytes),inspection=verification.inspection;
    const entries=inspection.files.map(entry=>({path:entry.path,size:entry.size,sha256:createHash("sha256").update(archiveBytes.subarray(entry.offset,entry.offset+entry.size)).digest("hex")}));
    archiveVerification.push({archive:archiveName,fileCount:inspection.fileCount,entries});
   }
   const report={...(parsedReport as Record<string,unknown>),archiveVerification:{method:"independent FACE FORGE CPK TOC/range read-back with per-entry SHA-256",archives:archiveVerification}};
   const published=await publishStagedOutput(stageOutput,realOutput);
   try{await fs.promises.rm(stageParent,{recursive:true,force:true});}catch{}
   return {destination:published,report};
  }catch(error){
   try{await fs.promises.rm(stageParent,{recursive:true,force:true});}catch{}
   const detail=error instanceof Error?error.message:String(error);
   throw new Error("Complete face conversion failed. The selected output folder was not intentionally cleared: "+detail);
  }
 });
 ipcMain.handle("face:build-fox-package",async(event,folder:unknown,virtualRoot:unknown)=>{
  trusted(event);
  if(typeof folder!=="string"||!path.isAbsolute(folder)||typeof virtualRoot!=="string"||virtualRoot.length>512)throw new Error("Invalid package source or virtual root.");
  const picked=await dialog.showSaveDialog(mainWindow!,{title:"Save paired PES 2021 face package",defaultPath:path.join(path.dirname(folder),path.basename(folder)+"-face.fpk"),filters:[{name:"Fox face package",extensions:["fpk"]}]});
  if(picked.canceled||!picked.filePath)return null;
  const base=picked.filePath.toLowerCase().endsWith(".fpk")?picked.filePath.slice(0,-4):picked.filePath;
  return buildFoxFacePackage(folder,base,virtualRoot);
 });
 ipcMain.handle("face:preview-model",async(event,folder:unknown,relativePath:unknown)=>{
  trusted(event);
  if(typeof folder!=="string"||!path.isAbsolute(folder)||typeof relativePath!=="string"||relativePath.length>2048)throw new Error("Invalid preview source.");
  const root=path.resolve(folder),rootStat=await fs.promises.lstat(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error("The selected face folder is no longer a safe directory.");
  const realRoot=await fs.promises.realpath(root);
  let data:Buffer,extension:string,companionMtl:Buffer|undefined;
  const archiveMarker=relativePath.indexOf("!/");
  if(archiveMarker>=0){
   const archiveRelative=relativePath.slice(0,archiveMarker),memberName=relativePath.slice(archiveMarker+2).replaceAll("\\\\","/");
   if(!archiveRelative||!memberName||memberName.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Invalid embedded model path.");
   const archivePath=path.resolve(root,archiveRelative),prefix=root.endsWith(path.sep)?root:root+path.sep;
   if(!archivePath.startsWith(prefix))throw new Error("Preview archive escapes the selected face folder.");
   const realArchive=await fs.promises.realpath(archivePath),realPrefix=realRoot.endsWith(path.sep)?realRoot:realRoot+path.sep;
   if(!realArchive.startsWith(realPrefix))throw new Error("Preview archive resolves outside the selected face folder.");
   const stat=await fs.promises.lstat(archivePath);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>256*1024*1024)throw new Error("Preview archive is not a safe file.");
   const archive=parseFpkArchive(await readFile(archivePath));
   const member=archive.entries.find(entry=>entry.name.toLowerCase()===memberName.toLowerCase());
   if(!member)throw new Error("The requested model was not found inside the FPK archive. Re-scan the face folder.");
   if(member.size>256*1024*1024)throw new Error("Embedded model exceeds the preview size limit.");
   data=member.data;extension=path.extname(member.name).toLowerCase();
  }else{
   const source=path.resolve(root,relativePath),prefix=root.endsWith(path.sep)?root:root+path.sep;
   if(!source.startsWith(prefix))throw new Error("Preview path escapes the selected face folder.");
   const realSource=await fs.promises.realpath(source),realPrefix=realRoot.endsWith(path.sep)?realRoot:realRoot+path.sep;
   if(!realSource.startsWith(realPrefix))throw new Error("Preview source resolves outside the selected face folder.");
   const stat=await fs.promises.lstat(source);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>256*1024*1024)throw new Error("Preview source is not a safe supported file.");
   data=await readFile(source);extension=path.extname(source).toLowerCase();
   if(extension===".model"){const mtlPath=path.join(path.dirname(source),path.basename(source,path.extname(source))+".mtl");if(fs.existsSync(mtlPath)){const mtlStat=await fs.promises.lstat(mtlPath);if(mtlStat.isSymbolicLink()||!mtlStat.isFile()||mtlStat.size>32*1024*1024)throw new Error("Companion PES 2017 MTL is not a safe regular file.");companionMtl=await readFile(mtlPath);}}
  }
  let generation:"pes2017"|"pes2021",meshes:Array<{name:string;positions:number[];normals:number[];uvs:number[];indices:number[]}>=[],materials:Array<{name:string;shader:string|null;textures:Record<string,string>}>=[],warnings:string[]=[];
  if(extension===".fmdl"){
   const scene=decodePes2021Fmdl(parseFmdlContainer(data));generation="pes2021";materials=scene.materials.map(material=>({name:material.name,shader:material.shader,textures:material.textures}));
   meshes=scene.meshes.map(mesh=>({name:mesh.name,positions:mesh.vertices.flatMap(v=>v.position),normals:mesh.vertices.every(v=>v.normal)?mesh.vertices.flatMap(v=>v.normal!):[],uvs:mesh.vertices.every(v=>v.uvs.length>0)?mesh.vertices.flatMap(v=>v.uvs[0]):[],indices:mesh.indices}));
   if(scene.bones.length)warnings.push(scene.bones.length+" source bones detected; preview is static and does not play facial animation.");
   if(scene.metadata.additionalLodLevels)warnings.push("Additional LOD levels are not shown in this preview.");
  }else if(extension===".model"){
   const scene=decodePes2017Model(parseModelContainer(data),companionMtl);generation="pes2017";materials=scene.materials.map(material=>({name:material.name,shader:material.shader,textures:material.textures}));
   meshes=scene.meshes.map(mesh=>({name:mesh.name,positions:mesh.vertices.flatMap(v=>v.position),normals:mesh.vertices.every(v=>v.normal)?mesh.vertices.flatMap(v=>v.normal!):[],uvs:mesh.vertices.every(v=>v.uvs.length>0)?mesh.vertices.flatMap(v=>v.uvs[0]):[],indices:mesh.indices}));
   if(typeof scene.metadata.modelWarnings==="string"&&scene.metadata.modelWarnings)warnings.push(scene.metadata.modelWarnings);
   warnings.push("PES 2017 preview is static. External MTL shader/texture bindings and facial animation are not yet rendered.");
  }else throw new Error("Choose a .fmdl or .model file for 3D preview.");
  if(!meshes.length)throw new Error("No renderable mesh geometry was found in this model.");
  const totalVertices=meshes.reduce((sum,mesh)=>sum+mesh.positions.length/3,0);if(totalVertices>500000)throw new Error("Preview exceeds the 500,000-vertex safety limit.");
  return {source:relativePath,generation,meshes,materials,warnings};
 });
 ipcMain.handle("texture:convert-folder",async(event,colorSpace:unknown)=>{
  trusted(event);
  if(colorSpace!=="LINEAR"&&colorSpace!=="SRGB"&&colorSpace!=="NORMAL")throw new Error("Invalid texture color-space selection.");
  const picked=await dialog.showOpenDialog(mainWindow!,{title:"Choose a face texture folder",properties:["openDirectory"]});
  if(picked.canceled||!picked.filePaths[0])return null;
  const sourceRoot=path.resolve(picked.filePaths[0]),sourceStat=await fs.promises.lstat(sourceRoot);
  if(sourceStat.isSymbolicLink()||!sourceStat.isDirectory())throw new Error("Choose a real source folder, not a shortcut.");
  const realSource=await fs.promises.realpath(sourceRoot);
  const files:Array<{source:string;relative:string;data:Buffer;format:string;width:number;height:number}>=[];
  let totalBytes=0,visitedEntries=0;
  async function scan(dir:string,relative="",depth=0):Promise<void>{
   if(depth>32)throw new Error("Texture folder nesting exceeds the 32-level safety limit.");
   const entries=await fs.promises.readdir(dir,{withFileTypes:true});
   for(const entry of entries){
    visitedEntries++;if(visitedEntries>10000)throw new Error("Texture folder contains more than 10,000 entries; narrow the selected source folder.");
    const absolute=path.join(dir,entry.name),rel=path.posix.join(relative,entry.name),stat=await fs.promises.lstat(absolute);
    if(stat.isSymbolicLink())throw new Error("Texture batch stopped: symbolic link found at "+rel+".");
    if(stat.isDirectory()){await scan(absolute,rel,depth+1);continue;}
    if(!stat.isFile())continue;
    const ext=path.extname(entry.name).toLowerCase();
    if(ext!==".dds"&&ext!==".ftex")continue;
    if(files.length>=500)throw new Error("Texture batch exceeds the 500-file safety limit.");
    if(stat.size>64*1024*1024)throw new Error("Texture batch contains an oversized file: "+rel);
    totalBytes+=stat.size;if(totalBytes>512*1024*1024)throw new Error("Texture batch exceeds the 512 MiB source safety limit.");
    const real=await fs.promises.realpath(absolute),prefix=realSource.endsWith(path.sep)?realSource:realSource+path.sep;
    if(!real.startsWith(prefix))throw new Error("Texture path resolves outside the selected source folder.");
    const input=await readFile(absolute),converted=ext===".dds"?ddsToFtex(input,colorSpace as TextureColorSpace):ftexToDds(input);
    if(converted.data.length>128*1024*1024)throw new Error("Converted texture exceeds the 128 MiB per-file output safety limit: "+rel);
    const outputTotal=files.reduce((sum,file)=>sum+file.data.length,converted.data.length);
    if(outputTotal>512*1024*1024)throw new Error("Texture batch exceeds the 512 MiB converted-output safety limit.");
    files.push({source:absolute,relative:rel,data:converted.data,format:converted.info.formatName,width:converted.info.width,height:converted.info.height});
   }
  }
  await scan(sourceRoot);
  if(!files.length)throw new Error("No .dds or .ftex textures were found in the selected folder.");
  const outputNames=new Set<string>();
  for(const file of files){const ext=path.extname(file.relative).toLowerCase(),name=path.posix.join(path.posix.dirname(file.relative),path.posix.basename(file.relative,path.posix.extname(file.relative))+(ext===".dds"?".ftex":".dds")).toLowerCase();if(outputNames.has(name))throw new Error("Texture batch has output-name collisions on Windows: "+name+". Separate or rename the source files before converting.");outputNames.add(name);}
  const destination=await dialog.showOpenDialog(mainWindow!,{title:"Choose an empty output folder for converted textures",properties:["openDirectory"]});
  if(destination.canceled||!destination.filePaths[0])return null;
  const outputRoot=path.resolve(destination.filePaths[0]),outStat=await fs.promises.lstat(outputRoot);
  if(outStat.isSymbolicLink()||!outStat.isDirectory())throw new Error("Choose a real output directory.");
  const realOutput=await fs.promises.realpath(outputRoot),sourcePrefix=realSource.endsWith(path.sep)?realSource:realSource+path.sep;
  if(realOutput===realSource||realOutput.startsWith(sourcePrefix)||realSource.startsWith(realOutput.endsWith(path.sep)?realOutput:realOutput+path.sep))throw new Error("Source and output folders must be separate and cannot contain one another.");
  if((await fs.promises.readdir(realOutput)).length)throw new Error("Choose an empty output folder; existing files will never be overwritten.");
  const outputBytes=files.reduce((sum,file)=>sum+file.data.length,0);
  if(outputBytes>1024*1024*1024)throw new Error("Converted textures exceed the 1 GiB output safety limit.");
  const written:string[]=[];
  try{for(const file of files){
   const ext=path.extname(file.relative).toLowerCase(),target=path.join(realOutput,path.dirname(file.relative),path.basename(file.relative,path.extname(file.relative))+(ext===".dds"?".ftex":".dds"));
   const parent=path.dirname(target);await fs.promises.mkdir(parent,{recursive:true});
   written.push(target);await writeFile(target,file.data,{flag:"wx"});
  }}catch(error){for(const target of written){try{await fs.promises.unlink(target);}catch{}}throw new Error("Batch texture conversion was rolled back because an output file could not be written: "+(error instanceof Error?error.message:String(error)));}
  return {source:realSource,destination:realOutput,converted:written.length,bytes:outputBytes,files:files.map((file,index)=>({source:file.relative,destination:path.relative(realOutput,written[index]),format:file.format,width:file.width,height:file.height}))};
 });
 ipcMain.handle("texture:convert",async(event,colorSpace:unknown)=>{
  trusted(event);
  if(colorSpace!=="LINEAR"&&colorSpace!=="SRGB"&&colorSpace!=="NORMAL")throw new Error("Invalid texture color-space selection.");
  const picked=await dialog.showOpenDialog(mainWindow!,{title:"Choose a DDS or FTEX texture",properties:["openFile"],filters:[{name:"PES textures",extensions:["dds","ftex"]}]});
  if(picked.canceled||!picked.filePaths[0])return null;
  const source=picked.filePaths[0],extension=path.extname(source).toLowerCase(),sourceStat=await fs.promises.lstat(source);
  if(sourceStat.isSymbolicLink()||!sourceStat.isFile()||sourceStat.size>128*1024*1024)throw new Error("Texture source must be a regular file no larger than 128 MiB.");
  const input=await readFile(source);
  const converted=extension===".dds"?ddsToFtex(input,colorSpace as TextureColorSpace):extension===".ftex"?ftexToDds(input):null;
  if(!converted)throw new Error("Choose a .dds or .ftex texture.");
  if(converted.data.length>256*1024*1024)throw new Error("Converted texture exceeds the 256 MiB output safety limit.");
  const outputExtension=extension===".dds"?".ftex":".dds";
  const suggested=path.join(path.dirname(source),path.basename(source,path.extname(source))+".converted"+outputExtension);
  const save=await dialog.showSaveDialog(mainWindow!,{title:"Save converted texture",defaultPath:suggested,filters:[{name:outputExtension===".dds"?"DDS texture":"FTEX texture",extensions:[outputExtension.slice(1)]}]});
  if(save.canceled||!save.filePath)return null;
  if(path.extname(save.filePath).toLowerCase()!==outputExtension)throw new Error("Choose the correct "+outputExtension+" output extension.");
  await writeFile(save.filePath,converted.data,{flag:"wx"});
  return {source,destination:save.filePath,format:converted.info.formatName,width:converted.info.width,height:converted.info.height,bytes:converted.data.length};
 });
}
function createWindow(){
 const iconPath=app.isPackaged?path.join(process.resourcesPath,"face-forge.ico"):path.join(app.getAppPath(),"assets","face-forge.ico");
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:980,minHeight:720,backgroundColor:"#090b10",title:"THEGODMODS FACE FORGE",...(fs.existsSync(iconPath)?{icon:iconPath}:{}),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 if(app.isPackaged)void mainWindow.loadFile(path.join(__dirname,"../../dist/index.html"));else void mainWindow.loadURL("http://127.0.0.1:5173");
 mainWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
 const trustedUrl=app.isPackaged?pathToFileURL(path.join(__dirname,"../../dist/index.html")).href:"http://127.0.0.1:5173/";
 mainWindow.webContents.on("will-navigate",(event,url)=>{if(url!==trustedUrl)event.preventDefault();});
 mainWindow.on("closed",()=>{mainWindow=null;});
}
app.whenReady().then(()=>{registerIpc();createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
