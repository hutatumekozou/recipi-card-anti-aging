const state = {
  frames: [],
  selectedFrameId: null,
  assignments: [],
};

const els = {
  tabButtons: document.querySelectorAll(".tab-button"),
  builderTab: document.querySelector("#builderTab"),
  cardsTab: document.querySelector("#cardsTab"),
  videoInput: document.querySelector("#videoInput"),
  extractFrames: document.querySelector("#extractFrames"),
  intervalInput: document.querySelector("#intervalInput"),
  frameGrid: document.querySelector("#frameGrid"),
  frameStatus: document.querySelector("#frameStatus"),
  stepAssignments: document.querySelector("#stepAssignments"),
  videoProbe: document.querySelector("#videoProbe"),
  scratchCanvas: document.querySelector("#scratchCanvas"),
  recipeCanvas: document.querySelector("#recipeCanvas"),
  previewCanvasWrap: document.querySelector("#previewCanvasWrap"),
  dropOverlay: document.querySelector("#dropOverlay"),
  descriptionInput: document.querySelector("#descriptionInput"),
  resetBuilder: document.querySelector("#resetBuilder"),
  refreshPreview: document.querySelector("#refreshPreview"),
  downloadPng: document.querySelector("#downloadPng"),
  downloadJpg: document.querySelector("#downloadJpg"),
  cardTitleInput: document.querySelector("#cardTitleInput"),
  cardImageInput: document.querySelector("#cardImageInput"),
  saveCardImage: document.querySelector("#saveCardImage"),
  cardGallery: document.querySelector("#cardGallery"),
  cardGalleryStatus: document.querySelector("#cardGalleryStatus"),
};

const ctx = els.recipeCanvas.getContext("2d");
const MAX_VISIBLE_STEPS = 10;
const CARD_DB_NAME = "recipe-card-maker";
const CARD_STORE_NAME = "completed-cards";

function getStepLayout() {
  const gridTop = 500;
  const cardW = 542;
  const cardH = 360;
  const gap = 18;
  const positions = Array.from({ length: MAX_VISIBLE_STEPS }, (_, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    return [36 + col * (cardW + gap), gridTop + row * (cardH + gap)];
  });

  return {
    gridTop,
    cardW,
    cardH,
    gap,
    positions,
    bottom: gridTop + Math.ceil(MAX_VISIBLE_STEPS / 2) * cardH + (Math.ceil(MAX_VISIBLE_STEPS / 2) - 1) * gap,
  };
}

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getRecipe() {
  return parseDescription(els.descriptionInput.value);
}

function parseDescription(value) {
  const rawLines = lines(value).filter((line) => line !== "概要欄");
  const ingredients = [];
  const steps = [];
  const nutrition = [];
  let expiry = "";
  let section = "intro";
  const intro = [];
  const nutritionLabels = /^(エネルギー|たんぱく質|タンパク質|蛋白質|脂質|糖質|炭水化物|食物繊維|塩分|食塩相当量|カロリー)/;

  rawLines.forEach((line) => {
    if (/^【?材料】?$/.test(line)) {
      section = "ingredients";
      return;
    }
    if (/^【?(作り方|手順|レシピ工程)】?$/.test(line)) {
      section = "steps";
      return;
    }
    if (/^賞味期限|^日持ち|^保存/.test(line)) {
      expiry = line.replace(/^(賞味期限|日持ち|保存)\s*/, "").trim() || line;
      section = "after";
      return;
    }
    if (nutritionLabels.test(line)) {
      nutrition.push(line);
      section = "nutrition";
      return;
    }

    if (section === "ingredients") {
      ingredients.push(normalizeDots(line));
      return;
    }
    if (section === "steps") {
      steps.push(line.replace(/^[0-9０-９]+[.)．、\s]*/, "").trim());
      return;
    }
    if (section === "nutrition") {
      nutrition.push(line);
      return;
    }
    if (section === "intro") {
      intro.push(line);
    }
  });

  const firstIngredient = ingredients[0]?.split(/\s+/)[0] ?? "料理";
  const title = intro.find((line) => !/^概要欄$/.test(line)) || `${firstIngredient}レシピ`;

  return {
    title,
    subtitle: "材料と手順がひと目でわかるレシピ",
    ingredients,
    steps,
    nutrition,
    expiry: expiry || "冷蔵2日",
  };
}

