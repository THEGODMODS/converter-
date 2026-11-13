import {describe,expect,it} from "vitest";
import {decodePes2017Geometry} from "../engine/formats/model-geometry";
function minimalSection1():Buffer{
 const b=Buffer.alloc(170);
 b.writeUInt32LE(12,0);b.writeUInt32LE(1,4);b.writeUInt32LE(16,8);
 b.writeUInt32LE(1,12);b.writeInt32LE(28,16);b.writeInt32LE(80,20);b.writeUInt32LE(0,24);
 b.writeUInt32LE(12,28);b.writeUInt32LE(1,32);b.writeUInt32LE(4,36);b.writeInt32LE(44,40);
 b.writeUInt32LE(20,44);b.writeUInt32LE(1,48);b.writeUInt32LE(16,52);b.writeUInt32LE(0,56);b.writeUInt32LE(0,60);
 b.writeInt32LE(128,64);b.writeUInt32LE(2,68);b.writeUInt32LE(5,72);b.writeUInt32LE(3,76);
 b.writeUInt32LE(12,80);b.writeUInt32LE(1,84);b.writeUInt32LE(24,88);
 b.writeInt32LE(164,92);b.writeUInt32LE(1,96);b.writeUInt32LE(1,100);b.writeUInt32LE(3,104);b.writeUInt32LE(0,108);b.writeInt32LE(0,112);
 const positions=[0,0,0,1,0,0,0,1,0];positions.forEach((v,i)=>b.writeFloatLE(v,128+i*4));
 [0,1,2].forEach((v,i)=>b.writeUInt16LE(v,164+i*2));return b;
}
describe("PES 2017 MODEL geometry decoder",()=>{
 it("decodes triangle positions and uint16 face indices",()=>{const [mesh]=decodePes2017Geometry(minimalSection1());expect(mesh.vertices).toHaveLength(3);expect(mesh.vertices.map(v=>v.position)).toEqual([[0,0,0],[1,0,0],[0,1,0]]);expect(mesh.indices).toEqual([0,1,2]);});
 it("rejects out-of-range face indices",()=>{const b=minimalSection1();b.writeUInt16LE(9,168);expect(()=>decodePes2017Geometry(b)).toThrow(/out-of-range/i);});
});
