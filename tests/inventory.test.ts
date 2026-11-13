import { describe,expect,it } from "vitest";
import { mkdtemp,mkdir,writeFile,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { inspectFaceFolder } from "../engine/inventory";

describe("inspectFaceFolder",()=>{
  it("detects PES 2021 assets from model and texture companions",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-"));
    try{
      await mkdir(path.join(root,"sourceimages"));
      const fmdl=Buffer.alloc(56);fmdl.write("FMDL",0);fmdl.writeUInt32LE(0x4001eb85,4);fmdl.writeBigUInt64LE(56n,8);fmdl.writeBigUInt64LE(0n,16);fmdl.writeBigUInt64LE(0n,24);fmdl.writeUInt32LE(56,40);fmdl.writeUInt32LE(56,48);
      await writeFile(path.join(root,"face_high.fmdl"),fmdl);
      const ftex=Buffer.alloc(84);ftex.write("FTEX",0);ftex.writeFloatLE(2.03,4);ftex.writeUInt16LE(0,8);ftex.writeUInt16LE(1,10);ftex.writeUInt16LE(1,12);ftex.writeUInt16LE(1,14);ftex.writeUInt8(1,16);ftex.writeUInt32LE(3,28);ftex.writeUInt32LE(80,64);ftex.writeUInt32LE(4,68);
      await writeFile(path.join(root,"sourceimages","face.ftex"),ftex);
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

  it("detects WESYS-compressed PES 2017 MODEL files",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-"));
    try{
      const model=Buffer.alloc(36);model.write("MODEL\0\0\0",0,"binary");model.writeUInt32LE(24,8);model.writeUInt16LE(19,14);model.writeUInt32LE(12,24);model.writeUInt32LE(0,28);model.writeUInt32LE(4,32);
      const packed=deflateSync(model),header=Buffer.alloc(16);header.set([0,1,1]);header.write("WESYS",3,"ascii");header.writeUInt32LE(packed.length,8);header.writeUInt32LE(model.length,12);
      await writeFile(path.join(root,"face.model"),Buffer.concat([header,packed]));
      const result=await inspectFaceFolder(root);
      expect(result.detectedGame).toBe("pes2017");
      expect(result.models).toBe(1);
      expect(result.files[0].kind).toBe("model-pes2017-compressed");
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
