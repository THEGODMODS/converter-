import { deflateSync, inflateSync } from "node:zlib";
export type ModelSection={index:number;data:Buffer};
export type ModelContainer={version:number;unknown1:number;unknown2:number;flags:number;arrayHeaderExtra:Buffer;sections:ModelSection[];wasCompressed:boolean;warnings:string[]};
const MAX_MODEL_BYTES=1024*1024*1024;
function decodeWrapper(input:Buffer):{data:Buffer;compressed:boolean}{
 if(input.length>=16&&input.toString("ascii",4,8)==="ESYS"){try{return {data:inflateSync(input.subarray(16),{maxOutputLength:MAX_MODEL_BYTES}),compressed:true};}catch{throw new Error("ESYS-wrapped MODEL decompression failed or exceeded the safety limit.");}}
 return {data:input,compressed:false};
}
function boundedSlice(data:Buffer,start:number,length:number,label:string):Buffer{if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>data.length)throw new Error(label+" points outside the MODEL file.");return data.subarray(start,start+length);}
export function parseModelContainer(input:Buffer):ModelContainer{
 const decoded=decodeWrapper(input),data=decoded.data;
 if(data.length<36||data.subarray(0,8).toString("binary")!=="MODEL\0\0\0")throw new Error("Invalid PES MODEL signature or truncated header.");
 const tocOffset=data.readUInt32LE(8),unknown1=data.readUInt16LE(12),version=data.readUInt16LE(14),unknown2=data.readUInt32LE(16),flags=data.readUInt32LE(20);
 if(version<16||version>19)throw new Error("Unsupported PES MODEL version "+version+".");
 const arrayStart=tocOffset+8;boundedSlice(data,arrayStart,12,"MODEL section array");
 const arrayOffset=data.readUInt32LE(arrayStart),count=data.readUInt32LE(arrayStart+4),recordSize=data.readUInt32LE(arrayStart+8);
 if(recordSize!==4||count>64||arrayOffset<12||arrayOffset+count*recordSize>data.length-arrayStart)throw new Error("Invalid MODEL section pointer array.");
 const extraLength=arrayOffset-12,arrayHeaderExtra=Buffer.from(boundedSlice(data,arrayStart+12,extraLength,"MODEL section array extension")),recordsStart=arrayStart+arrayOffset;
 const offsets:number[]=[];for(let i=0;i<count;i++){const relative=data.readUInt32LE(recordsStart+i*4);if(relative<arrayOffset+count*4||arrayStart+relative>data.length)throw new Error("MODEL section pointer is outside its data area.");offsets.push(relative);}
 const sorted=[...offsets].sort((a,b)=>a-b);if(new Set(offsets).size!==offsets.length)throw new Error("MODEL sections contain duplicate offsets.");
 const sections:ModelSection[]=offsets.map((relative,index)=>{const next=sorted.find(offset=>offset>relative)??(data.length-arrayStart),length=next-relative;return {index,data:Buffer.from(boundedSlice(data,arrayStart+relative,length,"MODEL section "+index))};});
 const warnings:string[]=[];if(unknown1!==0)warnings.push("MODEL header unknown1 is non-zero.");if(unknown2!==9)warnings.push("MODEL header unknown2 differs from the common value 9.");if(flags!==0)warnings.push("MODEL header flags are non-zero.");
 return {version,unknown1,unknown2,flags,arrayHeaderExtra,sections,wasCompressed:decoded.compressed,warnings};
}
export function writeModelContainer(container:ModelContainer,compress=container.wasCompressed):Buffer{
 if(container.version<16||container.version>19)throw new Error("Unsupported PES MODEL version.");
 if(container.sections.length===0||container.sections.length>64)throw new Error("MODEL requires between 1 and 64 sections.");
 if(container.arrayHeaderExtra.length>1024*1024)throw new Error("MODEL section-array extension exceeds its safety limit.");
 const tocOffset=24,recordOffset=12+container.arrayHeaderExtra.length,records=Buffer.alloc(container.sections.length*4),sections:Buffer[]=[];let relative=recordOffset+records.length;
 for(let i=0;i<container.sections.length;i++){const section=container.sections[i];if(section.index!==i)throw new Error("MODEL section indices must be contiguous and ordered.");records.writeUInt32LE(relative,i*4);sections.push(Buffer.from(section.data));relative+=section.data.length;}
 const arrayHeader=Buffer.alloc(12);arrayHeader.writeUInt32LE(recordOffset,0);arrayHeader.writeUInt32LE(container.sections.length,4);arrayHeader.writeUInt32LE(4,8);
 const header=Buffer.alloc(24);header.write("MODEL\0\0\0",0,"binary");header.writeUInt32LE(tocOffset,8);header.writeUInt16LE(container.unknown1,12);header.writeUInt16LE(container.version,14);header.writeUInt32LE(container.unknown2,16);header.writeUInt32LE(container.flags,20);
 const plain=Buffer.concat([header,Buffer.alloc(8),arrayHeader,container.arrayHeaderExtra,records,...sections]);
 if(!compress)return plain;
 const wrapper=Buffer.alloc(16);wrapper.write("ESYS",4,"ascii");return Buffer.concat([wrapper,deflateSync(plain,{level:9})]);
}
