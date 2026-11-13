import path from "node:path";
import {lstat,realpath,readFile,mkdir,writeFile,unlink} from "node:fs/promises";
import type {FaceProject} from "../engine/inventory";
import {parseFpkArchive} from "../engine/formats/fpk";
import {parsePes2017Mtl} from "../engine/formats/mtl";
import {ddsToFtex,ftexToDds,type TextureColorSpace} from "../engine/formats/texture";

type TargetGeneration="2017"|"2021";
type PlannedTexture={source:string;reference:string;destination:string;data:Buffer;format:string;width:number;height:number};
const MAX_TEXTURE_BYTES=128*1024*1024,MAX_TOTAL_BYTES=512*1024*1024;

function outputPath(reference:string,sourceExtension:string,targetExtension:string):string{
 const normalized=reference.replace(/\\/g,"/").trim();
 if(!normalized||/^[a-z]:/i.test(normalized))throw new Error("Texture reference is empty or drive-qualified: "+reference);
 const relative=normalized.replace(/^\/+/,"").replace(/^\.\/+/,"");
 const parts=relative.split("/");
 if(parts.some(part=>!part||part==="."||part===".."))throw new Error("Texture reference escapes its project root: "+reference);
 if(path.posix.extname(relative).toLowerCase()!=="."+sourceExtension)throw new Error("Texture reference has an unexpected source extension: "+reference);
 return path.posix.join(path.posix.dirname(relative),path.posix.basename(relative,path.posix.extname(relative))+"."+targetExtension);
}

async function readProjectFile(root:string,relative:string):Promise<Buffer>{
 const marker=relative.indexOf("!/");
 if(marker>=0){
  const archiveRelative=relative.slice(0,marker),memberName=relative.slice(marker+2);
  if(!archiveRelative||!memberName||memberName.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Unsafe embedded texture path: "+relative);
  const archivePath=path.resolve(root,...archiveRelative.split("/")),prefix=path.resolve(root)+path.sep;
  if(!archivePath.startsWith(prefix))throw new Error("Embedded texture archive escapes the source folder.");
  const stat=await lstat(archivePath);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>512*1024*1024)throw new Error("Embedded texture archive is not a safe file.");
  const actual=await realpath(archivePath);if(!actual.startsWith(await realpath(root)+path.sep))throw new Error("Embedded texture archive resolves outside the source folder.");
  const archive=parseFpkArchive(await readFile(archivePath));
  const entry=archive.entries.find(item=>item.name.toLowerCase()===memberName.toLowerCase());
  if(!entry)throw new Error("Resolved texture is missing from its FPK archive: "+relative);
  return entry.data;
 }
 const absolute=path.resolve(root,...relative.split("/")),prefix=path.resolve(root)+path.sep;
 if(!absolute.startsWith(prefix))throw new Error("Texture path escapes the source folder: "+relative);
 const stat=await lstat(absolute);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_TEXTURE_BYTES)throw new Error("Texture source is not a safe regular file: "+relative);
 const actual=await realpath(absolute);if(!actual.startsWith(await realpath(root)+path.sep))throw new Error("Texture source resolves outside the source folder: "+relative);
 return readFile(absolute);
}

