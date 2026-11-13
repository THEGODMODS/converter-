import {createHash,generateKeyPairSync} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {verifySignedPackageManifest} from "../engine/signed-package";

describe("offline package signing CLI",()=>{
 it("signs a validated manifest with an Ed25519 private key",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"face-forge-signing-test-"));
  try{
   const pair=generateKeyPairSync("ed25519",{privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
   const manifest={schema:1,packageId:"cli-face",version:"2.0.1",displayName:"CLI Face",files:[{path:"face/face.fpk",size:4,sha256:createHash("sha256").update("face").digest("hex"),url:"https://packages.example.test/face.fpk"}]};
   const input=path.join(root,"manifest.json"),key=path.join(root,"private.pem"),output=path.join(root,"signed.json");
   await writeFile(input,JSON.stringify(manifest));await writeFile(key,pair.privateKey,{mode:0o600});
   execFileSync(process.execPath,[path.resolve("scripts/sign-package-manifest.mjs"),input,key,"cli-test",output],{stdio:"pipe"});
   const signed=JSON.parse(await readFile(output,"utf8"));
   const verified=verifySignedPackageManifest(signed,{hosts:["packages.example.test"],publicKeys:{"cli-test":pair.publicKey}});
   expect(verified.packageId).toBe("cli-face");
  }finally{await rm(root,{recursive:true,force:true});}
 });
});
