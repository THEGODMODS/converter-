#!/usr/bin/env node
import {readFile,writeFile} from "node:fs/promises";
import {createPrivateKey,sign} from "node:crypto";
import {resolve,dirname,basename} from "node:path";
function canonical(value){
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isFinite(value))throw new Error("Non-finite manifest number.");return JSON.stringify(value);}
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
 throw new Error("Unsupported manifest value.");
}
const [input,keyPath,keyId,output]=process.argv.slice(2);
if(!input||!keyPath||!keyId||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)){process.stderr.write("Usage: node scripts/sign-package-manifest.mjs <unsigned-manifest.json> <ed25519-private-key.pem> <key-id> [signed-output.json]\n");process.exit(2);}
const source=JSON.parse(await readFile(resolve(input),"utf8"));
if(!source||typeof source!=="object"||Array.isArray(source)||Object.hasOwn(source,"signature"))throw new Error("Input must be an unsigned package manifest object.");
if(source.schema!==1||typeof source.packageId!=="string"||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(source.packageId)||typeof source.version!=="string"||!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(source.version)||typeof source.displayName!=="string"||!source.displayName.trim()||source.displayName.length>120||!Array.isArray(source.files)||!source.files.length||source.files.length>500)throw new Error("Package manifest metadata or file count is invalid.");
let total=0;const seen=new Set();
for(const file of source.files){
 if(!file||typeof file!=="object"||Array.isArray(file)||Object.keys(file).sort().join(",")!=="path,sha256,size,url"||typeof file.path!=="string"||!file.path||file.path.length>240||file.path.startsWith("/")||file.path.includes(String.fromCharCode(92))||file.path.includes(":")||file.path.split("/").some(part=>!part||part==="."||part===".."||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))||!Number.isSafeInteger(file.size)||file.size<0||file.size>128*1024*1024||typeof file.sha256!=="string"||!/^[a-f0-9]{64}$/.test(file.sha256)||typeof file.url!=="string")throw new Error("Package contains an invalid file entry.");
 const folded=file.path.toLowerCase();if(seen.has(folded))throw new Error("Package contains duplicate or case-colliding paths.");seen.add(folded);
 const url=new URL(file.url);if(url.protocol!=="https:"||url.username||url.password||(url.port&&url.port!=="443")||url.hash)throw new Error("Package asset URLs must use HTTPS without credentials, non-standard ports or fragments.");
 total+=file.size;if(total>512*1024*1024)throw new Error("Package exceeds the 512 MiB total size limit.");
}
const privateKey=createPrivateKey(await readFile(resolve(keyPath)));
if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("Signing key must be Ed25519.");
const signature=sign(null,Buffer.from(canonical(source),"utf8"),privateKey).toString("base64");
const signed={...source,signature:{algorithm:"Ed25519",keyId,value:signature}};
const destination=resolve(output??(dirname(resolve(input))+"/"+basename(input,".json")+".signed.json"));
await writeFile(destination,JSON.stringify(signed,null,2)+"\n",{flag:"wx"});
process.stdout.write("Signed package manifest written: "+destination+"\n");
