import path from "node:path";
export type CpkInputFile={path:string;data:Buffer};
type UtfType="string"|"u32"|"u64";
type UtfColumn={name:string;type:UtfType};
const ALIGNMENT=0x800,MAX_FILES=5000,MAX_TOTAL=1024*1024*1024;
function align(value:number,alignment:number){return Math.ceil(value/alignment)*alignment;}
function crypt(input:Buffer):Buffer{const output=Buffer.alloc(input.length);let key=0x5f;for(let i=0;i<input.length;i++){output[i]=input[i]^(key&255);key=(key*0x15)&255;}return output;}
function writeUtf(tableName:string,columns:UtfColumn[],rows:Array<Record<string,string|number|bigint>>):Buffer{
 const strings:Buffer[]=[];const stringOffsets=new Map<string,number>();let stringLength=0;
 const addString=(value:string)=>{const existing=stringOffsets.get(value);if(existing!==undefined)return existing;const encoded=Buffer.from(value+"\0","utf8"),offset=stringLength;strings.push(encoded);stringOffsets.set(value,offset);stringLength+=encoded.length;return offset;};
 const tableNameOffset=addString(tableName),columnBuffer=Buffer.alloc(columns.length*5),rowLength=columns.reduce((sum,c)=>sum+(c.type==="string"||c.type==="u32"?4:8),0),rowBuffer=Buffer.alloc(rows.length*rowLength);
 for(let i=0;i<columns.length;i++){const column=columns[i],p=i*5;columnBuffer.writeUInt8((5<<4)|(column.type==="string"?10:column.type==="u32"?4:6),p);columnBuffer.writeUInt32BE(addString(column.name),p+1);}
 for(let r=0;r<rows.length;r++){let p=r*rowLength;for(const column of columns){const value=rows[r][column.name];if(column.type==="string"){if(typeof value!=="string")throw new Error("Invalid UTF string column "+column.name);rowBuffer.writeUInt32BE(addString(value),p);p+=4;}else if(column.type==="u32"){if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new Error("Invalid UTF uint32 column "+column.name);rowBuffer.writeUInt32BE(value,p);p+=4;}else{const n=typeof value==="bigint"?value:BigInt(value);if(n<0n||n>0xffffffffffffffffn)throw new Error("Invalid UTF uint64 column "+column.name);rowBuffer.writeBigUInt64BE(n,p);p+=8;}}}
 const stringBuffer=Buffer.concat(strings),stringPadding=Buffer.alloc((8-(32+columnBuffer.length+rowBuffer.length+stringBuffer.length)%8)%8);
 const columnOffset=32,rowOffset=columnOffset+columnBuffer.length,stringOffset=rowOffset+rowBuffer.length,dataOffset=stringOffset+stringBuffer.length+stringPadding.length;
 const header=Buffer.alloc(32);header.write("@UTF",0,"ascii");header.writeUInt32BE(dataOffset-8,4);header.writeUInt32BE(rowOffset-8,8);header.writeUInt32BE(stringOffset-8,12);header.writeUInt32BE(dataOffset-8,16);header.writeUInt32BE(tableNameOffset,20);header.writeUInt16BE(columns.length,24);header.writeUInt16BE(rowLength,26);header.writeUInt32BE(rows.length,28);
 const plaintext=Buffer.concat([header,columnBuffer,rowBuffer,stringBuffer,stringPadding]);
 const outer=Buffer.alloc(16);outer.write(tableName,0,"ascii");outer.writeUInt32LE(0,4);outer.writeBigUInt64LE(BigInt(plaintext.length),8);
 return Buffer.concat([outer,crypt(plaintext)]);
}
function normalizeArchivePath(input:string):string{
 if(!input||input.includes("\0")||path.posix.isAbsolute(input)||path.win32.isAbsolute(input))throw new Error("CPK paths must be relative and cannot contain null bytes.");
 const normalized=input.replaceAll("\\","/").split("/").filter(Boolean).join("/");
 if(!normalized||normalized.split("/").some(part=>part==="."||part===".."))throw new Error("CPK path contains an unsafe traversal segment.");
 return normalized;
}
export function buildCpk(files:CpkInputFile[]):Buffer{
 if(files.length===0||files.length>MAX_FILES)throw new Error("CPK requires between 1 and "+MAX_FILES+" files.");
 const normalized=files.map(f=>({path:normalizeArchivePath(f.path),data:f.data}));
 const seen=new Set<string>();let total=0;
 for(const file of normalized){const key=file.path.toLowerCase();if(seen.has(key))throw new Error("Duplicate CPK path: "+file.path);seen.add(key);total+=file.data.length;if(total>MAX_TOTAL)throw new Error("CPK payload exceeds the 1 GiB safety limit.");}
 const parts:Buffer[]=[Buffer.alloc(ALIGNMENT)];parts[0].write("(c)CRI",ALIGNMENT-6,"ascii");let position=ALIGNMENT;
 const tocRows:Array<Record<string,string|number|bigint>>=[];
 for(const file of normalized.sort((a,b)=>a.path.toUpperCase().localeCompare(b.path.toUpperCase()))){
  const aligned=align(position,ALIGNMENT);if(aligned>position){parts.push(Buffer.alloc(aligned-position));position=aligned;}
  const fileOffset=position-ALIGNMENT;parts.push(file.data);position+=file.data.length;
  const slash=file.path.lastIndexOf("/"),dir=slash<0?"":file.path.slice(0,slash),name=slash<0?file.path:file.path.slice(slash+1);
  tocRows.push({DirName:dir,FileName:name,FileSize:file.data.length,ExtractSize:file.data.length,FileOffset:BigInt(fileOffset),ID:tocRows.length,UserString:""});
 }
 const tocOffset=align(position,16);if(tocOffset>position){parts.push(Buffer.alloc(tocOffset-position));position=tocOffset;}
 const toc=writeUtf("TOC ",[{name:"DirName",type:"string"},{name:"FileName",type:"string"},{name:"FileSize",type:"u32"},{name:"ExtractSize",type:"u32"},{name:"FileOffset",type:"u64"},{name:"ID",type:"u32"},{name:"UserString",type:"string"}],tocRows);
 parts.push(toc);position+=toc.length;
 const totalSize=BigInt(position);
 const cpk=writeUtf("CPK ",[{name:"ContentOffset",type:"u64"},{name:"TocOffset",type:"u64"},{name:"TocSize",type:"u64"},{name:"Files",type:"u32"},{name:"TotalSize",type:"u64"},{name:"Version",type:"u32"},{name:"Revision",type:"u32"},{name:"Align",type:"u32"},{name:"Crc",type:"u32"}],[{ContentOffset:BigInt(ALIGNMENT),TocOffset:BigInt(tocOffset),TocSize:BigInt(toc.length),Files:normalized.length,TotalSize:totalSize,Version:7,Revision:0,Align:ALIGNMENT,Crc:0}]);
 if(cpk.length>ALIGNMENT)throw new Error("Generated CPK header table exceeds its reserved header area.");
 const output=Buffer.concat(parts);cpk.copy(output,0);return output;
}
