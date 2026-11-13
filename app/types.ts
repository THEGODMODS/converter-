export type FacePartRole="head"|"neck"|"eyes"|"eyelids"|"mouth"|"hair"|"beard"|"skin-normal";
export type FacePartCoverage={role:FacePartRole;files:string[];models:number;textures:number;status:"detected"|"not-found"};
export type FaceFile = { path:string;bytes:number;kind:string;sha256:string;formatValid?:boolean;formatDetails?:string[];assetReferences?:string[];packageReferences?:string[] };
export type FaceDependency={source:string;reference:string;status:"resolved"|"missing"|"ambiguous";candidates:string[]};
export type FaceProject = { root:string;detectedGame:"pes2017"|"pes2021"|"mixed"|"unknown";fileCount:number;totalBytes:number;models:number;textures:number;files:FaceFile[];warnings:string[];missing:string[];coverage:FacePartCoverage[];dependencies:FaceDependency[] };
export type FaceDatabase = {root:string;faces:FaceProject[];scannedFolders:number;warnings:string[]};
export type TextureColorSpace = "LINEAR"|"SRGB"|"NORMAL";
export type FacePreviewMesh={name:string;positions:number[];normals:number[];uvs:number[];indices:number[]};
export type FacePreviewMaterial={name:string;shader:string|null;textures:Record<string,string>};
export type FacePreviewData={source:string;generation:"pes2017"|"pes2021";meshes:FacePreviewMesh[];materials:FacePreviewMaterial[];warnings:string[]};
export type FaceForgeApi = {
 chooseFolder:()=>Promise<string|null>;
 chooseFolders:()=>Promise<string[]>;
 inspectDatabase:(folder:string)=>Promise<FaceDatabase>;
 inspectFolder:(folder:string)=>Promise<FaceProject>;
 exportManifest:(folder:string)=>Promise<{destination:string;files:number;bytes:number}|null>;
 previewModel:(folder:string,relativePath:string)=>Promise<FacePreviewData>;
 convertNativeModel:(folder:string)=>Promise<{destination:string;report:{ok:boolean;target:number;outputs:string[];findings:{code:string;subject:{type:string;index?:number};detail:string}[]};textures:{converted:number;bytes:number;files:Array<{source:string;reference:string;destination:string;format:string;width:number;height:number}>}}|null>;
 convertCompleteFaceFolder:(folder:string,target:2017|2021,playerId:string)=>Promise<{destination:string;outputFormat:"cpk"|"fpk";report:Record<string,unknown>}|null>;
 buildFoxFacePackage:(folder:string,virtualRoot:string)=>Promise<{fpk:string;fpkd:string;models:number;textures:number;bytes:number}|null>;
 getPathForDrop:(file:File)=>string;
 convertTextureFile:(colorSpace:TextureColorSpace)=>Promise<{source:string;destination:string;format:string;width:number;height:number;bytes:number}|null>;
 convertTextureFolder:(colorSpace:TextureColorSpace)=>Promise<{source:string;destination:string;converted:number;bytes:number;files:Array<{source:string;destination:string;format:string;width:number;height:number}>}|null>;
};
declare global {interface Window {faceForge:FaceForgeApi}}
