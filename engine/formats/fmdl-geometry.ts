import type {FmdlContainer,FmdlSegment0Block} from "./fmdl-container";
import type {FaceScene,FaceVertex,Vec2,Vec3,Vec4} from "../model/ir";
import {validateFaceScene} from "../model/ir";
const ENTRY:Record<number,number>={0:48,1:8,2:32,3:48,4:16,5:68,6:4,7:4,8:4,9:8,10:8,11:4,12:8,13:32,14:16,16:16,17:8,18:8,20:128};
const MAX_VERTICES=2_000_000;
function blockMap(container:FmdlContainer){return new Map(container.section0Blocks.map(b=>[b.id,b]));}
function records(block:FmdlSegment0Block|undefined,id:number,size:number):Buffer[]{
 if(!block)return [];
 if(block.entrySize!==undefined&&block.entrySize!==size)throw new Error("FMDL block "+id+" has an unexpected record size.");
 if(block.data.length!==block.entryCount*size)throw new Error("FMDL block "+id+" record data is truncated.");
 return Array.from({length:block.entryCount},(_,i)=>block.data.subarray(i*size,(i+1)*size));
}
function half(value:number):number{const sign=(value&0x8000)?-1:1,exponent=(value>>10)&31,mantissa=value&1023;if(exponent===31)return mantissa?Number.NaN:sign*Infinity;if(exponent===0)return sign*Math.pow(2,-14)*(mantissa/1024);return sign*Math.pow(2,exponent-15)*(1+mantissa/1024);}
function finiteFloats(data:Buffer,offset:number,count:number,label:string):number[]{if(offset<0||offset+count*4>data.length)throw new Error(label+" exceeds its FMDL data block.");const values=Array.from({length:count},(_,i)=>data.readFloatLE(offset+i*4));if(values.some(v=>!Number.isFinite(v)))throw new Error(label+" contains non-finite values.");return values;}
function stringAt(strings:string[],id:number,label:string):string{if(!Number.isInteger(id)||id<0||id>=strings.length)throw new Error(label+" references missing FMDL string "+id+".");return strings[id];}
type VertexField={type:number;format:number;offset:number;stride:number};
type MaterialInstance={name:string;shader:string;textures:Record<string,string>;parameters:Record<string,number|string|boolean>};
export function decodePes2021Fmdl(container:FmdlContainer):FaceScene{
 const b=blockMap(container),s1=new Map(container.section1Blocks.map(x=>[x.id,x.data]));
 const get=(id:number)=>b.get(id);
 const stringBlock=s1.get(3);if(!stringBlock)throw new Error("FMDL string data block 3 is missing.");
 const stringRecords=records(get(12),12,8),strings:string[]=[],lastString=0;
 for(const row of stringRecords){const dataBlock=row.readUInt16LE(0),length=row.readUInt16LE(2),offset=row.readUInt32LE(4),data=s1.get(dataBlock);if(!data||offset+length>data.length)throw new Error("FMDL string reference points outside its data block.");const value=data.subarray(offset,offset+length).toString("utf8");if(value.includes("\uFFFD"))throw new Error("FMDL string contains invalid UTF-8.");strings.push(value);if(dataBlock===3)lastString=Math.max(lastString,offset+length);}
 const bones=records(get(0),0,48).map((row,index)=>{const name=stringAt(strings,row.readUInt16LE(0),"Bone"),parent=row.readInt16LE(2),sourceTransform=[...finiteFloats(row,16,4,"Bone local transform"),...finiteFloats(row,32,4,"Bone global transform")];return {name,parentIndex:parent<0?null:parent,sourceTransform};});
 for(let i=0;i<bones.length;i++)if(bones[i].parentIndex!==null&&bones[i].parentIndex!>=bones.length)throw new Error("FMDL bone "+bones[i].name+" references a missing parent.");
 const textureRows=records(get(6),6,4).map(row=>({filename:stringAt(strings,row.readUInt16LE(0),"Texture filename"),directory:stringAt(strings,row.readUInt16LE(2),"Texture directory")}));
 const materialRows=records(get(8),8,4).map(row=>({shader:stringAt(strings,row.readUInt16LE(0),"Material shader"),technique:stringAt(strings,row.readUInt16LE(2),"Material technique")}));
 const assignments=records(get(7),7,4).map(row=>({name:stringAt(strings,row.readUInt16LE(0),"Material parameter name"),reference:row.readUInt16LE(2)}));
 const materialValues=s1.get(0)??Buffer.alloc(0),materials:MaterialInstance[]=records(get(4),4,16).map((row,index)=>{
  const name=stringAt(strings,row.readUInt16LE(0),"Material instance name"),materialID=row.readUInt16LE(4),textureCount=row.readUInt8(6),parameterCount=row.readUInt8(7),firstTexture=row.readUInt16LE(8),firstParameter=row.readUInt16LE(10),definition=materialRows[materialID];if(!definition)throw new Error("FMDL material instance "+index+" references a missing shader.");
  const textures:Record<string,string>={},parameters:Record<string,number|string|boolean>={};
  for(let i=firstTexture;i<firstTexture+textureCount;i++){const a=assignments[i];if(!a||!textureRows[a.reference])throw new Error("FMDL material texture assignment is invalid.");const t=textureRows[a.reference];textures[a.name]=[t.directory,t.filename].filter(Boolean).join("/");}
  for(let i=firstParameter;i<firstParameter+parameterCount;i++){const a=assignments[i];if(!a)throw new Error("FMDL material parameter assignment is invalid.");const offset=a.reference*16;if(offset+16>materialValues.length)throw new Error("FMDL material parameter data is truncated.");parameters[a.name]=finiteFloats(materialValues,offset,4,"Material parameter").join(",");}
  return {name,shader:definition.shader,textures,parameters};
 });
 const bufferOffsets=records(get(14),14,16).map(row=>row.readUInt32LE(8));if(bufferOffsets.length<3)throw new Error("FMDL is missing required position, vertex and face buffer offsets.");
 const meshFormatDefs=records(get(10),10,8).map(row=>({bufferID:row.readUInt8(0),fieldCount:row.readUInt8(1),stride:row.readUInt8(2),offset:row.readUInt32LE(4)}));
 const vertexFormatDefs=records(get(11),11,4).map(row=>({type:row.readUInt8(0),format:row.readUInt8(1),offset:row.readUInt16LE(2)}));
 const formatAssignments=records(get(9),9,8).map(row=>{const meshCount=row.readUInt8(0),fieldCount=row.readUInt8(1),firstMesh=row.readUInt16LE(4),firstField=row.readUInt16LE(6);if(firstMesh+meshCount>meshFormatDefs.length||firstField+fieldCount>vertexFormatDefs.length)throw new Error("FMDL mesh format assignment references missing format definitions.");const offsets:number[]=[],strides:number[]=[];for(let i=firstMesh;i<firstMesh+meshCount;i++){const d=meshFormatDefs[i];if(d.bufferID>=bufferOffsets.length)throw new Error("FMDL vertex format references a missing buffer offset.");for(let j=0;j<d.fieldCount;j++){offsets.push(bufferOffsets[d.bufferID]+d.offset);strides.push(d.stride);}}if(offsets.length!==fieldCount)throw new Error("FMDL vertex format field count is inconsistent.");return Array.from({length:fieldCount},(_,i)=>({type:vertexFormatDefs[firstField+i].type,format:vertexFormatDefs[firstField+i].format,offset:offsets[i]+vertexFormatDefs[firstField+i].offset,stride:strides[i]} as VertexField));});
 const boneGroups=records(get(5),5,68).map(row=>{const count=row.readUInt16LE(2);if(count>32)throw new Error("FMDL bone group exceeds the 32-bone limit.");const group=Array.from({length:count},(_,i)=>row.readUInt16LE(4+i*2));if(group.some(id=>id>=bones.length))throw new Error("FMDL bone group references a missing bone.");return group;});
 const groupNames=records(get(1),1,8).map(row=>stringAt(strings,row.readUInt16LE(0),"Mesh group name")),meshGroupFor=new Map<number,string>();
 for(const row of records(get(2),2,32)){const group=row.readUInt16LE(4),count=row.readUInt16LE(6),first=row.readUInt16LE(8);if(group>=groupNames.length||first+count>records(get(3),3,48).length)throw new Error("FMDL mesh group assignment is invalid.");for(let i=first;i<first+count;i++)meshGroupFor.set(i,groupNames[group]);}
 const vertexBuffer=s1.get(2);if(!vertexBuffer)throw new Error("FMDL shared vertex/index buffer block 2 is missing.");
 const faceIndexRows=records(get(17),17,8).map(row=>({first:row.readUInt32LE(0),count:row.readUInt32LE(4)}));
 const meshRows=records(get(3),3,48),meshes=meshRows.map((row,meshIndex)=>{
  const materialIndex=row.readUInt16LE(4),boneGroupID=row.readUInt16LE(6),formatID=row.readUInt16LE(8),vertexCount=row.readUInt16LE(10),firstFace=row.readUInt32LE(16),faceCount=row.readUInt32LE(20),faceDescriptorID=Number(row.readBigUInt64LE(24));
  if(vertexCount===0||vertexCount>MAX_VERTICES)throw new Error("FMDL mesh "+meshIndex+" has an invalid vertex count.");if(!materials[materialIndex])throw new Error("FMDL mesh "+meshIndex+" references a missing material.");const fields=formatAssignments[formatID];if(!fields)throw new Error("FMDL mesh "+meshIndex+" references a missing vertex format.");const descriptor=faceIndexRows[faceDescriptorID];if(!descriptor)throw new Error("FMDL mesh "+meshIndex+" references a missing face-index descriptor.");
  const group=boneGroups[boneGroupID]??[];const byType=new Map<number,VertexField>();for(const field of fields){if(byType.has(field.type))throw new Error("FMDL mesh has duplicate vertex semantic "+field.type+".");byType.set(field.type,field);}
  if(!byType.has(0))throw new Error("FMDL mesh "+meshIndex+" has no position attribute.");const readField=(field:VertexField,vertex:number,bytes:number,label:string)=>{const offset=field.offset+vertex*field.stride;if(offset<0||offset+bytes>vertexBuffer.length)throw new Error("FMDL "+label+" buffer range is invalid.");return vertexBuffer.subarray(offset,offset+bytes);};
  const readHalf4=(field:VertexField,vertex:number,label:string):number[]=>{if(field.format!==6)throw new Error("Unsupported FMDL "+label+" format "+field.format+".");const data=readField(field,vertex,8,label),out=Array.from({length:4},(_,i)=>half(data.readUInt16LE(i*2)));if(out.some(v=>!Number.isFinite(v)))throw new Error("FMDL "+label+" contains non-finite half floats.");return out;};
  const vertices:FaceVertex[]=Array.from({length:vertexCount},(_,vertex)=>{
   const posField=byType.get(0)!;if(posField.format!==1)throw new Error("FMDL position format is not float32x3.");const pos=finiteFloats(readField(posField,vertex,12,"position"),0,3,"FMDL position") as Vec3;
   const normalField=byType.get(2),tangentField=byType.get(14),colorField=byType.get(3),weightsField=byType.get(1),indicesField=byType.get(7),uvs:Vec2[]=[];
   if(weightsField&&!indicesField||indicesField&&!weightsField)throw new Error("FMDL bone weight and index attributes must be paired.");
   for(let uv=0;uv<4;uv++){const field=byType.get(8+uv);if(!field)break;const bytes=field.format===7?4:field.format===2?8:0;if(!bytes)throw new Error("Unsupported FMDL UV format "+field.format+".");const data=readField(field,vertex,bytes,"UV");const values=field.format===7?[half(data.readUInt16LE(0)),half(data.readUInt16LE(2))]:[data.readFloatLE(0),data.readFloatLE(4)];if(values.some(v=>!Number.isFinite(v)))throw new Error("FMDL UV contains non-finite values.");uvs.push(values as Vec2);}
   let boneIndices:number[]=[],boneWeights:number[]=[];if(weightsField&&indicesField){if(weightsField.format!==8||indicesField.format!==9)throw new Error("Unsupported FMDL bone mapping format.");const weights=readField(weightsField,vertex,4,"bone weights"),indices=readField(indicesField,vertex,4,"bone indices");for(let i=0;i<4;i++){const weight=weights[i]/255,local=indices[i];if(weight>0){if(local>=group.length)throw new Error("FMDL vertex references a missing local bone.");boneIndices.push(group[local]);boneWeights.push(weight);}}}
   let color:Vec4|undefined;if(colorField){if(colorField.format!==8)throw new Error("Unsupported FMDL color format.");const d=readField(colorField,vertex,4,"color");color=[d[0]/255,d[1]/255,d[2]/255,d[3]/255];}
   return {position:pos,normal:normalField?readHalf4(normalField,vertex,"normal").slice(0,3) as Vec3:undefined,tangent:tangentField?readHalf4(tangentField,vertex,"tangent") as Vec4:undefined,color,uvs,boneIndices,boneWeights};
  });
  const faceStart=bufferOffsets[2]+(firstFace+descriptor.first)*2,indices:number[]=[];const total=descriptor.count;if(total%3!==0||total>MAX_VERTICES*6||descriptor.count<0||firstFace+descriptor.first+total>MAX_VERTICES*6)throw new Error("FMDL mesh face-index range is invalid.");if(faceStart<0||faceStart+total*2>vertexBuffer.length)throw new Error("FMDL face index buffer is truncated.");for(let i=0;i<total;i++)indices.push(vertexBuffer.readUInt16LE(faceStart+i*2));if(indices.some(i=>i>=vertexCount))throw new Error("FMDL mesh contains an out-of-range face index.");
  return {name:meshGroupFor.get(meshIndex)??"mesh_"+meshIndex,materialIndex,vertices,indices};
 });
 const metadata:Record<string,string|number|boolean>={fmdlVersion:container.version,meshCount:meshes.length,boneCount:bones.length};const lod=records(get(16),16,16);if(lod.length===1){const count=lod[0].readUInt32LE(0);if(count>1)metadata.additionalLodLevels=count-1;}
 const scene:FaceScene={schemaVersion:1,sourceFormat:"PES2021_FMDL",meshes,materials:materials.map(m=>({name:m.name,shader:m.shader,textures:m.textures,parameters:m.parameters})),bones,morphTargets:[],metadata};
 const issues=validateFaceScene(scene),errors=issues.filter(x=>x.severity==="error");if(errors.length)throw new Error("Decoded FMDL scene failed validation: "+errors.slice(0,5).map(x=>x.message).join(" "));
 return scene;
}
