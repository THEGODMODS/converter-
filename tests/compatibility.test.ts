import {describe,it,expect} from "vitest";
import {assessFaceConversion} from "../engine/compatibility";
const base={detectedGame:"pes2021" as const,models:2,textures:4,files:[
 {path:"face.fpk!/face_high.fmdl",kind:"model-pes2021"},
 {path:"face.fpk!/hair_high.fmdl",kind:"model-pes2021"},
 {path:"sourceimages/face.ftex",kind:"texture-pes2021"},
 {path:"face_diff.bin",kind:"face-diff"}
]};
describe("direction-aware conversion assessment",()=>{
 it("recognizes PES 2021 input but blocks output until target writer and rig retargeting exist",()=>{
  const result=assessFaceConversion(base,"pes2021");
  expect(result.target).toBe("pes2017");
  expect(result.checks.find(x=>x.label==="Source model files")?.status).toBe("pass");
  expect(result.gate).toBe("blocked");
  expect(result.blockingReasons.join(" ")).toContain("target model writer");
 });
 it("blocks the reverse route when the selected source generation does not match",()=>{
  const result=assessFaceConversion(base,"pes2017");
  expect(result.target).toBe("pes2021");
  expect(result.checks.find(x=>x.label==="Source generation")?.status).toBe("blocked");
  expect(result.gate).toBe("blocked");
 });
 it("warns when PES 2017 material definitions are missing",()=>{
  const project={...base,detectedGame:"pes2017" as const,files:[{path:"face.model",kind:"model-pes2017"},{path:"face.dds",kind:"texture-pes2017"}]};
  const result=assessFaceConversion(project,"pes2017");
  expect(result.warnings.some(x=>x.includes("MTL material definitions"))).toBe(true);
 });
});
