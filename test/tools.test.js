const FilesystemTool = require('../lib/tools/filesystem');
const ExecTool = require('../lib/tools/exec');
const ToolRegistry = require('../lib/tools');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('FilesystemTool', () => {
  let filesystemTool;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'visaire-fs-test-' + Date.now());
    await fs.ensureDir(testDir);
    
    filesystemTool = new FilesystemTool();
  });

  afterEach(async () => {
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('File Operations', () => {
    test('should write and read files', async () => {
      const testFile = path.join(testDir, 'test.txt');
      const content = 'Hello, World!';
      
      // Write file
      const writeResult = await filesystemTool.writeFile(testFile, content);
      expect(writeResult.success).toBe(true);
      expect(writeResult.path).toBe(path.resolve(testFile));
      
      // Read file
      const readResult = await filesystemTool.readFile(testFile);
      expect(readResult.success).toBe(true);
      expect(readResult.content).toBe(content);
    });

    test('should append to files', async () => {
      const testFile = path.join(testDir, 'append-test.txt');
      const initialContent = 'Line 1\n';
      const appendContent = 'Line 2\n';
      
      await filesystemTool.writeFile(testFile, initialContent);
      const appendResult = await filesystemTool.appendFile(testFile, appendContent);
      
      expect(appendResult.success).toBe(true);
      
      const readResult = await filesystemTool.readFile(testFile);
      expect(readResult.content).toBe(initialContent + appendContent);
    });

    test('should handle file not found errors', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      const result = await filesystemTool.readFile(nonExistentFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('should prevent overwriting when disabled', async () => {
      const testFile = path.join(testDir, 'overwrite-test.txt');
      
      await filesystemTool.writeFile(testFile, 'original content');
      const result = await filesystemTool.writeFile(testFile, 'new content', { overwrite: false });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('Directory Operations', () => {
    test('should create directories', async () => {
      const testSubDir = path.join(testDir, 'subdir', 'nested');
      
      const result = await filesystemTool.mkdir(testSubDir);
      
      expect(result.success).toBe(true);
      expect(await fs.pathExists(testSubDir)).toBe(true);
    });

    test('should list directory contents', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.ensureDir(path.join(testDir, 'subdir'));
      
      const result = await filesystemTool.listDir(testDir);
      
      expect(result.success).toBe(true);
      expect(result.files).toContain('file1.txt');
      expect(result.files).toContain('file2.txt');
      expect(result.files).toContain('subdir');
      expect(result.count).toBe(3);
    });

    test('should list directory contents with details', async () => {
      await fs.writeFile(path.join(testDir, 'detailed-test.txt'), 'content');
      
      const result = await filesystemTool.listDir(testDir, { detailed: true });
      
      expect(result.success).toBe(true);
      expect(result.files[0]).toHaveProperty('name');
      expect(result.files[0]).toHaveProperty('size');
      expect(result.files[0]).toHaveProperty('isFile');
      expect(result.files[0]).toHaveProperty('isDirectory');
    });
  });

  describe('File System Utilities', () => {
    test('should check if paths exist', async () => {
      const testFile = path.join(testDir, 'exists-test.txt');
      
      // Check non-existent file
      let result = await filesystemTool.exists(testFile);
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      
      // Create file and check again
      await fs.writeFile(testFile, 'content');
      result = await filesystemTool.exists(testFile);
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
    });

    test('should get file stats', async () => {
      const testFile = path.join(testDir, 'stats-test.txt');
      const content = 'test content';
      
      await fs.writeFile(testFile, content);
      
      const result = await filesystemTool.stats(testFile);
      
      expect(result.success).toBe(true);
      expect(result.size).toBe(content.length);
      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
    });

    test('should copy files', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      const destFile = path.join(testDir, 'destination.txt');
      const content = 'copy test content';
      
      await fs.writeFile(sourceFile, content);
      
      const result = await filesystemTool.copy(sourceFile, destFile);
      
      expect(result.success).toBe(true);
      expect(await fs.pathExists(destFile)).toBe(true);
      
      const copiedContent = await fs.readFile(destFile, 'utf8');
      expect(copiedContent).toBe(content);
    });

    test('should move files', async () => {
      const sourceFile = path.join(testDir, 'move-source.txt');
      const destFile = path.join(testDir, 'move-dest.txt');
      const content = 'move test content';
      
      await fs.writeFile(sourceFile, content);
      
      const result = await filesystemTool.move(sourceFile, destFile);
      
      expect(result.success).toBe(true);
      expect(await fs.pathExists(sourceFile)).toBe(false);
      expect(await fs.pathExists(destFile)).toBe(true);
      
      const movedContent = await fs.readFile(destFile, 'utf8');
      expect(movedContent).toBe(content);
    });

    test('should remove files and directories', async () => {
      const testFile = path.join(testDir, 'remove-test.txt');
      
      await fs.writeFile(testFile, 'content');
      expect(await fs.pathExists(testFile)).toBe(true);
      
      const result = await filesystemTool.remove(testFile);
      
      expect(result.success).toBe(true);
      expect(await fs.pathExists(testFile)).toBe(false);
    });
  });

  describe('Tool Interface', () => {
    test('should return available methods', () => {
      const methods = filesystemTool.getMethods();
      
      expect(methods).toContain('readFile');
      expect(methods).toContain('writeFile');
      expect(methods).toContain('mkdir');
      expect(methods).toContain('remove');
    });

    test('should return tool description', () => {
      const description = filesystemTool.getDescription();
      
      expect(description.name).toBe('filesystem');
      expect(description.description).toBeDefined();
      expect(description.methods).toHaveProperty('readFile');
      expect(description.methods).toHaveProperty('writeFile');
    });
  });
});

describe('ExecTool', () => {
  let execTool;

  beforeEach(() => {
    execTool = new ExecTool();
  });

  describe('Command Safety', () => {
    test('should allow safe commands', () => {
      const safeCommands = [
        'npm --version',
        'node --version',
        'ls -la',
        'pwd',
        'echo "hello"'
      ];
      
      safeCommands.forEach(command => {
        const result = execTool.isCommandSafe(command);
        expect(result.safe).toBe(true);
      });
    });

    test('should block dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm file',
        'chmod 777 file',
        'eval "dangerous code"'
      ];
      
      dangerousCommands.forEach(command => {
        const result = execTool.isCommandSafe(command);
        expect(result.safe).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });
  });

  describe('Command Execution', () => {
    test('should execute safe commands', async () => {
      const result = await execTool.executeCommand('echo "test output"');
      
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('test output');
      expect(result.exitCode).toBe(0);
    });

    test('should handle command failures', async () => {
      const result = await execTool.executeCommand('nonexistentcommand');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });

    test('should reject unsafe commands', async () => {
      const result = await execTool.executeCommand('rm -rf /');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Security violation');
    });
  });

  describe('NPM Operations', () => {
    test('should format npm install commands correctly', async () => {
      // Mock the executeCommand to avoid actual npm operations
      const originalExecute = execTool.executeCommand;
      execTool.executeCommand = jest.fn().mockResolvedValue({
        success: true,
        stdout: 'mocked npm output',
        stderr: '',
        exitCode: 0
      });
      
      const result = await execTool.installPackage('express');
      
      expect(execTool.executeCommand).toHaveBeenCalledWith('npm install --save express', expect.any(Object));
      expect(result.package).toBe('express');
      
      // Restore original method
      execTool.executeCommand = originalExecute;
    });

    test('should handle dev dependencies', async () => {
      const originalExecute = execTool.executeCommand;
      execTool.executeCommand = jest.fn().mockResolvedValue({
        success: true,
        stdout: 'mocked npm output',
        stderr: '',
        exitCode: 0
      });
      
      await execTool.installPackage('jest', { dev: true });
      
      expect(execTool.executeCommand).toHaveBeenCalledWith('npm install --save-dev jest', expect.any(Object));
      
      execTool.executeCommand = originalExecute;
    });
  });

  describe('Directory Operations', () => {
    test('should get current directory', async () => {
      const result = await execTool.getCurrentDirectory();
      
      expect(result.success).toBe(true);
      expect(result.cwd).toBeDefined();
      expect(typeof result.cwd).toBe('string');
    });
  });

  describe('Security Configuration', () => {
    test('should configure security settings', () => {
      const newSettings = {
        allowedCommands: ['git', 'npm'],
        blockedCommands: ['rm', 'sudo'],
        maxExecutionTime: 60000
      };
      
      execTool.configureSecurity(newSettings);
      
      const description = execTool.getDescription();
      expect(description.security.allowedCommands).toEqual(newSettings.allowedCommands);
      expect(description.security.blockedCommands).toEqual(newSettings.blockedCommands);
      expect(description.security.maxExecutionTime).toBe(newSettings.maxExecutionTime);
    });
  });

  describe('Tool Interface', () => {
    test('should return available methods', () => {
      const methods = execTool.getMethods();
      
      expect(methods).toContain('executeCommand');
      expect(methods).toContain('installPackage');
      expect(methods).toContain('runNpmScript');
      expect(methods).toContain('getCurrentDirectory');
    });

    test('should return tool description', () => {
      const description = execTool.getDescription();
      
      expect(description.name).toBe('exec');
      expect(description.description).toBeDefined();
      expect(description.methods).toHaveProperty('executeCommand');
      expect(description.security).toBeDefined();
    });
  });
});

describe('ToolRegistry Integration', () => {
  let toolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  test('should execute tool operations through registry', async () => {
    const result = await toolRegistry.executeTool('filesystem', 'exists', [__filename]);
    
    expect(result.success).toBe(true);
    expect(result.tool).toBe('filesystem');
    expect(result.method).toBe('exists');
    expect(result.result.exists).toBe(true);
  });

  test('should execute multiple operations in sequence', async () => {
    const operations = [
      { tool: 'exec', method: 'getCurrentDirectory', args: [] },
      { tool: 'filesystem', method: 'exists', args: [__filename] }
    ];
    
    const result = await toolRegistry.executeSequence(operations);
    
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.completed).toBe(2);
  });

  test('should validate operations before execution', () => {
    const validation = toolRegistry.validateOperation('exec', 'executeCommand', ['rm -rf /']);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('should get usage statistics', () => {
    const stats = toolRegistry.getUsageStats();
    
    expect(stats.totalTools).toBeGreaterThan(0);
    expect(stats.tools).toHaveProperty('filesystem');
    expect(stats.tools).toHaveProperty('exec');
  });
});