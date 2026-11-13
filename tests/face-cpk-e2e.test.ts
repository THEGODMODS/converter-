import {describe,expect,it} from "vitest";
import {readdirSync,readFileSync} from "node:fs";
import path from "node:path";
import {verifyPes2017FaceCpk} from "../engine/packaging/face-cpk-validation";

const outputDirectory=process.env.FACE_FORGE_E2E_OUTPUT;
const e2e=outputDirectory?describe:describe.skip;

e2e("synthetic structural PES 2021 to PES 2017 package conversion fixture",()=>{
  it("produces a nested face CPK for the requested PES player ID",()=>{
    const files=readdirSync(outputDirectory!).filter(name=>name.toLowerCase().endsWith(".cpk"));
    expect(files.length).toBeGreaterThan(0);
    const verifications=files.map(file=>verifyPes2017FaceCpk(readFileSync(path.join(outputDirectory!,file)),"79205"));
    for(const result of verifications){
      expect(result.faceCpkPath.toLowerCase()).toContain("79205.cpk");
    }
    const report=JSON.parse(readFileSync(path.join(outputDirectory!,"face-forge-report.json"),"utf8"));
    expect(report.ok).toBe(true);
    expect(report.targetPlayerId).toBe("79205");
    expect(report.complete.success).toBe(true);
    expect(report.sourceModels.some((name:string)=>name.toLowerCase().endsWith("face_high.fmdl"))).toBe(true);
    expect(report.sourceModels.some((name:string)=>name.toLowerCase().endsWith("fcl_hair.fmdl"))).toBe(true);
    const preservedSidecars = Array.isArray(report.preservedSidecars) ? report.preservedSidecars as string[] : [];
    for (const sidecar of preservedSidecars) {
      const basename = sidecar.split(/[\\/]/).pop()!.toLowerCase();
      const found = verifications.some(result => result.faceInspection.files.some(entry => path.posix.basename(entry.path).toLowerCase() === basename));
      if (!found) {
        const archiveEntries = verifications.map(result => ({
          outer: result.outerInspection.files.map(entry => entry.path),
          nestedFace: result.faceInspection.files.map(entry => entry.path),
        }));
        throw new Error("Preserved sidecar " + sidecar + " was not found in the nested face CPK. Archive entries: " + JSON.stringify(archiveEntries));
      }
    }
  });
});
