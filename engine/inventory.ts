import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspectDdsHeader, inspectFmdlHeader, inspectFtexHeader, inspectModelHeader } from "./formats/headers";
import { decodeWesysModel } from "./formats/model-container";
import { analyzeFacePackage,type FacePartCoverage } from "./face-package";
import { inspectFaceDiff } from "./formats/face-diff";
import { parseFpkArchive } from "./formats/fpk";
import { parseFmdlContainer } from "./formats/fmdl-container";
import { decodePes2021Fmdl } from "./formats/fmdl-geometry";
import { resolveFaceDependencies } from "./dependencies";
export type FaceFile = { path:string;bytes:number;kind:string;sha256:string;formatValid?:boolean;formatDetails?:string[];assetReferences?:string[];packageReferences?:string[] };
export type FaceDependency={source:string;reference:string;status:"resolved"|"missing"|"ambiguous";candidates:string[]};
export type FaceProject = { root:string;detectedGame:"pes2017"|"pes2021"|"mixed"|"unknown";fileCount:number;totalBytes:number;models:number;textures:number;files:FaceFile[];warnings:string[];missing:string[];coverage:FacePartCoverage[];dependencies:FaceDependency[] };
const MAX_FILES=5000,MAX_TOTAL_BYTES=1024*1024*1024,MAX_FILE_BYTES=256*1024*1024;
const RELEVANT=new Set([".fmdl",".model",".ftex",".dds",".xml",".mtl",".bin",".fpk",".fpkd",".kpfd",".cpk",".png",".jpg",".jpeg"]);
async function inspectFile(rel:string,absolute:string,size:number,embedded?:Buffer):Promise<FaceFile>{
 const data=embedded??await readFile(absolute),ext=path.extname(rel).toLowerCase();let kind="other",valid:boolean|undefined,details:string[]|undefined,assetReferences:string[]|undefined,packageReferences:string[]|undefined;
 if(ext===".fmdl"){const x=inspectFmdlHeader(data);kind=x.valid?"model-pes2021":"invalid-fmdl";valid=x.valid;details=x.details;if(x.valid){try{const scene=decodePes2021Fmdl(parseFmdlContainer(data));assetReferences=[...new Set(scene.materials.flatMap(material=>Object.values(material.textures)))];}catch{details=[...(details??[]),"Material/texture references could not be semantically resolved by the current inspector."];assetReferences=[];}}}
 else if(ext===".model"){let modelData:Buffer<ArrayBufferLike>=data,compressed=false,decompressionError:string|undefined;try{const decoded=decodeWesysModel(data);modelData=decoded.data;compressed=decoded.wrapperVersion!==null;}catch(error){decompressionError=error instanceof Error?error.message:"Invalid WESYS wrapper."; }const x=decompressionError?{valid:false,details:[decompressionError]}:inspectModelHeader(modelData);kind=x.valid?(compressed?"model-pes2017-compressed":"model-pes2017"):"invalid-model";valid=x.valid;details=x.details;}
 else if(ext===".ftex"){const x=inspectFtexHeader(data);kind=x.valid?"texture-pes2021":"invalid-ftex";valid=x.valid;details=x.details;}
 else if(ext===".dds"){const x=inspectDdsHeader(data);kind=x.valid?"texture-pes2017":"invalid-dds";valid=x.valid;details=x.details;}
 else if([".xml",".mtl"].includes(ext))kind="material-metadata";else if(ext===".bin"){if(data.toString("ascii",0,4)==="FACE"){try{const x=inspectFaceDiff(data);kind="face-diff";valid=true;details=["FACE diff metadata", "Eye scale: "+x.eyeScale.join(", "), "Mouth position: "+x.mouthPosition.join(", "), "Right eye position: "+x.rightEyePosition.join(", "), "Left eye position: "+x.leftEyePosition.join(", "),...x.warnings];}catch(error){kind="invalid-face-diff";valid=false;details=[error instanceof Error?error.message:"Invalid FACE diff binary."];}}else kind="auxiliary";}else if([".fpk",".fpkd",".kpfd"].includes(ext)){try{const archive=parseFpkArchive(data);kind=archive.kind==="fpk"?"container-fpk":"container-fpkd";packageReferences=archive.references;valid=true;details=["Fox FPK v2 archive",archive.entries.length+" embedded entries",archive.references.length+" package references"];if(ext===".kpfd")details.push("Fox archive signature validated despite the .kpfd extension.");}catch(error){kind=ext===".kpfd"?"container-kpfd-unknown":"invalid-fpk";valid=false;details=[error instanceof Error?error.message:"Invalid Fox archive."];}}else if(ext===".cpk")kind="container-cpk";else if([".png",".jpg",".jpeg"].includes(ext))kind="image-source";
 return {path:rel.replaceAll("\\","/"),bytes:size,kind,sha256:createHash("sha256").update(data).digest("hex"),formatValid:valid,formatDetails:details,assetReferences,packageReferences};
}
export async function inspectFaceFolder(folder:string):Promise<FaceProject>{
 const root=path.resolve(folder),rootStat=await lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error("Choose a real face folder, not a shortcut or file.");
 const files:FaceFile[]=[],warnings:string[]=[];let totalBytes=0;
 async function walk(dir:string,relative=""):Promise<void>{const entries=await readdir(dir,{withFileTypes:true});for(const entry of entries){const absolute=path.join(dir,entry.name),rel=path.posix.join(relative,entry.name),stat=await lstat(absolute);if(stat.isSymbolicLink()){warnings.push("Skipped symbolic link: "+rel);continue;}if(stat.isDirectory()){await walk(absolute,rel);continue;}if(!stat.isFile())continue;if(files.length>=MAX_FILES)throw new Error("This project exceeds the 5,000-file safety limit.");if(stat.size>MAX_FILE_BYTES){warnings.push("Skipped oversized file: "+rel);continue;}if(!RELEVANT.has(path.extname(entry.name).toLowerCase()))continue;totalBytes+=stat.size;if(totalBytes>MAX_TOTAL_BYTES)throw new Error("This project exceeds the 1 GiB inspection limit.");files.push(await inspectFile(rel,absolute,stat.size));if([".fpk",".fpkd",".kpfd"].includes(path.extname(entry.name).toLowerCase())&&files[files.length-1].formatValid===true){try{const archiveBytes=await readFile(absolute);const archive=parseFpkArchive(archiveBytes);if(files.length+archive.entries.length>MAX_FILES)throw new Error("FPK archive entries exceed the 5,000-file inspection limit.");for(const member of archive.entries){const virtualPath=rel+"!/"+member.name;const embeddedFile=await inspectFile(virtualPath,absolute,member.size,member.data);files.push(embeddedFile);}}catch(error){warnings.push("Could not extract "+rel+": "+(error instanceof Error?error.message:"Invalid FPK archive."));}}}}
 await walk(root);
 const has21Model=files.some(f=>f.kind==="model-pes2021"),has17Model=files.some(f=>f.kind==="model-pes2017"||f.kind==="model-pes2017-compressed");
 const has21Texture=files.some(f=>f.kind==="texture-pes2021"),has17Texture=files.some(f=>f.kind==="texture-pes2017");
 const detectedGame=has21Model&&has17Model?"mixed":has21Model?"pes2021":has17Model?"pes2017":has21Texture&&has17Texture?"mixed":has21Texture?"pes2021":has17Texture?"pes2017":"unknown";
 const dependencies=resolveFaceDependencies(files);
 if(dependencies.some(item=>item.status==="missing"))warnings.push(dependencies.filter(item=>item.status==="missing").length+" model texture/package reference(s) have no matching asset in this folder. Conversion must not silently drop these dependencies.");
 if(dependencies.some(item=>item.status==="ambiguous"))warnings.push(dependencies.filter(item=>item.status==="ambiguous").length+" FMDL texture reference(s) match multiple files. Resolve duplicate texture names before package conversion.");
 const models=files.filter(f=>f.kind.startsWith("model-pes")).length,textures=files.filter(f=>f.kind.startsWith("texture-pes")).length;
 const fpkFiles=files.filter(f=>f.kind==="container-fpk");
 const extractedFpkModels=files.filter(f=>f.path.includes("!/")&&f.kind.startsWith("model-pes2021"));
 const fpkdFiles=files.filter(f=>f.kind==="container-fpkd"||f.kind==="container-kpfd-unknown");
 if(fpkFiles.length&&!extractedFpkModels.length){warnings.push(`${fpkFiles.length} FPK face package(s) detected, but no supported FMDL model was decoded from their contents. Check the archive entries and extraction diagnostics.`);}else if(extractedFpkModels.length){warnings.push(`Parsed ${extractedFpkModels.length} PES 2021 model candidate(s) from FPK package contents in memory. Header recognition is not full geometry/material/rig validation. Original archives were not modified.`);}
 if(fpkdFiles.length)warnings.push(`${fpkdFiles.length} FPKD/KPFD companion file(s) detected. FPKD is a Fox package variant; a .kpfd extension is not assumed to be FPKD unless its binary signature validates.`);
 if(!models&&!fpkFiles.length)warnings.push("No valid supported face model was found. A file extension alone is not enough.");if(!textures)warnings.push("No valid DDS or FTEX texture was found.");if(detectedGame==="mixed")warnings.push("Both generation formats are present. Check whether this is a hybrid or previously converted project.");
 if(has21Model&&has17Texture||has17Model&&has21Texture)warnings.push("Model and texture generations do not match. Verify companion textures before conversion.");if(detectedGame==="unknown")warnings.push("The source game could not be identified from validated model and texture signatures.");
 for(const f of files.filter(f=>f.kind.startsWith("invalid-")))warnings.push(`Invalid ${f.kind.replace("invalid-","").toUpperCase()} header: ${f.path}`);
 return {root,detectedGame,fileCount:files.length,totalBytes,models,textures,files,warnings,missing:[],coverage:analyzeFacePackage(files),dependencies};
}
