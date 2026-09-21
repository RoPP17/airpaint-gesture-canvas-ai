/**
 * AirPaint - Hand Gesture Drawing Application
 * Core Logic (MediaPipe Hands, Vector Drawing, Smoothing, Custom UI)
 */

// DOM Elements
const webcamElement = document.getElementById('webcam');
const uiCanvas = document.getElementById('ui-canvas');
const paintCanvas = document.getElementById('paint-canvas');
const loader = document.getElementById('loader');
const loaderStatus = document.querySelector('.loader-status');

// Sidebar Tool Buttons
const toolPencil = document.getElementById('tool-pencil');
const toolRect = document.getElementById('tool-rect');
const toolCircle = document.getElementById('tool-circle');
const toolSelect = document.getElementById('tool-select');
const toolEraser = document.getElementById('tool-eraser');

// Styling controls
const colorSwatches = document.querySelectorAll('.color-swatch');
const colorPicker = document.getElementById('color-picker');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessVal = document.getElementById('thickness-val');

// Action buttons
const actionUndo = document.getElementById('action-undo');
const actionRedo = document.getElementById('action-redo');
const actionClear = document.getElementById('action-clear');
const actionSave = document.getElementById('action-save');

// Toast status
const gestureToast = document.getElementById('gesture-toast');
const toastText = document.getElementById('toast-text');

// Canvas Contexts
const uiCtx = uiCanvas.getContext('2d');
const paintCtx = paintCanvas.getContext('2d');

// --- APP STATE ---
let activeTool = 'pencil'; // pencil, rect, circle, select, eraser
let selectedColor = '#00f0ff';
let selectedThickness = 5;

// Drawing Vectors
let shapes = [];
let historyStack = [[]]; // Memento pattern: starts with empty list
let historyIndex = 0;

// Temporary drawing states
let currentPath = null;
let currentShape = null;
let selectedShapeInfo = null; // { shape, index, originalProperties, dragStartHand }
let isPinching = false;
let lastPinchState = false;

// Fist Grabbing/Dragging gesture state
let isFist = false;
let lastFistState = false;
let fistDraggedShape = null; // { shape, index, originalProperties, dragStartHand }

// Coordinates Smoothing (Adaptive Low-Pass Filter)
let cursorX = 0;
let cursorY = 0;
let lastRawX = 0;
let lastRawY = 0;
let smoothX = 0;
let smoothY = 0;
let wasLost = true; // Flag to reset smoothing when hand is re-detected

// Circular Menu Gestures (✌️ Gesto de Paz)
let menuActive = false;
let menuCenter = null; // { x, y } locked when gesture starts
let menuSelectedSector = null; // 'up', 'right', 'down', 'left'
let menuProgress = 0; // 0 to 1
let menuSelectionLocked = false;
let menuLastSector = null;
const MENU_ACTIVATION_DIST = 70; // pixels to move index finger from center to select
const SECTOR_SELECT_TIME = 800; // ms to hold index finger in sector to select
let sectorStartTime = 0;

// Camera feed dimensions (MediaPipe resolution - 480p is significantly faster to process)
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// Track if a hand is detected in the current frame
let handDetected = false;

