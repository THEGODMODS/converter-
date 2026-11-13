import {describe,expect,it} from "vitest";
import {inspectDdsHeader,inspectFmdlHeader,inspectFtexHeader,inspectModelHeader} from "../engine/formats/headers";
describe("PES binary header recognition",()=>{
 it("recognizes a structurally valid DDS header",()=>{const b=Buffer.alloc(128);b.write("DDS ",0);b.writeUInt32LE(124,4);b.writeUInt32LE(4,12);b.writeUInt32LE(4,16);b.writeUInt32LE(32,76);expect(inspectDdsHeader(b).valid).toBe(true);});
 it("rejects extension-only fake FMDL files",()=>{expect(inspectFmdlHeader(Buffer.from("not an fmdl")).valid).toBe(false);});
 it("rejects truncated FTEX headers",()=>{expect(inspectFtexHeader(Buffer.from("FTEX")).valid).toBe(false);});
 it("rejects unknown MODEL versions",()=>{const b=Buffer.alloc(64);b.write("MODEL\0\0\0",0,"binary");b.writeUInt32LE(24,8);b.writeUInt16LE(99,14);expect(inspectModelHeader(b).valid).toBe(false);});
});
