import {describe,expect,it} from "vitest";
import {buildCpk} from "../engine/packaging/cpk";
import {verifyPes2017FaceCpk} from "../engine/packaging/face-cpk-validation";

function modelFixture():Buffer {
  // PES MODEL TOC points to the 8-byte preamble; StructArray begins at +8.
  const data=Buffer.alloc(48);
  data.write("MODEL\0\0\0",0,"binary");
  data.writeUInt32LE(24,8);
  data.writeUInt16LE(16,14);
  data.writeUInt32LE(12,32); // array-relative record offset
  data.writeUInt32LE(1,36);
  data.writeUInt32LE(4,40);
  data.writeUInt32LE(16,44); // first section, relative to array start
  return data;
}

function ddsFixture():Buffer {
  const data=Buffer.alloc(128);
  data.write("DDS ",0,"ascii");
  data.writeUInt32LE(124,4);
  data.writeUInt32LE(1,12);
  data.writeUInt32LE(1,16);
  data.writeUInt32LE(32,76);
  return data;
}

describe("PES 2017 nested face CPK verification",()=>{
  const xml=(model="./face_high_*.model",material="./face.mtl")=>Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <model level="0" type="face_neck" path="'+model+'" material="'+material+'"/>\n</config>');
  const mtl=(texture="./face.dds")=>Buffer.from('<materialset><material name="face"><sampler name="DiffuseMap" path="'+texture+'"/></material></materialset>');
  const faceFiles=[
    {path:"face.xml",data:xml()},
    {path:"face_high_win32.model",data:modelFixture()},
    {path:"face.mtl",data:mtl()},
    {path:"face.dds",data:ddsFixture()},
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
  it("accepts the exact upstream Team Compiler oral_face_high_win32.model output",()=>{
    const upstreamFiles=[
      {path:"common/character0/model/character/face/real/176104/face.xml",data:Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n<config>\r\n   <model level="0" type="face_neck" path="./oral_face_high_*.model" material="./face_high.mtl" />\r\n</config>')},
      {path:"common/character0/model/character/face/real/176104/oral_face_high_win32.model",data:modelFixture()},
      {path:"common/character0/model/character/face/real/176104/face_high.mtl",data:Buffer.from('<materialset><material name="face"><sampler name="DiffuseMap" path="model/character/uniform/common/714/05 - A/skin.dds"/></material></materialset>')},
    ];
    const outer=buildCpk([
      {path:"common/character0/model/character/face/real/176104.cpk",data:buildCpk(upstreamFiles)},
      {path:"common/character1/model/character/uniform/common/714/05 - A/skin.dds",data:ddsFixture()},
    ]);
    const result=verifyPes2017FaceCpk(outer,"176104");
    expect(result.faceModelPath).toMatch(/oral_face_high_win32\.model$/i);
    expect(result.faceMaterialPath).toMatch(/face_high\.mtl$/i);
    expect(result.referencedTextures).toContain("common/character1/model/character/uniform/common/714/05 - a/skin.dds");
  });
  it("rejects a face_high model that is paired with the wrong material in face.xml",()=>{
    const mismatched=[
      {path:"face.xml",data:Buffer.from('<?xml version="1.0"?><config><model path="./oral_face_high_*.model" material="./hair.mtl"/><model path="./oral_dummy_*.model" material="./face_high.mtl"/></config>')},
      {path:"oral_face_high_win32.model",data:modelFixture()},
      {path:"oral_dummy_win32.model",data:modelFixture()},
      {path:"hair.mtl",data:Buffer.from("<materialset></materialset>")},
      {path:"face_high.mtl",data:Buffer.from("<materialset></materialset>")},
    ];
    expect(()=>verifyPes2017FaceCpk(teamArchive(mismatched),"71405")).toThrow(/does not pair the face_high head mesh with its head material/i);
  });
  it("rejects a referenced model with an invalid PES 2017 MODEL header",()=>{
    const invalidFiles=faceFiles.map(file=>file.path==="face_high_win32.model"?{...file,data:Buffer.from("not-a-model")}:file);
    expect(()=>verifyPes2017FaceCpk(teamArchive(invalidFiles),"71405")).toThrow(/referenced PES 2017 model is invalid/i);
  });
  it("rejects a head model with an empty section table",()=>{
    const emptySections=Buffer.alloc(44);
    emptySections.write("MODEL\0\0\0",0,"binary");
    emptySections.writeUInt32LE(24,8);
    emptySections.writeUInt16LE(16,14);
    emptySections.writeUInt32LE(12,32);
    emptySections.writeUInt32LE(0,36);
    emptySections.writeUInt32LE(4,40);
    const invalidFiles=faceFiles.map(file=>file.path==="face_high_win32.model"?{...file,data:emptySections}:file);
    expect(()=>verifyPes2017FaceCpk(teamArchive(invalidFiles),"71405")).toThrow(/referenced PES 2017 model is invalid/i);
  });
  it("rejects a corrupt local DDS stored inside the nested face CPK",()=>{
    const invalidFiles=faceFiles.map(file=>file.path==="face.dds"?{...file,data:Buffer.from("not-a-dds")}:file);
    expect(()=>verifyPes2017FaceCpk(teamArchive(invalidFiles),"71405")).toThrow(/local player texture is not a valid DDS/i);
  });
  it("rejects a corrupt DDS stored at a player-owned outer texture path",()=>{
    const upstreamFiles=[
      {path:"common/character0/model/character/face/real/176104/face.xml",data:Buffer.from('<?xml version="1.0"?><config><model path="./oral_face_high_*.model" material="./face_high.mtl"/></config>')},
      {path:"common/character0/model/character/face/real/176104/oral_face_high_win32.model",data:modelFixture()},
      {path:"common/character0/model/character/face/real/176104/face_high.mtl",data:Buffer.from('<materialset><material name="face"><sampler name="DiffuseMap" path="model/character/uniform/common/714/05 - A/skin.dds"/></material></materialset>')},
    ];
    const outer=buildCpk([
      {path:"common/character0/model/character/face/real/176104.cpk",data:buildCpk(upstreamFiles)},
      {path:"common/character1/model/character/uniform/common/714/05 - A/skin.dds",data:Buffer.from("not-a-dds")},
    ]);
    expect(()=>verifyPes2017FaceCpk(outer,"176104")).toThrow(/not a valid DDS/i);
  });
  it("rejects a missing player-owned texture referenced by the nested face MTL",()=>{
    const upstreamFiles=[
      {path:"common/character0/model/character/face/real/176104/face.xml",data:Buffer.from('<?xml version="1.0"?><config><model path="./oral_face_high_*.model" material="./face_high.mtl"/></config>')},
      {path:"common/character0/model/character/face/real/176104/oral_face_high_win32.model",data:modelFixture()},
      {path:"common/character0/model/character/face/real/176104/face_high.mtl",data:Buffer.from('<materialset><material name="face"><sampler name="DiffuseMap" path="model/character/uniform/common/714/05 - A/skin.dds"/></material></materialset>')},
    ];
    const outer=buildCpk([{path:"common/character0/model/character/face/real/176104.cpk",data:buildCpk(upstreamFiles)}]);
    expect(()=>verifyPes2017FaceCpk(outer,"176104")).toThrow(/player texture reference does not resolve in the outer team CPK/i);
  });
  it("accepts a six-digit real PES player ID",()=>{
    const result=verifyPes2017FaceCpk(teamArchive(faceFiles,"176104"),"176104");
    expect(result.faceCpkPath).toMatch(/176104\.cpk$/i);
  });
  it("rejects a nested face CPK whose internal folder still uses the temporary compiler ID",()=>{
    const wrongFolderFiles=faceFiles.map(file=>({...file,path:"common/character0/model/character/face/real/70101/"+file.path}));
    const wrongOuter=buildCpk([{
      path:"common/character0/model/character/face/real/176104.cpk",
      data:buildCpk(wrongFolderFiles),
    }]);
    expect(()=>verifyPes2017FaceCpk(wrongOuter,"176104")).toThrow(/internal folder .*70101, expected common\/character0\/model\/character\/face\/real\/176104/i);
  });
  it("rejects a nested face CPK stored outside the PES face real directory",()=>{
    const misplaced=buildCpk([{
      path:"common/character0/model/character/face/custom/176104.cpk",
      data:buildCpk(faceFiles.map(file=>({...file,path:"common/character0/model/character/face/custom/176104/"+file.path}))),
    }]);
    expect(()=>verifyPes2017FaceCpk(misplaced,"176104")).toThrow(/no nested player-face CPK/i);
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
