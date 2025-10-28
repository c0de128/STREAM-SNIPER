// Error Handler - Centralized error handling with user-friendly messages
// Provides error categorization, recovery suggestions, and logging

const ErrorHandler = {
  // Error categories
  ErrorType: {
    NETWORK: 'network',
    CORS: 'cors',
    MANIFEST: 'manifest',
    DOWNLOAD: 'download',
    STORAGE: 'storage',
    NATIVE_MESSAGING: 'native_messaging',
    VALIDATION: 'validation',
    UNKNOWN: 'unknown'
  },

  // Categorize error based on message and context
  categorizeError(error, context = {}) {
    const errorMsg = error.message || error.toString();

    // CORS errors
    if (errorMsg.includes('CORS') || errorMsg.includes('Cross-Origin') ||
        errorMsg.includes('Access-Control-Allow-Origin')) {
      return this.ErrorType.CORS;
    }

    // Network errors
    if (errorMsg.includes('NetworkError') || errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('Network request failed') || errorMsg.includes('timeout')) {
      return this.ErrorType.NETWORK;
    }

    // Manifest parsing errors
    if (context.source === 'manifest-parser' || errorMsg.includes('manifest') ||
        errorMsg.includes('parsing') || errorMsg.includes('Invalid M3U8')) {
      return this.ErrorType.MANIFEST;
    }

    // Download errors
    if (context.source === 'download' || errorMsg.includes('download')) {
      return this.ErrorType.DOWNLOAD;
    }

    // Storage errors
    if (errorMsg.includes('storage') || errorMsg.includes('quota')) {
      return this.ErrorType.STORAGE;
    }

    // Native messaging errors
    if (errorMsg.includes('native') || errorMsg.includes('yt-dlp') ||
        context.source === 'native-messaging') {
      return this.ErrorType.NATIVE_MESSAGING;
    }

    // Validation errors
    if (context.source === 'validation' || errorMsg.includes('validation') ||
        errorMsg.includes('HTTP')) {
      return this.ErrorType.VALIDATION;
    }

    return this.ErrorType.UNKNOWN;
  },

  // Get user-friendly error message
  getUserFriendlyMessage(errorType, error, context = {}) {
    const messages = {
      [this.ErrorType.CORS]: {
        title: 'Access Blocked',
        message: 'The stream URL is protected by CORS (Cross-Origin Resource Sharing) restrictions.',
        suggestion: 'Try using the "Copy URL" button and play it in VLC or another media player instead.',
        icon: '🔒'
      },
      [this.ErrorType.NETWORK]: {
        title: 'Network Error',
        message: 'Unable to connect to the stream. This could be due to a network timeout or connection issue.',
        suggestion: 'Check your internet connection and try again. If the problem persists, the stream may be offline.',
        icon: '🌐'
      },
      [this.ErrorType.MANIFEST]: {
        title: 'Invalid Stream Format',
        message: 'The stream manifest could not be parsed. The file may be corrupted or in an unexpected format.',
        suggestion: 'Try downloading with yt-dlp instead, or verify the stream URL is correct.',
        icon: '📄'
      },
      [this.ErrorType.DOWNLOAD]: {
        title: 'Download Failed',
        message: error.message || 'The download encountered an error and could not complete.',
        suggestion: 'Try downloading again. If using yt-dlp, make sure it\'s properly installed and up to date.',
        icon: '⬇️'
      },
      [this.ErrorType.STORAGE]: {
        title: 'Storage Error',
        message: 'Unable to save data. Your browser storage may be full.',
        suggestion: 'Try clearing some history or cached data from the extension, or free up disk space.',
        icon: '💾'
      },
      [this.ErrorType.NATIVE_MESSAGING]: {
        title: 'yt-dlp Connection Error',
        message: 'Could not connect to the yt-dlp native messaging host.',
        suggestion: 'Make sure yt-dlp is installed and the native messaging host is configured. Run the setup wizard for help.',
        icon: '🔧'
      },
      [this.ErrorType.VALIDATION]: {
        title: 'Stream Validation Failed',
        message: context.status ? `Stream returned HTTP ${context.status} ${context.statusText}` : 'Stream URL is not accessible.',
        suggestion: 'The stream may be offline, require authentication, or have expired. Try refreshing the page.',
        icon: '✓'
      },
      [this.ErrorType.UNKNOWN]: {
        title: 'Unexpected Error',
        message: error.message || 'An unexpected error occurred.',
        suggestion: 'Try refreshing the page or restarting the browser. If the problem persists, please report it.',
        icon: '❌'
      }
    };

    return messages[errorType] || messages[this.ErrorType.UNKNOWN];
  },

  // Handle error and show user feedback
  handleError(error, context = {}) {
    // Log error for debugging
    console.error('[Stream Sniper Error]', {
      error: error,
      context: context,
      timestamp: new Date().toISOString()
    });

    // Categorize error
    const errorType = this.categorizeError(error, context);
    const userMessage = this.getUserFriendlyMessage(errorType, error, context);

    // Show notification if enabled
    this.showErrorNotification(userMessage, context);

    // Return structured error info
    return {
      type: errorType,
      ...userMessage,
      originalError: error,
      context: context
    };
  },

  // Show error notification
  showErrorNotification(message, context = {}) {
    // Check if notifications are enabled
    browser.storage.local.get('settings').then(result => {
      const settings = result.settings || { notifications: true };

      if (settings.notifications && !context.silent) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: `${message.icon} ${message.title}`,
          message: `${message.message}\n\n💡 ${message.suggestion}`
        });
      }
    }).catch(err => {
      console.error('Error checking notification settings:', err);
    });
  },

  // Show error in popup UI
  showErrorInUI(errorInfo, containerId = 'error-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="error-message">
        <div class="error-header">
          <span class="error-icon">${errorInfo.icon}</span>
          <strong>${errorInfo.title}</strong>
        </div>
        <div class="error-body">
          ${errorInfo.message}
        </div>
        <div class="error-suggestion">
          <strong>💡 Suggestion:</strong> ${errorInfo.suggestion}
        </div>
        ${errorInfo.context.retry ? '<button class="retry-btn">🔄 Retry</button>' : ''}
      </div>
    `;

    container.style.display = 'block';

    // Auto-hide after 10 seconds unless it's a critical error
    if (errorInfo.type !== this.ErrorType.NATIVE_MESSAGING &&
        errorInfo.type !== this.ErrorType.STORAGE) {
      setTimeout(() => {
        container.style.display = 'none';
      }, 10000);
    }
  },

  // Wrap async function with error handling
  async wrapAsync(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      return this.handleError(error, context);
    }
  },

  // Get recovery suggestions for specific error types
  getRecoverySuggestions(errorType) {
    const suggestions = {
      [this.ErrorType.CORS]: [
        'Copy the stream URL and play it in VLC Media Player',
        'Use yt-dlp download method instead of browser native',
        'Try accessing the stream from the original website'
      ],
      [this.ErrorType.NETWORK]: [
        'Check your internet connection',
        'Try again in a few moments',
        'Verify the stream is still live/available',
        'Check if you need to be logged in to access the stream'
      ],
      [this.ErrorType.MANIFEST]: [
        'Verify the stream URL is correct',
        'Try using yt-dlp for advanced format handling',
        'Report the issue if this stream should be supported'
      ],
      [this.ErrorType.DOWNLOAD]: [
        'Try the download again',
        'Check available disk space',
        'Verify yt-dlp is up to date (if using)',
        'Try downloading with a different quality setting'
      ],
      [this.ErrorType.STORAGE]: [
        'Clear some extension history',
        'Remove old downloads from the queue',
        'Free up browser storage space'
      ],
      [this.ErrorType.NATIVE_MESSAGING]: [
        'Run the setup wizard from extension options',
        'Verify yt-dlp is installed: run "yt-dlp --version" in terminal',
        'Restart your browser after setup',
        'Check the Extension ID is configured correctly'
      ],
      [this.ErrorType.VALIDATION]: [
        'Refresh the page and try again',
        'Check if the stream requires authentication',
        'Verify the stream URL hasn\'t expired',
        'Try accessing the stream directly in your browser'
      ],
      [this.ErrorType.UNKNOWN]: [
        'Refresh the page and try again',
        'Check the browser console for more details',
        'Report the issue with steps to reproduce'
      ]
    };

    return suggestions[errorType] || suggestions[this.ErrorType.UNKNOWN];
  },

  // Log error to storage for debugging
  async logError(error, context = {}) {
    try {
      const result = await browser.storage.local.get('errorLog');
      const errorLog = result.errorLog || [];

      errorLog.unshift({
        message: error.message || error.toString(),
        type: this.categorizeError(error, context),
        context: context,
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      });

      // Keep only last 50 errors
      if (errorLog.length > 50) {
        errorLog.length = 50;
      }

      await browser.storage.local.set({ errorLog: errorLog });
    } catch (storageError) {
      console.error('Failed to log error:', storageError);
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
}
