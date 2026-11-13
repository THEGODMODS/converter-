import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {parseFpkArchive,writeFpkArchive} from "../engine/formats/fpk";

/** Independent transcription of the upstream pes-file-tools FpkFile.write layout. */
function upstreamReferenceWriter(kind:"fpk"|"fpkd",files:Array<{name:string;data:Buffer}>):Buffer{
 const names:Buffer[]=[],payloads:Buffer[]=[],rows:Array<{nameOffset:number;nameLength:number;dataOffset:number;dataLength:number;hash:Buffer}>=[];
 let nameLength=0,dataLength=0;
 const align=(n:number)=>Math.ceil(n/16)*16;
 for(const file of [...files].sort((a,b)=>a.name.localeCompare(b.name))){
  const name=Buffer.from(file.name,"utf8");
  names.push(name,Buffer.from([0]));
  rows.push({nameOffset:nameLength,nameLength:name.length,dataOffset:dataLength,dataLength:file.data.length,hash:createHash("md5").update(name).digest()});
  nameLength+=name.length+1;
  payloads.push(file.data,Buffer.alloc(align(file.data.length)-file.data.length));
  dataLength+=align(file.data.length);
 }
 const namePool=Buffer.concat([...names,Buffer.alloc(align(nameLength)-nameLength)]);
 const dataPool=Buffer.concat(payloads);
 const nameBase=48+48*rows.length,dataBase=nameBase+namePool.length;
 const header=Buffer.alloc(48);header.write("foxfpk",0,"ascii");header[6]=kind==="fpk"?0:0x64;header.write("win",7,"ascii");
 header.writeUInt32LE(dataBase+dataPool.length,10);header.writeUInt32LE(2,32);header.writeUInt32LE(rows.length,36);
 const table=rows.map(row=>{const out=Buffer.alloc(48);out.writeBigUInt64LE(BigInt(dataBase+row.dataOffset),0);out.writeBigUInt64LE(BigInt(row.dataLength),8);out.writeBigUInt64LE(BigInt(nameBase+row.nameOffset),16);out.writeBigUInt64LE(BigInt(row.nameLength),24);row.hash.copy(out,32);return out;});
 return Buffer.concat([header,...table,namePool,dataPool]);
}

