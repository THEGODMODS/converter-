export type FaceFile = { path:string;bytes:number;kind:string;sha256:string;formatValid?:boolean;formatDetails?:string[] };
export type FaceProject = { root:string;detectedGame:"pes2017"|"pes2021"|"mixed"|"unknown";fileCount:number;totalBytes:number;models:number;textures:number;files:FaceFile[];warnings:string[];missing:string[] };
export type FaceDatabase = {root:string;faces:FaceProject[];scannedFolders:number;warnings:string[]};
export type TextureColorSpace = "LINEAR"|"SRGB"|"NORMAL";
export type FaceForgeApi = {
 chooseFolder:()=>Promise<string|null>;
 chooseFolders:()=>Promise<string[]>;
 inspectDatabase:(folder:string)=>Promise<FaceDatabase>;
 inspectFolder:(folder:string)=>Promise<FaceProject>;
 getPathForDrop:(file:File)=>string;
 convertTextureFile:(colorSpace:TextureColorSpace)=>Promise<{source:string;destination:string;format:string;width:number;height:number;bytes:number}|null>;
};
declare global {interface Window {faceForge:FaceForgeApi}}
