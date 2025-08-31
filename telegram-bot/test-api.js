// Quick test script to verify DeFiLlama API integration
const { fetchRealTimeYields, testDeFiLlamaAPI } = require('./src/lib/defillama-api');

console.log('Testing DeFiLlama API integration...\n');

testDeFiLlamaAPI()
  .then(() => {
    console.log('\n✅ API test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ API test failed:', error);
    process.exit(1);
  });