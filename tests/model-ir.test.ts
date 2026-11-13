import {describe,expect,it} from "vitest";
import {validateFaceScene,type FaceScene} from "../engine/model/ir";
import {createConversionPlan} from "../engine/model/adapters";
const scene:FaceScene={schemaVersion:1,sourceFormat:"PES2021_FMDL",meshes:[{name:"face",materialIndex:0,vertices:[{position:[0,0,0],uvs:[],boneIndices:[],boneWeights:[]},{position:[1,0,0],uvs:[],boneIndices:[],boneWeights:[]},{position:[0,1,0],uvs:[],boneIndices:[],boneWeights:[]}],indices:[0,1,2]}],materials:[{name:"skin",shader:null,textures:{},parameters:{}}],bones:[],morphTargets:[],metadata:{}};
describe("canonical face scene",()=>{
 it("accepts a valid minimal triangle mesh",()=>expect(validateFaceScene(scene).filter(x=>x.severity==="error")).toHaveLength(0));
 it("rejects an out-of-range mesh index",()=>{const invalid={...scene,meshes:[{...scene.meshes[0],indices:[0,1,9]}]};expect(validateFaceScene(invalid).some(x=>x.code==="INDEX_OUT_OF_RANGE")).toBe(true);});
 it("keeps both directions explicitly blocked until their model adapters exist",()=>{for(const direction of ["pes2021-to-pes2017","pes2017-to-pes2021"] as const){const plan=createConversionPlan(direction,direction==="pes2021-to-pes2017"?"pes2021":"pes2017",true,true);expect(plan.executable).toBe(false);expect(plan.blockers.some(x=>x.includes("adapter"))).toBe(true);}});
});
