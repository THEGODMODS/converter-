import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {canonicalPackagePayload,type PackageTrust} from "../engine/signed-package";
import {installSignedPackage} from "../electron/signed-package-download";

const roots:string[]=[];
async function setup(payload="face"){
 const root=await mkdtemp(path.join(os.tmpdir(),"face-forge-package-test-"));roots.push(root);
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const bytes=Buffer.from(payload);
 const unsigned={schema:1 as const,packageId:"example-face",version:"1.0.0",displayName:"Example Face",files:[{path:"face/face.fpk",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),url:"https://packages.example.test/face.fpk"}]};
 const signature=sign(null,Buffer.from(canonicalPackagePayload(unsigned)),privateKey).toString("base64");
 const manifest={...unsigned,signature:{algorithm:"Ed25519",keyId:"test-key",value:signature}};
 const trust:PackageTrust={hosts:["packages.example.test"],publicKeys:{"test-key":publicKey.export({type:"spki",format:"pem"}).toString()}};
 return {root,bytes,manifest,trust};
}
afterEach(async()=>{vi.unstubAllGlobals();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
describe("signed package download transaction",()=>{
 it("verifies and atomically installs every signed asset",async()=>{
  const f=await setup();
  const fetchMock=vi.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>String(url).endsWith(".json")?new Response(JSON.stringify(f.manifest),{status:200}):new Response(f.bytes,{status:200}));
  vi.stubGlobal("fetch",fetchMock);
  const result=await installSignedPackage("https://packages.example.test/manifest.json",path.join(f.root,"packages"),f.trust);
  expect(result.files).toBe(1);
  expect(await readFile(path.join(result.directory,"face","face.fpk"))).toEqual(f.bytes);
  expect(fetchMock.mock.calls.every(call=>(call[1] as RequestInit|undefined)?.redirect==="error")).toBe(true);
 });
 it("removes all staged files when downloaded bytes fail SHA-256 verification",async()=>{
  const f=await setup("original");
  const fetchMock=vi.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>String(url).endsWith(".json")?new Response(JSON.stringify(f.manifest),{status:200}):new Response("tampered",{status:200}));
  vi.stubGlobal("fetch",fetchMock);
  await expect(installSignedPackage("https://packages.example.test/manifest.json",path.join(f.root,"packages"),f.trust)).rejects.toThrow(/SHA-256/i);
  const packageRoot=path.join(f.root,"packages","example-face");
  expect(await readdir(packageRoot)).toEqual([]);
 });
 it("does not overwrite an already installed version",async()=>{
  const f=await setup();
  const packageRoot=path.join(f.root,"packages","example-face","1.0.0");
  await mkdir(packageRoot,{recursive:true});await writeFile(path.join(packageRoot,"keep.txt"),"keep");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(f.manifest),{status:200})));
  await expect(installSignedPackage("https://packages.example.test/manifest.json",path.join(f.root,"packages"),f.trust)).rejects.toThrow(/already installed/i);
  expect(await readFile(path.join(packageRoot,"keep.txt"),"utf8")).toBe("keep");
 });
});
