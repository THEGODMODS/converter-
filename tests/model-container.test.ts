import {describe,expect,it} from "vitest";
import {parseModelContainer,writeModelContainer} from "../engine/formats/model-container";
const sample={version:19,unknown1:0,unknown2:9,flags:0,arrayHeaderExtra:Buffer.from([7,8,9,10]),sections:[{index:0,data:Buffer.from("bone-section")},{index:1,data:Buffer.from("mesh-section-2017")},{index:2,data:Buffer.from("material-section") }],wasCompressed:false,warnings:[]};
describe("PES MODEL section container",()=>{
 it("round-trips all section bytes and array extension data",()=>{const encoded=writeModelContainer(sample,false),parsed=parseModelContainer(encoded);expect(parsed.sections.map(s=>s.data)).toEqual(sample.sections.map(s=>s.data));expect(parsed.arrayHeaderExtra).toEqual(sample.arrayHeaderExtra);expect(writeModelContainer(parsed,false)).toEqual(encoded);});
 it("reads and writes the 16-byte ESYS zlib wrapper",()=>{const compressed=writeModelContainer(sample,true),parsed=parseModelContainer(compressed);expect(parsed.wasCompressed).toBe(true);expect(parsed.sections.map(s=>s.data)).toEqual(sample.sections.map(s=>s.data));expect(parseModelContainer(writeModelContainer(parsed)).sections.map(s=>s.data)).toEqual(sample.sections.map(s=>s.data));});
 it("rejects malformed section pointers",()=>{const bad=Buffer.from(writeModelContainer(sample,false));bad.writeUInt32LE(0xffffffff,32+16);expect(()=>parseModelContainer(bad)).toThrow(/pointer/i);});
});
