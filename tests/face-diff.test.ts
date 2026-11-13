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

// Real version-4 face_diff.bin from the4chancup/unlimited-tool-works.
// Version 4 has a legacy 32/6 count combination; do not assign v5/v6 bone names to it.
const REAL_V4=Buffer.from(`
RkFDRQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR
p8pBGBHUQebeycAb2KfAAAAAAAAAAABIYAq8IAAAAAYAAADwAAAAAAEAABAB
AAAgAQAAMAEAAEABAABQAQAAYAEAAHABAACAAQAAkAEAAKABAACwAQAAwAEA
ANABAADgAQAA8AEAAAACAAAQAgAAIAIAADACAABAAgAAUAIAAGACAABwAgAA
gAIAAJACAACgAgAAsAIAAMACAADQAgAA4AIAAPACAAAQAwAAMAMAAFADAABw
AwAAkAMAAAAAAAAAAAAAR7MCOyQCN7udWXs6AAAAADOKjDu7pi87stSTugAA
AACacIM7PS4uO30ffzoAAAAArWveOmNAJbvLcKe6AAAAAN/lnTtxaLu66vgd
OwAAAACVAsw7Ooe8uvPOCbsAAAAAylmZxDuzGjrHaqE6AAAAAMlZmcTVrB86
+iHVugAAAADCUpQ7xx8fOr5qoToAAAAARhCeO0o7HjrxIdW6AAAAAMJSlDvl
Hx86vmqhOgAAAAADEZ47UCAfOvEh1boAAAAAZKaZO3r2QDoVJ+G1AAAAAMIl
MTxS0jo5rbcPugAAAABurRA8eS2aOmz85TgAAAAAcysPO7+QEjs3ii+6AAAA
AFvmETzU1MA7JDsUOwAAAABtS+o7SirYO2XjUbsAAAAAIfM7OxYdKzuT24s5
AAAAAFgvwDuZOo86whGtuwAAAAB39Ls730pyOjPJpDsAAAAAn5cFPDgUBzxv
t0g7AAAAAFg9+zsbzN07SeWQOwAAAABhFL07SjnpO8vMp7sAAAAAe1noO5Mh
Bjxoani7AAAAADZTrzvIhTq6JhVGOAAAAADj3+c7AxMBPCZp2bkAAAAAF1Pd
Oxl49zvId8S5AAAAAPzh0juFZAo8zolnMAAAAAB6Yso7DUm+O1owcrsAAAAA
wSPzOwaWxTu7zHg7AAAAANwonTsw8eE7Sf0/OQAAAAAAAAAAAAAAAAAAAAAA
AIA/AACAPwAAgD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAIA/AACAPwAA
AAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAAAAAAAA
AAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAIA/
AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAA=
`.replace(/\s/g,""),"base64");

describe("PES face_diff metadata and records",()=>{
 it("decodes v5 eye scale, degree rotations, eyelid angles and jaw offset",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.version).toBe(5);
  expect(parsed.eyeScale).toEqual([1,1,1]);
  expect(parsed.rightEyeRotation).toEqual([1.5,-2.5,3.5]);
  expect(parsed.leftEyeRotation).toEqual([-1.5,2.5,-3.5]);
  expect(parsed.eyelidOffsets).toEqual({topLeft:20,topRight:-21,bottomLeft:-5,bottomRight:6});
  expect(parsed.jawOffset).toEqual([0.01,-0.02,0.03]);
  expect(parsed.oralPosition).toEqual(parsed.jawOffset);
  expect(parsed.mouthPosition).toEqual(parsed.jawOffset);
 });
 it("maps all 33 bone offsets by the verified v5/v6 order",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.boneOffsets).toHaveLength(33);
  expect(parsed.boneOffsets[0]).toMatchObject({boneName:"skf_brow_o_r",recordOffset:0xf0,position:[0.1,0.2,0.3],w:0});
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
  const parsed=inspectFaceDiff(REAL_V4);
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
 });
 it("rejects non-finite values in scalar and record blocks",()=>{
  for(const offset of [0x08,0x14,0x20,0x2c,0x3c,0xf0,0x300]){
   const bad=v5Fixture();bad.writeFloatLE(Number.NaN,offset);
   expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);
  }
 });
});
