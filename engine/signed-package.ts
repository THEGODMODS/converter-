import {createPublicKey,verify as verifySignature} from "node:crypto";

export type SignedPackageFile={path:string;size:number;sha256:string;url:string};
export type SignedPackageManifest={schema:1;packageId:string;version:string;displayName:string;files:SignedPackageFile[];signature:{algorithm:"Ed25519";keyId:string;value:string}};
export type PackageTrust={hosts:readonly string[];publicKeys:Readonly<Record<string,string>>};
export const PACKAGE_LIMITS={manifestBytes:1024*1024,fileBytes:128*1024*1024,totalBytes:512*1024*1024,files:500} as const;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
function exactKeys(value:Record<string,unknown>,keys:string[]):boolean{return Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(value,key));}
function canonical(value:unknown):string{
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isFinite(value))throw new Error("Manifest contains a non-finite number.");return JSON.stringify(value);}
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(record(value))return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
 throw new Error("Manifest contains an unsupported value.");
}
export function canonicalPackagePayload(manifest:Omit<SignedPackageManifest,"signature">):string{return canonical(manifest);}
export function assertTrustedPackageUrl(value:string,hosts:readonly string[]):URL{
 let url:URL;try{url=new URL(value);}catch{throw new Error("Package URL is invalid.");}
 if(url.protocol!=="https:"||url.username||url.password||(url.port&&url.port!=="443")||url.hash)throw new Error("Package URLs must use HTTPS on the standard port without credentials or fragments.");
 const host=url.hostname.toLowerCase();
 if(!hosts.some(allowed=>allowed.toLowerCase()===host))throw new Error("Package URL host is not on the approved FACE FORGE package host list: "+host);
 return url;
}
function safePackagePath(value:string):boolean{
 if(!value||value.length>240||value.startsWith("/")||value.includes("\\")||/^[a-z]:/i.test(value)||value.includes(":"))return false;
 const parts=value.split("/");
 if(parts.some(part=>!part||part==="."||part===".."||/[<>:"|?*\\x00-\\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)/i.test(part)))return false;
 return true;
}
export function verifySignedPackageManifest(input:unknown,trust:PackageTrust):SignedPackageManifest{
 if(!record(input)||!exactKeys(input,["schema","packageId","version","displayName","files","signature"]))throw new Error("Package manifest has an invalid top-level structure.");
 if(input.schema!==1||typeof input.packageId!=="string"||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(input.packageId)||typeof input.version!=="string"||!/^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(input.version)||typeof input.displayName!=="string"||!input.displayName.trim()||input.displayName.length>120||!Array.isArray(input.files)||!input.files.length||input.files.length>PACKAGE_LIMITS.files)throw new Error("Package manifest metadata or file count is invalid.");
 if(!record(input.signature)||!exactKeys(input.signature,["algorithm","keyId","value"])||input.signature.algorithm!=="Ed25519"||typeof input.signature.keyId!=="string"||typeof input.signature.value!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(input.signature.keyId)||!/^[A-Za-z0-9+/]{86}==$/.test(input.signature.value))throw new Error("Package signature metadata is invalid.");
 const keyPem=trust.publicKeys[input.signature.keyId];if(!keyPem)throw new Error("This package was signed by an untrusted publisher key.");
 let total=0;const seen=new Set<string>();
 const files:SignedPackageFile[]=input.files.map((entry)=>{
  if(!record(entry)||!exactKeys(entry,["path","size","sha256","url"])||typeof entry.path!=="string"||!safePackagePath(entry.path)||!Number.isSafeInteger(entry.size)||Number(entry.size)<0||Number(entry.size)>PACKAGE_LIMITS.fileBytes||typeof entry.sha256!=="string"||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.url!=="string")throw new Error("Package contains an invalid file entry.");
  const folded=entry.path.toLowerCase();if(seen.has(folded))throw new Error("Package contains duplicate or case-colliding file paths: "+entry.path);seen.add(folded);
  total+=Number(entry.size);if(total>PACKAGE_LIMITS.totalBytes)throw new Error("Package exceeds the 512 MiB total download limit.");
  assertTrustedPackageUrl(entry.url,trust.hosts);
  return {path:entry.path,size:Number(entry.size),sha256:entry.sha256,url:entry.url};
 });
 const unsigned={schema:1 as const,packageId:input.packageId,version:input.version,displayName:input.displayName,files};
 let valid=false;try{valid=verifySignature(null,Buffer.from(canonicalPackagePayload(unsigned),"utf8"),createPublicKey(keyPem),Buffer.from(input.signature.value,"base64"));}catch{valid=false;}
 if(!valid)throw new Error("Package signature verification failed. No files were installed.");
 return {...unsigned,signature:{algorithm:"Ed25519",keyId:input.signature.keyId,value:input.signature.value}};
}
