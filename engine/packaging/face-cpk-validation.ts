import { inspectCpk, type CpkInspection } from "./cpk";

export type Pes2017FaceCpkVerification = {
  outerInspection: CpkInspection;
  faceCpkPath: string;
  faceInspection: CpkInspection;
  faceXmlPath: string;
  faceModelPath: string;
  faceMaterialPath: string;
};

/**
 * Verify the Team Compiler's PES 2017 output shape:
 * outer team CPK -> nested player-face CPK -> face.xml/model/material assets.
 */
export function verifyPes2017FaceCpk(bytes: Buffer): Pes2017FaceCpkVerification {
  const outerInspection = inspectCpk(bytes);
  if (!outerInspection.valid || outerInspection.fileCount === 0) {
    throw new Error("Independent outer CPK read-back failed: " + outerInspection.errors.join("; "));
  }
  const candidates = outerInspection.files.filter(entry => entry.path.toLowerCase().endsWith(".cpk"));
  if (candidates.length === 0) {
    throw new Error("PES 2017 team CPK contains no nested player-face CPK.");
  }
  const failures: string[] = [];
  for (const candidate of candidates) {
    const nestedBytes = bytes.subarray(candidate.offset, candidate.offset + candidate.size);
    const faceInspection = inspectCpk(nestedBytes);
    if (!faceInspection.valid || faceInspection.fileCount === 0) {
      failures.push(candidate.path + ": " + faceInspection.errors.join("; "));
      continue;
    }
    const findBasename = (name: string) =>
      faceInspection.files.find(entry => entry.path.toLowerCase().split("/").at(-1) === name);
    const faceXml = findBasename("face.xml");
    const faceModel = findBasename("oral_face_high_win32.model");
    const faceMaterial = findBasename("face_high.mtl");
    if (!faceXml || !faceModel || !faceMaterial) {
      failures.push(candidate.path + ": missing " + [
        !faceXml ? "face.xml" : "",
        !faceModel ? "oral_face_high_win32.model" : "",
        !faceMaterial ? "face_high.mtl" : "",
      ].filter(Boolean).join(", "));
      continue;
    }
    return {
      outerInspection,
      faceCpkPath: candidate.path,
      faceInspection,
      faceXmlPath: faceXml.path,
      faceModelPath: faceModel.path,
      faceMaterialPath: faceMaterial.path,
    };
  }
  throw new Error("No nested CPK passed PES 2017 face validation. " + failures.join(" | "));
}
