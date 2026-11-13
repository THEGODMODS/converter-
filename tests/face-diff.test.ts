import {describe,expect,it} from "vitest";
import {inspectFaceDiff} from "../engine/formats/face-diff";
function fixture(){
 const data=Buffer.alloc(0x16c);data.write("FACE",0,"ascii");
 for(const [offset,values] of [
  [0x08,[1,1,1]],[0x14,[0.01,0.02,0.03]],[0x20,[-0.01,-0.02,-0.03]],
  [0x3c,[0.1,0.2,0.3]],[0x150,[0.4,0.5,0.6]],[0x160,[-0.4,0.5,0.6]]
 ] as Array<[number,number[]]>)values.forEach((value,i)=>data.writeFloatLE(value,offset+i*4));
 [0.11,0.12,0.13,0.14].forEach((value,i)=>data.writeFloatLE(value,0x2c+i*4));
 return data;
}
describe("PES face_diff metadata",()=>{
 it("reads documented eye scale, rotation, eyelid and oral controls",()=>{
  const parsed=inspectFaceDiff(fixture());
  expect(parsed.eyeScale).toEqual([1,1,1]);
  parsed.rightEyeRotation.forEach((value,index)=>expect(value).toBeCloseTo([0.01,0.02,0.03][index],6));
  parsed.leftEyeRotation.forEach((value,index)=>expect(value).toBeCloseTo([-0.01,-0.02,-0.03][index],6));
  for(const [actual,expected] of Object.values(parsed.eyelidOffsets).map((value,index)=>[value,[0.11,0.12,0.13,0.14][index]] as [number,number]))expect(actual).toBeCloseTo(expected,6);
  parsed.oralPosition.forEach((value,index)=>expect(value).toBeCloseTo([0.1,0.2,0.3][index],6));
  expect(parsed.mouthPosition).toEqual(parsed.oralPosition);
 });
 it("reads right and left eye placement vectors",()=>{
  const parsed=inspectFaceDiff(fixture());
  for(const [actual,expected] of [[parsed.rightEyePosition,[0.4,0.5,0.6]],[parsed.leftEyePosition,[-0.4,0.5,0.6]]] as Array<[number[],number[]]>)
   actual.forEach((value,index)=>expect(value).toBeCloseTo(expected[index],6));
 });
 it("rejects invalid magic and truncated files",()=>{
  const bad=fixture();bad.write("NOPE",0,"ascii");
  expect(()=>inspectFaceDiff(bad)).toThrow(/invalid/i);
  expect(()=>inspectFaceDiff(Buffer.alloc(0x100))).toThrow(/invalid/i);
 });
 it("rejects record tables shorter than the counts declared in the header",()=>{
  const bad=fixture();bad.writeUInt32LE(20,0x48);
  expect(()=>inspectFaceDiff(bad)).toThrow(/header requires at least/i);
 });
 it("reports auxiliary record tables without pretending to decode them",()=>{
  const data=fixture();data.writeUInt32LE(1,0x48);
  const parsed=inspectFaceDiff(data);
  expect(parsed.declaredBlock1Records).toBe(1);
  expect(parsed.warnings.some(w=>w.includes("auxiliary record tables"))).toBe(true);
 });
 it("rejects non-finite values in each inspected control block",()=>{
  for(const offset of [0x08,0x14,0x20,0x2c,0x3c,0x150,0x160]){
   const bad=fixture();bad.writeFloatLE(Number.NaN,offset);
   expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);
  }
 });
});
