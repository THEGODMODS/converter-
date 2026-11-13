import path from "node:path";
import {lstat,realpath,readdir,readFile,writeFile} from "node:fs/promises";
import {writeFpkArchive} from "../engine/formats/fpk";

const MAX_FILES=10000,MAX_FILE_BYTES=256*1024*1024,MAX_TOTAL_BYTES=1024*1024*1024;
function normalizeRoot(value:string):string{
 const root=value.replace(/\\/g,"/").replace(/^\/+/,"").replace(/\/+$/,"");
 if(!root.startsWith("Assets/pes16/model/character/face/")||root.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Package virtual root must be a safe PES 2021 face path under Assets/pes16/model/character/face/.");
 return root;
}
function virtualName(root:string,relative:string):string{
 const normalized=relative.replace(/\\/g,"/");
 if(normalized.startsWith("Assets/"))return normalized;
 if(normalized.startsWith("/")||normalized.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Unsafe converted output path: "+relative);
 return root+"/"+normalized;
}
export async function buildFoxFacePackage(convertedFolder:string,outputBase:string,virtualRoot:string){
 const root=path.resolve(convertedFolder),base=path.resolve(outputBase),realRoot=await realpath(root),stat=await lstat(root);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("Converted output must be a regular directory.");
 const prefix=realRoot.endsWith(path.sep)?realRoot:realRoot+path.sep;
 if(base===realRoot||base.startsWith(prefix))throw new Error("Package output must be outside the converted source folder.");
 const nameRoot=normalizeRoot(virtualRoot),models:Array<{name:string;data:Buffer}>=[],textures:Array<{name:string;data:Buffer}>=[];
 let total=0,count=0;
 async function walk(directory:string,relative:string):Promise<void>{
  const entries=await readdir(directory,{withFileTypes:true});
  for(const entry of entries){
   const absolute=path.join(directory,entry.name),rel=relative?relative+"/"+entry.name:entry.name;
   const item=await lstat(absolute);
   if(item.isSymbolicLink())throw new Error("Symbolic links are not allowed in package inputs: "+rel);
   if(item.isDirectory()){await walk(absolute,rel);continue;}
   if(!item.isFile())throw new Error("Unsupported filesystem entry in converted output: "+rel);
   if(++count>MAX_FILES)throw new Error("Package contains more than 10,000 files.");
   if(item.size>MAX_FILE_BYTES)throw new Error("Package input exceeds the 256 MiB per-file limit: "+rel);
   total+=item.size;if(total>MAX_TOTAL_BYTES)throw new Error("Package inputs exceed the 1 GiB total limit.");
   const data=await readFile(absolute),extension=path.extname(rel).toLowerCase(),name=virtualName(nameRoot,rel);
   if([".fmdl",".skl",".xml",".face_diff"].includes(extension))models.push({name,data});
   else if([".ftex",".dds"].includes(extension))textures.push({name,data});
   else throw new Error("Cannot safely classify converted file for Fox packaging: "+rel);
  }
 }
 await walk(root,"");
 if(!models.some(file=>file.name.toLowerCase().endsWith(".fmdl")))throw new Error("A Fox face package must contain at least one FMDL model.");
 if(!textures.length)throw new Error("A Fox face package must contain at least one validated texture dependency.");
 const fpk=writeFpkArchive("fpk",models),fpkd=writeFpkArchive("fpkd",textures);
 const fpkPath=base+".fpk",fpkdPath=base+".fpkd";
 await writeFile(fpkPath,fpk,{flag:"wx"});
 try{await writeFile(fpkdPath,fpkd,{flag:"wx"});}catch(error){await import("node:fs/promises").then(fs=>fs.unlink(fpkPath).catch(()=>{}));throw new Error("FPKD write failed; the paired FPK was rolled back: "+(error instanceof Error?error.message:String(error)));}
 return {fpk:fpkPath,fpkd:fpkdPath,models:models.length,textures:textures.length,bytes:fpk.length+fpkd.length};
}
