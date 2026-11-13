import {describe,expect,it} from "vitest";
import {buildCpk} from "../engine/packaging/cpk";
import {verifyPes2017FaceCpk} from "../engine/packaging/face-cpk-validation";

describe("PES 2017 face CPK verification",()=>{
  const core=[
    {path:"common/character0/model/character/face/real/123/face.xml",data:Buffer.from("<config/>")},
    {path:"common/character0/model/character/face/real/123/oral_face_high_win32.model",data:Buffer.from("legacy-model")},
    {path:"common/character0/model/character/face/real/123/face_high.mtl",data:Buffer.from("<materials/>")},
  ];
  it("accepts a readable archive containing the required legacy face assets",()=>{
    const result=verifyPes2017FaceCpk(buildCpk(core));
    expect(result.inspection.valid).toBe(true);
    expect(result.faceXmlPath).toMatch(/face\.xml$/i);
    expect(result.faceModelPath).toMatch(/oral_face_high_win32\.model$/i);
    expect(result.faceMaterialPath).toMatch(/face_high\.mtl$/i);
  });
  it("rejects a CPK that lacks the generated face.xml",()=>{
    expect(()=>verifyPes2017FaceCpk(buildCpk(core.slice(1)))).toThrow(/face\.xml/i);
  });
  it("rejects a CPK that lacks the converted face_high model",()=>{
    expect(()=>verifyPes2017FaceCpk(buildCpk([core[0],core[2]]))).toThrow(/face_high model/i);
  });
  it("rejects a CPK that lacks the face_high material set",()=>{
    expect(()=>verifyPes2017FaceCpk(buildCpk(core.slice(0,2)))).toThrow(/face_high material/i);
  });
});
