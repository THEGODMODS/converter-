import { inspectCpk, type CpkInspection } from "./cpk";
import { inspectDdsHeader, inspectModelHeader } from "../formats/headers";

export type Pes2017FaceCpkVerification = {
  outerInspection: CpkInspection;
  faceCpkPath: string;
  faceInspection: CpkInspection;
  faceXmlPath: string;
  faceModelPath: string;
  faceMaterialPath: string;
  referencedModels: string[];
  referencedMaterials: string[];
  referencedTextures: string[];
};

function decodeXmlAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function localReference(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  // Real PES face assets use package-relative paths and game-virtual paths.
  const rooted = normalized.match(/^\/{0,2}Assets\/pes16\/model\/character\/face\/real\/[0-9]{1,6}\/(.+)$/i);
  const legacyRooted = normalized.match(/^\.\/Asset\/model\/character\/face\/real\/[0-9]{1,6}\/(.+)$/i);
  const relative = rooted?.[1] ?? legacyRooted?.[1] ?? (normalized.startsWith("./") ? normalized.slice(2) : null);
  if (!relative) {
    if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) ||
        normalized.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error("face package contains an unsafe reference: " + value);
    }
    return null; // Common/game-shared paths are outside the player CPK.
  }
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("face package contains an unsafe local reference: " + value);
  }
  return relative.toLowerCase();
}

function escapedRelative(relative: string): string {
  return relative.replace(/[.+^$()|\\\\]/g, "\\\\$&").replaceAll("*", ".*").replaceAll("?", ".");
}

