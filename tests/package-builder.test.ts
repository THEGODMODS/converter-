import {afterEach,describe,it,expect} from "vitest";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {parseFpkArchive} from "../engine/formats/fpk";
import {buildFoxFacePackage} from "../electron/package-builder";
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function temp(){const root=await mkdtemp(path.join(os.tmpdir(),"face-forge-package-"));roots.push(root);return root;}
describe("Fox face package builder",()=>{
 it("builds paired deterministic FPK and FPKD with model and texture assets separated",async()=>{
  const root=await temp(),converted=path.join(root,"converted"),out=path.join(root,"release","face");
  const textureDirectory=path.join(converted,"Assets","pes16","model","character","face","real","12345","sourceimages","#windx11");
  await mkdir(textureDirectory,{recursive:true});
  await writeFile(path.join(converted,"face_high.fmdl"),Buffer.from("valid-test-model"));
  await writeFile(path.join(converted,"face_high.skl"),Buffer.from("valid-test-skeleton"));
  await writeFile(path.join(converted,"hair_high.fmdl"),Buffer.from("valid-test-hair"));
  await writeFile(path.join(textureDirectory,"face_c.ftex"),Buffer.from("valid-test-texture"));
  const result=await buildFoxFacePackage(converted,out,"Assets/pes16/model/character/face/real/12345");
  const fpk=parseFpkArchive(await readFile(result.fpk)),fpkd=parseFpkArchive(await readFile(result.fpkd));
  expect(fpk.kind).toBe("fpk");expect(fpk.entries.map(x=>x.name)).toEqual(["Assets/pes16/model/character/face/real/12345/face_high.fmdl","Assets/pes16/model/character/face/real/12345/face_high.skl","Assets/pes16/model/character/face/real/12345/hair_high.fmdl","Assets/pes16/model/character/face/real/12345/face_diff.bin"]);
  expect(fpkd.kind).toBe("fpkd");expect(fpkd.entries.map(x=>x.name)).toEqual(["Assets/pes16/model/character/face/real/12345/sourceimages/#windx11/face_c.ftex"]);
  expect(result.models).toBe(4);expect(result.textures).toBe(1);expect(result.faceDiffDefaulted).toBe(true);expect(result.faceDiffVersion).toBe(5);
 });
 it("refuses to package missing model or texture groups",async()=>{
  const root=await temp(),converted=path.join(root,"converted");await mkdir(converted);
  await writeFile(path.join(converted,"face_high.fmdl"),Buffer.from("model"));
  await writeFile(path.join(converted,"hair_high.fmdl"),Buffer.from("hair"));
  await expect(buildFoxFacePackage(converted,path.join(root,"out","face"),"Assets/pes16/model/character/face/real/12345")).rejects.toThrow(/texture dependency/i);
 });
 it("refuses unknown files and traversal roots",async()=>{
  const root=await temp(),converted=path.join(root,"converted");await mkdir(converted);
  await writeFile(path.join(converted,"face_high.fmdl"),Buffer.from("model"));await writeFile(path.join(converted,"hair_high.fmdl"),Buffer.from("hair"));await writeFile(path.join(converted,"face.ftex"),Buffer.from("texture"));await writeFile(path.join(converted,"notes.txt"),"not a game asset");
  await expect(buildFoxFacePackage(converted,path.join(root,"out","face"),"Assets/pes16/model/character/face/real/12345")).rejects.toThrow(/cannot safely classify/i);
  await expect(buildFoxFacePackage(converted,path.join(root,"out","face"),"Assets/pes16/model/character/face/real/../escape")).rejects.toThrow(/virtual root/i);
 });
});
