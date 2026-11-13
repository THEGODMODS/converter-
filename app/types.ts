export type FaceFile = { path: string; bytes: number; kind: string; sha256: string };
export type FaceProject = {
  root: string;
  detectedGame: "pes2017" | "pes2021" | "mixed" | "unknown";
  fileCount: number;
  totalBytes: number;
  models: number;
  textures: number;
  files: FaceFile[];
  warnings: string[];
  missing: string[];
};
export type FaceForgeApi = {
  chooseFolder: () => Promise<string | null>;
  inspectFolder: (folder: string) => Promise<FaceProject>;
  getPathForDrop: (file: File) => string;
};
declare global { interface Window { faceForge: FaceForgeApi } }
