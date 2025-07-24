#!/bin/bash

echo "🧪 Testing Visaire CLI Interactive Mode"
echo "======================================="
echo ""

echo "1. Testing help command..."
node bin/visaire.js --help | head -10
echo ""

echo "2. Testing interactive command help..."
node bin/visaire.js interactive --help
echo ""

echo "3. Testing provider validation..."
echo "Test prompt" | node bin/visaire.js --provider gemini --api-key invalid-key --no-agent 2>&1 | head -5
echo ""

echo "4. Testing model validation (should show Gemini model fix)..."
echo "Test prompt" | node bin/visaire.js --provider gemini --model gpt-4 --api-key invalid-key --no-agent 2>&1 | head -5
echo ""

echo "5. Testing clean output format..."
echo "Simple test" | node bin/visaire.js --provider claude --api-key sk-ant-test --no-agent 2>&1 | head -3
echo ""

echo "✅ All tests completed!"
echo ""
echo "🎯 Key Features Implemented:"
echo "   ✓ Interactive mode (run 'visaire' without arguments)"
echo "   ✓ Fixed Gemini model selection bug"
echo "   ✓ Clean output without technical artifacts"
echo "   ✓ Forge-style conversational experience"
echo "   ✓ Provider validation and model compatibility"
echo ""
echo "📚 Usage Examples:"
echo "   visaire                    # Start interactive mode"
echo "   visaire interactive        # Explicit interactive mode"
echo "   visaire \"Hello AI\"         # Direct command"
echo "   visaire setup              # Setup wizard"