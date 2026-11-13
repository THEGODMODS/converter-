import { lstat,readdir } from "node:fs/promises";
import path from "node:path";
import { inspectFaceFolder,type FaceProject } from "./inventory";
export type FaceDatabase={root:string;faces:FaceProject[];scannedFolders:number;warnings:string[]};
export async function inspectFaceDatabase(folder:string):Promise<FaceDatabase>{
 const root=path.resolve(folder),stat=await lstat(root);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("Choose a real database folder.");
 const warnings:string[]=[],faces:FaceProject[]=[];let scannedFolders=0;
 const entries=await readdir(root,{withFileTypes:true});
 const candidates=[root];
 for(const entry of entries){if(!entry.isDirectory())continue;const child=path.join(root,entry.name),childStat=await lstat(child);if(childStat.isSymbolicLink())continue;candidates.push(child);}
 for(const candidate of candidates){scannedFolders++;try{const project=await inspectFaceFolder(candidate);if(project.models>0)faces.push(project);else if(candidate!==root&&project.fileCount>0)warnings.push("Skipped folder without a recognized face model: "+path.basename(candidate));}catch(error){warnings.push("Could not inspect "+path.basename(candidate)+": "+(error instanceof Error?error.message:"unknown error"));}}
 return {root,faces,scannedFolders,warnings};
}
