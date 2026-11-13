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
 * Decodes the shared scalar calibration header and validates verified record
 * structures. Auxiliary records stay opaque until their version-specific semantics
 * are established against independent real fixtures.
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
 const warnings:string[]=[];
 const boneOffsets:FaceDiffBoneOffset[]=[];
 const earTransforms:FaceDiffEarTransform[]=[];
 let opaqueRecordOffsets:number[]=offsets;
 warnings.push("FACE diff auxiliary records are preserved opaquely; no unverified bone/ear semantics are assigned.");
 // The header declares two physical record classes: 16-byte entries in block one
 // and 32-byte entries in block two. Validate every version, not just legacy v4.
 // Record meaning remains opaque until a version-specific mapping is proven.
 const v4Layout=version===4&&declaredBlock1Records===32&&declaredBlock2Records===6;
 const v5FullLayout=version===5&&declaredBlock1Records===33&&declaredBlock2Records===6;
 const v5SplitLayout=version===5&&declaredBlock1Records===32&&declaredBlock2Records===6&&
  offsets[declaredBlock1Records+1]-offsets[declaredBlock1Records]===0x10;
 if(v4Layout||v5FullLayout||v5SplitLayout){
  const structuralRanges=offsets.map((start,index)=>{
   const isSplitExtraBone=v5SplitLayout&&index===declaredBlock1Records;
   const size=index<declaredBlock1Records||isSplitExtraBone?0x10:0x20;
   const end=start+size;
   if(end>data.length)throw new Error("FACE diff record "+index+" exceeds the file boundary.");
   for(let at=start;at<end;at+=4)readFiniteFloat(data,at,"record "+index);
   return {start,end,index};
  }).sort((a,b)=>a.start-b.start);
  for(let i=1;i<structuralRanges.length;i++){
   if(structuralRanges[i].start<structuralRanges[i-1].end)
    throw new Error("FACE diff records overlap: "+structuralRanges[i-1].index+" and "+structuralRanges[i].index+".");
  }
 }else{
  warnings.push("This FACE diff record-count profile has not been structurally characterized; auxiliary records remain opaque.");
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
 if(eyeScale.some(n=>n<=0||n>10))warnings.push("Eye scale contains an unusual value; inspect eye sizing before applying it.");
 if([rightEyeRotation,leftEyeRotation].some(rotation=>rotation.some(n=>Math.abs(n)>180)))
  warnings.push("Eye rotation exceeds 180 degrees; inspect the source value before applying it.");
 // The face modifier reference reads the right/left eye-position vectors at
 // 0x150 and 0x160. Decode only those two records when the offset table confirms
 // those exact positions; all other facial/ear records remain byte-preserved.
 if(offsets.length>7&&offsets[6]===0x150&&offsets[7]===0x160){
  for(const [index,boneName] of [[6,"skf_eye_r"],[7,"skf_eye_l"]] as const){
   const recordOffset=offsets[index];
   boneOffsets.push({index,boneName,recordOffset,position:readFiniteVec3(data,recordOffset,boneName+" position"),w:readFiniteFloat(data,recordOffset+12,boneName+" weight")});
  }
  opaqueRecordOffsets=offsets.filter((_,index)=>index!==6&&index!==7);
 }else{
  warnings.push("Eye-position record pointers do not match the independently documented 0x150/0x160 locations; those records remain opaque.");
 }
 const rightEyePosition=boneOffsets.find(record=>record.boneName==="skf_eye_r")?.position??null;
 const leftEyePosition=boneOffsets.find(record=>record.boneName==="skf_eye_l")?.position??null;
 return {
  version,eyeScale,rightEyeRotation,leftEyeRotation,eyelidOffsets,jawOffset,
  oralPosition:jawOffset,mouthPosition:jawOffset,boneOffsets,earTransforms,
  opaqueRecordOffsets,rightEyePosition,leftEyePosition,fileBytes:data.length,
  declaredBlock1Records,declaredBlock2Records,warnings
 };
}
