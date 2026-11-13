import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type FaceFile = { path: string; bytes: number; kind: string; sha256: string };
export type FaceProject = {
  root: string; detectedGame: "pes2017" | "pes2021" | "mixed" | "unknown";
  fileCount: number; totalBytes: number; models: number; textures: number;
  files: FaceFile[]; warnings: string[]; missing: string[];
};
const MAX_FILES = 5000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const EXT_KIND: Record<string,string> = {
  ".fmdl":"model-pes2021", ".model":"model-pes2017",
  ".ftex":"texture-pes2021", ".dds":"texture-pes2017",
  ".xml":"material-metadata", ".mtl":"material-metadata",
  ".bin":"auxiliary", ".fpk":"container", ".cpk":"container"
};
function classify(filePath:string, head:Buffer):string {
  const ext=path.extname(filePath).toLowerCase();
  if(ext===".dds") return head.length>=4 && head.toString("ascii",0,4)==="DDS " ? "texture-pes2017" : "invalid-dds";
  if(ext===".fmdl") return "model-pes2021";
  if(ext===".model") return "model-pes2017";
  return EXT_KIND[ext] ?? "other";
}
export async function inspectFaceFolder(folder:string):Promise<FaceProject>{
  const root=path.resolve(folder);
  const rootStat=await lstat(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory()) throw new Error("Choose a real face folder, not a shortcut or file.");
  const files:FaceFile[]=[]; const warnings:string[]=[]; let totalBytes=0;
  async function walk(dir:string,relative=""):Promise<void>{
    const entries=await readdir(dir,{withFileTypes:true});
    for(const entry of entries){
      const absolute=path.join(dir,entry.name); const rel=path.posix.join(relative,entry.name);
      const stat=await lstat(absolute);
      if(stat.isSymbolicLink()) { warnings.push("Skipped symbolic link: "+rel); continue; }
      if(stat.isDirectory()){await walk(absolute,rel);continue;}
      if(!stat.isFile()) continue;
      if(files.length>=MAX_FILES) throw new Error("This project exceeds the 5,000-file safety limit.");
      if(stat.size>MAX_FILE_BYTES) {warnings.push("Skipped oversized file: "+rel);continue;}
      totalBytes+=stat.size;
      if(totalBytes>MAX_TOTAL_BYTES) throw new Error("This project exceeds the 1 GiB inspection limit.");
      const ext=path.extname(entry.name).toLowerCase();
      if(!EXT_KIND[ext] && ext!==".png" && ext!==".jpg" && ext!==".jpeg") continue;
      const bytes=await readFile(absolute);
      files.push({path:rel.replaceAll("\\","/"),bytes:stat.size,kind:classify(rel,bytes.subarray(0,16)),sha256:createHash("sha256").update(bytes).digest("hex")});
    }
  }
  await walk(root);
  const has21=files.some(f=>f.kind==="model-pes2021"||f.kind==="texture-pes2021");
  const has17=files.some(f=>f.kind==="model-pes2017"||f.kind==="texture-pes2017");
  const detectedGame=has21&&has17?"mixed":has21?"pes2021":has17?"pes2017":"unknown";
  const models=files.filter(f=>f.kind.startsWith("model-")).length;
  const textures=files.filter(f=>f.kind.startsWith("texture-")).length;
  if(!models) warnings.push("No recognized face model was found (.fmdl or .model).");
  if(!textures) warnings.push("No recognized DDS or FTEX texture was found.");
  if(detectedGame==="mixed") warnings.push("Both generation formats are present. Check whether this is a hybrid or previously converted project.");
  if(detectedGame==="unknown") warnings.push("The source game could not be identified from recognized model and texture files.");
  return {root,detectedGame,fileCount:files.length,totalBytes,models,textures,files,warnings,missing:[]};
}