function normalizeDots(line) {
  return line.replace(/[・･]{2,}|[.．。]{2,}|…+/g, " ");
}

function waitForVideoEvent(video, eventName) {
  return new Promise((resolve, reject) => {
    const onEvent = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error("動画を読み込めませんでした")));
    const cleanup = (done) => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
      done();
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(video, time) {
  video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.1, 0));
  await waitForVideoEvent(video, "seeked");
}

async function extractFrames() {
  const file = els.videoInput.files?.[0];
  if (!file) {
    els.frameStatus.textContent = "先に動画を選択してください";
    return;
  }

  state.frames = [];
  state.selectedFrameId = null;
  renderFrames();
  renderAssignments();

  const videoUrl = URL.createObjectURL(file);
  const video = els.videoProbe;
  video.src = videoUrl;
  video.load();
  els.frameStatus.textContent = "動画を読み込み中...";

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const interval = Math.max(1, Number(els.intervalInput.value) || 4);
    const duration = Math.min(video.duration || 0, 180);
    const times = [];

    for (let t = 0; t < duration; t += interval) {
      times.push(t);
    }
    if (duration > 1 && times[times.length - 1] !== duration - 0.5) {
      times.push(Math.max(duration - 0.5, 0));
    }

    const scratch = els.scratchCanvas;
    const scratchCtx = scratch.getContext("2d");
    const maxWidth = 960;
    const ratio = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    scratch.width = Math.round(video.videoWidth * ratio);
    scratch.height = Math.round(video.videoHeight * ratio);

    for (let i = 0; i < times.length; i += 1) {
      els.frameStatus.textContent = `${i + 1} / ${times.length} 枚を抽出中...`;
      await seekVideo(video, times[i]);
      scratchCtx.drawImage(video, 0, 0, scratch.width, scratch.height);
      state.frames.push({
        id: crypto.randomUUID(),
        time: times[i],
        dataUrl: scratch.toDataURL("image/jpeg", 0.86),
      });
      renderFrames();
    }

    state.selectedFrameId = state.frames[0]?.id ?? null;
    autoAssignFrames();
    els.frameStatus.textContent = `${state.frames.length} 枚の候補画像`;
  } catch (error) {
    els.frameStatus.textContent = error.message;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

function autoAssignFrames() {
  const steps = getRecipe().steps;
  const lastIndex = Math.max(state.frames.length - 1, 0);
  state.assignments = steps.map((_, index) => {
    const frameIndex =
      steps.length <= 1 ? 0 : Math.round((index / Math.max(steps.length - 1, 1)) * lastIndex);
    return state.frames[frameIndex]?.id ?? "";
  });
  renderFrames();
  renderAssignments();
  drawRecipe();
}

function renderFrames() {
  els.frameGrid.innerHTML = "";
  if (!state.frames.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "抽出した候補画像がここに並びます。";
    els.frameGrid.append(empty);
    return;
  }

  state.frames.forEach((frame, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `frame-card${state.selectedFrameId === frame.id ? " selected" : ""}`;
    card.draggable = true;
    card.innerHTML = `<img alt="候補画像 ${index + 1}" src="${frame.dataUrl}"><span>${formatTime(frame.time)}</span>`;
    card.addEventListener("click", () => {
      state.selectedFrameId = frame.id;
      renderFrames();
    });
    card.addEventListener("dragstart", (event) => {
      state.selectedFrameId = frame.id;
      card.classList.add("dragging");
      els.previewCanvasWrap.classList.add("drag-active");
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", frame.id);
      renderDropZones();
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      els.previewCanvasWrap.classList.remove("drag-active");
      clearDropZoneHover();
    });
    els.frameGrid.append(card);
  });
}

function renderAssignments() {
  const steps = getRecipe().steps;
  if (state.assignments.length !== steps.length) {
    state.assignments = steps.map((_, index) => state.assignments[index] ?? "");
  }

  els.stepAssignments.innerHTML = "";
  if (!steps.length) {
    const empty = document.createElement("p");
    empty.textContent = "工程テキストを入力すると割り当て欄が出ます。";
    els.stepAssignments.append(empty);
    return;
  }

  steps.forEach((step, index) => {
    const frame = findFrame(state.assignments[index]);
    const row = document.createElement("div");
    row.className = "assignment";

    const image = document.createElement("img");
    image.alt = `工程 ${index + 1}`;
    image.src = frame?.dataUrl ?? placeholderDataUrl(index + 1);

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${step}`;

    const select = document.createElement("select");
    select.innerHTML = `<option value="">画像なし</option>${state.frames
      .map(
        (item, frameIndex) =>
          `<option value="${item.id}" ${item.id === state.assignments[index] ? "selected" : ""}>候補 ${frameIndex + 1}（${formatTime(item.time)}）</option>`,
      )
      .join("")}`;
    select.addEventListener("change", () => {
      state.assignments[index] = select.value;
      renderAssignments();
      drawRecipe();
    });

    const useSelected = document.createElement("button");
    useSelected.type = "button";
    useSelected.textContent = "選択中の候補を使う";
    useSelected.addEventListener("click", () => {
      state.assignments[index] = state.selectedFrameId ?? "";
      renderAssignments();
      drawRecipe();
    });

    body.append(title, select, useSelected);
    row.append(image, body);
    els.stepAssignments.append(row);
  });
}

function findFrame(id) {
  return state.frames.find((frame) => frame.id === id);
}

function formatTime(seconds) {
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function placeholderDataUrl(number) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const localCtx = canvas.getContext("2d");
  localCtx.fillStyle = "#eadfce";
  localCtx.fillRect(0, 0, canvas.width, canvas.height);
  localCtx.fillStyle = "#3f8d37";
  localCtx.beginPath();
  localCtx.arc(160, 90, 38, 0, Math.PI * 2);
  localCtx.fill();
  localCtx.fillStyle = "#fff";
  localCtx.font = "700 42px system-ui";
  localCtx.textAlign = "center";
  localCtx.textBaseline = "middle";
  localCtx.fillText(number, 160, 92);
  return canvas.toDataURL("image/png");
}

function drawRecipe() {
  const canvas = els.recipeCanvas;
  const width = canvas.width;
  const height = canvas.height;
  const recipe = getRecipe();
  const steps = recipe.steps.slice(0, MAX_VISIBLE_STEPS);
  const ingredients = recipe.ingredients;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fffdf7";
  roundRect(ctx, 0, 0, width, height, 28, true, false);
  drawDecor();

  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "center";
  drawFitText(recipe.title, width / 2, 88, 64, 900, "900");

  ctx.fillStyle = "#e86d1f";
  drawFitText(recipe.subtitle, width / 2, 156, 32, 760, "800");
  drawRibbon(270, 186, 660, 52, recipe.subtitle);

  drawInfoBox(36, 270, 680, 210, "材料", ingredients);
  drawSmallInfo(748, 270, 416, 210);

  const { cardW, cardH, positions, bottom } = getStepLayout();

  steps.slice(0, MAX_VISIBLE_STEPS).forEach((step, index) => {
    const [x, y] = positions[index];
    drawStepCard(x, y, cardW, cardH, index + 1, step, state.assignments[index]);
  });

  const summaryY = bottom + 38;
  drawFinishCard(36, summaryY, 496, 330, state.assignments[10] || state.assignments[steps.length - 1]);
  drawTextPanel(568, summaryY, 290, 330, "栄養", recipe.nutrition.join("\n"));
  drawTextPanel(892, summaryY, 272, 330, "日持ち", recipe.expiry);
  drawFooter(recipe);
  renderDropZones();
}

function getPreviewDropZones() {
  const recipe = getRecipe();
  const steps = recipe.steps.slice(0, MAX_VISIBLE_STEPS);
  const { cardW, cardH, positions, bottom } = getStepLayout();

  const zones = steps.map((step, index) => ({
    assignmentIndex: index,
    label: `工程 ${index + 1}`,
    x: positions[index][0],
    y: positions[index][1],
    w: cardW,
    h: cardH,
  }));

  if (recipe.steps.length) {
    zones.push({
      assignmentIndex:
        recipe.steps.length > MAX_VISIBLE_STEPS ? MAX_VISIBLE_STEPS : Math.max(recipe.steps.length - 1, 0),
      label: "できあがり",
      x: 36,
      y: bottom + 38,
      w: 496,
      h: 330,
    });
  }

  return zones;
}

function renderDropZones() {
  const canvasRect = els.recipeCanvas.getBoundingClientRect();
  const scaleX = canvasRect.width / els.recipeCanvas.width;
  const scaleY = canvasRect.height / els.recipeCanvas.height;
  els.dropOverlay.innerHTML = "";

  getPreviewDropZones().forEach((zone) => {
    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone";
    dropZone.title = `${zone.label}に割り当て`;
    dropZone.style.left = `${zone.x * scaleX}px`;
    dropZone.style.top = `${zone.y * scaleY}px`;
    dropZone.style.width = `${zone.w * scaleX}px`;
    dropZone.style.height = `${zone.h * scaleY}px`;
    dropZone.dataset.assignmentIndex = String(zone.assignmentIndex);

    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      clearDropZoneHover();
      dropZone.classList.add("over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("over");
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      const frameId = event.dataTransfer.getData("text/plain");
      assignFrameToPreviewZone(frameId, Number(dropZone.dataset.assignmentIndex));
      els.previewCanvasWrap.classList.remove("drag-active");
      clearDropZoneHover();
    });

    els.dropOverlay.append(dropZone);
  });
}

function clearDropZoneHover() {
  els.dropOverlay.querySelectorAll(".drop-zone.over").forEach((zone) => {
    zone.classList.remove("over");
  });
}

function assignFrameToPreviewZone(frameId, assignmentIndex) {
  if (!findFrame(frameId) || Number.isNaN(assignmentIndex)) return;
  const recipe = getRecipe();
  if (state.assignments.length !== recipe.steps.length) {
    state.assignments = recipe.steps.map((_, index) => state.assignments[index] ?? "");
  }
  state.assignments[assignmentIndex] = frameId;
  state.selectedFrameId = frameId;
  renderFrames();
  renderAssignments();
  drawRecipe();
}

function drawDecor() {
  ctx.strokeStyle = "#d8922c";
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, 1184, 2904, 24, false, true);

  ctx.fillStyle = "#3f8d37";
  ctx.font = "700 26px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("RECIPE", 58, 74);

  ctx.strokeStyle = "#74a95d";
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(994 + i * 28, 78 + i * 7, 16, 0.2, 5.6);
    ctx.stroke();
  }
}

function drawRibbon(x, y, w, h, text) {
  ctx.fillStyle = "#f5c84b";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - 28, y + h / 2);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + 28, y + h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "center";
  ctx.font = "800 28px system-ui";
  ctx.fillText(text, x + w / 2, y + 36);
}

function drawInfoBox(x, y, w, h, title, items) {
  ctx.strokeStyle = "#3f8d37";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18, false, true);
  drawPill(x + 22, y - 18, 136, 40, title);

  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "left";
  const fontSize = items.length > 6 ? 22 : 26;
  const lineHeight = items.length > 6 ? 23 : 32;
  ctx.font = `700 ${fontSize}px system-ui`;
  items.slice(0, 8).forEach((item, index) => {
    ctx.fillText(`・ ${item}`, x + 38, y + 48 + index * lineHeight);
  });
}

function drawSmallInfo(x, y, w, h) {
  ctx.strokeStyle = "#3f8d37";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18, false, true);
  drawPill(x + 22, y - 18, 220, 40, "レシピ情報");
  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "left";
  ctx.font = "700 30px system-ui";
  ctx.fillText("概要欄から自動整形", x + 36, y + 70);
  ctx.fillText("工程画像を選択", x + 36, y + 118);
  ctx.strokeStyle = "#dba13c";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(x + 34, y + 146);
  ctx.lineTo(x + w - 34, y + 146);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "700 24px system-ui";
  ctx.fillText("動画から工程画像を抽出", x + 36, y + 184);
}

function drawStepCard(x, y, w, h, number, title, frameId) {
  ctx.strokeStyle = "#e29a37";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18, false, true);
  drawNumber(number, x + 52, y + 52);
  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "left";
  drawFitText(title, x + 100, y + 58, 28, w - 124, "900", "left");

  const imageX = x + 24;
  const imageY = y + 104;
  const imageW = w - 48;
  const imageH = h - 132;
  drawFrameImage(findFrame(frameId), imageX, imageY, imageW, imageH, number);
}

function drawFinishCard(x, y, w, h, frameId) {
  ctx.strokeStyle = "#e29a37";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18, false, true);
  ctx.fillStyle = "#e86d1f";
  roundRect(ctx, x + 32, y + 18, w - 64, 46, 18, true, false);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "900 28px system-ui";
  ctx.fillText("できあがりイメージ", x + w / 2, y + 50);
  drawFrameImage(findFrame(frameId), x + 24, y + 84, w - 48, h - 108, 5);
}

function drawTextPanel(x, y, w, h, title, text) {
  ctx.strokeStyle = "#3f8d37";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18, false, true);
  drawPill(x + 42, y - 18, w - 84, 40, title);
  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "left";
  wrapText(text, x + 34, y + 70, w - 68, 34, 26, "700");
}

function drawFooter(recipe) {
  ctx.fillStyle = "#dfeecb";
  roundRect(ctx, 24, 2838, 1152, 54, 18, true, false);
  ctx.fillStyle = "#2b2118";
  ctx.textAlign = "left";
  ctx.font = "700 24px system-ui";
  const footerText = `${recipe.ingredients.length}材料 / ${recipe.steps.length}工程 / ${recipe.expiry}`;
  ctx.fillText(footerText.slice(0, 54), 70, 2874);
  ctx.fillStyle = "#e86d1f";
  ctx.fillText("♥", 1124, 2874);
}

function drawPill(x, y, w, h, text) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y);
  gradient.addColorStop(0, "#56a948");
  gradient.addColorStop(1, "#2f7f2f");
  ctx.fillStyle = gradient;
  roundRect(ctx, x, y, w, h, 18, true, false);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "900 24px system-ui";
  ctx.fillText(text, x + w / 2, y + 28);
}

function drawNumber(number, x, y) {
  ctx.fillStyle = "#3f8d37";
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 44px system-ui";
  ctx.fillText(number, x, y + 2);
  ctx.textBaseline = "alphabetic";
}

function drawFrameImage(frame, x, y, w, h, number) {
  const img = new Image();
  img.onload = () => {
    ctx.save();
    roundRect(ctx, x, y, w, h, 12, false, false);
    ctx.clip();
    containImage(ctx, img, x, y, w, h);
    ctx.restore();
  };
  img.src = frame?.dataUrl ?? placeholderDataUrl(number);
}

function containImage(localCtx, img, x, y, w, h) {
  localCtx.fillStyle = "#f1eadf";
  localCtx.fillRect(x, y, w, h);

  const scale = Math.min(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  localCtx.drawImage(img, drawX, drawY, drawW, drawH);
}

function drawFitText(text, x, y, maxSize, maxWidth, weight = "700", align = "center") {
  let size = maxSize;
  ctx.textAlign = align;
  do {
    ctx.font = `${weight} ${size}px system-ui`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 18);
  ctx.fillText(text, x, y);
}

function wrapText(text, x, y, maxWidth, lineHeight, size, weight = "700") {
  ctx.font = `${weight} ${size}px system-ui`;
  const sourceLines = text.split("\n");
  let lineY = y;

  sourceLines.forEach((sourceLine) => {
    let line = "";
    for (const char of sourceLine) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = char;
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, lineY);
      lineY += lineHeight;
    }
  });
}

function roundRect(localCtx, x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  localCtx.beginPath();
  localCtx.moveTo(x + radius, y);
  localCtx.arcTo(x + w, y, x + w, y + h, radius);
  localCtx.arcTo(x + w, y + h, x, y + h, radius);
  localCtx.arcTo(x, y + h, x, y, radius);
  localCtx.arcTo(x, y, x + w, y, radius);
  localCtx.closePath();
  if (fill) localCtx.fill();
  if (stroke) localCtx.stroke();
}

function downloadImage(type) {
  drawRecipe();
  setTimeout(() => {
    const link = document.createElement("a");
    const ext = type === "image/jpeg" ? "jpg" : "png";
    link.download = `recipe-sheet.${ext}`;
    link.href = els.recipeCanvas.toDataURL(type, 0.92);
    link.click();
  }, 150);
}

function resetBuilderInputs() {
  if (!confirm("レシピ作成画面の入力内容と候補画像をリセットしますか？")) return;

  state.frames = [];
  state.selectedFrameId = null;
  state.assignments = [];
  els.videoInput.value = "";
  els.intervalInput.value = "4";
  els.descriptionInput.value = "";
  els.videoProbe.removeAttribute("src");
  els.videoProbe.load();
  els.frameStatus.textContent = "動画を選択してください";
  els.dropOverlay.innerHTML = "";
  els.previewCanvasWrap.classList.remove("drag-active");
  renderFrames();
  renderAssignments();
  drawRecipe();
}

function switchTab(tabName) {
  const isCards = tabName === "cards";
  els.builderTab.hidden = isCards;
  els.cardsTab.hidden = !isCards;
  els.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  if (isCards) {
    loadSavedCards();
  } else {
    renderDropZones();
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("画像を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function openCardDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CARD_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CARD_STORE_NAME)) {
        db.createObjectStore(CARD_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("完成カード保存用DBを開けませんでした"));
  });
}

async function withCardStore(mode, callback) {
  const db = await openCardDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CARD_STORE_NAME, mode);
    const store = transaction.objectStore(CARD_STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("完成カードの保存処理に失敗しました"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(new Error("完成カードの保存処理に失敗しました"));
    };
  });
}

function addCardRecord(card) {
  return withCardStore("readwrite", (store) => store.add(card));
}

function getCardRecords() {
  return withCardStore("readonly", (store) => store.getAll());
}

function deleteCardRecord(cardId) {
  return withCardStore("readwrite", (store) => store.delete(cardId));
}

async function saveCompletedCard() {
  const file = els.cardImageInput.files?.[0];
  if (!file) {
    els.cardGalleryStatus.textContent = "先に完成カード画像を選択してください";
    return;
  }

  const originalLabel = els.saveCardImage.textContent;
  els.saveCardImage.disabled = true;
  els.saveCardImage.textContent = "保存中...";

  try {
    const image = await readFileAsDataUrl(file);
    const title = els.cardTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, "");
    await addCardRecord({
      id: crypto.randomUUID(),
      title,
      image,
      createdAt: new Date().toISOString(),
    });

    els.cardTitleInput.value = "";
    els.cardImageInput.value = "";
    await loadSavedCards();
  } catch (error) {
    els.cardGalleryStatus.textContent = error.message;
  } finally {
    els.saveCardImage.disabled = false;
    els.saveCardImage.textContent = originalLabel;
  }
}

async function loadSavedCards() {
  try {
    const cards = await getCardRecords();
    renderCardGallery(cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    els.cardGalleryStatus.textContent = error.message;
  }
}

function renderCardGallery(cards) {
  els.cardGallery.innerHTML = "";
  els.cardGalleryStatus.textContent = `${cards.length}枚`;

  if (!cards.length) {
    const empty = document.createElement("p");
    empty.textContent = "ChatGPTで作った完成カード画像を追加すると、ここに保存されます。";
    els.cardGallery.append(empty);
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "saved-card";
    item.innerHTML = `
      <img src="${card.image}" alt="${escapeHtml(card.title)}">
      <div class="saved-card-body">
        <h3>${escapeHtml(card.title)}</h3>
        <div class="saved-card-meta">${new Date(card.createdAt).toLocaleString("ja-JP")}</div>
        <div class="saved-card-actions">
          <a href="${card.image}" download="${escapeFilename(card.title)}">保存</a>
          <button type="button" data-delete-card="${card.id}">削除</button>
        </div>
      </div>
    `;
    els.cardGallery.append(item);
  });
}

async function deleteCompletedCard(cardId) {
  if (!confirm("この完成カードを削除しますか？")) return;
  try {
    await deleteCardRecord(cardId);
    await loadSavedCards();
  } catch (error) {
    els.cardGalleryStatus.textContent = error.message;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

function escapeFilename(value) {
  const safeName = String(value).replace(/[\\/:*?"<>|]/g, "_").trim() || "recipe-card";
  return `${safeName}.png`;
}

els.descriptionInput.addEventListener("input", () => {
  renderAssignments();
  drawRecipe();
});
els.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});
els.extractFrames.addEventListener("click", extractFrames);
els.resetBuilder.addEventListener("click", resetBuilderInputs);
els.refreshPreview.addEventListener("click", drawRecipe);
els.downloadPng.addEventListener("click", () => downloadImage("image/png"));
els.downloadJpg.addEventListener("click", () => downloadImage("image/jpeg"));
els.saveCardImage.addEventListener("click", saveCompletedCard);
els.cardGallery.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-card]");
  if (deleteButton) {
    deleteCompletedCard(deleteButton.dataset.deleteCard);
  }
});
window.addEventListener("resize", renderDropZones);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(renderDropZones);
  resizeObserver.observe(els.recipeCanvas);
}

renderFrames();
renderAssignments();
drawRecipe();
loadSavedCards();
