/**
 * processor.js
 * Handles the pixel manipulation and inpainting algorithms
 */

class InpaintProcessor {
    constructor() {
        this.isProcessing = false;
    }

    /**
     * Main processing function
     * @param {ImageData} imageData - The source image data
     * @param {ImageData} maskData - The mask (alpha > 0 indicates area to heal)
     * @returns {Promise<ImageData>} - Processed image data
     */
    async process(imageData, maskData) {
        console.time("Inpaint");
        this.isProcessing = true;

        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const mask = maskData.data;

        // Identify damage pixels [x, y]
        let damagedPixels = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                // If mask is red/opaque enough
                if (mask[i + 3] > 0) {
                    damagedPixels.push({ x, y, i, solved: false });
                }
            }
        }

        // Iterative Diffusion Approach
        // Repeatedly fill border pixels from valid neighbors until empty

        let maxIterations = 500; // Safety break
        let remaining = damagedPixels.length;

        // Simple Fast Marching Approx
        while (remaining > 0 && maxIterations-- > 0) {
            let solvedThisPass = [];

            for (let k = 0; k < damagedPixels.length; k++) {
                const p = damagedPixels[k];
                if (p.solved) continue;

                // Check neighbors
                let r = 0, g = 0, b = 0, count = 0;

                // 8-neighbor loop
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = p.x + dx;
                        const ny = p.y + dy;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const ni = (ny * width + nx) * 4;
                            const isMasked = mask[ni + 3] > 0;

                            // Use pixel if it is NOT masked (it's valid original or already solved)
                            if (!isMasked) {
                                r += data[ni];
                                g += data[ni + 1];
                                b += data[ni + 2];
                                count++;
                            }
                        }
                    }
                }

                if (count > 0) {
                    // Start filling
                    data[p.i] = r / count;
                    data[p.i + 1] = g / count;
                    data[p.i + 2] = b / count;
                    data[p.i + 3] = 255;

                    p.solved = true;
                    solvedThisPass.push(p);
                }
            }

            // Mark solved pixels as unmasked in the mask buffer so they contribute to next layer
            for (const sp of solvedThisPass) {
                mask[sp.i + 3] = 0; // Remove from mask
                remaining--;
            }

            if (solvedThisPass.length === 0) break; // Stuck (e.g. island), fallback needed
        }

        this.isProcessing = false;
        console.timeEnd("Inpaint");
        return imageData;
    }
}
