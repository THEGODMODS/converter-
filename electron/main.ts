import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { inspectFaceFolder } from "../engine/inventory";

let mainWindow:BrowserWindow|null=null;
function trusted(event:Electron.IpcMainInvokeEvent){
  const url=event.senderFrame?.url??"";
  if(app.isPackaged){if(url!==`file://${path.join(__dirname,"../../dist/index.html").replaceAll("\\\\","/")}`) throw new Error("Untrusted renderer.");}
  else {const parsed=new URL(url);if(parsed.origin!=="http://127.0.0.1:5173") throw new Error("Untrusted renderer.");}
}
function registerIpc(){
  ipcMain.handle("face:choose-folder",async event=>{
    trusted(event);
    const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose PES face project folder",properties:["openDirectory"]});
    return result.canceled?null:result.filePaths[0]??null;
  });
  ipcMain.handle("face:inspect-folder",async(event,folder:unknown)=>{
    trusted(event);
    if(typeof folder!=="string"||!path.isAbsolute(folder)) throw new Error("Invalid folder path.");
    if(!fs.existsSync(folder)) throw new Error("The selected folder no longer exists.");
    return inspectFaceFolder(folder);
  });
}
function createWindow(){
  mainWindow=new BrowserWindow({width:1440,height:960,minWidth:980,minHeight:720,backgroundColor:"#090b10",title:"THEGODMODS FACE FORGE",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  if(app.isPackaged) void mainWindow.loadFile(path.join(__dirname,"../../dist/index.html"));
  else void mainWindow.loadURL("http://127.0.0.1:5173");
  mainWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  mainWindow.webContents.on("will-navigate",(event,url)=>{if(!url.startsWith("http://127.0.0.1:5173/")&&!url.startsWith("file://")) event.preventDefault();});
  mainWindow.on("closed",()=>{mainWindow=null;});
}
app.whenReady().then(()=>{registerIpc();createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
