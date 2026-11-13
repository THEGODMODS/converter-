import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {inspectFaceDiff} from "../engine/formats/face-diff";

function realFixture(name:string):Buffer{
 return Buffer.from(readFileSync(new URL("./fixtures/"+name,import.meta.url),"utf8").trim(),"base64");
}
const v4Fixture=()=>realFixture("face-diff-real-v4.b64");
const v5Fixture=()=>realFixture("face-diff-real-v5.b64");

describe("PES face_diff metadata and records",()=>{
 it("decodes scalar calibration from an independently sourced real PES 2021 v5 file",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.version).toBe(5);
  expect(parsed.declaredBlock1Records).toBe(32);
  expect(parsed.declaredBlock2Records).toBe(6);
  expect(parsed.eyeScale[0]).toBeCloseTo(1.1364505,5);
  expect(parsed.eyeScale[1]).toBeCloseTo(1.1364505,5);
  expect(parsed.eyeScale[2]).toBeCloseTo(1.1364505,5);
  expect(parsed.rightEyeRotation).toEqual([0,0,0]);
  expect(parsed.leftEyeRotation).toEqual([0,0,0]);
  expect(parsed.eyelidOffsets.topLeft).toBeCloseTo(25.331575,4);
  expect(parsed.eyelidOffsets.topRight).toBeCloseTo(26.508347,4);
  expect(parsed.eyelidOffsets.bottomLeft).toBeCloseTo(-6.308459,4);
  expect(parsed.eyelidOffsets.bottomRight).toBeCloseTo(-5.24513,4);
  expect(parsed.jawOffset.every(Number.isFinite)).toBe(true);
 });
 it("keeps real v5 auxiliary records opaque instead of assigning unverified bone and ear names",()=>{
  const parsed=inspectFaceDiff(v5Fixture());
  expect(parsed.fileBytes).toBe(960);
  expect(parsed.opaqueRecordOffsets).toHaveLength(38);
  expect(parsed.boneOffsets).toHaveLength(0);
  expect(parsed.earTransforms).toHaveLength(0);
  expect(parsed.rightEyePosition).toBeNull();
  expect(parsed.leftEyePosition).toBeNull();
 });
 it("accepts the independently sourced real legacy v4 fixture and validates its record ranges",()=>{
  const parsed=inspectFaceDiff(v4Fixture());
  expect(parsed.fileBytes).toBe(944);
  expect(parsed.version).toBe(4);
  expect(parsed.declaredBlock1Records).toBe(32);
  expect(parsed.declaredBlock2Records).toBe(6);
  expect(parsed.opaqueRecordOffsets).toHaveLength(38);
  expect(parsed.boneOffsets).toHaveLength(0);
  expect(parsed.earTransforms).toHaveLength(0);
 });
 it("rejects invalid magic, truncated headers and count-derived truncation",()=>{
  const bad=v5Fixture();bad.write("NOPE",0,"ascii");
  expect(()=>inspectFaceDiff(bad)).toThrow(/magic/i);
  expect(()=>inspectFaceDiff(Buffer.alloc(0x4f))).toThrow(/header is truncated/i);
  const short=Buffer.alloc(0x100);short.write("FACE",0,"ascii");short.writeUInt32LE(32,0x48);short.writeUInt32LE(6,0x4c);
  expect(()=>inspectFaceDiff(short)).toThrow(/header requires at least/i);
 });
 it("rejects invalid, duplicate and out-of-range real v5 record pointers",()=>{
  const unaligned=v5Fixture();unaligned.writeUInt32LE(0xf1,0x50);
  expect(()=>inspectFaceDiff(unaligned)).toThrow(/unaligned absolute offset/i);
  const duplicate=v5Fixture();duplicate.writeUInt32LE(0xf0,0x54);
  expect(()=>inspectFaceDiff(duplicate)).toThrow(/duplicate pointer/i);
  const outOfRange=v5Fixture();outOfRange.writeUInt32LE(0x3b0,0x50);
  expect(()=>inspectFaceDiff(outOfRange)).toThrow(/out of range/i);
 });
 it("rejects overlapping v4 record ranges without interpreting their semantics",()=>{
  const bad=v4Fixture();
  // First second-block record spans 0x2f0..0x310; this pointer overlaps it at 0x300.
  bad.writeUInt32LE(0x300,0x50+31*4);
  expect(()=>inspectFaceDiff(bad)).toThrow(/records overlap/i);
 });
 it("rejects overlapping v5 record ranges instead of preserving malformed pointers",()=>{
  const bad=v5Fixture();
  // The last 16-byte entry is redirected into the first 32-byte entry.
  bad.writeUInt32LE(0x300,0x50+31*4);
  expect(()=>inspectFaceDiff(bad)).toThrow(/records overlap/i);
 });
 it("rejects non-finite header calibration and v4 record values",()=>{
  for(const offset of [0x08,0x14,0x20,0x2c,0x3c]){
   const bad=v5Fixture();bad.writeFloatLE(Number.NaN,offset);
   expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);
  }
  const bad=v4Fixture();bad.writeFloatLE(Number.NaN,0xf0);
  expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);
 });
});
