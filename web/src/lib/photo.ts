/**
 * Center-crops a photo to a square and shrinks it to a small JPEG.
 * Going through <img> lets Safari decode iPhone HEIC photos and applies EXIF rotation.
 */
export async function squarePhoto(file: File, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("Couldn't read that photo. Try a different one.");
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Couldn't process that photo");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
