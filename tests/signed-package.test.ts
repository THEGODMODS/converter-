import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {canonicalPackagePayload,verifySignedPackageManifest,type PackageTrust} from "../engine/signed-package";

function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const unsigned={schema:1 as const,packageId:"example-face",version:"1.2.3",displayName:"Example Face",files:[{path:"Assets/face/face.fpk",size:4,sha256:createHash("sha256").update("face").digest("hex"),url:"https://packages.example.test/example/face.fpk"}]};
 const signature=sign(null,Buffer.from(canonicalPackagePayload(unsigned)),privateKey).toString("base64");
 const manifest={...unsigned,signature:{algorithm:"Ed25519" as const,keyId:"test-key",value:signature}};
 const trust:PackageTrust={hosts:["packages.example.test"],publicKeys:{"test-key":publicKey.export({type:"spki",format:"pem"}).toString()}};
 return {unsigned,manifest,trust};
}
describe("signed package manifest verification",()=>{
 it("verifies an Ed25519 signature over canonical package metadata",()=>{
  const {manifest,trust}=fixture();
  expect(verifySignedPackageManifest(manifest,trust).packageId).toBe("example-face");
 });
 it("rejects modified asset metadata after signing",()=>{
  const {manifest,trust}=fixture();
  const tampered={...manifest,files:manifest.files.map(file=>({...file,sha256:"0".repeat(64)}))};
  expect(()=>verifySignedPackageManifest(tampered,trust)).toThrow(/signature verification failed/i);
 });
 it("rejects unsigned and unknown publisher keys",()=>{
  const {manifest}=fixture();
  expect(()=>verifySignedPackageManifest(manifest,{hosts:["packages.example.test"],publicKeys:{}})).toThrow(/untrusted publisher key/i);
 });
 it("rejects untrusted hosts and non-HTTPS URLs",()=>{
  const {manifest,trust}=fixture();
  expect(()=>verifySignedPackageManifest(manifest,{...trust,hosts:["other.example.test"]})).toThrow(/approved/i);
  const insecure={...manifest,files:manifest.files.map(file=>({...file,url:"http://packages.example.test/face.fpk"}))};
  expect(()=>verifySignedPackageManifest(insecure,trust)).toThrow(/HTTPS/i);
 });
 it("rejects traversal, Windows-invalid and duplicate case-folded paths",()=>{
  const {manifest,trust}=fixture();
  const traversal={...manifest,files:manifest.files.map(file=>({...file,path:"../face.fpk"}))};
  expect(()=>verifySignedPackageManifest(traversal,trust)).toThrow(/invalid file entry/i);
  const duplicate={...manifest,files:[...manifest.files,{...manifest.files[0],path:"assets/FACE/face.fpk"}]};
  expect(()=>verifySignedPackageManifest(duplicate,trust)).toThrow(/duplicate|signature/i);
 });
 it("rejects invalid manifest versions and oversized files",()=>{
  const {manifest,trust}=fixture();
  expect(()=>verifySignedPackageManifest({...manifest,version:"latest"},trust)).toThrow(/metadata/i);
  expect(()=>verifySignedPackageManifest({...manifest,files:manifest.files.map(file=>({...file,size:9999999999}))},trust)).toThrow(/invalid file entry/i);
 });
});
