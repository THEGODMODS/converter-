import { inspectCpk, type CpkInspection } from "./cpk";

export type Pes2017FaceCpkVerification = {
  outerInspection: CpkInspection;
  faceCpkPath: string;
  faceInspection: CpkInspection;
  faceXmlPath: string;
  faceModelPath: string;
  faceMaterialPath: string;
};

/** Verify the Team Compiler's outer team CPK and requested nested player-face CPK. */
export function verifyPes2017FaceCpk(bytes: Buffer, expectedPlayerId: string): Pes2017FaceCpkVerification {
  if (!/^[0-9]{5}$/.test(expectedPlayerId)) {
    throw new Error("Expected PES 2017 player ID must contain exactly five digits.");
  }
  const outerInspection = inspectCpk(bytes);
  if (!outerInspection.valid || outerInspection.fileCount === 0) {
    throw new Error("Independent outer CPK read-back failed: " + outerInspection.errors.join("; "));
  }
  const expectedFaceCpk = expectedPlayerId + ".cpk";
  const candidates = outerInspection.files.filter(entry => entry.path.toLowerCase().split("/").at(-1) === expectedFaceCpk.toLowerCase());
  if (candidates.length === 0) {
    throw new Error("PES 2017 team CPK has no nested player-face CPK for target player ID " + expectedPlayerId + ".");
  }
  const failures: string[] = [];
  for (const candidate of candidates) {
    const nestedBytes = bytes.subarray(candidate.offset, candidate.offset + candidate.size);
    const faceInspection = inspectCpk(nestedBytes);
    if (!faceInspection.valid || faceInspection.fileCount === 0) {
      failures.push(candidate.path + ": " + faceInspection.errors.join("; "));
      continue;
    }
    const findBasename = (name: string) => faceInspection.files.find(entry => entry.path.toLowerCase().split("/").at(-1) === name);
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
    return {outerInspection,faceCpkPath:candidate.path,faceInspection,faceXmlPath:faceXml.path,faceModelPath:faceModel.path,faceMaterialPath:faceMaterial.path};
  }
  throw new Error("No nested CPK passed PES 2017 face validation. " + failures.join(" | "));
}
