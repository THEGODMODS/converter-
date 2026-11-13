import { describe,expect,it } from "vitest";
import { mkdtemp,mkdir,writeFile,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectFaceFolder } from "../engine/inventory";

describe("inspectFaceFolder",()=>{
  it("detects PES 2021 assets from model and texture companions",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-"));
    try{
      await mkdir(path.join(root,"sourceimages"));
      await writeFile(path.join(root,"face_high.fmdl"),Buffer.from("FMDL"));
      const dds=Buffer.alloc(128);dds.write("DDS ",0,"ascii");
      await writeFile(path.join(root,"sourceimages","face.dds"),dds);
      const result=await inspectFaceFolder(root);
      expect(result.detectedGame).toBe("pes2021");
      expect(result.models).toBe(1);
      expect(result.textures).toBe(1);
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it("does not classify arbitrary DDS extension as a valid DDS",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-"));
    try{
      await writeFile(path.join(root,"fake.dds"),Buffer.from("not a dds"));
      const result=await inspectFaceFolder(root);
      expect(result.files[0].kind).toBe("invalid-dds");
      expect(result.detectedGame).toBe("unknown");
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
