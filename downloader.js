// YouTube and Instagram Downloader
// This module handles actual video/media downloading

export class MediaDownloader {
  constructor() {
    this.corsProxy = 'https://corsproxy.io/?key=6780baad&url=';
    this.apiUrl = 'http://localhost:3000/api'; // Local API server
  }

  // ================================
  // YouTube Downloader (Using Local API)
  // ================================

  async getYouTubeVideoInfo(videoId) {
    try {
      // Try local API first
      const response = await fetch(`${this.apiUrl}/youtube/info/${videoId}`);
      if (response.ok) {
        const data = await response.json();
        return data.data;
      }

      // Fallback to noembed
      const fallbackResponse = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
      );
      const fallbackData = await fallbackResponse.json();

      return {
        videoId: videoId,
        title: fallbackData.title,
        author: fallbackData.author_name,
        thumbnail: fallbackData.thumbnail_url,
        duration: null,
      };
    } catch (error) {
      console.error('Error fetching YouTube info:', error);
      throw error;
    }
  }

  async downloadYouTubeVideo(videoId, quality = 'highest', format = 'mp4') {
    try {
      // Use local API ONLY
      const response = await fetch(`${this.apiUrl}/youtube/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          quality: quality,
          format: format,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.downloadUrl) {
          // Trigger direct download (no popup)
          const a = document.createElement('a');
          a.href = data.data.downloadUrl;
          a.download = data.data.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          return {
            success: true,
            message: 'Download started!',
            filename: data.data.filename,
            downloadUrl: data.data.downloadUrl,
          };
        } else {
          throw new Error(data.error || 'Download failed');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API request failed');
      }
    } catch (error) {
      console.error('Error downloading YouTube video:', error);
      throw new Error(
        `Download failed: ${error.message}. Make sure the API server is running on http://localhost:3000`
      );
    }
  }

  async downloadYouTubeAudio(videoId, format = 'mp3') {
    try {
      // Use local API ONLY
      const response = await fetch(`${this.apiUrl}/youtube/audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          format: format,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.downloadUrl) {
          // Trigger direct download (no popup)
          const a = document.createElement('a');
          a.href = data.data.downloadUrl;
          a.download = data.data.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          return {
            success: true,
            message: 'Audio download started!',
            filename: data.data.filename,
            downloadUrl: data.data.downloadUrl,
          };
        } else {
          throw new Error(data.error || 'Audio download failed');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API request failed');
      }
    } catch (error) {
      console.error('Error downloading YouTube audio:', error);
      throw new Error(
        `Audio download failed: ${error.message}. Make sure the API server is running on http://localhost:3000`
      );
    }
  }

  // ================================
  // Instagram Downloader (Using Local API)
  // ================================

  async getInstagramMediaInfo(postUrl) {
    try {
      // Try local API first
      const response = await fetch(
        `${this.apiUrl}/instagram/info?url=${encodeURIComponent(postUrl)}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.data;
      }

      // Fallback to placeholder
      const shortcode = this.extractInstagramShortcode(postUrl);
      return {
        shortcode: shortcode,
        mediaType: 'photo',
        thumbnail: 'https://via.placeholder.com/400',
        caption: 'Instagram content',
        username: 'username',
        url: postUrl,
      };
    } catch (error) {
      console.error('Error fetching Instagram info:', error);
      throw error;
    }
  }

  extractInstagramShortcode(url) {
    const patterns = [
      /instagram\.com\/p\/([^/]+)/,
      /instagram\.com\/reel\/([^/]+)/,
      /instagram\.com\/tv\/([^/]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  async downloadInstagramMedia(postUrl, quality = 'highest') {
    try {
      // Use local API ONLY
      const response = await fetch(`${this.apiUrl}/instagram/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: postUrl,
          quality: quality,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.files && data.data.files.length > 0) {
          // Trigger direct download for each file (no popup)
          data.data.files.forEach((file, index) => {
            setTimeout(() => {
              const a = document.createElement('a');
              a.href = file.downloadUrl;
              a.download = file.filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }, index * 500); // Stagger downloads to avoid browser blocking
          });
          return {
            success: true,
            message: `Downloaded ${data.data.files.length} file(s)`,
            files: data.data.files,
          };
        } else {
          throw new Error(data.error || 'No files found to download');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API request failed');
      }
    } catch (error) {
      console.error('Error downloading Instagram media:', error);
      throw new Error(
        `Instagram download failed: ${error.message}. Make sure the API server is running on http://localhost:3000`
      );
    }
  }

  async downloadInstagramStory(username, storyId) {
    try {
      // Stories require authentication and have limited availability
      const serviceUrl = `https://inflact.com/downloader/instagram/story/${username}`;
      window.open(serviceUrl, '_blank');
      return true;
    } catch (error) {
      console.error('Error downloading Instagram story:', error);
      throw error;
    }
  }

  // ================================
  // Advanced YouTube Download using Fetch
  // ================================

  async downloadYouTubeWithFetch(videoId, quality = '720p') {
    try {
      // This method attempts to fetch video data directly
      // Note: YouTube blocks direct access, so this needs a proxy

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const proxyUrl = `${this.corsProxy}${encodeURIComponent(videoUrl)}`;

      const response = await fetch(proxyUrl);
      const html = await response.text();

      // Parse the HTML to find video URLs
      // This is complex and YouTube changes their format frequently
      const videoUrls = this.parseYouTubeVideoUrls(html);

      if (videoUrls.length > 0) {
        // Download the first available URL
        const downloadUrl = videoUrls[0];
        const blob = await fetch(downloadUrl).then(r => r.blob());

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `youtube_${videoId}.mp4`;
        a.click();
        URL.revokeObjectURL(url);

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error with direct download:', error);
      throw error;
    }
  }

  parseYouTubeVideoUrls(html) {
    // This would need complex regex to extract URLs from YouTube's player config
    // YouTube's format changes frequently, so this is not recommended
    // Better to use a backend service with yt-dlp
    return [];
  }

  // ================================
  // Advanced Instagram Download
  // ================================

  async downloadInstagramWithApi(postUrl) {
    try {
      const shortcode = this.extractInstagramShortcode(postUrl);

      // Using a public Instagram API endpoint (may be rate-limited)
      const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const proxyUrl = `${this.corsProxy}${encodeURIComponent(apiUrl)}`;

      const response = await fetch(proxyUrl);
      const data = await response.json();

      // Extract media URL from response
      const mediaUrl = data?.items?.[0]?.video_url || data?.items?.[0]?.display_url;

      if (mediaUrl) {
        // Download the media
        const blob = await fetch(mediaUrl).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `instagram_${shortcode}.jpg`;
        a.click();
        URL.revokeObjectURL(url);

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error with Instagram API download:', error);
      throw error;
    }
  }

  // ================================
  // Utility Functions
  // ================================

  async downloadFromUrl(url, filename) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(downloadUrl);
      return true;
    } catch (error) {
      console.error('Error downloading from URL:', error);
      return false;
    }
  }

  openInNewTab(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ================================
  // Recommended Backend Integration
  // ================================

  async downloadWithBackend(type, url, options = {}) {
    try {
      // This is the RECOMMENDED approach for production
      // You would have a backend service that uses yt-dlp or similar

      const backendUrl = 'https://your-backend.com/api/download';
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type, // 'youtube' or 'instagram'
          url: url,
          quality: options.quality || 'highest',
          format: options.format || 'mp4',
        }),
      });

      const data = await response.json();

      if (data.downloadUrl) {
        await this.downloadFromUrl(data.downloadUrl, data.filename);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error with backend download:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const downloader = new MediaDownloader();
