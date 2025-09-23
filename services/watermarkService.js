// Import dependencies with error handling
let sharp, Jimp, PDFDocument, StandardFonts, rgb, ffmpeg, archiver, yauzl, libreofficeConvert, unzipper, nodeUnrar, psd, sevenZip, THREE;

try {
    sharp = (await import('sharp')).default;
} catch (error) {
    console.warn('Sharp not available - image processing will use fallback methods');
}

try {
    Jimp = (await import('jimp')).default;
} catch (error) {
    console.warn('Jimp not available - image processing may be limited');
}

try {
    const pdfLib = await import('pdf-lib');
    PDFDocument = pdfLib.PDFDocument;
    StandardFonts = pdfLib.StandardFonts;
    rgb = pdfLib.rgb;
} catch (error) {
    console.warn('pdf-lib not available - PDF watermarking will use fallback');
}

try {
    ffmpeg = (await import('fluent-ffmpeg')).default;
} catch (error) {
    console.warn('fluent-ffmpeg not available - video/audio processing will use fallback');
}

try {
    archiver = (await import('archiver')).default;
} catch (error) {
    console.warn('archiver not available - archive processing will use basic fallback');
}

try {
    yauzl = await import('yauzl');
} catch (error) {
    console.warn('yauzl not available - archive extraction will use basic fallback');
}

try {
    // Import libreoffice-convert using CommonJS require for compatibility
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const libreModule = require('libreoffice-convert');
    
    // The module exports an object with a default function
    if (libreModule && libreModule.default && typeof libreModule.default === 'function') {
        libreofficeConvert = libreModule.default;
    } else if (typeof libreModule === 'function') {
        libreofficeConvert = libreModule;
    } else {
        // Fallback: assume it's an object wrapper
        libreofficeConvert = (inputBuffer, outputFormat, options, callback) => {
            if (libreModule && typeof libreModule.convert === 'function') {
                return libreModule.convert(inputBuffer, outputFormat, options, callback);
            } else {
                callback(new Error('LibreOffice convert function not found'));
            }
        };
    }
    
    console.log('✅ LibreOffice loaded, type:', typeof libreofficeConvert);
} catch (error) {
    console.warn('❌ libreoffice-convert not available:', error.message);
}

try {
    unzipper = await import('unzipper');
} catch (error) {
    console.warn('unzipper not available - ZIP extraction will use basic fallback');
}

try {
    nodeUnrar = await import('node-unrar-js');
} catch (error) {
    console.warn('node-unrar-js not available - RAR extraction will use basic fallback');
}

try {
    // Import PSD library using CommonJS require for compatibility
    const { createRequire } = await import('module');
    const requireFunc = createRequire(import.meta.url);
    const PSD = requireFunc('psd');
    
    // Store both the module and require function
    psd = PSD;
    global.psdRequire = requireFunc;
    global.PSDModule = PSD;
    
    console.log('✅ PSD loaded, type:', typeof psd);
} catch (error) {
    console.warn('❌ psd not available:', error.message);
}

try {
    sevenZip = await import('seven-zip');
} catch (error) {
    console.warn('seven-zip not available - 7z extraction will use basic fallback');
}

try {
    THREE = await import('three');
} catch (error) {
    console.warn('three.js not available - 3D model processing will use basic fallback');
}

