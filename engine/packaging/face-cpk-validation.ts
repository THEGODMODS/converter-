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
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function localReference(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || (part === "." && !normalized.startsWith("./")))
  ) {
    throw new Error("face.xml contains an unsafe package reference: " + value);
  }
  if (!normalized.startsWith("./")) {
    // Team Compiler writes Common-output and game-shared references without ./.
    // Those are not stored inside the player's nested face CPK.
    return null;
  }
  const relative = normalized.slice(2);
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("face.xml contains an unsafe local package reference: " + value);
  }
  return relative.toLowerCase();
}

function verifyFaceXmlReferences(
  xmlBytes: Buffer,
  files: CpkInspection["files"],
  faceXmlPath: string,
) {
  const xml = xmlBytes.toString("utf8");
  if (
    xml.includes("\u0000") ||
    !/^\s*<\?xml\b[\s\S]*?\?>/i.test(xml) ||
    !/<config(?:\s|>)/i.test(xml) ||
    !/<\/config\s*>\s*$/.test(xml)
  ) {
    throw new Error("face.xml is not a complete UTF-8 config document.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("face.xml DTD and entity declarations are not accepted.");
  }

  const archivePaths = files.map((file) => file.path.replaceAll("\\", "/").toLowerCase());
  const xmlDirectory = faceXmlPath.replaceAll("\\", "/").split("/").slice(0, -1).join("/").toLowerCase();
  const resolve = (raw: string, kind: string): string[] => {
    const relative = localReference(raw);
    if (relative === null) return [];
    if (/[?#[\]{}]/.test(relative)) {
      throw new Error("face.xml contains an unsupported " + kind + " reference: " + raw);
    }
    const target = (xmlDirectory ? xmlDirectory + "/" : "") + relative;
    const escaped = target.replace(/[.+^$()|\\]/g, "\\$&").replaceAll("*", ".*");
    const matcher = new RegExp("^" + escaped + "$", "i");
    const matches = archivePaths.filter((archivePath) => matcher.test(archivePath));
    if (!matches.length) {
      throw new Error("face.xml " + kind + " reference does not resolve inside the nested face CPK: " + raw);
    }
    return matches;
  };

  const modelTags = [...xml.matchAll(/<model\b([^>]*)\/?\s*>/gi)];
  if (!modelTags.length) throw new Error("face.xml contains no model entries.");

  const models: string[] = [];
  const materials: string[] = [];
  for (const tag of modelTags) {
    const attributes = new Map<string, string>();
    for (const match of tag[1].matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs)) {
      const key = match[1].toLowerCase();
      if (attributes.has(key)) throw new Error("face.xml model entry repeats attribute " + key + ".");
      attributes.set(key, decodeXmlAttribute(match[3]));
    }
    const model = attributes.get("path");
    const material = attributes.get("material");
    if (!model || !material) {
      throw new Error("Every face.xml model entry must declare both path and material.");
    }
    models.push(...resolve(model, "model"));
    materials.push(...resolve(material, "material"));
  }

  const unique = (values: string[]) => [...new Set(values)];
  const resolvedModels = unique(models);
  const resolvedMaterials = unique(materials);
  const head = resolvedModels.find((name) => /(?:^|\/)oral_face_high_win32\.model$/i.test(name));
  const headMaterial = resolvedMaterials.find((name) => /(?:^|\/)face_high\.mtl$/i.test(name));
  if (!head) {
    throw new Error("face.xml does not resolve its face_high head model to oral_face_high_win32.model.");
  }
  if (!headMaterial) {
    throw new Error("face.xml does not resolve the head material to face_high.mtl.");
  }
  return { models: resolvedModels, materials: resolvedMaterials, head, headMaterial };
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
  const candidates = outerInspection.files.filter(
    (entry) => entry.path.toLowerCase().split("/").at(-1) === expectedFaceCpk.toLowerCase(),
  );
  if (!candidates.length) {
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

    const faceXml = faceInspection.files.find(
      (entry) => entry.path.toLowerCase().split("/").at(-1) === "face.xml",
    );
    if (!faceXml) {
      failures.push(candidate.path + ": missing face.xml");
      continue;
    }

    try {
      const xmlBytes = nestedBytes.subarray(faceXml.offset, faceXml.offset + faceXml.size);
      const references = verifyFaceXmlReferences(xmlBytes, faceInspection.files, faceXml.path);
      return {
        outerInspection,
        faceCpkPath: candidate.path,
        faceInspection,
        faceXmlPath: faceXml.path,
        faceModelPath: references.head,
        faceMaterialPath: references.headMaterial,
        referencedModels: references.models,
        referencedMaterials: references.materials,
      };
    } catch (error) {
      failures.push(candidate.path + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }

  throw new Error("No nested CPK passed PES 2017 face validation. " + failures.join(" | "));
}
