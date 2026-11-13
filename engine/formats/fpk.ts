import { createHash } from "node:crypto";

export type FpkEntry={name:string;data:Buffer;offset:number;size:number};
export type FpkArchive={kind:"fpk"|"fpkd";platform:string;version:number;entries:FpkEntry[];references:string[]};
const HEADER_SIZE=48,ENTRY_SIZE=48,REFERENCE_SIZE=16,MAX_ENTRIES=10000,MAX_ENTRY_SIZE=256*1024*1024,MAX_TOTAL_SIZE=1024*1024*1024;
function fail(message:string):never{throw new Error("Invalid Fox FPK archive: "+message);}
function safeRange(data:Buffer,offset:number,length:number,label:string):Buffer{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>data.length)fail(label+" points outside the archive.");return data.subarray(offset,offset+length);}
function readName(data:Buffer,offset:number,length:number,label:string):{name:string;bytes:Buffer}{
 const bytes=safeRange(data,offset,length,label+" name");
 if(!length||bytes.includes(0))fail(label+" has an empty or NUL-containing name.");
 const name=bytes.toString("utf8");
 if(name.includes("\uFFFD"))fail(label+" has invalid UTF-8.");
 if(data[offset+length]!==0)fail(label+" name is not NUL-terminated.");
 const storedPath=name.replaceAll("\\\\","/");
 // Fox package entries commonly use /Assets/... as a virtual root path.
 // Remove that marker before inventory use; never treat it as a disk-root path.
 const normalized=storedPath.startsWith("/Assets/")?storedPath.slice(1):storedPath;
 if(normalized.startsWith("/")||/^[a-z]:/i.test(normalized)||normalized.split("/").some(part=>!part||part==="."||part===".."))fail(label+" contains an unsafe path.");
 return {name:normalized,bytes};
}
/**
 * Fox FPK/FPKD v2 reader.
 * Layout: 48-byte header, 48-byte entries, 16-byte package references,
 * NUL-terminated names, then 16-byte-aligned payloads.
 * Offsets and lengths in entry/reference records are 32-bit fields separated
 * by reserved words; they are NOT 64-bit values.
 */
export function parseFpkArchive(data:Buffer):FpkArchive{
 if(data.length<HEADER_SIZE)fail("header is truncated.");
 if(data.toString("ascii",0,6)!=="foxfpk")fail("magic is not foxfpk.");
 const marker=data.readUInt8(6),kind=marker===0?"fpk":marker===0x64?"fpkd":null;
 if(!kind)fail("unknown package type marker.");
 const platform=data.toString("ascii",7,10),declaredSize=data.readUInt32LE(10),version=data.readUInt32LE(32),count=data.readUInt32LE(36),referenceCount=data.readUInt32LE(40);
 if(platform!=="win")fail("unsupported platform "+JSON.stringify(platform)+".");
 if(declaredSize!==data.length)fail("declared archive size does not match file size.");
 if(version!==2)fail("unsupported archive version "+version+".");
 if(count>MAX_ENTRIES||referenceCount>10)fail("entry or package-reference count exceeds the safety limit.");
 if(data.readUInt32LE(44)!==0)fail("reserved header field is non-zero.");
 const tableEnd=HEADER_SIZE+count*ENTRY_SIZE+referenceCount*REFERENCE_SIZE;
 if(!Number.isSafeInteger(tableEnd)||tableEnd>data.length)fail("entry/reference table is truncated.");
 const rawEntries:Array<{offset:number;size:number;nameOffset:number;nameLength:number;hash:Buffer}>=[];
 const names=new Set<string>();let total=0;
 for(let i=0;i<count;i++){
  const at=HEADER_SIZE+i*ENTRY_SIZE;
  const offset=data.readUInt32LE(at),reserved0=data.readUInt32LE(at+4),size=data.readInt32LE(at+8),reserved1=data.readUInt32LE(at+12),nameOffset=data.readInt32LE(at+16),reserved2=data.readUInt32LE(at+20),nameLength=data.readInt32LE(at+24),reserved3=data.readUInt32LE(at+28);
  if(reserved0||reserved1||reserved2||reserved3)fail("entry "+i+" has non-zero reserved fields.");
  if(size<0||nameOffset<0||nameLength<=0)fail("entry "+i+" has a negative or empty range.");
  if(size>MAX_ENTRY_SIZE)fail("entry exceeds the per-file size limit.");
  total+=size;if(total>MAX_TOTAL_SIZE)fail("total unpacked size exceeds the safety limit.");
  rawEntries.push({offset,size,nameOffset,nameLength,hash:Buffer.from(safeRange(data,at+32,16,"entry filename checksum"))});
 }
 const references:Array<{nameOffset:number;nameLength:number}>=[];const refBase=HEADER_SIZE+count*ENTRY_SIZE;
 for(let i=0;i<referenceCount;i++){const at=refBase+i*REFERENCE_SIZE,nameOffset=data.readInt32LE(at),reserved0=data.readUInt32LE(at+4),nameLength=data.readInt32LE(at+8),reserved1=data.readUInt32LE(at+12);if(reserved0||reserved1||nameOffset<0||nameLength<=0)fail("package reference "+i+" is malformed.");references.push({nameOffset,nameLength});}
 const entryNames=rawEntries.map((entry,i)=>readName(data,entry.nameOffset,entry.nameLength,"entry "+i));
 const referenceNames=references.map((ref,i)=>readName(data,ref.nameOffset,ref.nameLength,"package reference "+i).name);
 const nameEnd=Math.max(tableEnd,...rawEntries.map(entry=>entry.nameOffset+entry.nameLength+1),...references.map(ref=>ref.nameOffset+ref.nameLength+1));
 const minimumDataOffset=Math.ceil(nameEnd/16)*16;
 const payloadRanges:Array<{start:number;end:number;index:number}>=[];
 const entries:FpkEntry[]=rawEntries.map((entry,i)=>{
  const {name,bytes}=entryNames[i];
  if(names.has(name.toLowerCase()))fail("duplicate entry path "+name+".");names.add(name.toLowerCase());
  if(!createHash("md5").update(bytes).digest().equals(entry.hash))fail("filename checksum mismatch for "+name+".");
  if(entry.offset<minimumDataOffset||entry.offset%16!==0)fail("entry "+i+" payload overlaps metadata or is not 16-byte aligned.");
  const payload=safeRange(data,entry.offset,entry.size,"entry "+i+" payload");
  payloadRanges.push({start:entry.offset,end:entry.offset+entry.size,index:i});
  return {name,data:Buffer.from(payload),offset:entry.offset,size:entry.size};
 });
 payloadRanges.sort((a,b)=>a.start-b.start);
 for(let i=1;i<payloadRanges.length;i++)if(payloadRanges[i].start<payloadRanges[i-1].end)fail("entry payloads overlap (entries "+payloadRanges[i-1].index+" and "+payloadRanges[i].index+").");
 return {kind,platform,version,entries,references:referenceNames};
}
