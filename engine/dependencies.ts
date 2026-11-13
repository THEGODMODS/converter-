export type DependencyFile={path:string;kind:string;assetReferences?:string[];packageReferences?:string[]};
export type FaceDependency={source:string;reference:string;status:"resolved"|"missing"|"ambiguous";candidates:string[]};
function normalizeAsset(value:string):string{
 return value.split(String.fromCharCode(92)).join("/").replace(/^\/+/, "").replace(/^Assets\//i,"").replace(/\.(ftex|dds)$/i,"").toLowerCase();
}
/** Resolve semantic FMDL texture names and explicit FPK/FPKD package references without guessing between duplicate basenames. */
export function resolveFaceDependencies(files:DependencyFile[]):FaceDependency[]{
 const dependencies:FaceDependency[]=[];
 const textures=files.filter(file=>file.kind==="texture-pes2021"||file.kind==="texture-pes2017");
 for(const model of files.filter(file=>file.kind==="model-pes2021"&&file.assetReferences?.length)){
  for(const reference of model.assetReferences??[]){
   const normalized=normalizeAsset(reference),base=normalized.split("/").pop()??normalized;
   const exact=textures.filter(file=>normalizeAsset(file.path.split("!/").pop()??file.path)===normalized);
   const candidates=exact.length?exact:textures.filter(file=>(normalizeAsset(file.path.split("!/").pop()??file.path).split("/").pop()??"")===base);
   dependencies.push({source:model.path,reference,status:candidates.length===1?"resolved":candidates.length===0?"missing":"ambiguous",candidates:candidates.map(file=>file.path)});
  }
 }
 for(const archive of files.filter(file=>file.kind==="container-fpk"||file.kind==="container-fpkd")){
  for(const reference of archive.packageReferences??[]){
   const base=(reference.split(String.fromCharCode(92)).join("/").split("/").pop()??reference).toLowerCase();
   const candidates=files.filter(file=>(file.kind==="container-fpk"||file.kind==="container-fpkd")&&file.path.toLowerCase().split("/").pop()===base);
   dependencies.push({source:archive.path,reference,status:candidates.length===1?"resolved":candidates.length===0?"missing":"ambiguous",candidates:candidates.map(file=>file.path)});
  }
 }
 return dependencies;
}