function verifyFaceXmlReferences(
  xmlBytes: Buffer,
  files: CpkInspection["files"],
  faceXmlPath: string,
  archiveBytes: Buffer,
  outerFiles: CpkInspection["files"],
  outerBytes: Buffer,
) {
  const xml = xmlBytes.toString("utf8");
  if (xml.includes("\u0000") || !/^\s*<\?xml\b[\s\S]*?\?>/i.test(xml) ||
      !/<config(?:\s|>)/i.test(xml) || !/<\/config\s*>\s*$/.test(xml)) {
    throw new Error("face.xml is not a complete UTF-8 config document.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("face.xml DTD and entity declarations are not accepted.");

  const archivePaths = files.map((file) => file.path.replaceAll("\\", "/").toLowerCase());
  const xmlDirectory = faceXmlPath.replaceAll("\\", "/").split("/").slice(0, -1).join("/").toLowerCase();
  const resolve = (raw: string, kind: string, baseDirectory = xmlDirectory): string[] => {
    const relative = localReference(raw);
    if (relative === null) return [];
    if (/[#[\]{}]/.test(relative)) throw new Error("Unsupported " + kind + " reference: " + raw);
    const gameRooted = /^\/{0,2}Assets\/pes16\/model\/character\/face\/real\/[0-9]{1,6}\//i.test(raw.trim().replaceAll("\\", "/")) ||
      /^\.\/Asset\/model\/character\/face\/real\/[0-9]{1,6}\//i.test(raw.trim().replaceAll("\\", "/"));
    const directory = gameRooted ? xmlDirectory : baseDirectory;
    const target = (directory ? directory + "/" : "") + relative;
    const escaped = target.replace(/[.+^$()|\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
    const matcher = new RegExp("^" + escaped + "$", "i");
    let matches = archivePaths.filter((archivePath) => matcher.test(archivePath));
    // Some game-virtual Assets paths omit the physical prefix used by the
    // nested CPK. Fall back only to a unique path-suffix match, never basename-only.
    if (!matches.length && gameRooted) {
      const suffix = new RegExp("(?:^|/)" + escapedRelative(relative) + "$", "i");
      matches = archivePaths.filter((archivePath) => suffix.test(archivePath));
      if (matches.length > 1) {
        throw new Error("Ambiguous " + kind + " reference inside the nested face CPK: " + raw);
      }
    }
    if (!matches.length) throw new Error(kind + " reference does not resolve inside the nested face CPK: " + raw);
    return matches;
  };

  const modelTags = [...xml.matchAll(/<model\b([^>]*)\/?\s*>/gi)];
  if (!modelTags.length) throw new Error("face.xml contains no model entries.");
  const models: string[] = [];
  const materials: string[] = [];
  let headMaterialPairFound = false;
  for (const tag of modelTags) {
    const attributes = new Map<string, string>();
    for (const match of tag[1].matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs)) {
      const key = match[1].toLowerCase();
      if (attributes.has(key)) throw new Error("face.xml model entry repeats attribute " + key + ".");
      attributes.set(key, decodeXmlAttribute(match[3]));
    }
    const model = attributes.get("path");
    const material = attributes.get("material");
    if (!model || !material) throw new Error("Every face.xml model entry must declare both path and material.");
    const modelPaths = resolve(model, "model");
    const materialPaths = resolve(material, "material");
    models.push(...modelPaths);
    materials.push(...materialPaths);
    if (
      modelPaths.some((name) => /(?:^|\/)(?:oral_)?face_high_win32\.model$/i.test(name)) &&
      materialPaths.some((name) => /(?:^|\/)(?:face_high|face)\.mtl$/i.test(name))
    ) {
      headMaterialPairFound = true;
    }
  }

  const unique = (values: string[]) => [...new Set(values)];
  const resolvedModels = unique(models);
  const resolvedMaterials = unique(materials);
  for (const modelPath of resolvedModels) {
    const modelEntry = files.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === modelPath);
    if (!modelEntry) throw new Error("Resolved model entry disappeared from the nested face CPK: " + modelPath);
    const modelBytes = archiveBytes.subarray(modelEntry.offset, modelEntry.offset + modelEntry.size);
    const modelInspection = inspectModelHeader(modelBytes);
    if (!modelInspection.valid) throw new Error("Referenced PES 2017 model is invalid: " + modelPath + " (" + modelInspection.details.join("; ") + ")");
  }
  // Both names occur in the pinned Team Compiler's real face fixtures and output conventions.
  const head = resolvedModels.find((name) => /(?:^|\/)(?:oral_)?face_high_win32\.model$/i.test(name));
  const headMaterial = resolvedMaterials.find((name) => /(?:^|\/)(?:face_high|face)\.mtl$/i.test(name));
  if (!head) throw new Error("face.xml does not resolve a face_high_win32.model head mesh.");
  if (!headMaterial) throw new Error("face.xml does not resolve the head material (face.mtl or face_high.mtl).");
  if (!headMaterialPairFound) throw new Error("face.xml does not pair the face_high head mesh with its head material.");

  const textures: string[] = [];
  for (const materialPath of resolvedMaterials) {
    const materialEntry = files.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === materialPath);
    if (!materialEntry) continue;
    const materialXml = archiveBytes.subarray(materialEntry.offset, materialEntry.offset + materialEntry.size).toString("utf8");
    if (!/<materialset(?:\s|>)/i.test(materialXml) || !/<\/materialset\s*>\s*$/i.test(materialXml)) {
      throw new Error("Referenced PES 2017 material set is not a complete materialset document: " + materialPath);
    }
    for (const sampler of materialXml.matchAll(/<sampler\b([^>]*)\/?\s*>/gi)) {
      const attributes = new Map<string, string>();
      for (const match of sampler[1].matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs)) {
        attributes.set(match[1].toLowerCase(), decodeXmlAttribute(match[3]));
      }
      const texturePath = attributes.get("path");
      if (!texturePath) throw new Error("Material sampler is missing its texture path: " + materialPath);
      const materialDirectory = materialEntry.path.replaceAll("\\", "/").split("/").slice(0, -1).join("/").toLowerCase();
      const local = localReference(texturePath);
      if (local !== null) {
        const localTextures = resolve(texturePath, "texture", materialDirectory);
        for (const localPath of localTextures) {
          const localEntry = files.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === localPath);
          if (!localEntry) throw new Error("Resolved local texture disappeared from the nested face CPK: " + localPath);
          const textureBytes = archiveBytes.subarray(localEntry.offset, localEntry.offset + localEntry.size);
          const dds = inspectDdsHeader(textureBytes);
          if (!dds.valid) throw new Error("Local player texture is not a valid DDS: " + localPath + " (" + dds.details.join("; ") + ")");
        }
        textures.push(...localTextures);
        continue;
      }
      // Team Compiler emits player-owned PES 2017 textures into the outer team
      // CPK under common/character1/, while the nested face MTL keeps the game
      // virtual path without that prefix. These are not arbitrary external files.
      const virtualPath = texturePath.trim().replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
      if (virtualPath.startsWith("model/character/uniform/common/")) {
        const outerPath = "common/character1/" + virtualPath;
        const outerEntry = outerFiles.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === outerPath);
        if (!outerEntry) throw new Error("Player texture reference does not resolve in the outer team CPK: " + texturePath);
        const textureBytes = outerBytes.subarray(outerEntry.offset, outerEntry.offset + outerEntry.size);
        const dds = inspectDdsHeader(textureBytes);
        if (!dds.valid) throw new Error("Player texture in the outer team CPK is not a valid DDS: " + texturePath + " (" + dds.details.join("; ") + ")");
        textures.push(outerPath);
      } else if (virtualPath.startsWith("common/character1/")) {
        const outerEntry = outerFiles.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === virtualPath);
        if (!outerEntry) throw new Error("Player texture reference does not resolve in the outer team CPK: " + texturePath);
        const textureBytes = outerBytes.subarray(outerEntry.offset, outerEntry.offset + outerEntry.size);
        const dds = inspectDdsHeader(textureBytes);
        if (!dds.valid) throw new Error("Player texture in the outer team CPK is not a valid DDS: " + texturePath + " (" + dds.details.join("; ") + ")");
        textures.push(virtualPath);
      }
    }
  }
  return { models: resolvedModels, materials: resolvedMaterials, head, headMaterial, textures: unique(textures) };
}

