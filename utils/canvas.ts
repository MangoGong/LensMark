import { BannerStyle, ExifData, LogoDef, WatermarkElement, WatermarkSettings } from '../types';

const BANNER_HEIGHT_PERCENTAGE = 0.12;
const PADDING_PERCENTAGE = 0.35;
const SEPARATOR_CHAR = '|'; 

// --- COLOR ALGORITHMS ---
const getDominantColors = (img: HTMLImageElement, y: number, h: number): { dominant: string, secondary: string } => {
    const canvas = document.createElement('canvas');
    const w = 100; // Sample size
    canvas.width = w;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dominant: '#ffffff', secondary: '#000000' };

    ctx.drawImage(img, 0, y, img.naturalWidth, h, 0, 0, w, 10);
    const data = ctx.getImageData(0, 0, w, 10).data;

    const colorMap: Record<string, { count: number, r: number, g: number, b: number }> = {};
    const quantizationFactor = 32; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const key = `${Math.floor(r/quantizationFactor)},${Math.floor(g/quantizationFactor)},${Math.floor(b/quantizationFactor)}`;
        
        if (!colorMap[key]) {
            colorMap[key] = { count: 0, r: 0, g: 0, b: 0 };
        }
        colorMap[key].count++;
        colorMap[key].r += r;
        colorMap[key].g += g;
        colorMap[key].b += b;
    }

    const buckets = Object.values(colorMap).map(b => ({
        count: b.count,
        r: Math.round(b.r / b.count),
        g: Math.round(b.g / b.count),
        b: Math.round(b.b / b.count),
        hex: `rgb(${Math.round(b.r / b.count)}, ${Math.round(b.g / b.count)}, ${Math.round(b.b / b.count)})`
    }));

    buckets.sort((a, b) => b.count - a.count);

    if (buckets.length === 0) return { dominant: '#ffffff', secondary: '#000000' };

    const dominant = buckets[0];
    let secondary = buckets[0];
    for (let i = 1; i < buckets.length; i++) {
        const b = buckets[i];
        const dist = Math.sqrt(Math.pow(b.r - dominant.r, 2) + Math.pow(b.g - dominant.g, 2) + Math.pow(b.b - dominant.b, 2));
        if (dist > 60) {
            secondary = b;
            break;
        }
    }
    
    if (secondary === dominant) {
        const brightness = (dominant.r * 299 + dominant.g * 587 + dominant.b * 114) / 1000;
        secondary = brightness > 128 ? { r:0, g:0, b:0, count:0, hex:'#000000' } : { r:255, g:255, b:255, count:0, hex:'#ffffff' };
    }

    return { dominant: dominant.hex, secondary: secondary.hex };
};

