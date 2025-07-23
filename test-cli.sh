#!/bin/bash

echo "🧪 Testing Visaire CLI functionality..."
echo

# Test help command
echo "✅ Testing --help command:"
visaire --help | head -5
echo

# Test version command
echo "✅ Testing --version command:"
visaire --version
echo

# Test configuration commands
echo "✅ Testing configuration commands:"
visaire --config | head -3
echo

# Test stdin input (should fail gracefully without API key)
echo "✅ Testing stdin input (expected to fail without API key):"
echo "Test prompt" | visaire --provider claude 2>&1 | head -2
echo

# Test direct prompt (should fail gracefully without API key)
echo "✅ Testing direct prompt (expected to fail without API key):"
visaire --provider gpt "Test prompt" 2>&1 | head -2
echo

# Test invalid provider
echo "✅ Testing invalid provider (expected to fail):"
visaire --provider invalid --api-key test "prompt" 2>&1 | head -2
echo

# Test API key validation
echo "✅ Testing API key validation (expected to fail):"
visaire --provider claude --api-key "invalid-key" "test" 2>&1 | head -2
echo

echo "🎉 All basic functionality tests completed!"
echo "ℹ  For full testing, use real API keys with --test-key flag"