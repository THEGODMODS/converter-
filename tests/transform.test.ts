import {describe,it,expect} from "vitest";
import {identity4,multiply4,invert4,transformPoint4,transformNormal4,computeBindPoseRetargetMatrix} from "../engine/model/transform";
describe("bind-pose transform math",()=>{
 it("multiplies and inverts identity and translation matrices",()=>{const t=[1,0,0,0,0,1,0,0,0,0,1,0,4,-2,7,1] as const;expect(multiply4(t,invert4(t))).toEqual(identity4());expect(transformPoint4(t,[1,2,3])).toEqual([5,0,10]);});
 it("maps source bind-space positions into target bind space",()=>{const source=[1,0,0,0,0,1,0,0,0,0,1,0,2,0,0,1] as const,target=[1,0,0,0,0,1,0,0,0,0,1,0,5,3,0,1] as const;const retarget=computeBindPoseRetargetMatrix(source,target);expect(transformPoint4(retarget,[2,0,0])).toEqual([5,3,0]);});
 it("uses inverse transpose for normals under non-uniform scale",()=>{const scale=[2,0,0,0,0,1,0,0,0,0,.5,0,0,0,0,1] as const;const normal=transformNormal4(scale,[1,1,0]);expect(normal[0]).toBeCloseTo(1/Math.sqrt(5),10);expect(normal[1]).toBeCloseTo(2/Math.sqrt(5),10);});
 it("rejects singular matrices and invalid vectors",()=>{const singular=[0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] as const;expect(()=>invert4(singular)).toThrow(/singular/);expect(()=>transformPoint4(identity4(),[NaN,0,0])).toThrow(/finite/);});
});
