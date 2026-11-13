import type {FaceScene,FaceBone} from "./ir";
import type {FaceDiffInfo,FaceDiffBoneOffset,FaceDiffEarTransform} from "../formats/face-diff";

export type RigRecordMatch<T>={record:T;boneIndex:number|null;status:"matched"|"missing"|"ambiguous"};
type MatrixHealth={boneName:string;boneIndex:number;sourceMatrix:"missing"|"invalid"|"degenerate"|"invertible";normalizedDeterminant:number|null;inverseBindMatrix:"missing"|"invalid"|"degenerate"|"invertible"};
export type FaceRigCalibrationAudit={
 sourceVersion:number;
 headFrameBoneIndex:number|null;
 headFrameStatus:"matched"|"missing"|"ambiguous";
 facialOffsets:RigRecordMatch<FaceDiffBoneOffset>[];
 earTransforms:RigRecordMatch<FaceDiffEarTransform>[];
 unmatchedSceneBones:string[];
 duplicateSceneBoneNames:string[];
 matrixAudit:{checked:number;sourceMatricesMissing:number;inverseBindMatricesMissing:number;degenerateMatrices:string[];headFrame:MatrixHealth|null};
 hierarchyAudit:{matchedBones:number;withParentIndex:number;status:"available"|"partial"|"unavailable"};
 scalarCalibration:{
  eyeScale:[number,number,number];
  rightEyeRotationDegrees:[number,number,number];
  leftEyeRotationDegrees:[number,number,number];
  eyelidAnglesDegrees:{topLeft:number;topRight:number;bottomLeft:number;bottomRight:number};
  jawOffset:[number,number,number];
 };
 summary:{matched:number;missing:number;ambiguous:number;total:number};
 application:"inspection-only";
 blockers:string[];
};

function indexesByName(scene:FaceScene):Map<string,number[]>{
 const map=new Map<string,number[]>();
 scene.bones.forEach((bone,index)=>{
  const key=bone.name.trim().toLowerCase();
  const values=map.get(key)??[];
  values.push(index);
  map.set(key,values);
 });
 return map;
}
function match<T extends {boneName:string}>(record:T,indexes:Map<string,number[]>):RigRecordMatch<T>{
 const found=indexes.get(record.boneName.trim().toLowerCase())??[];
 if(found.length===1)return {record,boneIndex:found[0],status:"matched"};
 if(found.length>1)return {record,boneIndex:null,status:"ambiguous"};
 return {record,boneIndex:null,status:"missing"};
}
/** Matrix34 is assessed only for degeneracy; no coordinate or translation convention is inferred. */
function matrixHealth(bone:FaceBone,boneIndex:number):MatrixHealth{
 const inspect=(values:number[]|undefined):MatrixHealth["sourceMatrix"]=>{
  if(!values)return "missing";
  if((values.length!==12&&values.length!==16)||!values.every(Number.isFinite))return "invalid";
  const a=values[0],b=values[1],c=values[2],d=values[4],e=values[5],f=values[6],g=values[8],h=values[9],i=values[10];
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  const rowNorm=Math.hypot(a,b,c)*Math.hypot(d,e,f)*Math.hypot(g,h,i);
  return !Number.isFinite(det)||!Number.isFinite(rowNorm)||rowNorm===0||Math.abs(det)/rowNorm<1e-8?"degenerate":"invertible";
 };
 const source=bone.sourceMatrix;
 let normalizedDeterminant:number|null=null;
 if(source&&(source.length===12||source.length===16)&&source.every(Number.isFinite)){
  const [a,b,c,d,e,f,g,h,i]=[source[0],source[1],source[2],source[4],source[5],source[6],source[8],source[9],source[10]];
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  const norm=Math.hypot(a,b,c)*Math.hypot(d,e,f)*Math.hypot(g,h,i);
  normalizedDeterminant=norm>0&&Number.isFinite(det)?det/norm:null;
 }
 return {boneName:bone.name,boneIndex,sourceMatrix:inspect(bone.sourceMatrix),normalizedDeterminant,inverseBindMatrix:inspect(bone.inverseBindMatrix)};
}

/**
 * Audits FACE diff landmarks against the decoded scene skeleton.
 * This is deliberately read-only: matrix layout, coordinate convention, parent
 * hierarchy and source/target bind-pose equivalence must be proven before use.
 */
