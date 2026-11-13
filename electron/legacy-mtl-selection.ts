import path from "node:path";
export type LegacyMtlFile={path:string;kind?:string};
function folderOf(value:string):string{
 const folder=path.posix.dirname(value.replace(/\\/g,"/"));
 return folder==="."?"":folder;
}
function baseOf(value:string):string{return path.posix.basename(value.replace(/\\/g,"/"));}
function stemOf(value:string):string{
 const normalized=value.replace(/\\/g,"/");
 return path.posix.basename(normalized,path.posix.extname(normalized)).toLowerCase();
}
function foldedCompare(a:LegacyMtlFile,b:LegacyMtlFile):number{
 const left=baseOf(a.path).toLowerCase(),right=baseOf(b.path).toLowerCase();
 return left.localeCompare(right)||baseOf(a.path).localeCompare(baseOf(b.path));
}
function chooseInFolder(modelStem:string,candidates:LegacyMtlFile[]):LegacyMtlFile|null{
 if(!candidates.length)return null;
 const sorted=[...candidates].sort(foldedCompare);
 const named=sorted.find(file=>{const mtlStem=stemOf(file.path);return modelStem.startsWith(mtlStem)||modelStem.endsWith(mtlStem);});
 if(named)return named;
 return sorted.find(file=>baseOf(file.path).toLowerCase()==="materials.mtl")??sorted[0]??null;
}
/** Mirrors Unlimited Tool Works Team Compiler mtl_for(): model folder first, then face folder; name match, materials.mtl, then deterministic first MTL. */
export function resolveLegacyMtlForModel(modelPath:string,materialFiles:LegacyMtlFile[],modelFolder?:string):string|null{
 const normalizedModel=modelPath.replace(/\\/g,"/"),ownFolder=folderOf(normalizedModel),rawStem=stemOf(normalizedModel);
 const matchStem=rawStem.startsWith("oral_")&&rawStem.endsWith("_win32")?rawStem.slice(5,-6):rawStem;
 const inFolder=(folder:string)=>chooseInFolder(matchStem,materialFiles.filter(file=>(file.kind===undefined||file.kind==="material-pes2017")&&folderOf(file.path).toLowerCase()===folder.toLowerCase()));
 const own=inFolder(ownFolder);if(own)return own.path;
 const root=modelFolder===undefined?folderOf(normalizedModel):modelFolder==="."?"":modelFolder;
 if(root.toLowerCase()!==ownFolder.toLowerCase()){const parent=inFolder(root);if(parent)return parent.path;}
 return null;
}
export function parseLegacyFaceXmlModelTypes(xml:string):Map<string,string>{
 const result=new Map<string,string>();
 for(const tag of xml.matchAll(/<model\b([^>]*)>/gi)){
  const attributes:Record<string,string>={};
  for(const attribute of tag[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)){
   attributes[attribute[1].toLowerCase()]=attribute[3].replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
  }
  const modelPath=attributes.path??attributes.file??attributes.name,type=attributes.type;
  if(!modelPath||!type)continue;
  const normalized=modelPath.replace(/\\/g,"/").replace(/^\.\//,"");
  const stem=path.posix.basename(normalized,path.posix.extname(normalized)).toLowerCase();
  result.set(stem,type.toLowerCase());
 }
 return result;
}
export function canonicalFoxModelStem(sourceStem:string,xmlType:string|undefined,sourceStems:Set<string>):string{
 const stem=sourceStem.toLowerCase(),type=xmlType?.toLowerCase();
 if(type==="face_neck")return "face_neck";
 if(stem==="oral_face_high_win32"||stem==="oral_face_high")return "face_high";
 if(stem==="face_high_win32"||stem==="face_high")return sourceStems.has("oral_face_high_win32")||sourceStems.has("oral_face_high")?"face_neck":"face_high";
 if(stem==="hair_high_win32"||stem==="hair_high")return "hair_high";
 if(stem==="oral_hair_high_win32"||stem==="oral_hair_high")return sourceStems.has("hair_high_win32")||sourceStems.has("hair_high")?"hair_parts":"hair_high";
 if(stem.startsWith("oral_")&&stem.endsWith("_win32"))return stem.slice(5,-6);
 if(stem.endsWith("_win32"))return stem.slice(0,-6);
 if(stem.startsWith("oral_"))return stem.slice(5);
 return stem;
}
