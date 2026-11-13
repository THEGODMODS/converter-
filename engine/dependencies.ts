import path from "node:path";
export type DependencyFile={path:string;kind:string;sha256?:string;assetReferences?:string[];packageReferences?:string[]};
export type FaceDependency={source:string;reference:string;status:"resolved"|"missing"|"ambiguous";candidates:string[]};
function normalizeAsset(value:string):string{
 return value.split(String.fromCharCode(92)).join("/").replace(/^\/+/, "").replace(/^Assets\//i,"").replace(/\.(ftex|dds)$/i,"").toLowerCase();
}
function suffixScore(candidate:string,requested:string):number{
 const a=candidate.split("/"),b=requested.split("/");let score=0;
 while(score<a.length&&score<b.length&&a[a.length-1-score]===b[b.length-1-score])score++;
 return score;
}
function statusFor(candidates:DependencyFile[]):FaceDependency["status"]{
 if(!candidates.length)return "missing";
 if(candidates.length===1)return "resolved";
 const hashes=candidates.map(file=>file.sha256);
 return hashes.every(Boolean)&&new Set(hashes).size===1?"resolved":"ambiguous";
}
/** Resolve semantic FMDL texture names and explicit FPK/FPKD package references without guessing between duplicate basenames. */
export function resolveFaceDependencies(files:DependencyFile[]):FaceDependency[]{
 const dependencies:FaceDependency[]=[];
 const textures=files.filter(file=>file.kind==="texture-pes2021"||file.kind==="texture-pes2017");
 for(const model of files.filter(file=>(file.kind==="model-pes2021"||file.kind==="material-pes2017")&&file.assetReferences?.length)){
  for(const reference of model.assetReferences??[]){
   const sourcePath=reference.replace(/\\/g,"/");
   if(/^\/Assets\/pes16\/model\/character\/common\/sourceimages\/dummy_(?:nrm|srm)\.(?:ftex|dds|tga)$/i.test(sourcePath))continue;
   const normalized=normalizeAsset(reference),base=normalized.split("/").pop()??normalized;
   const relative=model.kind==="material-pes2017"?normalizeAsset(path.posix.join(path.posix.dirname(model.path.split("!/").pop()??model.path),reference)):normalized;
   const escapesRoot=model.kind==="material-pes2017"&&(relative===".."||relative.startsWith("../"));
   const exact=escapesRoot?[]:textures.filter(file=>{const candidate=normalizeAsset(file.path.split("!/").pop()??file.path);return candidate===relative||candidate===normalized;});
   let candidates=exact;
   if(!candidates.length&&!escapesRoot){
    const scored=textures.map(file=>({file,score:suffixScore(normalizeAsset(file.path.split("!/").pop()??file.path),relative.startsWith("../")?"":relative)||suffixScore(normalizeAsset(file.path.split("!/").pop()??file.path),normalized)})).filter(item=>item.score>0);
    const best=scored.length?Math.max(...scored.map(item=>item.score)):0;
    candidates=best?scored.filter(item=>item.score===best).map(item=>item.file):textures.filter(file=>(normalizeAsset(file.path.split("!/").pop()??file.path).split("/").pop()??"")===base);
   }
   dependencies.push({source:model.path,reference,status:statusFor(candidates),candidates:candidates.map(file=>file.path)});
  }
 }
 for(const archive of files.filter(file=>file.kind==="container-fpk"||file.kind==="container-fpkd")){
  for(const reference of archive.packageReferences??[]){
   const base=(reference.split(String.fromCharCode(92)).join("/").split("/").pop()??reference).toLowerCase();
   const candidates=files.filter(file=>(file.kind==="container-fpk"||file.kind==="container-fpkd")&&file.path.toLowerCase().split("/").pop()===base);
   dependencies.push({source:archive.path,reference,status:statusFor(candidates),candidates:candidates.map(file=>file.path)});
  }
 }
 return dependencies;
}
