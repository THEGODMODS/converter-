import {describe,expect,it} from "vitest";
import {inspectFaceDiff} from "../engine/formats/face-diff";
function fixture(){const data=Buffer.alloc(0x16c);data.write("FACE",0,"ascii");for(const [offset,values] of [[0x08,[1,1,1]],[0x3c,[0.1,0.2,0.3]],[0x150,[0.4,0.5,0.6]],[0x160,[-0.4,0.5,0.6]]] as Array<[number,number[]]>)values.forEach((value,i)=>data.writeFloatLE(value,offset+i*4));return data;}
describe("PES face_diff metadata",()=>{
 it("reads stable eye scale, oral and eye placement vectors",()=>{const parsed=inspectFaceDiff(fixture());expect(parsed.eyeScale).toEqual([1,1,1]);for(const [actual,expected] of [[parsed.mouthPosition,[0.1,0.2,0.3]],[parsed.rightEyePosition,[0.4,0.5,0.6]],[parsed.leftEyePosition,[-0.4,0.5,0.6]]] as Array<[number[],number[]]>)actual.forEach((value,index)=>expect(value).toBeCloseTo(expected[index],6));});
 it("rejects invalid magic and truncated files",()=>{const bad=fixture();bad.write("NOPE",0,"ascii");expect(()=>inspectFaceDiff(bad)).toThrow(/invalid/i);expect(()=>inspectFaceDiff(Buffer.alloc(0x100))).toThrow(/invalid/i);});
 it("rejects non-finite coordinates",()=>{const bad=fixture();bad.writeFloatLE(Number.NaN,0x150);expect(()=>inspectFaceDiff(bad)).toThrow(/non-finite/i);});
});
