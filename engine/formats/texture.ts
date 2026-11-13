import { deflateSync, inflateSync } from "node:zlib";

export type TextureColorSpace = "LINEAR" | "SRGB" | "NORMAL";
export type TextureInfo = { width:number;height:number;depth:number;mipCount:number;pixelFormat:number;formatName:string;cubeMap:boolean;colorSpace:TextureColorSpace };
export class TextureFormatError extends Error { constructor(message:string){super(message);this.name="TextureFormatError";} }
const formats:Record<number,{name:string;block:number;bytes:number;dxgi?:number;fourCC?:string}> = {
 0:{name:"RGBA8",block:1,bytes:4},1:{name:"R8",block:1,bytes:1,dxgi:61},
 2:{name:"BC1",block:4,bytes:8,fourCC:"DXT1"},3:{name:"BC2",block:4,bytes:16,fourCC:"DXT3"},
 4:{name:"BC3",block:4,bytes:16,fourCC:"DXT5"},8:{name:"BC4",block:4,bytes:8,dxgi:80},
 9:{name:"BC5",block:4,bytes:16,dxgi:83},10:{name:"BC6H",block:4,bytes:16,dxgi:95},
 11:{name:"BC7",block:4,bytes:16,dxgi:98},12:{name:"RGBA16F",block:1,bytes:8,dxgi:10},
 13:{name:"RGBA32F",block:1,bytes:16,dxgi:2},14:{name:"R10G10B10A2",block:1,bytes:4,dxgi:24},
 15:{name:"R11G11B10F",block:1,bytes:4,dxgi:26}
};
const dxgiToFtex=new Map<number,number>(Object.entries(formats).filter(([,v])=>v.dxgi!==undefined).map(([k,v])=>[v.dxgi!,Number(k)] as [number,number]));
for(const [dxgi,id] of [[72,2],[75,3],[78,4],[99,11]] as const)dxgiToFtex.set(dxgi,id);
function mipSize(format:number,width:number,height:number,depth:number,mip:number):number{
 const f=formats[format];if(!f)throw new TextureFormatError("Unsupported FTEX pixel format "+format+".");
 const w=Math.max(width>>mip,1),h=Math.max(height>>mip,1),d=Math.max(depth>>mip,1);
 return Math.ceil(w/f.block)*Math.ceil(h/f.block)*d*f.bytes;
}
function readFrame(data:Buffer,offset:number,chunks:number,rawSize:number,compressedSize:number):Buffer{
 const range=(start:number,length:number)=>{if(start<0||length<0||start+length>data.length)throw new TextureFormatError("FTEX frame points outside the file.");return data.subarray(start,start+length);};
 if(chunks===0){const bytes=range(offset,compressedSize||rawSize);try{return compressedSize?inflateSync(bytes):Buffer.from(bytes);}catch{throw new TextureFormatError("FTEX frame decompression failed.");}}
 if(chunks>65535)throw new TextureFormatError("FTEX chunk count is unreasonable.");
 const table=range(offset,chunks*8),parts:Buffer[]=[];
 for(let i=0;i<chunks;i++){const p=i*8,cs=table.readUInt16LE(p),us=table.readUInt16LE(p+2),relative=table.readUInt32LE(p+4)&0x7fffffff;if(relative<chunks*8)throw new TextureFormatError("FTEX chunk payload overlaps its descriptor table.");const bytes=range(offset+relative,cs);let decoded:Buffer;try{decoded=cs===us?Buffer.from(bytes):inflateSync(bytes);}catch{throw new TextureFormatError("FTEX chunk decompression failed.");}if(decoded.length!==us)throw new TextureFormatError("FTEX chunk size does not match its descriptor.");parts.push(decoded);}
 return Buffer.concat(parts);
}
export function inspectFtex(data:Buffer):TextureInfo{
 if(data.length<64||data.toString("ascii",0,4)!=="FTEX")throw new TextureFormatError("Not a valid FTEX file.");
 const version=data.readFloatLE(4),pixelFormat=data.readUInt16LE(8),width=data.readUInt16LE(10),height=data.readUInt16LE(12),depth=data.readUInt16LE(14),mipCount=data.readUInt8(16),textureType=data.readUInt32LE(28),variants=data.readUInt8(32);
 if(version<2.025||version>2.045)throw new TextureFormatError("Unsupported FTEX version "+version.toFixed(3)+".");
 if(!formats[pixelFormat])throw new TextureFormatError("Unsupported FTEX pixel format "+pixelFormat+".");
 if(!width||!height||!depth||!mipCount||variants!==0)throw new TextureFormatError("Invalid dimensions, mip count or FTEX variant.");
 const cubeMap=(textureType&4)!==0,frames=(cubeMap?6:1)*mipCount;
 if(64+frames*16>data.length)throw new TextureFormatError("FTEX mipmap table is truncated.");
 for(let i=0;i<frames;i++){const p=64+i*16,offset=data.readUInt32LE(p),raw=data.readUInt32LE(p+4),compressed=data.readUInt32LE(p+8),index=data.readUInt8(p+12),chunks=data.readUInt16LE(p+14);if(index>=mipCount||raw>512*1024*1024||compressed>512*1024*1024||offset>=data.length||chunks>65535)throw new TextureFormatError("Invalid FTEX mipmap descriptor.");}
 const colorBits=textureType&0x0f,colorSpace:TextureColorSpace=colorBits===3?"SRGB":colorBits===9?"NORMAL":"LINEAR";
 return {width,height,depth,mipCount,pixelFormat,formatName:formats[pixelFormat].name,cubeMap,colorSpace};
}
function ddsHeader(info:TextureInfo):Buffer{
 const f=formats[info.pixelFormat],dx10=f.dxgi!==undefined,fourCC=f.fourCC??(dx10?"DX10":"\0\0\0\0");
 const header=Buffer.alloc(dx10?148:128);header.write("DDS ",0,"ascii");header.writeUInt32LE(124,4);
 const compressed=info.pixelFormat!==0;
 let flags=0x1|0x2|0x4|0x1000; if(info.mipCount>1)flags|=0x20000;
 flags|=compressed?0x80000:0x8;
 if(info.depth>1)flags|=0x800000;
 header.writeUInt32LE(flags,8);header.writeUInt32LE(info.height,12);header.writeUInt32LE(info.width,16);
 header.writeUInt32LE(compressed?mipSize(info.pixelFormat,info.width,info.height,info.depth,0):info.width*4,20);
 header.writeUInt32LE(info.depth,24);header.writeUInt32LE(info.mipCount,28);
 header.writeUInt32LE(32,76);header.writeUInt32LE(dx10||f.fourCC?0x4:0x41,80);header.write(fourCC,84,"ascii");
 if(info.pixelFormat===0){header.writeUInt32LE(32,88);header.writeUInt32LE(0x00ff0000,92);header.writeUInt32LE(0x0000ff00,96);header.writeUInt32LE(0x000000ff,100);header.writeUInt32LE(0xff000000,104);}
 let caps=0x1000,caps2=0;if(info.mipCount>1)caps|=0x8|0x400000;if(info.cubeMap){caps|=0x8;caps2=0xfe00;}if(info.depth>1){caps|=0x8;caps2=0x200000;}
 header.writeUInt32LE(caps,108);header.writeUInt32LE(caps2,112);
 if(dx10){header.writeUInt32LE(f.dxgi!,128);header.writeUInt32LE(info.depth>1?4:3,132);header.writeUInt32LE(info.cubeMap?4:0,136);header.writeUInt32LE(1,140);header.writeUInt32LE(0,144);}
 return header;
}
export function ftexToDds(input:Buffer):{data:Buffer;info:TextureInfo}{
 const info=inspectFtex(input),imageCount=info.cubeMap?6:1,frames:Buffer[]=[];
 for(let image=0;image<imageCount;image++)for(let mip=0;mip<info.mipCount;mip++){
  const index=image*info.mipCount+mip,p=64+index*16,offset=input.readUInt32LE(p),raw=input.readUInt32LE(p+4),compressed=input.readUInt32LE(p+8),chunks=input.readUInt16LE(p+14);
  let frame=readFrame(input,offset,chunks,raw,compressed);const expected=mipSize(info.pixelFormat,info.width,info.height,info.depth,mip);
  if(frame.length<expected)throw new TextureFormatError("FTEX mip "+mip+" is shorter than its declared dimensions.");
  if(frame.length>expected)frame=frame.subarray(0,expected);frames.push(frame);
 }
 return {data:Buffer.concat([ddsHeader(info),...frames]),info};
}
function parseDds(input:Buffer,colorSpace:TextureColorSpace):{info:TextureInfo;dataOffset:number}{
 if(input.length<128||input.toString("ascii",0,4)!=="DDS "||input.readUInt32LE(4)!==124||input.readUInt32LE(76)!==32)throw new TextureFormatError("Invalid DDS header.");
 const height=input.readUInt32LE(12),width=input.readUInt32LE(16),depth=Math.max(1,input.readUInt32LE(24)),mipCount=Math.max(1,input.readUInt32LE(28)),fourCC=input.toString("ascii",84,88);
 if(!width||!height||width>32768||height>32768||mipCount>32)throw new TextureFormatError("Invalid DDS dimensions or mip count.");
 let pixelFormat:number,dataOffset=128;
 if(fourCC==="DX10"){if(input.length<148)throw new TextureFormatError("DDS DX10 header is truncated.");const dxgi=input.readUInt32LE(128);const found=dxgiToFtex.get(dxgi);if(found===undefined)throw new TextureFormatError("Unsupported DDS DXGI format "+dxgi+".");pixelFormat=found;dataOffset=148;}
 else if(fourCC==="DXT1")pixelFormat=2;else if(fourCC==="DXT3")pixelFormat=3;else if(fourCC==="DXT5")pixelFormat=4;
 else if(fourCC==="\0\0\0\0"&&input.readUInt32LE(88)===32&&input.readUInt32LE(92)===0x00ff0000&&input.readUInt32LE(96)===0x0000ff00&&input.readUInt32LE(100)===0x000000ff&&input.readUInt32LE(104)===0xff000000)pixelFormat=0;
 else throw new TextureFormatError("DDS pixel format is not supported for FTEX conversion.");
 const caps2=input.readUInt32LE(112),cubeMap=(caps2&0x200)!==0;if(cubeMap&&(caps2&0xfe00)!==0xfe00)throw new TextureFormatError("Incomplete DDS cube maps are not supported.");
 const actualMips=(input.readUInt32LE(8)&0x20000)!==0&&mipCount>1?mipCount:1;
 return {info:{width,height,depth,mipCount:actualMips,pixelFormat,formatName:formats[pixelFormat].name,cubeMap,colorSpace},dataOffset};
}
export function ddsToFtex(input:Buffer,colorSpace:TextureColorSpace="SRGB"): {data:Buffer;info:TextureInfo}{
 const {info,dataOffset}=parseDds(input,colorSpace),imageCount=info.cubeMap?6:1,frames:Buffer[]=[];let cursor=dataOffset;
 for(let image=0;image<imageCount;image++)for(let mip=0;mip<info.mipCount;mip++){const size=mipSize(info.pixelFormat,info.width,info.height,info.depth,mip);if(cursor+size>input.length)throw new TextureFormatError("DDS mipmap payload is truncated.");frames.push(input.subarray(cursor,cursor+size));cursor+=size;}
 if(cursor!==input.length)throw new TextureFormatError("DDS contains trailing or unaccounted payload bytes; refusing lossy conversion.");
 const descriptorBytes=frames.length*16,header=Buffer.alloc(64+descriptorBytes),payloads:Buffer[]=[];let position=header.length;
 const ftexVersion=info.pixelFormat>4?2.04:2.03,textureType=(colorSpace==="SRGB"?3:colorSpace==="NORMAL"?9:1)|(info.cubeMap?4:0);
 header.write("FTEX",0,"ascii");header.writeFloatLE(ftexVersion,4);header.writeUInt16LE(info.pixelFormat,8);header.writeUInt16LE(info.width,10);header.writeUInt16LE(info.height,12);header.writeUInt16LE(info.depth,14);header.writeUInt8(info.mipCount,16);header.writeUInt32LE(textureType,28);
 for(let i=0;i<frames.length;i++){
  while(position%8){payloads.push(Buffer.from([0]));position++;}
  const frame=frames[i],chunks:{stored:Buffer;rawSize:number}[]=[];
  for(let start=0;start<frame.length;start+=16384){const raw=frame.subarray(start,Math.min(start+16384,frame.length)),packed=deflateSync(raw,{level:9});chunks.push({stored:packed.length<raw.length?packed:raw,rawSize:raw.length});}
  const count=chunks.length,table=Buffer.alloc(count*8);let chunkData=Buffer.alloc(0),compressedTotal=0;
  for(let j=0;j<count;j++){const chunk=chunks[j];table.writeUInt16LE(chunk.stored.length,j*8);table.writeUInt16LE(chunk.rawSize,j*8+2);table.writeUInt32LE(count*8+chunkData.length,j*8+4);chunkData=Buffer.concat([chunkData,chunk.stored]);compressedTotal+=chunk.stored.length;}
  const descriptor=64+i*16;header.writeUInt32LE(position,descriptor);header.writeUInt32LE(frame.length,descriptor+4);header.writeUInt32LE(compressedTotal,descriptor+8);header.writeUInt8(i%info.mipCount,descriptor+12);header.writeUInt8(0,descriptor+13);header.writeUInt16LE(count,descriptor+14);
  const frameData=Buffer.concat([table,chunkData]);payloads.push(frameData);position+=frameData.length;
 }
 return {data:Buffer.concat([header,...payloads]),info};
}
