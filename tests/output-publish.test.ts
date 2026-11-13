import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {publishStagedOutput} from "../electron/output-publish";

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"face-forge-publish-"));roots.push(root);
 const destination=path.join(root,"result"),stage=path.join(root,"stage");
 await mkdir(destination);await mkdir(stage);
 return {root,destination,stage};
}

describe("staged conversion publishing",()=>{
 it("publishes a complete staged result into an empty destination",async()=>{
  const {destination,stage}=await fixture();
  await writeFile(path.join(stage,"face.model"),Buffer.from("converted"));
  expect(await publishStagedOutput(stage,destination)).toBe(destination);
  expect((await readFile(path.join(destination,"face.model"))).toString()).toBe("converted");
  expect(await readdir(stage).catch(()=>[])).toEqual([]);
 });
 it("refuses a destination that becomes non-empty and leaves both sides intact",async()=>{
  const {destination,stage}=await fixture();
  await writeFile(path.join(stage,"face.model"),Buffer.from("converted"));
  await writeFile(path.join(destination,"user.txt"),"keep");
  await expect(publishStagedOutput(stage,destination)).rejects.toThrow(/no longer empty/i);
  expect((await readFile(path.join(destination,"user.txt"))).toString()).toBe("keep");
  expect((await readFile(path.join(stage,"face.model"))).toString()).toBe("converted");
 });
 it("rejects a symbolic-link destination without touching its target",async()=>{
  const {root,destination,stage}=await fixture();
  const real=path.join(root,"real");await mkdir(real);await writeFile(path.join(real,"keep.txt"),"keep");
  await rm(destination,{recursive:true,force:true});
  const {symlink}=await import("node:fs/promises");await symlink(real,destination,"junction");
  await expect(publishStagedOutput(stage,destination)).rejects.toThrow(/safe directory/i);
  expect((await readFile(path.join(real,"keep.txt"))).toString()).toBe("keep");
 });
});
