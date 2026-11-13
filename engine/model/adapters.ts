import type { FaceScene } from "./ir";
export type ConversionDirection="pes2021-to-pes2017"|"pes2017-to-pes2021";
export type ConversionStep={id:string;label:string;status:"ready"|"planned"|"blocked";detail:string};
export type ConversionPlan={direction:ConversionDirection;source:"PES 2017"|"PES 2021";target:"PES 2017"|"PES 2021";steps:ConversionStep[];blockers:string[];warnings:string[];executable:boolean};
export interface FaceModelAdapter{
 readonly id:"pes2017-model"|"pes2021-fmdl";
 readonly generation:"pes2017"|"pes2021";
 inspect(data:Buffer):{valid:boolean;version?:number;warnings:string[]};
 decode(data:Buffer,companions:ReadonlyMap<string,Buffer>):Promise<FaceScene>;
 encode(scene:FaceScene,companions:ReadonlyMap<string,Buffer>):Promise<Map<string,Buffer>>;
}
export function createConversionPlan(direction:ConversionDirection,detected:"pes2017"|"pes2021"|"mixed"|"unknown",hasModel:boolean,hasTextures:boolean):ConversionPlan{
 const from=direction==="pes2021-to-pes2017"?"pes2021":"pes2017",to=from==="pes2021"?"pes2017":"pes2021";
 const source=from==="pes2021"?"PES 2021":"PES 2017",target=to==="pes2021"?"PES 2021":"PES 2017",blockers:string[]=[],warnings:string[]=[];
 if(detected!==from)blockers.push(detected==="mixed"?"The project contains both PES generations. Select a clean source face folder.":detected==="unknown"?"Source generation could not be detected from valid binary signatures.":"Selected conversion direction does not match the detected source generation.");
 if(!hasModel)blockers.push("A valid source face model is required.");
 if(!hasTextures)warnings.push("No valid texture assets were detected; face appearance may be incomplete.");
 blockers.push("Whole-face package assembly, dependency relinking, generation-specific model adapters and target-game validation are not yet implemented.");
 return {direction,source,target,steps:[
  {id:"intake",label:"Project inventory and source detection",status:detected===from?"ready":"blocked",detail:"Validated file signatures and project inventory."},
  {id:"texture",label:"Texture format conversion",status:"ready",detail:"DDS ↔ FTEX container conversion is available for supported formats."},
  {id:"geometry",label:"Single-model semantic conversion",status:"ready",detail:"Pinned native model_convert engine handles supported FMDL ↔ MODEL/MTL translation and version-specific skeleton retargeting; losses are reported."},
  {id:"preview",label:"3D preview and target validation",status:"planned",detail:"Requires a validated target-format model."},
  {id:"package",label:"Complete face package assembly",status:"blocked",detail:"Multi-model conversion, texture/material relinking, face_diff mapping and target-game validation must pass before packaging."}
 ],blockers,warnings,executable:false};
}
