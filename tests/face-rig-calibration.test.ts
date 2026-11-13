import {describe,expect,it} from "vitest";
import {auditFaceRigCalibration} from "../engine/model/face-rig-calibration";
import {inspectFaceDiff} from "../engine/formats/face-diff";
import type {FaceScene} from "../engine/model/ir";

function fixture(){
 const data=Buffer.alloc(0x320);data.write("FACE",0,"ascii");data.writeUInt32LE(6,4);data.writeUInt32LE(33,0x48);data.writeUInt32LE(6,0x4c);
 const names=["skf_brow_o_r","skf_brow_i_r","skf_brow_i_l","skf_brow_o_l","skf_orbicularisoculi_b_r","skf_orbicularisoculi_b_l","skf_eye_r","skf_eye_l","skf_eyelid_b_r","skf_eyelid_b_l","skf_eyelid_t_r","skf_eyelid_t_l","skf_glabella","skf_nosewing_r","skf_nosewing_l","skf_cheek_r","skf_nasolabialfold_t_r","skf_nasolabialfold_t_l","skf_cheek_l","skf_cheek_s_r","skf_cheek_s_l","skf_lip_t_r","skf_lip_s_r","skf_lip_s_l","skf_lip_t_l","skf_nose","skf_lip_t_c","skf_lip_volume","skf_jaw","skf_lip_b_l","skf_lip_b_r","skf_doublechin","skf_lip_b_c"];
 for(let i=0;i<33;i++){const o=0xf0+i*0x10;data.writeUInt32LE(o,0x50+i*4);}
 for(let i=0;i<6;i++){const o=0x300+i*0x20;data.writeUInt32LE(o,0x50+(33+i)*4);[1,1,1].forEach((v,j)=>data.writeFloatLE(v,o+12+j*4));}
 const bones=["sk_head",...names,"dsk_ear_t_l","dsk_ear_t_r","dsk_ear_b_l","dsk_ear_b_r","dsk_earlobe_l","dsk_earlobe_r"];
 const scene:FaceScene={schemaVersion:1,sourceFormat:"PES2021_FMDL",meshes:[],materials:[],bones:bones.map(name=>({name,parentIndex:null})),morphTargets:[],metadata:{}};
 return {scene,diff:inspectFaceDiff(data)};
}
describe("FACE diff to skeleton calibration audit",()=>{
 it("maps verified facial and ear records by exact bone name without mutating scene",()=>{
  const {scene,diff}=fixture();const before=JSON.stringify(scene);
  const audit=auditFaceRigCalibration(scene,diff);
  expect(audit.headFrameStatus).toBe("matched");
  expect(audit.summary).toEqual({matched:39,missing:0,ambiguous:0,total:39});
  expect(audit.facialOffsets[6]).toMatchObject({boneIndex:7,status:"matched",record:{boneName:"skf_eye_r"}});
  expect(audit.earTransforms[0]).toMatchObject({boneIndex:34,status:"matched",record:{boneName:"dsk_ear_t_l"}});
  expect(audit.application).toBe("inspection-only");
  expect(audit.blockers.some(x=>x.includes("No offsets were applied"))).toBe(true);
  expect(JSON.stringify(scene)).toBe(before);
 });
 it("reports missing frame and unmatched landmarks instead of guessing aliases",()=>{
  const {scene,diff}=fixture();scene.bones=scene.bones.filter(b=>b.name!=="sk_head"&&b.name!=="skf_eye_r");
  const audit=auditFaceRigCalibration(scene,diff);
  expect(audit.headFrameStatus).toBe("missing");
  expect(audit.facialOffsets[6].status).toBe("missing");
  expect(audit.summary.missing).toBe(1);
  expect(audit.blockers.some(x=>x.includes("sk_head"))).toBe(true);
 });
 it("marks duplicate bone names as ambiguous",()=>{
  const {scene,diff}=fixture();scene.bones.push({name:"skf_eye_r",parentIndex:null});
  const audit=auditFaceRigCalibration(scene,diff);
  expect(audit.facialOffsets[6]).toMatchObject({boneIndex:null,status:"ambiguous"});
  expect(audit.summary.ambiguous).toBe(1);
  expect(audit.duplicateSceneBoneNames).toContain("skf_eye_r");
 });
});
