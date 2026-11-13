import { createHash } from "node:crypto";

export type FpkEntry={name:string;data:Buffer;offset:number;size:number};
export type FpkArchive={kind:"fpk"|"fpkd";platform:string;version:number;entries:FpkEntry[]};
const HEADER_SIZE=48,ENTRY_SIZE=48,MAX_ENTRIES=10000,MAX_ENTRY_SIZE=256*1024*1024,MAX_TOTAL_SIZE=1024*1024*1024;
function fail(message:string):never{throw new Error("Invalid Fox FPK archive: "+message);}
export function parseFpkArchive(data:Buffer):FpkArchive{
 if(data.length<HEADER_SIZE)fail("header is truncated.");
 if(data.toString("ascii",0,6)!=="foxfpk")fail("magic is not foxfpk.");
 const marker=data.toString("ascii",6,7),kind=marker==="d"?"fpkd":marker==="\0"?"fpk":null;
 if(!kind)fail("unknown package type marker.");
 const platform=data.toString("ascii",7,10),declaredSize=data.readUInt32LE(10),version=data.readUInt32LE(32),count=data.readUInt32LE(36);
 if(platform!=="win")fail("unsupported platform "+JSON.stringify(platform)+".");
 if(declaredSize!==data.length)fail("declared archive size does not match file size.");
 if(version!==2)fail("unsupported archive version "+version+".");
 if(count>MAX_ENTRIES)fail("entry count exceeds the safety limit.");
 const tableEnd=HEADER_SIZE+count*ENTRY_SIZE;
 if(!Number.isSafeInteger(tableEnd)||tableEnd>data.length)fail("entry table is truncated.");
 const entries:FpkEntry[]=[];let total=0;const names=new Set<string>();
 for(let i=0;i<count;i++){
  const at=HEADER_SIZE+i*ENTRY_SIZE,offsetBig=data.readBigUInt64LE(at),sizeBig=data.readBigUInt64LE(at+8),nameOffsetBig=data.readBigUInt64LE(at+16),nameLengthBig=data.readBigUInt64LE(at+24);
  for(const [value,label] of [[offsetBig,"content offset"],[sizeBig,"content size"],[nameOffsetBig,"name offset"],[nameLengthBig,"name length"]] as const)if(value>BigInt(Number.MAX_SAFE_INTEGER))fail(label+" exceeds safe integer range.");
  const offset=Number(offsetBig),size=Number(sizeBig),nameOffset=Number(nameOffsetBig),nameLength=Number(nameLengthBig);
  if(size>MAX_ENTRY_SIZE)fail("entry exceeds the per-file size limit.");
  total+=size;if(total>MAX_TOTAL_SIZE)fail("total unpacked size exceeds the safety limit.");
  if(offset< tableEnd||offset+size>data.length||nameOffset<tableEnd||nameOffset+nameLength>data.length)fail("entry "+i+" points outside archive data.");
  const nameBytes=data.subarray(nameOffset,nameOffset+nameLength),name=nameBytes.toString("utf8");
  if(!name||name.includes("\uFFFD")||name.includes("\0"))fail("entry "+i+" has an invalid filename.");
  const normalized=name.replaceAll("\\","/");
  if(normalized.startsWith("/")||/^[a-z]:/i.test(normalized)||normalized.split("/").some(part=>part===".."||part==="."||part===""))fail("entry "+i+" has an unsafe path.");
  if(names.has(normalized.toLowerCase()))fail("duplicate entry path "+normalized+".");
  names.add(normalized.toLowerCase());
  const digest=data.subarray(at+32,at+48),actual=createHash("md5").update(nameBytes).digest();
  if(!digest.equals(actual))fail("filename checksum mismatch for "+normalized+".");
  entries.push({name:normalized,data:Buffer.from(data.subarray(offset,offset+size)),offset,size});
 }
 return {kind,platform,version,entries};
}
