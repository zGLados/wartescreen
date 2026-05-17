const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const VIDEO_DIR = path.join(__dirname, '../videos');
const PROCESSED_DIR = path.join(VIDEO_DIR, 'processed');

// FFmpeg compression settings
const FFMPEG_SETTINGS = {
    resolution: '1920x1080',
    videoBitrate: '2M',        // 2 Mbps video
    audioBitrate: '128k',       // 128 kbps audio
    preset: 'medium',           // Encoding speed (ultrafast, fast, medium, slow)
    crf: '23'                   // Constant Rate Factor (18-28, lower = better quality)
};

async function checkFFmpeg() {
    try {
        await execAsync('ffmpeg -version');
        console.log('[Video Compression] FFmpeg detected');
        return true;
    } catch (error) {
        console.error('[Video Compression] FFmpeg not found! Please install FFmpeg.');
        console.error('[Video Compression] Download: https://ffmpeg.org/download.html');
        return false;
    }
}

async function ensureProcessedDir() {
    if (!fs.existsSync(PROCESSED_DIR)) {
        fs.mkdirSync(PROCESSED_DIR, { recursive: true });
        console.log(`[Video Compression] Created directory: ${PROCESSED_DIR}`);
    }
}

function getVideoFiles() {
    const files = fs.readdirSync(VIDEO_DIR);
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.webm', '.mov', '.avi'].includes(ext) && 
               fs.statSync(path.join(VIDEO_DIR, file)).isFile();
    });
}

function needsCompression(originalPath, processedPath) {
    // If processed file doesn't exist, needs compression
    if (!fs.existsSync(processedPath)) {
        return true;
    }
    
    // If original is newer than processed, needs re-compression
    const originalStats = fs.statSync(originalPath);
    const processedStats = fs.statSync(processedPath);
    
    if (originalStats.mtime > processedStats.mtime) {
        return true;
    }
    
    return false;
}

async function compressVideo(filename) {
    const originalPath = path.join(VIDEO_DIR, filename);
    const processedPath = path.join(PROCESSED_DIR, filename);
    
    console.log(`[Video Compression] Compressing: ${filename}`);
    
    const originalSize = fs.statSync(originalPath).size / (1024 * 1024); // MB
    console.log(`[Video Compression] Original size: ${originalSize.toFixed(2)} MB`);
    
    const startTime = Date.now();
    
    // FFmpeg command for compression
    const command = `ffmpeg -i "${originalPath}" ` +
        `-vf scale=${FFMPEG_SETTINGS.resolution} ` +
        `-c:v libx264 ` +
        `-preset ${FFMPEG_SETTINGS.preset} ` +
        `-crf ${FFMPEG_SETTINGS.crf} ` +
        `-b:v ${FFMPEG_SETTINGS.videoBitrate} ` +
        `-c:a aac ` +
        `-b:a ${FFMPEG_SETTINGS.audioBitrate} ` +
        `-movflags +faststart ` + // Optimize for web streaming
        `-y "${processedPath}"`;
    
    try {
        await execAsync(command);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const processedSize = fs.statSync(processedPath).size / (1024 * 1024); // MB
        const savings = ((1 - processedSize / originalSize) * 100).toFixed(1);
        
        console.log(`[Video Compression] ✓ ${filename}`);
        console.log(`[Video Compression]   → ${processedSize.toFixed(2)} MB (${savings}% smaller)`);
        console.log(`[Video Compression]   → Took ${duration}s`);
        
        return true;
    } catch (error) {
        console.error(`[Video Compression] ✗ Failed to compress ${filename}:`, error.message);
        return false;
    }
}

async function compressAllVideos() {
    console.log('[Video Compression] Starting video compression...');
    
    // Check if FFmpeg is available
    const hasFFmpeg = await checkFFmpeg();
    if (!hasFFmpeg) {
        console.error('[Video Compression] Skipping compression - FFmpeg not available');
        return false;
    }
    
    // Ensure processed directory exists
    await ensureProcessedDir();
    
    // Get all video files
    const videoFiles = getVideoFiles();
    console.log(`[Video Compression] Found ${videoFiles.length} video file(s)`);
    
    if (videoFiles.length === 0) {
        console.log('[Video Compression] No videos to compress');
        return true;
    }
    
    // Check which videos need compression
    const toCompress = videoFiles.filter(file => {
        const originalPath = path.join(VIDEO_DIR, file);
        const processedPath = path.join(PROCESSED_DIR, file);
        return needsCompression(originalPath, processedPath);
    });
    
    if (toCompress.length === 0) {
        console.log('[Video Compression] All videos are already compressed and up-to-date');
        return true;
    }
    
    console.log(`[Video Compression] ${toCompress.length} video(s) need compression`);
    
    // Compress videos sequentially (to avoid CPU overload)
    let successCount = 0;
    for (const file of toCompress) {
        const success = await compressVideo(file);
        if (success) successCount++;
    }
    
    console.log(`[Video Compression] Completed: ${successCount}/${toCompress.length} successful`);
    return successCount === toCompress.length;
}

// Run if called directly
if (require.main === module) {
    compressAllVideos()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('[Video Compression] Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { compressAllVideos };
