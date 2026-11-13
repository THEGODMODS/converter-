export type FormatInspection = {
  valid: boolean;
  format: string;
  version?: number;
  width?: number;
  height?: number;
  mipCount?: number;
  pixelFormat?: number | string;
  details: string[];
};
const supportedFtexFormats = new Set([0,1,2,3,4,8,9,10,11,12,13,14,15]);
function fail(format:string,...details:string[]):FormatInspection{return {valid:false,format,details};}

export function inspectFmdlHeader(data:Buffer):FormatInspection{
  if(data.length<56)return fail("FMDL","Header is shorter than 56 bytes.");
  if(data.toString("ascii",0,4)!=="FMDL")return fail("FMDL","Missing FMDL signature.");
  const version=data.readUInt32LE(4), descriptorsOffset=Number(data.readBigUInt64LE(8));
  const section0Count=data.readUInt32LE(32),section1Count=data.readUInt32LE(36);
  const section0Offset=data.readUInt32LE(40),section0Length=data.readUInt32LE(44);
  const section1Offset=data.readUInt32LE(48),section1Length=data.readUInt32LE(52);
  if(descriptorsOffset<56||descriptorsOffset>data.length)return fail("FMDL","Descriptor offset is outside the file.");
  if(section0Count>4096||section1Count>4096)return fail("FMDL","Unreasonable block descriptor count.");
  const descriptorBytes=section0Count*8+section1Count*12;
  if(descriptorsOffset+descriptorBytes>data.length)return fail("FMDL","Block descriptor table is truncated.");
  if(section0Offset+section0Length>data.length||section1Offset+section1Length>data.length)return fail("FMDL","Declared section range exceeds file length.");
  const knownEntrySizes:Record<number,number>={0:48,1:8,2:32,3:48,4:16,5:68,6:4,7:4,8:4,9:8,10:8,11:4,12:8,13:32,14:16,16:16,17:8,18:8,20:128};
  const seen0=new Set<number>(),seen1=new Set<number>();let cursor=descriptorsOffset;
  for(let i=0;i<section0Count;i++,cursor+=8){const id=data.readUInt16LE(cursor),count=data.readUInt16LE(cursor+2),offset=data.readUInt32LE(cursor+4);if(seen0.has(id))return fail("FMDL","Duplicate segment-0 block ID "+id+".");seen0.add(id);const entrySize=knownEntrySizes[id];if(entrySize!==undefined&&offset+count*entrySize>section0Length)return fail("FMDL","Segment-0 block "+id+" exceeds its declared section.");}
  for(let i=0;i<section1Count;i++,cursor+=12){const id=data.readUInt32LE(cursor),offset=data.readUInt32LE(cursor+4),length=data.readUInt32LE(cursor+8);if(seen1.has(id))return fail("FMDL","Duplicate segment-1 block ID "+id+".");seen1.add(id);if(offset>section1Length||(id!==3&&offset+length>section1Length))return fail("FMDL","Segment-1 block "+id+" exceeds its declared section.");}
  return {valid:true,format:"PES 2018–2021 FMDL",version,details:[`FMDL version 0x${version.toString(16)}`,`${section0Count} segment-0 blocks, ${section1Count} segment-1 blocks`]};
}

export function inspectModelHeader(data:Buffer):FormatInspection{
  if(data.length<24)return fail("MODEL","Header is shorter than 24 bytes.");
  if(data.subarray(0,8).toString("binary")!=="MODEL\0\0\0")return fail("MODEL","Missing MODEL signature (compressed WESYS files need a decompression adapter).");
  const sectionOffset=data.readUInt32LE(8),version=data.readUInt16LE(14);
  if(version<16||version>19)return fail("MODEL",`Unrecognized MODEL version ${version}; known PES 2017 versions are 16–19.`);
  if(sectionOffset<24||sectionOffset+12>data.length)return fail("MODEL","Section array offset is outside the file.");
  const recordOffset=data.readUInt32LE(sectionOffset),recordCount=data.readUInt32LE(sectionOffset+4),recordSize=data.readUInt32LE(sectionOffset+8);
  if(recordOffset<12||recordCount>4096||recordSize<4||sectionOffset+recordOffset+recordCount*recordSize>data.length)return fail("MODEL","Section array header or records are invalid.");
  return {valid:true,format:"PES 2014–2017 MODEL",version,details:[`MODEL format version ${version}`,`${recordCount} section records`]};
}

