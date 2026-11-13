import {useState} from "react";
import type {DragEvent} from "react";
import {ArrowRight,CheckCircle2,FolderOpen,LoaderCircle,ShieldCheck,Sparkles,UploadCloud,XCircle} from "lucide-react";
import type {FaceProject,FacePreviewData} from "./types";
import FacePreview from "./FacePreview";
const validTarget=/^(70[1-9]|7[1-9][0-9]|8[0-9]{2}|9[01][0-9]|920)(0[1-9]|1[0-9]|2[0-3])$/;
export default function SingleFaceApp(){
 const [project,setProject]=useState<FaceProject|null>(null),[targetId,setTargetId]=useState(""),[preview,setPreview]=useState<FacePreviewData|null>(null);
 const [busy,setBusy]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[converting,setConverting]=useState(false),[dragging,setDragging]=useState(false);
 const [error,setError]=useState(""),[result,setResult]=useState("");
 const loadFolder=async(folder:string)=>{
  setBusy(true);setError("");setResult("");setProject(null);setPreview(null);setTargetId("");
  try{
   const scanned=await window.faceForge.inspectFolder(folder);setProject(scanned);
   if(scanned.detectedGame!=="pes2021")throw new Error("Choose a PES 2021 face folder. This release converts PES 2021 → PES 2017 only.");
   const models=scanned.files.filter(file=>file.kind==="model-pes2021"),head=models.find(file=>/face_high\.fmdl$/i.test(file.path));
   if(!head)throw new Error("The source folder does not contain a valid face_high.fmdl head model.");
   setPreviewBusy(true);
   const headScene=await window.faceForge.previewModel(scanned.root,head.path);
   setPreview({source:"PES 2021 head model",generation:"pes2021",meshes:headScene.meshes,materials:headScene.materials,warnings:headScene.warnings});
  }catch(e){setError(e instanceof Error?e.message:"The face folder could not be inspected or previewed.");}
  finally{setPreviewBusy(false);setBusy(false);}
 };
 const browse=async()=>{try{const folder=await window.faceForge.chooseFolder();if(folder)await loadFolder(folder);}catch(e){setError(e instanceof Error?e.message:"Could not open the selected face folder.");}};
 const onDrop=async(event:DragEvent)=>{event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(!file)return;const folder=window.faceForge.getPathForDrop(file);if(!folder){setError("Drop a face folder from Windows Explorer, not an individual file.");return;}await loadFolder(folder);};
 const convert=async()=>{
  if(!project||!preview)return;
  if(!validTarget.test(targetId)){setError("Enter a PES 2017 destination ID in team+slot format: team 701–920 followed by roster slot 01–23. Example: 71405 means team 714, slot 05. Do not enter the source PES 2021 face ID.");return;}
  setConverting(true);setError("");setResult("");
  try{const converted=await window.faceForge.convertCompleteFaceFolder(project.root,2017,targetId);if(converted){const cpk=Array.isArray(converted.report.cpkFiles)?(converted.report.cpkFiles as string[]).join(", "):"PES 2017 CPK";setResult("Conversion and nested face-CPK verification completed. Output: "+converted.destination+" · "+cpk+". In-game validation is still required.");}}
  catch(e){setError(e instanceof Error?e.message:"PES 2021 → PES 2017 conversion failed.");}
  finally{setConverting(false);}
 };
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><div className="brand-mark"><img src="/face-forge.svg" alt=""/></div><div><strong>KFC GODMODS</strong><span>FACE FORGE</span></div></div><div className="side-label">SINGLE FACE CONVERTER</div><div className="sidebar-bottom"><div className="version">PES 2021 → PES 2017</div></div></aside>
  <main className="main">
   <header className="topbar"><div><div className="eyebrow">KFC GODMODS · FACE FORGE</div><h1>PES 2021 → PES 2017</h1><p>Convert one complete face and inspect its actual 3D geometry.</p></div><div className="top-status"><span className="status-led"/> LOCAL WORKSPACE</div></header>
   
   <section className="direction-card"><div className="direction-head"><div><span className="eyebrow">CONVERSION ROUTE</span><h2>Face conversion</h2></div><div className="route-tag">PES 2021 → PES 2017</div></div><div className="routes"><div className="route selected"><div className="game-icon newer">21</div><div className="route-copy"><strong>PES 2021</strong><span>FMDL · FTEX</span></div><ArrowRight className="route-arrow" size={20}/><div className="game-icon older">17</div><div className="route-copy"><strong>PES 2017</strong><span>MODEL · DDS</span></div></div></div></section>
   <section className="workspace-grid">
    <div className="import-panel"><div className="section-head"><div><span className="eyebrow">STEP 01 / SOURCE</span><h2>Choose your PES 2021 face folder</h2></div><span className="step-number">01</span></div>
     <div className={"dropzone "+(dragging?"dragging":"")} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}><div className="upload-icon"><UploadCloud size={25}/></div><h3>Drop your face folder here</h3><p>Extracted PES 2021 face folder, including FPK/FPKD assets</p><div className="or-line"><span/> OR <span/></div><button className="primary-btn" onClick={browse} disabled={busy}><FolderOpen size={16}/>{busy?"Inspecting face…":"Browse face folder"}</button><div className="drop-hint"><ShieldCheck size={13}/> Original files are never modified</div></div>
     {error&&<div className="error-line"><XCircle size={15}/>{error}</div>}
     {project&&<div className="project-card"><div className="project-title"><CheckCircle2 size={17}/><strong>Source face inspected</strong></div><div className="project-path">{project.root}</div><div className="project-stats"><div><strong>{project.fileCount}</strong><span>FILES</span></div><div><strong>{project.models}</strong><span>MODELS</span></div><div><strong>{project.textures}</strong><span>TEXTURES</span></div><div><strong>{(project.totalBytes/1048576).toFixed(1)} MB</strong><span>SIZE</span></div></div><div className="model-preview-list"><b>3D FACE PREVIEW</b><small>{previewBusy?"Decoding all face models…":preview?"Head and available companion geometry loaded.":"Preview not available."}</small></div></div>}
    </div>
    <div className="analysis-panel"><div className="section-head"><div><span className="eyebrow">STEP 02 / PREVIEW</span><h2>Review the actual face</h2></div><span className="step-number">02</span></div>
     {preview?<><div className="preview-meta"><span>3D HEAD PREVIEW</span><span>DRAG TO ROTATE · SCROLL TO ZOOM</span></div><FacePreview preview={preview}/>{preview.warnings.map((warning,index)=>)}</>:<div className="analysis-empty"><div className="radar"><LoaderCircle size={28}/></div><h3>{previewBusy?"Building 3D preview…":"Waiting for a face model"}</h3><p>The preview appears only after real FMDL triangle geometry is decoded. File names and material references alone are not a preview.</p></div>}
     <div className="convert-footer"><div><span className="eyebrow">STEP 03 / OUTPUT</span>{project&&<div className="target-player-id"><label htmlFor="target-player-id">PES 2017 DESTINATION ID</label><input id="target-player-id" type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="e.g. 71405" value={targetId} onChange={event=>setTargetId(event.target.value.replace(/[^0-9]/g,"").slice(0,5))}/><small>Enter your PES 2017 custom ID: team 701–920 + roster slot 01–23. Example: 71405. Do not enter the PES 2021 source face ID.</small>{targetId.length>0&&!validTarget.test(targetId)&&<small className="target-id-error">That destination ID is not valid. Use the 5-digit team + slot format, e.g. 71405.</small>}</div>}<p>Convert the complete PES 2021 face into a PES 2017 nested face CPK. Nothing is installed automatically.</p></div><button className="convert-btn" onClick={convert} disabled={!project||!preview||previewBusy||converting||!validTarget.test(targetId)}><Sparkles size={16}/>{converting?"CONVERTING…":"CONVERT FACE"}</button></div>
     {result&&<div className="texture-toast">{result}</div>}
    </div>
   </section>
   {preview&&<section className="preview-panel"><div className="section-head"><div><span className="eyebrow">FACE MODEL DETAILS</span><h2>{preview.source}</h2></div></div>{preview.materials.map((material,index)=><div className="preview-material" key={material.name+index}><div><strong>{material.name}</strong><small>{material.shader??"Shader unavailable"}</small></div>{Object.entries(material.textures).map(([slot,texture])=><span key={slot}><b>{slot}</b> · {texture}</span>)}</div>)}</section>}
   <footer><span>KFC GODMODS · FACE FORGE</span><span>PES 2021 → PES 2017</span></footer>
  </main>
 </div>;
}
