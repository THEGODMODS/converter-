import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {DDSLoader} from "three/examples/jsm/loaders/DDSLoader.js";
import type {FacePreviewData} from "./types";
export default function FacePreview({preview}:{preview:FacePreviewData}){
 const host=useRef<HTMLDivElement>(null);const [textureWarnings,setTextureWarnings]=useState<string[]>([]);
 useEffect(()=>{
  const element=host.current;if(!element)return;const textureDiagnostics:string[]=[];
  const scene=new THREE.Scene();scene.background=new THREE.Color("#0b111a");
  const camera=new THREE.PerspectiveCamera(42,1,0.01,1000);camera.position.set(2.6,1.8,3.2);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;element.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=.5;controls.maxDistance=20;
  scene.add(new THREE.HemisphereLight(0xcbdcff,0x27313b,.72));const key=new THREE.DirectionalLight(0xffffff,.95);key.position.set(3,5,4);scene.add(key);const rim=new THREE.DirectionalLight(0x9edbff,.28);rim.position.set(-4,2,-3);scene.add(rim);
  const grid=new THREE.GridHelper(4,20,0x354657,0x1b2936);grid.position.y=-1.15;scene.add(grid);
  const group=new THREE.Group();scene.add(group);let min=new THREE.Vector3(Infinity,Infinity,Infinity),max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
  const ddsLoader=new DDSLoader(),builtMaterials=preview.materials.map(source=>{
   const isHair=/hair/i.test(source.name),material=new THREE.MeshStandardMaterial({color:isHair?0x39302b:0x9ca3af,roughness:.86,metalness:0,side:THREE.DoubleSide});material.name=source.name;

   for(const [slot,encoded] of Object.entries(source.textureData??{})){
    const semantic=slot+" "+(source.textures[slot]??"");
    try{
     const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
     const view=new DataView(bytes.buffer),fourCC=String.fromCharCode(bytes[84]??0,bytes[85]??0,bytes[86]??0,bytes[87]??0);let texture:THREE.Texture;
     if(fourCC==="DX10"&&(view.getUint32(128,true)===28||view.getUint32(128,true)===29)){
      const width=view.getUint32(16,true),height=view.getUint32(12,true),offset=148,length=width*height*4;if(!width||!height||offset+length>bytes.length)throw new Error("Invalid RGBA8 DDS payload.");
      texture=new THREE.DataTexture(new Uint8Array(bytes.buffer,offset,length),width,height,THREE.RGBAFormat,THREE.UnsignedByteType);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;
     }else{
      const parsed=ddsLoader.parse(bytes.buffer,true);if(!parsed.format||!parsed.mipmaps.length)throw new Error("Unsupported DDS preview format.");
      if(parsed.format===THREE.RGBAFormat){
       const mip=parsed.mipmaps[0];texture=new THREE.DataTexture(mip.data as Uint8Array,parsed.width,parsed.height,THREE.RGBAFormat,THREE.UnsignedByteType);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;
      }else{
       const compressed=new THREE.CompressedTexture(parsed.mipmaps,parsed.width,parsed.height,parsed.format as THREE.CompressedPixelFormat);compressed.generateMipmaps=false;compressed.minFilter=parsed.mipmapCount>1?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;compressed.magFilter=THREE.LinearFilter;texture=compressed;
      }
     }
     texture.colorSpace=/base|diff|albedo|color|bsm_alp|_srgb/i.test(semantic)?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
     if(/normal|nrm/i.test(semantic))material.normalMap=texture;
     else if(/base|diff|albedo|color|bsm_alp|_srgb/i.test(semantic)&&!material.map)material.map=texture;
     else if(/roughness|specular|srm/i.test(semantic)){material.roughnessMap=texture;material.roughness=1;}
     else if(/metallic|metalness/i.test(semantic)){material.metalnessMap=texture;material.metalness=1;}
     else if(/opacity|alpha/i.test(semantic)){material.alphaMap=texture;material.transparent=true;}

    }catch(error){textureDiagnostics.push("Could not decode "+slot+" for "+source.name+": "+(error instanceof Error?error.message:String(error)));}
   }
   if(!material.map&&Object.keys(source.textures).length)textureDiagnostics.push("No recognised diffuse/base-colour texture was assigned to "+source.name+"; the mesh is shown with a neutral fallback.");
   if(!Object.keys(source.textureData??{}).length&&Object.keys(source.textures).length)textureDiagnostics.push("No referenced texture image was loaded for "+source.name+".");
   if(material.map){material.color.set(0xffffff);if(isHair){material.transparent=true;material.alphaTest=.35;material.depthWrite=true;}}
   return material;
  });
  setTextureWarnings([...new Set(textureDiagnostics)].slice(0,12));
  for(const item of preview.meshes){
   const geometry=new THREE.BufferGeometry();const positions=new Float32Array(item.positions);geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));if(item.normals.length===item.positions.length)geometry.setAttribute("normal",new THREE.BufferAttribute(new Float32Array(item.normals),3));else geometry.computeVertexNormals();if(item.uvs.length===item.positions.length/3*2)geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(item.uvs),2));geometry.setIndex(item.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();if(geometry.boundingBox){min.min(geometry.boundingBox.min);max.max(geometry.boundingBox.max);}
   const material=builtMaterials[item.materialIndex]??new THREE.MeshStandardMaterial({color:0x8b929c,roughness:.76,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.name=item.name;mesh.userData.materialIndex=item.materialIndex;group.add(mesh);
  }
  const center=min.clone().add(max).multiplyScalar(.5),extent=max.clone().sub(min),largest=Math.max(extent.x,extent.y,extent.z,0.001),fitScale=2.1/largest;group.position.copy(center).multiplyScalar(-fitScale);group.scale.setScalar(fitScale);camera.position.set(2.7,1.65,3.2);controls.target.set(0,0,0);controls.update();
  const resize=()=>{const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
  let frame=0;const render=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;controls.update();renderer.render(scene,camera);});};controls.addEventListener("change",render);render();
  return()=>{if(frame)cancelAnimationFrame(frame);controls.removeEventListener("change",render);observer.disconnect();controls.dispose();group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();material.dispose();});}});renderer.dispose();renderer.domElement.remove();};
 },[preview]);
 return <><div className="face-preview-canvas" ref={host} aria-label="Interactive 3D face geometry preview"/>{textureWarnings.length>0&&<div className="error-line preview-diagnostics" role="status">{textureWarnings.join(" · ")}</div>}</>;
}
