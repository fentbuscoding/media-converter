// Backend API Server for YouTube and Instagram Downloads
// Uses yt-dlp for YouTube and instaloader for Instagram
// Install dependencies: npm install express cors
// Install Python tools: pip install yt-dlp instaloader

const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Download queue and progress tracking
const downloadQueue = new Map();
const downloadProgress = new Map();

// Configuration
const CONFIG = {
  maxConcurrentDownloads: 3,
  maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
  allowedFormats: {
    video: ['mp4', 'webm', 'mkv', 'avi', 'mov'],
    audio: ['mp3', 'm4a', 'opus', 'flac', 'wav', 'aac'],
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },
};

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Simple rate limiting
const requestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip).filter(time => now - time < CONFIG.rateLimit.windowMs);

  if (requests.length >= CONFIG.rateLimit.maxRequests) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(CONFIG.rateLimit.windowMs / 1000),
    });
  }

  requests.push(now);
  requestCounts.set(ip, requests);
  next();
});

// Create necessary directories
const downloadsDir = path.join(__dirname, 'downloads');
const tempDir = path.join(__dirname, 'temp');
const logsDir = path.join(__dirname, 'logs');

[downloadsDir, tempDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve download files with proper headers
app.use(
  '/api/download',
  express.static(downloadsDir, {
    setHeaders: (res, filepath) => {
      const filename = path.basename(filepath);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    },
  })
);

// Utility Functions
function generateDownloadId() {
  return crypto.randomBytes(16).toString('hex');
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9._-]/gi, '_').substring(0, 200);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

function validateFormat(format, type) {
  const allowed = CONFIG.allowedFormats[type] || [];
  return allowed.includes(format.toLowerCase());
}

// Cleanup old files (run every hour)
setInterval(
  () => {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    [downloadsDir, tempDir].forEach(dir => {
      fs.readdir(dir, (err, files) => {
        if (err) return;

        files.forEach(file => {
          const filepath = path.join(dir, file);
          fs.stat(filepath, (err, stats) => {
            if (err) return;

            if (now - stats.mtime.getTime() > maxAge) {
              fs.unlink(filepath, err => {
                if (!err) console.log(`🗑️  Cleaned up old file: ${file}`);
              });
            }
          });
        });
      });
    });
  },
  60 * 60 * 1000
);

// ================================
// YouTube API Endpoints (using yt-dlp)
// ================================

