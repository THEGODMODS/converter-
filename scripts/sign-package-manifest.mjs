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
const privateKey=createPrivateKey(await readFile(resolve(keyPath)));
if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("Signing key must be Ed25519.");
const signature=sign(null,Buffer.from(canonical(source),"utf8"),privateKey).toString("base64");
const signed={...source,signature:{algorithm:"Ed25519",keyId,value:signature}};
const destination=resolve(output??(dirname(resolve(input))+"/"+basename(input,".json")+".signed.json"));
await writeFile(destination,JSON.stringify(signed,null,2)+"\n",{flag:"wx"});
process.stdout.write("Signed package manifest written: "+destination+"\n");
