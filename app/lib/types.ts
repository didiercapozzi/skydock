export type FileEntry = {
  name: string;
  path: string;
  size: number;
  isTheory: boolean;
  mtime: number;
};

export type Jump = {
  id: string;
  date: string;
  name: string | null;
  displayName: string;
  photoCount: number;
  videoCount: number;
  theoryPhotoCount: number;
  theoryVideoCount: number;
  jumpPhotos: FileEntry[];
  jumpVideos: FileEntry[];
  theoryPhotos: FileEntry[];
  theoryVideos: FileEntry[];
  totalSize: number;
  startedAt: number;
};

export type DayGroup = {
  date: string;
  jumps: Jump[];
  totalPhotos: number;
  totalVideos: number;
};

export type TheoryOverrides = Record<string, boolean>;
