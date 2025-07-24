const Utils = require('../lib/utils');
const Config = require('../lib/config');
const Providers = require('../lib/providers');

describe('Visaire CLI Tests', () => {
  describe('Utils', () => {
    test('should validate API keys correctly', () => {
      // Claude API key validation
      expect(Utils.validateApiKey('sk-ant-1234567890123456789012345', 'claude')).toBe(true);
      expect(Utils.validateApiKey('invalid-key', 'claude')).toBe(false);
      expect(Utils.validateApiKey('sk-1234567890', 'claude')).toBe(false);

      // GPT API key validation
      expect(Utils.validateApiKey('sk-1234567890123456789012345', 'gpt')).toBe(true);
      expect(Utils.validateApiKey('invalid-key', 'gpt')).toBe(false);
      expect(Utils.validateApiKey('sk-short', 'gpt')).toBe(false);

      // Gemini API key validation
      expect(Utils.validateApiKey('AIzaSyC1234567890123456789012345678', 'gemini')).toBe(true);
      expect(Utils.validateApiKey('short-key', 'gemini')).toBe(false);
      expect(Utils.validateApiKey('key with spaces', 'gemini')).toBe(false);
    });

    test('should sanitize sensitive information', () => {
      const text = 'Here is my API key: sk-1234567890 and some other text';
      const sanitized = Utils.sanitizeForLog(text);
      expect(sanitized).toContain('sk-***');
      expect(sanitized).not.toContain('sk-1234567890');
    });

    test('should format errors correctly', () => {
      const error = new Error('Test error');
      const formatted = Utils.formatError(error, 'Claude');
      expect(formatted).toBe('Test error');
    });
  });

  describe('Config', () => {
    test('should create config instance', () => {
      const config = new Config();
      expect(config).toBeDefined();
      expect(config.defaultConfig).toBeDefined();
    });

    test('should validate configuration', () => {
      const config = new Config();
      
      // Valid config should not throw
      expect(() => {
        config.validateConfig({
          defaultProvider: 'claude',
          timeout: 30000,
          maxRetries: 3,
          outputFormat: 'text'
        });
      }).not.toThrow();

      // Invalid provider should throw
      expect(() => {
        config.validateConfig({ defaultProvider: 'invalid' });
      }).toThrow();

      // Invalid timeout should throw
      expect(() => {
        config.validateConfig({ timeout: 500 });
      }).toThrow();
    });
  });

  describe('Providers', () => {
    test('should create providers instance', () => {
      const providers = new Providers();
      expect(providers).toBeDefined();
    });

    test('should get available models', () => {
      const providers = new Providers();
      
      const claudeModels = providers.getAvailableModels('claude');
      expect(claudeModels).toContain('claude-3-sonnet-20240229');

      const gptModels = providers.getAvailableModels('gpt');
      expect(gptModels).toContain('gpt-3.5-turbo');

      const geminiModels = providers.getAvailableModels('gemini');
      expect(geminiModels).toContain('gemini-1.5-pro');
    });

    test('should handle invalid provider', async () => {
      const providers = new Providers();
      
      await expect(
        providers.call('invalid', 'fake-key', 'test prompt')
      ).rejects.toThrow('Invalid API key format for invalid');
    });

    test('should validate inputs', async () => {
      const providers = new Providers();
      
      // Missing provider
      await expect(
        providers.call('', 'fake-key', 'test prompt')
      ).rejects.toThrow('Provider, API key, and prompt are required');

      // Missing API key
      await expect(
        providers.call('claude', '', 'test prompt')
      ).rejects.toThrow('Provider, API key, and prompt are required');

      // Missing prompt
      await expect(
        providers.call('claude', 'fake-key', '   ')
      ).rejects.toThrow('Invalid API key format for claude');
    });
  });
});