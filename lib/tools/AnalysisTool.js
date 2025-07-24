const fs = require('fs-extra');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const glob = require('glob');

/**
 * Analysis tool for code structure and dependency analysis
 */
class AnalysisTool {
  constructor(options = {}) {
    this.logger = options.logger;
    this.cache = new Map();
  }

  /**
   * Get tool metadata
   */
  getMetadata() {
    return {
      name: 'analysis',
      version: '1.0.0',
      description: 'Code and file analysis operations',
      capabilities: [
        'analyze_code', 'find_pattern', 'get_dependencies',
        'analyze_structure', 'find_imports', 'get_exports'
      ]
    };
  }

  /**
   * Main execution method
   */
  async execute(method, ...args) {
    if (!this[method] || typeof this[method] !== 'function') {
      throw new Error(`Method ${method} not found in AnalysisTool`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this[method](...args);
      
      if (this.logger) {
        this.logger.logPerformance(`analysis:${method}`, Date.now() - startTime, {
          args: args.length,
          success: true
        });
      }

      return result;
    } catch (error) {
      if (this.logger) {
        this.logger.logPerformance(`analysis:${method}`, Date.now() - startTime, {
          args: args.length,
          success: false,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Analyze code structure
   */
  async analyzeCode(filePath, options = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      const content = await fs.readFile(resolvedPath, 'utf8');
      const ext = path.extname(filePath);

      let analysis;
      switch (ext) {
        case '.js':
        case '.jsx':
          analysis = await this.analyzeJavaScript(content, filePath);
          break;
        case '.ts':
        case '.tsx':
          analysis = await this.analyzeTypeScript(content, filePath);
          break;
        case '.json':
          analysis = await this.analyzeJSON(content, filePath);
          break;
        default:
          analysis = await this.analyzeGeneric(content, filePath);
      }

      if (this.logger) {
        this.logger.debug('Code analysis completed', {
          file: filePath,
          type: analysis.type,
          complexity: analysis.complexity
        });
      }

      return {
        success: true,
        file: filePath,
        analysis
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Code analysis failed', { file: filePath, error: error.message });
      }
      throw error;
    }
  }

  /**
   * Find pattern in files
   */
  async findPattern(pattern, searchDir = '.', options = {}) {
    try {
      const resolvedDir = path.resolve(searchDir);
      
      if (!await fs.pathExists(resolvedDir)) {
        throw new Error(`Directory does not exist: ${searchDir}`);
      }

      const filePattern = options.filePattern || '**/*';
      const caseSensitive = options.caseSensitive || false;
      const maxResults = options.maxResults || 100;

      const globOptions = {
        cwd: resolvedDir,
        ignore: options.ignore || ['node_modules/**', '.git/**', 'dist/**'],
        nodir: true
      };

      const files = glob.sync(filePattern, globOptions);
      const results = [];

      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

      for (const file of files) {
        if (results.length >= maxResults) break;

        try {
          const filePath = path.join(resolvedDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const matches = lines[i].match(regex);
            if (matches) {
              results.push({
                file,
                line: i + 1,
                content: lines[i].trim(),
                matches: matches.length,
                context: {
                  before: lines[i - 1]?.trim() || '',
                  after: lines[i + 1]?.trim() || ''
                }
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }

      if (this.logger) {
        this.logger.debug('Pattern search completed', {
          pattern,
          directory: searchDir,
          filesSearched: files.length,
          matches: results.length
        });
      }

      return {
        success: true,
        pattern,
        directory: searchDir,
        results,
        summary: {
          filesSearched: files.length,
          matches: results.length,
          filesWithMatches: new Set(results.map(r => r.file)).size
        }
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Pattern search failed', {
          pattern,
          directory: searchDir,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Get project dependencies
   */
  async getDependencies(projectDir = '.') {
    try {
      const resolvedDir = path.resolve(projectDir);
      const packageJsonPath = path.join(resolvedDir, 'package.json');

      if (!await fs.pathExists(packageJsonPath)) {
        throw new Error('package.json not found');
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};
      const peerDependencies = packageJson.peerDependencies || {};

      // Analyze lock file if available
      let lockFileInfo = null;
      const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
      
      for (const lockFile of lockFiles) {
        const lockPath = path.join(resolvedDir, lockFile);
        if (await fs.pathExists(lockPath)) {
          lockFileInfo = {
            type: lockFile,
            exists: true
          };
          break;
        }
      }

      // Find imports in code files
      const codeImports = await this.findImportsInProject(resolvedDir);

      const result = {
        success: true,
        project: projectDir,
        packageJson: {
          name: packageJson.name,
          version: packageJson.version,
          dependencies: Object.keys(dependencies),
          devDependencies: Object.keys(devDependencies),
          peerDependencies: Object.keys(peerDependencies)
        },
        lockFile: lockFileInfo,
        codeImports,
        analysis: {
          totalDependencies: Object.keys(dependencies).length,
          totalDevDependencies: Object.keys(devDependencies).length,
          unusedDependencies: this.findUnusedDependencies(dependencies, codeImports),
          missingDependencies: this.findMissingDependencies(codeImports, dependencies)
        }
      };

      if (this.logger) {
        this.logger.debug('Dependencies analysis completed', {
          project: projectDir,
          totalDeps: result.analysis.totalDependencies,
          unusedDeps: result.analysis.unusedDependencies.length
        });
      }

      return result;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Dependencies analysis failed', {
          project: projectDir,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Analyze JavaScript code
   */
  async analyzeJavaScript(content, filePath) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'decorators-legacy', 'classProperties', 'dynamicImport']
      });

      const analysis = {
        type: 'javascript',
        file: filePath,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        variables: [],
        complexity: 0,
        lines: content.split('\n').length,
        size: content.length
      };

      traverse(ast, {
        ImportDeclaration(path) {
          analysis.imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(spec => ({
              type: spec.type,
              name: spec.local.name,
              imported: spec.imported?.name
            }))
          });
        },

        ExportDefaultDeclaration(path) {
          analysis.exports.push({
            type: 'default',
            name: path.node.declaration.name || 'default'
          });
        },

        ExportNamedDeclaration(path) {
          if (path.node.specifiers) {
            path.node.specifiers.forEach(spec => {
              analysis.exports.push({
                type: 'named',
                name: spec.exported.name,
                local: spec.local.name
              });
            });
          }
        },

        FunctionDeclaration(path) {
          analysis.functions.push({
            name: path.node.id?.name || 'anonymous',
            params: path.node.params.length,
            async: path.node.async,
            generator: path.node.generator,
            line: path.node.loc?.start.line
          });
          analysis.complexity += 1;
        },

        ClassDeclaration(path) {
          const methods = [];
          path.traverse({
            ClassMethod(methodPath) {
              methods.push({
                name: methodPath.node.key.name,
                kind: methodPath.node.kind,
                static: methodPath.node.static,
                async: methodPath.node.async
              });
            }
          });

          analysis.classes.push({
            name: path.node.id.name,
            superClass: path.node.superClass?.name,
            methods,
            line: path.node.loc?.start.line
          });
          analysis.complexity += 2;
        },

        VariableDeclaration(path) {
          path.node.declarations.forEach(decl => {
            if (decl.id.name) {
              analysis.variables.push({
                name: decl.id.name,
                kind: path.node.kind,
                line: path.node.loc?.start.line
              });
            }
          });
        },

        IfStatement() {
          analysis.complexity += 1;
        },

        WhileStatement() {
          analysis.complexity += 1;
        },

        ForStatement() {
          analysis.complexity += 1;
        },

        SwitchStatement() {
          analysis.complexity += 1;
        }
      });

      return analysis;

    } catch (error) {
      return {
        type: 'javascript',
        file: filePath,
        error: error.message,
        lines: content.split('\n').length,
        size: content.length
      };
    }
  }

  /**
   * Analyze TypeScript code
   */
  async analyzeTypeScript(content, filePath) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties']
      });

      // Similar to JavaScript analysis but with TypeScript specifics
      const analysis = await this.analyzeJavaScript(content, filePath);
      analysis.type = 'typescript';

      // Add TypeScript-specific analysis here
      // (interfaces, types, decorators, etc.)

      return analysis;

    } catch (error) {
      return {
        type: 'typescript',
        file: filePath,
        error: error.message,
        lines: content.split('\n').length,
        size: content.length
      };
    }
  }

  /**
   * Analyze JSON file
   */
  async analyzeJSON(content, filePath) {
    try {
      const data = JSON.parse(content);
      
      return {
        type: 'json',
        file: filePath,
        valid: true,
        keys: Object.keys(data),
        structure: this.analyzeJSONStructure(data),
        size: content.length
      };

    } catch (error) {
      return {
        type: 'json',
        file: filePath,
        valid: false,
        error: error.message,
        size: content.length
      };
    }
  }

  /**
   * Analyze generic file
   */
  async analyzeGeneric(content, filePath) {
    const lines = content.split('\n');
    
    return {
      type: 'generic',
      file: filePath,
      lines: lines.length,
      size: content.length,
      encoding: 'utf8',
      isEmpty: content.trim().length === 0,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length
    };
  }

  /**
   * Find imports in project
   */
  async findImportsInProject(projectDir) {
    const imports = new Set();
    const files = glob.sync('**/*.{js,jsx,ts,tsx}', {
      cwd: projectDir,
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });

    for (const file of files) {
      try {
        const filePath = path.join(projectDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const fileImports = this.extractImports(content);
        fileImports.forEach(imp => imports.add(imp));
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return Array.from(imports);
  }

  /**
   * Extract imports from code content
   */
  extractImports(content) {
    const imports = [];
    
    // ES6 imports
    const es6ImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Filter out relative imports
    return imports.filter(imp => !imp.startsWith('.'));
  }

  /**
   * Find unused dependencies
   */
  findUnusedDependencies(dependencies, codeImports) {
    const dependencyNames = Object.keys(dependencies);
    return dependencyNames.filter(dep => !codeImports.includes(dep));
  }

  /**
   * Find missing dependencies
   */
  findMissingDependencies(codeImports, dependencies) {
    const dependencyNames = Object.keys(dependencies);
    return codeImports.filter(imp => {
      // Check if it's a Node.js built-in module
      const builtinModules = ['fs', 'path', 'http', 'https', 'util', 'os', 'crypto'];
      if (builtinModules.includes(imp)) return false;
      
      // Check if it's in dependencies
      return !dependencyNames.includes(imp);
    });
  }

  /**
   * Analyze JSON structure
   */
  analyzeJSONStructure(obj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth || obj === null || typeof obj !== 'object') {
      return typeof obj;
    }

    if (Array.isArray(obj)) {
      return {
        type: 'array',
        length: obj.length,
        elementType: obj.length > 0 ? this.analyzeJSONStructure(obj[0], depth + 1, maxDepth) : 'unknown'
      };
    }

    const structure = {};
    for (const [key, value] of Object.entries(obj)) {
      structure[key] = this.analyzeJSONStructure(value, depth + 1, maxDepth);
    }

    return structure;
  }
}

module.exports = AnalysisTool;