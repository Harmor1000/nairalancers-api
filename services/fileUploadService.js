import cloudinary from '../config/cloudinary.js';
import { v4 as uuidv4 } from 'uuid';
import watermarkService from './watermarkService.js';

class FileUploadService {
    
    // Upload file to Cloudinary (private folder by default)
    async uploadFile(fileBuffer, fileName, fileType, folder = 'general', isPrivate = true) {
        try {
            // Check file size limits (10MB for Cloudinary free tier)
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
            if (fileBuffer.length > MAX_FILE_SIZE) {
                throw new Error(`File size too large. File is ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB but maximum allowed is ${(MAX_FILE_SIZE / 1024 / 1024)}MB. Please compress your file or use a smaller version.`);
            }

            // Sanitize filename for Cloudinary public_id (remove special characters)
            const sanitizedFileName = fileName
                .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
                .replace(/_{2,}/g, '_') // Replace multiple underscores with single
                .replace(/^_|_$/g, '') // Remove leading/trailing underscores
                .substring(0, 100); // Limit length

            // Determine resource type based on file type
            let resourceType = 'auto';
            if (fileType.startsWith('image/')) {
                resourceType = 'image';
            } else if (fileType.startsWith('video/')) {
                resourceType = 'video';
            } else {
                resourceType = 'raw';
            }
            
            // Generate unique public ID based on context and privacy
            const folderPrefix = isPrivate ? 'nairalancers/private' : 'nairalancers/public';
            const publicId = `${folderPrefix}/${folder}/${uuidv4()}-${sanitizedFileName}`;

            // Upload to Cloudinary
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: resourceType,
                        public_id: publicId,
                        // Don't set folder here since it's already in public_id
                        use_filename: false,
                        unique_filename: false,
                        overwrite: false,
                        type: isPrivate ? 'private' : 'upload' // Private files require authentication
                    },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    }
                );
                uploadStream.end(fileBuffer);
            });

            return {
                fileName: fileName,
                fileUrl: result.secure_url,
                fileType: fileType,
                fileSize: result.bytes,
                publicId: result.public_id,
                resourceType: result.resource_type
            };

        } catch (error) {
            console.error('Error uploading file to Cloudinary:', error);
            // Preserve original error details for better user feedback
            throw error;
        }
    }

    // Upload multiple files
    async uploadMultipleFiles(files, folder = 'general', isPrivate = true) {
        try {
            const uploadPromises = files.map(file => 
                this.uploadFile(file.buffer, file.originalname, file.mimetype, folder, isPrivate)
            );
            
            return await Promise.all(uploadPromises);
        } catch (error) {
            console.error('Error uploading multiple files:', error);
            throw new Error('Failed to upload files');
        }
    }

    // Delete file from Cloudinary
    async deleteFile(publicId, resourceType = 'auto') {
        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: resourceType
            });
            return result;
        } catch (error) {
            console.error('Error deleting file from Cloudinary:', error);
            throw new Error('Failed to delete file');
        }
    }

    // Delete multiple files
    async deleteMultipleFiles(publicIds, resourceType = 'auto') {
        try {
            const deletePromises = publicIds.map(publicId => 
                this.deleteFile(publicId, resourceType)
            );
            
            return await Promise.all(deletePromises);
        } catch (error) {
            console.error('Error deleting multiple files:', error);
            throw new Error('Failed to delete files');
        }
    }

    // Get file info
    async getFileInfo(publicId) {
        try {
            const result = await cloudinary.api.resource(publicId);
            return result;
        } catch (error) {
            console.error('Error getting file info:', error);
            throw new Error('Failed to get file info');
        }
    }

    // Generate file thumbnail (for images and videos)
    generateThumbnail(publicId, resourceType = 'image') {
        try {
            if (resourceType === 'image') {
                return cloudinary.url(publicId, {
                    width: 200,
                    height: 200,
                    crop: 'fill',
                    quality: 'auto',
                    format: 'auto'
                });
            } else if (resourceType === 'video') {
                return cloudinary.url(publicId, {
                    resource_type: 'video',
                    width: 200,
                    height: 200,
                    crop: 'fill',
                    quality: 'auto',
                    format: 'jpg'
                });
            }
            return null;
        } catch (error) {
            console.error('Error generating thumbnail:', error);
            return null;
        }
    }

    // Upload deliverable with watermarked preview for freelancer work
    async uploadDeliverable(fileBuffer, fileName, fileType, folder = 'deliverables') {
        try {
            // Upload original file to private folder (full quality, protected)
            const originalFile = await this.uploadFile(fileBuffer, fileName, fileType, folder, true);
            
            // Process file locally to create watermarked preview
            const watermarkedResult = await watermarkService.processFile(fileBuffer, fileName, fileType);
            
            // Upload watermarked preview to public folder
            const previewFile = await this.uploadFile(
                watermarkedResult.buffer, 
                watermarkedResult.fileName, 
                watermarkedResult.fileType, 
                `${folder}/previews`, 
                false // Public folder for previews
            );

            return {
                original: {
                    ...originalFile,
                    isPrivate: true,
                    accessType: 'private'
                },
                preview: {
                    ...previewFile,
                    isPrivate: false,
                    accessType: 'public',
                    isWatermarked: watermarkedResult.isWatermarked,
                    originalFileName: fileName
                }
            };

        } catch (error) {
            console.error('Error uploading deliverable:', error);
            // Preserve original error details for better user feedback
            throw error;
        }
    }

    // DEPRECATED: Legacy method - now using local watermarking via watermarkService
    // Keeping for backward compatibility only
    async createWatermarkedPreview(originalFile, fileName, folder) {
        console.warn('createWatermarkedPreview is deprecated. Use watermarkService.processFile() instead.');
        
        try {
            // Use Cloudinary's overlay feature to add watermark (fallback)
            const watermarkedUrl = cloudinary.url(originalFile.publicId, {
                transformation: [
                    { width: 800, height: 600, crop: 'limit', quality: 'auto:low' },
                    {
                        overlay: {
                            font_family: "Arial",
                            font_size: 30,
                            font_weight: "bold",
                            text: "NAIRALANCERS%20PREVIEW"
                        },
                        opacity: 30,
                        gravity: "center"
                    }
                ]
            });

            return {
                fileName: `preview_${fileName}`,
                fileUrl: watermarkedUrl,
                fileType: originalFile.fileType,
                fileSize: Math.round(originalFile.fileSize * 0.6),
                publicId: originalFile.publicId,
                resourceType: originalFile.resourceType,
                isPreview: true,
                isLegacy: true
            };

        } catch (error) {
            console.error('Error creating legacy watermarked preview:', error);
            throw new Error(`Failed to create legacy preview: ${error.message}`);
        }
    }

    // Create PDF preview (first page only with watermark)
    async createPDFPreview(originalFile, fileName, folder) {
        try {
            // Generate preview of first page with watermark
            const previewUrl = cloudinary.url(originalFile.publicId, {
                resource_type: 'auto',
                format: 'jpg',
                transformation: [
                    { page: 1 }, // First page only
                    { width: 600, height: 800, crop: 'limit', quality: 'auto:low' },
                    {
                        overlay: {
                            font_family: "Arial",
                            font_size: 40,
                            font_weight: "bold",
                            text: "PREVIEW%20ONLY"
                        },
                        opacity: 50,
                        gravity: "center",
                        color: "red"
                    }
                ]
            });

            // Validate that the URL was generated correctly
            if (!previewUrl || !previewUrl.startsWith('http')) {
                throw new Error('Failed to generate valid PDF preview URL');
            }

            return {
                fileName: `preview_${fileName}.jpg`,
                fileUrl: previewUrl,
                fileType: 'image/jpeg',
                fileSize: Math.round(originalFile.fileSize * 0.1), // Much smaller preview
                publicId: originalFile.publicId,
                resourceType: 'image',
                isPreview: true,
                originalFormat: 'pdf'
            };

        } catch (error) {
            console.error('Error creating PDF preview:', error);
            throw new Error(`Failed to create PDF preview: ${error.message}`);
        }
    }

    // Create generic preview for other file types
    async createGenericPreview(originalFile, fileName, folder) {
        try {
            // For non-visual files, create a simple preview that points to original with reduced info
            const fileExtension = fileName.split('.').pop().toUpperCase();
            const fileSizeMB = (originalFile.fileSize / (1024 * 1024)).toFixed(2);
            
            // Determine file category for better preview description
            const getFileCategory = (ext) => {
                const designFiles = ['psd', 'ai', 'sketch', 'fig', 'xd', 'indd', 'cdr'];
                const cadFiles = ['dwg', 'step', 'stp', 'obj', 'blend', 'fbx', '3mf', '3ds', 'stl', 'ply', 'c4d', 'max', 'ma', 'mb'];
                const archiveFiles = ['zip', 'rar', '7z', 'tar', 'gz'];
                const codeFiles = ['html', 'css', 'js', 'json', 'xml'];
                const fontFiles = ['ttf', 'otf', 'woff', 'woff2'];
                const videoFiles = ['mp4', 'avi', 'mov', 'webm', 'flv', '3gp'];
                const audioFiles = ['mp3', 'wav', 'aac', 'm4a', 'ogg'];
                const docFiles = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'rtf'];
                
                const extLower = ext.toLowerCase();
                
                if (designFiles.includes(extLower)) return 'Design File';
                if (cadFiles.includes(extLower)) return '3D/CAD File';
                if (archiveFiles.includes(extLower)) return 'Archive File';
                if (codeFiles.includes(extLower)) return 'Code File';
                if (fontFiles.includes(extLower)) return 'Font File';
                if (videoFiles.includes(extLower)) return 'Video File';
                if (audioFiles.includes(extLower)) return 'Audio File';
                if (docFiles.includes(extLower)) return 'Document File';
                
                return 'File';
            };
            
            const fileCategory = getFileCategory(fileExtension);
            
            // For non-image files, return the original URL with preview metadata
            // This ensures the link works while still maintaining preview status
            return {
                fileName: `preview_${fileName}`,
                fileUrl: originalFile.fileUrl, // Use original URL for non-visual files
                fileType: originalFile.fileType,
                fileSize: originalFile.fileSize,
                publicId: originalFile.publicId,
                resourceType: originalFile.resourceType,
                isPreview: true,
                originalFormat: fileExtension.toLowerCase(),
                previewNote: `${fileCategory} (${fileExtension}) - ${fileSizeMB} MB`,
                fileCategory: fileCategory
            };

        } catch (error) {
            console.error('Error creating generic preview:', error);
            throw new Error(`Failed to create generic preview: ${error.message}`);
        }
    }

    // Generate secure download URL for final deliverables (after payment approval)
    generateSecureDownloadUrl(publicId, resourceType = 'auto', expirationTime = 3600) {
        try {
            // For private files, generate signed URL with authentication
            return cloudinary.url(publicId, {
                resource_type: resourceType,
                sign_url: true,
                type: 'private', // Changed from 'authenticated' to 'private'
                expires_at: Math.floor(Date.now() / 1000) + expirationTime,
                secure: true // Force HTTPS
            });
        } catch (error) {
            console.error('Error generating secure URL:', error);
            return null;
        }
    }

    // Generate public preview URL (no authentication required)
    generatePreviewUrl(publicId, resourceType = 'auto') {
        try {
            return cloudinary.url(publicId, {
                resource_type: resourceType,
                type: 'upload', // Public upload
                secure: true
            });
        } catch (error) {
            console.error('Error generating preview URL:', error);
            return null;
        }
    }

    // Upload file to public folder (for previews)
    async uploadPublicFile(fileBuffer, fileName, fileType, folder = 'previews') {
        return await this.uploadFile(fileBuffer, fileName, fileType, folder, false);
    }

    // Upload file to private folder (for originals)
    async uploadPrivateFile(fileBuffer, fileName, fileType, folder = 'originals') {
        return await this.uploadFile(fileBuffer, fileName, fileType, folder, true);
    }
}

export default new FileUploadService();
