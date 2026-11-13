import {describe,expect,it} from "vitest";
import {analyzeFacePackage} from "../engine/face-package";
describe("face package anatomy coverage",()=>{
 it("identifies facial parts and normal-map candidates from filenames",()=>{const result=analyzeFacePackage([{path:"face_high.fmdl",kind:"model-pes2021"},{path:"neck_high.fmdl",kind:"model-pes2021"},{path:"eye.fmdl",kind:"model-pes2021"},{path:"eyelid.fmdl",kind:"model-pes2021"},{path:"oral.fmdl",kind:"model-pes2021"},{path:"hair_high.fmdl",kind:"model-pes2021"},{path:"beard.fmdl",kind:"model-pes2021"},{path:"face_nrm.ftex",kind:"texture-pes2021"}]);expect(result.filter(x=>x.status==="detected").map(x=>x.role)).toEqual(["head","neck","eyes","eyelids","mouth","hair","beard","skin-normal"]);});
 it("keeps absent face parts visible as not-found instead of assuming success",()=>{const result=analyzeFacePackage([{path:"face_high.model",kind:"model-pes2017"}]);expect(result.find(x=>x.role==="head")?.status).toBe("detected");expect(result.find(x=>x.role==="mouth")?.status).toBe("not-found");});
});
