import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { inspectFaceFolder } from "../engine/inventory";
import { inspectFaceDatabase } from "../engine/database";
import { ddsToFtex, ftexToDds, type TextureColorSpace } from "../engine/formats/texture";
import { parseModelContainer } from "../engine/formats/model-container";
import { decodePes2017Model } from "../engine/formats/model-scene";
import { parseFmdlContainer } from "../engine/formats/fmdl-container";
import { decodePes2021Fmdl } from "../engine/formats/fmdl-geometry";

let mainWindow:BrowserWindow|null=null;
function trusted(event:Electron.IpcMainInvokeEvent){
 const url=event.senderFrame?.url??"";
 if(app.isPackaged){const expected=pathToFileURL(path.join(__dirname,"../../dist/index.html")).href;if(url!==expected)throw new Error("Untrusted renderer.");}
 else {const parsed=new URL(url);if(parsed.origin!=="http://127.0.0.1:5173"||(parsed.pathname!=="/"&&parsed.pathname!=="/index.html"))throw new Error("Untrusted renderer.");}
}
function registerIpc(){
 ipcMain.handle("face:choose-folder",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose PES face project folder",properties:["openDirectory"]});return result.canceled?null:result.filePaths[0]??null;});
 ipcMain.handle("face:choose-folders",async event=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow!,{title:"Choose face folders for batch or project",properties:["openDirectory","multiSelections"]});return result.canceled?[]:result.filePaths;});
 ipcMain.handle("face:inspect-database",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid database path.");if(!fs.existsSync(folder))throw new Error("The selected database folder no longer exists.");return inspectFaceDatabase(folder);});
 ipcMain.handle("face:inspect-folder",async(event,folder:unknown)=>{trusted(event);if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Invalid folder path.");if(!fs.existsSync(folder))throw new Error("The selected folder no longer exists.");return inspectFaceFolder(folder);});
 ipcMain.handle("face:preview-model",async(event,folder:unknown,relativePath:unknown)=>{
  trusted(event);
  if(typeof folder!=="string"||!path.isAbsolute(folder)||typeof relativePath!=="string"||relativePath.length>2048)throw new Error("Invalid preview source.");
  const root=path.resolve(folder),source=path.resolve(root,relativePath),prefix=root.endsWith(path.sep)?root:root+path.sep;
  if(!source.startsWith(prefix))throw new Error("Preview path escapes the selected face folder.");
  const stat=await fs.promises.lstat(source);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>256*1024*1024)throw new Error("Preview source is not a safe supported file.");
  const data=await readFile(source),extension=path.extname(source).toLowerCase();
  let generation:"pes2017"|"pes2021",meshes:Array<{name:string;positions:number[];normals:number[];uvs:number[];indices:number[]}>=[],warnings:string[]=[];
  if(extension===".fmdl"){
   const scene=decodePes2021Fmdl(parseFmdlContainer(data));generation="pes2021";
   meshes=scene.meshes.map(mesh=>({name:mesh.name,positions:mesh.vertices.flatMap(v=>v.position),normals:mesh.vertices.every(v=>v.normal)?mesh.vertices.flatMap(v=>v.normal!):[],uvs:mesh.vertices.every(v=>v.uvs.length>0)?mesh.vertices.flatMap(v=>v.uvs[0]):[],indices:mesh.indices}));
   if(scene.bones.length)warnings.push(scene.bones.length+" source bones detected; preview is static and does not play facial animation.");
   if(scene.metadata.additionalLodLevels)warnings.push("Additional LOD levels are not shown in this preview.");
  }else if(extension===".model"){
   const scene=decodePes2017Model(parseModelContainer(data));generation="pes2017";
   meshes=scene.meshes.map(mesh=>({name:mesh.name,positions:mesh.vertices.flatMap(v=>v.position),normals:mesh.vertices.every(v=>v.normal)?mesh.vertices.flatMap(v=>v.normal!):[],uvs:mesh.vertices.every(v=>v.uvs.length>0)?mesh.vertices.flatMap(v=>v.uvs[0]):[],indices:mesh.indices}));
   if(typeof scene.metadata.modelWarnings==="string"&&scene.metadata.modelWarnings)warnings.push(scene.metadata.modelWarnings);
   warnings.push("PES 2017 preview is static. External MTL shader/texture bindings and facial animation are not yet rendered.");
  }else throw new Error("Choose a .fmdl or .model file for 3D preview.");
  if(!meshes.length)throw new Error("No renderable mesh geometry was found in this model.");
  const totalVertices=meshes.reduce((sum,mesh)=>sum+mesh.positions.length/3,0);if(totalVertices>500000)throw new Error("Preview exceeds the 500,000-vertex safety limit.");
  return {source:relativePath,generation,meshes,warnings};
 });
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
 const iconPath=app.isPackaged?path.join(process.resourcesPath,"face-forge.ico"):path.join(app.getAppPath(),"assets","face-forge.ico");
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:980,minHeight:720,backgroundColor:"#090b10",title:"THEGODMODS FACE FORGE",...(fs.existsSync(iconPath)?{icon:iconPath}:{}),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 if(app.isPackaged)void mainWindow.loadFile(path.join(__dirname,"../../dist/index.html"));else void mainWindow.loadURL("http://127.0.0.1:5173");
 mainWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
 const trustedUrl=app.isPackaged?pathToFileURL(path.join(__dirname,"../../dist/index.html")).href:"http://127.0.0.1:5173/";
 mainWindow.webContents.on("will-navigate",(event,url)=>{if(url!==trustedUrl)event.preventDefault();});
 mainWindow.on("closed",()=>{mainWindow=null;});
}
app.whenReady().then(()=>{registerIpc();createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
