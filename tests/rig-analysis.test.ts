import {describe,it,expect} from "vitest";
import type {FaceScene,FaceBone} from "../engine/model/ir";
import {analyzeRigCompatibility,auditSkinWeights,normalizeSkinWeights} from "../engine/model/rig-analysis";
const bone=(name:string,parentIndex:number|null):FaceBone=>({name,parentIndex,sourceMatrix:[1,0,0,0,1,0,0,0,1,0,0,0]});
const scene=(bones:FaceBone[]):FaceScene=>({schemaVersion:1,sourceFormat:"PES2021_FMDL",bones,materials:[{name:"skin",shader:null,textures:{},parameters:{}}],meshes:[],morphTargets:[],metadata:{}});
describe("cross-generation rig analysis",()=>{
 it("matches normalized names but refuses to certify a rig with different parent hierarchy",()=>{const source=scene([bone("root",null),bone("Head",0)]),target=scene([bone("root",null),bone("head",null)]);const result=analyzeRigCompatibility(source,target);expect(result.matched).toHaveLength(2);expect(result.issues.some(x=>x.code==="PARENT_MISMATCH")).toBe(true);expect(result.safeForAutomaticRetarget).toBe(false);});
 it("reports missing and ambiguous bones instead of guessing",()=>{const source=scene([bone("head",null),bone("eye_L",0)]),target=scene([bone("head",null),bone("eyeL",0),bone("eye-L",0)]);const result=analyzeRigCompatibility(source,target);expect(result.ambiguous).toContain("eye_L");expect(result.safeForAutomaticRetarget).toBe(false);});
 it("audits weights against actual skeleton bounds",()=>{const s=scene([bone("head",null)]);s.meshes=[{name:"face",materialIndex:0,vertices:[{position:[0,0,0],uvs:[],boneIndices:[0],boneWeights:[0.4]},{position:[1,0,0],uvs:[],boneIndices:[2],boneWeights:[1]}],indices:[]}];const audit=auditSkinWeights(s.meshes,s.bones);expect(audit.nonNormalizedWeights).toBe(1);expect(audit.invalidInfluences).toBe(1);});
 it("combines duplicate influences, keeps strongest four and normalizes",()=>{expect(normalizeSkinWeights([0,1,1,2,3,4],[.2,.1,.2,.3,.15,.05],5)).toEqual({indices:[2,1,0,3],weights:[.3,.3,.2,.15].map(x=>x/.95)});});
 it("rejects invalid influence indices and weights",()=>{expect(()=>normalizeSkinWeights([4],[1],2)).toThrow(/invalid bone/);expect(()=>normalizeSkinWeights([0],[NaN],1)).toThrow(/finite/);});
});
