import type {FaceProject} from "./inventory";

export type FaceProjectManifest={
 schemaVersion:1;
 product:"KFC GODMODS FACE FORGE";
 manifestType:"face-project-inventory";
 source:{game:FaceProject["detectedGame"];root:string};
 summary:{fileCount:number;totalBytes:number;models:number;textures:number;validFiles:number;invalidFiles:number};
 files:Array<{path:string;bytes:number;kind:string;sha256:string;formatValid?:boolean;formatDetails?:string[]}>;
 coverage:FaceProject["coverage"];
 dependencies:FaceProject["dependencies"];
 warnings:string[];
 missing:string[];
 integrity:{algorithm:"SHA-256";complete:boolean};
};

/** Builds a stable, portable inventory manifest. It describes inspected inputs; it does not certify convertibility. */
export function buildFaceProjectManifest(project:FaceProject):FaceProjectManifest{
 const files=[...project.files].sort((a,b)=>a.path.localeCompare(b.path,"en"));
 const validFiles=files.filter(file=>file.formatValid===true).length;
 const invalidFiles=files.filter(file=>file.formatValid===false).length;
 return {
  schemaVersion:1,
  product:"KFC GODMODS FACE FORGE",
  manifestType:"face-project-inventory",
  source:{game:project.detectedGame,root:project.root.split(/[\\/]/).filter(Boolean).pop()??"face-project"},
  summary:{fileCount:files.length,totalBytes:project.totalBytes,models:project.models,textures:project.textures,validFiles,invalidFiles},
  files:files.map(file=>({path:file.path,bytes:file.bytes,kind:file.kind,sha256:file.sha256,...(file.formatValid===undefined?{}:{formatValid:file.formatValid}),...(file.formatDetails?.length?{formatDetails:[...file.formatDetails]}:{})})),
  coverage:project.coverage.map(part=>({...part,files:[...part.files].sort((a,b)=>a.localeCompare(b,"en"))})),
  dependencies:project.dependencies.map(item=>({...item,candidates:[...item.candidates].sort((a,b)=>a.localeCompare(b,"en"))})),
  warnings:[...project.warnings],
  missing:[...project.missing],
  integrity:{algorithm:"SHA-256",complete:files.length>0&&files.length===project.fileCount&&files.every(file=>/^[a-f0-9]{64}$/i.test(file.sha256))&&files.every(file=>Number.isSafeInteger(file.bytes)&&file.bytes>=0)&&files.reduce((sum,file)=>sum+file.bytes,0)===project.totalBytes}
 };
}
