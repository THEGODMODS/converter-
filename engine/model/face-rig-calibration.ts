import type {FaceScene} from "./ir";
import type {FaceDiffInfo,FaceDiffBoneOffset,FaceDiffEarTransform} from "../formats/face-diff";

export type RigRecordMatch<T>={record:T;boneIndex:number|null;status:"matched"|"missing"|"ambiguous"};
export type FaceRigCalibrationAudit={
 sourceVersion:number;
 headFrameBoneIndex:number|null;
 headFrameStatus:"matched"|"missing"|"ambiguous";
 facialOffsets:RigRecordMatch<FaceDiffBoneOffset>[];
 earTransforms:RigRecordMatch<FaceDiffEarTransform>[];
 unmatchedSceneBones:string[];
 duplicateSceneBoneNames:string[];
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

/**
 * Audits FACE diff landmarks against the decoded scene skeleton.
 *
 * This deliberately does not mutate matrices or apply offsets. FACE diff values
 * are expressed in the sk_head frame, while sourceMatrix conventions, parent
 * hierarchy and target bind-pose equivalence must be established independently
 * before a numeric transform can be safely applied.
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
 const blockers:string[]=[];
 if(headFrameStatus!=="matched")blockers.push(headFrameStatus==="missing"?"Required sk_head coordinate-frame bone was not found.":"Skeleton contains multiple sk_head bones; coordinate frame is ambiguous.");
 if(missing)blockers.push(missing+" FACE diff landmark(s) have no exact-name skeleton match.");
 if(ambiguous)blockers.push(ambiguous+" FACE diff landmark(s) match duplicate skeleton bone names.");
 if(duplicateSceneBoneNames.length)blockers.push("Skeleton contains duplicate bone names; resolve duplicates before rig mapping.");
 blockers.push("No offsets were applied: source/target matrix conventions, parent hierarchy and bind-pose equivalence are not yet verified.");
 return {
  sourceVersion:diff.version,headFrameBoneIndex:head.length===1?head[0]:null,headFrameStatus,
  facialOffsets,earTransforms,unmatchedSceneBones,duplicateSceneBoneNames,
  scalarCalibration:{eyeScale:diff.eyeScale,rightEyeRotationDegrees:diff.rightEyeRotation,leftEyeRotationDegrees:diff.leftEyeRotation,eyelidAnglesDegrees:diff.eyelidOffsets,jawOffset:diff.jawOffset},
  summary:{matched,missing,ambiguous,total:all.length},application:"inspection-only",blockers
 };
}
