import {describe,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {inspectFaceDatabase} from "../engine/database";
function minimalModel(){const data=Buffer.alloc(36);data.write("MODEL\0\0\0",0,"binary");data.writeUInt32LE(24,8);data.writeUInt16LE(19,14);data.writeUInt32LE(12,24);data.writeUInt32LE(0,28);data.writeUInt32LE(4,32);return data;}
describe("inspectFaceDatabase",()=>{
 it("keeps sibling face folders as separate database entries",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-db-"));
  try{for(const id of ["1001","1002"]){const face=path.join(root,id);await mkdir(face);await writeFile(path.join(face,"face.model"),minimalModel());}
   const result=await inspectFaceDatabase(root);
   expect(result.scannedFolders).toBe(2);expect(result.faces).toHaveLength(2);expect(result.faces.map(x=>path.basename(x.root)).sort()).toEqual(["1001","1002"]);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it("treats a root containing model files as one face project",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-db-"));
  try{await writeFile(path.join(root,"face.model"),minimalModel());const result=await inspectFaceDatabase(root);expect(result.faces).toHaveLength(1);expect(result.faces[0].root).toBe(root);}
  finally{await rm(root,{recursive:true,force:true});}
 });
});
