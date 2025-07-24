const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');

const execAsync = promisify(exec);

/**
 * Enhanced execution tool with security controls and comprehensive command handling
 */
class ExecTool {
  constructor(options = {}) {
    this.logger = options.logger;
    this.security = options.security || {};
    this.allowedCommands = options.allowedCommands || this.security.allowedCommands || [
      'npm', 'node', 'git', 'ls', 'pwd', 'cat', 'echo', 'mkdir', 'touch',
      'grep', 'find', 'curl', 'wget', 'which', 'whereis', 'ps', 'sleep'
    ];
    this.blockedCommands = options.blockedCommands || this.security.blockedCommands || [
      'rm', 'rmdir', 'del', 'format', 'fdisk', 'mkfs', 'dd', 'sudo', 'su',
      'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'halt', 'init'
    ];
    this.maxExecutionTime = options.maxExecutionTime || this.security.maxExecutionTime || 30000; // 30 seconds
    this.maxOutputSize = options.maxOutputSize || this.security.maxOutputSize || 1048576; // 1MB
    this.workingDirectory = process.cwd();
  }

  /**
   * Get tool metadata
   */
  getMetadata() {
    return {
      name: 'exec',
      version: '2.0.0',
      description: 'Enhanced command execution with security controls',
      capabilities: [
        'execute_command', 'install_package', 'run_script',
        'spawn_process', 'check_command', 'get_environment'
      ],
      security: {
        allowedCommands: this.allowedCommands,
        blockedCommands: this.blockedCommands,
        maxExecutionTime: this.maxExecutionTime,
        maxOutputSize: this.maxOutputSize
      }
    };
  }

  /**
   * Validate action before execution
   */
  async validateAction(action) {
    const validation = { valid: true, errors: [], warnings: [] };

    if (action.parameters && action.parameters[0]) {
      const command = action.parameters[0];
      const safetyCheck = this.isCommandSafe(command);
      
      if (!safetyCheck.safe) {
        validation.valid = false;
        validation.errors.push(safetyCheck.reason);
      }

      if (safetyCheck.warnings) {
        validation.warnings.push(...safetyCheck.warnings);
      }
    }

    return validation;
  }