/** Verify the Team Compiler's outer team CPK and requested nested player-face CPK. */
export function verifyPes2017FaceCpk(bytes: Buffer, expectedPlayerId: string): Pes2017FaceCpkVerification {
  if (!/^[0-9]{1,6}$/.test(expectedPlayerId) || /^0+$/.test(expectedPlayerId)) throw new Error("Expected PES 2017 player ID must be a non-zero numeric ID of up to six digits.");
  const outerInspection = inspectCpk(bytes);
  if (!outerInspection.valid || outerInspection.fileCount === 0) {
    throw new Error("Independent outer CPK read-back failed: " + outerInspection.errors.join("; "));
  }

  const expectedFaceDirectory = "common/character0/model/character/face/real/" + expectedPlayerId;
  const expectedFaceCpk = expectedFaceDirectory + ".cpk";
  const candidates = outerInspection.files.filter((entry) =>
    entry.path.replaceAll("\\", "/").toLowerCase() === expectedFaceCpk.toLowerCase()
  );
  if (!candidates.length) throw new Error("PES 2017 team CPK has no nested player-face CPK for target player ID " + expectedPlayerId + ".");

  const failures: string[] = [];
  for (const candidate of candidates) {
    const nestedBytes = bytes.subarray(candidate.offset, candidate.offset + candidate.size);
    const faceInspection = inspectCpk(nestedBytes);
    if (!faceInspection.valid || faceInspection.fileCount === 0) {
      failures.push(candidate.path + ": " + faceInspection.errors.join("; "));
      continue;
    }
    const faceXml = faceInspection.files.find((entry) => entry.path.toLowerCase().split("/").at(-1) === "face.xml");
    if (!faceXml) {
      failures.push(candidate.path + ": missing face.xml");
      continue;
    }
    const faceDirectory = faceXml.path.replaceAll("\\", "/").split("/").slice(0, -1).join("/");
    if (faceDirectory.toLowerCase() !== expectedFaceDirectory.toLowerCase()) {
      failures.push(candidate.path + ": face.xml is stored under internal folder " + (faceDirectory || "<root>") + ", expected " + expectedFaceDirectory);
      continue;
    }
    try {
      const xmlBytes = nestedBytes.subarray(faceXml.offset, faceXml.offset + faceXml.size);
      const references = verifyFaceXmlReferences(xmlBytes, faceInspection.files, faceXml.path, nestedBytes, outerInspection.files, bytes);
      return {
        outerInspection,
        faceCpkPath: candidate.path,
        faceInspection,
        faceXmlPath: faceXml.path,
        faceModelPath: references.head,
        faceMaterialPath: references.headMaterial,
        referencedModels: references.models,
        referencedMaterials: references.materials,
        referencedTextures: references.textures,
      };
    } catch (error) {
      failures.push(candidate.path + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw new Error("No nested CPK passed PES 2017 face validation. " + failures.join(" | "));
}
