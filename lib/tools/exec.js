const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const Utils = require('../utils');

const execAsync = promisify(exec);

/**
 * Shell execution tool for the agent
 */
class ExecTool {
  constructor(logger = null) {
    this.logger = logger;
    this.name = 'exec';
    this.description = 'Shell command execution';
    
    // Default security settings
    this.allowedCommands = [
      'npm', 'node', 'git', 'ls', 'pwd', 'cat', 'echo', 'mkdir', 'touch',
      'grep', 'find', 'curl', 'wget', 'which', 'whereis', 'ps', 'kill'
    ];
    
    this.blockedCommands = [
      'rm', 'rmdir', 'del', 'format', 'fdisk', 'mkfs', 'dd', 'sudo', 'su',
      'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'halt', 'init'
    ];
    
    this.maxExecutionTime = 30000; // 30 seconds
    this.maxOutputSize = 1024 * 1024; // 1MB
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
   * Check if command is safe to execute
   */
  isCommandSafe(command) {
    const firstWord = command.trim().split(/\s+/)[0];
    const baseCommand = path.basename(firstWord);
    
    // Check blocked commands
    if (this.blockedCommands.includes(baseCommand)) {
      return {
        safe: false,
        reason: `Command '${baseCommand}' is blocked for security reasons`
      };
    }
    
    // Check dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf/i,
      />\s*\/dev\/null/i,
      /&&.*rm/i,
      /;\s*rm/i,
      /\|\s*rm/i,
      /sudo/i,
      /su\s+/i,
      /chmod.*777/i,
      /eval/i,
      /exec/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: `Command contains dangerous pattern: ${pattern.source}`
        };
      }
    }
    
    return { safe: true };
  }

  /**
   * Execute shell command
   */
  async executeCommand(command, options = {}) {
    try {
      const cwd = options.cwd || process.cwd();
      const timeout = options.timeout || this.maxExecutionTime;
      const env = { ...process.env, ...options.env };
      const shell = options.shell || true;
      
      // Security check
      const safetyCheck = this.isCommandSafe(command);
      if (!safetyCheck.safe) {
        throw new Error(`Security violation: ${safetyCheck.reason}`);
      }

      const startTime = Date.now();
      
      this.log('executeCommand', {
        command: Utils.sanitizeForLog(command),
        cwd,
        timeout,
        started: new Date().toISOString()
      });

      const result = await execAsync(command, {
        cwd,
        timeout,
        env,
        shell,
        maxBuffer: this.maxOutputSize
      });

      const executionTime = Date.now() - startTime;

      this.log('executeCommand', {
        command: Utils.sanitizeForLog(command),
        success: true,
        executionTime,
        outputSize: result.stdout.length + result.stderr.length
      });

      return {
        success: true,
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime,
        cwd,
        exitCode: 0
      };
    } catch (error) {
      const executionTime = Date.now() - (error.startTime || Date.now());
      
      this.log('executeCommand', {
        command: Utils.sanitizeForLog(command),
        success: false,
        error: error.message,
        executionTime
      });

      return {
        success: false,
        command,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        executionTime,
        cwd: options.cwd || process.cwd(),
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Execute command with real-time output streaming
   */
  async executeCommandStream(command, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const cwd = options.cwd || process.cwd();
        const env = { ...process.env, ...options.env };
        const onOutput = options.onOutput || (() => {});
        const onError = options.onError || (() => {});
        
        // Security check
        const safetyCheck = this.isCommandSafe(command);
        if (!safetyCheck.safe) {
          reject(new Error(`Security violation: ${safetyCheck.reason}`));
          return;
        }

        const startTime = Date.now();
        let stdout = '';
        let stderr = '';

        this.log('executeCommandStream', {
          command: Utils.sanitizeForLog(command),
          cwd,
          started: new Date().toISOString()
        });

        // Split command into program and arguments
        const args = command.split(/\s+/);
        const program = args.shift();

        const child = spawn(program, args, {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle stdout
        child.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          onOutput(output, 'stdout');
        });

        // Handle stderr
        child.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          onError(output, 'stderr');
        });

        // Handle completion
        child.on('close', (code) => {
          const executionTime = Date.now() - startTime;

          this.log('executeCommandStream', {
            command: Utils.sanitizeForLog(command),
            success: code === 0,
            executionTime,
            exitCode: code,
            outputSize: stdout.length + stderr.length
          });

          resolve({
            success: code === 0,
            command,
            stdout,
            stderr,
            executionTime,
            cwd,
            exitCode: code
          });
        });

        // Handle errors
        child.on('error', (error) => {
          const executionTime = Date.now() - startTime;
          
          this.log('executeCommandStream', {
            command: Utils.sanitizeForLog(command),
            success: false,
            error: error.message,
            executionTime
          });

          reject({
            success: false,
            command,
            error: error.message,
            stdout,
            stderr,
            executionTime,
            cwd,
            exitCode: 1
          });
        });

        // Set timeout
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${this.maxExecutionTime}ms`));
        }, this.maxExecutionTime);

        child.on('close', () => {
          clearTimeout(timeoutId);
        });

      } catch (error) {
        this.log('executeCommandStream', {
          command: Utils.sanitizeForLog(command),
          success: false,
          error: error.message
        });

        reject({
          success: false,
          command,
          error: error.message,
          stdout: '',
          stderr: '',
          executionTime: 0,
          cwd: options.cwd || process.cwd(),
          exitCode: 1
        });
      }
    });
  }

  /**
   * Install npm package
   */
  async installPackage(packageName, options = {}) {
    try {
      const global = options.global === true;
      const dev = options.dev === true;
      const cwd = options.cwd || process.cwd();
      
      let command = 'npm install';
      if (global) command += ' -g';
      if (dev) command += ' --save-dev';
      else command += ' --save';
      
      command += ` ${packageName}`;

      this.log('installPackage', {
        package: packageName,
        global,
        dev,
        cwd
      });

      const result = await this.executeCommand(command, { cwd });

      return {
        ...result,
        package: packageName,
        installed: result.success
      };
    } catch (error) {
      this.log('installPackage', {
        package: packageName,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        package: packageName,
        installed: false
      };
    }
  }

  /**
   * Run npm script
   */
  async runNpmScript(scriptName, options = {}) {
    try {
      const cwd = options.cwd || process.cwd();
      const command = `npm run ${scriptName}`;

      this.log('runNpmScript', {
        script: scriptName,
        cwd
      });

      const result = await this.executeCommand(command, { cwd });

      return {
        ...result,
        script: scriptName,
        ran: result.success
      };
    } catch (error) {
      this.log('runNpmScript', {
        script: scriptName,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        script: scriptName,
        ran: false
      };
    }
  }

  /**
   * Get current working directory
   */
  async getCurrentDirectory() {
    try {
      const cwd = process.cwd();
      
      this.log('getCurrentDirectory', { cwd });

      return {
        success: true,
        cwd,
        path: cwd
      };
    } catch (error) {
      this.log('getCurrentDirectory', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Change working directory
   */
  async changeDirectory(dirPath) {
    try {
      const oldCwd = process.cwd();
      process.chdir(dirPath);
      const newCwd = process.cwd();

      this.log('changeDirectory', {
        from: oldCwd,
        to: newCwd
      });

      return {
        success: true,
        oldPath: oldCwd,
        newPath: newCwd,
        changed: true
      };
    } catch (error) {
      this.log('changeDirectory', {
        path: dirPath,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        path: dirPath,
        changed: false
      };
    }
  }

  /**
   * Configure security settings
   */
  configureSecurity(settings = {}) {
    if (settings.allowedCommands) {
      this.allowedCommands = [...settings.allowedCommands];
    }
    
    if (settings.blockedCommands) {
      this.blockedCommands = [...settings.blockedCommands];
    }
    
    if (settings.maxExecutionTime) {
      this.maxExecutionTime = settings.maxExecutionTime;
    }
    
    if (settings.maxOutputSize) {
      this.maxOutputSize = settings.maxOutputSize;
    }

    this.log('configureSecurity', settings);
  }

  /**
   * Get available methods
   */
  getMethods() {
    return [
      'executeCommand',
      'executeCommandStream',
      'installPackage',
      'runNpmScript',
      'getCurrentDirectory',
      'changeDirectory'
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
        executeCommand: 'Execute shell command and return result',
        executeCommandStream: 'Execute command with real-time output streaming',
        installPackage: 'Install npm package',
        runNpmScript: 'Run npm script from package.json',
        getCurrentDirectory: 'Get current working directory',
        changeDirectory: 'Change working directory'
      },
      security: {
        allowedCommands: this.allowedCommands,
        blockedCommands: this.blockedCommands,
        maxExecutionTime: this.maxExecutionTime,
        maxOutputSize: this.maxOutputSize
      }
    };
  }
}

module.exports = ExecTool;