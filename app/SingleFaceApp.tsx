import {useState} from "react";
import type {DragEvent} from "react";
import {CheckCircle2,FolderOpen,LoaderCircle,ShieldCheck,Sparkles,UploadCloud,XCircle} from "lucide-react";
import type {FaceProject,FacePreviewData} from "./types";
import {inferPesPlayerIdFromPath} from "../engine/player-id";
import FacePreview from "./FacePreview";
import UpdateNotice from "./UpdateNotice";
const validTarget=/^[0-9]{1,6}$/;
export default function SingleFaceApp(){
 const [project,setProject]=useState<FaceProject|null>(null),[targetId,setTargetId]=useState(""),[preview,setPreview]=useState<FacePreviewData|null>(null);
 const [busy,setBusy]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[previewError,setPreviewError]=useState<string|null>(null),[converting,setConverting]=useState(false),[dragging,setDragging]=useState(false);
 const [error,setError]=useState(""),[result,setResult]=useState("");
 const loadFolder=async(folder:string)=>{
  setBusy(true);setError("");setResult("");setProject(null);setPreview(null);setPreviewError(null);setTargetId("");
  try{
   const scanned=await window.faceForge.inspectFolder(folder);
   if(scanned.detectedGame!=="pes2021")throw new Error("Choose a PES 2021 face folder. This release converts PES 2021 → PES 2017 only.");
   const head=scanned.files.find(file=>file.kind==="model-pes2021"&&/face_high\.fmdl$/i.test(file.path));
   if(!head)throw new Error("The source folder does not contain a valid face_high.fmdl head model.");
   setProject(scanned);
   const sourceId=inferPesPlayerIdFromPath(scanned.root);
   if(sourceId&&/[1-9]/.test(sourceId))setTargetId(sourceId);
   setPreviewBusy(true);setPreviewError(null);
   try{
    const otherFaceModels=scanned.files.filter(file=>{
     if(file.kind!=="model-pes2021"||!file.path.toLowerCase().endsWith(".fmdl"))return false;
     const name=file.path.split("/").pop()??file.path;
     return !/(?:^|[_-])(?:low|lod[0-9]*)\.fmdl$/i.test(name);
    }).sort((a,b)=>Number(!a.path.toLowerCase().endsWith("_high.fmdl"))-Number(!b.path.toLowerCase().endsWith("_high.fmdl")));
    const candidates=[head,...otherFaceModels],seenModels=new Set<string>();
    const uniqueModels=candidates.filter(file=>{if(seenModels.has(file.sha256))return false;seenModels.add(file.sha256);return true;});
    const previewPriority=(file:typeof head)=>{const name=file.path.split("/").pop()?.toLowerCase()??"";if(name.endsWith("face_high.fmdl"))return 0;if(/(eye|eyeline|eyeball|sclera|iris|pupil|eyelash|eyebrow)/.test(name))return 1;if(name.endsWith("hair_high.fmdl"))return 2;if(/(oral|teeth|tongue|lip)/.test(name))return 3;return 4;};
    const previewModels=uniqueModels.sort((a,b)=>previewPriority(a)-previewPriority(b)).slice(0,8);
    const settled=await Promise.allSettled(previewModels.map(file=>window.faceForge.previewModel(scanned.root,file.path)));
    const materials:FacePreviewData["materials"]=[],meshes:FacePreviewData["meshes"]=[],warnings:string[]=[];
    let loaded=0;
    for(let i=0;i<settled.length;i++){
     const result=settled[i];
     if(result.status==="rejected"){warnings.push("Could not preview "+previewModels[i].path+": "+(result.reason instanceof Error?result.reason.message:String(result.reason)));continue;}
     const scene=result.value,offset=materials.length;loaded++;materials.push(...scene.materials);meshes.push(...scene.meshes.map(mesh=>({...mesh,materialIndex:mesh.materialIndex+offset})));warnings.push(...scene.warnings);
    }
    if(!loaded||!meshes.length)throw new Error("No high-detail face component could be rendered.");
    if(uniqueModels.length>previewModels.length)warnings.push("Preview loaded the 8 highest-priority face components for responsiveness; "+(uniqueModels.length-previewModels.length)+" additional models remain indexed for conversion.");
    setPreview({source:"PES 2021 face assembly ("+loaded+" models)",generation:"pes2021",meshes,materials,warnings});
   }catch(previewError){
    console.error("FACE FORGE 3D preview failed; conversion remains available",previewError);
    setPreview(null);setPreviewError(previewError instanceof Error?previewError.message:String(previewError));
   }
  }catch(e){
   console.error("FACE FORGE source inspection failed",e);
   setError(e instanceof Error?e.message:"FACE FORGE could not read this folder. Choose an extracted PES 2021 face folder and try again.");
  }finally{setPreviewBusy(false);setBusy(false);}
 };
 const browse=async()=>{try{const folder=await window.faceForge.chooseFolder();if(folder)await loadFolder(folder);}catch(e){console.error("FACE FORGE folder picker failed",e);setError("Could not open that face folder. Please try again.");}};
 const onDrop=async(event:DragEvent)=>{event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(!file)return;const folder=window.faceForge.getPathForDrop(file);if(!folder){setError("Drop a face folder from Windows Explorer, not an individual file.");return;}await loadFolder(folder);};
 const convert=async()=>{
  if(!project)return;
  if(!validTarget.test(targetId)||!/[1-9]/.test(targetId)){setError("Enter the player ID belonging to this face.");return;}
  setConverting(true);setError("");setResult("");
  try{const converted=await window.faceForge.convertCompleteFaceFolder(project.root,2017,targetId);if(converted){setResult("Face converted successfully. Your PES 2017 files are saved in the folder you selected.");}}
  catch(e){console.error("FACE FORGE conversion failed",e);const detail=e instanceof Error?e.message:String(e);setError(detail.length>320?detail.slice(0,317)+"...":detail||"Conversion failed. Your source files were left untouched.");}
  finally{setConverting(false);}
 };
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><div className="brand-mark"><img src="/face-forge.svg" alt=""/></div><div><strong>KFC GODMODS</strong><span>FACE FORGE</span></div></div><div className="side-label">SINGLE FACE CONVERTER</div><div className="sidebar-bottom"><div className="version">PES 2021 → PES 2017</div></div></aside>
  <main className="main">
   <UpdateNotice/>
   <header className="topbar"><div><div className="eyebrow">KFC GODMODS · FACE FORGE</div><h1>PES 2021 → PES 2017</h1><p>Convert a PES 2021 face for PES 2017.</p></div><div className="top-status"><span className="status-led"/> READY</div></header>
   
   <section className="workspace-grid">
    <div className="import-panel"><div className="section-head"><div><span className="eyebrow">SOURCE</span><h2>Choose your PES 2021 face folder</h2></div><span className="step-number">01</span></div>
     <div className={"dropzone "+(dragging?"dragging":"")} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}><div className="upload-icon"><UploadCloud size={25}/></div><h3>Drop your face folder here</h3><p>Choose the face folder you want to convert</p><div className="or-line"><span/> OR <span/></div><button className="primary-btn" onClick={browse} disabled={busy}><FolderOpen size={16}/>{busy?"Inspecting face…":"Browse face folder"}</button><div className="drop-hint"><ShieldCheck size={13}/> Your original files stay untouched</div></div>
     {error&&<div className="error-line"><XCircle size={15}/>{error}</div>}
      {project&&<div className="project-card"><div className="project-title"><CheckCircle2 size={17}/><strong>Face folder ready</strong></div></div>}
    </div>
    <div className="analysis-panel"><div className="section-head"><div><span className="eyebrow">PREVIEW</span><h2>Review the actual face</h2></div><span className="step-number">02</span></div>
     {preview?<><div className="preview-meta"><span>3D HEAD PREVIEW</span><span>DRAG TO ROTATE</span></div><FacePreview preview={preview}/>{preview.warnings.length>0&&<div className="error-line preview-diagnostics"><XCircle size={15}/><span>{preview.warnings.slice(0,5).join(" · ")}{preview.warnings.length>5?" · +"+(preview.warnings.length-5)+" more preview notes":""}</span></div>}</>:<div className="analysis-empty"><div className="radar"><LoaderCircle size={28}/></div><h3>{previewBusy?"Building 3D preview…":"Waiting for a face model"}</h3><p>{previewError??"Your face preview will appear here."}</p></div>}
     <div className="convert-footer"><div><span className="eyebrow">OUTPUT</span>{project&&<div className="target-player-id"><label htmlFor="target-player-id">FACE PLAYER ID</label><input id="target-player-id" type="text" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="Player ID" value={targetId} onChange={event=>setTargetId(event.target.value.replace(/[^0-9]/g,"").slice(0,6))}/><small>The ID is detected from the face folder when possible.</small>{targetId.length>0&&!validTarget.test(targetId)&&<small className="target-id-error">Enter a valid player ID.</small>}</div>}<p></p></div><button className="convert-btn" onClick={convert} disabled={!project||previewBusy||converting||!validTarget.test(targetId)}><Sparkles size={16}/>{converting?"CONVERTING…":"CONVERT FACE"}</button></div>
     {result&&<div className="texture-toast">{result}</div>}
    </div>
   </section>
   <footer><span>KFC GODMODS · FACE FORGE</span><span>PES 2021 → PES 2017</span></footer>
  </main>
 </div>;
}
