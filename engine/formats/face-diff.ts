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
 /** Model-space jaw/oral offset; the PES 2021 runtime derives it from the sk_head-frame skf_jaw offset. */
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
const FACE_EAR_BONE_ORDER=[
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
 // Validate physical extents only for layouts backed by independent binary evidence.
 // Record meaning remains opaque until a version-specific mapping is proven.
 const v4Layout=version===4&&declaredBlock1Records===32&&declaredBlock2Records===6;
 const modernFullLayout=(version===5||version===6)&&declaredBlock1Records===33&&declaredBlock2Records===6;
 const v5SplitLayout=version===5&&declaredBlock1Records===32&&declaredBlock2Records===6&&
  offsets[declaredBlock1Records+1]-offsets[declaredBlock1Records]===0x10;
 if(v4Layout||modernFullLayout||v5SplitLayout){
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
 const defaultEyeScale=eyeScale.every(n=>Math.abs(n)<1e-9);
 if(!defaultEyeScale&&eyeScale.some(n=>n<=0||n>10))warnings.push("Eye scale contains an unusual value; inspect eye sizing before applying it.");
 if([rightEyeRotation,leftEyeRotation].some(rotation=>rotation.some(n=>Math.abs(n)>180)))
  warnings.push("Eye rotation exceeds 180 degrees; inspect the source value before applying it.");
 const modernCanonicalRecords=modernFullLayout&&offsets.length===39&&
  offsets.slice(0,33).every((offset,index)=>offset===0xf0+index*0x10)&&
  offsets.slice(33).every((offset,index)=>offset===0x300+index*0x20);
 if(modernCanonicalRecords){
  for(let index=0;index<FACE_BONE_ORDER.length;index++){
   const recordOffset=offsets[index],boneName=FACE_BONE_ORDER[index];
   const position=readFiniteVec3(data,recordOffset,boneName+" position");
   const w=readFiniteFloat(data,recordOffset+12,boneName+" w");
   if(Math.abs(w)>1e-6)warnings.push(boneName+" has non-zero w; expected a sk_head-local position with w=0.");
   boneOffsets.push({index,boneName,recordOffset,position,w});
  }
  for(let index=0;index<FACE_EAR_BONE_ORDER.length;index++){
   const recordIndex=33+index,recordOffset=offsets[recordIndex],boneName=FACE_EAR_BONE_ORDER[index];
   const translation=readFiniteVec3(data,recordOffset,boneName+" translation");
   const scale=readFiniteVec3(data,recordOffset+12,boneName+" scale");
   const reserved:[number,number]=[readFiniteFloat(data,recordOffset+24,boneName+" reserved[0]"),readFiniteFloat(data,recordOffset+28,boneName+" reserved[1]")];
   if(reserved.some(value=>Math.abs(value)>1e-6))warnings.push(boneName+" has non-zero reserved ear-transform values.");
   earTransforms.push({index,boneName,recordOffset,translation,scale,reserved});
  }
  opaqueRecordOffsets=[];
  const jaw=boneOffsets.find(record=>record.boneName==="skf_jaw");
  if(jaw){
   const expectedJaw:[number,number,number]=[-jaw.position[2],jaw.position[0],-jaw.position[1]];
   const error=Math.max(...expectedJaw.map((value,index)=>Math.abs(value-jawOffset[index])));
   const defaultJawSentinel=jawOffset.every(value=>Math.abs(value+65500)<0.5);
   if(!defaultJawSentinel&&error>4e-5)warnings.push("Jaw scalar does not match the documented sk_head-frame skf_jaw transform (max error "+error+").");
  }
 }else if(offsets.length>7&&offsets[6]===0x150&&offsets[7]===0x160){
  warnings.push("Uncharacterized FACE diff records remain opaque; only the two documented eye landmarks are decoded.");
  // The face modifier reference reads the right/left eye-position vectors at
  // 0x150 and 0x160. This is the only semantic mapping applied to other profiles.
  for(const [index,boneName] of [[6,"skf_eye_r"],[7,"skf_eye_l"]] as const){
   const recordOffset=offsets[index];
   boneOffsets.push({index,boneName,recordOffset,position:readFiniteVec3(data,recordOffset,boneName+" position"),w:readFiniteFloat(data,recordOffset+12,boneName+" w")});
  }
  opaqueRecordOffsets=offsets.filter((_,index)=>index!==6&&index!==7);
 }else{
  warnings.push("Uncharacterized FACE diff records remain opaque; no unverified bone/ear semantics are assigned.");
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

/** Build the neutral v5 FACE payload used by the upstream Team Compiler when no custom diff is supplied. */
export function createDefaultFaceDiffV5():Buffer{
 const data=Buffer.alloc(0x3c0);
 data.write("FACE",0,"ascii");data.writeUInt32LE(5,4);
 for(let offset=0x08;offset<0x3c;offset+=4)data.writeFloatLE(0,offset);
 data.writeFloatLE(-65500,0x3c);data.writeFloatLE(-65500,0x40);data.writeFloatLE(-65500,0x44);
 data.writeUInt32LE(33,0x48);data.writeUInt32LE(6,0x4c);
 for(let index=0;index<33;index++){const offset=0xf0+index*0x10;data.writeUInt32LE(offset,0x50+index*4);for(let c=0;c<4;c++)data.writeFloatLE(0,offset+c*4);}
 for(let index=0;index<6;index++){const offset=0x300+index*0x20;data.writeUInt32LE(offset,0x50+(33+index)*4);[0,0,0,1,1,1,0,0].forEach((v,c)=>data.writeFloatLE(v,offset+c*4));}
 return data;
}
