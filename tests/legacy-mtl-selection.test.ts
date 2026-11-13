import {describe,it,expect} from "vitest";
import {canonicalFoxModelStem,parseLegacyFaceXmlModelTypes,resolveLegacyMtlForModel} from "../electron/legacy-mtl-selection";
const file=(path:string)=>({path,kind:"material-pes2017"});
describe("PES 2017 MTL selection compatibility",()=>{
 it("matches oral and win32 model names to their legacy material stem",()=>{
  expect(resolveLegacyMtlForModel("Player/oral_face_high_win32.model",[file("Player/face.mtl"),file("Player/materials.mtl")])).toBe("Player/face.mtl");
 });
 it("prefers a model-local MTL before a better-named folder-level MTL",()=>{
  expect(resolveLegacyMtlForModel("Player/Hair/hair_high_win32.model",[file("Player/face_high.mtl"),file("Player/Hair/shared.mtl")])).toBe("Player/Hair/shared.mtl");
 });
 it("uses materials.mtl before the deterministic first candidate",()=>{
  expect(resolveLegacyMtlForModel("Player/unknown.model",[file("Player/zebra.mtl"),file("Player/materials.mtl"),file("Player/alpha.mtl")])).toBe("Player/materials.mtl");
  expect(resolveLegacyMtlForModel("Player/unknown.model",[file("Player/zebra.mtl"),file("Player/alpha.mtl")])).toBe("Player/alpha.mtl");
 });
 it("uses the face folder as a fallback when the model folder has no MTL",()=>{
  expect(resolveLegacyMtlForModel("Player/Hair/hair_high_win32.model",[file("Player/hair.mtl")])).toBe("Player/hair.mtl");
 });
 it("reads face_neck roles from face.xml and maps the paired face mesh separately",()=>{
  const types=parseLegacyFaceXmlModelTypes('<face><model type="face_neck" path="./face_high_win32.model"/><model type="parts" path="oral_face_high_win32.model"/></face>');
  const stems=new Set(["face_high_win32","oral_face_high_win32","hair_high_win32"]);
  expect(types.get("face_high_win32")).toBe("face_neck");
  expect(canonicalFoxModelStem("face_high_win32",types.get("face_high_win32"),stems)).toBe("face_neck");
  expect(canonicalFoxModelStem("oral_face_high_win32",types.get("oral_face_high_win32"),stems)).toBe("face_high");
  expect(canonicalFoxModelStem("hair_high_win32",undefined,stems)).toBe("hair_high");
 });
});
