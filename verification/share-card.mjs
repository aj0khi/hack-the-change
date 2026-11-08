function fitLines(ctx, text, width, maxLines) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && ctx.measureText(line + character).width > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const result = lines.slice(0, maxLines);
    let last = result[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = Array.from(last).slice(0, -1).join("");
    result[result.length - 1] = `${last}…`;
    return result;
  }
  return lines;
}

function drawLines(ctx, text, x, y, width, maxLines, lineHeight) {
  fitLines(ctx, text, width, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

export async function makeShareCard(payload, verificationUrl, qrUrl) {
  const qr = new Image();
  qr.src = qrUrl;
  await qr.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable in this browser.");
  ctx.fillStyle = "#f4eff8";
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(48, 48, 984, 984);
  ctx.strokeStyle = "#ddd3e8";
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, 984, 984);
  ctx.fillStyle = "#655376";
  ctx.font = "700 27px sans-serif";
  ctx.fillText("PROOFLY  /  FICTIONAL DEMO", 100, 120);
  ctx.fillStyle = "#30243e";
  ctx.font = "700 54px sans-serif";
  drawLines(ctx, "A story of skills", 100, 205, 880, 1, 65);
  ctx.fillStyle = "#655376";
  ctx.font = "26px sans-serif";
  ctx.fillText("DEMO CREDENTIAL FOR", 100, 280);
  ctx.fillStyle = "#30243e";
  ctx.font = "700 45px sans-serif";
  drawLines(ctx, payload.student, 100, 340, 880, 2, 55);
  ctx.fillStyle = "#655376";
  ctx.font = "26px sans-serif";
  ctx.fillText("PROJECT", 100, 470);
  ctx.fillStyle = "#30243e";
  ctx.font = "700 38px sans-serif";
  drawLines(ctx, payload.title, 100, 525, 880, 3, 48);
  ctx.fillStyle = "#655376";
  ctx.font = "25px sans-serif";
  drawLines(ctx, `Demo issuer: ${payload.issuer}`, 100, 700, 560, 2, 35);
  drawLines(ctx, `Issued: ${payload.issuedAt}`, 100, 790, 560, 1, 35);
  ctx.drawImage(qr, 738, 692, 220, 220);
  ctx.font = "700 21px sans-serif";
  ctx.fillText("SCAN TO VERIFY", 750, 940);
  ctx.font = "20px sans-serif";
  drawLines(ctx, verificationUrl, 100, 895, 570, 2, 26);
  ctx.font = "21px sans-serif";
  ctx.fillText("Demo only · Not a real award or verified achievement", 100, 985);
  return new Promise((resolve, reject) => canvas.toBlob((blob) =>
    blob ? resolve(blob) : reject(new Error("Could not create the share image.")), "image/png"));
}
