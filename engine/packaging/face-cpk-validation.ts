import { inspectCpk, type CpkInspection } from "./cpk";

export type Pes2017FaceCpkVerification = {
  outerInspection: CpkInspection;
  faceCpkPath: string;
  faceInspection: CpkInspection;
  faceXmlPath: string;
  faceModelPath: string;
  faceMaterialPath: string;
  referencedModels: string[];
  referencedMaterials: string[];
};

function decodeXmlAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function localReference(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("./")) return null; // Common/ and other game-shared paths are resolved outside the player CPK.
  const relative = normalized.slice(2);
  if (!relative || relative.startsWith("/") || relative.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("face.xml contains an unsafe local package reference: " + value);
  }
  return relative.toLowerCase();
}

/** Parse the model entries conservatively and prove every player-local path resolves inside this CPK. */
function verifyFaceXmlReferences(xmlBytes: Buffer, files: Array<{path:string;size:number;offset:number}>) {
  const xml = xmlBytes.toString("utf8");
  if (xml.includes("\u0000") || !/^\s*<\?xml\b[\s\S]*?\?>/i.test(xml) || !/<config(?:\s|>)/i.test(xml) || !/<\/config\s*>\s*$/i.test(xml)) {
    throw new Error("face.xml is not a complete UTF-8 config document.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("face.xml DTD and entity declarations are not accepted.");
  const modelTags = [...xml.matchAll(/<model\b([^>]*)\/?\s*>/gi)];
  if (!modelTags.length) throw new Error("face.xml contains no model entries.");
  const archivePaths = files.map(file => file.path.replaceAll("\\", "/").toLowerCase());
  const resolve = (raw: string, kind: string): string[] => {
    const ref = localReference(raw);
    if (ref === null) return []; // Shared Common references are not stored in the player CPK.
    if (/[?#[\]{}]/.test(ref)) throw new Error("face.xml contains an unsupported " + kind + " reference: " + raw);
    const escaped = ref.replace(/[.+^$()|\\]/g, "\\$&").replaceAll("*", ".*");
    const matcher = new RegExp("^" + escaped + "$", "i");
    const matches = archivePaths.filter(path => matcher.test(path));
    if (!matches.length) throw new Error("face.xml " + kind + " reference does not resolve inside the nested face CPK: " + raw);
    return matches;
  };
  const models: string[] = [], materials: string[] = [];
  for (const tag of modelTags) {
    const attrs = new Map<string,string>();
    for (const match of tag[1].matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs)) {
      const key = match[1].toLowerCase();
      if (attrs.has(key)) throw new Error("face.xml model entry repeats attribute " + key + ".");
      attrs.set(key, decodeXmlAttribute(match[3]));
    }
    const model = attrs.get("path"), material = attrs.get("material");
    if (!model || !material) throw new Error("Every face.xml model entry must declare both path and material.");
    models.push(...resolve(model, "model"));
    materials.push(...resolve(material, "material"));
  }
  const unique = (values: string[]) => [...new Set(values)];
  const head = unique(models).find(name => /(?:^|\/)oral_face_high_win32\.model$/i.test(name));
  const headMaterial = unique(materials).find(name => /(?:^|\/)face_high\.mtl$/i.test(name));
  if (!head) throw new Error("face.xml does not resolve its face_high head model to oral_face_high_win32.model.");
  if (!headMaterial) throw new Error("face.xml does not resolve the head material to face_high.mtl.");
  return { models: unique(models), materials: unique(materials), head, headMaterial };
}

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
    if (!faceXml) {
      failures.push(candidate.path + ": missing face.xml");
      continue;
    }
    try {
      const xmlBytes = nestedBytes.subarray(faceXml.offset, faceXml.offset + faceXml.size);
      const refs = verifyFaceXmlReferences(xmlBytes, faceInspection.files);
      return {outerInspection,faceCpkPath:candidate.path,faceInspection,faceXmlPath:faceXml.path,faceModelPath:refs.head,faceMaterialPath:refs.headMaterial,referencedModels:refs.models,referencedMaterials:refs.materials};
    } catch (error) {
      failures.push(candidate.path + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw new Error("No nested CPK passed PES 2017 face validation. " + failures.join(" | "));
}
