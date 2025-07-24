const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { v4: uuidv4 } = require('uuid');

/**
 * Enhanced filesystem tool with comprehensive file operations and security
 */
class FilesystemTool {
  constructor(options = {}) {
    this.logger = options.logger;
    this.security = options.security || {};
    this.allowedPaths = options.allowedPaths || this.security.allowedPaths || ['./', process.cwd(), '/tmp', '/var/folders'];
    this.maxFileSize = options.maxFileSize || this.security.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.blockedExtensions = options.blockedExtensions || this.security.blockedExtensions || ['.exe', '.bat', '.sh'];
  }

  /**
   * Get tool metadata
   */
  getMetadata() {
    return {
      name: 'filesystem',
      version: '2.0.0',
      description: 'Enhanced filesystem operations with security controls',
      capabilities: [
        'read_file', 'write_file', 'create_file', 'delete_file',
        'create_directory', 'list_directory', 'copy_file', 'move_file',
        'search_files', 'get_stats', 'watch_changes'
      ],
      security: {
        allowedPaths: this.allowedPaths,
        maxFileSize: this.maxFileSize,
        blockedExtensions: this.blockedExtensions
      }
    };
  }

  /**
   * Validate action before execution
   */
  async validateAction(action) {
    const validation = { valid: true, errors: [], warnings: [] };

    // Check file path security
    if (action.parameters && action.parameters[0]) {
      const filePath = path.resolve(action.parameters[0]);
      
      // Check if path is allowed
      const isAllowed = this.allowedPaths.some(allowedPath => {
        const resolvedAllowed = path.resolve(allowedPath);
        return filePath.startsWith(resolvedAllowed);
      });

      if (!isAllowed) {
        validation.valid = false;
        validation.errors.push(`Path ${filePath} is not in allowed paths`);
      }

      // Check for blocked extensions
      const ext = path.extname(filePath);
      if (this.blockedExtensions.includes(ext)) {
        validation.valid = false;
        validation.errors.push(`File extension ${ext} is blocked`);
      }

      // Check for dangerous path traversal
      if (filePath.includes('..')) {
        validation.warnings.push('Path contains ".." - potential security risk');
      }
    }

    return validation;
  }

