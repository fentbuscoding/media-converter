// Import FFmpeg modules
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { downloader } from './downloader.js';

class MediaConverter {
  constructor() {
    // Core state
    this.selectedFiles = [];
    this.convertedMedia = [];
    this.isConverting = false;

    // View settings
    this.currentView = 'grid';

    // Resize settings
    this.aspectRatioLocked = false;
    this.originalAspectRatio = 1;
    this.resizeSettings = {
      enabled: false,
      maxWidth: null,
      maxHeight: null,
      quality: 0.9,
    };

    // Filter settings
    this.filterSettings = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
    };

    // Performance optimization
    this.debounceTimers = new Map();
    this.workerPool = null;

    // FFmpeg for video conversion
    this.ffmpeg = null;
    this.ffmpegLoaded = false;
    this.ffmpegLoading = false;

    // Initialize
    this.initialize();
  }

  async initialize() {
    try {
      this.initializeTheme();
      this.initializeEventListeners();
      this.initializeResizeControls();
      this.initializeFilterControls();
      this.initializeViewSwitching();
      this.initializeBatchOperations();
      console.log('MediaConverter initialized successfully');
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('Failed to initialize converter. Please refresh the page.');
    }
  }

  async loadFFmpeg() {
    if (this.ffmpegLoaded || this.ffmpegLoading) {
      return this.ffmpegLoaded;
    }

    this.ffmpegLoading = true;

    try {
      this.showNotification('loading video converter engine...', 'info');

      this.ffmpeg = new FFmpeg();

      // Set up logging
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      // Set up progress tracking
      this.ffmpeg.on('progress', ({ progress, time }) => {
        if (this.isConverting && progress > 0) {
          const percent = Math.round(progress * 100);
          this.updateProgress(percent, `converting video... ${percent}%`);
        }
      });

      // Load FFmpeg
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/esm';
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.ffmpegLoaded = true;
      this.showNotification('video converter ready! ✨', 'success');
      console.log('✅ FFmpeg.wasm loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      this.showNotification('video conversion unavailable - using fallback', 'warning');
      return false;
    } finally {
      this.ffmpegLoading = false;
    }
  }

  initializeEventListeners() {
    // Cache DOM elements
    this.elements = {
      fileInput: document.getElementById('fileInput'),
      uploadArea: document.getElementById('uploadArea'),
      convertBtn: document.getElementById('convertBtn'),
      mediaType: document.getElementById('mediaType'),
      formatSelect: document.getElementById('formatSelect'),
      videoFormatSelect: document.getElementById('videoFormatSelect'),
      qualitySlider: document.getElementById('qualitySlider'),
      qualityValue: document.getElementById('qualityValue'),
      themeToggle: document.getElementById('themeToggle'),
      advancedToggle: document.getElementById('advancedToggle'),
      progressSection: document.getElementById('progressSection'),
      previewSection: document.getElementById('previewSection'),
    };

    // Validate critical elements
    if (!this.elements.fileInput || !this.elements.uploadArea || !this.elements.convertBtn) {
      throw new Error('Critical elements missing from HTML');
    }

    // Theme toggle
    this.elements.themeToggle?.addEventListener('click', () => this.toggleTheme());

    // Advanced options toggle
    this.elements.advancedToggle?.addEventListener('click', () => this.toggleAdvancedOptions());

    // File handling
    this.elements.fileInput.addEventListener('change', e => this.handleFileSelect(e));
    this.elements.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
    this.elements.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.elements.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
    this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());

    // Convert button
    this.elements.convertBtn.addEventListener('click', () => this.convertMedia());

    // Media type and format changes
    this.elements.mediaType?.addEventListener('change', () => this.handleMediaTypeChange());
    this.elements.formatSelect?.addEventListener('change', () => this.handleFormatChange());
    this.elements.videoFormatSelect?.addEventListener('change', () =>
      this.handleVideoFormatChange()
    );

    // Quality slider with debounce
    this.elements.qualitySlider?.addEventListener(
      'input',
      this.debounce(e => {
        this.elements.qualityValue.textContent = e.target.value + '%';
      }, 100)
    );

    // Keyboard shortcuts
    this.initializeKeyboardShortcuts();

    // Initial format check
    this.handleFormatChange();
  }

  initializeKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      // Ctrl/Cmd + O: Open file dialog
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.elements.fileInput?.click();
      }

      // Ctrl/Cmd + Enter: Convert
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!this.isConverting && this.selectedFiles.length > 0) {
          this.convertMedia();
        }
      }

      // Escape: Clear selection
      if (e.key === 'Escape' && !this.isConverting) {
        this.clearSelection();
      }
    });
  }

  clearSelection() {
    this.selectedFiles = [];
    this.convertedMedia = [];
    this.elements.uploadArea.innerHTML = `
            <div class="upload-content">
                <div class="upload-icon">+</div>
                <h3>drag files here or click to select</h3>
                <p>images: webp, png, jpeg, gif, bmp</p>
                <p>videos: mp4, webm, avi, mov</p>
            </div>
        `;
    this.elements.previewSection.style.display = 'none';
    document.getElementById('optionsSection').style.display = 'none';
  }

  initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      document.getElementById('themeToggle').textContent = '☀️';
    }
  }

  toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeToggle');

    if (body.classList.contains('light-theme')) {
      body.classList.remove('light-theme');
      themeBtn.textContent = '🌙';
      localStorage.setItem('theme', 'dark');
    } else {
      body.classList.add('light-theme');
      themeBtn.textContent = '☀️';
      localStorage.setItem('theme', 'light');
    }
  }

  toggleAdvancedOptions() {
    const panel = document.getElementById('advancedOptions');
    const toggle = document.getElementById('advancedToggle');

    if (panel.style.display === 'none' || !panel.style.display) {
      panel.style.display = 'block';
      toggle.textContent = 'advanced options ▲';
      toggle.classList.add('expanded');
    } else {
      panel.style.display = 'none';
      toggle.textContent = 'advanced options ▼';
      toggle.classList.remove('expanded');
    }
  }

  initializeResizeControls() {
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const lockBtn = document.getElementById('lockAspect');

    // Check if elements exist before adding event listeners
    if (!widthInput || !heightInput || !lockBtn) {
      console.warn('Resize control elements not found');
      return;
    }

    lockBtn.addEventListener('click', () => {
      this.aspectRatioLocked = !this.aspectRatioLocked;
      lockBtn.classList.toggle('locked', this.aspectRatioLocked);
      lockBtn.textContent = this.aspectRatioLocked ? '🔒' : '🔓';
    });

    widthInput.addEventListener('input', e => {
      if (this.aspectRatioLocked && heightInput.value) {
        heightInput.value = Math.round(e.target.value / this.originalAspectRatio);
      }
    });

    heightInput.addEventListener('input', e => {
      if (this.aspectRatioLocked && widthInput.value) {
        widthInput.value = Math.round(e.target.value * this.originalAspectRatio);
      }
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const width = btn.dataset.width;
        const height = btn.dataset.height;
        if (width && height) {
          widthInput.value = width;
          heightInput.value = height;
          this.originalAspectRatio = width / height;
        }
      });
    });
  }

  initializeFilterControls() {
    const sliders = ['brightness', 'contrast', 'saturation'];
    sliders.forEach(filter => {
      const slider = document.getElementById(`${filter}Slider`);
      const value = document.getElementById(`${filter}Value`);

      if (slider && value) {
        slider.addEventListener('input', e => {
          value.textContent = e.target.value;
        });
      } else {
        console.warn(`Filter control elements not found for ${filter}`);
      }
    });
  }

  initializeViewControls() {
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', e => {
        viewBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentView = e.target.id.replace('View', '');
        this.updateView();
      });
    });
  }

  initializePresetButtons() {
    // Resize presets
    document.querySelectorAll('.resize-presets .preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const width = btn.dataset.width;
        const height = btn.dataset.height;
        document.getElementById('resizeWidth').value = width;
        document.getElementById('resizeHeight').value = height;
        this.originalAspectRatio = width / height;
      });
    });

    // Quality presets
    document.querySelectorAll('.compression-presets .preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const quality = btn.dataset.quality;
        const slider = document.getElementById('qualitySlider');
        slider.value = quality;
        document.getElementById('qualityValue').textContent = quality;
      });
    });
  }

  updateView() {
    const container = document.getElementById('imagesContainer');
    const chart = document.getElementById('sizeChart');

    container.className = `images-container ${this.currentView}-view`;

    if (this.currentView === 'comparison') {
      chart.style.display = 'block';
      this.updateSizeChart();
    } else {
      chart.style.display = 'none';
    }
  }

  updateSizeChart() {
    const chartContainer = document.getElementById('chartContainer');
    chartContainer.innerHTML = '';

    this.convertedMedia.forEach(media => {
      const item = document.createElement('div');
      item.className = 'chart-item';

      const savings = ((media.originalSize - media.convertedSize) / media.originalSize) * 100;
      const maxSize = Math.max(media.originalSize, media.convertedSize);
      const originalWidth = (media.originalSize / maxSize) * 100;
      const convertedWidth = (media.convertedSize / maxSize) * 100;

      item.innerHTML = `
                <div class="chart-label">${media.name.substring(0, 15)}...</div>
                <div class="chart-bar">
                    <div class="chart-fill ${savings > 0 ? 'savings' : ''}" style="width: ${originalWidth}%"></div>
                </div>
                <div class="chart-value">${savings > 0 ? '-' : '+'}${Math.abs(savings).toFixed(1)}%</div>
            `;

      chartContainer.appendChild(item);
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.add('dragover');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.remove('dragover');
  }

  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    await this.processFiles(files);
  }

  async handleFileSelect(e) {
    const files = Array.from(e.target.files);
    await this.processFiles(files);
  }

  async processFiles(files) {
    try {
      // Show loading state
      this.elements.uploadArea.innerHTML = `
                <div class="upload-content">
                    <div class="upload-icon loading">⏳</div>
                    <h3>processing files...</h3>
                    <p>analyzing ${files.length} file${files.length > 1 ? 's' : ''}...</p>
                </div>
            `;

      // Yield to browser
      await this.yieldToMain();

      // Filter and validate files
      const mediaFiles = files.filter(
        file => file.type.startsWith('image/') || file.type.startsWith('video/')
      );

      if (mediaFiles.length === 0) {
        this.showError(
          'no valid image or video files found. supported formats: png, jpeg, webp, gif, bmp, mp4, webm, avi, mov'
        );
        this.clearSelection();
        return;
      }

      // Check for rejected files
      const rejectedCount = files.length - mediaFiles.length;
      if (rejectedCount > 0) {
        this.showNotification(
          `${rejectedCount} unsupported file${rejectedCount > 1 ? 's' : ''} skipped`,
          'warning'
        );
      }

      // File size validation and warnings
      const totalSize = mediaFiles.reduce((sum, file) => sum + file.size, 0);
      const largeFiles = mediaFiles.filter(file => file.size > 10 * 1024 * 1024); // 10MB

      if (totalSize > 100 * 1024 * 1024) {
        // 100MB
        this.showNotification('large batch detected - processing may take a while', 'info');
      }

      if (largeFiles.length > 0) {
        this.showNotification(
          `${largeFiles.length} large file${largeFiles.length > 1 ? 's' : ''} detected - conversion may take longer`,
          'info'
        );
      }

      this.selectedFiles = mediaFiles;

      // Update UI progressively
      await this.yieldToMain();
      await this.showFileInfo();

      await this.yieldToMain();
      this.showOptionsSection();

      await this.yieldToMain();
      await this.updateMediaTypeBasedOnFiles();
    } catch (error) {
      console.error('Error processing files:', error);
      this.showError('failed to process files. please try again.');
      this.clearSelection();
    }
  }

  updateMediaTypeBasedOnFiles() {
    const hasImages = this.selectedFiles.some(file => file.type.startsWith('image/'));
    const hasVideos = this.selectedFiles.some(file => file.type.startsWith('video/'));

    if (hasVideos && hasImages) {
      // Mixed file types
      document.getElementById('mediaType').value = 'image';
      this.handleMediaTypeChange();
      this.showNotification(
        'Mixed file types detected - convert videos and images separately for best results'
      );
    } else if (hasVideos) {
      // Only videos
      document.getElementById('mediaType').value = 'video';
      this.handleMediaTypeChange();
      this.suggestVideoFormat();
    } else {
      // Only images
      document.getElementById('mediaType').value = 'image';
      this.handleMediaTypeChange();
      this.suggestImageFormat();
    }
  }

  suggestImageFormat() {
    const formats = this.selectedFiles.map(file => this.getFileFormat(file));
    const uniqueFormats = [...new Set(formats)];

    // Suggest optimal format based on input
    let suggestedFormat = 'webp'; // Default modern format

    if (uniqueFormats.includes('png') && formats.length === 1) {
      // Single PNG might need transparency
      suggestedFormat = 'png';
    } else if (uniqueFormats.every(f => ['jpg', 'jpeg'].includes(f))) {
      // All JPEG files
      suggestedFormat = 'jpeg';
    }

    const formatSelect = document.getElementById('formatSelect');
    if (formatSelect) {
      formatSelect.value = suggestedFormat;
    }

    this.showNotification(
      `Detected ${uniqueFormats.join(', ').toUpperCase()} files - suggested output: ${suggestedFormat.toUpperCase()}`
    );
  }

  suggestVideoFormat() {
    const formats = this.selectedFiles.map(file => this.getFileFormat(file));
    const uniqueFormats = [...new Set(formats)];

    // Suggest optimal format
    const suggestedFormat = 'mp4'; // Most compatible

    const videoFormatSelect = document.getElementById('videoFormatSelect');
    if (videoFormatSelect) {
      videoFormatSelect.value = suggestedFormat;
    }

    this.showNotification(
      `Detected ${uniqueFormats.join(', ').toUpperCase()} videos - suggested output: ${suggestedFormat.toUpperCase()}`
    );
  }

  showFileInfo() {
    const uploadArea = document.getElementById('uploadArea');
    const fileCount = this.selectedFiles.length;
    const totalSize = this.formatBytes(
      this.selectedFiles.reduce((sum, file) => sum + file.size, 0)
    );

    // Create detailed file list
    let fileDetailsHtml = '';
    if (fileCount <= 5) {
      // Show individual files if 5 or fewer
      fileDetailsHtml = '<div class="file-details-list">';
      this.selectedFiles.forEach(file => {
        const detectedFormat = this.getFileFormat(file);
        const fileSize = this.formatBytes(file.size);
        fileDetailsHtml += `
                    <div class="file-detail-item">
                        <span class="file-name">${file.name}</span>
                        <span class="file-info">${detectedFormat.toUpperCase()} • ${fileSize}</span>
                    </div>
                `;
      });
      fileDetailsHtml += '</div>';
    }

    uploadArea.innerHTML = `
            <div class="upload-content">
                <div class="upload-icon">✓</div>
                <h3>${fileCount} file${fileCount > 1 ? 's' : ''} selected</h3>
                <p>total: ${totalSize}</p>
                ${fileDetailsHtml}
                <p class="change-files">click to change selection</p>
            </div>
        `;
  }

  getFileFormat(file) {
    // Extract format from MIME type or file extension
    if (file.type) {
      const mimeFormat = file.type.split('/')[1];
      // Handle common MIME type variations
      const formatMap = {
        jpeg: 'jpg',
        'svg+xml': 'svg',
        'x-ms-wmv': 'wmv',
        quicktime: 'mov',
      };
      return formatMap[mimeFormat] || mimeFormat;
    }

    // Fallback to file extension if MIME type unavailable
    const extension = file.name.split('.').pop().toLowerCase();
    return extension || 'unknown';
  }

  showOptionsSection() {
    document.getElementById('optionsSection').style.display = 'block';
    document.getElementById('optionsSection').scrollIntoView({ behavior: 'smooth' });
  }

  handleMediaTypeChange() {
    const mediaType = document.getElementById('mediaType').value;
    const imageFormats = document.getElementById('imageFormats');
    const videoFormats = document.getElementById('videoFormats');

    if (mediaType === 'video') {
      imageFormats.style.display = 'none';
      videoFormats.style.display = 'block';
      this.handleVideoFormatChange();
    } else {
      imageFormats.style.display = 'block';
      videoFormats.style.display = 'none';
      this.handleFormatChange();
    }
  }

  handleFormatChange() {
    const format = document.getElementById('formatSelect').value;
    const qualityGroup = document.getElementById('qualityGroup');

    // Show quality slider for JPEG and WebP
    if (format === 'jpeg' || format === 'webp') {
      qualityGroup.style.display = 'block';
    } else {
      qualityGroup.style.display = 'none';
    }
  }

  handleVideoFormatChange() {
    // For now, hide quality for videos (could be implemented later)
    const qualityGroup = document.getElementById('qualityGroup');
    qualityGroup.style.display = 'none';
  }

  async convertMedia() {
    if (this.selectedFiles.length === 0) {
      this.showError('please select files first');
      return;
    }

    if (this.isConverting) {
      this.showNotification('conversion already in progress', 'warning');
      return;
    }

    this.isConverting = true;

    const mediaType = this.elements.mediaType.value;
    const format =
      mediaType === 'video'
        ? this.elements.videoFormatSelect.value
        : this.elements.formatSelect.value;
    const quality = parseInt(this.elements.qualitySlider.value) / 100;

    // Load FFmpeg if converting videos
    const hasVideoFiles = this.selectedFiles.some(f => f.type.startsWith('video/'));
    if (hasVideoFiles && !this.ffmpegLoaded) {
      this.showNotification('preparing video converter... please wait', 'info');
      const loaded = await this.loadFFmpeg();
      if (!loaded) {
        this.showNotification('video conversion unavailable - will rename only', 'warning');
      }
    }

    // UI state management
    this.setConvertButtonState(true, 'converting...');
    this.showProgressSection();
    this.convertedMedia = [];

    const startTime = performance.now();
    let successCount = 0;
    let failureCount = 0;

    try {
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];
        const progress = ((i + 1) / this.selectedFiles.length) * 100;

        this.updateProgress(
          progress,
          `processing ${i + 1}/${this.selectedFiles.length}: ${this.truncateFileName(file.name, 30)}`
        );

        try {
          let convertedMedia;
          if (file.type.startsWith('image/')) {
            convertedMedia = await this.convertSingleImageAsync(file, format, quality, i);
          } else if (file.type.startsWith('video/')) {
            convertedMedia = await this.convertSingleVideoAsync(file, format, i);
          }

          if (convertedMedia) {
            this.convertedMedia.push(convertedMedia);
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to convert ${file.name}:`, error);
          failureCount++;
        }

        // Yield to browser
        await this.yieldToMain();
      }

      const endTime = performance.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      this.hideProgressSection();
      await this.showPreviewSection();

      // Show completion summary
      const summary =
        `converted ${successCount} file${successCount !== 1 ? 's' : ''} in ${duration}s` +
        (failureCount > 0 ? ` (${failureCount} failed)` : '');
      this.showNotification(summary, failureCount > 0 ? 'warning' : 'success');
    } catch (error) {
      console.error('Conversion error:', error);
      this.showError('conversion failed. please try again.');
      this.hideProgressSection();
    } finally {
      this.isConverting = false;
      this.setConvertButtonState(false, 'convert');
    }
  }

  setConvertButtonState(disabled, text) {
    if (this.elements.convertBtn) {
      this.elements.convertBtn.disabled = disabled;
      this.elements.convertBtn.textContent = text;
      this.elements.convertBtn.classList.toggle('processing', disabled);
    }
  }

  truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) return fileName;
    const ext = fileName.split('.').pop();
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncated = nameWithoutExt.substring(0, maxLength - ext.length - 4);
    return `${truncated}...${ext}`;
  }

  // Helper function to yield control back to the browser
  async yieldToMain() {
    return new Promise(resolve => {
      setTimeout(resolve, 0);
    });
  }

  async convertSingleImageAsync(file, targetFormat, quality, index = 0) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', {
        alpha: targetFormat === 'png' || targetFormat === 'webp',
        willReadFrequently: false,
      });
      const img = new Image();
      const fileURL = URL.createObjectURL(file);

      const cleanup = () => URL.revokeObjectURL(fileURL);

      img.onload = async () => {
        try {
          // Yield before processing
          await this.yieldToMain();

          // Calculate dimensions with aspect ratio support
          const dimensions = this.calculateResizeDimensions(img.width, img.height);
          canvas.width = dimensions.width;
          canvas.height = dimensions.height;

          // Apply image filters
          const brightness = this.elements.brightnessSlider
            ? parseInt(this.elements.brightnessSlider.value)
            : 0;
          const contrast = this.elements.contrastSlider
            ? parseInt(this.elements.contrastSlider.value)
            : 0;
          const saturation = this.elements.saturationSlider
            ? parseInt(this.elements.saturationSlider.value)
            : 0;

          ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`;

          // High-quality image scaling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

          // Yield before conversion
          await this.yieldToMain();

          // Apply batch rename pattern
          const pattern = this.elements.filenamePattern?.value || '{name}';
          const fileName = this.applyFileNamePattern(pattern, file.name, index);

          // Convert to target format
          const mimeType = this.getMimeType(targetFormat);
          const dataURL =
            targetFormat === 'jpeg' || targetFormat === 'webp'
              ? canvas.toDataURL(mimeType, quality)
              : canvas.toDataURL(mimeType);

          // Create blob efficiently
          const response = await fetch(dataURL);
          const blob = await response.blob();

          const convertedFile = {
            name: this.getConvertedFileName(fileName, targetFormat),
            blob: blob,
            dataURL: dataURL,
            originalSize: file.size,
            convertedSize: blob.size,
            format: targetFormat.toUpperCase(),
            dimensions: `${dimensions.width} × ${dimensions.height}`,
            originalDimensions: `${img.width} × ${img.height}`,
            compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1),
          };

          cleanup();
          resolve(convertedFile);
        } catch (error) {
          cleanup();
          console.error(`Conversion error for ${file.name}:`, error);
          reject(new Error(`failed to convert ${file.name}: ${error.message}`));
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error(`failed to load image: ${file.name}`));
      };

      img.src = fileURL;
    });
  }

  calculateResizeDimensions(originalWidth, originalHeight) {
    const widthInput = this.elements.resizeWidth?.value;
    const heightInput = this.elements.resizeHeight?.value;

    const width = parseInt(widthInput) || originalWidth;
    const height = parseInt(heightInput) || originalHeight;

    // No resize if no dimensions specified
    if (!widthInput && !heightInput) {
      return { width: originalWidth, height: originalHeight };
    }

    // Aspect ratio lock enabled
    if (this.elements.lockAspect?.checked) {
      const aspectRatio = originalWidth / originalHeight;

      if (widthInput && !heightInput) {
        return {
          width,
          height: Math.round(width / aspectRatio),
        };
      } else if (heightInput && !widthInput) {
        return {
          width: Math.round(height * aspectRatio),
          height,
        };
      }
    }

    return { width, height };
  }

  applyFileNamePattern(pattern, originalName, index) {
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    const ext = originalName.split('.').pop();
    const now = new Date();

    return pattern
      .replace('{name}', nameWithoutExt)
      .replace('{index}', String(index + 1).padStart(3, '0'))
      .replace('{format}', ext.toLowerCase())
      .replace('{original_format}', ext.toLowerCase())
      .replace('{date}', now.toISOString().split('T')[0])
      .replace('{time}', now.toTimeString().split(' ')[0].replace(/:/g, '-'))
      .replace('{timestamp}', Date.now());
  }

  async convertSingleVideoAsync(file, targetFormat, index = 0) {
    // Try real FFmpeg conversion first
    if (await this.convertVideoWithFFmpeg(file, targetFormat, index)) {
      return await this.convertVideoWithFFmpeg(file, targetFormat, index);
    }

    // Fallback to rename-only mode
    return new Promise(async (resolve, reject) => {
      try {
        await this.yieldToMain();

        const pattern = this.elements.filenamePattern?.value || '{name}';
        const fileName = this.applyFileNamePattern(pattern, file.name, index);
        const videoURL = URL.createObjectURL(file);

        // Load video metadata
        const video = document.createElement('video');
        video.src = videoURL;

        video.onloadedmetadata = () => {
          const convertedFile = {
            name: this.getConvertedFileName(fileName, targetFormat),
            blob: file,
            dataURL: videoURL,
            originalSize: file.size,
            convertedSize: file.size,
            format: targetFormat.toUpperCase(),
            dimensions: `${Math.round(video.videoWidth)} × ${Math.round(video.videoHeight)}`,
            duration: `${Math.round(video.duration)}s`,
            isVideo: true,
            requiresServerConversion: true,
          };
          resolve(convertedFile);
        };

        video.onerror = () => {
          URL.revokeObjectURL(videoURL);
          reject(new Error(`failed to load video: ${file.name}`));
        };
      } catch (error) {
        console.error(`Video processing error for ${file.name}:`, error);
        reject(new Error(`failed to process video: ${error.message}`));
      }
    });
  }

  async convertVideoWithFFmpeg(file, targetFormat, index = 0) {
    try {
      // Load FFmpeg if not already loaded
      if (!this.ffmpegLoaded) {
        const loaded = await this.loadFFmpeg();
        if (!loaded) {
          return null; // Fall back to rename mode
        }
      }

      await this.yieldToMain();

      const inputName = `input_${Date.now()}.${file.name.split('.').pop()}`;
      const outputName = `output_${Date.now()}.${targetFormat}`;

      // Write input file to FFmpeg virtual file system
      const fileData = await file.arrayBuffer();
      await this.ffmpeg.writeFile(inputName, new Uint8Array(fileData));

      // Build FFmpeg command based on format
      const args = this.buildFFmpegArgs(inputName, outputName, targetFormat);

      console.log(`[FFmpeg] Converting ${file.name} to ${targetFormat}`);
      console.log(`[FFmpeg] Command: ffmpeg ${args.join(' ')}`);

      // Execute conversion
      await this.ffmpeg.exec(args);

      // Read output file
      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer], { type: `video/${targetFormat}` });

      // Clean up virtual file system
      try {
        await this.ffmpeg.deleteFile(inputName);
        await this.ffmpeg.deleteFile(outputName);
      } catch (e) {
        console.warn('[FFmpeg] Cleanup warning:', e);
      }

      // Get video metadata
      const videoURL = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = videoURL;

      return new Promise(resolve => {
        video.onloadedmetadata = () => {
          const pattern = this.elements.filenamePattern?.value || '{name}';
          const fileName = this.applyFileNamePattern(pattern, file.name, index);

          const convertedFile = {
            name: this.getConvertedFileName(fileName, targetFormat),
            blob: blob,
            dataURL: videoURL,
            originalSize: file.size,
            convertedSize: blob.size,
            format: targetFormat.toUpperCase(),
            dimensions: `${Math.round(video.videoWidth)} × ${Math.round(video.videoHeight)}`,
            duration: `${Math.round(video.duration)}s`,
            isVideo: true,
            compressionRatio: ((1 - blob.size / file.size) * 100).toFixed(1),
          };

          console.log(
            `✅ Converted ${file.name} to ${targetFormat} (${this.formatBytes(file.size)} → ${this.formatBytes(blob.size)})`
          );
          resolve(convertedFile);
        };

        video.onerror = () => {
          resolve(null); // Return null to trigger fallback
        };
      });
    } catch (error) {
      console.error(`FFmpeg conversion error for ${file.name}:`, error);
      return null; // Return null to trigger fallback
    }
  }

  buildFFmpegArgs(inputName, outputName, targetFormat) {
    const args = ['-i', inputName];

    // Get quality setting
    const quality = parseInt(this.elements.qualitySlider?.value || 85);

    // Format-specific encoding settings
    switch (targetFormat.toLowerCase()) {
      case 'mp4':
        args.push(
          '-c:v',
          'libx264', // H.264 codec
          '-preset',
          'medium', // Balance speed/quality
          '-crf',
          String(Math.round(51 - quality * 0.51)), // Quality (0-51, lower is better)
          '-c:a',
          'aac', // AAC audio codec
          '-b:a',
          '128k' // Audio bitrate
        );
        break;

      case 'webm':
        args.push(
          '-c:v',
          'libvpx-vp9', // VP9 codec
          '-crf',
          String(Math.round(63 - quality * 0.63)), // Quality
          '-b:v',
          '0', // Constant quality mode
          '-c:a',
          'libopus', // Opus audio codec
          '-b:a',
          '128k'
        );
        break;

      case 'avi':
        args.push(
          '-c:v',
          'mpeg4', // MPEG-4 codec
          '-q:v',
          String(Math.round(31 - quality * 0.29)), // Quality (2-31)
          '-c:a',
          'mp3', // MP3 audio
          '-b:a',
          '128k'
        );
        break;

      case 'mov':
        args.push(
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          String(Math.round(51 - quality * 0.51)),
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart' // Enable streaming
        );
        break;

      default:
        // Default encoding
        args.push('-c:v', 'libx264', '-c:a', 'aac');
    }

    // Add resize if specified
    const widthInput = this.elements.resizeWidth?.value;
    const heightInput = this.elements.resizeHeight?.value;

    if (widthInput || heightInput) {
      const width = widthInput || -1; // -1 means auto
      const height = heightInput || -1;
      args.push('-vf', `scale=${width}:${height}`);
    }

    args.push('-y', outputName); // Overwrite output

    return args;
  }

  async convertSingleVideo(file, targetFormat) {
    // Note: Full video conversion requires FFmpeg.js or server-side processing
    // For now, we'll create a placeholder that shows the video info
    // In a production app, you'd integrate FFmpeg.js here

    return new Promise(resolve => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const convertedFile = {
          name: this.getConvertedFileName(file.name, targetFormat),
          blob: file, // Placeholder - would be converted blob in real implementation
          dataURL: video.src,
          originalSize: file.size,
          convertedSize: file.size, // Placeholder
          format: targetFormat.toUpperCase(),
          dimensions: `${video.videoWidth} × ${video.videoHeight}`,
          duration: `${Math.round(video.duration)}s`,
          isVideo: true,
        };
        resolve(convertedFile);
      };

      video.onerror = () => {
        // If video loading fails, still create a basic entry
        const convertedFile = {
          name: this.getConvertedFileName(file.name, targetFormat),
          blob: file,
          dataURL: URL.createObjectURL(file),
          originalSize: file.size,
          convertedSize: file.size,
          format: targetFormat.toUpperCase(),
          dimensions: 'unknown',
          duration: 'unknown',
          isVideo: true,
        };
        resolve(convertedFile);
      };
    });
  }

  getMimeType(format) {
    const mimeTypes = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
    };
    return mimeTypes[format] || 'image/png';
  }

  getConvertedFileName(originalName, targetFormat) {
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    return `${nameWithoutExt}.${targetFormat}`;
  }

  showProgressSection() {
    const progressSection = document.getElementById('progressSection');
    const convertBtn = document.getElementById('convertBtn');

    progressSection.style.display = 'block';
    convertBtn.disabled = true;
    progressSection.scrollIntoView({ behavior: 'smooth' });

    // Initialize progress
    this.updateProgress(0, 'preparing...');
  }

  hideProgressSection() {
    const progressSection = document.getElementById('progressSection');
    const convertBtn = document.getElementById('convertBtn');

    // Show completion message briefly
    this.updateProgress(100, 'conversion complete!');

    setTimeout(() => {
      progressSection.style.display = 'none';
      convertBtn.disabled = false;
    }, 800);
  }

  updateProgress(percentage, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) {
      progressFill.style.width = `${Math.round(percentage)}%`;
    }

    if (progressText) {
      progressText.textContent = text;
    }

    // Force repaint to show progress immediately
    if (progressFill) {
      progressFill.offsetHeight;
    }
  }

  showPreviewSection() {
    const previewSection = document.getElementById('previewSection');
    const imagesContainer = document.getElementById('imagesContainer');

    // Clear previous content
    imagesContainer.innerHTML = '';

    // Create media cards
    this.convertedMedia.forEach((media, index) => {
      const mediaCard = this.createMediaCard(media, index);
      imagesContainer.appendChild(mediaCard);
    });

    previewSection.style.display = 'block';
    this.updateViewDisplay();
    previewSection.scrollIntoView({ behavior: 'smooth' });
  }

  createMediaCard(media, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.style.animationDelay = `${index * 0.1}s`;

    const compressionRatio = (
      ((media.originalSize - media.convertedSize) / media.originalSize) *
      100
    ).toFixed(1);
    const compressionText =
      media.convertedSize < media.originalSize
        ? `${compressionRatio}% smaller`
        : compressionRatio == 0
          ? 'same size'
          : `${Math.abs(compressionRatio)}% larger`;

    if (this.currentView === 'comparison' && !media.isVideo) {
      return this.createComparisonCard(media, index, compressionText);
    }

    let mediaElement;
    if (media.isVideo) {
      mediaElement = `<video src="${media.dataURL}" class="image-preview" controls muted autoplay loop>
                Your browser does not support the video tag.
            </video>`;
    } else {
      mediaElement = `<img src="${media.dataURL}" alt="Converted media" class="image-preview">`;
    }

    const durationInfo = media.duration
      ? `<p><strong>duration:</strong> ${media.duration}</p>`
      : '';
    const originalDimensionsInfo = media.originalDimensions
      ? `<p><strong>original size:</strong> ${media.originalDimensions}</p>`
      : '';

    card.innerHTML = `
            ${mediaElement}
            <div class="image-info">
                <h4>${media.name}</h4>
                <p><strong>format:</strong> ${media.format}</p>
                <p><strong>size:</strong> ${media.dimensions}</p>
                ${originalDimensionsInfo}
                ${durationInfo}
                <p><strong>file size:</strong> ${this.formatBytes(media.originalSize)} → ${this.formatBytes(media.convertedSize)}</p>
                <p><strong>compression:</strong> ${compressionText}</p>
            </div>
            <a href="${media.dataURL}" download="${media.name}" class="download-btn">
                download
            </a>
        `;

    return card;
  }

  createComparisonCard(media, index, compressionText) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.style.animationDelay = `${index * 0.1}s`;

    let originalElement, convertedElement;

    if (media.isVideo) {
      originalElement = `<video src="${URL.createObjectURL(this.selectedFiles[index])}" class="image-preview" controls muted>
                Your browser does not support the video tag.
            </video>`;

      convertedElement = `<video src="${media.dataURL}" class="image-preview" controls muted>
                Your browser does not support the video tag.
            </video>`;
    } else {
      originalElement = `<img src="${URL.createObjectURL(this.selectedFiles[index])}" alt="Original" class="image-preview">`;
      convertedElement = `<img src="${media.dataURL}" alt="Converted" class="image-preview">`;
    }

    card.innerHTML = `
            <div class="comparison-side">
                <h5>original</h5>
                ${originalElement}
                <p>${media.originalDimensions || 'N/A'}</p>
                <p>${this.formatBytes(media.originalSize)}</p>
            </div>
            <div class="comparison-side">
                <h5>converted</h5>
                ${convertedElement}
                <p>${media.dimensions}</p>
                <p>${this.formatBytes(media.convertedSize)}</p>
                <p>${compressionText}</p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
                <a href="${media.dataURL}" download="${media.name}" class="download-btn">
                    download
                </a>
            </div>
        `;

    return card;
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 bytes';
    const k = 1024;
    const sizes = ['bytes', 'kb', 'mb', 'gb', 'tb'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2);
    return `${value} ${sizes[i]}`;
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.getElementById('notification');
    if (existing) existing.remove();

    // Create notification
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = `notification notification-${type}`;

    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
    };

    notification.innerHTML = `
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
        `;

    document.body.appendChild(notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('notification-show');
    });

    // Auto-remove
    setTimeout(
      () => {
        notification.classList.remove('notification-show');
        setTimeout(() => notification.remove(), 300);
      },
      type === 'error' ? 7000 : 4000
    );
  }

  initializeViewSwitching() {
    const viewButtons = document.querySelectorAll('.view-btn');

    if (viewButtons.length === 0) {
      console.warn('View switching buttons not found');
      return;
    }

    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Update active button
        viewButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update current view
        this.currentView = button.dataset.view;

        // Update display
        this.updateView();
      });
    });
  }

  updateView() {
    const imagesContainer = document.getElementById('imagesContainer');

    if (!imagesContainer) {
      console.warn('Images container not found');
      return;
    }

    // Update container class for styling
    imagesContainer.className = `images-container view-${this.currentView}`;

    // If we have converted media, recreate the cards with new view
    if (this.convertedMedia.length > 0) {
      this.recreateMediaCards();
    }
  }

  updateViewDisplay() {
    const imagesContainer = document.getElementById('imagesContainer');

    if (!imagesContainer) {
      console.warn('Images container not found');
      return;
    }

    // Update container class for styling
    imagesContainer.className = `images-container view-${this.currentView}`;
  }

  recreateMediaCards() {
    const imagesContainer = document.getElementById('imagesContainer');

    if (!imagesContainer) {
      return;
    }

    // Clear previous content
    imagesContainer.innerHTML = '';

    // Create media cards without calling updateView again
    this.convertedMedia.forEach((media, index) => {
      const mediaCard = this.createMediaCard(media, index);
      imagesContainer.appendChild(mediaCard);
    });
  }

  initializeBatchOperations() {
    // Handle different types of preset buttons
    document.querySelectorAll('.preset-btn').forEach(button => {
      button.addEventListener('click', () => {
        // Handle size presets
        if (button.dataset.width && button.dataset.height) {
          const widthInput = document.getElementById('resizeWidth');
          const heightInput = document.getElementById('resizeHeight');
          if (widthInput) widthInput.value = button.dataset.width;
          if (heightInput) heightInput.value = button.dataset.height;
          this.originalAspectRatio = button.dataset.width / button.dataset.height;
        }

        // Handle quality presets
        if (button.dataset.quality) {
          const qualitySlider = document.getElementById('qualitySlider');
          const qualityValue = document.getElementById('qualityValue');
          if (qualitySlider) qualitySlider.value = button.dataset.quality;
          if (qualityValue) qualityValue.textContent = button.dataset.quality + '%';
        }

        // Handle advanced presets (if any have data-preset)
        if (button.dataset.preset) {
          this.applyPreset(button.dataset.preset);
        }
      });
    });

    // Batch rename functionality - Note: no separate button, will apply during conversion
    const renamePattern = document.getElementById('filenamePattern');

    if (!renamePattern) {
      console.warn('Batch rename pattern input not found');
    }

    // Auto optimize and metadata stripping
    const stripMetadata = document.getElementById('stripMetadata');
    const autoOptimize = document.getElementById('autoOptimize');

    if (stripMetadata) {
      stripMetadata.addEventListener('change', () => {
        console.log('Strip metadata:', stripMetadata.checked);
      });
    }

    if (autoOptimize) {
      autoOptimize.addEventListener('change', () => {
        console.log('Auto optimize:', autoOptimize.checked);
      });
    }
  }

  applyPreset(preset) {
    const presets = {
      'web-optimized': {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 85,
        format: 'webp',
      },
      'social-media': {
        maxWidth: 1080,
        maxHeight: 1080,
        quality: 90,
        format: 'jpeg',
      },
      'print-ready': {
        maxWidth: 3000,
        maxHeight: 3000,
        quality: 95,
        format: 'png',
      },
      thumbnail: {
        maxWidth: 300,
        maxHeight: 300,
        quality: 80,
        format: 'jpeg',
      },
    };

    const config = presets[preset];
    if (!config) return;

    // Apply settings to controls with error checking
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const formatSelect = document.getElementById('formatSelect');

    if (widthInput) widthInput.value = config.maxWidth;
    if (heightInput) heightInput.value = config.maxHeight;
    if (qualitySlider) qualitySlider.value = config.quality;
    if (qualityValue) qualityValue.textContent = config.quality + '%';
    if (formatSelect) formatSelect.value = config.format;

    // Update resize settings
    this.resizeSettings.maxWidth = config.maxWidth;
    this.resizeSettings.maxHeight = config.maxHeight;
    this.resizeSettings.quality = config.quality / 100;

    // Show notification
    this.showNotification(`Applied ${preset.replace('-', ' ')} preset`);
  }

  batchRename(pattern) {
    if (!pattern || this.convertedMedia.length === 0) {
      // Get pattern from input if not provided
      const patternInput = document.getElementById('filenamePattern');
      pattern = patternInput ? patternInput.value : '{name}';
    }

    this.convertedMedia.forEach((media, index) => {
      const extension = media.format;
      const originalFile = this.selectedFiles[index];
      const originalFormat = originalFile ? this.getFileFormat(originalFile) : 'unknown';
      let newName = pattern;

      // Replace placeholders
      newName = newName.replace('{i}', index + 1);
      newName = newName.replace('{index}', index + 1);
      newName = newName.replace('{name}', media.originalName || 'converted');
      newName = newName.replace('{format}', extension);
      newName = newName.replace('{original_format}', originalFormat);
      newName = newName.replace('{date}', new Date().toISOString().split('T')[0]);
      newName = newName.replace(
        '{time}',
        new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
      );

      media.name = `${newName}.${extension}`;
    });

    // Update preview
    this.showPreviewSection();
    this.showNotification('Batch rename applied');
  }

  showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--accent-color);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // Debounce function to prevent excessive UI updates
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Throttle function for performance-critical operations
  throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