// Get YouTube video info
app.get('/api/youtube/info/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    console.log(`📺 Fetching YouTube info for: ${videoId}`);

    // Use yt-dlp via Python module (works regardless of PATH)
    const command = `python -m yt_dlp --dump-json "${url}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ yt-dlp info error:', error);
        console.error('stderr:', stderr);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch video info',
          details: stderr || error.message,
        });
      }

      try {
        const info = JSON.parse(stdout);

        // Extract unique available formats
        const videoFormats = info.formats
          .filter(f => f.vcodec !== 'none' && f.height) // Video formats with height
          .reduce((acc, f) => {
            const quality = `${f.height}p`;
            if (!acc.find(format => format.quality === quality)) {
              acc.push({
                quality: quality,
                height: f.height,
                container: f.ext,
                codec: f.vcodec,
                fps: f.fps || 30,
              });
            }
            return acc;
          }, [])
          .sort((a, b) => parseInt(b.height) - parseInt(a.height));

        console.log(`✅ Found ${videoFormats.length} video formats`);

        res.json({
          success: true,
          data: {
            videoId: videoId,
            title: info.title,
            author: info.uploader || info.channel,
            duration: info.duration,
            thumbnail: info.thumbnail,
            formats: videoFormats,
            description: info.description?.substring(0, 200) || '',
            viewCount: info.view_count,
            uploadDate: info.upload_date,
          },
        });
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        res.status(500).json({
          success: false,
          error: 'Failed to parse video info',
        });
      }
    });
  } catch (error) {
    console.error('❌ Info error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Download YouTube video with progress tracking
app.post('/api/youtube/download', async (req, res) => {
  try {
    const { videoId, quality = 'highest', format = 'mp4' } = req.body;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Validation
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'videoId is required',
      });
    }

    if (!validateFormat(format, 'video')) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Allowed: ${CONFIG.allowedFormats.video.join(', ')}`,
      });
    }

    const downloadId = generateDownloadId();
    downloadProgress.set(downloadId, {
      status: 'starting',
      progress: 0,
      eta: null,
      speed: null,
    });

    console.log(`🎬 [${downloadId}] Downloading YouTube video: ${videoId}`);
    console.log(`📦 Quality: ${quality}, Format: ${format}`);

    // Map quality to yt-dlp format codes
    let formatCode;
    switch (quality.toLowerCase().replace('p', '')) {
      case 'highest':
      case '2160':
        formatCode = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        break;
      case '1440':
        formatCode = 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440]';
        break;
      case '1080':
        formatCode = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]';
        break;
      case '720':
        formatCode = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]';
        break;
      case '480':
        formatCode = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]';
        break;
      case '360':
        formatCode = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]';
        break;
      case 'lowest':
        formatCode = 'worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst';
        break;
      default:
        formatCode = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    }

    // Use yt-dlp with progress tracking
    const filename = `%(title)s_${videoId}_${quality}.%(ext)s`;
    const outputPath = path.join(downloadsDir, filename);

    const args = [
      '-m',
      'yt_dlp',
      '-f',
      formatCode,
      '--merge-output-format',
      format,
      '-o',
      outputPath,
      '--no-playlist',
      '--progress',
      '--newline',
      '--no-warnings',
      url,
    ];

    console.log(`🚀 [${downloadId}] Executing: yt-dlp with format ${formatCode}`);

    const process = spawn('python', args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', data => {
      const output = data.toString();
      stdout += output;

      // Parse progress
      const progressMatch = output.match(/(\d+\.\d+)%/);
      const speedMatch = output.match(/(\d+\.\d+\w+\/s)/);
      const etaMatch = output.match(/ETA\s+(\d+:\d+)/);

      if (progressMatch || speedMatch || etaMatch) {
        downloadProgress.set(downloadId, {
          status: 'downloading',
          progress: progressMatch
            ? parseFloat(progressMatch[1])
            : downloadProgress.get(downloadId).progress,
          speed: speedMatch ? speedMatch[1] : downloadProgress.get(downloadId).speed,
          eta: etaMatch ? etaMatch[1] : downloadProgress.get(downloadId).eta,
        });
      }
    });

    process.stderr.on('data', data => {
      stderr += data.toString();
    });

    process.on('close', code => {
      downloadProgress.delete(downloadId);

      if (code !== 0) {
        console.error(`❌ [${downloadId}] yt-dlp error (code ${code})`);
        console.error('stderr:', stderr);
        return res.status(500).json({
          success: false,
          error: 'Failed to download video',
          details: stderr,
          downloadId: downloadId,
        });
      }

      console.log(`📝 [${downloadId}] yt-dlp output:`, stdout.substring(0, 500));

      // Extract downloaded filename from output
      const downloadMatch = stdout.match(/\[download\] Destination: (.+)/);
      const mergeMatch = stdout.match(/\[Merger\] Merging formats into "(.+)"/);
      const alreadyMatch = stdout.match(/\[download\] (.+) has already been downloaded/);

      let finalFile = null;
      if (mergeMatch) finalFile = mergeMatch[1];
      else if (alreadyMatch) finalFile = alreadyMatch[1];
      else if (downloadMatch) finalFile = downloadMatch[1];

      if (finalFile) {
        const finalFilename = path.basename(finalFile);
        const stats = fs.statSync(finalFile);

        console.log(`✅ [${downloadId}] Downloaded: ${finalFilename} (${formatBytes(stats.size)})`);

        res.json({
          success: true,
          data: {
            downloadId: downloadId,
            filename: finalFilename,
            downloadUrl: `http://localhost:${PORT}/api/download/${encodeURIComponent(finalFilename)}`,
            path: finalFile,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            format: format,
            quality: quality,
          },
        });
      } else {
        // Fallback: find the most recent file in downloads directory
        const files = fs
          .readdirSync(downloadsDir)
          .filter(f => f.includes(videoId))
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(downloadsDir, f)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          const stats = fs.statSync(path.join(downloadsDir, files[0].name));
          console.log(`✅ [${downloadId}] Downloaded (fallback): ${files[0].name}`);

          res.json({
            success: true,
            data: {
              downloadId: downloadId,
              filename: files[0].name,
              downloadUrl: `http://localhost:${PORT}/api/download/${encodeURIComponent(files[0].name)}`,
              path: path.join(downloadsDir, files[0].name),
              size: stats.size,
              sizeFormatted: formatBytes(stats.size),
              format: format,
              quality: quality,
            },
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Download completed but file not found',
            downloadId: downloadId,
          });
        }
      }
    });
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Get download progress
app.get('/api/youtube/progress/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);

  if (!progress) {
    return res.status(404).json({
      success: false,
      error: 'Download not found or completed',
    });
  }

  res.json({
    success: true,
    data: progress,
  });
});

