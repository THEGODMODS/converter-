import {describe,expect,it} from "vitest";
import {buildCpk,inspectCpk} from "../engine/packaging/cpk";
describe("CRI CPK packaging",()=>{
 it("writes a readable CPK directory with correctly located payloads",()=>{const files=[{path:"common/character0/model/character/face/real/123/face.model",data:Buffer.from("face-model")},{path:"common/character0/model/character/face/real/123/face.dds",data:Buffer.from("texture")}];const archive=buildCpk(files),inspection=inspectCpk(archive);expect(inspection.valid).toBe(true);expect(inspection.fileCount).toBe(2);for(const entry of inspection.files){const expected=files.find(f=>f.path===entry.path)!;expect(archive.subarray(entry.offset,entry.offset+entry.size)).toEqual(expected.data);}});
 it("rejects traversal and duplicate case-insensitive paths",()=>{expect(()=>buildCpk([{path:"../evil.bin",data:Buffer.from("x")}])).toThrow(/unsafe/i);expect(()=>buildCpk([{path:"face.dds",data:Buffer.from("a")},{path:"FACE.DDS",data:Buffer.from("b")}])).toThrow(/duplicate/i);});
});