// Initialize the converter when the page loads
document.addEventListener('DOMContentLoaded', () => {
  window.converter = new MediaConverter();
});

// Add some utility functions for better UX
document.addEventListener('DOMContentLoaded', () => {
  // Add download all functionality
  const addDownloadAllButton = () => {
    const previewSection = document.getElementById('previewSection');
    if (previewSection && !document.getElementById('downloadAllBtn')) {
      const downloadAllBtn = document.createElement('button');
      downloadAllBtn.id = 'downloadAllBtn';
      downloadAllBtn.className = 'convert-btn';
      downloadAllBtn.style.marginBottom = '20px';
      downloadAllBtn.innerHTML = 'download all';
      downloadAllBtn.addEventListener('click', downloadAllAsZip);

      const h3 = previewSection.querySelector('h3');
      h3.parentNode.insertBefore(downloadAllBtn, h3.nextSibling);
    }
  };

  // Function to download all images as ZIP (requires JSZip library)
  const downloadAllAsZip = async () => {
    // For simplicity, we'll trigger individual downloads
    // In a production app, you might want to use JSZip library
    const downloadLinks = document.querySelectorAll('.download-btn');
    downloadLinks.forEach((link, index) => {
      setTimeout(() => {
        link.click();
      }, index * 500); // Stagger downloads
    });
  };

  // Listen for when images are converted to add download all button
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        const imagesContainer = document.getElementById('imagesContainer');
        if (imagesContainer && imagesContainer.children.length > 1) {
          addDownloadAllButton();
        }
      }
    });
  });

  const imagesContainer = document.getElementById('imagesContainer');
  if (imagesContainer) {
    observer.observe(imagesContainer, { childList: true });
  }

  // ================================
  // Mode Switcher Functionality
  // ================================

  const modeTabs = document.querySelectorAll('.mode-tab');
  const converterModes = {
    file: document.getElementById('fileMode'),
    youtube: document.getElementById('youtubeMode'),
    instagram: document.getElementById('instagramMode'),
  };

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;

      // Update active tab
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show selected mode, hide others
      Object.keys(converterModes).forEach(key => {
        if (converterModes[key]) {
          converterModes[key].style.display = key === mode ? 'block' : 'none';
        }
      });

      // Show notification
      const modeNames = {
        file: 'File Converter',
        youtube: 'YouTube Downloader',
        instagram: 'Instagram Downloader',
      };
      window.converter?.showNotification(`switched to ${modeNames[mode]} ✨`, 'success');
    });
  });

  // ================================
  // YouTube Downloader Functionality
  // ================================

  const youtubeElements = {
    urlInput: document.getElementById('youtubeUrl'),
    fetchBtn: document.getElementById('fetchVideoBtn'),
    videoInfo: document.getElementById('videoInfo'),
    thumbnail: document.getElementById('videoThumbnail'),
    title: document.getElementById('videoTitle'),
    author: document.getElementById('videoAuthor'),
    duration: document.getElementById('videoDuration'),
    downloadType: document.getElementById('downloadType'),
    videoQuality: document.getElementById('videoQuality'),
    audioFormat: document.getElementById('audioFormat'),
    ytVideoFormat: document.getElementById('ytVideoFormat'),
    videoQualityGroup: document.getElementById('videoQualityGroup'),
    audioFormatGroup: document.getElementById('audioFormatGroup'),
    videoFormatGroup: document.getElementById('videoFormatGroup'),
    downloadBtn: document.getElementById('downloadVideoBtn'),
  };

  let currentVideoData = null;

  // Toggle download options based on type
  youtubeElements.downloadType?.addEventListener('change', e => {
    const isAudioOnly = e.target.value === 'audio';
    youtubeElements.videoQualityGroup.style.display = isAudioOnly ? 'none' : 'block';
    youtubeElements.videoFormatGroup.style.display = isAudioOnly ? 'none' : 'block';
    youtubeElements.audioFormatGroup.style.display = isAudioOnly ? 'block' : 'none';
  });

  // Extract video ID from URL
  function extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Format duration
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  // Fetch video info from backend API
  youtubeElements.fetchBtn?.addEventListener('click', async () => {
    const url = youtubeElements.urlInput.value.trim();

    if (!url) {
      window.converter?.showNotification('please enter a youtube URL', 'error');
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      window.converter?.showNotification('invalid youtube URL', 'error');
      return;
    }

    youtubeElements.fetchBtn.disabled = true;
    youtubeElements.fetchBtn.textContent = 'fetching...';

    try {
      // Use backend API for video info
      const response = await fetch(`http://localhost:3000/api/youtube/info/${videoId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch video info');
      }

      const data = result.data;

      currentVideoData = {
        videoId: data.videoId,
        title: data.title,
        author: data.author,
        thumbnail: data.thumbnail,
        duration: data.duration,
        formats: data.formats,
        url: url,
      };

      // Display video info
      youtubeElements.thumbnail.src = currentVideoData.thumbnail;
      youtubeElements.title.textContent = currentVideoData.title;
      youtubeElements.author.textContent = currentVideoData.author;
      youtubeElements.duration.textContent = `Duration: ${formatDuration(currentVideoData.duration)}`;

      // Populate quality options based on available formats
      if (data.formats && data.formats.length > 0) {
        const qualitySelect = youtubeElements.videoQuality;
        qualitySelect.innerHTML = '<option value="highest">highest available</option>';

        data.formats.forEach(format => {
          const option = document.createElement('option');
          option.value = format.height;
          option.textContent = `${format.quality} (${format.container})`;
          qualitySelect.appendChild(option);
        });
      }

      youtubeElements.videoInfo.style.display = 'block';
      window.converter?.showNotification('video info loaded! ✨', 'success');
    } catch (error) {
      console.error('Error fetching video:', error);
      window.converter?.showNotification(
        'failed to fetch video info. check the URL and try again.',
        'error'
      );
    } finally {
      youtubeElements.fetchBtn.disabled = false;
      youtubeElements.fetchBtn.textContent = 'fetch';
    }
  });

  // Download and convert video
  youtubeElements.downloadBtn?.addEventListener('click', async () => {
    if (!currentVideoData) {
      window.converter?.showNotification('please fetch video info first', 'error');
      return;
    }

    const downloadType = youtubeElements.downloadType.value;
    const quality = youtubeElements.videoQuality.value;
    const audioFormat = youtubeElements.audioFormat.value;
    const videoFormat = youtubeElements.ytVideoFormat.value;

    youtubeElements.downloadBtn.disabled = true;
    youtubeElements.downloadBtn.querySelector('.btn-text').textContent = 'processing...';

    try {
      window.converter?.showNotification('starting download...', 'info');

      let result;
      if (downloadType === 'audio') {
        // Download audio only
        result = await downloader.downloadYouTubeAudio(currentVideoData.videoId, audioFormat);
        window.converter?.showNotification(`✅ ${result.message}`, 'success');
      } else {
        // Download video
        result = await downloader.downloadYouTubeVideo(
          currentVideoData.videoId,
          quality,
          videoFormat
        );
        window.converter?.showNotification(`✅ ${result.message}`, 'success');
      }

      // Show result in results section
      showYouTubeResult(
        result,
        currentVideoData,
        downloadType === 'audio' ? audioFormat : videoFormat
      );
    } catch (error) {
      console.error('Download error:', error);
      window.converter?.showNotification(`❌ ${error.message}`, 'error');
    } finally {
      youtubeElements.downloadBtn.disabled = false;
      youtubeElements.downloadBtn.querySelector('.btn-text').textContent = 'download & convert';
    }
  });

  // Function to show YouTube download result
  function showYouTubeResult(result, videoData, format) {
    const resultsSection = document.getElementById('youtubeResults');
    const resultsGrid = document.getElementById('youtubeResultsGrid');

    // Show results section
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Create result item
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    resultItem.innerHTML = `
            <div class="file-icon">${format.includes('mp3') || format.includes('m4a') ? '🎵' : '🎬'}</div>
            <div class="file-name">${result.filename || videoData.title}</div>
            <div class="file-info">
                <div>Format: ${format.toUpperCase()}</div>
                <div>Source: YouTube</div>
            </div>
            <div class="file-actions">
                <button class="action-btn download-again" data-url="${result.downloadUrl || '#'}">
                    <span>📥 Download</span>
                </button>
                <button class="action-btn secondary open-folder">
                    <span>📂 Show</span>
                </button>
            </div>
        `;

    // Add to grid (prepend so newest is first)
    resultsGrid.insertBefore(resultItem, resultsGrid.firstChild);

    // Add event listeners
    const downloadBtn = resultItem.querySelector('.download-again');
    downloadBtn.addEventListener('click', () => {
      const url = downloadBtn.dataset.url;
      if (url && url !== '#') {
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });

    const showBtn = resultItem.querySelector('.open-folder');
    showBtn.addEventListener('click', () => {
      window.converter?.showNotification('File saved to your Downloads folder', 'info');
    });
  }

  // ================================
  // Instagram Downloader Functionality
  // ================================

  const instagramElements = {
    urlInput: document.getElementById('instagramUrl'),
    fetchBtn: document.getElementById('fetchInstagramBtn'),
    instagramInfo: document.getElementById('instagramInfo'),
    thumbnail: document.getElementById('instagramThumbnail'),
    caption: document.getElementById('instagramCaption'),
    author: document.getElementById('instagramAuthor'),
    type: document.getElementById('instagramType'),
    quality: document.getElementById('instagramQuality'),
    downloadBtn: document.getElementById('downloadInstagramBtn'),
  };

  let currentInstagramData = null;

  // Extract Instagram post/reel ID from URL
  function extractInstagramId(url) {
    const patterns = [
      /instagram\.com\/p\/([^/]+)/,
      /instagram\.com\/reel\/([^/]+)/,
      /instagram\.com\/tv\/([^/]+)/,
      /instagram\.com\/stories\/([^/]+)\/([^/]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Fetch Instagram media info from backend API
  instagramElements.fetchBtn?.addEventListener('click', async () => {
    const url = instagramElements.urlInput.value.trim();

    if (!url) {
      window.converter?.showNotification('please enter an instagram URL', 'error');
      return;
    }

    if (!url.includes('instagram.com')) {
      window.converter?.showNotification('invalid instagram URL', 'error');
      return;
    }

    instagramElements.fetchBtn.disabled = true;
    instagramElements.fetchBtn.textContent = 'fetching...';

    try {
      // Use backend API for Instagram info
      const response = await fetch(
        `http://localhost:3000/api/instagram/info?url=${encodeURIComponent(url)}`
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch media info');
      }

      const data = result.data;

      currentInstagramData = {
        shortcode: data.shortcode,
        caption: data.caption || 'No caption',
        username: data.username || 'Instagram User',
        isVideo: data.isVideo,
        thumbnail: data.thumbnail || 'https://via.placeholder.com/400?text=Instagram+Post',
        url: url,
      };

      // Display media info
      instagramElements.thumbnail.src = currentInstagramData.thumbnail;
      instagramElements.thumbnail.onerror = () => {
        instagramElements.thumbnail.src = 'https://via.placeholder.com/400?text=Instagram+Post';
      };

      const captionText =
        currentInstagramData.caption.length > 100
          ? currentInstagramData.caption.substring(0, 100) + '...'
          : currentInstagramData.caption;
      instagramElements.caption.textContent = captionText;
      instagramElements.author.textContent = `@${currentInstagramData.username}`;
      instagramElements.type.textContent = `Type: ${currentInstagramData.isVideo ? 'Video/Reel' : 'Photo'}`;

      instagramElements.instagramInfo.style.display = 'block';
      window.converter?.showNotification('media info loaded! ✨', 'success');
    } catch (error) {
      console.error('Error fetching Instagram post:', error);
      window.converter?.showNotification(
        'failed to fetch media info. check the URL and try again.',
        'error'
      );
    } finally {
      instagramElements.fetchBtn.disabled = false;
      instagramElements.fetchBtn.textContent = 'fetch';
    }
  });

  // Download Instagram media
  instagramElements.downloadBtn?.addEventListener('click', async () => {
    if (!currentInstagramData) {
      window.converter?.showNotification('please fetch media info first', 'error');
      return;
    }

    const quality = instagramElements.quality.value;

    instagramElements.downloadBtn.disabled = true;
    instagramElements.downloadBtn.querySelector('.btn-text').textContent = 'processing...';

    try {
      window.converter?.showNotification('starting download...', 'info');

      // Use the downloader module
      const result = await downloader.downloadInstagramMedia(currentInstagramData.url, quality);

      window.converter?.showNotification(`✅ ${result.message}`, 'success');

      // Show result in results section
      showInstagramResult(result, currentInstagramData);
    } catch (error) {
      console.error('Download error:', error);
      window.converter?.showNotification(`❌ ${error.message}`, 'error');
    } finally {
      instagramElements.downloadBtn.disabled = false;
      instagramElements.downloadBtn.querySelector('.btn-text').textContent = 'download media';
    }
  });

  // Function to show Instagram download result
  function showInstagramResult(result, mediaData) {
    const resultsSection = document.getElementById('instagramResults');
    const resultsGrid = document.getElementById('instagramResultsGrid');

    // Show results section
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Handle multiple files if present
    const files = result.files || [{ filename: result.filename, downloadUrl: result.downloadUrl }];

    files.forEach((file, index) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';

      const isVideo = file.filename?.includes('.mp4') || mediaData.isVideo;

      resultItem.innerHTML = `
                <div class="file-icon">${isVideo ? '🎬' : '📸'}</div>
                <div class="file-name">${file.filename || `instagram_${mediaData.shortcode}_${index + 1}`}</div>
                <div class="file-info">
                    <div>Type: ${isVideo ? 'Video' : 'Photo'}</div>
                    <div>Source: Instagram</div>
                    <div>@${mediaData.username || 'user'}</div>
                </div>
                <div class="file-actions">
                    <button class="action-btn download-again" data-url="${file.downloadUrl || '#'}">
                        <span>📥 Download</span>
                    </button>
                    <button class="action-btn secondary open-folder">
                        <span>📂 Show</span>
                    </button>
                </div>
            `;

      // Add to grid (prepend so newest is first)
      resultsGrid.insertBefore(resultItem, resultsGrid.firstChild);

      // Add event listeners
      const downloadBtn = resultItem.querySelector('.download-again');
      downloadBtn.addEventListener('click', () => {
        const url = downloadBtn.dataset.url;
        if (url && url !== '#') {
          const a = document.createElement('a');
          a.href = url;
          a.download = file.filename || 'download';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });

      const showBtn = resultItem.querySelector('.open-folder');
      showBtn.addEventListener('click', () => {
        window.converter?.showNotification('File saved to your Downloads folder', 'info');
      });
    });
  }
});
