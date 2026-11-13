import { createHash } from "node:crypto";

export type FpkEntry={name:string;data:Buffer;offset:number;size:number};
export type FpkArchive={kind:"fpk"|"fpkd";platform:string;version:number;entries:FpkEntry[];references:string[]};
const HEADER_SIZE=48,ENTRY_SIZE=48,MAX_ENTRIES=10000,MAX_ENTRY_SIZE=256*1024*1024,MAX_TOTAL_SIZE=1024*1024*1024,MAX_ARCHIVE_SIZE=0xffffffff;
function fail(message:string):never{throw new Error("Invalid Fox FPK archive: "+message);}
function safeRange(data:Buffer,offset:number,length:number,label:string):Buffer{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>data.length)fail(label+" points outside the archive.");return data.subarray(offset,offset+length);}
function readU64(data:Buffer,offset:number,label:string):number{const value=data.readBigUInt64LE(offset);if(value>BigInt(Number.MAX_SAFE_INTEGER))fail(label+" exceeds JavaScript's safe integer range.");return Number(value);}
function normalizeVirtualName(value:string):string{
 const name=value.replace(/\\/g,"/");
 const normalized=name.startsWith("/Assets/")?name.slice(1):name;
 if(!normalized.startsWith("Assets/")||normalized.startsWith("/")||/^[a-z]:/i.test(normalized)||normalized.split("/").some(part=>!part||part==="."||part===".."))fail("entry contains an unsafe or non-Assets virtual path.");
 if(Buffer.byteLength(name,"utf8")>4096)fail("entry name exceeds 4096 UTF-8 bytes.");
 return normalized;
}
function readName(data:Buffer,offset:number,length:number,label:string):{name:string;bytes:Buffer}{
 const bytes=safeRange(data,offset,length,label+" name");
 if(!length||bytes.includes(0))fail(label+" has an empty or NUL-containing name.");
 const name=bytes.toString("utf8");
 if(name.includes("\uFFFD"))fail(label+" has invalid UTF-8.");
 if(data[offset+length]!==0)fail(label+" name is not NUL-terminated.");
 const normalized=normalizeVirtualName(name);
 return {name:normalized,bytes};
}
/** Reads the documented Fox FPK/FPKD v2 48-byte header and 48-byte records. */
export function parseFpkArchive(data:Buffer):FpkArchive{
 if(data.length<HEADER_SIZE)fail("header is truncated.");
 if(data.toString("ascii",0,6)!=="foxfpk")fail("magic is not foxfpk.");
 const marker=data.readUInt8(6),kind=marker===0?"fpk":marker===0x64?"fpkd":null;
 if(!kind)fail("unknown package type marker.");
 const platform=data.toString("ascii",7,10),declaredSize=data.readUInt32LE(10),version=data.readUInt32LE(32),count=data.readUInt32LE(36),referenceCount=data.readUInt32LE(40);
 if(platform!=="win")fail("unsupported platform "+JSON.stringify(platform)+".");
 if(declaredSize!==data.length)fail("declared archive size does not match file size.");
 if(version!==2)fail("unsupported Fox FPK header constant "+version+".");
 if(count>MAX_ENTRIES)fail("entry count exceeds the safety limit.");
 if(referenceCount!==0)fail("non-zero package reference tables are not supported by the verified Fox FPK reader.");
 if(data.readUInt32LE(44)!==0)fail("reserved header field is non-zero.");
 const tableEnd=HEADER_SIZE+count*ENTRY_SIZE;
 if(!Number.isSafeInteger(tableEnd)||tableEnd>data.length)fail("entry table is truncated.");
 const rawEntries:Array<{offset:number;size:number;nameOffset:number;nameLength:number;hash:Buffer}>=[];
 const names=new Set<string>();let total=0;
 for(let i=0;i<count;i++){
  const at=HEADER_SIZE+i*ENTRY_SIZE,offset=readU64(data,at,"entry "+i+" content offset"),size=readU64(data,at+8,"entry "+i+" content length"),nameOffset=readU64(data,at+16,"entry "+i+" name offset"),nameLength=readU64(data,at+24,"entry "+i+" name length");
  if(size>MAX_ENTRY_SIZE)fail("entry exceeds the per-file size limit.");
  total+=size;if(total>MAX_TOTAL_SIZE)fail("total unpacked size exceeds the safety limit.");
  rawEntries.push({offset,size,nameOffset,nameLength,hash:Buffer.from(safeRange(data,at+32,16,"entry filename checksum"))});
 }
 const entryNames=rawEntries.map((entry,i)=>readName(data,entry.nameOffset,entry.nameLength,"entry "+i));
 const nameEnd=Math.max(tableEnd,...rawEntries.map(entry=>entry.nameOffset+entry.nameLength+1));
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
 return {kind,platform,version:2,entries,references:[]};
}
/** Deterministic Fox v2 writer. Names are emitted as /Assets/... virtual paths. */
export function writeFpkArchive(kind:"fpk"|"fpkd",entries:Iterable<{name:string;data:Buffer}>):Buffer{
 const sorted=[...entries].map(entry=>({name:normalizeVirtualName(entry.name),storedName:"/"+normalizeVirtualName(entry.name),data:Buffer.from(entry.data)})).sort((a,b)=>a.name.localeCompare(b.name));
 if(sorted.length>MAX_ENTRIES)fail("entry count exceeds the safety limit.");
 const seen=new Set<string>();let total=0;
 for(const entry of sorted){const key=entry.name.toLowerCase();if(seen.has(key))fail("duplicate output entry path "+entry.name+".");seen.add(key);if(entry.data.length>MAX_ENTRY_SIZE)fail("entry exceeds the per-file size limit.");total+=entry.data.length;if(total>MAX_TOTAL_SIZE)fail("total unpacked size exceeds the safety limit.");}
 const align=(n:number)=>Math.ceil(n/16)*16,pad=(n:number)=>Buffer.alloc(align(n)-n);
 const namePoolParts:Buffer[]=[],contentPoolParts:Buffer[]=[],records:Array<{contentOffset:number;contentLength:number;nameOffset:number;nameLength:number;hash:Buffer}>=[];
 let nameCursor=0,contentCursor=0;
 for(const entry of sorted){const name=Buffer.from(entry.storedName,"utf8");namePoolParts.push(name,Buffer.from([0]));records.push({contentOffset:contentCursor,contentLength:entry.data.length,nameOffset:nameCursor,nameLength:name.length,hash:createHash("md5").update(name).digest()});nameCursor+=name.length+1;contentPoolParts.push(entry.data,pad(entry.data.length));contentCursor+=align(entry.data.length);}
 const namePool=Buffer.concat([...namePoolParts,pad(nameCursor)]),contentPool=Buffer.concat(contentPoolParts),nameBase=HEADER_SIZE+ENTRY_SIZE*sorted.length,contentBase=nameBase+namePool.length,totalSize=contentBase+contentPool.length;
 if(totalSize>MAX_ARCHIVE_SIZE)fail("archive exceeds Fox's 32-bit declared-size limit.");
 const header=Buffer.alloc(HEADER_SIZE);header.write("foxfpk",0,"ascii");header[6]=kind==="fpk"?0:0x64;header.write("win",7,"ascii");header.writeUInt32LE(totalSize,10);header.writeUInt32LE(2,32);header.writeUInt32LE(sorted.length,36);
 const rows=records.map(record=>{const row=Buffer.alloc(ENTRY_SIZE);row.writeBigUInt64LE(BigInt(contentBase+record.contentOffset),0);row.writeBigUInt64LE(BigInt(record.contentLength),8);row.writeBigUInt64LE(BigInt(nameBase+record.nameOffset),16);row.writeBigUInt64LE(BigInt(record.nameLength),24);record.hash.copy(row,32);return row;});
 const result=Buffer.concat([header,...rows,namePool,contentPool]);
 parseFpkArchive(result);
 return result;
}