export function inspectFtexHeader(data:Buffer):FormatInspection{
  if(data.length<64)return fail("FTEX","Header is shorter than 64 bytes.");
  if(data.toString("ascii",0,4)!=="FTEX")return fail("FTEX","Missing FTEX signature.");
  const version=data.readFloatLE(4),pixelFormat=data.readUInt16LE(8);
  const width=data.readUInt16LE(10),height=data.readUInt16LE(12),depth=data.readUInt16LE(14);
  const mipCount=data.readUInt8(16),textureType=data.readUInt32LE(28),variantCount=data.readUInt8(32);
  if(version<2.025||version>2.045)return fail("FTEX",`Unsupported FTEX version ${version.toFixed(3)}.`);
  if(!supportedFtexFormats.has(pixelFormat))return fail("FTEX",`Unsupported FTEX pixel format ${pixelFormat}.`);
  if(!width||!height||!depth||!mipCount)return fail("FTEX","Width, height, depth and mip count must be non-zero.");
  if(variantCount!==0)return fail("FTEX","Multi-variant FTEX files are not supported by this reader yet.");
  const imageCount=(textureType&4)!==0?6:1;
  const frameCount=imageCount*mipCount,tableEnd=64+frameCount*16;
  if(frameCount>512||tableEnd>data.length)return fail("FTEX","Mipmap descriptor table is truncated or unreasonable.");
  for(let i=0;i<frameCount;i++){
    const p=64+i*16,offset=data.readUInt32LE(p),rawSize=data.readUInt32LE(p+4),compressedSize=data.readUInt32LE(p+8),mipIndex=data.readUInt8(p+12),chunks=data.readUInt16LE(p+14);
    if(mipIndex>=mipCount||offset<tableEnd||offset>=data.length||rawSize>512*1024*1024||compressedSize>512*1024*1024||chunks>0&&offset+chunks*8>data.length)return fail("FTEX",`Invalid mipmap descriptor at index ${i}.`);
  }
  return {valid:true,format:"PES 2018–2021 FTEX",version,width,height,mipCount,pixelFormat,details:[`FTEX ${version.toFixed(3)}`,`${width} × ${height} × ${depth}`,`${mipCount} mip levels`,`Pixel format ${pixelFormat}`]};
}

export function inspectDdsHeader(data:Buffer):FormatInspection{
  if(data.length<128)return fail("DDS","File is shorter than the 128-byte DDS header.");
  if(data.toString("ascii",0,4)!=="DDS ")return fail("DDS","Missing DDS signature.");
  if(data.readUInt32LE(4)!==124||data.readUInt32LE(76)!==32)return fail("DDS","Invalid DDS header or pixel-format structure size.");
  const height=data.readUInt32LE(12),width=data.readUInt32LE(16),mipCount=Math.max(1,data.readUInt32LE(28));
  if(!width||!height||width>32768||height>32768||mipCount>32)return fail("DDS","Invalid or unreasonable DDS dimensions/mip count.");
  const fourCC=data.toString("ascii",84,88);
  let pixelFormat=fourCC||"RGBA8";
  if(fourCC==="DX10"){
    if(data.length<148)return fail("DDS","DDS DX10 extension header is truncated.");
    const dxgi=data.readUInt32LE(128);
    const map:Record<number,string>={61:"R8",71:"BC1",72:"BC1_SRGB",74:"BC2",75:"BC2_SRGB",77:"BC3",78:"BC3_SRGB",80:"BC4",83:"BC5",95:"BC6H",98:"BC7",99:"BC7_SRGB",10:"RGBA16F",2:"RGBA32F",24:"R10G10B10A2",26:"R11G11B10F"};
    pixelFormat=map[dxgi]??`DXGI ${dxgi}`;
  }
  return {valid:true,format:"DirectDraw Surface",width,height,mipCount,pixelFormat,details:[`${width} × ${height}`,`${mipCount} mip levels`,`Pixel format ${pixelFormat}`]};
}
