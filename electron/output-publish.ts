import path from "node:path";
import {lstat,realpath,readdir,mkdtemp,rename,rm} from "node:fs/promises";

/**
 * Publish a fully converted staging directory over an existing empty output
 * directory. The original destination is restored if the publish rename fails.
 * Existing/non-empty destinations are never cleared.
 */
export async function publishStagedOutput(stagedDirectory:string,destinationDirectory:string):Promise<string>{
 const destination=path.resolve(destinationDirectory);
 const stat=await lstat(destination);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("The selected output folder is no longer a safe directory.");
 const realDestination=await realpath(destination);
 if((await readdir(realDestination)).length)throw new Error("The selected output folder is no longer empty. Existing files were left untouched.");
 const backupParent=await mkdtemp(path.join(path.dirname(realDestination),".face-forge-publish-"));
 const backup=path.join(backupParent,"empty-output-backup");
 let backupExists=false;
 try{
  await rename(realDestination,backup);
  backupExists=true;
  try{
   await rename(stagedDirectory,realDestination);
  }catch(error){
   try{
    await rename(backup,realDestination);
    backupExists=false;
   }catch(restoreError){
    throw new Error("Publishing failed and the original empty output folder could not be restored. Recovery folder: "+backup+"; publish error: "+(error instanceof Error?error.message:String(error))+"; restore error: "+(restoreError instanceof Error?restoreError.message:String(restoreError)));
   }
   throw error;
  }
  backupExists=false;
  try{await rm(backup,{recursive:true,force:true});}catch{}
  return realDestination;
 }finally{
  // If restoration failed, retain the backup directory for manual recovery.
  if(!backupExists)try{await rm(backupParent,{recursive:true,force:true});}catch{}
 }
}