const getBrightness = (rgbStr: string): number => {
  const match = rgbStr.match(/\d+/g);
  if (!match) return 255;
  const r = parseInt(match[0], 10);
  const g = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  return ((r * 299) + (g * 587) + (b * 114)) / 1000;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const generateWatermark = async (
  imageFile: File,
  exif: ExifData,
  settings: WatermarkSettings,
  logoKey: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const processingTimeout = setTimeout(() => {
        reject(new Error("Processing timeout."));
    }, 15000);

    const img = new Image();
    
    const cleanup = () => {
        clearTimeout(processingTimeout);
        URL.revokeObjectURL(img.src);
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        
        // --- FIX: Explicitly set canvas width to image width immediately ---
        canvas.width = w;
        canvas.height = h;

        // --- 1. PRE-CALCULATION PHASE (LAYOUT COLLISION DETECTION) ---
        
        const refSize = Math.min(w, h); 
        let bannerH = refSize * BANNER_HEIGHT_PERCENTAGE;
        let mainFontSize = Math.floor(bannerH * 0.24); 
        let subFontSize = Math.floor(bannerH * 0.20);
        let padding = bannerH * PADDING_PERCENTAGE;
        let logoH = bannerH * 0.38;
        
        // Prepare Logo
        let logoImgSrc = '';
        let isFallback = false;
        if (settings.selectedLogoKey === 'CUSTOM' && settings.customLogoSvg) {
             const blob = new Blob([settings.customLogoSvg], {type: 'image/svg+xml'});
             logoImgSrc = URL.createObjectURL(blob);
        } else {
             const filename = (settings.selectedLogoKey === 'AUTO' ? logoKey : settings.selectedLogoKey) || 'DEFAULT';
             const cleanName = filename.charAt(0).toUpperCase() + filename.slice(1).toLowerCase();
             logoImgSrc = `/logos/${cleanName}.svg`;
        }
        const lImg = new Image();

        // Continue rendering once logo is ready (or errored)
        const processRender = (logoFailed: boolean) => {
            // Determine Logo Width
            let logoW = logoH; 
            let logoRealH = logoH;
            if (!logoFailed && lImg.naturalWidth && lImg.naturalHeight) {
                const aspect = lImg.naturalWidth / lImg.naturalHeight;
                logoW = logoH * aspect;
                const maxLogoW = bannerH * 2.5;
                if (logoW > maxLogoW) {
                    const scale = maxLogoW / logoW;
                    logoW = maxLogoW;
                    logoRealH = logoH * scale;
                }
            }
            
            // Measure Text Blocks
            const elements = Object.values(settings.elements);
            const leftL1 = elements.filter(e => e.side === 'left' && e.line === 1).sort((a,b) => a.order - b.order);
            const leftL2 = elements.filter(e => e.side === 'left' && e.line === 2).sort((a,b) => a.order - b.order);
            const rightL1 = elements.filter(e => e.side === 'right' && e.line === 1).sort((a,b) => a.order - b.order);
            const rightL2 = elements.filter(e => e.side === 'right' && e.line === 2).sort((a,b) => a.order - b.order);

            const measureLine = (items: WatermarkElement[], fontSize: number, isBold: boolean) => {
                if (items.length === 0) return 0;
                ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
                let width = 0;
                const gap = ctx.measureText(SEPARATOR_CHAR).width * 2.5;
                items.filter(i => i.text).forEach((item, idx) => {
                    width += ctx.measureText(item.text).width;
                    if (idx < items.filter(i=>i.text).length - 1) width += gap;
                });
                return width;
            };

            const wL1 = measureLine(leftL1, mainFontSize, true);
            const wL2 = measureLine(leftL2, subFontSize, false);
            const wR1 = measureLine(rightL1, mainFontSize, true);
            const wR2 = measureLine(rightL2, subFontSize, false);

            let totalLeftW = Math.max(wL1, wL2);
            let totalRightW = Math.max(wR1, wR2);

            // Add logo space to Left or Right block width
            const logoSpace = logoW + (bannerH * 0.2); // width + gap
            if (settings.logoPosition === 'left') {
                totalLeftW += logoSpace;
                // Add separator space if there is text next to logo
                if (Math.max(wL1, wL2) > 0) totalLeftW += (ctx.measureText(SEPARATOR_CHAR).width * 2.5);
            } else if (settings.logoPosition === 'right') {
                totalRightW += logoSpace;
                if (Math.max(wR1, wR2) > 0) totalRightW += (ctx.measureText(SEPARATOR_CHAR).width * 2.5);
            }

            // Check for Overlap
            const totalContentWidth = totalLeftW + totalRightW + (padding * 2) + (bannerH * 0.5); // 0.5 bannerH as safety gap in middle
            
            if (totalContentWidth > w) {
                // Determine scale factor
                const scale = w / totalContentWidth;
                // Apply scale (clamp to reasonable min to avoid illegible text)
                const safeScale = Math.max(0.6, scale); 
                
                bannerH *= safeScale;
                mainFontSize *= safeScale;
                subFontSize *= safeScale;
                padding *= safeScale;
                logoH *= safeScale;
                
                // Recalculate Logo dims
                if (!logoFailed && lImg.naturalWidth) {
                     // Recalculate logic essentially same as scaling aspect
                     logoW *= safeScale; 
                     logoRealH *= safeScale;
                } else {
                     logoW *= safeScale;
                     logoRealH *= safeScale;
                }
            }

            // --- 2. DRAWING PHASE ---
            const totalH = h + bannerH;
            
            // Explicitly set width AND height to clear and size correctly for output
            canvas.width = w; 
            canvas.height = totalH; 
            
            // Redraw image because canvas clear/resize
            ctx.drawImage(img, 0, 0);

            const bannerY = h;
            let bgColor = '#ffffff';
            let textColor = '#000000';
            let secondaryTextColor = '#666666';
            let useShadow = false;

            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            if (settings.bannerStyle === BannerStyle.ADAPTIVE) {
              const colors = getDominantColors(img, h - (h * 0.15), h * 0.15);
              bgColor = colors.dominant;
              ctx.fillStyle = bgColor;
              
              if (settings.useAdaptiveTextColor) {
                  textColor = colors.secondary;
                  secondaryTextColor = colors.secondary;
                  useShadow = true;
              } else {
                  const brightness = getBrightness(bgColor);
                  if (brightness >= 128) {
                     textColor = '#000000';
                     secondaryTextColor = '#333333';
                  } else {
                     textColor = '#ffffff';
                     secondaryTextColor = '#dddddd';
                  }
                  useShadow = true; 
              }
            } else if (settings.bannerStyle === BannerStyle.BLACK) {
              bgColor = '#000000';
              ctx.fillStyle = bgColor;
              textColor = '#ffffff';
              secondaryTextColor = '#aaaaaa';
            } else if (settings.bannerStyle === BannerStyle.WHITE) {
              bgColor = '#ffffff';
              ctx.fillStyle = bgColor;
              textColor = '#000000';
              secondaryTextColor = '#666666';
            } else if (settings.bannerStyle === BannerStyle.BLUR) {
               ctx.filter = `blur(${settings.blurIntensity}px)`;
               const extension = settings.blurIntensity * 2; 
               
               // Safe source coordinates
               const sy = Math.max(0, h - bannerH);
               const sh = Math.min(bannerH, img.naturalHeight - sy);

               // Draw blur background
               // We draw strictly from 0 to w on the destination to ensure full width coverage
               // But we start drawing at -extension to allow blur filter to have edge pixels
               ctx.drawImage(
                   img, 
                   0, sy, w, sh, 
                   -extension, h - extension, w + (extension * 2), bannerH + (extension * 2) 
               );
               
               ctx.filter = 'none';
               useShadow = true;
               
               // Calculate text colors for blur
               const colors = getDominantColors(img, h - bannerH, bannerH);
               const brightness = getBrightness(colors.dominant);
               
               if (brightness >= 160) {
                  textColor = '#000000';
                  secondaryTextColor = '#222222';
               } else {
                  textColor = '#ffffff';
                  secondaryTextColor = '#eeeeee';
               }
            } else {
              ctx.fillStyle = '#ffffff';
            }

            if (settings.bannerStyle !== BannerStyle.BLUR) {
              ctx.fillRect(0, bannerY, w, bannerH);
            }

            const centerY = bannerY + (bannerH / 2);
            ctx.textBaseline = 'middle';

            const enableShadow = () => {
                 if (useShadow) {
                     const shadowBri = (textColor === '#ffffff') ? 0 : 255;
                     const opacity = 0.3;
                     ctx.shadowColor = `rgba(${shadowBri}, ${shadowBri}, ${shadowBri}, ${opacity})`;
                     ctx.shadowBlur = mainFontSize * 0.8;
                     ctx.shadowOffsetX = 0;
                     ctx.shadowOffsetY = 0;
                 } else {
                     ctx.shadowColor = 'transparent';
                 }
            };
            enableShadow();

            const logoItem = { type: 'logo' as const, content: 'logo', w: logoW, h: logoRealH };

            const gapY = bannerH * 0.08;
            const totalTextH = mainFontSize + gapY + subFontSize;
            const startY = centerY - (totalTextH / 2);
            const y1 = startY + (mainFontSize / 2); 
            const y2 = startY + mainFontSize + gapY + (subFontSize / 2);

            // Helper for 2x2 content check
            const hasL1 = leftL1.some(e=>e.text);
            const hasL2 = leftL2.some(e=>e.text);
            const hasR1 = rightL1.some(e=>e.text);
            const hasR2 = rightL2.some(e=>e.text);

            const drawSeqY = (x: number, y: number, dir: 'ltr'|'rtl', items: any[], isBoldLine: boolean) => {
                  const fontSize = isBoldLine ? mainFontSize : subFontSize;
                  const gap = ctx.measureText(SEPARATOR_CHAR).width * 2.5;
                  
                  // Separator Config: Bold if line 1, Normal/Smaller if line 2
                  const pipeFont = isBoldLine 
                        ? `bold ${mainFontSize}px Inter, sans-serif`
                        : `${subFontSize}px Inter, sans-serif`;

                  let cursor = x;
                  for (let i = 0; i < items.length; i++) {
                     const item = items[i];
                     const isLast = i === items.length - 1;
                     ctx.font = item.font;
                     const itemW = ctx.measureText(item.content).width;
                     const drawX = (dir === 'ltr') ? cursor : cursor - itemW;
                     ctx.textAlign = 'left';
                     ctx.fillStyle = item.color;
                     ctx.fillText(item.content, drawX, y);
                     
                     if (!isLast) {
                         if (dir==='ltr') {
                             cursor+=itemW;
                             const pipeX = cursor + (gap/2);
                             ctx.textAlign='center'; ctx.fillStyle=secondaryTextColor; ctx.font=pipeFont;
                             ctx.fillText(SEPARATOR_CHAR, pipeX, y);
                             cursor+=gap;
                         } else {
                             cursor-=itemW;
                             const pipeX = cursor - (gap/2);
                             ctx.textAlign='center'; ctx.fillStyle=secondaryTextColor; ctx.font=pipeFont;
                             ctx.fillText(SEPARATOR_CHAR, pipeX, y);
                             cursor-=gap;
                         }
                     } else {
                         if (dir==='ltr') cursor += itemW; else cursor -= itemW;
                     }
                  }
            };

            const drawLogoSequence = (x: number, dir: 'ltr'|'rtl') => {
                const drawX = (dir === 'ltr') ? x : x - logoW;
                if (logoFailed) {
                     ctx.fillStyle = textColor;
                     const r = Math.min(logoW, logoRealH) * 0.2;
                     roundRect(ctx, drawX, centerY - (logoRealH/2), logoW, logoRealH, r);
                     ctx.fill();
                } else {
                     if (textColor === '#ffffff' && !isFallback) {
                         ctx.filter = 'brightness(0) invert(1)'; 
                     }
                     ctx.drawImage(lImg, drawX, centerY - (logoRealH/2), logoW, logoRealH);
                     ctx.filter = 'none';
                }
                return logoW;
            };

             // --- DRAW LEFT ---
             let leftCursor = padding;
             if (settings.logoPosition === 'left') {
                 leftCursor += drawLogoSequence(leftCursor, 'ltr');
                 leftCursor += (bannerH * 0.2); 
                 if (hasL1 || hasL2) {
                     ctx.fillStyle = secondaryTextColor;
                     ctx.font = `bold ${mainFontSize}px Inter, sans-serif`;
                     ctx.textAlign = 'center';
                     ctx.fillText(SEPARATOR_CHAR, leftCursor, centerY);
                     leftCursor += ctx.measureText(SEPARATOR_CHAR).width * 2.5;
                 }
             }

             if (hasL1) {
                 const seq = leftL1.map(e => ({ content: e.text, font: `bold ${mainFontSize}px Inter, sans-serif`, color: textColor })).filter(e=>e.content);
                 drawSeqY(leftCursor, hasL2 ? y1 : centerY, 'ltr', seq, true);
             }
             if (hasL2) {
                 const seq = leftL2.map(e => ({ content: e.text, font: `${subFontSize}px Inter, sans-serif`, color: secondaryTextColor })).filter(e=>e.content);
                 drawSeqY(leftCursor, hasL1 ? y2 : centerY, 'ltr', seq, false);
             }

             // --- DRAW RIGHT ---
             let rightCursor = w - padding;
             
             if (settings.logoPosition === 'right') {
                 // Calculate Text Block Widths first to offset Logo
                 let maxTextW = 0;
                 const gap = ctx.measureText(SEPARATOR_CHAR).width * 2.5;
                 
                 if (hasR1) {
                     const seq = rightL1.map(e => ({ text: e.text, font: `bold ${mainFontSize}px Inter, sans-serif` })).filter(e=>e.text);
                     let w = 0; 
                     seq.forEach((item, idx) => {
                         ctx.font = item.font; w += ctx.measureText(item.text).width;
                         if (idx < seq.length -1) w += gap;
                     });
                     if (w > maxTextW) maxTextW = w;
                 }
                 if (hasR2) {
                     const seq = rightL2.map(e => ({ text: e.text, font: `${subFontSize}px Inter, sans-serif` })).filter(e=>e.text);
                     let w = 0;
                     seq.forEach((item, idx) => {
                         ctx.font = item.font; w += ctx.measureText(item.text).width;
                         if (idx < seq.length -1) w += gap;
                     });
                     if (w > maxTextW) maxTextW = w;
                 }

                 if (hasR1) {
                     const seq = rightL1.map(e => ({ content: e.text, font: `bold ${mainFontSize}px Inter, sans-serif`, color: textColor })).filter(e=>e.content);
                     drawSeqY(rightCursor, hasR2 ? y1 : centerY, 'rtl', seq, true);
                 }
                 if (hasR2) {
                     const seq = rightL2.map(e => ({ content: e.text, font: `${subFontSize}px Inter, sans-serif`, color: secondaryTextColor })).filter(e=>e.content);
                     drawSeqY(rightCursor, hasR1 ? y2 : centerY, 'rtl', seq, false);
                 }
                 
                 if (hasR1 || hasR2) {
                     rightCursor -= maxTextW;
                     ctx.fillStyle = secondaryTextColor;
                     ctx.font = `bold ${mainFontSize}px Inter, sans-serif`;
                     ctx.textAlign = 'center';
                     ctx.fillText(SEPARATOR_CHAR, rightCursor - (ctx.measureText(SEPARATOR_CHAR).width * 2.5)/2, centerY);
                     rightCursor -= ctx.measureText(SEPARATOR_CHAR).width * 2.5;
                 }
                 
                 drawLogoSequence(rightCursor, 'rtl');
             } else {
                 // No Logo on right
                 if (hasR1) {
                     const seq = rightL1.map(e => ({ content: e.text, font: `bold ${mainFontSize}px Inter, sans-serif`, color: textColor })).filter(e=>e.content);
                     drawSeqY(rightCursor, hasR2 ? y1 : centerY, 'rtl', seq, true);
                 }
                 if (hasR2) {
                     const seq = rightL2.map(e => ({ content: e.text, font: `${subFontSize}px Inter, sans-serif`, color: secondaryTextColor })).filter(e=>e.content);
                     drawSeqY(rightCursor, hasR1 ? y2 : centerY, 'rtl', seq, false);
                 }
             }

             cleanup();
             resolve(canvas.toDataURL('image/jpeg', 0.95));
        };

        lImg.onload = () => processRender(false);
        lImg.onerror = () => processRender(true);
        lImg.src = logoImgSrc;

      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    img.onerror = () => {
        cleanup();
        reject(new Error("Image load error"));
    };
    img.src = URL.createObjectURL(imageFile);
  });
};