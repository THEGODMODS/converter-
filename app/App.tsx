import { useCallback, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, BadgeCheck, Box, CheckCircle2, ChevronDown, CircleHelp, FileArchive, FileImage, FileSearch, FolderOpen, Gauge, HardDrive, History, Layers3, Package, ScanFace, ShieldCheck, Sparkles, UploadCloud, XCircle } from "lucide-react";
import type { FaceProject } from "./types";

type Direction = "pes2021-to-pes2017" | "pes2017-to-pes2021";
const formatBytes = (bytes: number) => bytes < 1024 ? bytes + " B" : bytes < 1024*1024 ? (bytes/1024).toFixed(1)+" KB" : (bytes/1024/1024).toFixed(1)+" MB";

export default function App() {
  const [direction, setDirection] = useState<Direction>("pes2021-to-pes2017");
  const [project, setProject] = useState<FaceProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
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
  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const path = window.faceForge.getPathForDrop(file);
    if (!path) { setError("Drop a face folder from Windows Explorer, not an individual file."); return; }
    await inspect(path);
  };
  const directionLabel = useMemo(() => direction === "pes2021-to-pes2017" ? "NEW-GEN → CLASSIC" : "CLASSIC → NEW-GEN", [direction]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ScanFace size={23}/></div><div><strong>THEGODMODS</strong><span>FACE FORGE</span></div></div>
      <div className="side-label">WORKSPACE</div>
      <button className="nav-item active"><Layers3 size={17}/> Converter <span className="nav-dot"/></button>
      <button className="nav-item" onClick={() => setProject(null)}><History size={17}/> Recent projects</button>
      <div className="side-label tools-label">TOOLKIT</div>
      <div className="tool-link"><FileSearch size={16}/> Face inspector</div>
      <div className="tool-link"><FileImage size={16}/> Texture lab <small>SOON</small></div>
      <div className="tool-link"><Box size={16}/> 3D preview <small>SOON</small></div>
      <div className="tool-link"><Package size={16}/> CPK builder <small>SOON</small></div>
      <div className="sidebar-bottom"><div className="free-pill"><Sparkles size={14}/> FREE FOREVER</div><div className="version">FACE FORGE · PREVIEW 0.1.0</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">THE MODDING WORKSHOP</div><h1>Face Converter</h1><p>Move face projects between PES generations. Cleanly. Safely. Freely.</p></div><div className="top-status"><span className="status-led"/> LOCAL WORKSPACE <ChevronDown size={14}/></div></header>
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
          {project && <div className="project-card"><div className="project-title"><CheckCircle2 size={17}/><strong>Project inspected</strong><button onClick={()=>setProject(null)}><XCircle size={15}/></button></div><div className="project-path">{project.root}</div><div className="project-stats"><div><strong>{project.fileCount}</strong><span>FILES</span></div><div><strong>{project.models}</strong><span>MODELS</span></div><div><strong>{project.textures}</strong><span>TEXTURES</span></div><div><strong>{formatBytes(project.totalBytes)}</strong><span>SIZE</span></div></div><div className="detected">Detected: <b>{project.detectedGame==="pes2021"?"PES 2021":project.detectedGame==="pes2017"?"PES 2017":project.detectedGame==="mixed"?"Mixed / hybrid":"Unknown"}</b></div>{project.warnings.map((w,i)=><div className="warning-line" key={i}><CircleHelp size={13}/>{w}</div>)}</div>}
        </div>
        <div className="analysis-panel">
          <div className="section-head"><div><span className="eyebrow">STEP 02 / ANALYSIS</span><h2>Conversion readiness</h2></div><span className="step-number">02</span></div>
          {project ? <div className="project-analysis"><div className="radar"><Gauge size={26}/></div><h3>{sourceMatches ? "Source matches this route" : "Check the source format"}</h3><p>{sourceMatches ? "Detected a " + source + " project. The inventory is ready for deeper compatibility checks." : "This project was detected as " + project.detectedGame.toUpperCase() + ". The selected route expects " + source + ". Change the route or inspect the correct source folder."}</p><div className="analysis-checks"><div><FileSearch size={15}/> Binary signature scan <span>COMPLETE</span></div><div><Layers3 size={15}/> Model / material translation <span>IN DEVELOPMENT</span></div><div><FileImage size={15}/> Texture transcoding <span>IN DEVELOPMENT</span></div><div><ShieldCheck size={15}/> Target-game validation <span>NOT RUN</span></div></div><div className="file-preview">{project.files.slice(0,5).map(file=><div key={file.path}><span>{file.kind}</span><b>{file.path}</b><small>{formatBytes(file.bytes)}</small></div>)}</div></div> : <div className="analysis-empty"><div className="radar"><Gauge size={28}/></div><h3>Waiting for your face</h3><p>We'll inspect every model, texture and companion file before preparing a conversion.</p><div className="analysis-checks"><div><FileSearch size={15}/> Source format detection <span>READY</span></div><div><Layers3 size={15}/> Mesh & material analysis <span>ENGINE WIP</span></div><div><FileImage size={15}/> Texture compatibility <span>ENGINE WIP</span></div><div><ShieldCheck size={15}/> Output validation <span>PLANNED</span></div></div></div>}
          <div className="convert-footer"><div><span className="eyebrow">STEP 03 / CONVERT</span><p>{project?(sourceMatches?"Inventory complete · conversion engine still under development":"Source generation does not match the selected route"):"Import a face project to begin"}</p></div><button className="convert-btn" disabled={!canConvert}><Sparkles size={16}/> Convert to {target}</button></div>
        </div>
      </section>
      <section className="bottom-strip"><div><HardDrive size={16}/><span><b>Local-first processing</b><small>Your face files stay on your PC</small></span></div><div><ShieldCheck size={16}/><span><b>Non-destructive workflow</b><small>Original source is preserved</small></span></div><div><FileArchive size={16}/><span><b>CPK export</b><small>Validated game-ready packaging · planned</small></span></div></section>
      <footer><span>THEGODMODS FACE FORGE</span><span>BUILT FOR THE COMMUNITY. FREE FOR EVERYONE.</span></footer>
    </main>
  </div>;
}
