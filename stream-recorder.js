// Stream Recorder - Record live streams with pause/resume support
// Handles real-time recording of HLS, DASH, and other streaming formats

const StreamRecorder = {
  // Active recordings
  activeRecordings: new Map(), // recordingId -> RecordingSession

  // Recording states
  RecordingState: {
    IDLE: 'idle',
    RECORDING: 'recording',
    PAUSED: 'paused',
    STOPPING: 'stopping',
    STOPPED: 'stopped',
    FAILED: 'failed'
  },

  // Initialize recorder
  async init() {
    // Load saved recordings from storage
    const result = await browser.storage.local.get('recordings');
    if (result.recordings) {
      // Restore recording sessions (but not active state)
      result.recordings.forEach(data => {
        const session = new RecordingSession(data.streamData);
        Object.assign(session, data);
        // Reset state to stopped if it was recording
        if (session.state === this.RecordingState.RECORDING) {
          session.state = this.RecordingState.STOPPED;
        }
        this.activeRecordings.set(session.id, session);
      });
    }

    console.log('Stream Recorder initialized');
  },

  // Start recording a stream
  async startRecording(streamData, options = {}) {
    try {
      // Create new recording session
      const session = new RecordingSession(streamData, options);
      this.activeRecordings.set(session.id, session);

      // Start recording based on method
      if (options.method === 'ytdlp' || streamData.type === 'mpd') {
        await this.startYtDlpRecording(session);
      } else {
        await this.startNativeRecording(session);
      }

      // Save to storage
      await this.saveRecordings();

      // Notify UI
      this.notifyRecordingStarted(session);

      return { success: true, recordingId: session.id, session: session.toJSON() };

    } catch (error) {
      console.error('Failed to start recording:', error);
      return ErrorHandler.handleError(error, { source: 'recorder', action: 'start' });
    }
  },

  // Start recording using yt-dlp
  async startYtDlpRecording(session) {
    // Connect to native messaging host
    const port = browser.runtime.connectNative('com.streamsniper.ytdlp');

    session.nativePort = port;
    session.setState(this.RecordingState.RECORDING);

    // Build recording command
    const command = {
      type: 'record',
      url: session.streamUrl,
      output: session.outputPath,
      format: session.options.quality || 'best',
      recordingId: session.id,
      splitDuration: session.options.splitDuration || 0, // 0 = no split
      splitSize: session.options.splitSize || 0 // 0 = no split
    };

    // Send recording command
    port.postMessage(command);

    // Listen for progress updates
    port.onMessage.addListener((message) => {
      this.handleRecordingMessage(session, message);
    });

    port.onDisconnect.addListener(() => {
      if (session.state === this.RecordingState.RECORDING) {
        session.setState(this.RecordingState.FAILED);
        session.error = 'Connection to yt-dlp lost';
        this.notifyRecordingFailed(session);
      }
    });
  },

  // Start recording using browser native (for simple streams)
  async startNativeRecording(session) {
    // Use MediaRecorder API if stream is accessible
    try {
      session.setState(this.RecordingState.RECORDING);

      // Create video element to capture stream
      const video = document.createElement('video');
      video.src = session.streamUrl;
      video.muted = true;
      video.crossOrigin = 'anonymous';

      // Wait for video to load
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        video.load();
      });

      // Start playing
      await video.play();

      // Capture stream using MediaStream API
      const mediaStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();

      // Create MediaRecorder
      const recorder = new MediaRecorder(mediaStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: session.options.videoBitrate || 2500000
      });

      session.mediaRecorder = recorder;
      session.recordedChunks = [];

      // Handle data available
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          session.recordedChunks.push(event.data);
          session.recordedSize += event.data.size;

          // Update duration
          session.duration = Date.now() - session.startTime;

          // Check if we need to split
          if (session.options.splitSize && session.recordedSize >= session.options.splitSize) {
            this.splitRecording(session);
          } else if (session.options.splitDuration && session.duration >= session.options.splitDuration) {
            this.splitRecording(session);
          }

          // Notify progress
          this.notifyRecordingProgress(session);
        }
      };

      // Handle recording stop
      recorder.onstop = () => {
        this.saveRecordedData(session);
      };

      // Start recording (request data every second)
      recorder.start(1000);

      // Start timer
      session.timerInterval = setInterval(() => {
        session.duration = Date.now() - session.startTime;
        this.notifyRecordingProgress(session);
      }, 1000);

    } catch (error) {
      session.setState(this.RecordingState.FAILED);
      session.error = error.message;
      throw error;
    }
  },

  // Handle messages from yt-dlp
  handleRecordingMessage(session, message) {
    switch (message.type) {
      case 'progress':
        session.duration = message.duration || session.duration;
        session.recordedSize = message.size || session.recordedSize;
        this.notifyRecordingProgress(session);
        break;

      case 'split':
        // yt-dlp has split the recording
        session.segmentCount++;
        this.notifyRecordingSplit(session, message.filename);
        break;

      case 'stopped':
        session.setState(this.RecordingState.STOPPED);
        session.endTime = Date.now();
        this.notifyRecordingStopped(session);
        this.saveRecordings();
        break;

      case 'error':
        session.setState(this.RecordingState.FAILED);
        session.error = message.error;
        this.notifyRecordingFailed(session);
        this.saveRecordings();
        break;
    }
  },

  // Pause recording
  async pauseRecording(recordingId) {
    const session = this.activeRecordings.get(recordingId);
    if (!session) return { success: false, error: 'Recording not found' };

    if (session.state !== this.RecordingState.RECORDING) {
      return { success: false, error: 'Recording is not active' };
    }

    try {
      if (session.mediaRecorder) {
        // Native recording - pause MediaRecorder
        session.mediaRecorder.pause();
        clearInterval(session.timerInterval);
      } else if (session.nativePort) {
        // yt-dlp recording - send pause command
        session.nativePort.postMessage({ type: 'pause', recordingId: session.id });
      }

      session.setState(this.RecordingState.PAUSED);
      session.pauseTime = Date.now();

      await this.saveRecordings();
      this.notifyRecordingPaused(session);

      return { success: true };

    } catch (error) {
      return ErrorHandler.handleError(error, { source: 'recorder', action: 'pause' });
    }
  },

  // Resume recording
  async resumeRecording(recordingId) {
    const session = this.activeRecordings.get(recordingId);
    if (!session) return { success: false, error: 'Recording not found' };

    if (session.state !== this.RecordingState.PAUSED) {
      return { success: false, error: 'Recording is not paused' };
    }

    try {
      if (session.mediaRecorder) {
        // Native recording - resume MediaRecorder
        session.mediaRecorder.resume();

        // Restart timer (accounting for pause duration)
        const pauseDuration = Date.now() - session.pauseTime;
        session.startTime += pauseDuration;

        session.timerInterval = setInterval(() => {
          session.duration = Date.now() - session.startTime;
          this.notifyRecordingProgress(session);
        }, 1000);
      } else if (session.nativePort) {
        // yt-dlp recording - send resume command
        session.nativePort.postMessage({ type: 'resume', recordingId: session.id });
      }

      session.setState(this.RecordingState.RECORDING);
      session.pauseTime = null;

      await this.saveRecordings();
      this.notifyRecordingResumed(session);

      return { success: true };

    } catch (error) {
      return ErrorHandler.handleError(error, { source: 'recorder', action: 'resume' });
    }
  },

  // Stop recording
  async stopRecording(recordingId) {
    const session = this.activeRecordings.get(recordingId);
    if (!session) return { success: false, error: 'Recording not found' };

    try {
      session.setState(this.RecordingState.STOPPING);

      if (session.mediaRecorder) {
        // Native recording - stop MediaRecorder
        session.mediaRecorder.stop();
        clearInterval(session.timerInterval);
      } else if (session.nativePort) {
        // yt-dlp recording - send stop command
        session.nativePort.postMessage({ type: 'stop', recordingId: session.id });
      }

      session.endTime = Date.now();
      session.setState(this.RecordingState.STOPPED);

      await this.saveRecordings();
      this.notifyRecordingStopped(session);

      return { success: true };

    } catch (error) {
      return ErrorHandler.handleError(error, { source: 'recorder', action: 'stop' });
    }
  },

  // Split recording into new segment
  async splitRecording(session) {
    if (session.mediaRecorder && session.recordedChunks.length > 0) {
      // Save current segment
      await this.saveRecordedData(session, true);

      // Reset for next segment
      session.recordedChunks = [];
      session.recordedSize = 0;
      session.segmentCount++;
      session.startTime = Date.now();

      this.notifyRecordingSplit(session);
    }
  },

  // Save recorded data to file
  async saveRecordedData(session, isSplit = false) {
    try {
      const blob = new Blob(session.recordedChunks, { type: 'video/webm' });

      // Generate filename
      const filename = this.generateRecordingFilename(session, isSplit);

      // Save using browser downloads API
      const url = URL.createObjectURL(blob);
      await browser.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      });

      // Clean up
      URL.revokeObjectURL(url);

      if (!isSplit) {
        session.recordedChunks = [];
      }

    } catch (error) {
      console.error('Failed to save recording:', error);
      throw error;
    }
  },

  // Generate filename for recording
  generateRecordingFilename(session, isSplit) {
    const sanitizedTitle = session.streamData.pageTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const segment = isSplit ? `_part${session.segmentCount}` : '';

    return `recording_${sanitizedTitle}_${timestamp}${segment}.webm`;
  },

  // Get all recordings
  getRecordings() {
    return Array.from(this.activeRecordings.values()).map(session => session.toJSON());
  },

  // Get active recordings only
  getActiveRecordings() {
    return Array.from(this.activeRecordings.values())
      .filter(session => session.state === this.RecordingState.RECORDING || session.state === this.RecordingState.PAUSED)
      .map(session => session.toJSON());
  },

  // Save recordings to storage
  async saveRecordings() {
    const recordings = this.getRecordings();
    await browser.storage.local.set({ recordings: recordings });
  },

  // Notification methods
  notifyRecordingStarted(session) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: '🔴 Recording Started',
      message: `Recording "${session.streamData.pageTitle}"`
    });

    this.sendToPopup({ action: 'recordingStarted', recording: session.toJSON() });
  },

  notifyRecordingProgress(session) {
    this.sendToPopup({ action: 'recordingProgress', recording: session.toJSON() });
  },

  notifyRecordingPaused(session) {
    this.sendToPopup({ action: 'recordingPaused', recording: session.toJSON() });
  },

  notifyRecordingResumed(session) {
    this.sendToPopup({ action: 'recordingResumed', recording: session.toJSON() });
  },

  notifyRecordingStopped(session) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: '⏹️ Recording Stopped',
      message: `Recorded ${this.formatDuration(session.duration)} of "${session.streamData.pageTitle}"`
    });

    this.sendToPopup({ action: 'recordingStopped', recording: session.toJSON() });
  },

  notifyRecordingFailed(session) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: '❌ Recording Failed',
      message: `Failed to record "${session.streamData.pageTitle}": ${session.error}`
    });

    this.sendToPopup({ action: 'recordingFailed', recording: session.toJSON() });
  },

  notifyRecordingSplit(session, filename) {
    this.sendToPopup({ action: 'recordingSplit', recording: session.toJSON(), filename: filename });
  },

  sendToPopup(message) {
    browser.runtime.sendMessage(message).catch(() => {
      // Popup not open, that's okay
    });
  },

  // Format duration for display
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
};

// Recording Session Class
class RecordingSession {
  constructor(streamData, options = {}) {
    this.id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.streamData = streamData;
    this.streamUrl = streamData.url;
    this.options = options;

    this.state = StreamRecorder.RecordingState.IDLE;
    this.startTime = Date.now();
    this.endTime = null;
    this.pauseTime = null;
    this.duration = 0;

    this.recordedSize = 0;
    this.segmentCount = 0;
    this.outputPath = options.outputPath || this.generateOutputPath();

    this.error = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.nativePort = null;
    this.timerInterval = null;
  }

  generateOutputPath() {
    const sanitizedTitle = this.streamData.pageTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `recording_${sanitizedTitle}_${timestamp}`;
  }

  setState(newState) {
    this.state = newState;
    console.log(`Recording ${this.id} state changed to ${newState}`);
  }

  toJSON() {
    return {
      id: this.id,
      streamData: this.streamData,
      streamUrl: this.streamUrl,
      options: this.options,
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      pauseTime: this.pauseTime,
      duration: this.duration,
      recordedSize: this.recordedSize,
      segmentCount: this.segmentCount,
      outputPath: this.outputPath,
      error: this.error
    };
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  StreamRecorder.init().catch(console.error);
}
