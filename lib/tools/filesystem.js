const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const Utils = require('../utils');

/**
 * Filesystem operations tool for the agent
 */
class FilesystemTool {
  constructor(logger = null) {
    this.logger = logger;
    this.name = 'filesystem';
    this.description = 'File and directory operations';
  }

  /**
   * Log tool action
   */
  log(action, details) {
    if (this.logger) {
      this.logger.logAction(this.name, action, details);
    }
  }

  /**
   * Read file contents
   */
  async readFile(filePath, options = {}) {
    try {
      const absolutePath = path.resolve(filePath);
      const encoding = options.encoding || 'utf8';
      
      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const content = await fs.readFile(absolutePath, encoding);
      
      this.log('readFile', {
        path: filePath,
        size: content.length,
        encoding
      });

      return {
        success: true,
        content,
        path: absolutePath,
        size: content.length
      };
    } catch (error) {
      this.log('readFile', {
        path: filePath,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  /**
   * Write file contents
   */
  async writeFile(filePath, content, options = {}) {
    try {
      const absolutePath = path.resolve(filePath);
      const encoding = options.encoding || 'utf8';
      const overwrite = options.overwrite !== false;

      // Check if file exists and overwrite is disabled
      if (!overwrite && await fs.pathExists(absolutePath)) {
        throw new Error(`File already exists and overwrite is disabled: ${filePath}`);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(absolutePath));

      // Write file
      await fs.writeFile(absolutePath, content, encoding);

      this.log('writeFile', {
        path: filePath,
        size: content.length,
        encoding,
        overwrite: await fs.pathExists(absolutePath)
      });

      return {
        success: true,
        path: absolutePath,
        size: content.length,
        created: true
      };
    } catch (error) {
      this.log('writeFile', {
        path: filePath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  /**
   * Append to file
   */
  async appendFile(filePath, content, options = {}) {
    try {
      const absolutePath = path.resolve(filePath);
      const encoding = options.encoding || 'utf8';

      // Ensure directory exists
      await fs.ensureDir(path.dirname(absolutePath));

      // Append to file
      await fs.appendFile(absolutePath, content, encoding);

      this.log('appendFile', {
        path: filePath,
        size: content.length,
        encoding
      });

      return {
        success: true,
        path: absolutePath,
        size: content.length,
        appended: true
      };
    } catch (error) {
      this.log('appendFile', {
        path: filePath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  /**
   * Create directory
   */
  async mkdir(dirPath, options = {}) {
    try {
      const absolutePath = path.resolve(dirPath);
      const recursive = options.recursive !== false;

      if (recursive) {
        await fs.ensureDir(absolutePath);
      } else {
        await fs.mkdir(absolutePath);
      }

      this.log('mkdir', {
        path: dirPath,
        recursive
      });

      return {
        success: true,
        path: absolutePath,
        created: true
      };
    } catch (error) {
      this.log('mkdir', {
        path: dirPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  /**
   * Remove file or directory
   */
  async remove(targetPath, options = {}) {
    try {
      const absolutePath = path.resolve(targetPath);
      const force = options.force === true;

      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`Path does not exist: ${targetPath}`);
      }

      if (!force) {
        // This would typically trigger user confirmation in the agent
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
          const files = await fs.readdir(absolutePath);
          if (files.length > 0) {
            throw new Error(`Directory is not empty: ${targetPath}. Use force option to delete.`);
          }
        }
      }

      await fs.remove(absolutePath);

      this.log('remove', {
        path: targetPath,
        force
      });

      return {
        success: true,
        path: absolutePath,
        removed: true
      };
    } catch (error) {
      this.log('remove', {
        path: targetPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: targetPath
      };
    }
  }

  /**
   * List directory contents
   */
  async listDir(dirPath, options = {}) {
    try {
      const absolutePath = path.resolve(dirPath);
      const detailed = options.detailed === true;
      const recursive = options.recursive === true;

      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }

      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      let files;
      if (recursive) {
        const pattern = path.join(absolutePath, '**/*');
        files = glob.sync(pattern, { dot: true });
        files = files.map(f => path.relative(absolutePath, f));
      } else {
        files = await fs.readdir(absolutePath);
      }

      let result = files;
      if (detailed) {
        result = await Promise.all(files.map(async (file) => {
          const filePath = path.join(absolutePath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            modified: stats.mtime,
            created: stats.birthtime
          };
        }));
      }

      this.log('listDir', {
        path: dirPath,
        count: files.length,
        detailed,
        recursive
      });

      return {
        success: true,
        path: absolutePath,
        files: result,
        count: files.length
      };
    } catch (error) {
      this.log('listDir', {
        path: dirPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  /**
   * Copy file or directory
   */
  async copy(srcPath, destPath, options = {}) {
    try {
      const absoluteSrc = path.resolve(srcPath);
      const absoluteDest = path.resolve(destPath);
      const overwrite = options.overwrite !== false;

      if (!await fs.pathExists(absoluteSrc)) {
        throw new Error(`Source does not exist: ${srcPath}`);
      }

      if (!overwrite && await fs.pathExists(absoluteDest)) {
        throw new Error(`Destination already exists and overwrite is disabled: ${destPath}`);
      }

      await fs.copy(absoluteSrc, absoluteDest, { overwrite });

      this.log('copy', {
        src: srcPath,
        dest: destPath,
        overwrite
      });

      return {
        success: true,
        src: absoluteSrc,
        dest: absoluteDest,
        copied: true
      };
    } catch (error) {
      this.log('copy', {
        src: srcPath,
        dest: destPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        src: srcPath,
        dest: destPath
      };
    }
  }

  /**
   * Move file or directory
   */
  async move(srcPath, destPath, options = {}) {
    try {
      const absoluteSrc = path.resolve(srcPath);
      const absoluteDest = path.resolve(destPath);
      const overwrite = options.overwrite !== false;

      if (!await fs.pathExists(absoluteSrc)) {
        throw new Error(`Source does not exist: ${srcPath}`);
      }

      if (!overwrite && await fs.pathExists(absoluteDest)) {
        throw new Error(`Destination already exists and overwrite is disabled: ${destPath}`);
      }

      await fs.move(absoluteSrc, absoluteDest, { overwrite });

      this.log('move', {
        src: srcPath,
        dest: destPath,
        overwrite
      });

      return {
        success: true,
        src: absoluteSrc,
        dest: absoluteDest,
        moved: true
      };
    } catch (error) {
      this.log('move', {
        src: srcPath,
        dest: destPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        src: srcPath,
        dest: destPath
      };
    }
  }

  /**
   * Check if path exists
   */
  async exists(targetPath) {
    try {
      const absolutePath = path.resolve(targetPath);
      const exists = await fs.pathExists(absolutePath);

      this.log('exists', {
        path: targetPath,
        exists
      });

      return {
        success: true,
        path: absolutePath,
        exists
      };
    } catch (error) {
      this.log('exists', {
        path: targetPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: targetPath
      };
    }
  }

  /**
   * Get file/directory stats
   */
  async stats(targetPath) {
    try {
      const absolutePath = path.resolve(targetPath);
      
      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`Path does not exist: ${targetPath}`);
      }

      const stats = await fs.stat(absolutePath);

      const result = {
        path: absolutePath,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        isSymbolicLink: stats.isSymbolicLink(),
        modified: stats.mtime,
        created: stats.birthtime,
        accessed: stats.atime,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      };

      this.log('stats', {
        path: targetPath,
        size: stats.size,
        type: stats.isDirectory() ? 'directory' : 'file'
      });

      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.log('stats', {
        path: targetPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: targetPath
      };
    }
  }

  /**
   * Get available methods
   */
  getMethods() {
    return [
      'readFile',
      'writeFile',
      'appendFile',
      'mkdir',
      'remove',
      'listDir',
      'copy',
      'move',
      'exists',
      'stats'
    ];
  }

  /**
   * Get tool description for agent
   */
  getDescription() {
    return {
      name: this.name,
      description: this.description,
      methods: {
        readFile: 'Read contents of a file',
        writeFile: 'Write content to a file (creates directories if needed)',
        appendFile: 'Append content to a file',
        mkdir: 'Create directory (recursive by default)',
        remove: 'Delete file or directory',
        listDir: 'List directory contents',
        copy: 'Copy file or directory',
        move: 'Move/rename file or directory',
        exists: 'Check if path exists',
        stats: 'Get file/directory information'
      }
    };
  }
}

module.exports = FilesystemTool;