import {describe,expect,it} from "vitest";
import {buildCpk} from "../engine/packaging/cpk";
import {verifyPes2017FaceCpk} from "../engine/packaging/face-cpk-validation";

describe("PES 2017 nested face CPK verification",()=>{
  const faceFiles=[
    {path:"face.xml",data:Buffer.from("<config/>")},
    {path:"oral_face_high_win32.model",data:Buffer.from("legacy-model")},
    {path:"face_high.mtl",data:Buffer.from("<materials/>")},
  ];
  const teamArchive=(files=faceFiles)=>buildCpk([{
    path:"common/character0/model/character/face/real/71405.cpk",
    data:buildCpk(files),
  }]);
  it("accepts the Team Compiler outer CPK containing a valid nested player-face CPK",()=>{
    const result=verifyPes2017FaceCpk(teamArchive(),"71405");
    expect(result.outerInspection.valid).toBe(true);
    expect(result.faceInspection.valid).toBe(true);
    expect(result.faceCpkPath).toMatch(/71405\.cpk$/i);
    expect(result.faceXmlPath).toMatch(/face\.xml$/i);
    expect(result.faceModelPath).toMatch(/oral_face_high_win32\.model$/i);
    expect(result.faceMaterialPath).toMatch(/face_high\.mtl$/i);
  });
  it("rejects an outer CPK that contains no nested face CPK",()=>{
    expect(()=>verifyPes2017FaceCpk(buildCpk([{path:"readme.txt",data:Buffer.from("not a face")}]),"71405")).toThrow(/nested player-face CPK/i);
  });
  it("rejects a nested face CPK that lacks face.xml",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive(faceFiles.slice(1)),"71405")).toThrow(/face\.xml/i);
  });
  it("rejects a nested face CPK that lacks the converted head model",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive([faceFiles[0],faceFiles[2]]),"71405")).toThrow(/oral_face_high_win32\.model/i);
  });
  it("rejects a nested face CPK that lacks the head material set",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive(faceFiles.slice(0,2)),"71405")).toThrow(/face_high\.mtl/i);
  });
});
