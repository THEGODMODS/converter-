import {describe,it,expect} from "vitest";
import {parseFpkArchive,writeFpkArchive} from "../engine/formats/fpk";
function fixture(kind:"fpk"|"fpkd"="fpk",files=[{name:"/Assets/pes/model/character/face/real/123/face_high.fmdl",data:Buffer.from("model")}],references:string[]=[]){
 if(references.length)throw new Error("The verified fixture writer does not fabricate unsupported reference records.");
 return writeFpkArchive(kind,files);
}
describe("Fox FPK v2 parser",()=>{
 it("reads 64-bit entry records, names, checksums and aligned payloads",()=>{const archive=parseFpkArchive(fixture());expect(archive.kind).toBe("fpk");expect(archive.entries[0].name).toContain("face_high.fmdl");expect(archive.entries[0].data.toString()).toBe("model");});
 it("reads FPKD kind and explicitly reports no package references",()=>{const archive=parseFpkArchive(fixture("fpkd",[{name:"/Assets/pes/model/character/face/real/123/scene.fox2",data:Buffer.from("data")}]));expect(archive.kind).toBe("fpkd");expect(archive.references).toEqual([]);});
 it("normalizes Windows separators in virtual asset paths",()=>{const archive=parseFpkArchive(fixture("fpk",[{name:"\\Assets\\pes\\model\\face.fmdl",data:Buffer.from("mesh")}]));expect(archive.entries[0].name).toBe("Assets/pes/model/face.fmdl");});
 it("rejects corrupted filename checksums",()=>{const data=fixture();data[48+32]^=0xff;expect(()=>parseFpkArchive(data)).toThrow(/checksum mismatch/);});
 it("rejects traversal paths",()=>{const data=fixture("fpk",[{name:"../escape.fmdl",data:Buffer.from("x")}]);expect(()=>parseFpkArchive(data)).toThrow(/unsafe path/);});
 it("rejects non-zero package reference tables until their layout is verified",()=>{const data=fixture();data.writeUInt32LE(1,40);expect(()=>parseFpkArchive(data)).toThrow(/reference tables are not supported/i);});
 it("rejects truncated or incorrect declared sizes",()=>{const data=fixture();data.writeUInt32LE(data.length-1,10);expect(()=>parseFpkArchive(data)).toThrow(/size does not match/);});
 it("round-trips deterministic FPK and FPKD archives",()=>{for(const kind of ["fpk","fpkd"] as const){const entries=[{name:"Assets/pes/model/face/z.fmdl",data:Buffer.from("z")},{name:"Assets/pes/model/face/a.skl",data:Buffer.from("skeleton")}];const bytes=writeFpkArchive(kind,entries);const parsed=parseFpkArchive(bytes);expect(parsed.entries.map(x=>x.name)).toEqual(["Assets/pes/model/face/a.skl","Assets/pes/model/face/z.fmdl"]);expect(writeFpkArchive(kind,parsed.entries)).toEqual(bytes);}});
});
