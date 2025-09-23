import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configure multer for file storage
const storage = multer.memoryStorage(); // Store files in memory temporarily

// File filter function
const fileFilter = (req, file, cb) => {
    // Define allowed file types for freelance platform
    const allowedTypes = {
        // Images
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/tiff': 'tiff',
        'image/bmp': 'bmp',
        
        // Documents
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/rtf': 'rtf',
        
        // Videos
        'video/mp4': 'mp4',
        'video/mpeg': 'mpeg',
        'video/quicktime': 'mov',
        'video/x-msvideo': 'avi',
        'video/webm': 'webm',
        'video/x-flv': 'flv',
        'video/3gpp': '3gp',
        
        // Audio
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/aac': 'aac',
        'audio/x-m4a': 'm4a',
        
        // Design Source Files
        'application/x-photoshop': 'psd',
        'image/vnd.adobe.photoshop': 'psd',
        'application/postscript': 'ai',
        'application/illustrator': 'ai',
        'application/x-sketch': 'sketch',
        'application/figma': 'fig',
        'application/x-xd': 'xd',
        'application/x-indesign': 'indd',
        'application/x-coreldraw': 'cdr',
        
        // 3D & CAD Files
        'application/x-autocad': 'dwg',
        'application/dwg': 'dwg',
        'application/x-step': 'step',
        'application/step': 'stp',
        'model/obj': 'obj',
        'application/x-tgif': 'obj',
        'application/x-blender': 'blend',
        'model/fbx': 'fbx',
        'application/x-fbx': 'fbx',
        'model/3mf': '3mf',
        'application/x-3ds': '3ds',
        'model/stl': 'stl',
        'application/x-stl': 'stl',
        'model/ply': 'ply',
        'application/x-cinema4d': 'c4d',
        
        // Archive Files
        'application/zip': 'zip',
        'application/x-zip-compressed': 'zip',
        'application/x-rar-compressed': 'rar',
        'application/x-rar': 'rar',
        'application/x-7z-compressed': '7z',
        'application/x-tar': 'tar',
        'application/gzip': 'gz',
        'application/x-gzip': 'gz',
        
        // Code & Development Files
        'text/html': 'html',
        'text/css': 'css',
        'text/javascript': 'js',
        'application/json': 'json',
        'application/xml': 'xml',
        'text/xml': 'xml',
        
        // Font Files
        'font/ttf': 'ttf',
        'font/otf': 'otf',
        'font/woff': 'woff',
        'font/woff2': 'woff2',
        'application/x-font-ttf': 'ttf',
        'application/x-font-otf': 'otf',
        
        // Additional Formats
        'application/octet-stream': 'bin', // Generic binary files
    };

    // For octet-stream, check file extension
    if (file.mimetype === 'application/octet-stream') {
        const ext = file.originalname.toLowerCase().split('.').pop();
        const allowedExtensions = [
            'psd', 'ai', 'sketch', 'fig', 'xd', 'indd', 'cdr',
            'dwg', 'step', 'stp', 'obj', 'blend', 'fbx', '3mf', '3ds', 'stl', 'ply', 'c4d',
            'rar', '7z', 'blend', 'max', 'ma', 'mb'
        ];
        
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
            return;
        }
    }

    if (allowedTypes[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Supported: images, documents, videos, audio, design files, 3D/CAD files, and archives.`), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit (increased for design/3D files)
        files: 5 // Maximum 5 files per request
    }
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for multiple file upload
export const uploadMultiple = upload.array('files', 5);

// Error handling middleware for multer
export const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size is 50MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files. Maximum is 5 files per upload.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                error: 'Unexpected field name for file upload.'
            });
        }
    }
    
    if (error.message.includes('Invalid file type')) {
        return res.status(400).json({
            error: error.message
        });
    }
    
    next(error);
};

export default upload;
