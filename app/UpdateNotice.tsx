import {useEffect,useState} from "react";
import {Download,RefreshCw} from "lucide-react";
import type {UpdateStatus} from "./types";
export default function UpdateNotice(){
 const [status,setStatus]=useState<UpdateStatus>({state:"checking"});
 useEffect(()=>{
  let mounted=true;
  const unsubscribe=window.faceForge.onUpdateStatus(next=>{if(mounted)setStatus(next);});
  void window.faceForge.checkForUpdates().then(next=>{if(mounted)setStatus(current=>current.state==="available"||current.state==="downloading"||current.state==="downloaded"?current:next);}).catch(()=>{});
  return ()=>{mounted=false;unsubscribe();};
 },[]);
 const startUpdate=async()=>{
  setStatus(current=>({...current,state:"downloading",percent:0}));
  try{await window.faceForge.downloadUpdate();}
  catch(error){setStatus({state:"error",message:error instanceof Error?error.message:"Could not download the update."});}
 };
 if(status.state==="available")return <section className="update-notice" role="status"><div className="update-copy"><strong>FACE FORGE {status.version?"v"+status.version:"update"} is available</strong><span>Download and install the latest release. The app will restart when it is ready.</span></div><button onClick={startUpdate}><Download size={14}/> UPDATE NOW</button></section>;
 if(status.state==="downloading")return <section className="update-notice" role="status"><div className="update-copy"><strong>Downloading update… {status.percent??0}%</strong><span>Keep FACE FORGE open. It will install and restart automatically.</span><div className="update-progress"><span style={{width:(status.percent??0)+"%"}}/></div></div></section>;
 if(status.state==="downloaded")return <section className="update-notice" role="status"><div className="update-copy"><strong>Update downloaded</strong><span>Installing and restarting FACE FORGE…</span></div><RefreshCw size={18}/></section>;
 return null;
}
