import {describe,expect,it} from "vitest";
import {inspectFaceDiff} from "../engine/formats/face-diff";

function v5Fixture(){
 const data=Buffer.alloc(960);data.write("FACE",0,"ascii");data.writeUInt32LE(5,4);
 data.writeUInt32LE(33,0x48);data.writeUInt32LE(6,0x4c);
 for(let i=0;i<33;i++){
  const offset=0xf0+i*0x10;data.writeUInt32LE(offset,0x50+i*4);
  [i+0.1,i+0.2,i+0.3,0].forEach((v,j)=>data.writeFloatLE(v,offset+j*4));
 }
 for(let i=0;i<6;i++){
  const offset=0x300+i*0x20;data.writeUInt32LE(offset,0x50+(33+i)*4);
  [0,0,0,1,1,1,0,0].forEach((v,j)=>data.writeFloatLE(v,offset+j*4));
 }
 [1,1,1].forEach((v,i)=>data.writeFloatLE(v,0x08+i*4));
 [1.5,-2.5,3.5].forEach((v,i)=>data.writeFloatLE(v,0x14+i*4));
 [-1.5,2.5,-3.5].forEach((v,i)=>data.writeFloatLE(v,0x20+i*4));
 [20,-21,-5,6].forEach((v,i)=>data.writeFloatLE(v,0x2c+i*4));
 [0.01,-0.02,0.03].forEach((v,i)=>data.writeFloatLE(v,0x3c+i*4));
 return data;
}

// Synthetic v4-shaped fixture based on the independently observed 32/6 header variant.
// Its record pointers remain opaque because v4 semantics are not established here.
function v4LegacyFixture(){
 const data=Buffer.alloc(944);data.write("FACE",0,"ascii");data.writeUInt32LE(4,4);
 data.writeUInt32LE(32,0x48);data.writeUInt32LE(6,0x4c);
 const offsets=[...Array.from({length:32},(_,i)=>0xf0+i*0x10),...Array.from({length:6},(_,i)=>0x2f0+i*0x20)];
 offsets.forEach((offset,i)=>data.writeUInt32LE(offset,0x50+i*4));
 return data;
}

describe("PES face_diff metadata and records",()=>{
 it("decodes v5 eye scale, degree rotations, eyelid angles and jaw offset",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.version).toBe(5);
  expect(parsed.eyeScale).toEqual([1,1,1]);
  expect(parsed.rightEyeRotation).toEqual([1.5,-2.5,3.5]);
  expect(parsed.leftEyeRotation).toEqual([-1.5,2.5,-3.5]);
  expect(parsed.eyelidOffsets).toEqual({topLeft:20,topRight:-21,bottomLeft:-5,bottomRight:6});
  parsed.jawOffset.forEach((value,index)=>expect(value).toBeCloseTo([0.01,-0.02,0.03][index],6));
  expect(parsed.oralPosition).toEqual(parsed.jawOffset);
  expect(parsed.mouthPosition).toEqual(parsed.jawOffset);
 });
 it("maps all 33 bone offsets by the verified v5/v6 order",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.boneOffsets).toHaveLength(33);
  expect(parsed.boneOffsets[0]).toMatchObject({boneName:"skf_brow_o_r",recordOffset:0xf0,w:0});
  parsed.boneOffsets[0].position.forEach((value,index)=>expect(value).toBeCloseTo([0.1,0.2,0.3][index],6));
  expect(parsed.boneOffsets[6].boneName).toBe("skf_eye_r");
  expect(parsed.boneOffsets[7].boneName).toBe("skf_eye_l");
  expect(parsed.rightEyePosition).toEqual(parsed.boneOffsets[6].position);
  expect(parsed.leftEyePosition).toEqual(parsed.boneOffsets[7].position);
  expect(parsed.boneOffsets[32].boneName).toBe("skf_lip_b_c");
 });
 it("decodes six ear translation and scale records",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.earTransforms).toHaveLength(6);
  expect(parsed.earTransforms[0]).toMatchObject({boneName:"dsk_ear_t_l",recordOffset:0x300,translation:[0,0,0],scale:[1,1,1],reserved:[0,0]});
  expect(parsed.earTransforms[5].boneName).toBe("dsk_earlobe_r");
 });
 it("accepts a real legacy v4 fixture but does not invent v5/v6 landmark names",()=>{
  const parsed=inspectFaceDiff(v4LegacyFixture());
  expect(parsed.fileBytes).toBe(944);
  expect(parsed.version).toBe(4);
  expect(parsed.declaredBlock1Records).toBe(32);
  expect(parsed.declaredBlock2Records).toBe(6);
  expect(parsed.opaqueRecordOffsets).toHaveLength(38);
  expect(parsed.boneOffsets).toHaveLength(0);
  expect(parsed.earTransforms).toHaveLength(0);
  expect(parsed.warnings.some(w=>w.includes("not the verified v5/v6 layout"))).toBe(true);
 });
 it("rejects invalid magic, truncated headers and count-derived truncation",()=>{
  const bad=v5Fixture();bad.write("NOPE",0,"ascii");
  expect(()=>inspectFaceDiff(bad)).toThrow(/magic/i);
  expect(()=>inspectFaceDiff(Buffer.alloc(0x4f))).toThrow(/header is truncated/i);
  const short=Buffer.alloc(0x100);short.write("FACE",0,"ascii");short.writeUInt32LE(33,0x48);short.writeUInt32LE(6,0x4c);
  expect(()=>inspectFaceDiff(short)).toThrow(/header requires at least/i);
 });
 it("rejects invalid, duplicate and overlapping v5/v6 record pointers",()=>{
  const unaligned=v5Fixture();unaligned.writeUInt32LE(0xf1,0x50);
  expect(()=>inspectFaceDiff(unaligned)).toThrow(/unaligned absolute offset/i);
  const duplicate=v5Fixture();duplicate.writeUInt32LE(0xf0,0x54);
  expect(()=>inspectFaceDiff(duplicate)).toThrow(/duplicate pointer/i);
  const overlap=v5Fixture();overlap.writeUInt32LE(0xf0,0x50+33*4);
  expect(()=>inspectFaceDiff(overlap)).toThrow(/duplicate pointer|records overlap/i);
  const trailing=Buffer.alloc(976);v5Fixture().copy(trailing);trailing.writeUInt32LE(0x3c0,0x50);
  expect(()=>inspectFaceDiff(trailing)).toThrow(/invalid or unaligned absolute offset/i);
 });
 it("rejects overlapping legacy v4 record ranges without decoding their semantics",()=>{
  const bad=v4LegacyFixture();
  // The first 32 pointers address 16-byte records; block two addresses 32-byte records.
  bad.writeUInt32LE(0x2e0,0x50+32*4);
  expect(()=>inspectFaceDiff(bad)).toThrow(/records overlap/i);
 });
 it("rejects non-finite values in scalar and record blocks",()=>{
  for(const offset of [0x08,0x14,0x20,0x2c,0x3c,0xf0,0x300]){
   const bad=v5Fixture();bad.writeFloatLE(Number.NaN,offset);
   expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);
  }
 });
});
