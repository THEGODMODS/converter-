import { inspectCpk, type CpkInspection } from "./cpk";

export type Pes2017FaceCpkVerification = {
  inspection: CpkInspection;
  faceXmlPath: string;
  faceModelPath: string;
  faceMaterialPath: string;
};

/** Verify the minimum linked assets required for a PES 2017 face package. */
export function verifyPes2017FaceCpk(bytes: Buffer): Pes2017FaceCpkVerification {
  const inspection = inspectCpk(bytes);
  if (!inspection.valid || inspection.fileCount === 0) {
    throw new Error("Independent CPK read-back failed: " + inspection.errors.join("; "));
  }
  const findBasename = (name: string) =>
    inspection.files.find(entry => entry.path.toLowerCase().split("/").at(-1) === name);
  const faceXml = findBasename("face.xml");
  if (!faceXml) throw new Error("PES 2017 face CPK has no generated face.xml.");
  const faceModel = findBasename("oral_face_high_win32.model");
  if (!faceModel) throw new Error("PES 2017 face CPK has no converted face_high model.");
  const faceMaterial = findBasename("face_high.mtl");
  if (!faceMaterial) throw new Error("PES 2017 face CPK has no face_high material set.");
  return {
    inspection,
    faceXmlPath: faceXml.path,
    faceModelPath: faceModel.path,
    faceMaterialPath: faceMaterial.path,
  };
}
