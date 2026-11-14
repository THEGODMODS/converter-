import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {FaceProject} from "../engine/inventory";
import {ddsToFtex,inspectFtex} from "../engine/formats/texture";
import {convertFaceTextureDependencies} from "../electron/texture-bundle";
import {writeFpkArchive} from "../engine/formats/fpk";

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function temp(){const root=await mkdtemp(path.join(os.tmpdir(),"face-forge-textures-"));roots.push(root);return root;}
function rgbaDds():Buffer{
 const b=Buffer.alloc(128+4*4*4);b.write("DDS ",0);b.writeUInt32LE(124,4);b.writeUInt32LE(0x100f,8);b.writeUInt32LE(4,12);b.writeUInt32LE(4,16);b.writeUInt32LE(16,20);b.writeUInt32LE(32,76);b.writeUInt32LE(0x41,80);b.writeUInt32LE(32,88);b.writeUInt32LE(0x00ff0000,92);b.writeUInt32LE(0x0000ff00,96);b.writeUInt32LE(0x000000ff,100);b.writeUInt32LE(0xff000000,104);b.writeUInt32LE(0x1000,108);b.fill(0x7f,128);return b;
}
function project(files:FaceProject["files"],dependencies:FaceProject["dependencies"]):FaceProject{return {root:"",detectedGame:"mixed",fileCount:files.length,totalBytes:0,models:1,textures:1,files,warnings:[],missing:[],coverage:[],dependencies};}

