import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { FaceProject } from "../engine/inventory";
const api = {
  chooseFolder: ():Promise<string|null> => ipcRenderer.invoke("face:choose-folder"),
  inspectFolder: (folder:string):Promise<FaceProject> => ipcRenderer.invoke("face:inspect-folder",folder),
  getPathForDrop: (file:File):string => webUtils.getPathForFile(file)
};
contextBridge.exposeInMainWorld("faceForge",api);
