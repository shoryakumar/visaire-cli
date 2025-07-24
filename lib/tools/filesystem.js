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
      'stats',
      'createContent'
    ];
  }

  /**
   * Create content dynamically based on request
   */
  async createContent(description, content = null) {
    try {
      // Parse the description to understand what to create
      const analysis = this.analyzeContentRequest(description);
      
      if (analysis.type === 'file') {
        return await this.createFileContent(analysis, content);
      } else if (analysis.type === 'directory') {
        return await this.createDirectoryStructure(analysis, content);
      } else if (analysis.type === 'project') {
        return await this.createProjectStructure(analysis, content);
      } else {
        // Default to file creation
        return await this.createFileContent(analysis, content);
      }
    } catch (error) {
      this.log('createContent', {
        description,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        description
      };
    }
  }

  /**
   * Analyze content request to determine what to create
   */
  analyzeContentRequest(description) {
    const desc = description.toLowerCase();
    
    // Determine file type and name
    let fileName = '';
    let fileType = '';
    let projectType = '';
    let contentType = 'file';
    
    // Extract file extensions
    const extensionMatch = description.match(/\.(\w+)$/);
    if (extensionMatch) {
      fileType = extensionMatch[1];
      fileName = description;
    }
    
    // Detect project types
    if (desc.includes('app') || desc.includes('application') || desc.includes('project')) {
      contentType = 'project';
      
      if (desc.includes('react')) projectType = 'react';
      else if (desc.includes('vue')) projectType = 'vue';
      else if (desc.includes('angular')) projectType = 'angular';
      else if (desc.includes('node') || desc.includes('express')) projectType = 'node';
      else if (desc.includes('python') || desc.includes('flask') || desc.includes('django')) projectType = 'python';
      else if (desc.includes('website') || desc.includes('html')) projectType = 'website';
      else projectType = 'generic';
    }
    
    // Detect file types
    else if (desc.includes('component') && !fileName) {
      fileName = this.extractName(description) + '.jsx';
      fileType = 'jsx';
    }
    else if (desc.includes('config') && !fileName) {
      if (desc.includes('package')) fileName = 'package.json';
      else if (desc.includes('webpack')) fileName = 'webpack.config.js';
      else if (desc.includes('babel')) fileName = '.babelrc';
      else if (desc.includes('eslint')) fileName = '.eslintrc.json';
      else fileName = 'config.json';
      fileType = fileName.split('.').pop();
    }
    else if (desc.includes('readme') && !fileName) {
      fileName = 'README.md';
      fileType = 'md';
    }
    else if (desc.includes('script') && !fileName) {
      fileName = this.extractName(description) + '.js';
      fileType = 'js';
    }
    else if (desc.includes('style') && !fileName) {
      fileName = 'styles.css';
      fileType = 'css';
    }
    else if (desc.includes('test') && !fileName) {
      fileName = this.extractName(description) + '.test.js';
      fileType = 'js';
    }
    
    // Detect directory creation
    else if (desc.includes('folder') || desc.includes('directory')) {
      contentType = 'directory';
      fileName = this.extractName(description);
    }
    
    // Default file name if none detected
    if (!fileName && contentType === 'file') {
      fileName = this.extractName(description) || 'file.txt';
      fileType = fileName.split('.').pop() || 'txt';
    }
    
    return {
      type: contentType,
      fileName,
      fileType,
      projectType,
      description,
      name: this.extractName(description)
    };
  }

  /**
   * Extract name from description
   */
  extractName(description) {
    // Remove common words and extract the main subject
    const words = description.toLowerCase()
      .replace(/^(create|make|build|generate|add|setup|a|an|the)\s+/g, '')
      .replace(/\s+(app|application|project|file|component|script|config|folder|directory).*$/g, '')
      .trim();
    
    return words.replace(/\s+/g, '-') || 'untitled';
  }

  /**
   * Create file content based on analysis
   */
  async createFileContent(analysis, providedContent) {
    const { fileName, fileType, description } = analysis;
    
    let content = providedContent;
    
    if (!content) {
      // Generate appropriate content based on file type
      content = this.generateFileContent(fileType, analysis);
    }
    
    const result = await this.writeFile(fileName, content);
    
    if (result.success) {
      this.log('createContent', {
        type: 'file',
        fileName,
        fileType,
        description
      });
      
      return {
        success: true,
        type: 'file',
        fileName,
        fileType,
        path: result.path,
        message: `Created ${fileName} successfully`
      };
    }
    
    return result;
  }

  /**
   * Create directory structure
   */
  async createDirectoryStructure(analysis, content) {
    const { fileName: dirName } = analysis;
    
    const result = await this.mkdir(dirName);
    
    if (result.success) {
      this.log('createContent', {
        type: 'directory',
        dirName,
        description: analysis.description
      });
      
      return {
        success: true,
        type: 'directory',
        dirName,
        path: result.path,
        message: `Created directory ${dirName} successfully`
      };
    }
    
    return result;
  }

  /**
   * Create project structure
   */
  async createProjectStructure(analysis, content) {
    const { projectType, name } = analysis;
    const projectName = name || 'my-project';
    
    // Create project directory
    await this.mkdir(projectName);
    
    const files = this.generateProjectFiles(projectType, projectName);
    const createdFiles = [];
    
    for (const file of files) {
      const filePath = path.join(projectName, file.name);
      const result = await this.writeFile(filePath, file.content);
      if (result.success) {
        createdFiles.push(file.name);
      }
    }
    
    this.log('createContent', {
      type: 'project',
      projectType,
      projectName,
      filesCreated: createdFiles.length
    });
    
    return {
      success: true,
      type: 'project',
      projectType,
      projectName,
      filesCreated: createdFiles,
      path: path.resolve(projectName),
      message: `Created ${projectType} project '${projectName}' with ${createdFiles.length} files`
    };
  }

  /**
   * Generate appropriate file content based on type
   */
  generateFileContent(fileType, analysis) {
    const { name, description } = analysis;
    
    switch (fileType) {
      case 'js':
        return `// ${name || 'JavaScript file'}
// ${description}

console.log('Hello from ${name || 'JavaScript'}!');

// Add your code here
`;
      
      case 'jsx': {
        const componentName = (name || 'Component').replace(/-/g, '').replace(/^\w/, c => c.toUpperCase());
        return `import React from 'react';

const ${componentName} = () => {
  return (
    <div className="${name || 'component'}">
      <h1>${componentName}</h1>
      <p>This is a React component.</p>
    </div>
  );
};

export default ${componentName};
`;
      }
      
      case 'css':
        return `/* ${name || 'Styles'} */
/* ${description} */

.${name || 'container'} {
  padding: 20px;
  margin: 0 auto;
  max-width: 1200px;
}

/* Add your styles here */
`;
      
      case 'html':
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name || 'My Page'}</title>
</head>
<body>
    <h1>${name || 'Welcome'}</h1>
    <p>${description}</p>
    
    <!-- Add your content here -->
</body>
</html>
`;
      
      case 'md':
        return `# ${name || 'Project'}

${description}

## Description

Add your project description here.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

Add usage instructions here.

## Contributing

Pull requests are welcome!
`;
      
      case 'json':
        if (name && name.includes('package')) {
          return JSON.stringify({
            "name": analysis.name || "my-project",
            "version": "1.0.0",
            "description": description,
            "main": "index.js",
            "scripts": {
              "start": "node index.js",
              "test": "echo \"Error: no test specified\" && exit 1"
            },
            "keywords": [],
            "author": "",
            "license": "MIT"
          }, null, 2);
        }
        return JSON.stringify({
          "name": name || "config",
          "description": description
        }, null, 2);
      
      case 'py':
        return `#!/usr/bin/env python3
"""
${name || 'Python script'}
${description}
"""

def main():
    print("Hello from ${name || 'Python'}!")
    # Add your code here
    pass

if __name__ == "__main__":
    main()
`;
      
      default:
        return `${name || 'File'}
${description}

Add your content here.
`;
    }
  }

  /**
   * Generate project files based on type
   */
  generateProjectFiles(projectType, projectName) {
    switch (projectType) {
      case 'react':
        return [
          {
            name: 'package.json',
            content: JSON.stringify({
              "name": projectName,
              "version": "0.1.0",
              "private": true,
              "dependencies": {
                "react": "^18.2.0",
                "react-dom": "^18.2.0",
                "react-scripts": "5.0.1"
              },
              "scripts": {
                "start": "react-scripts start",
                "build": "react-scripts build",
                "test": "react-scripts test",
                "eject": "react-scripts eject"
              }
            }, null, 2)
          },
          {
            name: 'public/index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
</body>
</html>`
          },
          {
            name: 'src/App.js',
            content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${projectName}</h1>
        <p>Edit src/App.js and save to reload.</p>
      </header>
    </div>
  );
}

