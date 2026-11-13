import {describe,expect,it} from "vitest";
import type {FmdlContainer,FmdlSegment0Block} from "../engine/formats/fmdl-container";
import {decodePes2021Fmdl} from "../engine/formats/fmdl-geometry";
function block(id:number,entryCount:number,entrySize:number,data:Buffer):FmdlSegment0Block{return {id,entryCount,entrySize,data};}
function fixture(badIndex=false):FmdlContainer{
 const mesh=Buffer.alloc(48);mesh.writeUInt16LE(0,4);mesh.writeUInt16LE(0,6);mesh.writeUInt16LE(0,8);mesh.writeUInt16LE(3,10);mesh.writeUInt32LE(0,16);mesh.writeUInt32LE(3,20);mesh.writeBigUInt64LE(0n,24);
 const instance=Buffer.alloc(16);instance.writeUInt16LE(0,0);instance.writeUInt16LE(0,4);instance.writeUInt8(0,6);instance.writeUInt8(0,7);
 const material=Buffer.alloc(4);material.writeUInt16LE(1,0);material.writeUInt16LE(2,2);
 const formatAssignment=Buffer.alloc(8);formatAssignment.writeUInt8(1,0);formatAssignment.writeUInt8(1,1);
 const meshFormat=Buffer.alloc(8);meshFormat.writeUInt8(0,0);meshFormat.writeUInt8(1,1);meshFormat.writeUInt8(12,2);
 const vertexFormat=Buffer.alloc(4);vertexFormat.writeUInt8(0,0);vertexFormat.writeUInt8(1,1);
 const strings=Buffer.from("face\0shader\0technique\0","utf8"),stringDefinitions=Buffer.alloc(24);
 [[4,0],[6,5],[9,12]].forEach(([length,offset],i)=>{const p=i*8;stringDefinitions.writeUInt16LE(3,p);stringDefinitions.writeUInt16LE(length,p+2);stringDefinitions.writeUInt32LE(offset,p+4);});
 const bufferOffsets=Buffer.alloc(48);bufferOffsets.writeUInt32LE(0,8);bufferOffsets.writeUInt32LE(0,24);bufferOffsets.writeUInt32LE(36,40);
 const lod=Buffer.alloc(16);lod.writeUInt32LE(1,0);
 const faceDescriptor=Buffer.alloc(8);faceDescriptor.writeUInt32LE(0,0);faceDescriptor.writeUInt32LE(3,4);
 const group=Buffer.alloc(8);group.writeUInt16LE(0,0);
 const assignment=Buffer.alloc(32);assignment.writeUInt16LE(0,4);assignment.writeUInt16LE(1,6);assignment.writeUInt16LE(0,8);
 const data=Buffer.alloc(42);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>data.writeFloatLE(v,i*4));[0,1,badIndex?9:2].forEach((v,i)=>data.writeUInt16LE(v,36+i*2));
 return {version:0x4001eb85,section0Bitmap:0n,section1Bitmap:0n,section0Blocks:[block(1,1,8,group),block(2,1,32,assignment),block(3,1,48,mesh),block(4,1,16,instance),block(8,1,4,material),block(9,1,8,formatAssignment),block(10,1,8,meshFormat),block(11,1,4,vertexFormat),block(12,3,8,stringDefinitions),block(14,3,16,bufferOffsets),block(16,1,16,lod),block(17,1,8,faceDescriptor)],section1Blocks:[{id:2,data},{id:3,data:strings}],warnings:[]};
}
describe("PES 2021 FMDL geometry decoder",()=>{
 it("decodes mesh positions, face indices, material and mesh-group name",()=>{const scene=decodePes2021Fmdl(fixture());expect(scene.meshes).toHaveLength(1);expect(scene.meshes[0].name).toBe("face");expect(scene.meshes[0].vertices.map(v=>v.position)).toEqual([[0,0,0],[1,0,0],[0,1,0]]);expect(scene.meshes[0].indices).toEqual([0,1,2]);expect(scene.materials[0].shader).toBe("shader");});
 it("rejects FMDL face indices outside the vertex buffer",()=>expect(()=>decodePes2021Fmdl(fixture(true))).toThrow(/out-of-range/i));
});
