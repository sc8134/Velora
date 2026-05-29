export interface DownloadOption {
  type: "video" | "audio";
  label: string;
  quality: string;
  ext: string;
}

export interface PlaylistEntry {
  title: string;
  url: string;
}

export interface Profile {
  id: string;
  label: string;
}

export interface VideoInfo {
  url: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  video_options: DownloadOption[];
  audio_options: DownloadOption[];
  is_playlist?: boolean;
  playlist_count?: number;
  playlist_entries?: PlaylistEntry[];
  profiles?: Profile[];
}

export interface Job {
  id: string;
  status: "pending" | "running" | "retrying" | "done" | "error";
  progress: number;
  message: string;
  filename: string | null;
  error: string | null;
}