import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
// import sharp from 'sharp';
import jimp from 'jimp';
// import { PDFDocument, rgb } from 'pdf-lib';
// import ffmpeg from 'fluent-ffmpeg';
import { createWriteStream, createReadStream } from 'fs';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WatermarkService {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.watermarkMainText = 'NAIRALANCERS PREVIEW';
        this.watermarkSubtext = 'PURCHASE TO ACCESS FULL FILE';
        this.ensureTempDir();
    }

    async ensureTempDir() {
        try {
            await fs.promises.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            console.error('Error creating temp directory:', error);
        }
    }

    // Main method to process file based on type with error handling
    async processFile(fileBuffer, fileName, fileType) {
        try {
            console.log(`Processing file: ${fileName} (${fileType}) - ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            
            const fileExtension = fileName.split('.').pop().toLowerCase();
            
            // Determine processing method based on file type
            if (this.isImageFile(fileType, fileExtension)) {
                return await this.watermarkImage(fileBuffer, fileName, fileType);
            } else if (this.isPDFFile(fileType)) {
                return await this.watermarkPDF(fileBuffer, fileName);
            } else if (this.isVideoFile(fileType, fileExtension)) {
                return await this.watermarkVideo(fileBuffer, fileName, fileType);
            } else if (this.isAudioFile(fileType, fileExtension)) {
                return await this.watermarkAudio(fileBuffer, fileName, fileType);
            } else if (this.isTextFile(fileType, fileExtension)) {
                return await this.watermarkTextFile(fileBuffer, fileName);
            } else if (this.isCodeFile(fileExtension)) {
                return await this.previewCodeFile(fileBuffer, fileName);
            } else if (this.isDocumentFile(fileType, fileExtension)) {
                return await this.processDocument(fileBuffer, fileName, fileType);
            } else if (this.isArchiveFile(fileType, fileExtension)) {
                return await this.processArchive(fileBuffer, fileName, fileType);
            } else if (this.isDesignFile(fileType, fileExtension)) {
                return await this.processDesignFile(fileBuffer, fileName, fileType);
            } else if (this.is3DModelFile(fileType, fileExtension)) {
                return await this.process3DModel(fileBuffer, fileName, fileType);
            } else {
                // For unknown file types, create a preview info file
                return await this.createGenericPreview(fileBuffer, fileName, fileType);
            }
        } catch (error) {
            console.error(`Critical error processing ${fileName}:`, error);
            
            // Emergency fallback - always return a preview, never fail completely
            try {
                return await this.createEmergencyFallbackPreview(fileBuffer, fileName, fileType, error);
            } catch (fallbackError) {
                console.error('Even emergency fallback failed:', fallbackError);
                throw new Error(`Complete processing failure for ${fileName}: ${error.message}`);
            }
        }
    }

    // Emergency fallback when all processing fails
    async createEmergencyFallbackPreview(fileBuffer, fileName, fileType, originalError) {
        const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

PROCESSING ERROR: File processing encountered an unexpected error.
ERROR DETAILS: ${originalError?.message || 'Unknown error'}

This file requires specialized processing that is currently unavailable.
The file has been safely stored and will be accessible after purchase.

Contact support if you believe this is a system error.

═══════════════════════════════════════════════════════════════
`;

        return {
            buffer: Buffer.from(previewText, 'utf8'),
            fileName: `preview_${path.parse(fileName).name}.txt`,
            fileType: 'text/plain',
            isWatermarked: true,
            processingError: true,
            originalError: originalError?.message
        };
    }

    // Image watermarking using Sharp (with fallback)
    async watermarkImage(fileBuffer, fileName, fileType) {
        // Try Sharp first
        if (sharp) {
            try {
                const image = sharp(fileBuffer);
                const metadata = await image.metadata();
                
                // Create watermark overlay
                const watermarkWidth = Math.min(metadata.width * 0.8, 600);
                const watermarkHeight = 100;
                
                const watermark = Buffer.from(`
                    <svg width="${watermarkWidth}" height="${watermarkHeight}">
                        <rect width="100%" height="100%" fill="rgba(255,255,255,0.7)"/>
                        <text x="50%" y="35%" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="rgba(255,0,0,0.8)">
                            ${this.watermarkMainText}
                        </text>
                        <text x="50%" y="70%" text-anchor="middle" font-family="Arial" font-size="14" fill="rgba(0,0,0,0.8)">
                            ${this.watermarkSubtext}
                        </text>
                    </svg>
                `);

                // Apply watermark and reduce quality
                const watermarkedBuffer = await image
                    .resize({ width: Math.min(metadata.width, 1200), withoutEnlargement: true })
                    .composite([{
                        input: watermark,
                        gravity: 'center'
                    }])
                    .jpeg({ quality: 60 })
                    .toBuffer();

                return {
                    buffer: watermarkedBuffer,
                    fileName: `preview_${fileName}`,
                    fileType: 'image/jpeg',
                    isWatermarked: true
                };
            } catch (sharpError) {
                console.warn('Sharp processing failed, trying Jimp fallback:', sharpError);
            }
        }

        // Try Jimp fallback
        if (Jimp) {
            try {
                const image = await Jimp.read(fileBuffer);
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                
                // Add watermark text
                image.print(font, 50, 50, this.watermarkText, image.bitmap.width - 100);
                image.print(font, 50, image.bitmap.height - 100, this.watermarkSubtext, image.bitmap.width - 100);
                
                // Resize and reduce quality
                image.resize(Math.min(image.bitmap.width, 1200), Jimp.AUTO);
                image.quality(60);
                
                const watermarkedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
                
                return {
                    buffer: watermarkedBuffer,
                    fileName: `preview_${fileName}`,
                    fileType: 'image/jpeg',
                    isWatermarked: true
                };
            } catch (jimpError) {
                console.warn('Jimp processing failed, using text fallback:', jimpError);
            }
        }

        // Fallback to text preview if no image processing libraries available
        return await this.createImageFallbackPreview(fileBuffer, fileName, fileType);
    }

    // Fallback for image processing when libraries aren't available
    async createImageFallbackPreview(fileBuffer, fileName, fileType) {
        const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

IMAGE FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This is an image file that requires image processing libraries
for proper preview generation. The original image contains
visual content that cannot be displayed in this text format.

Image processing libraries (Sharp/Jimp) are not available.
Complete your purchase to access the full image file.

═══════════════════════════════════════════════════════════════
`;

        return {
            buffer: Buffer.from(previewText, 'utf8'),
            fileName: `preview_${path.parse(fileName).name}.txt`,
            fileType: 'text/plain',
            isWatermarked: true
        };
    }

    // PDF watermarking using pdf-lib (with fallback)
    async watermarkPDF(fileBuffer, fileName) {
        if (PDFDocument && StandardFonts && rgb) {
            try {
                const pdfDoc = await PDFDocument.load(fileBuffer);
                const pages = pdfDoc.getPages();
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

                // Add watermark to each page
                for (const page of pages) {
                    const { width, height } = page.getSize();
                    
                    page.drawText(this.watermarkMainText, {
                        x: width / 2 - 100,
                        y: height / 2,
                        size: 30,
                        font: font,
                        color: rgb(1, 0, 0),
                        opacity: 0.5,
                    });
                    
                    page.drawText(this.watermarkSubtext, {
                        x: width / 2 - 150,
                        y: height / 2 - 40,
                        size: 16,
                        font: font,
                        color: rgb(0, 0, 0),
                        opacity: 0.7,
                    });
                }

                const watermarkedBuffer = await pdfDoc.save();
                
                return {
                    buffer: Buffer.from(watermarkedBuffer),
                    fileName: `preview_${fileName}`,
                    fileType: 'application/pdf',
                    isWatermarked: true
                };
            } catch (pdfError) {
                console.warn('PDF processing failed, using text fallback:', pdfError);
            }
        }

        // Fallback to text preview if pdf-lib is not available
        return await this.createPDFFallbackPreview(fileBuffer, fileName);
    }

    // Fallback for PDF processing when pdf-lib isn't available
    async createPDFFallbackPreview(fileBuffer, fileName) {
        const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

PDF DOCUMENT: ${fileName}
TYPE: application/pdf
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This is a PDF document that requires pdf-lib for proper preview
generation. The original PDF contains formatted content, images,
and text that cannot be displayed in this text format.

PDF processing library (pdf-lib) is not available.
Complete your purchase to access the full PDF document.

═══════════════════════════════════════════════════════════════
`;

        return {
            buffer: Buffer.from(previewText, 'utf8'),
            fileName: `preview_${path.parse(fileName).name}.txt`,
            fileType: 'text/plain',
            isWatermarked: true
        };
    }

    // Video watermarking using ffmpeg (with fallback)
    async watermarkVideo(fileBuffer, fileName, fileType) {
        if (!ffmpeg) {
            console.warn('ffmpeg not available, using text fallback for video');
            return await this.createVideoFallbackPreview(fileBuffer, fileName, fileType);
        }

        return new Promise(async (resolve, reject) => {
            try {
                const tempInputPath = path.join(this.tempDir, `temp_${Date.now()}_${fileName}`);
                const tempOutputPath = path.join(this.tempDir, `preview_${Date.now()}_${fileName}`);

                // Write buffer to temp file
                await fs.writeFile(tempInputPath, fileBuffer);

                ffmpeg(tempInputPath)
                    .videoFilters([
                        'drawtext=text=\'NAIRALANCERS PREVIEW\':fontsize=24:fontcolor=red@0.8:x=(w-text_w)/2:y=50',
                        'drawtext=text=\'PURCHASE TO ACCESS FULL FILE\':fontsize=14:fontcolor=white@0.8:x=(w-text_w)/2:y=h-50'
                    ])
                    .outputOptions([
                        '-crf 28', // Reduce quality
                        '-preset fast',
                        '-t 30' // Limit to 30 seconds for preview
                    ])
                    .output(tempOutputPath)
                    .on('end', async () => {
                        try {
                            const watermarkedBuffer = await fs.readFile(tempOutputPath);
                            
                            // Cleanup temp files
                            await Promise.all([
                                fs.unlink(tempInputPath).catch(() => {}),
                                fs.unlink(tempOutputPath).catch(() => {})
                            ]);

                            resolve({
                                buffer: watermarkedBuffer,
                                fileName: `preview_${fileName}`,
                                fileType: 'video/mp4',
                                isWatermarked: true
                            });
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .on('error', async (error) => {
                        console.warn('FFmpeg video processing failed, using fallback:', error);
                        // Cleanup on error
                        await Promise.all([
                            fs.unlink(tempInputPath).catch(() => {}),
                            fs.unlink(tempOutputPath).catch(() => {})
                        ]);
                        
                        // Use fallback preview
                        const fallbackResult = await this.createVideoFallbackPreview(fileBuffer, fileName, fileType);
                        resolve(fallbackResult);
                    })
                    .run();
            } catch (error) {
                console.warn('Video processing setup failed, using fallback:', error);
                const fallbackResult = await this.createVideoFallbackPreview(fileBuffer, fileName, fileType);
                resolve(fallbackResult);
            }
        });
    }

    // Fallback for video processing when ffmpeg isn't available
    async createVideoFallbackPreview(fileBuffer, fileName, fileType) {
        const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

VIDEO FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This is a video file that requires FFmpeg for proper preview
generation. The original video contains visual and audio content
that cannot be displayed in this text format.

Video processing library (FFmpeg) is not available.
Complete your purchase to access the full video file.

Note: Video previews typically show a 30-second watermarked
segment with reduced quality when processing is available.

═══════════════════════════════════════════════════════════════
`;

        return {
            buffer: Buffer.from(previewText, 'utf8'),
            fileName: `preview_${path.parse(fileName).name}.txt`,
            fileType: 'text/plain',
            isWatermarked: true
        };
    }

    // Audio watermarking using ffmpeg (with fallback)
    async watermarkAudio(fileBuffer, fileName, fileType) {
        if (!ffmpeg) {
            console.warn('ffmpeg not available, using text fallback for audio');
            return await this.createAudioFallbackPreview(fileBuffer, fileName, fileType);
        }

        return new Promise(async (resolve, reject) => {
            try {
                const tempInputPath = path.join(this.tempDir, `temp_${Date.now()}_${fileName}`);
                const tempOutputPath = path.join(this.tempDir, `preview_${Date.now()}_${path.parse(fileName).name}.mp3`);

                // Write buffer to temp file
                await fs.writeFile(tempInputPath, fileBuffer);

                // Create a simple beep tone for watermarking
                ffmpeg()
                    .input(tempInputPath)
                    .inputOptions(['-ss 0', '-t 60']) // Limit to 60 seconds
                    .audioFilters([
                        'volume=0.7', // Reduce volume
                        'aresample=22050' // Reduce sample rate
                    ])
                    .audioBitrate('96k') // Reduce bitrate
                    .output(tempOutputPath)
                    .on('end', async () => {
                        try {
                            const watermarkedBuffer = await fs.readFile(tempOutputPath);
                            
                            // Cleanup temp files
                            await Promise.all([
                                fs.unlink(tempInputPath).catch(() => {}),
                                fs.unlink(tempOutputPath).catch(() => {})
                            ]);

                            resolve({
                                buffer: watermarkedBuffer,
                                fileName: `preview_${path.parse(fileName).name}.mp3`,
                                fileType: 'audio/mpeg',
                                isWatermarked: true
                            });
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .on('error', async (error) => {
                        console.warn('FFmpeg audio processing failed, using fallback:', error);
                        // Cleanup on error
                        await Promise.all([
                            fs.unlink(tempInputPath).catch(() => {}),
                            fs.unlink(tempOutputPath).catch(() => {})
                        ]);
                        
                        // Use fallback preview
                        const fallbackResult = await this.createAudioFallbackPreview(fileBuffer, fileName, fileType);
                        resolve(fallbackResult);
                    })
                    .run();
            } catch (error) {
                console.warn('Audio processing setup failed, using fallback:', error);
                const fallbackResult = await this.createAudioFallbackPreview(fileBuffer, fileName, fileType);
                resolve(fallbackResult);
            }
        });
    }

    // Fallback for audio processing when ffmpeg isn't available
    async createAudioFallbackPreview(fileBuffer, fileName, fileType) {
        const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

AUDIO FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This is an audio file that requires FFmpeg for proper preview
generation. The original audio contains sound content that cannot
be reproduced in this text format.

Audio processing library (FFmpeg) is not available.
Complete your purchase to access the full audio file.

Note: Audio previews typically provide a 60-second segment with
reduced quality and sample rate when processing is available.

═══════════════════════════════════════════════════════════════
`;

        return {
            buffer: Buffer.from(previewText, 'utf8'),
            fileName: `preview_${path.parse(fileName).name}.txt`,
            fileType: 'text/plain',
            isWatermarked: true
        };
    }

    // Text file watermarking
    async watermarkTextFile(fileBuffer, fileName) {
        try {
            const originalText = fileBuffer.toString('utf8');
            const watermarkHeader = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

ORIGINAL FILE: ${fileName}
PREVIEW GENERATED: ${new Date().toISOString()}

This is a preview of the original file. Purchase to access the full content.

═══════════════════════════════════════════════════════════════

`;
            
            const previewText = watermarkHeader + originalText;
            const watermarkedBuffer = Buffer.from(previewText, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${fileName}`,
                fileType: 'text/plain',
                isWatermarked: true
            };
        } catch (error) {
            console.error('Error watermarking text file:', error);
            throw error;
        }
    }

    // Code file preview (first 50 lines)
    async previewCodeFile(fileBuffer, fileName) {
        try {
            const originalCode = fileBuffer.toString('utf8');
            const lines = originalCode.split('\n');
            const previewLines = lines.slice(0, 50);
            
            const watermarkHeader = `/*
 * ═══════════════════════════════════════════════════════════════
 *                    ${this.watermarkMainText}
 *                ${this.watermarkSubtext}
 * ═══════════════════════════════════════════════════════════════
 * 
 * ORIGINAL FILE: ${fileName}
 * TOTAL LINES: ${lines.length}
 * PREVIEW LINES: ${Math.min(50, lines.length)}
 * 
 * This preview shows only the first 50 lines of the original file.
 * Purchase to access the complete source code.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

`;
            
            let previewCode = watermarkHeader + previewLines.join('\n');
            if (lines.length > 50) {
                previewCode += '\n\n/* ... PREVIEW TRUNCATED - PURCHASE TO SEE REMAINING ' + (lines.length - 50) + ' LINES ... */';
            }

            const watermarkedBuffer = Buffer.from(previewCode, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${fileName}`,
                fileType: 'text/plain',
                isWatermarked: true
            };
        } catch (error) {
            console.error('Error creating code preview:', error);
            throw error;
        }
    }

    // Document processing (DOCX, PPTX, XLSX) - convert to PDF then watermark
    async processDocument(fileBuffer, fileName, fileType) {
        try {
            // Try LibreOffice conversion first
            console.log('LibreOffice available:', !!libreofficeConvert, 'Type:', typeof libreofficeConvert);
            
            if (libreofficeConvert && typeof libreofficeConvert === 'function') {
                try {
                    console.log(`🔄 Converting ${fileName} (${fileType}) to PDF using LibreOffice...`);
                    console.log(`Input buffer size: ${fileBuffer.length} bytes`);
                    
                    // Validate input buffer
                    if (!fileBuffer || fileBuffer.length === 0) {
                        throw new Error('Empty or invalid document buffer');
                    }
                    
                    // Write to temp file first (LibreOffice works better with files)
                    const fileExt = path.extname(fileName) || '.docx';
                    const tempInputPath = path.join(os.tmpdir(), `temp_input_${Date.now()}${fileExt}`);
                    const tempOutputPath = path.join(os.tmpdir(), `temp_output_${Date.now()}.pdf`);
                    
                    await fs.promises.writeFile(tempInputPath, fileBuffer);
                    console.log(`Temp file written: ${tempInputPath}`);
                    
                    // Check for LibreOffice in common Windows paths
                    const { spawn } = await import('child_process');
                    let libreOfficePath = 'soffice';
                    
                    const commonPaths = [
                        // Environment override
                        process.env.LIBREOFFICE_PATH,
                        // Typical Windows installations
                        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                        'C:\\Program Files\\LibreOffice\\program\\soffice.com',
                        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
                        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
                        // Fallback to PATH
                        'soffice',
                        'soffice.com'
                    ].filter(Boolean);
                    
                    let foundPath = null;
                    for (const testPath of commonPaths) {
                        try {
                            console.log(`Testing LibreOffice path: ${testPath}`);
                            const checkResult = await new Promise((resolve, reject) => {
                                const proc = spawn(testPath, ['--version'], { 
                                    timeout: 5000,
                                    windowsHide: true
                                });
                                let output = '';
                                proc.stdout.on('data', (data) => output += data.toString());
                                proc.on('close', (code) => {
                                    if (code === 0) {
                                        resolve(output);
                                    } else {
                                        reject(new Error(`Exit code ${code}`));
                                    }
                                });
                                proc.on('error', reject);
                            });
                            
                            console.log(`✅ Found LibreOffice at: ${testPath}`);
                            console.log('Version:', checkResult.trim());
                            foundPath = testPath;
                            libreOfficePath = testPath;
                            break;
                            
                        } catch (error) {
                            console.log(`❌ Not found at ${testPath}:`, error.message);
                        }
                    }
                    
                    if (!foundPath) {
                        throw new Error('LibreOffice not found in any common installation paths');
                    }
                    
                    // Ensure discovered soffice directory is on PATH and set env hints for library
                    try {
                        const sofficeDir = path.dirname(libreOfficePath);
                        if (process.env.PATH && !process.env.PATH.includes(sofficeDir)) {
                            process.env.PATH = `${sofficeDir};${process.env.PATH}`;
                        }
                        process.env.LIBREOFFICE_PATH = libreOfficePath;
                        process.env.SOFFICE_BIN = libreOfficePath;
                    } catch {}

                    // First: try CLI conversion via soffice (preferred)
                    let pdfBuffer = null;
                    try {
                        const outDir = os.tmpdir();
                        const baseName = path.parse(tempInputPath).name;
                        const expectedPdf = path.join(outDir, `${baseName}.pdf`);
                        const args = [
                            '--headless', '--norestore', '--invisible', '--nodefault',
                            '--convert-to', 'pdf', '--outdir', outDir, tempInputPath
                        ];
                        console.log('Running soffice CLI conversion...');
                        await new Promise((resolve, reject) => {
                            const proc = spawn(libreOfficePath, args, { windowsHide: true });
                            let stderr = '';
                            proc.stderr.on('data', d => stderr += d.toString());
                            proc.on('close', (code) => {
                                if (code === 0) resolve(null);
                                else reject(new Error(`soffice exited ${code}: ${stderr}`));
                            });
                            proc.on('error', reject);
                        });
                        // Read the produced PDF
                        pdfBuffer = await fs.promises.readFile(expectedPdf);
                        // Cleanup produced file
                        try { await fs.promises.unlink(expectedPdf); } catch {}
                        console.log('✅ CLI conversion produced PDF, size:', pdfBuffer.length);
                    } catch (cliErr) {
                        console.log('❌ CLI conversion failed:', cliErr.message);
                    }

                    // Fallback: use libreoffice-convert module if CLI failed
                    if (!pdfBuffer) {
                        pdfBuffer = await new Promise((resolve, reject) => {
                            console.log('Calling LibreOffice (module) with buffer size:', fileBuffer.length);
                            console.log('Buffer starts with:', fileBuffer.subarray(0, 20).toString('hex'));
                            
                            libreofficeConvert(fileBuffer, '.pdf', undefined, (err, result) => {
                                if (err) {
                                    console.log('❌ LibreOffice conversion error (module):', err.message || err);
                                    reject(err);
                                } else {
                                    console.log('✅ LibreOffice (module) conversion successful, PDF size:', result?.length || 0);
                                    resolve(result);
                                }
                            });
                        }).catch(() => null);
                    }
                    
                    // Clean up temp files
                    try {
                        await fs.promises.unlink(tempInputPath);
                        if (fs.existsSync(tempOutputPath)) {
                            await fs.promises.unlink(tempOutputPath);
                        }
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                    
                    if (pdfBuffer && pdfBuffer.length > 0) {
                        console.log(`Successfully converted ${fileName} to PDF, now watermarking...`);
                        return await this.watermarkPDF(pdfBuffer, `${path.parse(fileName).name}.pdf`);
                    }
                } catch (libreofficeError) {
                    const errorMessage = libreofficeError.message || libreofficeError;
                    console.warn('LibreOffice conversion failed:', errorMessage);
                    
                    // Check if it's a missing binary error
                    if (errorMessage.includes('Could not find soffice binary')) {
                        console.log('💡 LibreOffice not installed. Install LibreOffice to enable Office document conversion.');
                    }
                }
            }
            
            // Fallback to text preview if LibreOffice is not available
            const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

DOCUMENT FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This Microsoft Office document contains formatted content, images,
charts, and other elements that require proper conversion for preview.

LIBREOFFICE STATUS: ${libreofficeConvert ? 'Library Available (requires LibreOffice installation)' : 'Library Not Available'}

Document Types Supported for Full Conversion:
• DOCX/DOC - Word documents
• XLSX/XLS - Excel spreadsheets  
• PPTX/PPT - PowerPoint presentations
• ODT, ODS, ODP - OpenOffice documents

The full document with all formatting, images, and content
is available after purchase.

═══════════════════════════════════════════════════════════════
`;

            const watermarkedBuffer = Buffer.from(previewText, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${path.parse(fileName).name}.txt`,
                fileType: 'text/plain',
                isWatermarked: true,
                conversionFailed: !libreofficeConvert
            };
        } catch (error) {
            console.error('Error processing document:', error);
            throw error;
        }
    }

    // Archive processing (ZIP, RAR, TAR, 7z) - extract and preview contents
    async processArchive(fileBuffer, fileName, fileType) {
        try {
            const fileExtension = fileName.split('.').pop().toLowerCase();
            let archiveContents = [];
            let extractionMethod = 'none';
            
            // Try to extract archive contents for preview
            try {
                if (fileExtension === 'zip' && unzipper) {
                    extractionMethod = 'unzipper';
                    archiveContents = await this.extractZipContents(fileBuffer);
                } else if (fileExtension === 'rar' && nodeUnrar) {
                    extractionMethod = 'node-unrar-js';
                    archiveContents = await this.extractRarContents(fileBuffer, fileName);
                } else if (['7z', 'tar', 'gz'].includes(fileExtension) && sevenZip) {
                    extractionMethod = 'seven-zip';
                    archiveContents = await this.extractSevenZipContents(fileBuffer, fileName);
                }
            } catch (extractError) {
                console.warn(`Archive extraction failed for ${fileName}:`, extractError);
                extractionMethod = 'failed';
            }
            
            // Create preview text with contents if available
            let contentsText = '';
            if (archiveContents.length > 0) {
                contentsText = `\nArchive Contents (${archiveContents.length} items):\n`;
                archiveContents.slice(0, 20).forEach((item, index) => {
                    const size = item.size ? ` (${(item.size / 1024).toFixed(1)}KB)` : '';
                    contentsText += `${index + 1}. ${item.name}${size}\n`;
                });
                if (archiveContents.length > 20) {
                    contentsText += `... and ${archiveContents.length - 20} more files\n`;
                }
            } else {
                contentsText = `\nArchive Contents: [Protected - Available after purchase]\n`;
            }
            
            const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

ARCHIVE FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB
EXTRACTION METHOD: ${extractionMethod}
${contentsText}
Supported Archive Types:
• ZIP - Using unzipper library
• RAR - Using node-unrar-js library  
• 7Z/TAR/GZ - Using seven-zip library
• Other formats - Basic preview only

Full extraction and individual file access available after purchase.
Image files within archives can be previewed when extraction is successful.

═══════════════════════════════════════════════════════════════
`;

            const watermarkedBuffer = Buffer.from(previewText, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${path.parse(fileName).name}.txt`,
                fileType: 'text/plain',
                isWatermarked: true,
                archiveContents: archiveContents.length,
                extractionMethod
            };
        } catch (error) {
            console.error('Error processing archive:', error);
            throw error;
        }
    }
    
    // Extract ZIP contents using unzipper
    async extractZipContents(fileBuffer) {
        if (!unzipper) return [];
        
        try {
            const contents = [];
            const directory = await unzipper.Open.buffer(fileBuffer);
            
            for (const file of directory.files) {
                if (!file.path.endsWith('/')) { // Skip directories
                    contents.push({
                        name: file.path,
                        size: file.uncompressedSize,
                        type: 'file'
                    });
                }
            }
            
            return contents;
        } catch (error) {
            console.warn('ZIP extraction failed:', error);
            return [];
        }
    }
    
    // Extract RAR contents using node-unrar-js
    async extractRarContents(fileBuffer, fileName) {
        if (!nodeUnrar) return [];
        
        try {
            // Write buffer to temporary file for RAR extraction
            const tempPath = path.join(this.tempDir, `temp_${Date.now()}_${fileName}`);
            await fs.writeFile(tempPath, fileBuffer);
            
            const extractor = await nodeUnrar.createExtractorFromFile({
                filepath: tempPath,
                targetPath: path.join(this.tempDir, `extracted_${Date.now()}`)
            });
            
            const list = extractor.getFileList();
            const contents = [];
            
            for (const file of list.files) {
                if (file.fileHeader && !file.fileHeader.flags.directory) {
                    contents.push({
                        name: file.fileHeader.name,
                        size: file.fileHeader.unpSize,
                        type: 'file'
                    });
                }
            }
            
            // Clean up temp file
            await fs.unlink(tempPath).catch(() => {});
            
            return contents;
        } catch (error) {
            console.warn('RAR extraction failed:', error);
            return [];
        }
    }
    
    // Extract 7z/TAR/GZ contents using seven-zip
    async extractSevenZipContents(fileBuffer, fileName) {
        if (!sevenZip) return [];
        
        try {
            // This is a placeholder - seven-zip library integration would go here
            // For now, return basic info
            return [{
                name: 'Archive contents available after extraction setup',
                size: fileBuffer.length,
                type: 'info'
            }];
        } catch (error) {
            console.warn('7-Zip extraction failed:', error);
            return [];
        }
    }

    // Design file processing (PSD, AI, Sketch, EPS, XD) - convert to PNG/JPG
    async processDesignFile(fileBuffer, fileName, fileType) {
        try {
            const fileExtension = fileName.split('.').pop().toLowerCase();
            let conversionAttempted = false;
            let conversionResult = null;
            
            // Try to convert design files to images
            if (fileExtension === 'psd' && psd) {
                try {
                    conversionAttempted = true;
                    console.log(`Converting PSD file ${fileName} to PNG...`);
                    conversionResult = await this.convertPsdToImage(fileBuffer, fileName);
                    
                    if (conversionResult) {
                        // Watermark the converted image
                        return await this.watermarkImage(
                            conversionResult.buffer, 
                            `${path.parse(fileName).name}.png`, 
                            'image/png'
                        );
                    }
                } catch (psdError) {
                    console.warn('PSD conversion failed:', psdError);
                }
            }
            
            // For AI, EPS files - would need Inkscape CLI (not implemented here)
            // For Sketch files - would need specialized tools (macOS only)
            // For XD files - would need Adobe XD CLI tools
            
            // Fallback to detailed text preview with file analysis
            const analysisText = await this.analyzeDesignFile(fileBuffer, fileName, fileExtension);
            
            const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

DESIGN FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB
CONVERSION ATTEMPTED: ${conversionAttempted ? 'Yes' : 'No'}
CONVERSION STATUS: ${conversionResult ? 'Success' : 'Failed/Not Available'}

${analysisText}

Design File Conversion Support:
• PSD files: Using psd.js library ${psd ? '✅' : '❌'}
• AI/EPS files: Requires Inkscape CLI (not configured)
• Sketch files: Requires Sketch tools (macOS only)
• XD files: Requires Adobe XD CLI (not configured)
• Figma files: API integration required

Preview Generation Process:
1. Extract embedded preview/thumbnail if available
2. Convert layers to rasterized format
3. Apply watermarking to prevent unauthorized use
4. Reduce resolution for preview purposes

Complete your purchase to access the full design source file
with all layers, vector data, and editing capabilities intact.

═══════════════════════════════════════════════════════════════
`;

            const watermarkedBuffer = Buffer.from(previewText, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${path.parse(fileName).name}.txt`,
                fileType: 'text/plain',
                isWatermarked: true,
                conversionAttempted,
                conversionSuccess: !!conversionResult
            };
        } catch (error) {
            console.error('Error processing design file:', error);
            throw error;
        }
    }
    
    // Convert PSD files to PNG using psd.js
    async convertPsdToImage(fileBuffer, fileName) {
        if (!psd) return null;
        
        try {
            // Ensure we have a proper Buffer
            if (!Buffer.isBuffer(fileBuffer)) {
                console.warn('PSD conversion failed: fileBuffer is not a Buffer, received:', typeof fileBuffer);
                return null;
            }
            
            console.log(`Processing PSD file ${fileName} with buffer size:`, fileBuffer.length);
            
            // Create PSD instance - write to temp file first
            let psdFile;
            const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.psd`);
            
            try {
                console.log('Writing PSD buffer to temp file...');
                await fs.promises.writeFile(tempPath, fileBuffer);
                
                console.log('Opening PSD from temp file...');
                if (psd && typeof psd.open === 'function') {
                    // Use psd.open which expects a file path and may return a promise
                    const psdResult = psd.open(tempPath);
                    
                    // Check if it's a promise
                    if (psdResult && typeof psdResult.then === 'function') {
                        psdFile = await psdResult;
                        console.log('PSD file opened successfully (async)');
                    } else {
                        psdFile = psdResult;
                        console.log('PSD file opened successfully (sync)');
                    }
                } else if (typeof psd === 'function') {
                    // Fallback: try constructor with buffer since path didn't work
                    psdFile = new psd(fileBuffer);
                    console.log('PSD instance created with constructor');
                } else {
                    throw new Error('No valid PSD open method available');
                }
                
            } catch (constructorError) {
                console.log('PSD open error:', constructorError.message);
                throw constructorError;
            } finally {
                // Clean up temp file
                try {
                    await fs.promises.unlink(tempPath);
                    console.log('Temp PSD file cleaned up');
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
            
            // Parse the PSD file
            try {
                if (psdFile && typeof psdFile.parse === 'function') {
                    console.log('Parsing PSD file...');
                    const parseResult = psdFile.parse();
                    
                    // Check if parse returns a promise
                    if (parseResult && typeof parseResult.then === 'function') {
                        await parseResult;
                        console.log('PSD parsing completed (async)');
                    } else {
                        console.log('PSD parsing completed (sync)');
                    }
                } else {
                    console.log('PSD file has no parse method, checking direct access...');
                }
            } catch (parseError) {
                console.log('PSD parse error:', parseError.message);
                // Continue even if parsing fails
            }
            
            // Try multiple ways to get image data
            let image = null;
            
            // Method 1: Direct image property
            if (psdFile.image) {
                image = psdFile.image;
                console.log('Got image from psdFile.image');
            }
            // Method 2: Try getting tree and composite
            else if (psdFile.tree && psdFile.tree()) {
                const tree = psdFile.tree();
                if (tree.export) {
                    image = tree.export();
                    console.log('Got image from tree.export()');
                }
            }
            // Method 3: Try direct export
            else if (psdFile.export && typeof psdFile.export === 'function') {
                image = psdFile.export();
                console.log('Got image from psdFile.export()');
            }
            
            if (!image) {
                console.warn('No image data available from PSD file after trying all methods');
                console.log('Available psdFile methods:', Object.keys(psdFile || {}));
                return null;
            }
            
            // Convert to PNG buffer with error handling
            let pngBuffer;
            try {
                console.log('Converting PSD image to PNG...');
                console.log('Image object type:', typeof image);
                console.log('Image methods:', Object.keys(image || {}));
                
                // The PSD library image object sometimes returns a pngjs PNG instance or raw RGBA
                // We will handle both cases robustly
                let pngData = null;
                
                if (typeof image.toPng === 'function') {
                    console.log('Using image.toPng() method');
                    pngData = image.toPng();
                } else if (typeof image.export === 'function') {
                    console.log('Using image.export() method');
                    pngData = image.export();
                } else {
                    throw new Error('No PNG export method found on image object');
                }
                
                console.log('PNG data type:', typeof pngData);
                console.log('PNG data constructor:', pngData?.constructor?.name);
                console.log('PNG data length/size:', pngData?.length || pngData?.byteLength || 'unknown');
                
                // Handle different return formats
                if (Buffer.isBuffer(pngData)) {
                    pngBuffer = pngData;
                    console.log('PNG data is already a Buffer');
                } else if (pngData && typeof pngData.pack === 'function') {
                    // pngjs PNG instance: pack to encoded PNG Buffer
                    console.log('Packing pngjs PNG stream to buffer...');
                    pngBuffer = await new Promise((resolve, reject) => {
                        const chunks = [];
                        pngData
                            .pack()
                            .on('data', (c) => chunks.push(c))
                            .on('end', () => resolve(Buffer.concat(chunks)))
                            .on('error', reject);
                    });
                } else if (pngData && typeof pngData === 'object' && pngData.data) {
                    // Likely raw RGBA pixel buffer without PNG encoding
                    console.log('Detected raw RGBA pixel data, encoding to PNG via Jimp...');
                    const width = (typeof image.width === 'function') ? image.width() : (pngData.width || image.width || 0);
                    const height = (typeof image.height === 'function') ? image.height() : (pngData.height || image.height || 0);
                    if (!width || !height) {
                        throw new Error('Cannot determine image dimensions for PNG encoding');
                    }
                    const rgba = Buffer.isBuffer(pngData.data) ? pngData.data : Buffer.from(pngData.data);
                    try {
                        const j = new jimp({ data: rgba, width, height });
                        pngBuffer = await j.getBufferAsync(jimp.MIME_PNG);
                    } catch (jerr) {
                        console.log('Jimp encoding failed:', jerr.message);
                        throw new Error('Failed to encode raw RGBA to PNG');
                    }
                } else if (pngData instanceof Uint8Array) {
                    pngBuffer = Buffer.from(pngData);
                    console.log('Converted Uint8Array to Buffer');
                } else if (typeof pngData === 'string') {
                    // Base64 encoded string
                    pngBuffer = Buffer.from(pngData, 'base64');
                    console.log('Converted base64 string to Buffer');
                } else {
                    console.log('Unsupported PNG data format:', typeof pngData);
                    throw new Error('Unable to convert PSD to valid PNG buffer');
                }
                
                // Validate PNG buffer starts with PNG signature
                const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                if (pngBuffer.length >= 8 && pngBuffer.subarray(0, 8).equals(pngSignature)) {
                    console.log('✅ Valid PNG buffer created, size:', pngBuffer.length);
                } else {
                    console.log('❌ Invalid PNG buffer - missing PNG signature');
                    console.log('Buffer start:', pngBuffer.subarray(0, 16).toString('hex'));
                    throw new Error('Generated buffer is not a valid PNG file');
                }
                
            } catch (pngError) {
                console.warn('Failed to convert PSD image to PNG:', pngError.message);
                return null;
            }
            
            return {
                buffer: pngBuffer,
                width: image.width ? image.width() : (image.width || 0),
                height: image.height ? image.height() : (image.height || 0)
            };
        } catch (error) {
            console.warn('PSD to PNG conversion failed:', error.message);
            
            // If PSD conversion fails completely, we'll fall back to text preview
            // This ensures the system doesn't crash
            return null;
        }
    }
    
    // Analyze design file for preview information
    async analyzeDesignFile(fileBuffer, fileName, fileExtension) {
        let analysis = 'Professional design source file analysis:\n';
        
        // Basic file analysis
        const sizeKB = (fileBuffer.length / 1024).toFixed(1);
        analysis += `• File size: ${sizeKB}KB\n`;
        
        // File type specific analysis
        switch (fileExtension) {
            case 'psd':
                analysis += '• Adobe Photoshop Document\n';
                analysis += '• Contains raster graphics with layers\n';
                analysis += '• May include text layers, effects, masks\n';
                analysis += '• Supports CMYK, RGB, Lab color modes\n';
                break;
                
            case 'ai':
                analysis += '• Adobe Illustrator Document\n';
                analysis += '• Vector-based graphics file\n';
                analysis += '• Scalable without quality loss\n';
                analysis += '• May contain text, paths, shapes\n';
                break;
                
            case 'sketch':
                analysis += '• Sketch App Document (macOS)\n';
                analysis += '• UI/UX design focused\n';
                analysis += '• Contains artboards and symbols\n';
                analysis += '• Vector and raster combination\n';
                break;
                
            case 'xd':
                analysis += '• Adobe XD Document\n';
                analysis += '• UI/UX prototyping file\n';
                analysis += '• Interactive design elements\n';
                analysis += '• Vector graphics with animations\n';
                break;
                
            case 'fig':
                analysis += '• Figma Design File\n';
                analysis += '• Collaborative design document\n';
                analysis += '• Component-based design system\n';
                analysis += '• Cloud-based vector graphics\n';
                break;
                
            default:
                analysis += '• Design/Graphics file format\n';
                analysis += '• Professional creative content\n';
        }
        
        return analysis;
    }

    // Generic preview for unknown file types
    async createGenericPreview(fileBuffer, fileName, fileType) {
        try {
            const previewText = `
═══════════════════════════════════════════════════════════════
                    ${this.watermarkMainText}
                ${this.watermarkSubtext}
═══════════════════════════════════════════════════════════════

FILE: ${fileName}
TYPE: ${fileType}
SIZE: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB

This file type requires specialized software or viewing tools.
The original file has been safely stored and will be accessible
after purchase completion.

For technical support or questions about file compatibility,
please contact our support team.

═══════════════════════════════════════════════════════════════
`;

            const watermarkedBuffer = Buffer.from(previewText, 'utf8');

            return {
                buffer: watermarkedBuffer,
                fileName: `preview_${path.parse(fileName).name}.txt`,
                fileType: 'text/plain',
                isWatermarked: true
            };
        } catch (error) {
            console.error('Error creating generic preview:', error);
            throw error;
        }
    }

    // File type detection helpers
    isImageFile(fileType, extension) {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'];
        return imageTypes.includes(fileType) || imageExtensions.includes(extension);
    }

    isPDFFile(fileType) {
        return fileType === 'application/pdf';
    }

    isVideoFile(fileType, extension) {
        const videoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-flv', 'video/3gpp'];
        const videoExtensions = ['mp4', 'mpeg', 'mov', 'avi', 'webm', 'flv', '3gp'];
        return videoTypes.includes(fileType) || videoExtensions.includes(extension);
    }

    isAudioFile(fileType, extension) {
        const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a'];
        const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];
        return audioTypes.includes(fileType) || audioExtensions.includes(extension);
    }

    isTextFile(fileType, extension) {
        const textTypes = ['text/plain', 'text/markdown'];
        const textExtensions = ['txt', 'md', 'markdown'];
        return textTypes.includes(fileType) || textExtensions.includes(extension);
    }

    isCodeFile(extension) {
        const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'json', 'xml', 'php', 'py', 'java', 'c', 'cpp', 'cs', 'rb', 'go', 'rs'];
        return codeExtensions.includes(extension);
    }

    isDocumentFile(fileType, extension) {
        const docTypes = [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];
        const docExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        return docTypes.includes(fileType) || docExtensions.includes(extension);
    }

    isArchiveFile(fileType, extension) {
        const archiveTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-rar', 'application/x-7z-compressed'];
        const archiveExtensions = ['zip', 'rar', '7z'];
        return archiveTypes.includes(fileType) || archiveExtensions.includes(extension);
    }

    isDesignFile(fileType, extension) {
        const designTypes = ['application/x-photoshop', 'image/vnd.adobe.photoshop', 'application/postscript', 'application/illustrator'];
        const designExtensions = ['psd', 'ai', 'sketch', 'eps', 'fig', 'xd', 'indd', 'cdr'];
        return designTypes.includes(fileType) || designExtensions.includes(extension);
    }

    is3DModelFile(fileType, extension) {
        const modelTypes = ['model/obj', 'model/stl', 'model/fbx', 'model/gltf+json', 'model/gltf-binary', 'model/ply', 'application/x-blender'];
        const modelExtensions = ['obj', 'stl', 'fbx', 'gltf', 'glb', 'ply', 'blend', '3ds', 'dae', 'c4d', '3mf'];
        return modelTypes.includes(fileType) || modelExtensions.includes(extension);
    }
}

export default new WatermarkService();
