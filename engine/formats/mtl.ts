import {inflateSync} from "node:zlib";

export type Pes2017Sampler={name:string;path:string;srgb:boolean|null;minFilter:string|null;magFilter:string|null;mipFilter:string|null;uAddress:string|null;vAddress:string|null;wAddress:string|null;maxAnisotropy:number|null};
export type Pes2017Material={name:string;shader:string;samplers:Pes2017Sampler[]};
export type Pes2017MaterialSet={materials:Pes2017Material[];wasCompressed:boolean;warnings:string[]};

function decodeXmlText(value:string):string{
 return value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function attributes(tag:string):Record<string,string>{
 const result:Record<string,string>={};
 const pattern=/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
 for(let match=pattern.exec(tag);match;match=pattern.exec(tag)){const key=match[1].toLowerCase();if(key in result)throw new Error("PES MTL contains a duplicate XML attribute: "+key);result[key]=decodeXmlText(match[2]??match[3]??"");}
 return result;
}
function optional(value:string|undefined):string|null{return value===undefined?null:value;}
function bool(value:string|undefined,label:string):boolean|null{
 if(value===undefined)return null;if(value==="1"||value.toLowerCase()==="true")return true;if(value==="0"||value.toLowerCase()==="false")return false;throw new Error("PES MTL "+label+" must be 0, 1, true or false.");
}
function safePath(value:string):string{
 const path=value.replace(/\\/g,"/").trim();
 if(!path||path.includes("\0")||/^[a-z]:/i.test(path)||path.startsWith("/")||path.split("/").some(part=>part===".."||part==="."))throw new Error("PES MTL sampler path is empty, absolute or escapes its material directory: "+value);
 return path;
}
export function parsePes2017Mtl(input:Buffer):Pes2017MaterialSet{
 if(input.length===0||input.length>32*1024*1024)throw new Error("PES MTL is empty or exceeds the 32 MiB safety limit.");
 let xml=input.toString("utf8"),wasCompressed=false;
 if(!xml.trimStart().startsWith("<")){
  try{xml=inflateSync(input,{maxOutputLength:64*1024*1024}).toString("utf8");wasCompressed=true;}
  catch{throw new Error("PES MTL is neither supported XML nor a valid zlib-compressed XML document.");}
 }
 if(xml.length>64*1024*1024)throw new Error("Decompressed PES MTL exceeds the 64 MiB safety limit.");
 if(xml.includes("<!DOCTYPE")||xml.includes("<!ENTITY")||xml.includes("<![CDATA["))throw new Error("PES MTL contains unsupported or unsafe XML declarations.");
 const clean=xml.replace(/<!--[\s\S]*?-->/g,"");
 if(!/^\s*(?:<\?xml[^?]*\?>\s*)?<materialset(?:\s[^>]*)?>[\s\S]*<\/materialset>\s*$/i.test(clean))throw new Error("PES MTL has no valid materialset root element.");
 const materials:Pes2017Material[]=[],names=new Set<string>();
 const materialPattern=/<material\b([^>]*)>([\s\S]*?)<\/material\s*>/gi;
 for(let match=materialPattern.exec(clean);match;match=materialPattern.exec(clean)){
  const attr=attributes(match[1]),name=attr.name?.trim(),shader=attr.shader?.trim();
  if(!name||!shader)throw new Error("PES MTL material must define non-empty name and shader attributes.");
  if(names.has(name.toLowerCase()))throw new Error("PES MTL contains duplicate material name: "+name);
  names.add(name.toLowerCase());
  const samplers:Pes2017Sampler[]=[],samplerNames=new Set<string>(),samplerPattern=/<sampler\b([^>]*?)\/?\s*>/gi;
  for(let sampler=samplerPattern.exec(match[2]);sampler;sampler=samplerPattern.exec(match[2])){
   const a=attributes(sampler[1]),samplerName=a.name?.trim(),texturePath=a.path;
   if(!samplerName||texturePath===undefined)throw new Error("PES MTL sampler requires name and path attributes in material "+name+".");
   if(samplerNames.has(samplerName.toLowerCase()))throw new Error("PES MTL material "+name+" repeats sampler "+samplerName+".");
   samplerNames.add(samplerName.toLowerCase());
   let maxAnisotropy:number|null=null;if(a.maxaniso!==undefined){maxAnisotropy=Number(a.maxaniso);if(!Number.isFinite(maxAnisotropy)||maxAnisotropy<1||maxAnisotropy>16)throw new Error("PES MTL sampler "+samplerName+" has an invalid maxaniso value.");}
   samplers.push({name:samplerName,path:safePath(texturePath),srgb:bool(a.srgb,"sampler srgb"),minFilter:optional(a.minfilter),magFilter:optional(a.magfilter),mipFilter:optional(a.mipfilter),uAddress:optional(a.uaddr),vAddress:optional(a.vaddr),wAddress:optional(a.waddr),maxAnisotropy});
  }
  materials.push({name,shader,samplers});
 }
 if(!materials.length)throw new Error("PES MTL contains no material definitions.");
 return {materials,wasCompressed,warnings:wasCompressed?["PES MTL was zlib-decompressed before parsing."]:[]};
}
