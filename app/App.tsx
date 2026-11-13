import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { ArrowDownUp, ArrowRight, BadgeCheck, Box, CheckCircle2, ChevronDown, CircleHelp, FileArchive, FileImage, FileSearch, FolderOpen, Gauge, HardDrive, History, Layers3, Package, ScanFace, ShieldCheck, Sparkles, UploadCloud, XCircle } from "lucide-react";
import type { FaceProject, TextureColorSpace } from "./types";

type Direction = "pes2021-to-pes2017" | "pes2017-to-pes2021";
type WorkMode = "single" | "batch" | "project";
type SavedProject = { id:string; root:string; name:string; generation:string; fileCount:number; models:number; textures:number; addedAt:string };
const formatBytes = (bytes: number) => bytes < 1024 ? bytes + " B" : bytes < 1024*1024 ? (bytes/1024).toFixed(1)+" KB" : (bytes/1024/1024).toFixed(1)+" MB";

export default function App() {
  const [direction, setDirection] = useState<Direction>("pes2021-to-pes2017");
  const [mode,setMode]=useState<WorkMode>("single");
  const [batch,setBatch]=useState<FaceProject[]>([]);
  const [batchBusy,setBatchBusy]=useState(false);
  const [savedProjects,setSavedProjects]=useState<SavedProject[]>([]);
  const [projectMessage,setProjectMessage]=useState("");
  const [project, setProject] = useState<FaceProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [textureColorSpace,setTextureColorSpace] = useState<TextureColorSpace>("SRGB");
  const [textureBusy,setTextureBusy] = useState(false);
  const [textureResult,setTextureResult] = useState("");
  useEffect(()=>{try{const saved=localStorage.getItem("face-forge-project-library");if(saved)setSavedProjects(JSON.parse(saved) as SavedProject[]);}catch{setProjectMessage("Saved project library could not be read. It has not been overwritten.");}},[]);
  useEffect(()=>{if(savedProjects.length||localStorage.getItem("face-forge-project-library")!==null)localStorage.setItem("face-forge-project-library",JSON.stringify(savedProjects));},[savedProjects]);
  const target = direction === "pes2021-to-pes2017" ? "PES 2017" : "PES 2021";
  const source = direction === "pes2021-to-pes2017" ? "PES 2021" : "PES 2017";
  const canConvert = false;
  const expectedSource = direction === "pes2021-to-pes2017" ? "pes2021" : "pes2017";
  const sourceMatches = project?.detectedGame === expectedSource;

  const inspect = useCallback(async (folder: string) => {
    setBusy(true); setError("");
    try { setProject(await window.faceForge.inspectFolder(folder)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not inspect this folder."); setProject(null); }
    finally { setBusy(false); }
  }, []);

  const choose = async () => {
    const folder = await window.faceForge.chooseFolder();
    if (folder) await inspect(folder);
  };
  const onDrop = async (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const path = window.faceForge.getPathForDrop(file);
    if (!path) { setError("Drop a face folder from Windows Explorer, not an individual file."); return; }
    await inspect(path);
  };
  const addBatch = async () => {
    setBatchBusy(true);setError("");
    try{const folders=await window.faceForge.chooseFolders();const results:FaceProject[]=[];for(const folder of folders){try{results.push(await window.faceForge.inspectFolder(folder));}catch(e){setError(e instanceof Error?e.message:"A selected folder could not be inspected.");}}setBatch(current=>{const known=new Set(current.map(x=>x.root.toLowerCase()));return [...current,...results.filter(x=>!known.has(x.root.toLowerCase()))];});}
    catch(e){setError(e instanceof Error?e.message:"Could not add batch folders.");}finally{setBatchBusy(false);}
  };
  const addCurrentToLibrary=()=>{if(!project)return;const entry:SavedProject={id:crypto.randomUUID(),root:project.root,name:project.root.split(/[\\/]/).filter(Boolean).pop()||"Face project",generation:project.detectedGame,fileCount:project.fileCount,models:project.models,textures:project.textures,addedAt:new Date().toISOString()};setSavedProjects(current=>[entry,...current.filter(x=>x.root.toLowerCase()!==entry.root.toLowerCase())]);setProjectMessage("Face project saved to your local library.");};
  const inspectSaved=async(entry:SavedProject)=>{setMode("single");setDirection(entry.generation==="pes2017"?"pes2017-to-pes2021":"pes2021-to-pes2017");await inspect(entry.root);};
  const runTextureLab = async () => {
    setTextureBusy(true); setTextureResult("");
    try { const result=await window.faceForge.convertTextureFile(textureColorSpace); if(result) setTextureResult("Converted "+result.format+" "+result.width+"×"+result.height+" → "+result.destination); }
    catch(e) { setTextureResult(e instanceof Error?e.message:"Texture conversion failed."); }
    finally { setTextureBusy(false); }
  };
  const directionLabel = useMemo(() => direction === "pes2021-to-pes2017" ? "NEW-GEN → CLASSIC" : "CLASSIC → NEW-GEN", [direction]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ScanFace size={23}/></div><div><strong>THEGODMODS</strong><span>FACE FORGE</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <button className={"nav-item "+(mode==="single"?"active":"")} onClick={()=>setMode("single")}><ScanFace size={17}/> Single face {mode==="single"&&<span className="nav-dot"/>}</button>
      <button className={"nav-item "+(mode==="batch"?"active":"")} onClick={()=>setMode("batch")}><Layers3 size={17}/> Batch {mode==="batch"&&<span className="nav-dot"/>}</button>
      <button className={"nav-item "+(mode==="project"?"active":"")} onClick={()=>setMode("project")}><FolderOpen size={17}/> Project library {mode==="project"&&<span className="nav-dot"/>}</button>
      <button className="nav-item" onClick={() => setProject(null)}><History size={17}/> Recent projects</button>
      <div className="side-label tools-label">TOOLKIT</div>
      <div className="tool-link"><FileSearch size={16}/> Face inspector</div>
      <button className="tool-link" onClick={runTextureLab} disabled={textureBusy}><FileImage size={16}/> Texture lab <small>{textureBusy?"WORKING":"DDS ↔ FTEX"}</small></button><select className="color-select" value={textureColorSpace} onChange={e=>setTextureColorSpace(e.target.value as TextureColorSpace)} aria-label="Texture color space"><option value="SRGB">Color / diffuse</option><option value="NORMAL">Normal map</option><option value="LINEAR">Linear data</option></select>
      <div className="tool-link"><Box size={16}/> 3D preview <small>SOON</small></div>
      <div className="tool-link"><Package size={16}/> CPK builder <small>SOON</small></div>
      <div className="sidebar-bottom"><div className="free-pill"><Sparkles size={14}/> FREE FOREVER</div><div className="version">FACE FORGE · PREVIEW 0.1.0</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">THE MODDING WORKSHOP</div><h1>{mode==="single"?"Single Face Studio":mode==="batch"?"Batch Conversion":"Face Project Library"}</h1><p>Professional face conversion tools. Two generations. No paywall. Built by KFC GODMODS.</p></div><div className="top-status"><span className="status-led"/> LOCAL WORKSPACE <ChevronDown size={14}/></div></header>
      {textureResult && <div className="texture-toast">{textureResult}</div>}
      <div className="mode-switch" role="tablist" aria-label="Work mode"><button className={mode==="single"?"chosen":""} onClick={()=>setMode("single")}><ScanFace size={16}/> SINGLE FACE</button><button className={mode==="batch"?"chosen":""} onClick={()=>setMode("batch")}><Layers3 size={16}/> BATCH</button><button className={mode==="project"?"chosen":""} onClick={()=>setMode("project")}><FolderOpen size={16}/> PROJECT</button></div>
      {mode==="batch" ? <section className="batch-workspace"><div className="section-head"><div><span className="eyebrow">MULTI-FACE WORKFLOW</span><h2>Batch intake & compatibility queue</h2></div><button className="primary-btn" onClick={addBatch} disabled={batchBusy}><FolderOpen size={15}/>{batchBusy?"Scanning…":"Add face folders"}</button></div><p className="mode-description">Select multiple PES face folders. FACE FORGE inventories each project, detects its generation and reports issues independently. Conversion stays gated until the matching model adapter is validated.</p>{batch.length? <div className="batch-list">{batch.map((item,i)=><div className="batch-row" key={item.root}><span className="batch-index">{String(i+1).padStart(2,"0")}</span><div className="batch-info"><strong>{item.root.split(/[\\/]/).filter(Boolean).pop()}</strong><small>{item.detectedGame.toUpperCase()} · {item.models} MODELS · {item.textures} TEXTURES · {formatBytes(item.totalBytes)}</small></div><span className={item.detectedGame==="unknown"||item.detectedGame==="mixed"?"status-warn":"status-ok"}>{item.detectedGame==="unknown"||item.detectedGame==="mixed"?"REVIEW":"SCANNED"}</span><button className="icon-action" onClick={()=>setBatch(current=>current.filter(x=>x.root!==item.root))}><XCircle size={15}/></button></div>)}</div>:<div className="batch-empty"><Layers3 size={30}/><strong>Your batch queue is empty</strong><span>Add multiple face folders to inspect them together.</span></div>}<div className="batch-summary"><span>{batch.length} PROJECTS IN QUEUE</span><span>MODEL CONVERSION: NOT YET ENABLED</span></div></section> : mode==="project" ? <section className="batch-workspace"><div className="section-head"><div><span className="eyebrow">LOCAL DATABASE</span><h2>Your face project library</h2></div><button className="primary-btn" onClick={()=>setMode("single")}><ScanFace size={15}/> Import a face</button></div><p className="mode-description">Keep track of face folders on this PC. The library stores project locations and scan summaries; original game assets remain where you put them.</p>{projectMessage&&<div className="texture-toast">{projectMessage}</div>}{savedProjects.length?<div className="batch-list">{savedProjects.map(item=><div className="batch-row" key={item.id}><span className="batch-index"><FolderOpen size={15}/></span><div className="batch-info"><strong>{item.name}</strong><small>{item.generation.toUpperCase()} · {item.models} MODELS · {item.textures} TEXTURES · ADDED {new Date(item.addedAt).toLocaleDateString()}</small><small>{item.root}</small></div><button className="small-action" onClick={()=>void inspectSaved(item)}>INSPECT</button><button className="icon-action" onClick={()=>setSavedProjects(current=>current.filter(x=>x.id!==item.id))}><XCircle size={15}/></button></div>)}</div>:<div className="batch-empty"><FolderOpen size={30}/><strong>No saved face projects yet</strong><span>Import a face in Single Face mode and save it to your library.</span></div>}<div className="batch-summary"><span>{savedProjects.length} SAVED PROJECTS</span><span>CPK DATABASE BUILD: VALIDATION GATE</span></div></section> : <>
      <section className="direction-card">
        <div className="direction-head"><div><span className="eyebrow">CONVERSION ROUTE</span><h2>Choose your direction</h2></div><div className="route-tag"><ArrowDownUp size={14}/> TWO-WAY ENGINE</div></div>
        <div className="routes">
          <button className={direction==="pes2021-to-pes2017"?"route selected":"route"} onClick={()=>{setDirection("pes2021-to-pes2017");setProject(null)}}><div className="game-icon newer">21</div><div className="route-copy"><strong>PES 2021</strong><span>FMDL · FTEX</span></div><ArrowRight className="route-arrow" size={20}/><div className="game-icon older">17</div><div className="route-copy"><strong>PES 2017</strong><span>MODEL · DDS</span></div><div className="route-radio"/></button>
          <button className={direction==="pes2017-to-pes2021"?"route selected":"route"} onClick={()=>{setDirection("pes2017-to-pes2021");setProject(null)}}><div className="game-icon older">17</div><div className="route-copy"><strong>PES 2017</strong><span>MODEL · DDS</span></div><ArrowRight className="route-arrow" size={20}/><div className="game-icon newer">21</div><div className="route-copy"><strong>PES 2021</strong><span>FMDL · FTEX</span></div><div className="route-radio"/></button>
        </div>
        <div className="route-foot"><span><BadgeCheck size={14}/> {directionLabel}</span><span>Choose direction before importing a face</span></div>
      </section>
      <section className="workspace-grid">
        <div className="import-panel">
          <div className="section-head"><div><span className="eyebrow">STEP 01 / SOURCE</span><h2>Import face project</h2></div><span className="step-number">01</span></div>
          <div className={"dropzone "+(dragging?"dragging":"")} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}>
            <div className="upload-icon"><UploadCloud size={25}/></div>
            <h3>Drop your face folder here</h3><p>Bring your {source} face folder into the workshop</p>
            <div className="or-line"><span/> OR <span/></div>
            <button className="primary-btn" onClick={choose} disabled={busy}><FolderOpen size={16}/>{busy?"Scanning project…":"Browse face folder"}</button>
            <div className="drop-hint"><ShieldCheck size={13}/> Your original files are never modified</div>
          </div>
          {error && <div className="error-line"><XCircle size={15}/>{error}</div>}
          {project && <div className="project-card"><button className="save-project-btn" onClick={addCurrentToLibrary}><FolderOpen size={13}/> SAVE TO PROJECT LIBRARY</button><div className="project-title"><CheckCircle2 size={17}/><strong>Project inspected</strong><button onClick={()=>setProject(null)}><XCircle size={15}/></button></div><div className="project-path">{project.root}</div><div className="project-stats"><div><strong>{project.fileCount}</strong><span>FILES</span></div><div><strong>{project.models}</strong><span>MODELS</span></div><div><strong>{project.textures}</strong><span>TEXTURES</span></div><div><strong>{formatBytes(project.totalBytes)}</strong><span>SIZE</span></div></div><div className="detected">Detected: <b>{project.detectedGame==="pes2021"?"PES 2021":project.detectedGame==="pes2017"?"PES 2017":project.detectedGame==="mixed"?"Mixed / hybrid":"Unknown"}</b></div>{project.warnings.map((w,i)=><div className="warning-line" key={i}><CircleHelp size={13}/>{w}</div>)}</div>}
        </div>
        <div className="analysis-panel">
          <div className="section-head"><div><span className="eyebrow">STEP 02 / ANALYSIS</span><h2>Conversion readiness</h2></div><span className="step-number">02</span></div>
          {project ? <div className="project-analysis"><div className="radar"><Gauge size={26}/></div><h3>{sourceMatches ? "Source matches this route" : "Check the source format"}</h3><p>{sourceMatches ? "Detected a " + source + " project. The inventory is ready for deeper compatibility checks." : "This project was detected as " + project.detectedGame.toUpperCase() + ". The selected route expects " + source + ". Change the route or inspect the correct source folder."}</p><div className="analysis-checks"><div><FileSearch size={15}/> Binary signature scan <span>COMPLETE</span></div><div><Layers3 size={15}/> Model / material translation <span>IN DEVELOPMENT</span></div><div><FileImage size={15}/> Texture transcoding <span>IN DEVELOPMENT</span></div><div><ShieldCheck size={15}/> Target-game validation <span>NOT RUN</span></div></div><div className="file-preview">{project.files.slice(0,5).map(file=><div key={file.path}><span>{file.kind}</span><b>{file.path}</b><small>{formatBytes(file.bytes)}</small></div>)}</div></div> : <div className="analysis-empty"><div className="radar"><Gauge size={28}/></div><h3>Waiting for your face</h3><p>We'll inspect every model, texture and companion file before preparing a conversion.</p><div className="analysis-checks"><div><FileSearch size={15}/> Source format detection <span>READY</span></div><div><Layers3 size={15}/> Mesh & material analysis <span>ENGINE WIP</span></div><div><FileImage size={15}/> Texture compatibility <span>ENGINE WIP</span></div><div><ShieldCheck size={15}/> Output validation <span>PLANNED</span></div></div></div>}
          <div className="convert-footer"><div><span className="eyebrow">STEP 03 / CONVERT</span><p>{project?(sourceMatches?"Inventory complete · conversion engine still under development":"Source generation does not match the selected route"):"Import a face project to begin"}</p></div><button className="convert-btn" disabled={!canConvert}><Sparkles size={16}/> Convert to {target}</button></div>
        </div>
      </section>
      </>}
      <section className="face-integrity-strip"><div><BadgeCheck size={15}/><span><b>Face anatomy preservation</b><small>Head · neck · eyes · eyelids · mouth rig validation</small></span></div><div><Sparkles size={15}/><span><b>Hair & beard fidelity</b><small>Colour, alpha edges and facial movement checks</small></span></div><div><FileImage size={15}/><span><b>Skin & normal maps</b><small>Texture-space and shading compatibility checks</small></span></div></section>
      <section className="bottom-strip"><div><HardDrive size={16}/><span><b>Local-first processing</b><small>Your face files stay on your PC</small></span></div><div><ShieldCheck size={16}/><span><b>Non-destructive workflow</b><small>Original source is preserved</small></span></div><div><FileArchive size={16}/><span><b>CPK export</b><small>Validated game-ready packaging · planned</small></span></div></section>
      <footer><span>THEGODMODS FACE FORGE</span><span>KFC GODMODS · BUILT FOR THE COMMUNITY · FREE FOREVER</span></footer>
    </main>
  </div>;
}