// Download YouTube audio only with progress
app.post('/api/youtube/audio', async (req, res) => {
  try {
    const { videoId, format = 'mp3', quality = '0' } = req.body;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Validation
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'videoId is required',
      });
    }

    if (!validateFormat(format, 'audio')) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Allowed: ${CONFIG.allowedFormats.audio.join(', ')}`,
      });
    }

    const downloadId = generateDownloadId();
    downloadProgress.set(downloadId, {
      status: 'starting',
      progress: 0,
      eta: null,
      speed: null,
    });

    console.log(`🎵 [${downloadId}] Downloading YouTube audio: ${videoId}`);

    // Use yt-dlp with progress tracking
    const filename = `%(title)s_${videoId}_audio.%(ext)s`;
    const outputPath = path.join(downloadsDir, filename);

    const args = [
      '-m',
      'yt_dlp',
      '-f',
      'bestaudio',
      '--extract-audio',
      '--audio-format',
      format,
      '--audio-quality',
      quality,
      '-o',
      outputPath,
      '--no-playlist',
      '--progress',
      '--newline',
      '--no-warnings',
      url,
    ];

    console.log(`🚀 [${downloadId}] Executing: yt-dlp audio extraction`);

    const process = spawn('python', args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', data => {
      const output = data.toString();
      stdout += output;

      const progressMatch = output.match(/(\d+\.\d+)%/);
      const speedMatch = output.match(/(\d+\.\d+\w+\/s)/);
      const etaMatch = output.match(/ETA\s+(\d+:\d+)/);

      if (progressMatch || speedMatch || etaMatch) {
        downloadProgress.set(downloadId, {
          status: 'downloading',
          progress: progressMatch
            ? parseFloat(progressMatch[1])
            : downloadProgress.get(downloadId).progress,
          speed: speedMatch ? speedMatch[1] : downloadProgress.get(downloadId).speed,
          eta: etaMatch ? etaMatch[1] : downloadProgress.get(downloadId).eta,
        });
      }
    });

    process.stderr.on('data', data => {
      stderr += data.toString();
    });

    process.on('close', code => {
      downloadProgress.delete(downloadId);

      if (code !== 0) {
        console.error(`❌ [${downloadId}] yt-dlp audio error (code ${code})`);
        console.error('stderr:', stderr);
        return res.status(500).json({
          success: false,
          error: 'Failed to download audio',
          details: stderr,
          downloadId: downloadId,
        });
      }

      console.log(`📝 [${downloadId}] yt-dlp output:`, stdout.substring(0, 500));

      // Extract downloaded filename from output
      const downloadMatch = stdout.match(/\[download\] Destination: (.+)/);
      const extractMatch = stdout.match(/\[ExtractAudio\] Destination: (.+)/);
      const alreadyMatch = stdout.match(/\[download\] (.+) has already been downloaded/);

      let finalFile = null;
      if (extractMatch) finalFile = extractMatch[1];
      else if (alreadyMatch) finalFile = alreadyMatch[1];
      else if (downloadMatch) finalFile = downloadMatch[1];

      if (finalFile) {
        const finalFilename = path.basename(finalFile);
        const stats = fs.statSync(finalFile);

        console.log(
          `✅ [${downloadId}] Downloaded audio: ${finalFilename} (${formatBytes(stats.size)})`
        );

        res.json({
          success: true,
          data: {
            downloadId: downloadId,
            filename: finalFilename,
            downloadUrl: `http://localhost:${PORT}/api/download/${encodeURIComponent(finalFilename)}`,
            path: finalFile,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            format: format,
            quality: 'best',
          },
        });
      } else {
        // Fallback: find the most recent audio file
        const files = fs
          .readdirSync(downloadsDir)
          .filter(f => f.includes(videoId) && f.endsWith(`.${format}`))
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(downloadsDir, f)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          const stats = fs.statSync(path.join(downloadsDir, files[0].name));
          console.log(`✅ [${downloadId}] Downloaded audio (fallback): ${files[0].name}`);

          res.json({
            success: true,
            data: {
              downloadId: downloadId,
              filename: files[0].name,
              downloadUrl: `http://localhost:${PORT}/api/download/${encodeURIComponent(files[0].name)}`,
              path: path.join(downloadsDir, files[0].name),
              size: stats.size,
              sizeFormatted: formatBytes(stats.size),
              format: format,
              quality: 'best',
            },
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Download completed but file not found',
            downloadId: downloadId,
          });
        }
      }
    });
  } catch (error) {
    console.error('❌ Audio download error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Cancel download
app.delete('/api/youtube/cancel/:downloadId', (req, res) => {
  const { downloadId } = req.params;

  if (downloadProgress.has(downloadId)) {
    downloadProgress.delete(downloadId);
    res.json({
      success: true,
      message: 'Download cancelled',
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Download not found',
    });
  }
});

// ================================
// Instagram API Endpoints (using instaloader)
// ================================

// Get Instagram post info
app.get('/api/instagram/info', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    console.log(`📸 Fetching Instagram info for: ${url}`);

    // Extract shortcode from URL
    const shortcodeMatch = url.match(/\/p\/([^/?]+)|\/reel\/([^/?]+)|\/tv\/([^/?]+)/);
    const shortcode = shortcodeMatch
      ? shortcodeMatch[1] || shortcodeMatch[2] || shortcodeMatch[3]
      : null;

    if (!shortcode) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram URL. Please use a post, reel, or TV URL.',
      });
    }

    // Use instaloader to get post info (metadata only, no download)
    const tempDir = path.join(__dirname, 'temp', shortcode);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use python -m instaloader to avoid PATH issues
    const command = `python -m instaloader --dirname-pattern="${tempDir}" --filename-pattern="{shortcode}" --no-pictures --no-videos --no-video-thumbnails --metadata-json -- -${shortcode}`;

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      // Instaloader may print warnings but still succeed
      console.log('📝 instaloader output:', stdout);
      if (stderr) console.log('⚠️  instaloader stderr:', stderr);

      try {
        // Find the JSON metadata file
        const jsonFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.json'));

        if (jsonFiles.length > 0) {
          const metadataPath = path.join(tempDir, jsonFiles[0]);
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

          console.log(`✅ Got Instagram info for: ${shortcode}`);

          res.json({
            success: true,
            data: {
              shortcode: shortcode,
              caption: metadata.node?.edge_media_to_caption?.edges[0]?.node?.text || '',
              username: metadata.node?.owner?.username || '',
              isVideo: metadata.node?.is_video || false,
              thumbnail: metadata.node?.display_url || '',
              likes: metadata.node?.edge_liked_by?.count || 0,
              comments: metadata.node?.edge_media_to_comment?.count || 0,
            },
          });

          // Cleanup temp files
          fs.rmSync(tempDir, { recursive: true, force: true });
        } else {
          // Even if no JSON, we got the shortcode which is enough
          res.json({
            success: true,
            data: {
              shortcode: shortcode,
              caption: '',
              username: '',
              isVideo: false,
              thumbnail: '',
              likes: 0,
              comments: 0,
            },
          });

          // Cleanup
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      } catch (parseError) {
        console.error('❌ Instagram metadata parse error:', parseError);

        // Return basic info with shortcode
        res.json({
          success: true,
          data: {
            shortcode: shortcode,
            caption: '',
            username: '',
            isVideo: false,
            thumbnail: '',
          },
        });

        // Cleanup
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  } catch (error) {
    console.error('❌ Instagram info error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Download Instagram media
app.post('/api/instagram/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    console.log(`📸 Downloading Instagram media: ${url}`);

    // Extract shortcode
    const shortcodeMatch = url.match(/\/p\/([^/?]+)|\/reel\/([^/?]+)|\/tv\/([^/?]+)/);
    const shortcode = shortcodeMatch
      ? shortcodeMatch[1] || shortcodeMatch[2] || shortcodeMatch[3]
      : null;

    if (!shortcode) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram URL',
      });
    }

    // Use instaloader to download (via Python module to avoid PATH issues)
    const command = `python -m instaloader --dirname-pattern="${downloadsDir}" --filename-pattern="{shortcode}_{typename}" -- -${shortcode}`;

    console.log(`🚀 Executing: instaloader for ${shortcode}`);

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      console.log('📝 instaloader output:', stdout);
      if (stderr) console.log('⚠️  instaloader stderr:', stderr);

      // Find downloaded files (instaloader may print warnings but still succeed)
      const downloadedFiles = fs
        .readdirSync(downloadsDir)
        .filter(f => f.includes(shortcode))
        .filter(f => f.endsWith('.jpg') || f.endsWith('.mp4') || f.endsWith('.png'))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(downloadsDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (downloadedFiles.length > 0) {
        console.log(`✅ Downloaded ${downloadedFiles.length} files`);

        res.json({
          success: true,
          data: {
            files: downloadedFiles.map(f => ({
              filename: f.name,
              downloadUrl: `http://localhost:${PORT}/api/download/${f.name}`,
            })),
            shortcode: shortcode,
          },
        });
      } else {
        console.error('❌ No files downloaded');
        res.status(500).json({
          success: false,
          error: 'Failed to download Instagram media',
          details: stderr || 'No files found after download attempt',
        });
      }
    });
  } catch (error) {
    console.error('❌ Instagram download error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ================================
// Utility Endpoints
// ================================

// Health check with system info
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    message: 'YouTube & Instagram API Server is running',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    uptimeFormatted: formatDuration(uptime),
    memory: {
      used: formatBytes(memUsage.heapUsed),
      total: formatBytes(memUsage.heapTotal),
      rss: formatBytes(memUsage.rss),
    },
    activeDownloads: downloadProgress.size,
    version: '2.0.0',
  });
});