  /**
   * Main execution method
   */
  async execute(method, ...args) {
    if (!this[method] || typeof this[method] !== 'function') {
      throw new Error(`Method ${method} not found in FilesystemTool`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this[method](...args);
      
      if (this.logger) {
        this.logger.logPerformance(`filesystem:${method}`, Date.now() - startTime, {
          args: args.length,
          success: true
        });
      }

      return result;
    } catch (error) {
      if (this.logger) {
        this.logger.logPerformance(`filesystem:${method}`, Date.now() - startTime, {
          args: args.length,
          success: false,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Read file contents
   */
  async readFile(filePath, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check if file exists
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Get file stats
      const stats = await fs.stat(resolvedPath);
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize})`);
      }

      // Read file
      const encoding = options.encoding || 'utf8';
      const content = await fs.readFile(resolvedPath, encoding);

      if (this.logger) {
        this.logger.debug('File read successfully', {
          path: filePath,
          size: stats.size,
          encoding
        });
      }

      return {
        success: true,
        content,
        metadata: {
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          encoding
        }
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to read file', { path: filePath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Write content to file
   */
  async writeFile(filePath, content, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check content size
      const contentSize = Buffer.byteLength(content, 'utf8');
      if (contentSize > this.maxFileSize) {
        return {
          success: false,
          error: `Content too large: ${contentSize} bytes (max: ${this.maxFileSize})`
        };
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(resolvedPath));

      // Write file
      const encoding = options.encoding || 'utf8';
      await fs.writeFile(resolvedPath, content, encoding);

      if (this.logger) {
        this.logger.info('File written successfully', {
          path: filePath,
          size: contentSize,
          encoding
        });
      }

      return {
        success: true,
        path: filePath,
        size: contentSize,
        encoding
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to write file', { path: filePath, error: error.message });
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create new file
   */
  async createFile(filePath, content = '', options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check if file already exists
      if (await fs.pathExists(resolvedPath) && !options.overwrite) {
        throw new Error(`File already exists: ${filePath}`);
      }

      return await this.writeFile(filePath, content, options);

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to create file', { path: filePath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check if file exists
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Get file stats before deletion
      const stats = await fs.stat(resolvedPath);
      
      // Delete file
      await fs.remove(resolvedPath);

      if (this.logger) {
        this.logger.info('File deleted successfully', {
          path: filePath,
          size: stats.size
        });
      }

      return {
        success: true,
        path: filePath,
        deletedSize: stats.size
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to delete file', { path: filePath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Create directory
      await fs.ensureDir(resolvedPath);

      if (this.logger) {
        this.logger.info('Directory created successfully', { path: dirPath });
      }

      return {
        success: true,
        path: dirPath
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to create directory', { path: dirPath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath = '.', options = {}) {
    try {
      const resolvedPath = path.resolve(dirPath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check if directory exists
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }

      // Check if it's actually a directory
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      // Read directory
      const items = await fs.readdir(resolvedPath);
      const detailed = options.detailed || false;
      const includeHidden = options.includeHidden || false;

      let filteredItems = items;
      if (!includeHidden) {
        filteredItems = items.filter(item => !item.startsWith('.'));
      }

      if (detailed) {
        const detailedItems = [];
        for (const item of filteredItems) {
          try {
            const itemPath = path.join(resolvedPath, item);
            const itemStats = await fs.stat(itemPath);
            
            detailedItems.push({
              name: item,
              path: path.relative(process.cwd(), itemPath),
              type: itemStats.isDirectory() ? 'directory' : 'file',
              size: itemStats.size,
              modified: itemStats.mtime,
              permissions: itemStats.mode
            });
          } catch (error) {
            // Skip items that can't be accessed
            detailedItems.push({
              name: item,
              error: 'Access denied'
            });
          }
        }
        filteredItems = detailedItems;
      }

      if (this.logger) {
        this.logger.debug('Directory listed successfully', {
          path: dirPath,
          itemCount: filteredItems.length
        });
      }

      return {
        success: true,
        path: dirPath,
        files: filteredItems, // Use 'files' for compatibility
        items: filteredItems,
        count: filteredItems.length
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to list directory', { path: dirPath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath, destPath, options = {}) {
    try {
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destPath);
      
      // Security check for both paths
      await this.checkPathSecurity(resolvedSource);
      await this.checkPathSecurity(resolvedDest);
      
      // Check if source exists
      if (!await fs.pathExists(resolvedSource)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }

      // Check if destination already exists
      if (await fs.pathExists(resolvedDest) && !options.overwrite) {
        throw new Error(`Destination file already exists: ${destPath}`);
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(resolvedDest));

      // Copy file
      await fs.copy(resolvedSource, resolvedDest, options);

      // Get file stats
      const stats = await fs.stat(resolvedDest);

      if (this.logger) {
        this.logger.info('File copied successfully', {
          source: sourcePath,
          destination: destPath,
          size: stats.size
        });
      }

      return {
        success: true,
        source: sourcePath,
        destination: destPath,
        size: stats.size
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to copy file', {
          source: sourcePath,
          destination: destPath,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Move/rename file
   */
  async moveFile(sourcePath, destPath, options = {}) {
    try {
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destPath);
      
      // Security check for both paths
      await this.checkPathSecurity(resolvedSource);
      await this.checkPathSecurity(resolvedDest);
      
      // Check if source exists
      if (!await fs.pathExists(resolvedSource)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }

      // Check if destination already exists
      if (await fs.pathExists(resolvedDest) && !options.overwrite) {
        throw new Error(`Destination file already exists: ${destPath}`);
      }

      // Get source stats before moving
      const sourceStats = await fs.stat(resolvedSource);

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(resolvedDest));

      // Move file
      await fs.move(resolvedSource, resolvedDest, options);

      if (this.logger) {
        this.logger.info('File moved successfully', {
          source: sourcePath,
          destination: destPath,
          size: sourceStats.size
        });
      }

      return {
        success: true,
        source: sourcePath,
        destination: destPath,
        size: sourceStats.size
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to move file', {
          source: sourcePath,
          destination: destPath,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Search for files matching pattern
  /**
   * Search for files matching pattern
  async searchFiles(pattern, options = {}) {
    try {
      const searchDir = options.directory || '.';
      const resolvedDir = path.resolve(searchDir);
      
      // Security check
      await this.checkPathSecurity(resolvedDir);
      
      const globOptions = {
        cwd: resolvedDir,
        nodir: options.filesOnly !== false,
        dot: options.includeHidden || false,
        ignore: options.ignore || ['node_modules/**', '.git/**']
      };

      // Search for files
      const matches = glob.sync(pattern, globOptions);
      
      // Get detailed information if requested
      let results = matches;
      if (options.detailed) {
        results = [];
        for (const match of matches) {
          try {
            const fullPath = path.join(resolvedDir, match);
            const stats = await fs.stat(fullPath);
            
            results.push({
              path: match,
              fullPath,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime
            });
          } catch (error) {
            // Skip files that can't be accessed
          }
        }
      }

      if (this.logger) {
        this.logger.debug('File search completed', {
          pattern,
          directory: searchDir,
          matches: results.length
        });
      }

      return {
        success: true,
        pattern,
        directory: searchDir,
        matches: results,
        count: results.length
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to search files', { pattern, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Get file/directory statistics
   */
  async getStats(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Security check
      await this.checkPathSecurity(resolvedPath);
      
      // Check if path exists
      if (!await fs.pathExists(resolvedPath)) {
        return {
          success: false,
          exists: false,
          path: filePath,
          error: `Path does not exist: ${filePath}`
        };
      }

      // Get stats
      const stats = await fs.stat(resolvedPath);

      const result = {
        success: true,
        exists: true,
        path: filePath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: stats.mode,
        isReadable: true,
        isWritable: true
      };

      // Test read/write permissions
      try {
        await fs.access(resolvedPath, fs.constants.R_OK);
      } catch {
        result.isReadable = false;
      }

      try {
        await fs.access(resolvedPath, fs.constants.W_OK);
      } catch {
        result.isWritable = false;
      }

      if (this.logger) {
        this.logger.debug('File stats retrieved', { path: filePath, type: result.type });
      }

      return result;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to get file stats', { path: filePath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Check path security
   */
  async checkPathSecurity(resolvedPath) {
    // Check if path is in allowed paths
    const isAllowed = this.allowedPaths.some(allowedPath => {
      const resolvedAllowed = path.resolve(allowedPath);
      return resolvedPath.startsWith(resolvedAllowed);
    });

    // Only allow temp directories for testing if they're explicitly in allowed paths
    // Remove the automatic temp directory allowance for stricter security
    if (!isAllowed) {
      throw new Error(`Access denied: ${resolvedPath} is not in allowed paths`);
    }

    // Check for blocked extensions
    const ext = path.extname(resolvedPath);
    if (this.blockedExtensions.includes(ext)) {
      throw new Error(`Access denied: ${ext} files are blocked`);
    }
  }
}

module.exports = FilesystemTool;