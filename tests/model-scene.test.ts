import {describe,expect,it} from "vitest";
import type {ModelContainer} from "../engine/formats/model-container";
import {decodePes2017Model} from "../engine/formats/model-scene";
function geometrySection():Buffer{
 const b=Buffer.alloc(170);b.writeUInt32LE(12,0);b.writeUInt32LE(1,4);b.writeUInt32LE(16,8);b.writeUInt32LE(1,12);b.writeInt32LE(28,16);b.writeInt32LE(80,20);
 b.writeUInt32LE(12,28);b.writeUInt32LE(1,32);b.writeUInt32LE(4,36);b.writeInt32LE(44,40);
 b.writeUInt32LE(20,44);b.writeUInt32LE(1,48);b.writeUInt32LE(16,52);b.writeUInt32LE(0,56);b.writeUInt32LE(0,60);b.writeInt32LE(128,64);b.writeUInt32LE(2,68);b.writeUInt32LE(5,72);b.writeUInt32LE(3,76);
 b.writeUInt32LE(12,80);b.writeUInt32LE(1,84);b.writeUInt32LE(24,88);b.writeInt32LE(164,92);b.writeUInt32LE(1,96);b.writeUInt32LE(1,100);b.writeUInt32LE(3,104);
 [0,0,0,1,0,0,0,1,0].forEach((v,i)=>b.writeFloatLE(v,128+i*4));[0,1,2].forEach((v,i)=>b.writeUInt16LE(v,164+i*2));return b;
}
function makeScene():ModelContainer{
 const s0=Buffer.alloc(126);s0.writeUInt32LE(12,0);s0.writeUInt32LE(2,4);s0.writeUInt32LE(4,8);s0.writeUInt32LE(20,12);s0.writeUInt32LE(96,16);
 s0.writeUInt32LE(16,20);s0.writeUInt32LE(1,24);s0.writeUInt32LE(12,28);s0.writeUInt32LE(2,32);s0.writeInt32LE(28,36);s0.writeUInt32LE(7,40);s0.writeUInt32LE(1,44);for(let i=0;i<12;i++)s0.writeFloatLE(i%4===0?1:0,48+i*4);
 s0.writeUInt32LE(16,96);s0.writeUInt32LE(1,100);s0.writeUInt32LE(12,104);s0.writeUInt32LE(2,108);s0.writeInt32LE(28,112);s0.writeUInt32LE(1,116);s0.writeUInt32LE(1,120);s0.writeUInt16LE(0,124);
 const s5=Buffer.alloc(21);s5.writeUInt32LE(12,0);s5.writeUInt32LE(1,4);s5.writeUInt32LE(4,8);s5.writeInt32LE(16,12);s5.write("head\0",16);
 const s6=Buffer.alloc(21);s6.writeUInt32LE(12,0);s6.writeUInt32LE(1,4);s6.writeUInt32LE(4,8);s6.writeInt32LE(16,12);s6.write("skin\0",16);
 const s4=Buffer.alloc(48);s4.writeUInt32LE(12,0);s4.writeUInt32LE(1,4);s4.writeUInt32LE(20,8);s4.writeInt32LE(1012-3000,12);s4.writeInt32LE(32,16);s4.writeInt32LE(0,20);s4.writeInt32LE(2012-3000,24);s4.writeInt32LE(0,28);
 s4.writeUInt32LE(12,32);s4.writeUInt32LE(1,36);s4.writeUInt32LE(4,40);s4.writeInt32LE(4016-3000,44);
 return {version:19,unknown1:0,unknown2:9,flags:0,arrayHeaderExtra:Buffer.alloc(0),sections:[{index:0,fileOffset:4000,data:s0},{index:1,fileOffset:1000,data:geometrySection()},{index:2,fileOffset:1200,data:Buffer.alloc(0)},{index:3,fileOffset:1400,data:Buffer.alloc(0)},{index:4,fileOffset:3000,data:s4},{index:5,fileOffset:1800,data:s5},{index:6,fileOffset:2000,data:s6}],wasCompressed:false,warnings:[]};
}
describe("PES 2017 full model scene reconstruction",()=>{
 it("resolves cross-section mesh, bone-group and material pointers",()=>{const scene=decodePes2017Model(makeScene());expect(scene.sourceFormat).toBe("PES2017_MODEL");expect(scene.bones.map(b=>b.name)).toEqual(["head"]);expect(scene.materials.map(m=>m.name)).toEqual(["skin"]);expect(scene.meshes).toHaveLength(1);expect(scene.meshes[0].materialIndex).toBe(0);expect(scene.meshes[0].vertices).toHaveLength(3);});
});
