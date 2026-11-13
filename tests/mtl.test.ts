import {deflateSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {parsePes2017Mtl} from "../engine/formats/mtl";
const xml='<materialset><material name="Face_Game_mat" shader="Face"><sampler name="DiffuseMap" path="./face_c.dds" srgb="1" minfilter="linear" magfilter="linear" mipfilter="linear" uaddr="wrap" vaddr="wrap" waddr="wrap" maxaniso="2"/><sampler name="NormalMap" path="textures/face_n.dds" srgb="0"/></material></materialset>';
describe("PES 2017 MTL parser",()=>{
 it("reads material shader and texture sampler settings",()=>{const result=parsePes2017Mtl(Buffer.from(xml));expect(result.materials).toHaveLength(1);expect(result.materials[0].shader).toBe("Face");expect(result.materials[0].samplers[0]).toMatchObject({name:"DiffuseMap",path:"face_c.dds",srgb:true,minFilter:"linear",uAddress:"wrap",maxAnisotropy:2});expect(result.materials[0].samplers[1].srgb).toBe(false);});
 it("reads zlib-compressed material files",()=>{const result=parsePes2017Mtl(deflateSync(Buffer.from(xml)));expect(result.wasCompressed).toBe(true);expect(result.materials[0].name).toBe("Face_Game_mat");});
 it("rejects duplicate material names",()=>{expect(()=>parsePes2017Mtl(Buffer.from('<materialset><material name="x" shader="Face"></material><material name="X" shader="Face"></material></materialset>'))).toThrow(/duplicate material/i);});
 it("rejects traversal and absolute sampler paths",()=>{expect(()=>parsePes2017Mtl(Buffer.from('<materialset><material name="x" shader="Face"><sampler name="DiffuseMap" path="../outside.dds"/></material></materialset>'))).toThrow(/escapes/i);expect(()=>parsePes2017Mtl(Buffer.from('<materialset><material name="x" shader="Face"><sampler name="DiffuseMap" path="C:\\face.dds"/></material></materialset>'))).toThrow(/absolute/i);});
 it("rejects external entity declarations",()=>{expect(()=>parsePes2017Mtl(Buffer.from('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///x">]><materialset><material name="x" shader="Face"></material></materialset>'))).toThrow(/unsafe XML/i);});
 it("rejects malformed MTL files",()=>{expect(()=>parsePes2017Mtl(Buffer.from("not xml"))).toThrow(/zlib-compressed/i);});
});
