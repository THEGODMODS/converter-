import {parseFpkArchive} from "../formats/fpk";
import {inspectFaceDiff} from "../formats/face-diff";
export type Pes2021FaceFpkVerification={fpk:ReturnType<typeof parseFpkArchive>;fpkd:ReturnType<typeof parseFpkArchive>;faceDiffVersion:number;faceDiffBytes:number;faceDiffPath:string;faceModelPaths:string[];texturePaths:string[];warnings:string[]};
function uniqueByBasename(entries:ReturnType<typeof parseFpkArchive>["entries"],basename:string){
 const matches=entries.filter(entry=>entry.name.split("/").pop()?.toLowerCase()===basename.toLowerCase());
 if(matches.length!==1)throw new Error(`PES 2021 face FPK must contain exactly one ${basename}; found ${matches.length}.`);
 return matches[0];
}
export function verifyPes2021FaceFpk(fpkBytes:Buffer,fpkdBytes:Buffer):Pes2021FaceFpkVerification{
 const fpk=parseFpkArchive(fpkBytes),fpkd=parseFpkArchive(fpkdBytes);
 if(fpk.kind!=="fpk")throw new Error("The PES 2021 face model archive is not an FPK.");
 if(fpkd.kind!=="fpkd")throw new Error("The PES 2021 face texture archive is not an FPKD.");
 const faceHigh=uniqueByBasename(fpk.entries,"face_high.fmdl"),hairHigh=uniqueByBasename(fpk.entries,"hair_high.fmdl"),faceDiff=uniqueByBasename(fpk.entries,"face_diff.bin");
 const models=fpk.entries.filter(entry=>entry.name.toLowerCase().endsWith(".fmdl"));
 if(!models.length)throw new Error("The PES 2021 face FPK contains no FMDL models.");
 const textures=fpkd.entries.filter(entry=>entry.name.toLowerCase().endsWith(".ftex"));
 if(!textures.length)throw new Error("The paired PES 2021 face FPKD contains no FTEX textures.");
 if(textures.length!==fpkd.entries.length)throw new Error("The PES 2021 face FPKD contains non-FTEX entries.");
 const allPaths=new Set<string>();
 for(const entry of [...fpk.entries,...fpkd.entries]){
  const key=entry.name.toLowerCase();
  if(allPaths.has(key))throw new Error("The paired FPK/FPKD contains a duplicate path: "+entry.name);
  allPaths.add(key);
  if(!entry.data.length)throw new Error("The paired FPK/FPKD contains an empty asset: "+entry.name);
 }
 const diff=inspectFaceDiff(faceDiff.data),warnings=[...diff.warnings];
 if(diff.version===4)warnings.push("Legacy FACE diff v4 was preserved for PES 2021; the runtime uses its legacy eye-asset path.");
 return {fpk,fpkd,faceDiffVersion:diff.version,faceDiffBytes:diff.fileBytes,faceDiffPath:faceDiff.name,faceModelPaths:[faceHigh.name,hairHigh.name],texturePaths:textures.map(entry=>entry.name),warnings};
}
