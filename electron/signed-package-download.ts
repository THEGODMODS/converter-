import path from "node:path";
import {createHash} from "node:crypto";
import {createWriteStream} from "node:fs";
import {access,mkdir,mkdtemp,rename,rm} from "node:fs/promises";
import {pipeline} from "node:stream/promises";
import {Readable,Transform} from "node:stream";
import {PACKAGE_LIMITS,assertTrustedPackageUrl,verifySignedPackageManifest,type PackageTrust} from "../engine/signed-package";

async function readBounded(response:Response,limit:number):Promise<Buffer>{
 if(!response.ok||!response.body)throw new Error("Package server returned HTTP "+response.status+".");
 const declared=Number(response.headers.get("content-length")??0);if(declared>limit)throw new Error("Package response exceeds its size limit.");
 const chunks:Buffer[]=[];let size=0;const reader=response.body.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error("Package response exceeded its size limit while downloading.");chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
export async function installSignedPackage(manifestUrl:string,packagesRoot:string,trust:PackageTrust){
 assertTrustedPackageUrl(manifestUrl,trust.hosts);
 const response=await fetch(manifestUrl,{redirect:"error",signal:AbortSignal.timeout(30000),headers:{accept:"application/json"}});
 const manifestBytes=await readBounded(response,PACKAGE_LIMITS.manifestBytes);
 let raw:unknown;try{raw=JSON.parse(manifestBytes.toString("utf8"));}catch{throw new Error("Package manifest is not valid JSON.");}
 const manifest=verifySignedPackageManifest(raw,trust);
 const root=path.resolve(packagesRoot);await mkdir(root,{recursive:true});
 const finalPath=path.join(root,manifest.packageId,manifest.version);
 try{await access(finalPath);throw new Error("This package version is already installed. Existing package files were not overwritten.");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
 const parent=path.dirname(finalPath);await mkdir(parent,{recursive:true});
 const stage=await mkdtemp(path.join(parent,".face-forge-stage-"));
 let written=0;
 try{
  for(const file of manifest.files){
   const destination=path.resolve(stage,...file.path.split("/"));
   const prefix=stage.endsWith(path.sep)?stage:stage+path.sep;
   if(!destination.startsWith(prefix))throw new Error("Package path escaped the staging directory.");
   await mkdir(path.dirname(destination),{recursive:true});
   const assetUrl=assertTrustedPackageUrl(file.url,trust.hosts);
   const asset=await fetch(assetUrl,{redirect:"error",signal:AbortSignal.timeout(120000)});
   if(!asset.ok||!asset.body)throw new Error("Package asset download failed with HTTP "+asset.status+": "+file.path);
   const declared=Number(asset.headers.get("content-length")??0);if(declared&&declared!==file.size)throw new Error("Package asset size header does not match its signed manifest: "+file.path);
   const hash=createHash("sha256");let size=0;
   const meter=new Transform({transform(chunk:Buffer,_encoding,callback){size+=chunk.length;if(size>file.size){callback(new Error("Package asset exceeded its signed size: "+file.path));return;}hash.update(chunk);callback(null,chunk);}});
   await pipeline(Readable.fromWeb(asset.body as import("node:stream/web").ReadableStream),meter,createWriteStream(destination,{flags:"wx"}));
   if(size!==file.size||hash.digest("hex")!==file.sha256)throw new Error("Package asset failed signed size/SHA-256 verification: "+file.path);
   written++;
  }
  await rename(stage,finalPath);
  return {packageId:manifest.packageId,version:manifest.version,displayName:manifest.displayName,files:written,directory:finalPath};
 }catch(error){await rm(stage,{recursive:true,force:true}).catch(()=>{});throw error;}
}
