export type FaceDiffVector3=[number,number,number];
export type FaceDiffBoneOffset={
 index:number;
 boneName:string;
 recordOffset:number;
 position:FaceDiffVector3;
 w:number;
};
export type FaceDiffEarTransform={
 index:number;
 boneName:string;
 recordOffset:number;
 translation:FaceDiffVector3;
 scale:FaceDiffVector3;
 reserved:[number,number];
};
export type FaceDiffInfo={
 version:number;
 eyeScale:FaceDiffVector3;
 rightEyeRotation:FaceDiffVector3;
 leftEyeRotation:FaceDiffVector3;
 /** Upper-left, upper-right, lower-left, lower-right eyelid angles in degrees. */
 eyelidOffsets:{topLeft:number;topRight:number;bottomLeft:number;bottomRight:number};
 /** Jaw/oral model offset in the face-head frame, not a mouth mesh-space position. */
 jawOffset:FaceDiffVector3;
 /** Legacy alias retained for callers built against the first inspector. */
 oralPosition:FaceDiffVector3;
 /** Legacy alias retained for callers built against the first inspector. */
 mouthPosition:FaceDiffVector3;
 boneOffsets:FaceDiffBoneOffset[];
 earTransforms:FaceDiffEarTransform[];
 opaqueRecordOffsets:number[];
 rightEyePosition:FaceDiffVector3|null;
 leftEyePosition:FaceDiffVector3|null;
 fileBytes:number;
 declaredBlock1Records:number;
 declaredBlock2Records:number;
 warnings:string[];
};
const FACE_DIFF_HEADER_BYTES=0x50;
const FACE_DIFF_RECORDS_START=0xf0;
const FACE_BONE_ORDER=[
 "skf_brow_o_r","skf_brow_i_r","skf_brow_i_l","skf_brow_o_l",
 "skf_orbicularisoculi_b_r","skf_orbicularisoculi_b_l","skf_eye_r","skf_eye_l",
 "skf_eyelid_b_r","skf_eyelid_b_l","skf_eyelid_t_r","skf_eyelid_t_l",
 "skf_glabella","skf_nosewing_r","skf_nosewing_l","skf_cheek_r",
 "skf_nasolabialfold_t_r","skf_nasolabialfold_t_l","skf_cheek_l","skf_cheek_s_r",
 "skf_cheek_s_l","skf_lip_t_r","skf_lip_s_r","skf_lip_s_l","skf_lip_t_l",
 "skf_nose","skf_lip_t_c","skf_lip_volume","skf_jaw","skf_lip_b_l",
 "skf_lip_b_r","skf_doublechin","skf_lip_b_c"
] as const;
const FACE_EAR_ORDER=[
 "dsk_ear_t_l","dsk_ear_t_r","dsk_ear_b_l","dsk_ear_b_r","dsk_earlobe_l","dsk_earlobe_r"
] as const;
function readFiniteVec3(data:Buffer,offset:number,label:string):FaceDiffVector3{
 if(offset<0||offset+12>data.length)throw new Error("FACE diff "+label+" vector is truncated.");
 const value:FaceDiffVector3=[data.readFloatLE(offset),data.readFloatLE(offset+4),data.readFloatLE(offset+8)];
 if(!value.every(Number.isFinite))throw new Error("FACE diff "+label+" contains a non-finite value.");
 return value;
}
function readFiniteFloat(data:Buffer,offset:number,label:string):number{
 if(offset<0||offset+4>data.length)throw new Error("FACE diff "+label+" value is truncated.");
 const value=data.readFloatLE(offset);
 if(!Number.isFinite(value))throw new Error("FACE diff "+label+" contains a non-finite value.");
 return value;
}
function checkedOffsetTable(data:Buffer,count:number):number[]{
 const tableEnd=FACE_DIFF_HEADER_BYTES+count*4;
 if(!Number.isSafeInteger(tableEnd)||tableEnd>FACE_DIFF_RECORDS_START||tableEnd>data.length)
  throw new Error("FACE diff record-offset table exceeds its fixed header.");
 const offsets:number[]=[];
 for(let i=0;i<count;i++){
  const offset=data.readUInt32LE(FACE_DIFF_HEADER_BYTES+i*4);
  if(offset<FACE_DIFF_RECORDS_START||offset>=data.length||(offset&0x0f)!==0)
   throw new Error("FACE diff record "+i+" has an invalid or unaligned absolute offset.");
  if(offsets.includes(offset))throw new Error("FACE diff record-offset table contains a duplicate pointer.");
  offsets.push(offset);
 }
 return offsets;
}
/**
 * Decodes the documented PES 2021 v5/v6 real-face calibration layout.
 * Other versions remain structurally inspected: their offset pointers are exposed
 * but never assigned guessed bone/ear semantics.
 */
