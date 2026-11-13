import { inspectFmdlHeader } from "./headers";
export type FmdlSegment0Block={id:number;entryCount:number;entrySize?:number;data:Buffer};
export type FmdlSegment1Block={id:number;data:Buffer;declaredLength?:number};
export type FmdlContainer={version:number;section0Bitmap:bigint;section1Bitmap:bigint;section0Blocks:FmdlSegment0Block[];section1Blocks:FmdlSegment1Block[];warnings:string[]};
export const FMDL_SEGMENT0_ENTRY_SIZES:Readonly<Record<number,number>>={0:48,1:8,2:32,3:48,4:16,5:68,6:4,7:4,8:4,9:8,10:8,11:4,12:8,13:32,14:16,16:16,17:8,18:8,20:128};
function boundedSlice(data:Buffer,start:number,length:number,label:string):Buffer{if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>data.length)throw new Error(label+" points outside the FMDL file.");return data.subarray(start,start+length);}
export function parseFmdlContainer(data:Buffer):FmdlContainer{
 const inspection=inspectFmdlHeader(data);if(!inspection.valid)throw new Error(inspection.details.join(" "));
 const version=data.readUInt32LE(4),descriptorsOffset=Number(data.readBigUInt64LE(8)),section0Bitmap=data.readBigUInt64LE(16),section1Bitmap=data.readBigUInt64LE(24);
 const section0Count=data.readUInt32LE(32),section1Count=data.readUInt32LE(36),section0Offset=data.readUInt32LE(40),section0Length=data.readUInt32LE(44),section1Offset=data.readUInt32LE(48),section1Length=data.readUInt32LE(52);
 const descriptors:Array<{id:number;count:number;offset:number;size?:number;rawLength?:number}>=[];
 let cursor=descriptorsOffset;
 for(let i=0;i<section0Count;i++,cursor+=8){const id=data.readUInt16LE(cursor),count=data.readUInt16LE(cursor+2),offset=data.readUInt32LE(cursor+4);descriptors.push({id,count,offset,size:FMDL_SEGMENT0_ENTRY_SIZES[id]});}
 const sortedOffsets=[...descriptors.map(d=>d.offset),section0Length].sort((a,b)=>a-b);
 for(const block of descriptors){if(block.size!==undefined)block.rawLength=block.count*block.size;else{const next=sortedOffsets.find(offset=>offset>block.offset);block.rawLength=(next??section0Length)-block.offset;}}
 const section0Blocks:FmdlSegment0Block[]=descriptors.map(block=>({id:block.id,entryCount:block.count,entrySize:block.size,data:Buffer.from(boundedSlice(data,section0Offset+block.offset,block.rawLength??0,"FMDL segment-0 block "+block.id))}));
 const section1Blocks:FmdlSegment1Block[]=[],warnings:string[]=[];
 for(let i=0;i<section1Count;i++,cursor+=12){const id=data.readUInt32LE(cursor),offset=data.readUInt32LE(cursor+4),declaredLength=data.readUInt32LE(cursor+8),remaining=section1Length-offset;const length=id===3||declaredLength>remaining?remaining:declaredLength;if(length!==declaredLength)warnings.push("Adjusted segment-1 block "+id+" length to its containing section boundary.");section1Blocks.push({id,data:Buffer.from(boundedSlice(data,section1Offset+offset,length,"FMDL segment-1 block "+id)),declaredLength});}
 return {version,section0Bitmap,section1Bitmap,section0Blocks,section1Blocks,warnings};
}
export function writeFmdlContainer(container:FmdlContainer):Buffer{
 const section0=[...container.section0Blocks].sort((a,b)=>a.id-b.id),section1=[...container.section1Blocks].sort((a,b)=>a.id-b.id);
 if(section0.length>4096||section1.length>4096)throw new Error("FMDL block count exceeds the safety limit.");
 const seen0=new Set<number>(),seen1=new Set<number>(),section0Descriptors:Buffer[]=[],section1Descriptors:Buffer[]=[],section0Data:Buffer[]=[],section1Data:Buffer[]=[];
 let offset0=0,offset1=0,bitmap0=0n,bitmap1=0n;
 for(const block of section0){if(!Number.isInteger(block.id)||block.id<0||block.id>=64||seen0.has(block.id)||block.entryCount<0||block.entryCount>65535)throw new Error("Invalid or duplicate FMDL segment-0 block.");seen0.add(block.id);const known=FMDL_SEGMENT0_ENTRY_SIZES[block.id];if(known!==undefined&&block.data.length!==block.entryCount*known)throw new Error("Segment-0 block "+block.id+" entry data length does not match its schema.");const descriptor=Buffer.alloc(8);descriptor.writeUInt16LE(block.id,0);descriptor.writeUInt16LE(block.entryCount,2);descriptor.writeUInt32LE(offset0,4);section0Descriptors.push(descriptor);const padding=(16-block.data.length%16)%16,stored=padding?Buffer.concat([block.data,Buffer.alloc(padding)]):Buffer.from(block.data);section0Data.push(stored);offset0+=stored.length;bitmap0|=1n<<BigInt(block.id);}
 for(const block of section1){if(!Number.isInteger(block.id)||block.id<0||block.id>=64||seen1.has(block.id))throw new Error("Invalid or duplicate FMDL segment-1 block.");seen1.add(block.id);const descriptor=Buffer.alloc(12);descriptor.writeUInt32LE(block.id,0);descriptor.writeUInt32LE(offset1,4);descriptor.writeUInt32LE(block.data.length,8);section1Descriptors.push(descriptor);section1Data.push(Buffer.from(block.data));offset1+=block.data.length;bitmap1|=1n<<BigInt(block.id);}
 const descriptors=Buffer.concat([...section0Descriptors,...section1Descriptors]),descriptorPadding=(16-descriptors.length%16)%16,storedDescriptors=descriptorPadding?Buffer.concat([descriptors,Buffer.alloc(descriptorPadding)]):descriptors;
 const headerSize=64,section0Offset=headerSize+storedDescriptors.length,section1Offset=section0Offset+offset0,header=Buffer.alloc(headerSize);
 header.write("FMDL",0,"ascii");header.writeUInt32LE(container.version,4);header.writeBigUInt64LE(BigInt(headerSize),8);header.writeBigUInt64LE(bitmap0,16);header.writeBigUInt64LE(bitmap1,24);header.writeUInt32LE(section0.length,32);header.writeUInt32LE(section1.length,36);header.writeUInt32LE(section0Offset,40);header.writeUInt32LE(offset0,44);header.writeUInt32LE(section1Offset,48);header.writeUInt32LE(offset1,52);
 return Buffer.concat([header,storedDescriptors,...section0Data,...section1Data]);
}
