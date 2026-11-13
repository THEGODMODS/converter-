export type FaceDiffVector3=[number,number,number];
export type FaceDiffInfo={
 eyeScale:FaceDiffVector3;
 rightEyeRotation:FaceDiffVector3;
 leftEyeRotation:FaceDiffVector3;
 eyelidOffsets:{topLeft:number;topRight:number;bottomLeft:number;bottomRight:number};
 oralPosition:FaceDiffVector3;
 /** Backwards-compatible name for oralPosition. */
 mouthPosition:FaceDiffVector3;
 rightEyePosition:FaceDiffVector3;
 leftEyePosition:FaceDiffVector3;
 fileBytes:number;
 declaredBlock1Records:number;
 declaredBlock2Records:number;
 warnings:string[];
};
const FACE_DIFF_HEADER_BYTES=0x50;
const FACE_DIFF_MIN_BYTES=0x16c;
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
/**
 * Inspects the documented FACE diff block-1 controls and stable eye-position
 * vectors. Coordinate conversion and rewriting remain the responsibility of a
 * separately verified face-scene adapter.
 */
export function inspectFaceDiff(data:Buffer):FaceDiffInfo{
 if(data.length<FACE_DIFF_MIN_BYTES||data.toString("ascii",0,4)!=="FACE")throw new Error("Invalid or truncated FACE diff binary.");
 if(data.length<FACE_DIFF_HEADER_BYTES)throw new Error("FACE diff header is truncated.");
 const declaredBlock1Records=data.readUInt32LE(0x48),declaredBlock2Records=data.readUInt32LE(0x4c);
 const expected=0xf0+0x10*declaredBlock1Records+0x20*declaredBlock2Records;
 if(!Number.isSafeInteger(expected)||data.length<expected)throw new Error("FACE diff is "+data.length+" bytes, but its header requires at least "+expected+" bytes.");
 const eyeScale=readFiniteVec3(data,0x08,"eye scale");
 const rightEyeRotation=readFiniteVec3(data,0x14,"right eye rotation");
 const leftEyeRotation=readFiniteVec3(data,0x20,"left eye rotation");
 const eyelidOffsets={
  topLeft:readFiniteFloat(data,0x2c,"top-left eyelid offset"),
  topRight:readFiniteFloat(data,0x30,"top-right eyelid offset"),
  bottomLeft:readFiniteFloat(data,0x34,"bottom-left eyelid offset"),
  bottomRight:readFiniteFloat(data,0x38,"bottom-right eyelid offset")
 };
 const oralPosition=readFiniteVec3(data,0x3c,"oral position");
 const rightEyePosition=readFiniteVec3(data,0x150,"right eye position");
 const leftEyePosition=readFiniteVec3(data,0x160,"left eye position");
 const warnings:string[]=[];
 if(eyeScale.some(n=>n<=0||n>10))warnings.push("Eye scale contains an unusual value; inspect eye sizing before export.");
 if([rightEyeRotation,leftEyeRotation].some(rotation=>rotation.some(n=>Math.abs(n)>Math.PI*4)))warnings.push("Eye rotation contains a large value; confirm the source unit and orientation before applying it.");
 if(declaredBlock1Records!==0||declaredBlock2Records!==0)warnings.push("FACE diff contains declared auxiliary record tables; their full record semantics are not decoded by this inspector.");
 return {eyeScale,rightEyeRotation,leftEyeRotation,eyelidOffsets,oralPosition,mouthPosition:oralPosition,rightEyePosition,leftEyePosition,fileBytes:data.length,declaredBlock1Records,declaredBlock2Records,warnings};
}