describe("whole-face texture dependency conversion",()=>{
 it("converts resolved FTEX dependencies to DDS at the rewritten target path",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(path.join(root,"sourceimages","#windx11"),{recursive:true});await mkdir(output);
  const ftex=ddsToFtex(rgbaDds(),"SRGB").data;await writeFile(path.join(root,"sourceimages","#windx11","face.ftex"),ftex);
  const inventory=project([{path:"face.fmdl",bytes:10,kind:"model-pes2021",sha256:""},{path:"sourceimages/#windx11/face.ftex",bytes:ftex.length,kind:"texture-pes2021",sha256:""}],[{source:"face.fmdl",reference:"/Assets/sourceimages/#windx11/face.ftex",status:"resolved",candidates:["sourceimages/#windx11/face.ftex"]}]);
  const result=await convertFaceTextureDependencies(inventory,root,output,"2017");
  expect(result.converted).toBe(1);expect(result.files[0].destination).toBe("Assets/sourceimages/#windx11/face.dds");
  expect((await readFile(path.join(output,"Assets/sourceimages/#windx11/face.dds"))).toString("ascii",0,4)).toBe("DDS ");
 });
 it("uses the Fox FTEX game texture when an FMDL names its same-stem DDS authoring image",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(path.join(root,"sourceimages","#windx11"),{recursive:true});await mkdir(output);
  const ftex=ddsToFtex(rgbaDds(),"SRGB").data,dds=rgbaDds();
  await writeFile(path.join(root,"sourceimages","#windx11","face_bsm_alp.ftex"),ftex);
  await writeFile(path.join(root,"sourceimages","#windx11","face_bsm_alp.dds"),dds);
  const reference="/Assets/pes16/model/character/face/real/176104/sourceimages/face_bsm_alp.dds";
  const inventory=project([
   {path:"face.fpk!/face_high.fmdl",bytes:10,kind:"model-pes2021",sha256:""},
   {path:"sourceimages/#windx11/face_bsm_alp.dds",bytes:dds.length,kind:"texture-pes2017",sha256:"dds"},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",bytes:ftex.length,kind:"texture-pes2021",sha256:"ftex"}
  ],[{source:"face.fpk!/face_high.fmdl",reference,status:"resolved",candidates:["sourceimages/#windx11/face_bsm_alp.dds"]}]);
  const result=await convertFaceTextureDependencies(inventory,root,output,"2017");
  expect(result.converted).toBe(1);
  expect(result.files[0].source).toBe("sourceimages/#windx11/face_bsm_alp.ftex");
  expect(result.files[0].destination).toBe("Assets/pes16/model/character/face/real/176104/sourceimages/face_bsm_alp.dds");
  expect((await readFile(path.join(output,result.files[0].destination))).toString("ascii",0,4)).toBe("DDS ");
 });
 it("resolves and converts an FTEX dependency embedded in an FPK package",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(output);
  const ftex=ddsToFtex(rgbaDds(),"SRGB").data;
  const archive=writeFpkArchive("fpk",[
   {name:"Assets/face/head.fmdl",data:Buffer.from("model-fixture")},
   {name:"Assets/sourceimages/skin.ftex",data:ftex}
  ]);
  await writeFile(path.join(root,"face.fpk"),archive);
  const modelPath="face.fpk!/Assets/face/head.fmdl",texturePath="face.fpk!/Assets/sourceimages/skin.ftex";
  const inventory=project([
   {path:modelPath,bytes:10,kind:"model-pes2021",sha256:""},
   {path:texturePath,bytes:ftex.length,kind:"texture-pes2021",sha256:""}
  ],[{source:modelPath,reference:"/Assets/sourceimages/skin.ftex",status:"resolved",candidates:[texturePath]}]);
  const result=await convertFaceTextureDependencies(inventory,root,output,"2017");
  expect(result.converted).toBe(1);
  expect(result.files[0].destination).toBe("Assets/sourceimages/skin.dds");
  expect((await readFile(path.join(output,"Assets/sourceimages/skin.dds"))).toString("ascii",0,4)).toBe("DDS ");
 });
 it("converts DDS to FTEX using the MTL sampler color-space declaration",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(output);
  const dds=rgbaDds();await writeFile(path.join(root,"face_c.dds"),dds);
  await writeFile(path.join(root,"face.mtl"),'<materialset><material name="face" shader="Basic_C"><sampler name="DiffuseMap" path="./face_c.dds" srgb="1"/></material></materialset>');
  const inventory=project([{path:"face.mtl",bytes:100,kind:"material-pes2017",sha256:""},{path:"face_c.dds",bytes:dds.length,kind:"texture-pes2017",sha256:""}],[{source:"face.mtl",reference:"face_c.dds",status:"resolved",candidates:["face_c.dds"]}]);
  const result=await convertFaceTextureDependencies(inventory,root,output,"2021");
  expect(result.files[0].destination).toBe("face_c.ftex");
  const converted=await readFile(path.join(output,"face_c.ftex"));expect(inspectFtex(converted).colorSpace).toBe("SRGB");
 });
 it("rejects a texture reference that escapes the output root",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(output);
  const ftex=ddsToFtex(rgbaDds()).data;await writeFile(path.join(root,"face.ftex"),ftex);
  const inventory=project([{path:"face.fmdl",bytes:1,kind:"model-pes2021",sha256:""},{path:"face.ftex",bytes:ftex.length,kind:"texture-pes2021",sha256:""}],[{source:"face.fmdl",reference:"../escape.ftex",status:"resolved",candidates:["face.ftex"]}]);
  await expect(convertFaceTextureDependencies(inventory,root,output,"2017")).rejects.toThrow(/escapes its project root/i);
 });
 it("fails closed when a material sampler reference is missing or ambiguous",async()=>{
  const root=await temp(),output=path.join(root,"out");await mkdir(output);
  const files=[{path:"face.mtl",bytes:20,kind:"material-pes2017",sha256:""}];
  const missing=project(files,[{source:"face.mtl",reference:"missing.dds",status:"missing",candidates:[]}]);
  await expect(convertFaceTextureDependencies(missing,root,output,"2021")).rejects.toThrow(/dependency closure is incomplete/i);
  const ambiguous=project(files,[{source:"face.mtl",reference:"skin.dds",status:"ambiguous",candidates:["a/skin.dds","b/skin.dds"]}]);
  await expect(convertFaceTextureDependencies(ambiguous,root,output,"2021")).rejects.toThrow(/ambiguous sampler references/i);
  expect(await (await import("node:fs/promises")).readdir(output)).toEqual([]);
 });

});
