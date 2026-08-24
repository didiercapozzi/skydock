import * as fs from "node:fs";
import * as path from "node:path";
import type { FileEntry, Jump, DayGroup } from "./types";

const getOutputDir = (): string => {
  if (process.env.SKYDOCK_OUTPUT_DIR) {
    return process.env.SKYDOCK_OUTPUT_DIR;
  }
  const workspace = process.env.SKYDOCK_WORKSPACE ?? process.cwd();
  return path.join(workspace, ".sim", "output");
};

const isTheoryFile = (name: string): boolean => /theory/i.test(name);

const scanFiles = (dirPath: string): FileEntry[] => {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => fs.statSync(path.join(dirPath, f)).isFile())
    .map((name) => {
      const stat = fs.statSync(path.join(dirPath, name));
      return {
        name,
        path: path.join(dirPath, name),
        size: stat.size,
        isTheory: isTheoryFile(name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const parseJumpDir = (
  dirName: string,
): { name: string | null; displayName: string } => {
  const match = dirName.match(/^Jump_(\d+)(?:_(.+))?$/);
  if (!match) return { name: null, displayName: dirName };
  const num = match[1];
  const rawName = match[2] ?? null;
  const name = rawName ? rawName.replace(/_/g, " ") : null;
  return { name, displayName: `Jump ${parseInt(num, 10)}` };
};

const buildJump = (
  date: string,
  dirName: string,
  jumpPath: string,
): Jump => {
  const { name, displayName } = parseJumpDir(dirName);
  const allPhotos = scanFiles(path.join(jumpPath, "photos"));
  const allVideos = scanFiles(path.join(jumpPath, "videos"));

  const jumpPhotos = allPhotos.filter((f) => !f.isTheory);
  const jumpVideos = allVideos.filter((f) => !f.isTheory);
  const theoryPhotos = allPhotos.filter((f) => f.isTheory);
  const theoryVideos = allVideos.filter((f) => f.isTheory);

  const totalSize =
    allPhotos.reduce((s, f) => s + f.size, 0) +
    allVideos.reduce((s, f) => s + f.size, 0);

  return {
    id: `${date}/${dirName}`,
    date,
    name,
    displayName,
    photoCount: jumpPhotos.length,
    videoCount: jumpVideos.length,
    theoryPhotoCount: theoryPhotos.length,
    theoryVideoCount: theoryVideos.length,
    jumpPhotos,
    jumpVideos,
    theoryPhotos,
    theoryVideos,
    totalSize,
  };
};

export const scanOutput = (): DayGroup[] => {
  const outputDir = getOutputDir();
  if (!fs.existsSync(outputDir)) return [];

  const dateDirs = fs
    .readdirSync(outputDir)
    .filter((d) => {
      const full = path.join(outputDir, d);
      return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
    })
    .sort()
    .reverse();

  return dateDirs.map((date) => {
    const datePath = path.join(outputDir, date);
    const jumpDirs = fs
      .readdirSync(datePath)
      .filter((d) => {
        const full = path.join(datePath, d);
        return fs.statSync(full).isDirectory() && d.startsWith("Jump_");
      })
      .sort();

    const jumps: Jump[] = jumpDirs.map((dirName) =>
      buildJump(date, dirName, path.join(datePath, dirName)),
    );

    const totalPhotos = jumps.reduce(
      (s, j) => s + j.photoCount + j.theoryPhotoCount,
      0,
    );
    const totalVideos = jumps.reduce(
      (s, j) => s + j.videoCount + j.theoryVideoCount,
      0,
    );

    return { date, jumps, totalPhotos, totalVideos };
  });
};

export const getJump = (date: string, jumpDir: string): Jump | null => {
  const outputDir = getOutputDir();
  const jumpPath = path.join(outputDir, date, jumpDir);
  if (!fs.existsSync(jumpPath)) return null;
  return buildJump(date, jumpDir, jumpPath);
};