// --- INITIALIZE CANVAS AND RESIZE HANDLING ---
function resizeCanvases() {
  uiCanvas.width = window.innerWidth;
  uiCanvas.height = window.innerHeight;
  paintCanvas.width = window.innerWidth;
  paintCanvas.height = window.innerHeight;
  
  // Redraw all shapes after resizing
  drawAllShapes();
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases(); // Initial scale

// --- HELPER MATH FUNCTIONS ---
function dist(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function dist3D(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2);
}

// Distance from point p to line segment v-w
function distToSegment(p, v, w) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return dist(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

// --- SMOOTHING FILTER ---
function filterCoordinates(rawX, rawY) {
  // Speed of movement
  const dx = rawX - lastRawX;
  const dy = rawY - lastRawY;
  const speed = Math.sqrt(dx * dx + dy * dy);

  // Adaptive alpha: base is 0.25 (responsive). At speed, it scales up to 1.0 (zero lag)
  let alpha = 0.25 + Math.min(speed / 80, 0.75);
  
  smoothX = alpha * rawX + (1 - alpha) * smoothX;
  smoothY = alpha * rawY + (1 - alpha) * smoothY;

  lastRawX = rawX;
  lastRawY = rawY;

  return { x: smoothX, y: smoothY };
}

// --- UNDO / REDO / HISTORY STATE ---
function pushState() {
  // Truncate any forward history if we were in the middle of undoing and did a new action
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  historyStack.push(JSON.parse(JSON.stringify(shapes)));
  historyIndex++;
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    shapes = JSON.parse(JSON.stringify(historyStack[historyIndex]));
    drawAllShapes();
    showFeedbackToast("Deshecho", "active-hover");
  } else {
    showFeedbackToast("Nada que deshacer", "active-menu");
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    shapes = JSON.parse(JSON.stringify(historyStack[historyIndex]));
    drawAllShapes();
    showFeedbackToast("Rehecho", "active-hover");
  } else {
    showFeedbackToast("Nada que rehacer", "active-menu");
  }
}

function clearCanvas() {
  shapes = [];
  pushState();
  drawAllShapes();
  showFeedbackToast("Lienzo limpio", "active-menu");
}

function saveCanvas() {
  // Create a temporary canvas with dark background to export
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = paintCanvas.width;
  exportCanvas.height = paintCanvas.height;
  const exportCtx = exportCanvas.getContext('2d');

  // Fill dark background
  exportCtx.fillStyle = '#0a0a12';
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // Draw all shapes on top
  drawShapesToContext(exportCtx);

  // Trigger download
  const link = document.createElement('a');
  link.download = `AirPaint_${Date.now()}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
  showFeedbackToast("Dibujo guardado", "active-drawing");
}

// --- COLLISION DETECTION (FIND SHAPES) ---
function findShapeAt(x, y) {
  // Loop backwards so we select the topmost/newest element first
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.type === 'freehand') {
      // Check proximity to any segment
      for (let j = 0; j < shape.points.length - 1; j++) {
        const p1 = shape.points[j];
        const p2 = shape.points[j+1];
        if (distToSegment({ x, y }, p1, p2) < 25) {
          return { shape, index: i };
        }
      }
    } else if (shape.type === 'rectangle') {
      const rx = shape.x;
      const ry = shape.y;
      const rw = shape.w;
      const rh = shape.h;
      
      const left = Math.min(rx, rx + rw);
      const right = Math.max(rx, rx + rw);
      const top = Math.min(ry, ry + rh);
      const bottom = Math.max(ry, ry + rh);

      // Check if inside or near border
      if (x >= left - 15 && x <= right + 15 && y >= top - 15 && y <= bottom + 15) {
        return { shape, index: i };
      }
    } else if (shape.type === 'circle') {
      const d = dist({ x, y }, { x: shape.cx, y: shape.cy });
      // Select if clicked inside or close to the radius border
      if (d < shape.r + 15) {
        return { shape, index: i };
      }
    }
  }
  return null;
}

// --- RENDER VEHICLE (VECTOR DRAWING ENGINE) ---
function drawShapesToContext(ctx) {
  shapes.forEach(shape => {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Add glowing stroke style for that futuristic cyber feel
    ctx.shadowBlur = 8;
    ctx.shadowColor = shape.color;

    if (shape.type === 'freehand') {
      if (shape.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } else if (shape.type === 'rectangle') {
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    } else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, 2 * Math.PI);
      ctx.stroke();
    }
  });

  // Reset shadow for subsequent UI rendering
  ctx.shadowBlur = 0;
}

function drawAllShapes() {
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  drawShapesToContext(paintCtx);
  
  // Render current drawing trace (realtime feedback)
  if (currentPath && currentPath.points.length > 1) {
    paintCtx.strokeStyle = currentPath.color;
    paintCtx.lineWidth = currentPath.thickness;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    paintCtx.shadowBlur = 8;
    paintCtx.shadowColor = currentPath.color;

    paintCtx.beginPath();
    paintCtx.moveTo(currentPath.points[0].x, currentPath.points[0].y);
    for (let i = 1; i < currentPath.points.length; i++) {
      paintCtx.lineTo(currentPath.points[i].x, currentPath.points[i].y);
    }
    paintCtx.stroke();
    paintCtx.shadowBlur = 0;
  }
  
  // Render temporary shape outline (for circles and rectangles)
  if (currentShape) {
    paintCtx.strokeStyle = currentShape.color;
    paintCtx.lineWidth = currentShape.thickness;
    paintCtx.shadowBlur = 8;
    paintCtx.shadowColor = currentShape.color;

    if (currentShape.type === 'rectangle') {
      paintCtx.strokeRect(currentShape.x, currentShape.y, currentShape.w, currentShape.h);
    } else if (currentShape.type === 'circle') {
      paintCtx.beginPath();
      paintCtx.arc(currentShape.cx, currentShape.cy, currentShape.r, 0, 2 * Math.PI);
      paintCtx.stroke();
    }
    paintCtx.shadowBlur = 0;
  }

  // Draw selection borders around selected shape
  if (activeTool === 'select' && selectedShapeInfo) {
    const shape = selectedShapeInfo.shape;
    paintCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    paintCtx.lineWidth = 2;
    paintCtx.setLineDash([6, 6]);
    paintCtx.shadowBlur = 0;

    if (shape.type === 'rectangle') {
      paintCtx.strokeRect(shape.x - 4, shape.y - 4, shape.w + (shape.w > 0 ? 8 : -8), shape.h + (shape.h > 0 ? 8 : -8));
    } else if (shape.type === 'circle') {
      paintCtx.beginPath();
      paintCtx.arc(shape.cx, shape.cy, shape.r + 4, 0, 2 * Math.PI);
      paintCtx.stroke();
    } else if (shape.type === 'freehand') {
      // Find bounding box for freehand lines
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      shape.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      paintCtx.strokeRect(minX - 8, minY - 8, (maxX - minX) + 16, (maxY - minY) + 16);
    }
    paintCtx.setLineDash([]); // Reset dash
  }
}

// --- GESTURE TOAST CONTROL ---
function updateToast(text, className) {
  toastText.textContent = text;
  gestureToast.className = 'gesture-toast'; // Reset
  if (className) {
    gestureToast.classList.add(className);
  }
}

function showFeedbackToast(msg, className) {
  updateToast(msg, className);
  // Revert back after 1.5 seconds if hand is still around, handled in main loop
}

// --- MEDIAPIPE HANDS CALLBACK ---
function onResults(results) {
  // Clear UI Layer Canvas (Cursor, Skeletal cues, Menus)
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    handDetected = true;
    const landmarks = results.multiHandLandmarks[0];
    
    // Get coordinates of key fingertips
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexMcp = landmarks[5];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const middleMcp = landmarks[9];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    // Compute pixel coordinates scaled to viewport
    // Note: mirror horizontal coordinate by subtracting landmarks.x from 1
    const screenIndexX = (1 - indexTip.x) * uiCanvas.width;
    const screenIndexY = indexTip.y * uiCanvas.height;

    // Reset smoothing filter if hand was just lost, avoiding stray jump-lines
    if (wasLost) {
      smoothX = screenIndexX;
      smoothY = screenIndexY;
      lastRawX = screenIndexX;
      lastRawY = screenIndexY;
      wasLost = false;
    }

    // Filter Coordinates (Smoothing)
    const smooth = filterCoordinates(screenIndexX, screenIndexY);
    cursorX = smooth.x;
    cursorY = smooth.y;

    // --- GESTURE CLASSIFICATION ---

    // 1. Hand scale factor (invariant distance between wrist and index Mcp)
    const handScale = dist3D(wrist, indexMcp);

    // 2. Pinch Gesture (distance indexTip to thumbTip relative to hand scale)
    const tipDist = dist3D(thumbTip, indexTip);
    const relativePinch = tipDist / handScale;
    
    // If relative distance between Index Tip and Thumb Tip is < 0.35, it's a pinch
    isPinching = relativePinch < 0.35;

    // 3. Fist Gesture (all 4 main fingers folded towards wrist)
    const distTipIndex = dist3D(indexTip, wrist);
    const distPipIndex = dist3D(indexPip, wrist);
    const distTipMiddle = dist3D(middleTip, wrist);
    const distPipMiddle = dist3D(middlePip, wrist);
    const distTipRing = dist3D(ringTip, wrist);
    const distPipRing = dist3D(ringPip, wrist);
    const distTipPinky = dist3D(pinkyTip, wrist);
    const distPipPinky = dist3D(pinkyPip, wrist);

    const indexFolded = distTipIndex < distPipIndex * 1.08;
    const middleFolded = distTipMiddle < distPipMiddle * 1.08;
    const ringFolded = distTipRing < distPipRing * 1.08;
    const pinkyFolded = distTipPinky < distPipPinky * 1.08;

    isFist = indexFolded && middleFolded && ringFolded && pinkyFolded;

    // 4. Peace sign gesture (Index and Middle extended, Ring and Pinky folded)
    const isIndexExtended = indexTip.y < indexPip.y;
    const isMiddleExtended = middleTip.y < middlePip.y;
    const isRingFolded = ringTip.y > ringPip.y;
    const isPinkyFolded = pinkyTip.y > pinkyPip.y;

    const isPeaceSign = isIndexExtended && isMiddleExtended && isRingFolded && isPinkyFolded && !isFist;

    // Draw skeletal lines on UI Canvas with neon blue
    drawSkeleton(landmarks);

    // Handle Circular Menu
    if (isPeaceSign) {
      handleMenuGesture(cursorX, cursorY);
    } else {
      if (menuActive) {
        // Just exited menu gesture
        menuActive = false;
        menuCenter = null;
        menuSelectedSector = null;
        menuProgress = 0;
        menuSelectionLocked = false;
        menuLastSector = null;
      }
      
      // Process Fist Grabbing/Dragging (works in any mode)
      handleFistDragging(cursorX, cursorY, isFist);
      
      // Process Normal Drawing/Dragging Interaction (only if not active with fist drag)
      if (!fistDraggedShape) {
        handlePaintInteraction(cursorX, cursorY, isPinching);
      }
    }

    // Render Tracking Cursor Overlay
    drawCursor(cursorX, cursorY, isPinching, relativePinch);

  } else {
    // No hand detected
    if (handDetected) {
      handDetected = false;
      wasLost = true;
      updateToast("Esperando mano...", "");
      // Cancel active drawing/drag sessions
      cancelDrawingSession();
      if (fistDraggedShape) {
        fistDraggedShape = null;
      }
    }
  }
}

// --- INTERACTION LOGIC ---
function handlePaintInteraction(x, y, pinching) {
  // Check transitions
  const startedPinch = pinching && !lastPinchState;
  const releasedPinch = !pinching && lastPinchState;
  lastPinchState = pinching;

  if (activeTool === 'pencil') {
    updateToast(pinching ? "Dibujando..." : "Lápiz activo (Pellizca para dibujar)", pinching ? "active-drawing" : "active-hover");
    
    if (startedPinch) {
      currentPath = {
        type: 'freehand',
        points: [{ x, y }],
        color: selectedColor,
        thickness: selectedThickness
      };
    } else if (pinching && currentPath) {
      // Add point only if it moved enough to reduce unnecessary nodes
      const lastPoint = currentPath.points[currentPath.points.length - 1];
      if (dist({ x, y }, lastPoint) > 2) {
        currentPath.points.push({ x, y });
        drawAllShapes();
      }
    } else if (releasedPinch && currentPath) {
      if (currentPath.points.length > 1) {
        shapes.push(currentPath);
        pushState();
      }
      currentPath = null;
      drawAllShapes();
    }
  } 
  
  else if (activeTool === 'rect') {
    updateToast(pinching ? "Redimensionando..." : "Rectángulo activo (Pellizca para crear)", pinching ? "active-drawing" : "active-hover");
    
    if (startedPinch) {
      currentShape = {
        type: 'rectangle',
        x,
        y,
        w: 0,
        h: 0,
        color: selectedColor,
        thickness: selectedThickness
      };
    } else if (pinching && currentShape) {
      currentShape.w = x - currentShape.x;
      currentShape.h = y - currentShape.y;
      drawAllShapes();
    } else if (releasedPinch && currentShape) {
      // Avoid tiny/accidental shape registrations
      if (Math.abs(currentShape.w) > 5 || Math.abs(currentShape.h) > 5) {
        shapes.push(currentShape);
        pushState();
      }
      currentShape = null;
      drawAllShapes();
    }
  } 
  
  else if (activeTool === 'circle') {
    updateToast(pinching ? "Redimensionando..." : "Círculo activo (Pellizca para crear)", pinching ? "active-drawing" : "active-hover");
    
    if (startedPinch) {
      currentShape = {
        type: 'circle',
        cx: x,
        cy: y,
        r: 0,
        color: selectedColor,
        thickness: selectedThickness
      };
    } else if (pinching && currentShape) {
      const radius = dist({ x: currentShape.cx, y: currentShape.cy }, { x, y });
      currentShape.r = radius;
      drawAllShapes();
    } else if (releasedPinch && currentShape) {
      if (currentShape.r > 3) {
        shapes.push(currentShape);
        pushState();
      }
      currentShape = null;
      drawAllShapes();
    }
  } 
  
  else if (activeTool === 'select') {
    if (startedPinch) {
      const hit = findShapeAt(x, y);
      if (hit) {
        selectedShapeInfo = {
          shape: hit.shape,
          index: hit.index,
          // Store copies of original state for displacement calculations
          originalProperties: JSON.parse(JSON.stringify(hit.shape)),
          dragStartHand: { x, y }
        };
        updateToast("Arrastrando figura", "active-drawing");
      }
    } else if (pinching && selectedShapeInfo) {
      const dx = x - selectedShapeInfo.dragStartHand.x;
      const dy = y - selectedShapeInfo.dragStartHand.y;
      const shape = selectedShapeInfo.shape;
      const orig = selectedShapeInfo.originalProperties;

      if (shape.type === 'rectangle') {
        shape.x = orig.x + dx;
        shape.y = orig.y + dy;
      } else if (shape.type === 'circle') {
        shape.cx = orig.cx + dx;
        shape.cy = orig.cy + dy;
      } else if (shape.type === 'freehand') {
        for (let i = 0; i < shape.points.length; i++) {
          shape.points[i].x = orig.points[i].x + dx;
          shape.points[i].y = orig.points[i].y + dy;
        }
      }
      drawAllShapes();
      updateToast("Moviendo figura...", "active-drawing");
    } else if (releasedPinch) {
      if (selectedShapeInfo) {
        pushState(); // Save displaced state to undo stack
        selectedShapeInfo = null;
      }
      drawAllShapes();
    }

    if (!pinching) {
      const hoverHit = findShapeAt(x, y);
      if (hoverHit) {
        updateToast("Figura encontrada (Pellizca para arrastrar)", "active-hover");
      } else {
        updateToast("Seleccionar figura (Pellizca encima)", "active-hover");
      }
    }
  } 
  
  else if (activeTool === 'eraser') {
    updateToast(pinching ? "Borrando..." : "Borrador activo (Pellizca para borrar)", pinching ? "active-drawing" : "active-hover");
    
    if (pinching) {
      const hit = findShapeAt(x, y);
      if (hit) {
        shapes.splice(hit.index, 1);
        pushState();
        drawAllShapes();
        showFeedbackToast("Trazos borrados", "active-menu");
      }
    }
  }
}

function handleFistDragging(x, y, fistActive) {
  const startedFist = fistActive && !lastFistState;
  const releasedFist = !fistActive && lastFistState;
  lastFistState = fistActive;

  if (startedFist) {
    const hit = findShapeAt(x, y);
    if (hit) {
      fistDraggedShape = {
        shape: hit.shape,
        index: hit.index,
        originalProperties: JSON.parse(JSON.stringify(hit.shape)),
        dragStartHand: { x, y }
      };
      updateToast("Puño cerrado: Arrastrando figura", "active-drawing");
    }
  } else if (fistActive && fistDraggedShape) {
    const dx = x - fistDraggedShape.dragStartHand.x;
    const dy = y - fistDraggedShape.dragStartHand.y;
    const shape = fistDraggedShape.shape;
    const orig = fistDraggedShape.originalProperties;

    if (shape.type === 'rectangle') {
      shape.x = orig.x + dx;
      shape.y = orig.y + dy;
    } else if (shape.type === 'circle') {
      shape.cx = orig.cx + dx;
      shape.cy = orig.cy + dy;
    } else if (shape.type === 'freehand') {
      for (let i = 0; i < shape.points.length; i++) {
        shape.points[i].x = orig.points[i].x + dx;
        shape.points[i].y = orig.points[i].y + dy;
      }
    }
    drawAllShapes();
    updateToast("Desplazando con puño...", "active-drawing");
  } else if (releasedFist) {
    if (fistDraggedShape) {
      pushState(); // Save state to history stack
      fistDraggedShape = null;
      showFeedbackToast("Figura reposicionada", "active-hover");
    }
    drawAllShapes();
  }
}

function cancelDrawingSession() {
  currentPath = null;
  currentShape = null;
  selectedShapeInfo = null;
  fistDraggedShape = null;
  lastPinchState = false;
  lastFistState = false;
  drawAllShapes();
}

// --- GESTURE MENU SYSTEM (✌️ PEACE GESTURE LOGIC) ---
function handleMenuGesture(x, y) {
  updateToast("Menú flotante activado", "active-menu");

  if (!menuActive) {
    menuActive = true;
    menuCenter = { x, y };
    menuSelectedSector = null;
    menuProgress = 0;
    menuSelectionLocked = false;
    menuLastSector = null;
    sectorStartTime = Date.now();
  }

  // Calculate hand distance and angle from menu locked center
  const dx = x - menuCenter.x;
  const dy = y - menuCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  let currentSector = null;

  // If moved out of center, identify target sector
  if (distance > MENU_ACTIVATION_DIST && !menuSelectionLocked) {
    // Up: -3/4 PI to -1/4 PI
    // Right: -1/4 PI to 1/4 PI
    // Down: 1/4 PI to 3/4 PI
    // Left: rest (greater than 3/4 PI or less than -3/4 PI)
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
      currentSector = 'right'; // Selección
    } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
      currentSector = 'down'; // Borrador
    } else if (angle >= (-3 * Math.PI) / 4 && angle < -Math.PI / 4) {
      currentSector = 'up'; // Lápiz
    } else {
      currentSector = 'left'; // Limpiar Todo
    }
  }

  // Update Progress Timer
  if (currentSector && currentSector !== menuSelectionLocked) {
    if (currentSector !== menuLastSector) {
      menuLastSector = currentSector;
      sectorStartTime = Date.now();
      menuProgress = 0;
    } else {
      const elapsed = Date.now() - sectorStartTime;
      menuProgress = Math.min(elapsed / SECTOR_SELECT_TIME, 1);
      
      // Selection Triggered
      if (menuProgress === 1) {
        triggerMenuSelection(currentSector);
        menuSelectionLocked = true;
        menuProgress = 0;
      }
    }
  } else {
    // Returned to center, reset timer
    if (!menuSelectionLocked) {
      menuProgress = 0;
      menuLastSector = null;
    }
  }

  // If user returns to center, unlock menu for another selection
  if (distance < MENU_ACTIVATION_DIST - 15 && menuSelectionLocked) {
    menuSelectionLocked = false;
    menuLastSector = null;
  }

  // Draw Menu graphics on UI Layer
  drawMenuUI(menuCenter.x, menuCenter.y, x, y, distance, currentSector, menuProgress, menuSelectionLocked);
}

function triggerMenuSelection(sector) {
  let feedback = "";
  if (sector === 'up') {
    selectTool('pencil');
    feedback = "Lápiz Seleccionado";
  } else if (sector === 'right') {
    selectTool('select');
    feedback = "Selección Seleccionada";
  } else if (sector === 'down') {
    selectTool('eraser');
    feedback = "Borrador Seleccionado";
  } else if (sector === 'left') {
    clearCanvas();
    feedback = "Lienzo Limpiado";
  }

  // Visual feedback: brief overlay flash
  uiCtx.fillStyle = 'rgba(0, 240, 255, 0.15)';
  uiCtx.fillRect(0, 0, uiCanvas.width, uiCanvas.height);
  showFeedbackToast(feedback, "active-drawing");
}

// Select tool in GUI and state
function selectTool(toolName) {
  activeTool = toolName;
  
  // Update GUI
  [toolPencil, toolRect, toolCircle, toolSelect, toolEraser].forEach(btn => btn.classList.remove('active'));
  
  if (toolName === 'pencil') toolPencil.classList.add('active');
  else if (toolName === 'rect') toolRect.classList.add('active');
  else if (toolName === 'circle') toolCircle.classList.add('active');
  else if (toolName === 'select') toolSelect.classList.add('active');
  else if (toolName === 'eraser') toolEraser.classList.add('active');
  
  cancelDrawingSession();
}

// --- RENDER VISUAL FEEDBACK ON CANVAS ---

// Draw the hand skeletal structure
function drawSkeleton(landmarks) {
  uiCtx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
  uiCtx.lineWidth = 2;
  uiCtx.lineCap = 'round';
  
  // MediaPipe Hand Connection Map
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [5, 9], [9, 10], [10, 11], [11, 12], // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [0, 17] // Palm bottom
  ];

  connections.forEach(([startIdx, endIdx]) => {
    const pt1 = landmarks[startIdx];
    const pt2 = landmarks[endIdx];
    
    // Scale and mirror coordinates
    const x1 = (1 - pt1.x) * uiCanvas.width;
    const y1 = pt1.y * uiCanvas.height;
    const x2 = (1 - pt2.x) * uiCanvas.width;
    const y2 = pt2.y * uiCanvas.height;

    uiCtx.beginPath();
    uiCtx.moveTo(x1, y1);
    uiCtx.lineTo(x2, y2);
    uiCtx.stroke();
  });

  // Draw node points
  uiCtx.fillStyle = 'rgba(255, 0, 127, 0.5)';
  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    const px = (1 - pt.x) * uiCanvas.width;
    const py = pt.y * uiCanvas.height;
    
    uiCtx.beginPath();
    uiCtx.arc(px, py, i === 8 || i === 4 ? 6 : 3, 0, 2 * Math.PI);
    uiCtx.fill();
  }
}

// Draw cursor at index fingertip
function drawCursor(x, y, pinching, relativePinch) {
  uiCtx.shadowBlur = 10;
  
  // Cursor color depends on active tool
  let cursorColor = selectedColor;
  if (activeTool === 'eraser') cursorColor = '#ff007f';
  if (activeTool === 'select') cursorColor = '#ffffff';

  uiCtx.shadowColor = cursorColor;
  uiCtx.strokeStyle = cursorColor;

  // Visual feedback when grabbing (fist)
  if (isFist || fistDraggedShape) {
    uiCtx.strokeStyle = '#39ff14'; // Green neon for grabbing
    uiCtx.shadowColor = '#39ff14';
    uiCtx.lineWidth = 3;
    uiCtx.beginPath();
    uiCtx.arc(x, y, 8, 0, 2 * Math.PI);
    uiCtx.stroke();
    
    uiCtx.beginPath();
    uiCtx.arc(x, y, 16, 0, 2 * Math.PI);
    uiCtx.stroke();

    uiCtx.fillStyle = '#39ff14';
    uiCtx.font = 'bold 11px Inter, sans-serif';
    uiCtx.fillText("ARRAS.", x + 22, y + 4);
    uiCtx.shadowBlur = 0;
    return;
  }

  if (pinching) {
    // Pulsing, tight concentric rings when pinching (drawing/dragging)
    uiCtx.lineWidth = 3;
    uiCtx.beginPath();
    uiCtx.arc(x, y, 6, 0, 2 * Math.PI);
    uiCtx.stroke();
    
    uiCtx.fillStyle = cursorColor;
    uiCtx.beginPath();
    uiCtx.arc(x, y, 2, 0, 2 * Math.PI);
    uiCtx.fill();
  } else {
    // Large loose ring when hovering
    uiCtx.lineWidth = 1.5;
    uiCtx.beginPath();
    uiCtx.arc(x, y, 12, 0, 2 * Math.PI);
    uiCtx.stroke();
    
    // Draw tiny guide center dot
    uiCtx.fillStyle = 'rgba(255,255,255,0.7)';
    uiCtx.beginPath();
    uiCtx.arc(x, y, 2, 0, 2 * Math.PI);
    uiCtx.fill();

    // Show tool label floating next to cursor
    uiCtx.shadowBlur = 0;
    uiCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    uiCtx.font = '11px Inter, sans-serif';
    uiCtx.fillText(activeTool.toUpperCase(), x + 18, y + 4);
  }
  uiCtx.shadowBlur = 0; // Reset
}

// Draw the Sci-Fi menu around the locked center
function drawMenuUI(cx, cy, hx, hy, dist, sector, progress, locked) {
  const outerR = 110;
  const innerR = 45;

  // Background blur panel/shadow behind the menu
  uiCtx.fillStyle = 'rgba(10, 10, 18, 0.65)';
  uiCtx.beginPath();
  uiCtx.arc(cx, cy, outerR + 10, 0, 2 * Math.PI);
  uiCtx.fill();
  
  uiCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  uiCtx.lineWidth = 1;
  uiCtx.stroke();

  // Draw 4 sectors
  const sectors = [
    { key: 'up', label: 'LÁPIZ', color: '#00f0ff', start: -3*Math.PI/4, end: -Math.PI/4 },
    { key: 'right', label: 'MOVER', color: '#ffffff', start: -Math.PI/4, end: Math.PI/4 },
    { key: 'down', label: 'BORRAR', color: '#ff007f', start: Math.PI/4, end: 3*Math.PI/4 },
    { key: 'left', label: 'LIMPIAR', color: '#ffaa00', start: 3*Math.PI/4, end: -3*Math.PI/4 }
  ];

  sectors.forEach(sec => {
    const isSelected = sector === sec.key;
    uiCtx.beginPath();
    
    // Outer Arc
    uiCtx.arc(cx, cy, outerR, sec.start, sec.end);
    // Inner Arc back
    uiCtx.arc(cx, cy, innerR, sec.end, sec.start, true);
    uiCtx.closePath();

    if (isSelected) {
      uiCtx.fillStyle = locked ? 'rgba(57, 255, 20, 0.2)' : 'rgba(255, 255, 255, 0.08)';
      uiCtx.strokeStyle = locked ? '#39ff14' : sec.color;
      uiCtx.lineWidth = 2.5;
      uiCtx.shadowBlur = 10;
      uiCtx.shadowColor = locked ? '#39ff14' : sec.color;
    } else {
      uiCtx.fillStyle = 'transparent';
      uiCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      uiCtx.lineWidth = 1;
      uiCtx.shadowBlur = 0;
    }
    
    uiCtx.fill();
    uiCtx.stroke();
    uiCtx.shadowBlur = 0;

    // Draw Sector Text Label
    const midAngle = sec.start + Math.PI / 4;
    // Handle the wrapping boundary of Left sector
    const actualMid = sec.key === 'left' ? Math.PI : midAngle;
    
    const textR = (outerR + innerR) / 2;
    const tx = cx + Math.cos(actualMid) * textR;
    const ty = cy + Math.sin(actualMid) * textR;

    uiCtx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
    uiCtx.font = 'bold 10px Inter, sans-serif';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.fillText(sec.label, tx, ty);
  });

  // Center hub
  uiCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  uiCtx.strokeStyle = locked ? '#39ff14' : 'rgba(0, 240, 255, 0.3)';
  uiCtx.lineWidth = 2;
  uiCtx.beginPath();
  uiCtx.arc(cx, cy, innerR - 5, 0, 2 * Math.PI);
  uiCtx.fill();
  uiCtx.stroke();

  // Pointer tracker line from center to index finger
  uiCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  uiCtx.lineWidth = 1.5;
  uiCtx.setLineDash([4, 4]);
  uiCtx.beginPath();
  uiCtx.moveTo(cx, cy);
  uiCtx.lineTo(hx, hy);
  uiCtx.stroke();
  uiCtx.setLineDash([]); // Reset

  // Progress circular indicator in the center hub
  if (progress > 0 && progress < 1 && sector) {
    uiCtx.strokeStyle = '#39ff14'; // neon green loading ring
    uiCtx.lineWidth = 4;
    uiCtx.lineCap = 'round';
    uiCtx.shadowBlur = 8;
    uiCtx.shadowColor = '#39ff14';
    
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, innerR - 10, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress));
    uiCtx.stroke();
    uiCtx.shadowBlur = 0;
  }

  // Label locked state
  if (locked) {
    uiCtx.fillStyle = '#39ff14';
    uiCtx.font = 'bold 9px Inter, sans-serif';
    uiCtx.fillText("LISTO", cx, cy);
  } else {
    uiCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    uiCtx.font = 'bold 9px Inter, sans-serif';
    uiCtx.fillText("MENU", cx, cy);
  }
}

// --- MEDIAPIPE CORE LIFECYCLE ---
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.52, // Lowered for better tracking on fast movements / motion blur
  minTrackingConfidence: 0.52
});

hands.onResults(onResults);

// Setup webcam camera utils
const camera = new Camera(webcamElement, {
  onFrame: async () => {
    await hands.send({ image: webcamElement });
  },
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT
});

// Start camera stream
camera.start()
  .then(() => {
    // Hide loading screen once camera is initialized
    loader.classList.add('fade-out');
  })
  .catch((err) => {
    console.error("Camera error:", err);
    loaderStatus.textContent = "Error al abrir la cámara web.";
    loaderStatus.style.color = "#ff007f";
    const subtext = document.querySelector('.loader-subtext');
    subtext.textContent = "Verifica los permisos del navegador e intenta de nuevo.";
  });

// --- SIDEBAR ACTIONS AND BINDINGS ---

// Toolbar selector listeners
toolPencil.addEventListener('click', () => selectTool('pencil'));
toolRect.addEventListener('click', () => selectTool('rect'));
toolCircle.addEventListener('click', () => selectTool('circle'));
toolSelect.addEventListener('click', () => selectTool('select'));
toolEraser.addEventListener('click', () => selectTool('eraser'));

// Color palette selector
colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    colorSwatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    selectedColor = swatch.dataset.color;
    colorPicker.value = selectedColor;
  });
});

// Custom color picker
colorPicker.addEventListener('input', (e) => {
  selectedColor = e.target.value;
  // Remove active state from preset swatches
  colorSwatches.forEach(s => s.classList.remove('active'));
});

// Thickness slider
thicknessSlider.addEventListener('input', (e) => {
  selectedThickness = parseInt(e.target.value);
  thicknessVal.textContent = `${selectedThickness}px`;
});

// Action buttons
actionUndo.addEventListener('click', undo);
actionRedo.addEventListener('click', redo);
actionClear.addEventListener('click', clearCanvas);
actionSave.addEventListener('click', saveCanvas);

// Keyboard shortcuts for power users (Ctrl+Z, Ctrl+Y, Escape)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    redo();
  } else if (e.key === 'Escape') {
    cancelDrawingSession();
  }
});
