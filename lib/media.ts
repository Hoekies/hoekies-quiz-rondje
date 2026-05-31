import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

// Comprimeer een afbeelding: schaal naar maxSize (langste zijde) en encode als JPEG.
export async function compressImage(file: File | Blob, maxSize: number, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
    };
    img.src = url;
  });
}

// Upload een blob/bestand naar Firebase Storage en geef de download-URL terug.
export async function uploadMedia(path: string, data: Blob | File, contentType: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, data, { contentType });
  return getDownloadURL(storageRef);
}

// Unieke padnaam binnen media/ op basis van quiz + tijd.
export function mediaPath(folder: "img" | "audio" | "video", quizId: string, ext: string): string {
  return `media/${folder}/${quizId}_${Date.now()}.${ext}`;
}
