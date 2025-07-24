const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { URL } = require('url');

/**
 * Network tool for HTTP requests and file downloads
 */
class NetworkTool {
  constructor(options = {}) {
    this.logger = options.logger;
    this.security = options.security || {};
    this.allowedDomains = this.security.allowedDomains || [];
    this.blockedDomains = this.security.blockedDomains || [];
    this.maxResponseSize = this.security.maxResponseSize || 10 * 1024 * 1024; // 10MB
    this.timeout = this.security.timeout || 30000;
  }

  /**
   * Get tool metadata
   */
  getMetadata() {
    return {
      name: 'network',
      version: '1.0.0',
      description: 'Network operations for HTTP requests and downloads',
      capabilities: ['http_request', 'download_file', 'check_url'],
      security: {
        allowedDomains: this.allowedDomains,
        blockedDomains: this.blockedDomains,
        maxResponseSize: this.maxResponseSize,
        timeout: this.timeout
      }
    };
  }

  /**
   * Validate action before execution
   */
  async validateAction(action) {
    const validation = { valid: true, errors: [], warnings: [] };

    if (action.parameters && action.parameters[0]) {
      const url = action.parameters[0];
      const urlCheck = this.isUrlSafe(url);
      
      if (!urlCheck.safe) {
        validation.valid = false;
        validation.errors.push(urlCheck.reason);
      }

      if (urlCheck.warnings) {
        validation.warnings.push(...urlCheck.warnings);
      }
    }

    return validation;
  }

  /**
   * Main execution method
   */
  async execute(method, ...args) {
    if (!this[method] || typeof this[method] !== 'function') {
      throw new Error(`Method ${method} not found in NetworkTool`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this[method](...args);
      
      if (this.logger) {
        this.logger.logPerformance(`network:${method}`, Date.now() - startTime, {
          args: args.length,
          success: true
        });
      }

      return result;
    } catch (error) {
      if (this.logger) {
        this.logger.logPerformance(`network:${method}`, Date.now() - startTime, {
          args: args.length,
          success: false,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Make HTTP request
   */
  async httpRequest(url, options = {}) {
    try {
      // Security check
      const urlCheck = this.isUrlSafe(url);
      if (!urlCheck.safe) {
        throw new Error(`URL blocked: ${urlCheck.reason}`);
      }

      const requestOptions = {
        url,
        method: options.method || 'GET',
        timeout: options.timeout || this.timeout,
        maxContentLength: options.maxSize || this.maxResponseSize,
        headers: options.headers || {},
        data: options.data,
        params: options.params
      };

      if (this.logger) {
        this.logger.info('Making HTTP request', { url, method: requestOptions.method });
      }

      const response = await axios(requestOptions);

      const result = {
        success: true,
        url,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        size: JSON.stringify(response.data).length
      };

      if (this.logger) {
        this.logger.info('HTTP request completed', {
          url,
          status: response.status,
          size: result.size
        });
      }

      return result;

    } catch (error) {
      const result = {
        success: false,
        url,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      };

      if (this.logger) {
        this.logger.error('HTTP request failed', {
          url,
          error: error.message,
          status: result.status
        });
      }

      return result;
    }
  }

  /**
   * Download file from URL
   */
  async downloadFile(url, destinationPath, options = {}) {
    try {
      // Security checks
      const urlCheck = this.isUrlSafe(url);
      if (!urlCheck.safe) {
        throw new Error(`URL blocked: ${urlCheck.reason}`);
      }

      const resolvedPath = path.resolve(destinationPath);
      
      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(resolvedPath));

      if (this.logger) {
        this.logger.info('Starting file download', { url, destination: destinationPath });
      }

      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: options.timeout || this.timeout,
        maxContentLength: options.maxSize || this.maxResponseSize
      });

      // Create write stream
      const writer = fs.createWriteStream(resolvedPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        let downloadedBytes = 0;

        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > this.maxResponseSize) {
            writer.destroy();
            reject(new Error('File size exceeds maximum allowed size'));
          }
        });

        writer.on('finish', async () => {
          try {
            const stats = await fs.stat(resolvedPath);
            
            const result = {
              success: true,
              url,
              destination: destinationPath,
              size: stats.size,
              contentType: response.headers['content-type']
            };

            if (this.logger) {
              this.logger.info('File download completed', {
                url,
                destination: destinationPath,
                size: stats.size
              });
            }

            resolve(result);
          } catch (error) {
            reject(error);
          }
        });

        writer.on('error', (error) => {
          if (this.logger) {
            this.logger.error('File download failed', {
              url,
              destination: destinationPath,
              error: error.message
            });
          }
          reject(error);
        });
      });

    } catch (error) {
      if (this.logger) {
        this.logger.error('Download initiation failed', {
          url,
          destination: destinationPath,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Check if URL is accessible
   */
  async checkUrl(url, options = {}) {
    try {
      // Security check
      const urlCheck = this.isUrlSafe(url);
      if (!urlCheck.safe) {
        return {
          accessible: false,
          reason: urlCheck.reason,
          url
        };
      }

      const response = await axios({
        url,
        method: 'HEAD',
        timeout: options.timeout || 10000,
        validateStatus: () => true // Don't throw on non-2xx status
      });

      const result = {
        accessible: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        url
      };

      if (this.logger) {
        this.logger.debug('URL check completed', {
          url,
          accessible: result.accessible,
          status: result.status
        });
      }

      return result;

    } catch (error) {
      const result = {
        accessible: false,
        error: error.message,
        url
      };

      if (this.logger) {
        this.logger.debug('URL check failed', {
          url,
          error: error.message
        });
      }

      return result;
    }
  }

  /**
   * Check if URL is safe to access
   */
  isUrlSafe(urlString) {
    const result = { safe: true, reason: '', warnings: [] };

    try {
      const url = new URL(urlString);

      // Check protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        result.safe = false;
        result.reason = `Unsupported protocol: ${url.protocol}`;
        return result;
      }

      // Check blocked domains
      for (const blocked of this.blockedDomains) {
        if (url.hostname.includes(blocked)) {
          result.safe = false;
          result.reason = `Domain is blocked: ${url.hostname}`;
          return result;
        }
      }

      // Check allowed domains (if restrictive)
      if (this.allowedDomains.length > 0) {
        const isAllowed = this.allowedDomains.some(allowed => 
          url.hostname.includes(allowed)
        );
        
        if (!isAllowed) {
          result.safe = false;
          result.reason = `Domain not in allowed list: ${url.hostname}`;
          return result;
        }
      }

      // Check for local/private IPs
      const hostname = url.hostname;
      if (this.isPrivateIP(hostname)) {
        result.warnings.push('Accessing private/local IP address');
      }

      // Check for suspicious patterns
      if (url.pathname.includes('..')) {
        result.warnings.push('URL contains path traversal pattern');
      }

    } catch (error) {
      result.safe = false;
      result.reason = `Invalid URL: ${error.message}`;
    }

    return result;
  }

  /**
   * Check if hostname is a private IP
   */
  isPrivateIP(hostname) {
    const privateRanges = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^localhost$/i
    ];

    return privateRanges.some(range => range.test(hostname));
  }
}

module.exports = NetworkTool;