/** Independent reader assertions matching upstream's header and entry-table interpretation. */
function assertUpstreamReaderAccepts(data:Buffer,expectedKind:"fpk"|"fpkd",expectedNames:string[]){
 expect(data.toString("ascii",0,6)).toBe("foxfpk");
 expect(data[6]).toBe(expectedKind==="fpk"?0:0x64);
 expect(data.toString("ascii",7,10)).toBe("win");
 expect(data.readUInt32LE(10)).toBe(data.length);
 expect(data.readUInt32LE(32)).toBe(2);
 expect(data.readUInt32LE(40)).toBe(0);
 const count=data.readUInt32LE(36),actual:string[]=[];
 for(let i=0;i<count;i++){
  const at=48+i*48,contentOffset=Number(data.readBigUInt64LE(at)),contentLength=Number(data.readBigUInt64LE(at+8)),nameOffset=Number(data.readBigUInt64LE(at+16)),nameLength=Number(data.readBigUInt64LE(at+24));
  const nameBytes=data.subarray(nameOffset,nameOffset+nameLength),name=nameBytes.toString("utf8");
  expect(contentOffset+contentLength).toBeLessThanOrEqual(data.length);
  expect(nameOffset+nameLength).toBeLessThanOrEqual(data.length);
  expect(createHash("md5").update(nameBytes).digest()).toEqual(data.subarray(at+32,at+48));
  actual.push(name);
 }
 expect(actual).toEqual(expectedNames);
}
function fixture(kind:"fpk"|"fpkd"="fpk",files=[{name:"/Assets/pes/model/character/face/real/123/face_high.fmdl",data:Buffer.from("model")}],references:string[]=[]){
 if(references.length)throw new Error("The verified fixture writer does not fabricate unsupported reference records.");
 return writeFpkArchive(kind,files);
}
describe("Fox FPK v2 parser and writer interoperability",()=>{
 it("reads 64-bit entry records, names, checksums and aligned payloads",()=>{const archive=parseFpkArchive(fixture());expect(archive.kind).toBe("fpk");expect(archive.entries[0].name).toContain("face_high.fmdl");expect(archive.entries[0].data.toString()).toBe("model");});
 it("reads an independently generated archive using the upstream writer layout",()=>{const bytes=upstreamReferenceWriter("fpk",[{name:"/Assets/pes/model/face/face_high.fmdl",data:Buffer.from("mesh")},{name:"/Assets/pes/model/face/sourceimages/face_c.ftex",data:Buffer.from("texture")}]);const parsed=parseFpkArchive(bytes);expect(parsed.entries.map(entry=>entry.data.toString())).toEqual(["mesh","texture"]);});
 it("writes archives accepted by an independent upstream-layout reader",()=>{for(const kind of ["fpk","fpkd"] as const){const bytes=writeFpkArchive(kind,[{name:"Assets/pes/model/face/z.fmdl",data:Buffer.from("z")},{name:"Assets/pes/model/face/a.skl",data:Buffer.from("skeleton")}]);assertUpstreamReaderAccepts(bytes,kind,["/Assets/pes/model/face/a.skl","/Assets/pes/model/face/z.fmdl"]);}});
 it("reads FPKD kind and explicitly reports no package references",()=>{const archive=parseFpkArchive(fixture("fpkd",[{name:"/Assets/pes/model/character/face/real/123/scene.fox2",data:Buffer.from("data")}]));expect(archive.kind).toBe("fpkd");expect(archive.references).toEqual([]);});
 it("normalizes Windows separators in virtual asset paths",()=>{const archive=parseFpkArchive(fixture("fpk",[{name:"\\Assets\\pes\\model\\face.fmdl",data:Buffer.from("mesh")}]));expect(archive.entries[0].name).toBe("Assets/pes/model/face.fmdl");});
 it("accepts safe package-root-relative member names used by real face FPKs",()=>{const bytes=upstreamReferenceWriter("fpk",[{name:"face_diff.bin",data:Buffer.from("FACE")},{name:"face_high.fmdl",data:Buffer.from("FMDL")},{name:"hair_high.fmdl",data:Buffer.from("FMDL")}]);const parsed=parseFpkArchive(bytes);expect(parsed.entries.map(entry=>entry.name)).toEqual(["face_diff.bin","face_high.fmdl","hair_high.fmdl"]);});
 it("rejects corrupted filename checksums",()=>{const data=fixture();data[48+32]^=0xff;expect(()=>parseFpkArchive(data)).toThrow(/checksum mismatch/);});
 it("rejects traversal paths from otherwise well-formed external archives",()=>{const bytes=upstreamReferenceWriter("fpk",[{name:"../escape.fmdl",data:Buffer.from("x")}]);expect(()=>parseFpkArchive(bytes)).toThrow(/unsafe/i);});
 it("rejects non-zero package reference tables until their layout is verified",()=>{const data=fixture();data.writeUInt32LE(1,40);expect(()=>parseFpkArchive(data)).toThrow(/reference tables are not supported/i);});
 it("rejects truncated or incorrect declared sizes",()=>{const data=fixture();data.writeUInt32LE(data.length-1,10);expect(()=>parseFpkArchive(data)).toThrow(/size does not match/);});
 it("round-trips deterministic FPK and FPKD archives",()=>{for(const kind of ["fpk","fpkd"] as const){const entries=[{name:"Assets/pes/model/face/z.fmdl",data:Buffer.from("z")},{name:"Assets/pes/model/face/a.skl",data:Buffer.from("skeleton")}];const bytes=writeFpkArchive(kind,entries);const parsed=parseFpkArchive(bytes);expect(parsed.entries.map(x=>x.name)).toEqual(["Assets/pes/model/face/a.skl","Assets/pes/model/face/z.fmdl"]);expect(writeFpkArchive(kind,parsed.entries)).toEqual(bytes);}});
});
