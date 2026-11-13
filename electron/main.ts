import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { inspectFaceFolder } from "../engine/inventory";
import { ddsToFtex, ftexToDds, type TextureColorSpace } from "../engine/formats/texture";

let mainWindow:BrowserWindow|null=null;
function trusted(event:Electron.IpcMainInvokeEvent){
 const url=event.senderFrame?.url??"";
 if(app.isPackaged){const expected=pathToFileURL(path.join(__dirname,"../../dist/index.html")).href;if(url!==expected)throw new Error("Untrusted renderer.");}
 else {const parsed=new URL(url);if(parsed.origin!=="http://127.0.0.1:5173"||(parsed.pathname!=="/"&&parsed.pathname!=="/index.html"))throw new Error("Untrusted renderer.");}
}
function registerIpc(){
 ipcMain.handle("face:choose-folder",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose PES face project folder",properties:["openDirectory"]});return result.canceled?null:result.filePaths[0]??null;});
 ipcMain.handle("face:inspect-folder",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");if(!fs.existsSync(folder))throw new Error("The selected folder no longer exists.");return inspectFaceFolder(folder);});
 ipcMain.handle("texture:convert",async(event,colorSpace:unknown)=>{
  trusted(event);
  if(colorSpace!=="LINEAR"&&colorSpace!=="SRGB"&&colorSpace!=="NORMAL")throw new Error("Invalid texture color-space selection.");
  const picked=await dialog.showOpenDialog(mainWindow!,{title:"Choose a DDS or FTEX texture",properties:["openFile"],filters:[{name:"PES textures",extensions:["dds","ftex"]}]});
  if(picked.canceled||!picked.filePaths[0])return null;
  const source=picked.filePaths[0],extension=path.extname(source).toLowerCase(),input=await readFile(source);
  const converted=extension===".dds"?ddsToFtex(input,colorSpace as TextureColorSpace):extension===".ftex"?ftexToDds(input):null;
  if(!converted)throw new Error("Choose a .dds or .ftex texture.");
  const outputExtension=extension===".dds"?".ftex":".dds";
  const suggested=path.join(path.dirname(source),path.basename(source,path.extname(source))+".converted"+outputExtension);
  const save=await dialog.showSaveDialog(mainWindow!,{title:"Save converted texture",defaultPath:suggested,filters:[{name:outputExtension===".dds"?"DDS texture":"FTEX texture",extensions:[outputExtension.slice(1)]}]});
  if(save.canceled||!save.filePath)return null;
  if(path.extname(save.filePath).toLowerCase()!==outputExtension)throw new Error("Choose the correct "+outputExtension+" output extension.");
  await writeFile(save.filePath,converted.data,{flag:"wx"});
  return {source,destination:save.filePath,format:converted.info.formatName,width:converted.info.width,height:converted.info.height,bytes:converted.data.length};
 });
}
function createWindow(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:980,minHeight:720,backgroundColor:"#090b10",title:"THEGODMODS FACE FORGE",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 if(app.isPackaged)void mainWindow.loadFile(path.join(__dirname,"../../dist/index.html"));else void mainWindow.loadURL("http://127.0.0.1:5173");
 mainWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
 const trustedUrl=app.isPackaged?pathToFileURL(path.join(__dirname,"../../dist/index.html")).href:"http://127.0.0.1:5173/";
 mainWindow.webContents.on("will-navigate",(event,url)=>{if(url!==trustedUrl)event.preventDefault();});
 mainWindow.on("closed",()=>{mainWindow=null;});
}
app.whenReady().then(()=>{registerIpc();createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
