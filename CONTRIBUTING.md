# Contributing to Visaire CLI

Thank you for your interest in contributing to Visaire CLI! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/visaire/visaire-cli.git
   cd visaire-cli
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Link for local testing:**
   ```bash
   npm link
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

5. **Run linting:**
   ```bash
   npm run lint
   ```

## Project Structure

```
visaire-cli/
├── bin/
│   └── visaire.js          # CLI entry point
├── lib/
│   ├── config.js           # Configuration management
│   ├── providers.js        # LLM API integrations
│   └── utils.js            # Utility functions
├── test/
│   └── visaire.test.js     # Test suite
├── package.json            # Package configuration
├── README.md               # Documentation
└── LICENSE                 # MIT license
```

## Making Changes

### Adding New Features

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Add functionality to appropriate modules
   - Update tests as needed
   - Update documentation

3. **Test your changes:**
   ```bash
   npm test
   npm run lint
   ./test-cli.sh
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

### Adding New LLM Providers

To add a new LLM provider:

1. **Update `lib/providers.js`:**
   - Add new method (e.g., `callNewProvider`)
   - Add provider to the `call` method switch statement
   - Update `getAvailableModels` method

2. **Update `lib/utils.js`:**
   - Add API key validation for the new provider

3. **Update documentation:**
   - Add provider to README.md
   - Update help text and examples

4. **Add tests:**
   - Test API key validation
   - Test error handling
   - Test model availability

### Code Style

- Use consistent indentation (2 spaces)
- Follow existing naming conventions
- Add JSDoc comments for new functions
- Use meaningful variable and function names
- Handle errors gracefully with user-friendly messages

### Testing

- Write tests for new functionality
- Ensure all existing tests pass
- Test error conditions and edge cases
- Use descriptive test names

### Documentation

- Update README.md for new features
- Add inline code comments for complex logic
- Update help text and examples
- Include security considerations for new features

## Pull Request Process

1. **Ensure your code:**
   - Passes all tests (`npm test`)
   - Passes linting (`npm run lint`)
   - Includes appropriate documentation
   - Follows the existing code style

2. **Create a pull request:**
   - Use a clear, descriptive title
   - Include a detailed description of changes
   - Reference any related issues
   - Include testing instructions

3. **Review process:**
   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, your PR will be merged

## Reporting Issues

When reporting issues:

1. **Check existing issues** to avoid duplicates
2. **Use the issue template** if available
3. **Include:**
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node.js version)
   - Error messages or logs

## Security

- **Never commit API keys** or sensitive information
- **Report security vulnerabilities** privately
- **Follow security best practices** in code
- **Document security considerations** for new features

## Release Process

Releases are handled by maintainers:

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag
4. Publish to npm
5. Create GitHub release

## Questions?

- **Documentation:** Check README.md first
- **Issues:** Create a GitHub issue
- **Discussions:** Use GitHub Discussions for questions
- **Security:** Email security issues privately

Thank you for contributing to Visaire CLI!