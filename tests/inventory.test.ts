import { describe,expect,it } from "vitest";
import { mkdtemp,mkdir,writeFile,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { inspectFaceFolder } from "../engine/inventory";


function makeFpk(entries:Array<{name:string;data:Buffer}>,isFpkd=false):Buffer{
 const names=entries.map(x=>Buffer.from(x.name,"utf8")),nameParts=names.flatMap(x=>[x,Buffer.from([0])]),nameTable=Buffer.concat(nameParts);
 const align16=(n:number)=>Math.ceil(n/16)*16,pad=(n:number)=>Buffer.alloc(align16(n)-n);
 const tableEnd=48+entries.length*48,nameStart=tableEnd,contentStart=align16(nameStart+nameTable.length);
 const rows:Buffer[]=[],payloads:Buffer[]=[];let nameOffset=0,dataOffset=contentStart;
 entries.forEach((entry,i)=>{const name=names[i],row=Buffer.alloc(48);row.writeUInt32LE(dataOffset,0);row.writeInt32LE(entry.data.length,8);row.writeInt32LE(nameStart+nameOffset,16);row.writeInt32LE(name.length,24);createHash("md5").update(name).digest().copy(row,32);rows.push(row);payloads.push(entry.data,pad(entry.data.length));dataOffset+=align16(entry.data.length);nameOffset+=name.length+1;});
 const header=Buffer.alloc(48);header.write("foxfpk",0,"ascii");header[6]=isFpkd?0x64:0;header.write("win",7,"ascii");header.writeUInt32LE(dataOffset,10);header.writeUInt32LE(2,32);header.writeUInt32LE(entries.length,36);
 return Buffer.concat([header,...rows,nameTable,pad(nameStart+nameTable.length),...payloads]);
}

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
  it("recognizes PES face FPK packages and their sidecars with generated archive fixtures",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"faceforge-"));
    try{
      await mkdir(path.join(root,"#Win"));
      await mkdir(path.join(root,"sourceimages","#windx11"),{recursive:true});
      const fmdl=Buffer.alloc(56);fmdl.write("FMDL",0);fmdl.writeUInt32LE(0x4001eb85,4);fmdl.writeBigUInt64LE(56n,8);fmdl.writeBigUInt64LE(0n,16);fmdl.writeBigUInt64LE(0n,24);fmdl.writeUInt32LE(56,40);fmdl.writeUInt32LE(56,48);
      await writeFile(path.join(root,"#Win","face.fpk"),makeFpk([{name:"face_high.fmdl",data:fmdl},{name:"hair_high.fmdl",data:fmdl}]));
      await writeFile(path.join(root,"#Win","face.fpkd"),Buffer.from("FPKD sidecar fixture"));
      await writeFile(path.join(root,"#Win","face.kpfd"),Buffer.from("KPFD sidecar fixture"));
      const ftex=Buffer.alloc(84);ftex.write("FTEX",0);ftex.writeFloatLE(2.03,4);ftex.writeUInt16LE(0,8);ftex.writeUInt16LE(1,10);ftex.writeUInt16LE(1,12);ftex.writeUInt16LE(1,14);ftex.writeUInt8(1,16);ftex.writeUInt32LE(3,28);ftex.writeUInt32LE(80,64);ftex.writeUInt32LE(4,68);
      await writeFile(path.join(root,"sourceimages","#windx11","face_bsm_alp.ftex"),ftex);
      const result=await inspectFaceFolder(root);
      expect(result.files.map(file=>file.kind)).toContain("container-fpk");
      expect(result.files.filter(file=>file.kind==="container-fpkd")).toHaveLength(2);
      expect(result.textures).toBe(1);
      expect(result.models).toBe(2);
      expect(result.files.some(file=>file.path.endsWith("!/face_high.fmdl")&&file.kind==="model-pes2021")).toBe(true);
      expect(result.warnings.some(warning=>warning.includes("Parsed 2 PES 2021 model candidate"))).toBe(true);
    }finally{await rm(root,{recursive:true,force:true});}
  });

});
