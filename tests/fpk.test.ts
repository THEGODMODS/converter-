import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {parseFpkArchive} from "../engine/formats/fpk";
function fixture(kind:"fpk"|"fpkd"="fpk",files=[{name:"/Assets/pes/model/character/face/real/123/face_high.fmdl",data:Buffer.from("model")}],references:string[]=[]){
 const align=(n:number)=>Math.ceil(n/16)*16,pad=(n:number)=>Buffer.alloc(align(n)-n),entryNames=files.map(x=>Buffer.from(x.name)),refNames=references.map(x=>Buffer.from(x)),allNames=[...entryNames,...refNames],tableEnd=48+files.length*48+references.length*16,nameStart=tableEnd,nameBytes=Buffer.concat(allNames.flatMap(x=>[x,Buffer.from([0])])),dataStart=align(nameStart+nameBytes.length),rows:Buffer[]=[],payloads:Buffer[]=[];let nameOffset=0,dataOffset=dataStart;
 files.forEach((file,i)=>{const row=Buffer.alloc(48),name=entryNames[i];row.writeUInt32LE(dataOffset,0);row.writeInt32LE(file.data.length,8);row.writeInt32LE(nameStart+nameOffset,16);row.writeInt32LE(name.length,24);createHash("md5").update(name).digest().copy(row,32);rows.push(row);payloads.push(file.data,pad(file.data.length));dataOffset+=align(file.data.length);nameOffset+=name.length+1;});
 const refs:Buffer[]=[];references.forEach((_,i)=>{const row=Buffer.alloc(16),name=refNames[i];row.writeInt32LE(nameStart+nameOffset,0);row.writeInt32LE(name.length,8);refs.push(row);nameOffset+=name.length+1;});
 const header=Buffer.alloc(48);header.write("foxfpk",0,"ascii");header[6]=kind==="fpk"?0:0x64;header.write("win",7,"ascii");header.writeUInt32LE(dataOffset,10);header.writeUInt32LE(2,32);header.writeUInt32LE(files.length,36);header.writeUInt32LE(references.length,40);
 return Buffer.concat([header,...rows,...refs,nameBytes,pad(nameStart+nameBytes.length),...payloads]);
}
describe("Fox FPK v2 parser",()=>{
 it("reads 32-bit entry records, names, checksums and aligned payloads",()=>{const archive=parseFpkArchive(fixture());expect(archive.kind).toBe("fpk");expect(archive.entries[0].name).toContain("face_high.fmdl");expect(archive.entries[0].data.toString()).toBe("model");});
 it("reads FPKD kind and package references",()=>{const archive=parseFpkArchive(fixture("fpkd",[{name:"scene.fox2",data:Buffer.from("data")}],["Assets/pes/model/character/face/real/123/face.fpk"]));expect(archive.kind).toBe("fpkd");expect(archive.references).toEqual(["Assets/pes/model/character/face/real/123/face.fpk"]);});
 it("rejects corrupted filename checksums",()=>{const data=fixture();data[48+32]^=0xff;expect(()=>parseFpkArchive(data)).toThrow(/checksum mismatch/);});
 it("rejects traversal paths",()=>{const data=fixture("fpk",[{name:"../escape.fmdl",data:Buffer.from("x")}]);expect(()=>parseFpkArchive(data)).toThrow(/unsafe path/);});
 it("rejects truncated or incorrect declared sizes",()=>{const data=fixture();data.writeUInt32LE(data.length-1,10);expect(()=>parseFpkArchive(data)).toThrow(/size does not match/);});
});