  /**
   * Main execution method
   */
  async execute(method, ...args) {
    if (!this[method] || typeof this[method] !== 'function') {
      throw new Error(`Method ${method} not found in ExecTool`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this[method](...args);
      
      if (this.logger) {
        this.logger.logPerformance(`exec:${method}`, Date.now() - startTime, {
          args: args.length,
          success: true
        });
      }

      return result;
    } catch (error) {
      if (this.logger) {
        this.logger.logPerformance(`exec:${method}`, Date.now() - startTime, {
          args: args.length,
          success: false,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Execute shell command
   */
  async executeCommand(command, options = {}) {
    try {
      // Security check
      const safetyCheck = this.isCommandSafe(command);
      if (!safetyCheck.safe) {
        throw new Error(`Command blocked: ${safetyCheck.reason}`);
      }

      const execOptions = {
        cwd: options.cwd || this.workingDirectory,
        timeout: options.timeout || this.maxExecutionTime,
        maxBuffer: options.maxBuffer || this.maxOutputSize,
        env: { ...process.env, ...options.env }
      };

      if (this.logger) {
        this.logger.info('Executing command', { command, options: execOptions });
      }

      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, execOptions);
      const executionTime = Date.now() - startTime;

      const result = {
        success: true,
        command,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        executionTime,
        exitCode: 0
      };

      if (this.logger) {
        this.logger.info('Command executed successfully', {
          command,
          executionTime,
          outputLength: result.stdout.length
        });
      }

      return result;

    } catch (error) {
      const result = {
        success: false,
        command,
        error: error.message,
        stdout: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : '',
        exitCode: error.code || 1,
        signal: error.signal
      };

      if (this.logger) {
        this.logger.error('Command execution failed', {
          command,
          error: error.message,
          exitCode: result.exitCode
        });
      }

      return result;
    }
  }

  /**
   * Install npm package
   */
  async installPackage(packageName, options = {}) {
    try {
      // Validate package name
      if (!this.isValidPackageName(packageName)) {
        throw new Error(`Invalid package name: ${packageName}`);
      }

      const installType = options.dev ? '--save-dev' : '--save';
      const version = options.version ? `@${options.version}` : '';
      const command = `npm install ${installType} ${packageName}${version}`;

      if (this.logger) {
        this.logger.info('Installing package', { packageName, options });
      }

      const result = await this.executeCommand(command, {
        timeout: options.timeout || 120000, // 2 minutes for package installation
        ...options
      });

      if (result.success) {
        // Verify installation
        const verifyResult = await this.verifyPackageInstallation(packageName);
        result.verified = verifyResult.installed;
        result.version = verifyResult.version;
      }

      return result;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Package installation failed', {
          packageName,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Run npm script
   */
  async runScript(scriptName, options = {}) {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(this.workingDirectory, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        throw new Error('package.json not found in current directory');
      }

      // Read package.json to verify script exists
      const packageJson = await fs.readJson(packageJsonPath);
      if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
        throw new Error(`Script '${scriptName}' not found in package.json`);
      }

      const command = `npm run ${scriptName}`;

      if (this.logger) {
        this.logger.info('Running npm script', { scriptName, command: packageJson.scripts[scriptName] });
      }

      return await this.executeCommand(command, options);

    } catch (error) {
      if (this.logger) {
        this.logger.error('Script execution failed', {
          scriptName,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Spawn long-running process
   */
  async spawnProcess(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Security check
        const fullCommand = `${command} ${args.join(' ')}`;
        const safetyCheck = this.isCommandSafe(fullCommand);
        if (!safetyCheck.safe) {
          reject(new Error(`Command blocked: ${safetyCheck.reason}`));
          return;
        }

        const spawnOptions = {
          cwd: options.cwd || this.workingDirectory,
          env: { ...process.env, ...options.env },
          stdio: options.stdio || 'pipe'
        };

        if (this.logger) {
          this.logger.info('Spawning process', { command, args, options: spawnOptions });
        }

        const child = spawn(command, args, spawnOptions);
        let stdout = '';
        let stderr = '';

        // Collect output
        if (child.stdout) {
          child.stdout.on('data', (data) => {
            stdout += data.toString();
            if (stdout.length > this.maxOutputSize) {
              child.kill('SIGTERM');
              reject(new Error('Output size limit exceeded'));
            }
          });
        }

        if (child.stderr) {
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        // Handle process completion
        child.on('close', (code, signal) => {
          const result = {
            success: code === 0,
            command: `${command} ${args.join(' ')}`,
            stdout,
            stderr,
            exitCode: code,
            signal,
            pid: child.pid
          };

          if (this.logger) {
            this.logger.info('Process completed', {
              command,
              exitCode: code,
              signal,
              outputLength: stdout.length
            });
          }

          resolve(result);
        });

        child.on('error', (error) => {
          if (this.logger) {
            this.logger.error('Process spawn failed', {
              command,
              error: error.message
            });
          }
          reject(error);
        });

        // Set timeout
        const timeout = options.timeout || this.maxExecutionTime;
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGTERM');
            reject(new Error(`Process timed out after ${timeout}ms`));
          }
        }, timeout);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Check if command exists
   */
  async checkCommand(command) {
    try {
      const result = await this.executeCommand(`which ${command}`, { timeout: 5000 });
      
      return {
        exists: result.success && result.stdout.trim().length > 0,
        path: result.stdout.trim(),
        command
      };

    } catch (error) {
      return {
        exists: false,
        error: error.message,
        command
      };
    }
  }

  /**
   * Get environment information
   */
  async getEnvironment() {
    try {
      const nodeVersion = await this.executeCommand('node --version');
      const npmVersion = await this.executeCommand('npm --version');
      const gitVersion = await this.executeCommand('git --version');
      
      return {
        success: true,
        node: {
          version: nodeVersion.stdout.trim(),
          available: nodeVersion.success
        },
        npm: {
          version: npmVersion.stdout.trim(),
          available: npmVersion.success
        },
        git: {
          version: gitVersion.stdout.trim(),
          available: gitVersion.success
        },
        platform: process.platform,
        arch: process.arch,
        cwd: this.workingDirectory,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH
        }
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to get environment info', { error: error.message });
      }
      throw error;
    }
  }

  /**
   * Check if command is safe to execute
   */
  isCommandSafe(command) {
    const result = { safe: true, reason: '', warnings: [] };
    
    // Extract base command
    const baseCommand = command.trim().split(' ')[0];
    
    // Check blocked commands
    for (const blocked of this.blockedCommands) {
      if (command.toLowerCase().includes(blocked.toLowerCase())) {
        result.safe = false;
        result.reason = `Blocked command detected: ${blocked}`;
        return result;
      }
    }

    // Check if command is in allowed list (if allowedCommands is restrictive)
    if (this.allowedCommands.length > 0) {
      const isAllowed = this.allowedCommands.some(allowed => 
        baseCommand.toLowerCase() === allowed.toLowerCase() ||
        command.toLowerCase().startsWith(allowed.toLowerCase())
      );
      
      if (!isAllowed) {
        result.safe = false;
        result.reason = `Command not in allowed list: ${baseCommand}`;
        return result;
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf/i,
      />\s*\/dev\/null/i,
      /;\s*rm/i,
      /&&\s*rm/i,
      /\|\s*rm/i,
      /sudo/i,
      /su\s/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        result.warnings.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check for shell injection attempts
    const injectionPatterns = [
      /[;&|`$()]/,
      /\$\{/,
      /\$\(/
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(command)) {
        result.warnings.push(`Potential shell injection pattern: ${pattern.source}`);
      }
    }

    return result;
  }

  /**
   * Validate npm package name
   */
  isValidPackageName(packageName) {
    // Basic npm package name validation
    const packageNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    return packageNameRegex.test(packageName);
  }

  /**
   * Verify package installation
   */
  async verifyPackageInstallation(packageName) {
    try {
      const command = `npm list ${packageName} --depth=0 --json`;
      const result = await this.executeCommand(command, { timeout: 10000 });
      
      if (result.success) {
        try {
          const listData = JSON.parse(result.stdout);
          const dependencies = listData.dependencies || {};
          
          if (dependencies[packageName]) {
            return {
              installed: true,
              version: dependencies[packageName].version
            };
          }
        } catch (parseError) {
          // Fallback to simple check
        }
      }

      return { installed: false };

    } catch (error) {
      return { installed: false, error: error.message };
    }
  }

  /**
   * Configure security settings
   */
  configureSecurity(settings) {
    if (settings.allowedCommands) {
      this.allowedCommands = settings.allowedCommands;
    }
    
    if (settings.blockedCommands) {
      this.blockedCommands = settings.blockedCommands;
    }
    
    if (settings.maxExecutionTime) {
      this.maxExecutionTime = settings.maxExecutionTime;
    }
    
    if (settings.maxOutputSize) {
      this.maxOutputSize = settings.maxOutputSize;
    }

    if (this.logger) {
      this.logger.info('Exec tool security configured', settings);
    }
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(directory) {
    if (fs.existsSync(directory)) {
      this.workingDirectory = path.resolve(directory);
      
      if (this.logger) {
        this.logger.info('Working directory changed', { directory: this.workingDirectory });
      }
    } else {
      throw new Error(`Directory does not exist: ${directory}`);
    }
  }
}

module.exports = ExecTool;