export default App;`
          },
          {
            name: 'src/App.css',
            content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.App-header h1 {
  margin-bottom: 20px;
}`
          },
          {
            name: 'src/index.js',
            content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
          },
          {
            name: 'src/index.css',
            content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}`
          },
          {
            name: 'README.md',
            content: `# ${projectName}

A React application.

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.
`
          }
        ];
      
      case 'node':
        return [
          {
            name: 'package.json',
            content: JSON.stringify({
              "name": projectName,
              "version": "1.0.0",
              "description": "A Node.js application",
              "main": "index.js",
              "scripts": {
                "start": "node index.js",
                "dev": "nodemon index.js",
                "test": "echo \"Error: no test specified\" && exit 1"
              },
              "dependencies": {
                "express": "^4.18.0"
              },
              "devDependencies": {
                "nodemon": "^2.0.0"
              },
              "keywords": [],
              "author": "",
              "license": "MIT"
            }, null, 2)
          },
          {
            name: 'index.js',
            content: `const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ${projectName}!' });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});`
          },
          {
            name: 'README.md',
            content: `# ${projectName}

A Node.js application with Express.

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`
`
          }
        ];
      
      case 'website':
        return [
          {
            name: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to ${projectName}</h1>
    </header>
    
    <main>
        <section>
            <h2>About</h2>
            <p>This is a simple website template.</p>
        </section>
    </main>
    
    <footer>
        <p>&copy; 2023 ${projectName}. All rights reserved.</p>
    </footer>
    
    <script src="script.js"></script>
</body>
</html>`
          },
          {
            name: 'styles.css',
            content: `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
}

header {
    background: #333;
    color: white;
    text-align: center;
    padding: 1rem;
}

main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}

section {
    margin-bottom: 2rem;
}

footer {
    background: #333;
    color: white;
    text-align: center;
    padding: 1rem;
    position: fixed;
    bottom: 0;
    width: 100%;
}`
          },
          {
            name: 'script.js',
            content: `// ${projectName} JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('${projectName} loaded successfully!');
    
    // Add your JavaScript code here
});`
          }
        ];
      
      default:
        return [
          {
            name: 'README.md',
            content: `# ${projectName}

A new project.

## Getting Started

Add your project setup instructions here.
`
          },
          {
            name: 'main.js',
            content: `// ${projectName}
console.log('Hello from ${projectName}!');

// Add your code here
`
          }
        ];
    }
  }

  /**
   * Get tool description
   */
  getDescription() {
    return {
      name: this.name,
      description: this.description,
      methods: {
        readFile: 'Read file contents',
        writeFile: 'Write content to file',
        appendFile: 'Append content to file',
        mkdir: 'Create directory',
        remove: 'Remove file or directory',
        listDir: 'List directory contents',
        copy: 'Copy file or directory',
        move: 'Move file or directory',
        exists: 'Check if path exists',
        stats: 'Get file/directory stats',
        createContent: 'Create content dynamically based on request'
      }
    };
  }
}

module.exports = FilesystemTool;