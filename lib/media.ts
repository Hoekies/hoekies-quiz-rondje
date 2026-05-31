// Cloudinary upload (gratis tier, geen Firebase Storage/Blaze nodig).
const CLOUD_NAME = "dav2heqew";
const UPLOAD_PRESET = "Hoekies";

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

// Upload een blob/bestand naar Cloudinary, geef de secure_url terug.
// kind: "image" voor foto's, "video" voor video én audio (Cloudinary behandelt audio als video-resource).
export async function uploadMedia(data: Blob | File, kind: "image" | "video" = "image"): Promise<string> {
  const fd = new FormData();
  fd.append("file", data);
  fd.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${kind}/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload mislukt (${res.status}) ${txt.slice(0, 120)}`);
  }
  const json = await res.json();
  return json.secure_url as string;
}