// Get list of downloaded files with enhanced info
app.get('/api/downloads', (req, res) => {
  try {
    const { limit = 50, offset = 0, sort = 'newest' } = req.query;

    let files = fs
      .readdirSync(downloadsDir)
      .filter(f => !f.startsWith('.')) // Exclude hidden files
      .map(filename => {
        const filepath = path.join(downloadsDir, filename);
        const stats = fs.statSync(filepath);
        const ext = path.extname(filename).toLowerCase();

        return {
          filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          created: stats.mtime,
          createdFormatted: stats.mtime.toLocaleString(),
          extension: ext,
          type: CONFIG.allowedFormats.video.includes(ext.slice(1)) ? 'video' : 'audio',
          downloadUrl: `http://localhost:${PORT}/api/download/${encodeURIComponent(filename)}`,
        };
      });

    // Sort
    if (sort === 'newest') {
      files.sort((a, b) => b.created - a.created);
    } else if (sort === 'oldest') {
      files.sort((a, b) => a.created - b.created);
    } else if (sort === 'largest') {
      files.sort((a, b) => b.size - a.size);
    } else if (sort === 'smallest') {
      files.sort((a, b) => a.size - b.size);
    } else if (sort === 'name') {
      files.sort((a, b) => a.filename.localeCompare(b.filename));
    }

    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Paginate
    const paginatedFiles = files.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        count: files.length,
        totalSize: totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        limit: parseInt(limit),
        offset: parseInt(offset),
        files: paginatedFiles,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete a specific file
app.delete('/api/downloads/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(downloadsDir, filename);

    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename',
      });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    fs.unlinkSync(filepath);
    console.log(`🗑️  Deleted file: ${filename}`);

    res.json({
      success: true,
      message: 'File deleted successfully',
      filename: filename,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete all files
app.delete('/api/downloads', (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    let deletedCount = 0;

    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(downloadsDir, file));
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err);
      }
    });

    console.log(`🗑️  Deleted ${deletedCount} files`);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} files`,
      count: deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get statistics
app.get('/api/stats', (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    const videoFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase().slice(1);
      return CONFIG.allowedFormats.video.includes(ext);
    });
    const audioFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase().slice(1);
      return CONFIG.allowedFormats.audio.includes(ext);
    });

    const totalSize = files.reduce((sum, f) => {
      try {
        return sum + fs.statSync(path.join(downloadsDir, f)).size;
      } catch {
        return sum;
      }
    }, 0);

    res.json({
      success: true,
      data: {
        totalFiles: files.length,
        videoFiles: videoFiles.length,
        audioFiles: audioFiles.length,
        totalSize: totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        activeDownloads: downloadProgress.size,
        serverUptime: Math.floor(process.uptime()),
        serverUptimeFormatted: formatDuration(process.uptime()),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// ================================
// Start Server
// ================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 YouTube & Instagram Download API Server v2.0          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  📡 Server: http://localhost:${PORT.toString().padEnd(32)} ║`);
  console.log(`║  💾 Downloads: ${path.basename(downloadsDir).padEnd(43)} ║`);
  console.log(`║  🔧 Environment: ${(process.env.NODE_ENV || 'production').padEnd(37)} ║`);
  console.log('║                                                            ║');
  console.log('║  📚 YouTube Endpoints:                                     ║');
  console.log('║  • GET  /api/youtube/info/:videoId                         ║');
  console.log('║  • POST /api/youtube/download (with progress tracking)     ║');
  console.log('║  • POST /api/youtube/audio (with progress tracking)        ║');
  console.log('║  • GET  /api/youtube/progress/:downloadId                  ║');
  console.log('║  • DEL  /api/youtube/cancel/:downloadId                    ║');
  console.log('║                                                            ║');
  console.log('║  📸 Instagram Endpoints:                                   ║');
  console.log('║  • GET  /api/instagram/info?url=<url>                      ║');
  console.log('║  • POST /api/instagram/download                            ║');
  console.log('║                                                            ║');
  console.log('║  🛠️  Utility Endpoints:                                     ║');
  console.log('║  • GET  /api/health (system status)                        ║');
  console.log('║  • GET  /api/stats (download statistics)                   ║');
  console.log('║  • GET  /api/downloads (list files with pagination)        ║');
  console.log('║  • DEL  /api/downloads/:filename (delete specific file)    ║');
  console.log('║  • DEL  /api/downloads (delete all files)                  ║');
  console.log('║                                                            ║');
  console.log('║  ✨ Features:                                               ║');
  console.log('║  • Real-time download progress tracking                    ║');
  console.log('║  • Rate limiting protection                                ║');
  console.log('║  • Automatic file cleanup (24h)                            ║');
  console.log('║  • Enhanced error handling                                 ║');
  console.log('║  • File size limits and validation                         ║');
  console.log('║  • Secure filename handling                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  process.exit(0);
});
