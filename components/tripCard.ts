// Small, funny, social-shareable trip card (1080×1350 PNG).
// Pure canvas — no libraries, no network. Shares via the native share
// sheet as an image file; falls back to a PNG download.

type Stop = { name: string; done?: boolean };

const CAPTIONS = [
  "প্যাকিং শেষ, টাকা শেষ 💸",
  "পাহাড় ডাকছে, আমি যাচ্ছি 🏔️",
  "ঘুরতে যাচ্ছি, খুঁজো না 🙈",
  "ব্যাগ রেডি, বন্ধুরা রেডি 🎒",
  "রুটিন বাদ, ট্রিপ চাই 🚗💨",
  "টাকা জমাই ঘুরতে যাই 🤑",
];

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const BN = '"Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif';
const EMO =
  '"Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", system-ui';

export async function shareTripCard(opts: { title: string; places: Stop[] }) {
  const { title, places } = opts;
  const done = places.filter((p) => p.done).length;
  const caption = CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)];

  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  // background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#166534");
  g.addColorStop(0.55, "#15803d");
  g.addColorStop(1, "#22c55e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // decorative blobs
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(910, 190, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(150, 1210, 240, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";

  // brand
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 36px ${BN}`;
  ctx.fillText("⛰  TerraExplore", W / 2, 120);

  // hero emoji — tea garden
  ctx.font = `150px ${EMO}`;
  ctx.fillText("🍃🍵", W / 2, 400);

  // title (shrink to fit)
  ctx.fillStyle = "#ffffff";
  let fs = 104;
  ctx.font = `800 ${fs}px ${BN}`;
  while (ctx.measureText(title).width > W - 150 && fs > 46) {
    fs -= 6;
    ctx.font = `800 ${fs}px ${BN}`;
  }
  ctx.fillText(title, W / 2, 540);

  // subtitle
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `46px ${BN}`;
  ctx.fillText(`${places.length} spots · ${done} explored`, W / 2, 620);

  // funny caption pill
  ctx.font = `700 52px ${BN}`;
  const capW = Math.min(ctx.measureText(caption).width + 100, W - 100);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(ctx, (W - capW) / 2, 700, capW, 110, 55);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(caption, W / 2, 772);

  // up to 3 spots preview
  const preview = places.slice(0, 3);
  ctx.font = `44px ${BN}`;
  let y = 940;
  for (const p of preview) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(`📍 ${p.name}`, W / 2, y);
    y += 82;
  }
  if (places.length > 3) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `38px ${BN}`;
    ctx.fillText(`+ ${places.length - 3} more`, W / 2, y);
  }

  // footer
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `34px ${BN}`;
  ctx.fillText("Plan yours · TerraExplore", W / 2, H - 70);

  const blob = await new Promise<Blob | null>((res) =>
    cv.toBlob(res, "image/png")
  );
  if (!blob) return;

  const file = new File([blob], "my-trip.png", { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: `${title} — ${caption}` });
      return;
    }
  } catch {
    /* user dismissed share sheet — fall through to download */
  }

  // fallback: download the image
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-trip.png";
  a.click();
  URL.revokeObjectURL(url);
}
