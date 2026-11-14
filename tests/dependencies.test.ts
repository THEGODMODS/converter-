import {describe,it,expect} from "vitest";
import {matchTextureFiles,resolveFaceDependencies} from "../engine/dependencies";
describe("face package dependency resolver",()=>{
 it("resolves FMDL texture names against sourceimages FTEX assets",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk!/face_high.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/face/real/123/sourceimages//face_bsm_alp.ftex"]},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["sourceimages/#windx11/face_bsm_alp.ftex"]);
 });
 it("prefers the exact FTEX extension when a matching DDS companion exists",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk!/face_high.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/face/real/123/sourceimages//face_bsm_alp.ftex"]},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021",sha256:"ftex"},
   {path:"sourceimages/#windx11/face_bsm_alp.dds",kind:"texture-pes2017",sha256:"dds"},
   {path:"backup/face_bsm_alp.dds",kind:"texture-pes2017",sha256:"backup"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["sourceimages/#windx11/face_bsm_alp.ftex"]);
 });
 it("resolves the real PES 2021 FMDL DDS reference against the DDS side of a DDS/FTEX pair",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk!/face_high.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/face/real/176104/sourceimages//face_bsm_alp.dds"]},
   {path:"sourceimages/#windx11/face_bsm_alp.dds",kind:"texture-pes2017",sha256:"dds"},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021",sha256:"ftex"},
   {path:"backup/face_bsm_alp.dds",kind:"texture-pes2017",sha256:"backup"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["sourceimages/#windx11/face_bsm_alp.dds"]);
 });
 it("classifies PES common sourceimages as external game dependencies",()=>{
  const result=resolveFaceDependencies([
   {path:"face_high.fmdl",kind:"model-pes2021",assetReferences:[
    "/Assets/pes16/model/character/common/sourceimages/head_wet_cbm.dds",
    "/Assets/pes16/model/character/common/sourceimages/dummy_nrm.tga",
    "/Assets/pes16/model/character/face/real/176104/sourceimages//face_bsm_alp.dds"
   ]},
   {path:"sourceimages/face_bsm_alp.dds",kind:"texture-pes2017",sha256:"dds"}
  ]);
  expect(result.map(item=>item.status)).toEqual(["external","external","resolved"]);
  expect(result[0].candidates).toEqual([]);
 });
 it("matches DDS references to DDS assets without confusing them with FTEX companions",()=>{
  const result=resolveFaceDependencies([
   {path:"face.mtl",kind:"material-pes2017",assetReferences:["face_bsm_alp.dds"]},
   {path:"face_bsm_alp.dds",kind:"texture-pes2017",sha256:"dds"},
   {path:"face_bsm_alp.ftex",kind:"texture-pes2021",sha256:"ftex"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["face_bsm_alp.dds"]);
 });
 it("does not substitute another texture format when the referenced extension is missing",()=>{
  const result=resolveFaceDependencies([
   {path:"face.fmdl",kind:"model-pes2021",assetReferences:["face_bsm_alp.ftex"]},
   {path:"face_bsm_alp.dds",kind:"texture-pes2017",sha256:"dds"}
  ]);
  expect(result[0].status).toBe("missing");
 });
 it("classifies built-in Fox dummy normal and specular textures as external",()=>{const result=resolveFaceDependencies([{path:"face.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/common/sourceimages/dummy_nrm.ftex","/Assets/pes16/model/character/common/sourceimages/dummy_srm.tga"]}]);expect(result.map(item=>item.status)).toEqual(["external","external"]);});
 it("resolves relative MTL sampler paths against the material file directory",()=>{const result=resolveFaceDependencies([{path:"#Win/face.mtl",kind:"material-pes2017",assetReferences:["./face_c.dds","textures/face_n.dds"]},{path:"#Win/face_c.dds",kind:"texture-pes2017"},{path:"#Win/textures/face_n.dds",kind:"texture-pes2017"}]);expect(result.map(item=>item.status)).toEqual(["resolved","resolved"]);expect(result[0].candidates).toEqual(["#Win/face_c.dds"]);});
 it("does not basename-match MTL paths that escape the face project root",()=>{const result=resolveFaceDependencies([{path:"#Win/face.mtl",kind:"material-pes2017",assetReferences:["../../outside/face.dds"]},{path:"backup/face.dds",kind:"texture-pes2017"}]);expect(result[0].status).toBe("missing");expect(result[0].candidates).toEqual([]);});
 it("does not guess when two textures share a basename and extension",()=>{
  const result=resolveFaceDependencies([
   {path:"face.fmdl",kind:"model-pes2021",assetReferences:["face_bsm_alp.ftex"]},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021"},
   {path:"backup/face_bsm_alp.ftex",kind:"texture-pes2021"}
  ]);
  expect(result[0].status).toBe("ambiguous");
 });
 it("reports absent package references rather than silently dropping them",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk",kind:"container-fpk",packageReferences:["/Assets/pes16/model/character/face/real/123/face_extra.fpkd"]}
  ]);
  expect(result[0].status).toBe("missing");
 });
 it("resolves a companion package by exact filename",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk",kind:"container-fpk",packageReferences:["face.fpkd"]},
   {path:"#Win/face.fpkd",kind:"container-fpkd"}
  ]);
  expect(result[0].status).toBe("resolved");
 });
 it("prefers the longest matching source path when texture basenames repeat",()=>{
  const result=resolveFaceDependencies([
   {path:"face.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/face/real/123/sourceimages//face_bsm_alp.ftex"]},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021"},
   {path:"backup/face_bsm_alp.ftex",kind:"texture-pes2021"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["sourceimages/#windx11/face_bsm_alp.ftex"]);
 });
 it("accepts byte-identical duplicate texture copies as one unambiguous dependency",()=>{
  const result=resolveFaceDependencies([
   {path:"face.fmdl",kind:"model-pes2021",assetReferences:["face_bsm_alp.ftex"]},
   {path:"sourceimages/face_bsm_alp.ftex",kind:"texture-pes2021",sha256:"same-hash"},
   {path:"backup/face_bsm_alp.ftex",kind:"texture-pes2021",sha256:"same-hash"}
  ]);
  expect(result[0].status).toBe("resolved");
 });
 it("uses the same extension-aware matching for preview texture candidates",()=>{
  const matches=matchTextureFiles([
   {path:"sourceimages/#windx11/face_bsm_alp.dds"},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex"}
  ],"/Assets/pes16/model/character/face/real/123/sourceimages//face_bsm_alp.ftex");
  expect(matches.map(file=>file.path)).toEqual(["sourceimages/#windx11/face_bsm_alp.ftex"]);
 });
});
