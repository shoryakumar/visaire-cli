const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const ignore = require('ignore');
const glob = require('glob');

/**
 * Advanced context management for intelligent code understanding and context building
 * Implements Forge-style context awareness with AST parsing and semantic analysis
 */
class ContextManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger;
    this.maxSize = options.maxSize || 100000; // Max context size in characters
    this.compressionThreshold = options.compressionThreshold || 0.8;
    this.retentionStrategy = options.retentionStrategy || 'importance';
    this.workingDirectory = options.workingDirectory || process.cwd();
    
    // Context storage
    this.contexts = new Map();
    this.fileCache = new Map();
    this.astCache = new Map();
    this.dependencyGraph = new Map();
    
    // Ignore patterns
    this.ignorePatterns = this.initializeIgnorePatterns();
    
    // File type handlers
    this.fileHandlers = this.initializeFileHandlers();
    
    // Context templates
    this.contextTemplates = this.initializeContextTemplates();
  }

  /**
   * Initialize ignore patterns for file traversal
   */
  initializeIgnorePatterns() {
    const ig = ignore();
    
    // Default ignore patterns
    ig.add([
      'node_modules/**',
      '.git/**',
      '.visaire/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
      '*.tmp',
      '*.temp'
    ]);

    // Load .gitignore if it exists
    try {
      const gitignorePath = path.join(this.workingDirectory, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(gitignoreContent);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.warn('Failed to load .gitignore', { error: error.message });
      }
    }

    // Load .visaireignore if it exists
    try {
      const visaireignorePath = path.join(this.workingDirectory, '.visaireignore');
      if (fs.existsSync(visaireignorePath)) {
        const visaireIgnoreContent = fs.readFileSync(visaireignorePath, 'utf8');
        ig.add(visaireIgnoreContent);
      }
    } catch (error) {
      // Silently ignore if .visaireignore doesn't exist
    }

    return ig;
  }

  /**
   * Initialize file type handlers
   */
  initializeFileHandlers() {
    return {
      '.js': this.handleJavaScriptFile.bind(this),
      '.ts': this.handleTypeScriptFile.bind(this),
      '.jsx': this.handleJavaScriptFile.bind(this),
      '.tsx': this.handleTypeScriptFile.bind(this),
      '.json': this.handleJsonFile.bind(this),
      '.md': this.handleMarkdownFile.bind(this),
      '.txt': this.handleTextFile.bind(this),
      '.yml': this.handleYamlFile.bind(this),
      '.yaml': this.handleYamlFile.bind(this),
      '.html': this.handleHtmlFile.bind(this),
      '.css': this.handleCssFile.bind(this),
      '.py': this.handlePythonFile.bind(this),
      '.default': this.handleDefaultFile.bind(this)
    };
  }

  /**
   * Initialize context templates
   */
  initializeContextTemplates() {
    return {
      fileSystem: {
        name: 'File System Context',
        priority: 1,
        builder: this.buildFileSystemContext.bind(this)
      },
      codeStructure: {
        name: 'Code Structure Context',
        priority: 2,
        builder: this.buildCodeStructureContext.bind(this)
      },
      dependencies: {
        name: 'Dependencies Context',
        priority: 3,
        builder: this.buildDependenciesContext.bind(this)
      },
      conversation: {
        name: 'Conversation Context',
        priority: 4,
        builder: this.buildConversationContext.bind(this)
      },
      environment: {
        name: 'Environment Context',
        priority: 5,
        builder: this.buildEnvironmentContext.bind(this)
      }
    };
  }

  /**
   * Build comprehensive context for reasoning
   */
  async buildContext(options = {}) {
    const startTime = Date.now();
    const contextId = uuidv4();
    
    try {
      if (this.logger) {
        this.logger.debug('Building context', { id: contextId, options });
      }

      let context = {
        id: contextId,
        timestamp: new Date().toISOString(),
        workingDirectory: this.workingDirectory,
        input: options.input,
        conversation: options.conversation,
        options: options.options || {},
        sections: {}
      };

      // Build each context section
      for (const [sectionName, template] of Object.entries(this.contextTemplates)) {
        try {
          const sectionContext = await template.builder(options);
          context.sections[sectionName] = {
            ...sectionContext,
            priority: template.priority,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          if (this.logger) {
            this.logger.warn(`Failed to build ${sectionName} context`, { error: error.message });
          }
          context.sections[sectionName] = {
            error: error.message,
            priority: template.priority
          };
        }
      }

      // Calculate total size and compress if needed
      const totalSize = this.calculateContextSize(context);
      if (totalSize > this.maxSize) {
        context = await this.compressContext(context);
      }

      // Store context
      this.contexts.set(contextId, context);

      const buildTime = Date.now() - startTime;
      
      if (this.logger) {
        this.logger.info('Context built successfully', {
          id: contextId,
          size: totalSize,
          buildTime,
          sections: Object.keys(context.sections).length
        });
      }

      this.emit('context:built', { context, buildTime });
      return context;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to build context', { id: contextId, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Build file system context
   */
  async buildFileSystemContext(options = {}) {
    const files = await this.scanFileSystem();
    const recentFiles = await this.getRecentFiles();
    const projectStructure = this.analyzeProjectStructure(files);

    return {
      files: files.slice(0, 50), // Limit to 50 most relevant files
      recentFiles,
      projectStructure,
      totalFiles: files.length,
      workingDirectory: this.workingDirectory
    };
  }

  /**
   * Build code structure context
   */
  async buildCodeStructureContext(options = {}) {
    const codeFiles = await this.getCodeFiles();
    const structures = [];
    
    for (const file of codeFiles.slice(0, 10)) { // Limit to 10 files for performance
      try {
        const structure = await this.analyzeCodeStructure(file);
        if (structure) {
          structures.push(structure);
        }
      } catch (error) {
        if (this.logger) {
          this.logger.debug('Failed to analyze code structure', { file: file.path, error: error.message });
        }
      }
    }

    return {
      codeFiles: codeFiles.length,
      structures,
      dependencies: this.buildDependencyMap(structures)
    };
  }

  /**
   * Build dependencies context
   */
  async buildDependenciesContext(options = {}) {
    const packageJson = await this.readPackageJson();
    const lockFiles = await this.findLockFiles();
    const imports = await this.analyzeImports();

    return {
      packageJson,
      lockFiles,
      imports,
      installedPackages: packageJson?.dependencies ? Object.keys(packageJson.dependencies) : [],
      devDependencies: packageJson?.devDependencies ? Object.keys(packageJson.devDependencies) : []
    };
  }

  /**
   * Build conversation context
   */
  async buildConversationContext(options = {}) {
    const conversation = options.conversation || {};
    
    return {
      id: conversation.id,
      messageCount: conversation.messages?.length || 0,
      recentMessages: conversation.messages?.slice(-5) || [],
      context: conversation.context || {},
      actions: conversation.actions || [],
      reasoning: conversation.reasoning || []
    };
  }

  /**
   * Build environment context
   */
  async buildEnvironmentContext(options = {}) {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      env: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Scan file system for relevant files
   */
  async scanFileSystem(directory = this.workingDirectory) {
    const files = [];
    
    try {
      const pattern = path.join(directory, '**/*');
      const globFiles = glob.sync(pattern, { 
        nodir: true,
        dot: false,
        ignore: ['node_modules/**', '.git/**']
      });

      for (const filePath of globFiles) {
        const relativePath = path.relative(directory, filePath);
        
        // Apply ignore patterns
        if (this.ignorePatterns.ignores(relativePath)) {
          continue;
        }

        try {
          const stats = await fs.stat(filePath);
          const ext = path.extname(filePath);
          
          files.push({
            path: filePath,
            relativePath,
            name: path.basename(filePath),
            ext,
            size: stats.size,
            modified: stats.mtime,
            type: this.getFileType(ext),
            importance: this.calculateFileImportance(filePath, stats)
          });
        } catch (error) {
          // Skip files that can't be accessed
        }
      }

      // Sort by importance
      files.sort((a, b) => b.importance - a.importance);
      
      return files;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to scan file system', { directory, error: error.message });
      }
      return [];
    }
  }

  /**
   * Get recently modified files
   */
  async getRecentFiles(limit = 10) {
    const files = await this.scanFileSystem();
    return files
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, limit);
  }

  /**
   * Get code files for analysis
   */
  async getCodeFiles() {
    const files = await this.scanFileSystem();
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs'];
    
    return files.filter(file => codeExtensions.includes(file.ext));
  }

  /**
   * Analyze code structure using AST
   */
  async analyzeCodeStructure(file) {
    try {
      // Check cache first
      if (this.astCache.has(file.path)) {
        const cached = this.astCache.get(file.path);
        if (cached.modified >= file.modified) {
          return cached.structure;
        }
      }

      const content = await fs.readFile(file.path, 'utf8');
      const handler = this.fileHandlers[file.ext] || this.fileHandlers['.default'];
      
      const structure = await handler(file.path, content);
      
      // Cache the result
      this.astCache.set(file.path, {
        structure,
        modified: file.modified
      });

      return structure;

    } catch (error) {
      if (this.logger) {
        this.logger.debug('Failed to analyze code structure', { file: file.path, error: error.message });
      }
      return null;
    }
  }

  /**
   * Handle JavaScript file analysis
   */
  async handleJavaScriptFile(filePath, content) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
      });

      const structure = {
        path: filePath,
        type: 'javascript',
        exports: [],
        imports: [],
        functions: [],
        classes: [],
        variables: [],
        dependencies: []
      };

      traverse(ast, {
        ImportDeclaration(path) {
          structure.imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(spec => ({
              type: spec.type,
              name: spec.local.name,
              imported: spec.imported?.name
            }))
          });
        },

        ExportDefaultDeclaration(path) {
          structure.exports.push({
            type: 'default',
            name: path.node.declaration.name || 'default'
          });
        },

        ExportNamedDeclaration(path) {
          if (path.node.specifiers) {
            path.node.specifiers.forEach(spec => {
              structure.exports.push({
                type: 'named',
                name: spec.exported.name,
                local: spec.local.name
              });
            });
          }
        },

        FunctionDeclaration(path) {
          structure.functions.push({
            name: path.node.id?.name || 'anonymous',
            params: path.node.params.map(param => param.name || 'unknown'),
            async: path.node.async,
            generator: path.node.generator
          });
        },

        ClassDeclaration(path) {
          structure.classes.push({
            name: path.node.id.name,
            superClass: path.node.superClass?.name,
            methods: []
          });
        },

        VariableDeclaration(path) {
          path.node.declarations.forEach(decl => {
            if (decl.id.name) {
              structure.variables.push({
                name: decl.id.name,
                kind: path.node.kind
              });
            }
          });
        }
      });

      return structure;

    } catch (error) {
      if (this.logger) {
        this.logger.debug('Failed to parse JavaScript file', { filePath, error: error.message });
      }
      return this.handleDefaultFile(filePath, content);
    }
  }

  /**
   * Handle TypeScript file analysis
   */
  async handleTypeScriptFile(filePath, content) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties']
      });

      // Similar to JavaScript but with TypeScript-specific handling
      return await this.handleJavaScriptFile(filePath, content);

    } catch (error) {
      if (this.logger) {
        this.logger.debug('Failed to parse TypeScript file', { filePath, error: error.message });
      }
      return this.handleDefaultFile(filePath, content);
    }
  }

  /**
   * Handle JSON file analysis
   */
  async handleJsonFile(filePath, content) {
    try {
      const data = JSON.parse(content);
      
      return {
        path: filePath,
        type: 'json',
        keys: Object.keys(data),
        structure: this.analyzeJsonStructure(data),
        size: content.length
      };

    } catch (error) {
      return this.handleDefaultFile(filePath, content);
    }
  }

  /**
   * Handle Markdown file analysis
   */
  async handleMarkdownFile(filePath, content) {
    const lines = content.split('\n');
    const headings = lines
      .filter(line => line.startsWith('#'))
      .map(line => ({
        level: (line.match(/^#+/) || [''])[0].length,
        text: line.replace(/^#+\s*/, '')
      }));

    return {
      path: filePath,
      type: 'markdown',
      headings,
      lineCount: lines.length,
      wordCount: content.split(/\s+/).length
    };
  }

  /**
   * Handle text file analysis
   */
  async handleTextFile(filePath, content) {
    return {
      path: filePath,
      type: 'text',
      lineCount: content.split('\n').length,
      wordCount: content.split(/\s+/).length,
      charCount: content.length
    };
  }

  /**
   * Handle YAML file analysis
   */
  async handleYamlFile(filePath, content) {
    try {
      const yaml = require('yaml');
      const data = yaml.parse(content);
      
      return {
        path: filePath,
        type: 'yaml',
        keys: typeof data === 'object' ? Object.keys(data) : [],
        structure: this.analyzeJsonStructure(data),
        size: content.length
      };

    } catch (error) {
      return this.handleDefaultFile(filePath, content);
    }
  }

  /**
   * Handle HTML file analysis
   */
  async handleHtmlFile(filePath, content) {
    const tags = (content.match(/<(\w+)/g) || [])
      .map(match => match.substring(1))
      .filter((tag, index, arr) => arr.indexOf(tag) === index);

    return {
      path: filePath,
      type: 'html',
      tags,
      hasScript: content.includes('<script'),
      hasStyle: content.includes('<style'),
      size: content.length
    };
  }

  /**
   * Handle CSS file analysis
   */
  async handleCssFile(filePath, content) {
    const selectors = (content.match(/[^{}]+(?=\s*{)/g) || [])
      .map(selector => selector.trim())
      .filter(selector => selector.length > 0);

    return {
      path: filePath,
      type: 'css',
      selectors: selectors.slice(0, 20), // Limit to 20 selectors
      ruleCount: selectors.length,
      size: content.length
    };
  }

  /**
   * Handle Python file analysis
   */
  async handlePythonFile(filePath, content) {
    const lines = content.split('\n');
    const imports = lines
      .filter(line => line.trim().startsWith('import ') || line.trim().startsWith('from '))
      .map(line => line.trim());

    const functions = lines
      .filter(line => line.trim().startsWith('def '))
      .map(line => {
        const match = line.match(/def\s+(\w+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const classes = lines
      .filter(line => line.trim().startsWith('class '))
      .map(line => {
        const match = line.match(/class\s+(\w+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    return {
      path: filePath,
      type: 'python',
      imports,
      functions,
      classes,
      lineCount: lines.length
    };
  }

  /**
   * Handle default file analysis
   */
  async handleDefaultFile(filePath, content) {
    return {
      path: filePath,
      type: 'unknown',
      size: content.length,
      lineCount: content.split('\n').length,
      isBinary: this.isBinaryContent(content)
    };
  }

  /**
   * Analyze JSON structure recursively
   */
  analyzeJsonStructure(obj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth || obj === null || typeof obj !== 'object') {
      return typeof obj;
    }

    if (Array.isArray(obj)) {
      return {
        type: 'array',
        length: obj.length,
        elementType: obj.length > 0 ? this.analyzeJsonStructure(obj[0], depth + 1, maxDepth) : 'unknown'
      };
    }

    const structure = {};
    for (const [key, value] of Object.entries(obj)) {
      structure[key] = this.analyzeJsonStructure(value, depth + 1, maxDepth);
    }

    return structure;
  }

  /**
   * Build dependency map from code structures
   */
  buildDependencyMap(structures) {
    const dependencies = new Map();

    for (const structure of structures) {
      if (structure.imports) {
        for (const imp of structure.imports) {
          if (!dependencies.has(imp.source)) {
            dependencies.set(imp.source, []);
          }
          dependencies.get(imp.source).push(structure.path);
        }
      }
    }

    return Object.fromEntries(dependencies);
  }

  /**
   * Read package.json if it exists
   */
  async readPackageJson() {
    try {
      const packagePath = path.join(this.workingDirectory, 'package.json');
      if (await fs.pathExists(packagePath)) {
        return await fs.readJson(packagePath);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.debug('Failed to read package.json', { error: error.message });
      }
    }
    return null;
  }

  /**
   * Find lock files
   */
  async findLockFiles() {
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const found = [];

    for (const lockFile of lockFiles) {
      const lockPath = path.join(this.workingDirectory, lockFile);
      if (await fs.pathExists(lockPath)) {
        found.push(lockFile);
      }
    }

    return found;
  }

  /**
   * Analyze imports across all files
   */
  async analyzeImports() {
    const codeFiles = await this.getCodeFiles();
    const imports = new Map();

    for (const file of codeFiles.slice(0, 20)) { // Limit for performance
      try {
        const structure = await this.analyzeCodeStructure(file);
        if (structure?.imports) {
          for (const imp of structure.imports) {
            if (!imports.has(imp.source)) {
              imports.set(imp.source, { count: 0, files: [] });
            }
            const entry = imports.get(imp.source);
            entry.count++;
            entry.files.push(file.relativePath);
          }
        }
      } catch (error) {
        // Skip files that can't be analyzed
      }
    }

    return Object.fromEntries(imports);
  }

  /**
   * Analyze project structure
   */
  analyzeProjectStructure(files) {
    const structure = {
      directories: new Set(),
      fileTypes: new Map(),
      patterns: []
    };

    for (const file of files) {
      // Track directories
      const dir = path.dirname(file.relativePath);
      if (dir !== '.') {
        structure.directories.add(dir);
      }

      // Track file types
      const ext = file.ext || 'no-extension';
      if (!structure.fileTypes.has(ext)) {
        structure.fileTypes.set(ext, 0);
      }
      structure.fileTypes.set(ext, structure.fileTypes.get(ext) + 1);
    }

    // Detect common patterns
    if (structure.directories.has('src')) structure.patterns.push('src-based');
    if (structure.directories.has('lib')) structure.patterns.push('lib-based');
    if (structure.directories.has('components')) structure.patterns.push('component-based');
    if (structure.directories.has('pages')) structure.patterns.push('page-based');
    if (structure.fileTypes.has('.js') || structure.fileTypes.has('.ts')) structure.patterns.push('javascript');
    if (structure.fileTypes.has('.py')) structure.patterns.push('python');

    return {
      directories: Array.from(structure.directories),
      fileTypes: Object.fromEntries(structure.fileTypes),
      patterns: structure.patterns
    };
  }

  /**
   * Calculate file importance for context prioritization
   */
  calculateFileImportance(filePath, stats) {
    let importance = 0;

    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);

    // Important file names
    const importantFiles = [
      'package.json', 'README.md', 'index.js', 'index.ts', 'main.js', 'main.ts',
      'app.js', 'app.ts', 'server.js', 'server.ts', 'config.js', 'config.ts'
    ];
    
    if (importantFiles.includes(fileName)) {
      importance += 10;
    }

    // Important extensions
    const importantExts = ['.js', '.ts', '.jsx', '.tsx', '.json', '.md'];
    if (importantExts.includes(ext)) {
      importance += 5;
    }

    // Root level files are more important
    if (dir === '.') {
      importance += 3;
    }

    // Recently modified files are more important
    const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 1) importance += 5;
    else if (daysSinceModified < 7) importance += 3;
    else if (daysSinceModified < 30) importance += 1;

    // Smaller files are easier to include in context
    if (stats.size < 1000) importance += 2;
    else if (stats.size < 10000) importance += 1;

    return importance;
  }

  /**
   * Get file type from extension
   */
  getFileType(ext) {
    const typeMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'react',
      '.tsx': 'react-typescript',
      '.json': 'json',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp'
    };

    return typeMap[ext] || 'unknown';
  }

  /**
   * Check if content is binary
   */
  isBinaryContent(content) {
    // Simple binary detection
    const nullBytes = (content.match(/\0/g) || []).length;
    return nullBytes > content.length * 0.01; // More than 1% null bytes
  }

  /**
   * Calculate total context size
   */
  calculateContextSize(context) {
    return JSON.stringify(context).length;
  }

  /**
   * Compress context when it exceeds size limits
   */
  async compressContext(context) {
    if (this.logger) {
      this.logger.info('Compressing context due to size limit', {
        currentSize: this.calculateContextSize(context),
        maxSize: this.maxSize
      });
    }

    // Compress based on retention strategy
    switch (this.retentionStrategy) {
      case 'importance':
        return this.compressByImportance(context);
      case 'recency':
        return this.compressByRecency(context);
      case 'fifo':
        return this.compressByFifo(context);
      default:
        return this.compressByImportance(context);
    }
  }

  /**
   * Compress context by importance
   */
  compressByImportance(context) {
    // Keep most important sections and files
    if (context.sections.fileSystem?.files) {
      context.sections.fileSystem.files = context.sections.fileSystem.files
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 20);
    }

    if (context.sections.codeStructure?.structures) {
      context.sections.codeStructure.structures = context.sections.codeStructure.structures.slice(0, 5);
    }

    return context;
  }

  /**
   * Compress context by recency
   */
  compressByRecency(context) {
    // Keep most recent files and conversations
    if (context.sections.fileSystem?.files) {
      context.sections.fileSystem.files = context.sections.fileSystem.files
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))
        .slice(0, 20);
    }

    return context;
  }

  /**
   * Compress context by FIFO
   */
  compressByFifo(context) {
    // Simple truncation
    if (context.sections.fileSystem?.files) {
      context.sections.fileSystem.files = context.sections.fileSystem.files.slice(0, 20);
    }

    if (context.sections.codeStructure?.structures) {
      context.sections.codeStructure.structures = context.sections.codeStructure.structures.slice(0, 5);
    }

    return context;
  }

  /**
   * Update context with new information
   */
  async updateContext(options = {}) {
    const { conversationId, reasoning, executionResults } = options;
    
    if (conversationId && this.contexts.has(conversationId)) {
      const context = this.contexts.get(conversationId);
      
      // Update with reasoning results
      if (reasoning) {
        context.reasoning = reasoning;
      }
      
      // Update with execution results
      if (executionResults) {
        context.executionResults = executionResults;
        
        // Update file cache if files were modified
        if (executionResults.results) {
          for (const result of executionResults.results) {
            if (result.action?.tool === 'filesystem') {
              // Invalidate file cache for modified files
              this.invalidateFileCache(result.action.parameters);
            }
          }
        }
      }
      
      context.lastUpdated = new Date().toISOString();
      this.contexts.set(conversationId, context);
    }
  }

  /**
   * Invalidate file cache for modified files
   */
  invalidateFileCache(parameters) {
    if (parameters && parameters[0]) {
      const filePath = path.resolve(parameters[0]);
      this.fileCache.delete(filePath);
      this.astCache.delete(filePath);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    if (newConfig.maxSize) {
      this.maxSize = newConfig.maxSize;
    }
    
    if (newConfig.compressionThreshold) {
      this.compressionThreshold = newConfig.compressionThreshold;
    }
    
    if (newConfig.retentionStrategy) {
      this.retentionStrategy = newConfig.retentionStrategy;
    }

    if (this.logger) {
      this.logger.info('Context manager configuration updated', newConfig);
    }
  }

  /**
   * Cleanup old contexts and caches
   */
  async cleanup() {
    // Clear old contexts (keep last 10)
    if (this.contexts.size > 10) {
      const entries = Array.from(this.contexts.entries());
      const toKeep = entries.slice(-10);
      this.contexts.clear();
      for (const [id, context] of toKeep) {
        this.contexts.set(id, context);
      }
    }

    // Clear file cache
    this.fileCache.clear();
    
    // Clear AST cache for old files
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    for (const [filePath, cached] of this.astCache.entries()) {
      if (now - cached.modified.getTime() > maxAge) {
        this.astCache.delete(filePath);
      }
    }

    if (this.logger) {
      this.logger.info('Context manager cleanup completed');
    }
  }

  /**
   * Get context manager status
   */
  getStatus() {
    return {
      maxSize: this.maxSize,
      compressionThreshold: this.compressionThreshold,
      retentionStrategy: this.retentionStrategy,
      workingDirectory: this.workingDirectory,
      contextsCount: this.contexts.size,
      fileCacheSize: this.fileCache.size,
      astCacheSize: this.astCache.size
    };
  }
}

module.exports = ContextManager;