export function auditFaceRigCalibration(scene:FaceScene,diff:FaceDiffInfo):FaceRigCalibrationAudit{
 const indexes=indexesByName(scene);
 const head=indexes.get("sk_head")??[];
 const headFrameStatus=head.length===1?"matched":head.length>1?"ambiguous":"missing";
 const facialOffsets=diff.boneOffsets.map(record=>match(record,indexes));
 const earTransforms=diff.earTransforms.map(record=>match(record,indexes));
 const all=[...facialOffsets,...earTransforms];
 const matched=all.filter(x=>x.status==="matched").length;
 const missing=all.filter(x=>x.status==="missing").length;
 const ambiguous=all.filter(x=>x.status==="ambiguous").length;
 const duplicateSceneBoneNames=[...indexes.entries()].filter(([,ids])=>ids.length>1).map(([name])=>name);
 const referenced=new Set(all.map(x=>x.record.boneName.trim().toLowerCase()));
 const unmatchedSceneBones=scene.bones.map(b=>b.name).filter(name=>{
  const key=name.trim().toLowerCase();
  return key!=="sk_head"&&!referenced.has(key);
 });
 const mapped=all.filter(x=>x.status==="matched"&&x.boneIndex!==null).map(x=>({bone:scene.bones[x.boneIndex!],index:x.boneIndex!}));
 const matrixRecords=mapped.map(x=>matrixHealth(x.bone,x.index));
 const headMatrix=head.length===1?matrixHealth(scene.bones[head[0]],head[0]):null;
 const allMatrices=headMatrix?[headMatrix,...matrixRecords]:matrixRecords;
 const sourceMatricesMissing=allMatrices.filter(x=>x.sourceMatrix==="missing").length;
 const inverseBindMatricesMissing=allMatrices.filter(x=>x.inverseBindMatrix==="missing").length;
 const degenerateMatrices=allMatrices.filter(x=>x.sourceMatrix==="degenerate"||x.inverseBindMatrix==="degenerate"||x.sourceMatrix==="invalid"||x.inverseBindMatrix==="invalid").map(x=>x.boneName);
 const withParentIndex=mapped.filter(x=>x.bone.parentIndex!==null).length;
 const hierarchyStatus=withParentIndex===0?"unavailable":withParentIndex===mapped.length?"available":"partial";
 const blockers:string[]=[];
 if(headFrameStatus!=="matched")blockers.push(headFrameStatus==="missing"?"Required sk_head coordinate-frame bone was not found.":"Skeleton contains multiple sk_head bones; coordinate frame is ambiguous.");
 if(missing)blockers.push(missing+" FACE diff landmark(s) have no exact-name skeleton match.");
 if(ambiguous)blockers.push(ambiguous+" FACE diff landmark(s) match duplicate skeleton bone names.");
 if(duplicateSceneBoneNames.length)blockers.push("Skeleton contains duplicate bone names; resolve duplicates before rig mapping.");
 if(sourceMatricesMissing)blockers.push(sourceMatricesMissing+" required source/reference matrices are absent, including the head frame where applicable.");
 if(inverseBindMatricesMissing)blockers.push(inverseBindMatricesMissing+" inverse-bind matrices are absent; skinning-space equivalence cannot be checked.");
 if(degenerateMatrices.length)blockers.push("Degenerate or invalid matrices detected: "+degenerateMatrices.join(", ")+".");
 if(hierarchyStatus!=="available")blockers.push("Parent hierarchy is "+hierarchyStatus+" in the decoded scene; local-to-head transforms cannot be composed safely.");
 blockers.push("No offsets were applied: row/column convention, handedness, units, local/global interpretation and source/target bind-pose equivalence remain unverified.");
 return {
  sourceVersion:diff.version,headFrameBoneIndex:head.length===1?head[0]:null,headFrameStatus,
  facialOffsets,earTransforms,unmatchedSceneBones,duplicateSceneBoneNames,
  matrixAudit:{checked:allMatrices.length,sourceMatricesMissing,inverseBindMatricesMissing,degenerateMatrices,headFrame:headMatrix},
  hierarchyAudit:{matchedBones:mapped.length,withParentIndex,status:hierarchyStatus},
  scalarCalibration:{eyeScale:diff.eyeScale,rightEyeRotationDegrees:diff.rightEyeRotation,leftEyeRotationDegrees:diff.leftEyeRotation,eyelidAnglesDegrees:diff.eyelidOffsets,jawOffset:diff.jawOffset},
  summary:{matched,missing,ambiguous,total:all.length},application:"inspection-only",blockers
 };
}
