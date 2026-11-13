import {describe,it,expect} from "vitest";
import {resolveFaceDependencies} from "../engine/dependencies";
describe("face package dependency resolver",()=>{
 it("resolves FMDL texture names against sourceimages FTEX assets",()=>{
  const result=resolveFaceDependencies([
   {path:"#Win/face.fpk!/face_high.fmdl",kind:"model-pes2021",assetReferences:["/Assets/pes16/model/character/face/real/123/sourceimages/#windx11/face_bsm_alp.ftex"]},
   {path:"sourceimages/#windx11/face_bsm_alp.ftex",kind:"texture-pes2021"}
  ]);
  expect(result[0].status).toBe("resolved");
  expect(result[0].candidates).toEqual(["sourceimages/#windx11/face_bsm_alp.ftex"]);
 });
 it("does not guess when two textures share a basename",()=>{
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
});
