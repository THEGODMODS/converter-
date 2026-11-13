import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { FaceProject } from "../engine/inventory";
import type { TextureColorSpace } from "../engine/formats/texture";
const api = {
  chooseFolder: ():Promise<string|null> => ipcRenderer.invoke("face:choose-folder"),
  inspectFolder: (folder:string):Promise<FaceProject> => ipcRenderer.invoke("face:inspect-folder",folder),
  getPathForDrop: (file:File):string => webUtils.getPathForFile(file),
  convertTextureFile: (colorSpace:TextureColorSpace):Promise<{source:string;destination:string;format:string;width:number;height:number;bytes:number}|null> => ipcRenderer.invoke("texture:convert",colorSpace)
};
contextBridge.exposeInMainWorld("faceForge",api);
