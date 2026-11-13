import {describe,expect,it} from "vitest";
import {buildCpk} from "../engine/packaging/cpk";
import {verifyPes2017FaceCpk} from "../engine/packaging/face-cpk-validation";

describe("PES 2017 nested face CPK verification",()=>{
  const xml=(model="./face_high_*.model",material="./face.mtl")=>Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <model level="0" type="face_neck" path="'+model+'" material="'+material+'"/>\n</config>');
  const mtl=(texture="./face.dds")=>Buffer.from('<materialset><material name="face"><sampler name="DiffuseMap" path="'+texture+'"/></material></materialset>');
  const faceFiles=[
    {path:"face.xml",data:xml()},
    {path:"face_high_win32.model",data:Buffer.from("legacy-model")},
    {path:"face.mtl",data:mtl()},
    {path:"face.dds",data:Buffer.from("texture")},
  ];
  const faceDirectory="common/character0/model/character/face/real/71405/";
  const teamArchive=(files=faceFiles,playerId="71405")=>buildCpk([{
    path:"common/character0/model/character/face/real/"+playerId+".cpk",
    data:buildCpk(files.map(file=>({...file,path:faceDirectory.replace("71405",playerId)+file.path}))),
  }]);
  it("accepts Team Compiler face_high wildcard references and validates their material texture",()=>{
    const result=verifyPes2017FaceCpk(teamArchive(),"71405");
    expect(result.outerInspection.valid).toBe(true);
    expect(result.faceInspection.valid).toBe(true);
    expect(result.faceCpkPath).toMatch(/71405\.cpk$/i);
    expect(result.faceXmlPath).toMatch(/face\.xml$/i);
    expect(result.faceModelPath).toMatch(/face_high_win32\.model$/i);
    expect(result.faceMaterialPath).toMatch(/face\.mtl$/i);
    expect(result.referencedModels.some(path=>path.endsWith("/face_high_win32.model"))).toBe(true);
    expect(result.referencedMaterials.some(path=>path.endsWith("/face.mtl"))).toBe(true);
    expect(result.referencedTextures.some(path=>path.endsWith("/face.dds"))).toBe(true);
  });
  it("accepts a six-digit real PES player ID",()=>{
    const result=verifyPes2017FaceCpk(teamArchive(faceFiles,"176104"),"176104");
    expect(result.faceCpkPath).toMatch(/176104\.cpk$/i);
  });
  it("rejects an outer CPK that contains no nested face CPK",()=>{
    expect(()=>verifyPes2017FaceCpk(buildCpk([{path:"readme.txt",data:Buffer.from("not a face")}]),"71405")).toThrow(/nested player-face CPK/i);
  });
  it("rejects a nested face CPK that lacks face.xml",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive(faceFiles.slice(1)),"71405")).toThrow(/face\.xml/i);
  });
  it("rejects XML model references that do not resolve in the nested CPK",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive([{...faceFiles[0],data:xml("./oral_missing_*.model")},...faceFiles.slice(1)]),"71405")).toThrow(/model reference does not resolve/i);
  });
  it("rejects XML material references that do not resolve in the nested CPK",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive([{...faceFiles[0],data:xml("./face_high_*.model","./missing.mtl")},...faceFiles.slice(1)]),"71405")).toThrow(/material reference does not resolve/i);
  });
  it("rejects missing local textures referenced by the head material",()=>{
    expect(()=>verifyPes2017FaceCpk(teamArchive(faceFiles.filter(file=>file.path!=="face.dds")),"71405")).toThrow(/texture reference does not resolve/i);
  });
  it("rejects a face XML that omits a material attribute",()=>{
    const invalid=Buffer.from('<?xml version="1.0"?><config><model path="./face_high_*.model"/></config>');
    expect(()=>verifyPes2017FaceCpk(teamArchive([{...faceFiles[0],data:invalid},...faceFiles.slice(1)]),"71405")).toThrow(/both path and material/i);
  });
  it("rejects malformed or incomplete face XML",()=>{
    const invalid=Buffer.from('<?xml version="1.0"?><config><model path="./face_high_*.model" material="./face.mtl">');
    expect(()=>verifyPes2017FaceCpk(teamArchive([{...faceFiles[0],data:invalid},...faceFiles.slice(1)]),"71405")).toThrow(/complete UTF-8 config document/i);
  });
});
