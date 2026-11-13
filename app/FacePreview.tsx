import {useEffect,useRef} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {DDSLoader} from "three/examples/jsm/loaders/DDSLoader.js";
import type {FacePreviewData} from "./types";
export default function FacePreview({preview}:{preview:FacePreviewData}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color("#0b111a");
  const camera=new THREE.PerspectiveCamera(42,1,0.01,1000);camera.position.set(2.6,1.8,3.2);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;element.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=.5;controls.maxDistance=20;
  scene.add(new THREE.HemisphereLight(0xcbdcff,0x27313b,2.1));const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(3,5,4);scene.add(key);const rim=new THREE.DirectionalLight(0x9edbff,1.5);rim.position.set(-4,2,-3);scene.add(rim);
  const grid=new THREE.GridHelper(4,20,0x354657,0x1b2936);grid.position.y=-1.15;scene.add(grid);
  const group=new THREE.Group();scene.add(group);let min=new THREE.Vector3(Infinity,Infinity,Infinity),max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
  const ddsLoader=new DDSLoader(),builtMaterials=preview.materials.map(source=>{
   const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:0,side:THREE.DoubleSide});material.name=source.name;
   for(const [slot,encoded] of Object.entries(source.textureData??{})){
    try{
     const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
     const parsed=ddsLoader.parse(bytes.buffer,true),texture=new THREE.CompressedTexture(parsed.mipmaps,parsed.width,parsed.height,parsed.format);
     texture.generateMipmaps=false;texture.minFilter=parsed.mipmapCount>1?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.colorSpace=/base|diffuse|albedo|color/i.test(slot)?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
     if(/normal/i.test(slot))material.normalMap=texture;
     else if(/base|diffuse|albedo|color/i.test(slot)&&!material.map)material.map=texture;
     else if(/opacity|alpha/i.test(slot)){material.alphaMap=texture;material.transparent=true;}
    }catch(error){console.warn("FACE FORGE could not decode preview texture",source.name,slot,error);}
   }
   if(material.map)material.color.set(0xffffff);return material;
  });
  for(const item of preview.meshes){
   const geometry=new THREE.BufferGeometry();const positions=new Float32Array(item.positions);geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));if(item.normals.length===item.positions.length)geometry.setAttribute("normal",new THREE.BufferAttribute(new Float32Array(item.normals),3));else geometry.computeVertexNormals();if(item.uvs.length===item.positions.length/3*2)geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(item.uvs),2));geometry.setIndex(item.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();if(geometry.boundingBox){min.min(geometry.boundingBox.min);max.max(geometry.boundingBox.max);}
   const material=builtMaterials[item.materialIndex]??new THREE.MeshStandardMaterial({color:0x8b929c,roughness:.76,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.name=item.name;mesh.userData.materialIndex=item.materialIndex;group.add(mesh);
  }
  const center=min.clone().add(max).multiplyScalar(.5),extent=max.clone().sub(min),largest=Math.max(extent.x,extent.y,extent.z,0.001),fitScale=2.1/largest;group.position.copy(center).multiplyScalar(-fitScale);group.scale.setScalar(fitScale);camera.position.set(2.7,1.65,3.2);controls.target.set(0,0,0);controls.update();
  const resize=()=>{const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
  let frame=0;const render=()=>{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(render);};render();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();material.dispose();});}});renderer.dispose();renderer.domElement.remove();};
 },[preview]);
 return <div className="face-preview-canvas" ref={host} aria-label="Interactive 3D face geometry preview"/>;
}
