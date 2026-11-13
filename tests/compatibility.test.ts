import {describe,it,expect} from "vitest";
import {assessFaceConversion} from "../engine/compatibility";
const base={detectedGame:"pes2021" as const,models:2,textures:4,files:[
 {path:"face.fpk!/face_high.fmdl",kind:"model-pes2021"},
 {path:"face.fpk!/hair_high.fmdl",kind:"model-pes2021"},
 {path:"sourceimages/face.ftex",kind:"texture-pes2021"},
 {path:"face_diff.bin",kind:"face-diff"}
]};
describe("first-release conversion assessment",()=>{
 it("recognizes PES 2021 input and the integrated PES 2017 package route",()=>{
  const result=assessFaceConversion(base,"pes2021");
  expect(result.target).toBe("pes2017");
  expect(result.checks.find(x=>x.label==="Source model files")?.status).toBe("pass");
  expect(result.checks.find(x=>x.label==="Required face_high head model")?.status).toBe("pass");
  expect(result.gate).toBe("inspectable");
  expect(result.checks.find(x=>x.label==="PES 2021 → PES 2017 package compiler")?.status).toBe("pass");
  expect(result.checks.find(x=>x.label==="Nested face CPK verification")?.status).toBe("warning");
  expect(result.blockingReasons).toHaveLength(0);
 });
 it("blocks the reverse route because it is deferred from the first release",()=>{
  const result=assessFaceConversion(base,"pes2017");
  expect(result.target).toBe("pes2021");
  expect(result.checks.find(x=>x.label==="Source generation")?.status).toBe("blocked");
  expect(result.checks.find(x=>x.label==="PES 2017 → PES 2021 package compiler")?.status).toBe("blocked");
  expect(result.gate).toBe("blocked");
 });
 it("blocks a PES 2021 project without the required face_high head model",()=>{
  const project={...base,files:base.files.filter(file=>!file.path.toLowerCase().endsWith("face_high.fmdl"))};
  const result=assessFaceConversion(project,"pes2021");
  expect(result.gate).toBe("blocked");
  expect(result.blockingReasons.join(" ")).toContain("face_high");
 });
 it("keeps PES 2017 material diagnostics available while the reverse route is deferred",()=>{
  const project={...base,detectedGame:"pes2017" as const,files:[{path:"face.model",kind:"model-pes2017"},{path:"face.mtl",kind:"material-pes2017"},{path:"face.dds",kind:"texture-pes2017"}]};
  const result=assessFaceConversion(project,"pes2017");
  expect(result.checks.find(x=>x.label==="PES 2017 material definitions")?.status).toBe("pass");
  expect(result.warnings.some(x=>x.includes("without them texture/shader bindings"))).toBe(false);
 });
 it("warns when PES 2017 material definitions are missing",()=>{
  const project={...base,detectedGame:"pes2017" as const,files:[{path:"face.model",kind:"model-pes2017"},{path:"face.dds",kind:"texture-pes2017"}]};
  const result=assessFaceConversion(project,"pes2017");
  expect(result.warnings.some(x=>x.includes("MTL material definitions"))).toBe(true);
 });
});
