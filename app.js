/**
 * InpaintPro App Logic
 * Handles UI interactions, Canvas management, and Tool switching
 */

class App {
    constructor() {
        // UI Elements
        this.dom = {
            dropZone: document.getElementById('dropZone'),
            fileInput: document.getElementById('fileInput'),
            importBtn: document.getElementById('importBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            removeBtn: document.getElementById('removeBtn'),
            compareBtn: document.getElementById('compareBtn'),
            emptyState: document.getElementById('emptyState'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            mainCanvas: document.getElementById('mainCanvas'),
            maskCanvas: document.getElementById('maskCanvas'),
            brushSizeInput: document.getElementById('brushSize'),
            brushSizeVal: document.getElementById('brushSizeVal'),
            cursorRing: document.getElementById('cursorRing'),
            undoBtn: document.getElementById('actionUndo'),
            redoBtn: document.getElementById('actionRedo'),
            loader: document.getElementById('loader'),
            statusText: document.getElementById('statusText'),
            // New Tools
            toolBrush: document.getElementById('toolBrush'),
            toolHand: document.getElementById('toolHand'),
            zoomIn: document.getElementById('zoomIn'),
            zoomOut: document.getElementById('zoomOut'),
            zoomLevel: document.getElementById('zoomLevel'),
        };

        // State
        this.ctx = this.dom.mainCanvas.getContext('2d');
        this.maskCtx = this.dom.maskCanvas.getContext('2d');
        this.image = null;
        this.originalImageData = null;
        this.history = [];
        this.historyIndex = -1;

        // Interaction State
        this.activeTool = 'brush'; // 'brush' or 'hand'
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Transform State
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        // Brush State
        this.brushSize = 30;
        this.scale = 1; // Base image scale to fit viewport initially

        this.processor = new InpaintProcessor();

        this.init();
    }

    init() {
        this.addEventListeners();
        this.updateBrushCursor();
        this.updateTransform(); // Initialize CSS transform
    }

    addEventListeners() {
        // Drag & Drop
        const dz = this.dom.dropZone;
        dz.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.emptyState.classList.add('drag-over');
        });
        dz.addEventListener('dragleave', () => {
            this.dom.emptyState.classList.remove('drag-over');
        });
        dz.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.emptyState.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                this.loadImageFile(e.dataTransfer.files[0]);
            }
        });

        // Uploads
        this.dom.importBtn.addEventListener('click', () => this.dom.fileInput.click());
        const centerBtn = document.getElementById('centerUploadBtn');
        if (centerBtn) {
            centerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dom.fileInput.click();
            });
        }
        this.dom.emptyState.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.emptyState.style.cursor = 'pointer';
        this.dom.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) this.loadImageFile(e.target.files[0]);
        });

        // Tool Switching
        if (this.dom.toolBrush) {
            this.dom.toolBrush.addEventListener('click', () => this.setTool('brush'));
        }
        if (this.dom.toolHand) {
            this.dom.toolHand.addEventListener('click', () => this.setTool('hand'));
        }

        // Brush Size
        this.dom.brushSizeInput.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            this.dom.brushSizeVal.innerText = this.brushSize + 'px';
            this.updateBrushCursor();
        });

        // Zoom Controls
        if (this.dom.zoomIn) {
            this.dom.zoomIn.addEventListener('click', () => this.adjustZoom(0.1));
            this.dom.zoomOut.addEventListener('click', () => this.adjustZoom(-0.1));
        }

        // Viewport Interaction (Mouse & Wheel)
        const viewport = this.dom.dropZone; // Events on viewport, not just wrapper

        viewport.addEventListener('wheel', (e) => {
            if (this.image) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                this.adjustZoom(delta);
            }
        }, { passive: false });

        viewport.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        // Actions
        this.dom.removeBtn.addEventListener('click', () => this.runProcessor());
        this.dom.compareBtn.addEventListener('mousedown', () => this.showOriginal(true));
        this.dom.compareBtn.addEventListener('mouseup', () => this.showOriginal(false));
        this.dom.compareBtn.addEventListener('mouseleave', () => this.showOriginal(false));
        this.dom.downloadBtn.addEventListener('click', () => this.downloadImage());
        this.dom.undoBtn.addEventListener('click', () => this.undo());
    }

    setTool(tool) {
        this.activeTool = tool;

        // Update UI
        if (this.dom.toolBrush) this.dom.toolBrush.classList.toggle('active', tool === 'brush');
        if (this.dom.toolHand) this.dom.toolHand.classList.toggle('active', tool === 'hand');

        // Update Cursor
        if (tool === 'hand') {
            this.dom.dropZone.classList.add('cursor-grab');
            this.dom.cursorRing.style.display = 'none';
        } else {
            this.dom.dropZone.classList.remove('cursor-grab');
        }
    }

    adjustZoom(delta) {
        if (!this.image) return;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom + delta)); // Limit 0.1x to 5x
        this.zoom = newZoom;
        this.updateTransform();
    }

    updateTransform() {
        this.dom.canvasWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        if (this.dom.zoomLevel) this.dom.zoomLevel.innerText = Math.round(this.zoom * 100) + '%';
        this.updateBrushCursor();
    }

    loadImageFile(file) {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.renderImage();
                this.dom.emptyState.hidden = true;
                this.dom.canvasWrapper.hidden = false;
                this.dom.removeBtn.disabled = false;
                this.dom.downloadBtn.disabled = false;
                this.dom.compareBtn.hidden = false;

                // Reset State
                this.history = [];
                this.saveState(true);
                this.panX = 0;
                this.panY = 0;
                this.zoom = 1;
                this.updateTransform();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    renderImage() {
        if (!this.image) return;

        const imgW = this.image.width;
        const imgH = this.image.height;

        // Initial fit calculation
        const viewportW = this.dom.dropZone.clientWidth;
        const viewportH = this.dom.dropZone.clientHeight;
        const fitScale = Math.min((viewportW - 40) / imgW, (viewportH - 40) / imgH);

        // Set canvas to real size
        [this.dom.mainCanvas, this.dom.maskCanvas].forEach(canvas => {
            canvas.width = imgW;
            canvas.height = imgH;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        });

        // Wrapper is real size
        this.dom.canvasWrapper.style.width = `${imgW}px`;
        this.dom.canvasWrapper.style.height = `${imgH}px`;

        // Draw content
        this.ctx.drawImage(this.image, 0, 0);
        this.maskCtx.clearRect(0, 0, imgW, imgH);

        // Center the wrapper initially (using Pan) - visual centering
        // Since transform-origin is 0 0, we need to translate to center
        // Center of viewport = VW/2, VH/2
        // Center of scaled image = (W*Scale)/2, (H*Scale)/2
        // We start with scale 1 effectively for calculation logic, then apply zoom

        // Let's start centered with zoom = fitScale
        this.zoom = fitScale < 1 ? fitScale : 0.9;
        // Ensure strictly 1.0 isn't forced if it doesn't fit

        const scaledW = imgW * this.zoom;
        const scaledH = imgH * this.zoom;

        this.panX = (viewportW - scaledW) / 2;
        this.panY = (viewportH - scaledH) / 2;

        // But wait, transform applied is translate(px, py) scale(z).
        // If origin is 0 0.
        // Screen Pos of (0,0) is (px, py).
        // Screen Pos of (w,h) is (px + w*z, py + h*z).
        // So panX/panY should be the top-left corner in screen coordinates.
        // That matches my calculation above: (ViewportW - W*Z)/2.
        // EXCEPT: When we zoom in/out with fixed button, we just change Z. The center moves.
        // It's fine for MVP.

        this.updateTransform();
    }

    handleMouseDown(e) {
        if (!this.image) return;

        // Check if we are clicking on the canvas or background
        // Hand tool works everywhere
        if (this.activeTool === 'hand' || e.button === 1) { // Middle click or Hand tool
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.dom.dropZone.classList.add('cursor-grabbing');
            // Prevent text selection
            e.preventDefault();
        } else if (this.activeTool === 'brush' && e.button === 0) {
            // Brush should only work if we are roughly over the wrapper? 
            // Or we just allow painting outside (it will be clipped/ignored by canvas logic)
            this.isDragging = true;
            this.saveState();
            this.draw(e);
        }
    }

    handleMouseMove(e) {
        if (!this.image) return;

        if (this.activeTool === 'brush') {
            this.updateCursorPosition(e);
        }

        if (!this.isDragging) return;

        if (this.activeTool === 'hand' || (e.buttons & 4) || (this.activeTool === 'hand' && e.buttons === 1)) {
            // Panning: Hand+Left(1) OR Middle(4)
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;

            // Adjust pan directly
            this.panX += dx;
            this.panY += dy;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.updateTransform();
        } else if (this.activeTool === 'brush') { // Drawing
            this.draw(e);
        }
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.dom.dropZone.classList.remove('cursor-grabbing');
            this.ctx.beginPath();
            this.maskCtx.beginPath();
        }
    }

    updateCursorPosition(e) {
        if (this.activeTool !== 'brush') {
            this.dom.cursorRing.style.display = 'none';
            return;
        }

        // We want the ring to follow the mouse pointer EXACTLY.
        // But the ring is inside the wrapper (which is scaled).
        // So we need to calculate the Local Position that results in the Mouse Screen Position.

        const local = this.toLocalCoordinates(e.clientX, e.clientY);

        // However, the Ring Div is just a div. 
        // If we place it at local.x, local.y inside the wrapper...
        // And the wrapper is scaled by Z...
        // Then the visual position will be (local.x * Z + PanX, local.y * Z + PanY).
        // Does that match ClientX/Y?
        // ClientX = VisualX + RectLeft = (local.x * Z) + PanX? (Sort of, simplified).

        // Yes, putting it at local coordinates inside the scaled wrapper is correct.
        this.dom.cursorRing.style.display = 'block';
        this.dom.cursorRing.style.left = local.x + 'px';
        this.dom.cursorRing.style.top = local.y + 'px';
    }

    updateBrushCursor() {
        const size = this.brushSize;
        this.dom.cursorRing.style.width = size + 'px';
        this.dom.cursorRing.style.height = size + 'px';
    }

    toLocalCoordinates(clientX, clientY) {
        const rect = this.dom.canvasWrapper.getBoundingClientRect();

        // visualX/Y is distance from top-left of the SCALED wrapper
        const visualX = clientX - rect.left;
        const visualY = clientY - rect.top;

        // Divide by zoom to get local pixels
        const x = visualX / this.zoom;
        const y = visualY / this.zoom;

        return { x, y };
    }

    draw(e) {
        if (this.activeTool !== 'brush') return;

        const local = this.toLocalCoordinates(e.clientX, e.clientY);

        this.maskCtx.lineWidth = this.brushSize;
        this.maskCtx.lineCap = 'round';
        this.maskCtx.strokeStyle = 'rgba(255, 50, 50, 0.8)';

        this.maskCtx.lineTo(local.x, local.y);
        this.maskCtx.stroke();
        this.maskCtx.beginPath();
        this.maskCtx.moveTo(local.x, local.y);
    }

    saveState(isInitial = false) {
        if (isInitial) {
            this.originalImageData = this.ctx.getImageData(0, 0, this.dom.mainCanvas.width, this.dom.mainCanvas.height);
        }
        this.history.push(this.ctx.getImageData(0, 0, this.dom.mainCanvas.width, this.dom.mainCanvas.height));
        if (this.history.length > 20) this.history.shift();
        this.dom.undoBtn.disabled = this.history.length === 0;
    }

    undo() {
        if (this.history.length > 0) {
            const state = this.history.pop();
            this.ctx.putImageData(state, 0, 0);
            this.dom.undoBtn.disabled = this.history.length === 0;
        }
    }

    showOriginal(show) {
        if (!this.originalImageData) return;
        if (show) {
            const current = this.ctx.getImageData(0, 0, this.dom.mainCanvas.width, this.dom.mainCanvas.height);
            this.tempState = current;
            this.ctx.putImageData(this.originalImageData, 0, 0);
        } else if (this.tempState) {
            this.ctx.putImageData(this.tempState, 0, 0);
            this.tempState = null;
        }
    }

    downloadImage() {
        const link = document.createElement('a');
        link.download = 'wmremove-cleaned.jpg';
        link.href = this.dom.mainCanvas.toDataURL('image/jpeg', 0.9);
        link.click();
    }

    async runProcessor() {
        if (this.processor.isProcessing) return;

        this.dom.loader.hidden = false;
        this.dom.statusText.innerText = "Processing...";
        this.dom.removeBtn.disabled = true;

        const width = this.dom.mainCanvas.width;
        const height = this.dom.mainCanvas.height;
        const imgData = this.ctx.getImageData(0, 0, width, height);
        const maskData = this.maskCtx.getImageData(0, 0, width, height);

        setTimeout(async () => {
            try {
                const result = await this.processor.process(imgData, maskData);
                this.ctx.putImageData(result, 0, 0);
                this.maskCtx.clearRect(0, 0, width, height);
                this.saveState();
                this.dom.statusText.innerText = "Done!";
            } catch (err) {
                console.error(err);
                this.dom.statusText.innerText = "Error";
            } finally {
                this.dom.loader.hidden = true;
                this.dom.removeBtn.disabled = false;
            }
        }, 50);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
