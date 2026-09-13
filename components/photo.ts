/**
 * Shrink a photo from the phone's gallery into a small JPEG data URL —
 * a 5 MB camera shot becomes ~100–300 KB, so it uploads on a weak signal
 * and fits in the offline queue. Keeps the camera's orientation.
 */
export async function shrinkPhoto(file: File, maxSide = 1100): Promise<string> {
  let src: ImageBitmap | HTMLImageElement;
  let revoke = "";
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    revoke = URL.createObjectURL(file);
    const img = new Image();
    img.src = revoke;
    await img.decode();
    src = img;
  }
  try {
    for (const [max, quality] of [
      [maxSide, 0.74],
      [Math.round(maxSide * 0.82), 0.66],
      [Math.round(maxSide * 0.66), 0.58],
    ]) {
      const scale = Math.min(1, max / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d")!.drawImage(src, 0, 0, w, h);
      const data = cv.toDataURL("image/jpeg", quality);
      if (data.length <= 450_000) return data;
    }
    throw new Error("too-large");
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
    if ("close" in src) src.close();
  }
}
