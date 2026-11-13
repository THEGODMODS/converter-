import {describe,expect,it} from "vitest";
import {ddsToFtex,ftexToDds} from "../engine/formats/texture";

function rgbaDds(width=4,height=4,solid=false):Buffer{
 const b=Buffer.alloc(128+width*height*4);
 b.write("DDS ",0);b.writeUInt32LE(124,4);b.writeUInt32LE(0x100f,8);
 b.writeUInt32LE(height,12);b.writeUInt32LE(width,16);b.writeUInt32LE(width*4,20);
 b.writeUInt32LE(32,76);b.writeUInt32LE(0x41,80);b.writeUInt32LE(32,88);
 b.writeUInt32LE(0x00ff0000,92);b.writeUInt32LE(0x0000ff00,96);
 b.writeUInt32LE(0x000000ff,100);b.writeUInt32LE(0xff000000,104);b.writeUInt32LE(0x1000,108);
 if(!solid)for(let i=128;i<b.length;i++)b[i]=i&255;
 return b;
}
function bc1Dds():Buffer{
 const b=Buffer.alloc(136);b.write("DDS ",0);b.writeUInt32LE(124,4);b.writeUInt32LE(0x81007,8);
 b.writeUInt32LE(4,12);b.writeUInt32LE(4,16);b.writeUInt32LE(8,20);b.writeUInt32LE(32,76);
 b.writeUInt32LE(4,80);b.write("DXT1",84,"ascii");b.writeUInt32LE(0x1000,108);b.fill(0x5a,128);
 return b;
}
describe("FTEX and DDS container conversion",()=>{
 it("round-trips uncompressed RGBA8 pixels and dimensions",()=>{
  const source=rgbaDds(),encoded=ddsToFtex(source,"SRGB"),decoded=ftexToDds(encoded.data);
  expect(decoded.info.width).toBe(4);expect(decoded.info.pixelFormat).toBe(0);
  expect(decoded.data.readUInt32LE(128)).toBe(29);expect(decoded.data.subarray(148)).toEqual(source.subarray(128));
 });
 it("round-trips BC1 blocks without recompressing image data",()=>{
  const source=bc1Dds(),encoded=ddsToFtex(source,"SRGB"),decoded=ftexToDds(encoded.data);
  expect(decoded.info.formatName).toBe("BC1");expect(decoded.data.readUInt32LE(128)).toBe(72);
  expect(decoded.data.subarray(148)).toEqual(source.subarray(128));
 });
 it("sets the explicit uncompressed flag for raw FTEX chunks",()=>{
  const source=rgbaDds(),encoded=ddsToFtex(source,"SRGB").data,imageOffset=encoded.readUInt32LE(64);
  const chunkOffset=encoded.readUInt32LE(imageOffset+4);
  expect((chunkOffset&0x80000000)>>>0).not.toBe(0);
  expect(ftexToDds(encoded).data.subarray(148)).toEqual(source.subarray(128));
 });
 it("uses the explicit compressed flag for highly compressible texture data",()=>{
  const source=rgbaDds(128,128,true),encoded=ddsToFtex(source,"SRGB").data,imageOffset=encoded.readUInt32LE(64);
  const chunkOffset=encoded.readUInt32LE(imageOffset+4);
  expect((chunkOffset&0x80000000)>>>0).toBe(0);
  expect(ftexToDds(encoded).data.subarray(148)).toEqual(source.subarray(128));
 });
 it("rejects FTEX frame descriptors with incorrect aggregate chunk sizes",()=>{
  const encoded=ddsToFtex(rgbaDds(),"SRGB").data;
  encoded.writeUInt32LE(encoded.readUInt32LE(72)+1,72);
  expect(()=>ftexToDds(encoded)).toThrow(/aggregate chunk sizes/i);
 });
 it("rejects a truncated DDS payload",()=>{expect(()=>ddsToFtex(rgbaDds().subarray(0,140))).toThrow(/truncated/i);});
});
