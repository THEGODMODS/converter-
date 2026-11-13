import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { FaceProject } from "../engine/inventory";
import type { FacePreviewData } from "../app/types";
import type { FaceDatabase } from "../engine/database";
import type { TextureColorSpace } from "../engine/formats/texture";
const api = {
  chooseFolder: ():Promise<string|null> => ipcRenderer.invoke("face:choose-folder"),
  chooseFolders: ():Promise<string[]> => ipcRenderer.invoke("face:choose-folders"),
  inspectDatabase: (folder:string):Promise<FaceDatabase> => ipcRenderer.invoke("face:inspect-database",folder),
  inspectFolder: (folder:string):Promise<FaceProject> => ipcRenderer.invoke("face:inspect-folder",folder),
  exportManifest: (folder:string):Promise<{destination:string;files:number;bytes:number}|null> => ipcRenderer.invoke("face:export-manifest",folder),
  installPackage: (manifestUrl:string):Promise<{packageId:string;version:string;displayName:string;files:number;directory:string}> => ipcRenderer.invoke("package:install",manifestUrl),
  previewModel: (folder:string,relativePath:string):Promise<FacePreviewData> => ipcRenderer.invoke("face:preview-model",folder,relativePath),
  convertNativeModel: (folder:string):Promise<{destination:string;report:{ok:boolean;target:number;outputs:string[];findings:{code:string;subject:{type:string;index?:number};detail:string}[]};textures:{converted:number;bytes:number;files:Array<{source:string;reference:string;destination:string;format:string;width:number;height:number}>}}|null> => ipcRenderer.invoke("face:convert-native-model",folder),
  convertCompleteFaceFolder: (folder:string,target:2017,playerId:string):Promise<{destination:string;outputFormat:"cpk"|"fpk";report:Record<string,unknown>}|null> => ipcRenderer.invoke("face:convert-complete-folder",folder,target,playerId),
  buildFoxFacePackage: (folder:string,virtualRoot:string):Promise<{fpk:string;fpkd:string;models:number;textures:number;bytes:number}|null> => ipcRenderer.invoke("face:build-fox-package",folder,virtualRoot),
  getPathForDrop: (file:File):string => webUtils.getPathForFile(file),
  convertTextureFile: (colorSpace:TextureColorSpace):Promise<{source:string;destination:string;format:string;width:number;height:number;bytes:number}|null> => ipcRenderer.invoke("texture:convert",colorSpace),
  convertTextureFolder: (colorSpace:TextureColorSpace):Promise<{source:string;destination:string;converted:number;bytes:number;files:Array<{source:string;destination:string;format:string;width:number;height:number}>}|null> => ipcRenderer.invoke("texture:convert-folder",colorSpace)
};
contextBridge.exposeInMainWorld("faceForge",api);
