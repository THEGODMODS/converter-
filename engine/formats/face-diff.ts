export type FaceDiffVector3=[number,number,number];
export type FaceDiffInfo={eyeScale:FaceDiffVector3;mouthPosition:FaceDiffVector3;rightEyePosition:FaceDiffVector3;leftEyePosition:FaceDiffVector3;fileBytes:number;warnings:string[]};
const FACE_DIFF_MIN_BYTES=0x16c;
function readFiniteVec3(data:Buffer,offset:number,label:string):FaceDiffVector3{
 if(offset<0||offset+12>data.length)throw new Error("FACE diff "+label+" vector is truncated.");
 const value:FaceDiffVector3=[data.readFloatLE(offset),data.readFloatLE(offset+4),data.readFloatLE(offset+8)];
 if(!value.every(Number.isFinite))throw new Error("FACE diff "+label+" contains a non-finite value.");
 return value;
}
/** Reads stable FACE diff fields; coordinate conversion is deferred to a tested scene adapter. */
export function inspectFaceDiff(data:Buffer):FaceDiffInfo{
 if(data.length<FACE_DIFF_MIN_BYTES||data.toString("ascii",0,4)!=="FACE")throw new Error("Invalid or truncated FACE diff binary.");
 const eyeScale=readFiniteVec3(data,0x08,"eye scale"),mouthPosition=readFiniteVec3(data,0x3c,"mouth position"),rightEyePosition=readFiniteVec3(data,0x150,"right eye position"),leftEyePosition=readFiniteVec3(data,0x160,"left eye position");
 const warnings:string[]=[];if(eyeScale.some(n=>n<=0||n>10))warnings.push("Eye scale contains an unusual value; inspect eye sizing before export.");
 return {eyeScale,mouthPosition,rightEyePosition,leftEyePosition,fileBytes:data.length,warnings};
}