export function inspectFaceDiff(data:Buffer):FaceDiffInfo{
 if(data.length<FACE_DIFF_HEADER_BYTES)throw new Error("FACE diff header is truncated.");
 if(data.toString("ascii",0,4)!=="FACE")throw new Error("Invalid FACE diff magic.");
 const version=data.readUInt32LE(4);
 const declaredBlock1Records=data.readUInt32LE(0x48),declaredBlock2Records=data.readUInt32LE(0x4c);
 const expected=FACE_DIFF_RECORDS_START+0x10*declaredBlock1Records+0x20*declaredBlock2Records;
 if(!Number.isSafeInteger(expected)||data.length<expected)
  throw new Error("FACE diff is "+data.length+" bytes, but its header requires at least "+expected+" bytes.");
 const offsetCount=declaredBlock1Records+declaredBlock2Records;
 if(!Number.isSafeInteger(offsetCount)||offsetCount>10000)
  throw new Error("FACE diff declares an unreasonable number of records.");
 const offsets=checkedOffsetTable(data,offsetCount);
 const eyeScale=readFiniteVec3(data,0x08,"eye scale");
 const rightEyeRotation=readFiniteVec3(data,0x14,"right-eye rotation");
 const leftEyeRotation=readFiniteVec3(data,0x20,"left-eye rotation");
 const eyelidOffsets={
  topLeft:readFiniteFloat(data,0x2c,"top-left eyelid angle"),
  topRight:readFiniteFloat(data,0x30,"top-right eyelid angle"),
  bottomLeft:readFiniteFloat(data,0x34,"bottom-left eyelid angle"),
  bottomRight:readFiniteFloat(data,0x38,"bottom-right eyelid angle")
 };
 const jawOffset=readFiniteVec3(data,0x3c,"jaw offset");
 const warnings:string[]=[];
 const boneOffsets:FaceDiffBoneOffset[]=[];
 const earTransforms:FaceDiffEarTransform[]=[];
 let opaqueRecordOffsets:number[]=[];
 const knownVersion=(version===5||version===6)&&declaredBlock1Records===33&&declaredBlock2Records===6;
 if(knownVersion){
  const ranges:Array<{start:number;end:number;label:string}>=[];
  for(let i=0;i<33;i++){
   const recordOffset=offsets[i],end=recordOffset+0x10;
   if(end>data.length)throw new Error("FACE diff bone-offset record "+i+" is truncated.");
   ranges.push({start:recordOffset,end,label:FACE_BONE_ORDER[i]});
   const position=readFiniteVec3(data,recordOffset,FACE_BONE_ORDER[i]+" offset");
   const w=readFiniteFloat(data,recordOffset+12,FACE_BONE_ORDER[i]+" offset W");
   if(Math.abs(w)>1e-4)warnings.push(FACE_BONE_ORDER[i]+" offset W is non-zero; expected zero in the documented v5/v6 layout.");
   boneOffsets.push({index:i,boneName:FACE_BONE_ORDER[i],recordOffset,position,w});
  }
  for(let i=0;i<6;i++){
   const recordOffset=offsets[33+i],end=recordOffset+0x20;
   if(end>data.length)throw new Error("FACE diff ear-transform record "+i+" is truncated.");
   ranges.push({start:recordOffset,end,label:FACE_EAR_ORDER[i]});
   const translation=readFiniteVec3(data,recordOffset,FACE_EAR_ORDER[i]+" translation");
   const scale=readFiniteVec3(data,recordOffset+12,FACE_EAR_ORDER[i]+" scale");
   const reserved:[number,number]=[
    readFiniteFloat(data,recordOffset+24,FACE_EAR_ORDER[i]+" reserved[0]"),
    readFiniteFloat(data,recordOffset+28,FACE_EAR_ORDER[i]+" reserved[1]")
   ];
   if(scale.some(n=>n<=0))warnings.push(FACE_EAR_ORDER[i]+" has a non-positive scale.");
   if(reserved.some(n=>Math.abs(n)>1e-6))warnings.push(FACE_EAR_ORDER[i]+" has non-zero reserved values.");
   earTransforms.push({index:i,boneName:FACE_EAR_ORDER[i],recordOffset,translation,scale,reserved});
  }
  ranges.sort((a,b)=>a.start-b.start);
  for(let i=1;i<ranges.length;i++)if(ranges[i].start<ranges[i-1].end)
   throw new Error("FACE diff records overlap: "+ranges[i-1].label+" and "+ranges[i].label+".");
 }else{
  opaqueRecordOffsets=offsets;
  warnings.push("FACE diff version/count combination is not the verified v5/v6 layout; auxiliary records are retained as opaque offsets.");
 }
 if(eyeScale.some(n=>n<=0||n>10))warnings.push("Eye scale contains an unusual value; inspect eye sizing before applying it.");
 if([rightEyeRotation,leftEyeRotation].some(rotation=>rotation.some(n=>Math.abs(n)>180)))
  warnings.push("Eye rotation exceeds 180 degrees; inspect the source value before applying it.");
 const rightEyePosition=boneOffsets[6]?.position??null;
 const leftEyePosition=boneOffsets[7]?.position??null;
 return {
  version,eyeScale,rightEyeRotation,leftEyeRotation,eyelidOffsets,jawOffset,
  oralPosition:jawOffset,mouthPosition:jawOffset,boneOffsets,earTransforms,
  opaqueRecordOffsets,rightEyePosition,leftEyePosition,fileBytes:data.length,
  declaredBlock1Records,declaredBlock2Records,warnings
 };
}
