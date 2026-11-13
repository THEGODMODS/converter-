export type FacePartRole="head"|"neck"|"eyes"|"eyelids"|"mouth"|"hair"|"beard"|"skin-normal";
export type FacePartCoverage={role:FacePartRole;files:string[];models:number;textures:number;status:"detected"|"not-found"};
const roles:FacePartRole[]=["head","neck","eyes","eyelids","mouth","hair","beard","skin-normal"];
export function analyzeFacePackage(files:Array<{path:string;kind:string}>):FacePartCoverage[]{
 const grouped=new Map<FacePartRole,Array<{path:string;kind:string}>>(roles.map(role=>[role,[]]));
 for(const file of files){const name=file.path.toLowerCase().split("/").pop()??file.path.toLowerCase(),isModel=file.kind.startsWith("model-"),isTexture=file.kind.startsWith("texture-");if(!isModel&&!isTexture)continue;
  let role:FacePartRole|null=null;
  if(/eyelid|eye_lid|lid/.test(name))role="eyelids";
  else if(/oral|mouth|lip/.test(name))role="mouth";
  else if(/eye|iris|pupil/.test(name))role="eyes";
  else if(/neck/.test(name))role="neck";
  else if(/beard|moustache|mustache|facial.?hair/.test(name))role="beard";
  else if(/hair|hairstyle/.test(name))role="hair";
  else if(isTexture&&/(normal|_nrm|nrm_)/.test(name)&&/(face|skin|head)/.test(name))role="skin-normal";
  else if(/face|head|skin/.test(name))role="head";
  if(role)grouped.get(role)!.push(file);
 }
 return roles.map(role=>{const found=grouped.get(role)!;return {role,files:found.map(f=>f.path),models:found.filter(f=>f.kind.startsWith("model-")).length,textures:found.filter(f=>f.kind.startsWith("texture-")).length,status:found.length?"detected":"not-found"};});
}
