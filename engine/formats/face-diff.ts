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
function checkedOffsetTable(data:Buffer,count:number,recordLimit:number):number[]{
 const tableEnd=FACE_DIFF_HEADER_BYTES+count*4;
 if(!Number.isSafeInteger(tableEnd)||tableEnd>FACE_DIFF_RECORDS_START||tableEnd>data.length)
  throw new Error("FACE diff record-offset table exceeds its fixed header.");
 const offsets:number[]=[];
 const seen=new Set<number>();
 for(let i=0;i<count;i++){
  const offset=data.readUInt32LE(FACE_DIFF_HEADER_BYTES+i*4);
  if(offset<FACE_DIFF_RECORDS_START||offset+4>recordLimit||(offset&0x0f)!==0)
   throw new Error("FACE diff record "+i+" has an invalid or unaligned absolute offset.");
  if(seen.has(offset))throw new Error("FACE diff record-offset table contains a duplicate pointer.");
  seen.add(offset);
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
 const offsets=checkedOffsetTable(data,offsetCount,expected);
 // Validate physical record extents for every generation, including legacy v4.
 // Unknown layouts stay semantically opaque, but malformed pointers must never
 // be accepted merely because their record meanings are not yet decoded.
 if(version===4&&declaredBlock1Records===32&&declaredBlock2Records===6){
  const structuralRanges=offsets.map((start,index)=>{
   const size=index<declaredBlock1Records?0x10:0x20;
   const end=start+size;
   if(end>expected)throw new Error("FACE diff record "+index+" exceeds the count-derived record area.");
   for(let at=start;at<end;at+=4)readFiniteFloat(data,at,"legacy record "+index);
   return {start,end,index};
  }).sort((a,b)=>a.start-b.start);
  for(let i=1;i<structuralRanges.length;i++){
   if(structuralRanges[i].start<structuralRanges[i-1].end)
    throw new Error("FACE diff records overlap: "+structuralRanges[i-1].index+" and "+structuralRanges[i].index+".");
  }
 }else{
  opaqueRecordOffsets=offsets;
  warnings.push("FACE diff auxiliary records are retained as opaque offsets; this version/count layout has not been semantically decoded.");
 }
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
 // Real PES 2017 v4 and PES 2021 v5 samples establish the header calibration
 // fields, but not a stable cross-version semantic mapping for every auxiliary record.
 // Preserve those records opaquely until each record family is proven from fixtures.
 opaqueRecordOffsets=offsets;
 warnings.push("FACE diff auxiliary records are preserved opaquely; no unverified bone/ear semantics are assigned.");
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
