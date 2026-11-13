import {describe,expect,it} from "vitest";
import {inspectDdsHeader,inspectFmdlHeader,inspectFtexHeader,inspectModelHeader} from "../engine/formats/headers";
describe("PES binary header recognition",()=>{
 it("recognizes a structurally valid DDS header",()=>{const b=Buffer.alloc(128);b.write("DDS ",0);b.writeUInt32LE(124,4);b.writeUInt32LE(4,12);b.writeUInt32LE(4,16);b.writeUInt32LE(32,76);expect(inspectDdsHeader(b).valid).toBe(true);});
 it("rejects extension-only fake FMDL files",()=>{expect(inspectFmdlHeader(Buffer.from("not an fmdl")).valid).toBe(false);});
 it("rejects truncated FTEX headers",()=>{expect(inspectFtexHeader(Buffer.from("FTEX")).valid).toBe(false);});
 it("rejects unknown MODEL versions",()=>{const b=Buffer.alloc(64);b.write("MODEL\0\0\0",0,"binary");b.writeUInt32LE(24,8);b.writeUInt16LE(99,14);expect(inspectModelHeader(b).valid).toBe(false);});
 it("recognizes a bounded FMDL container header",()=>{const b=Buffer.alloc(56);b.write("FMDL",0);b.writeUInt32LE(0x4001eb85,4);b.writeBigUInt64LE(56n,8);b.writeBigUInt64LE(0n,16);b.writeBigUInt64LE(0n,24);b.writeUInt32LE(0,32);b.writeUInt32LE(0,36);b.writeUInt32LE(56,40);b.writeUInt32LE(0,44);b.writeUInt32LE(56,48);b.writeUInt32LE(0,52);expect(inspectFmdlHeader(b).valid).toBe(true);});
 it("recognizes a bounded PES 2017 MODEL header",()=>{const b=Buffer.alloc(36);b.write("MODEL\\0\\0\\0",0,"binary");b.writeUInt32LE(24,8);b.writeUInt16LE(19,14);b.writeUInt32LE(12,24);b.writeUInt32LE(0,28);b.writeUInt32LE(4,32);expect(inspectModelHeader(b).valid).toBe(true);});

});
