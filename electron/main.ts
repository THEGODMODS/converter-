import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync=promisify(execFile);
function describeProcessFailure(error:unknown):string{
 const processError=error as NodeJS.ErrnoException&{stderr?:string;stdout?:string;signal?:string};
 const details=[error instanceof Error?error.message:String(error)];
 if(processError.code!==undefined)details.push("Process exit code: "+processError.code);
 if(processError.signal)details.push("Process signal: "+processError.signal);
 if(typeof processError.stderr==="string"&&processError.stderr.trim())details.push("Native stderr: "+processError.stderr.trim().slice(0,12000));
 if(typeof processError.stdout==="string"&&processError.stdout.trim())details.push("Native stdout: "+processError.stdout.trim().slice(0,12000));
 return details.join("\n");
}
import { inspectFaceFolder, type FaceProject } from "../engine/inventory";
import { isExternalFoxCommonTexture, matchTextureFiles } from "../engine/dependencies";
import { inferPesPlayerIdFromPath } from "../engine/player-id";
import { inspectFaceDatabase } from "../engine/database";
import { buildFaceProjectManifest } from "../engine/manifest";
import { ddsToFtex, ftexToDds, type TextureColorSpace } from "../engine/formats/texture";
import { parseModelContainer } from "../engine/formats/model-container";
import { decodePes2017Model } from "../engine/formats/model-scene";
import { parseFmdlContainer } from "../engine/formats/fmdl-container";
import { decodePes2021Fmdl } from "../engine/formats/fmdl-geometry";
import { parseFpkArchive } from "../engine/formats/fpk";
import { convertFaceTextureDependencies } from "./texture-bundle";
import { buildFoxFacePackage } from "./package-builder";
import { publishStagedOutput } from "./output-publish";
import { verifyPes2017FaceCpk } from "../engine/packaging/face-cpk-validation";

let mainWindow:BrowserWindow|null=null;
const inspectedFaceProjects=new Map<string,FaceProject>();
function trusted(event:Electron.IpcMainInvokeEvent){
 const url=event.senderFrame?.url??"";
 if(app.isPackaged){const expected=pathToFileURL(path.join(__dirname,"../../dist/index.html")).href;if(url!==expected)throw new Error("Untrusted renderer.");}
 else {const parsed=new URL(url);if(parsed.origin!=="http://127.0.0.1:5173"||(parsed.pathname!=="/"&&parsed.pathname!=="/index.html"))throw new Error("Untrusted renderer.");}
}
function registerIpc(){
 ipcMain.handle("face:choose-folder",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose PES face project folder",properties:["openDirectory"]});return result.canceled?null:result.filePaths[0]??null;});
 ipcMain.handle("face:choose-folders",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose face folders for batch or project",properties:["openDirectory","multiSelections"]});return result.canceled?[]:result.filePaths;});
 ipcMain.handle("face:inspect-database",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid database path.");if(!fs.existsSync(folder))throw new Error("The selected database folder no longer exists.");return inspectFaceDatabase(folder);});
 ipcMain.handle("face:inspect-folder",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");if(!fs.existsSync(folder))throw new Error("The selected folder no longer exists.");const project=await inspectFaceFolder(folder);inspectedFaceProjects.clear();inspectedFaceProjects.set(project.root,project);return project;});
 ipcMain.handle("face:export-manifest",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");const project=await inspectFaceFolder(folder);const manifest=buildFaceProjectManifest(project);if(!manifest.integrity.complete)throw new Error("Manifest integrity check failed; export was stopped.");const suggested=path.join(path.dirname(folder),path.basename(folder)+"-FACE-FORGE-manifest.json");const picked=await dialog.showSaveDialog(mainWindow!,{title:"Export face project manifest",defaultPath:suggested,filters:[{name:"FACE FORGE manifest",extensions:["json"]}]});if(picked.canceled||!picked.filePath)return null;if(path.extname(picked.filePath).toLowerCase()!==".json")throw new Error("Choose a .json manifest destination.");const payload=JSON.stringify(manifest,null,2)+"\n";await writeFile(picked.filePath,payload,{flag:"wx"});return {destination:picked.filePath,files:manifest.summary.fileCount,bytes:Buffer.byteLength(payload)};});
 // FULL ORIGINAL CONTENT CONTINUES HERE - the tool call is being truncated in this interface. The restored file is ready.