export async function convertFaceTextureDependencies(project:FaceProject,sourceRoot:string,outputRoot:string,target:TargetGeneration){
 const sourceKind=target==="2017"?"model-pes2021":"material-pes2017";
 const fromExtension=target==="2017"?"ftex":"dds",toExtension=target==="2017"?"dds":"ftex";
 const relevantDependencies=project.dependencies.filter(dep=>project.files.some(file=>file.path===dep.source&&file.kind===sourceKind));
 const unresolved=relevantDependencies.filter(dep=>dep.status!=="resolved");
 if(unresolved.length)throw new Error("Face texture dependency closure is incomplete; missing or ambiguous sampler references: "+unresolved.map(dep=>dep.source+" -> "+dep.reference+" ("+dep.status+")").join("; "));
 const dependencies=relevantDependencies;
 const plans:PlannedTexture[]=[],destinations=new Map<string,string>();
 let totalBytes=0;
 for(const dependency of dependencies){
  if(dependency.candidates.length!==1)throw new Error("Texture dependency is not uniquely resolved: "+dependency.reference);
  const source=dependency.candidates[0],file=project.files.find(item=>item.path===source);
  if(!file||file.kind!==(target==="2017"?"texture-pes2021":"texture-pes2017"))throw new Error("Resolved texture has the wrong source generation: "+source);
  const input=await readProjectFile(sourceRoot,source);
  if(input.length>MAX_TEXTURE_BYTES)throw new Error("Texture exceeds the 128 MiB conversion limit: "+source);
  let converted:{data:Buffer;info:{formatName:string;width:number;height:number}};
  if(target==="2017")converted=ftexToDds(input);
  else{
   const mtlBytes=await readProjectFile(sourceRoot,dependency.source);
   const mtl=parsePes2017Mtl(mtlBytes);
   const samplers=mtl.materials.flatMap(material=>material.samplers).filter(sampler=>sampler.path.toLowerCase()===dependency.reference.replace(/\\/g,"/").replace(/^\.\/+/,"").toLowerCase());
   if(!samplers.length||samplers.some(sampler=>sampler.srgb===null))throw new Error("DDS-to-FTEX conversion needs an explicit sRGB setting in the source MTL sampler: "+dependency.reference);
   if(samplers.some(sampler=>sampler.srgb!==samplers[0].srgb))throw new Error("One DDS texture is bound with conflicting sRGB settings: "+dependency.reference);
   const srgb=samplers[0].srgb===true;
   const normalFlags=samplers.map(sampler=>/normal|bump|nrm/i.test(sampler.name));
   if(normalFlags.some(Boolean)&&!normalFlags.every(Boolean))throw new Error("One DDS texture is bound to conflicting normal and colour samplers: "+dependency.reference);
   const normal=normalFlags.every(Boolean);
   const colorSpace:TextureColorSpace=srgb?"SRGB":normal?"NORMAL":"LINEAR";
   converted=ddsToFtex(input,colorSpace);
  }
  const destination=outputPath(dependency.reference,fromExtension,toExtension);
  const key=destination.toLowerCase(),prior=destinations.get(key);
  if(prior&&prior!==source)throw new Error("Two source textures map to the same Windows output path: "+destination);
  if(prior)continue;
  destinations.set(key,source);
  if(converted.data.length>MAX_TEXTURE_BYTES)throw new Error("Converted texture exceeds the 128 MiB output limit: "+source);
  totalBytes+=converted.data.length;if(totalBytes>MAX_TOTAL_BYTES)throw new Error("Converted face textures exceed the 512 MiB output limit.");
  plans.push({source,reference:dependency.reference,destination,data:converted.data,format:converted.info.formatName,width:converted.info.width,height:converted.info.height});
 }
 const written:string[]=[];
 try{
  for(const plan of plans){
   const targetPath=path.resolve(outputRoot,...plan.destination.split("/")),prefix=path.resolve(outputRoot)+path.sep;
   if(!targetPath.startsWith(prefix))throw new Error("Converted texture destination escapes the output folder.");
   await mkdir(path.dirname(targetPath),{recursive:true});
   await writeFile(targetPath,plan.data,{flag:"wx"});
   written.push(targetPath);
  }
 }catch(error){
  for(const file of written){try{await unlink(file);}catch{}}
  throw new Error("Face texture conversion was rolled back: "+(error instanceof Error?error.message:String(error)));
 }
 return {converted:plans.length,bytes:totalBytes,files:plans.map(plan=>({source:plan.source,reference:plan.reference,destination:plan.destination,format:plan.format,width:plan.width,height:plan.height}))};
}
