import {describe,it,expect} from "vitest";
import {writeFpkArchive} from "../engine/formats/fpk";
import {createDefaultFaceDiffV5} from "../engine/formats/face-diff";
import {verifyPes2021FaceFpk} from "../engine/packaging/face-fpk-validation";
const root="Assets/pes16/model/character/face/real/12345/";
function packageBytes(options:{hair?:boolean;diff?:Buffer|null;textures?:boolean}={}){
 const modelEntries=[{name:root+"face_high.fmdl",data:Buffer.from("FMDL-face")}];
 if(options.hair!==false)modelEntries.push({name:root+"hair_high.fmdl",data:Buffer.from("FMDL-hair")});
 if(options.diff!==null)modelEntries.push({name:root+"face_diff.bin",data:options.diff??createDefaultFaceDiffV5()});
 const fpk=writeFpkArchive("fpk",modelEntries);
 const fpkd=writeFpkArchive("fpkd",options.textures===false?[{name:root+"notes.bin",data:Buffer.from("not a texture")}]:[{name:root+"sourceimages/face.ftex",data:Buffer.from("FTEX-fixture")}]);
 return {fpk,fpkd};
}
describe("PES 2021 paired face FPK validation",()=>{
 it("requires head and hair models, a valid FACE diff and an FPKD texture",()=>{const bytes=packageBytes(),result=verifyPes2021FaceFpk(bytes.fpk,bytes.fpkd);expect(result.faceDiffVersion).toBe(5);expect(result.faceModelPaths).toHaveLength(2);expect(result.texturePaths).toHaveLength(1);});
 it("rejects a missing hair model",()=>{const bytes=packageBytes({hair:false});expect(()=>verifyPes2021FaceFpk(bytes.fpk,bytes.fpkd)).toThrow(/hair_high\.fmdl/i);});
 it("rejects a missing FACE diff",()=>{const bytes=packageBytes({diff:null});expect(()=>verifyPes2021FaceFpk(bytes.fpk,bytes.fpkd)).toThrow(/face_diff\.bin/i);});
 it("rejects an FPKD without FTEX textures",()=>{const bytes=packageBytes({textures:false});expect(()=>verifyPes2021FaceFpk(bytes.fpk,bytes.fpkd)).toThrow(/no FTEX textures/i);});
 it("rejects malformed FACE diff data",()=>{const bytes=packageBytes({diff:Buffer.alloc(960)});expect(()=>verifyPes2021FaceFpk(bytes.fpk,bytes.fpkd)).toThrow(/FACE/i);});
});
