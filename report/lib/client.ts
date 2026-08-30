"use client";

// 클라이언트 전용 유틸 — 사진 압축/업로드, 이미지 프록시 경로

// 큰 사진은 브라우저에서 미리 축소(최대 1600px, JPEG 82%)해 업로드 용량을 줄입니다.
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  let { width, height } = bitmap;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality)
  );
}

export async function uploadPhoto(file: File): Promise<string> {
  const blob = await compressImage(file);
  const form = new FormData();
  form.append("file", new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("업로드 실패");
  const data = await res.json();
  return data.url as string;
}

// 외부(Blob) 이미지는 프록시를 거쳐 동일 출처로 만들어 PDF 캡처 시 오염을 방지
export function proxied(url: string): string {
  if (url.startsWith("http")) return `/api/img?url=${encodeURIComponent(url)}`;
  return url;
}

// 아카이브용: 사진은 축소, 동영상은 원본을 Blob으로 "직접" 업로드(서버 함수 크기 제한 우회).
// 반환: { url, type }
export async function uploadToArchive(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string; type: "image" | "video" }> {
  const isVideo = file.type.startsWith("video");
  const payload: Blob = isVideo ? file : await compressImage(file);
  const ext = isVideo ? file.name.split(".").pop() || "mp4" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "") || "media";
  const pathname = `archive/${Date.now()}-${base}.${ext}`;

  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(pathname, payload, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    contentType: isVideo ? file.type : "image/jpeg",
    multipart: isVideo, // 큰 동영상은 분할 업로드로 안정성 확보
    onUploadProgress: onProgress ? (p) => onProgress(Math.round(p.percentage)) : undefined,
  });
  return { url: blob.url, type: isVideo ? "video" : "image" };
}

// 업로드 후 메타데이터 등록
export async function registerMedia(meta: {
  url: string;
  type: "image" | "video";
  category?: string;
  title?: string;
  note?: string;
  area?: string;
  takenAt?: string;
  uploader?: string;
}): Promise<void> {
  const res = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error("메타 등록 실패");
}
