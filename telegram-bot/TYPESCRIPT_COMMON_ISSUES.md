# TypeScript Common Issues & Solutions

This document captures common TypeScript errors encountered during DeFi pool integration and their solutions.

## 🔧 Interface & Type Issues

### 1. TestResult Interface Structure

**❌ Wrong:**
```typescript
testResults.push({
  step: 'Smart Wallet Setup',
  status: 'success', 
  message: `Smart Wallet deployed at ${address}`
});
```

**✅ Correct:**
```typescript
testResults.push({
  success: true,
  startTime: Date.now(),
  endTime: Date.now(),
  shares: '0',  // or actual shares
  txHash: txHash  // optional
});
```

**Interface Definition:** (from `src/utils/test-helpers.ts`)
```typescript
export interface TestResult {
  success: boolean;
  txHash?: string;
  shares?: string;
  error?: string;
  gasUsed?: string;
  startTime: number;
  endTime?: number;
}
```

### 2. Smart Wallet Return Type

**❌ Wrong:**
```typescript
const { smartAccount, smartWalletAddress } = await createTestSmartWallet(privateKey);
```

**✅ Correct:**
```typescript
const { smartAccount, address: smartWalletAddress } = await createTestSmartWallet(privateKey);
```

**Function Returns:** (from `src/utils/test-helpers.ts`)
```typescript
return {
  owner,
  smartAccount,
  address: smartAccount.address  // NOT smartWalletAddress
};
```

### 3. USDC Balance Object Structure

**❌ Wrong:**
```typescript
if (usdcBalance < minimumRequired) {
  // usdcBalance is an object, not a number
}
```

**✅ Correct:**
```typescript
if (parseFloat(usdcBalance.formatted) < minimumRequired) {
  // Access the formatted property
}
```

**Function Returns:** (from `checkUSDCBalance`)
```typescript
return {
  balance: bigint,      // Raw balance in wei
  formatted: string     // Human-readable format
};
```

### 4. Mock User Session Usage

**❌ Wrong:**
```typescript
const mockUserId = createMockUserSession();
await deployToSpark(mockUserId, amount, smartAccount);  // Type error
```

**✅ Correct:**
```typescript
const mockSession = createMockUserSession();
const mockUserId = mockSession.userId;
await deployToSpark(mockUserId, amount, smartAccount);  // String type ✓
```

**Function Returns:** (from `createMockUserSession`)
```typescript
return {
  userId: string,
  settings: {...},
  currentAction: undefined,
  tempData: {},
  zapMode: 'auto'
};
```

### 5. Export Conflicts

**❌ Wrong:**
```typescript
export async function getSparkBalance(address: Address) { ... }

// At the end of file:
export { getSparkBalance as getSparkBalance };  // Duplicate export error
export { getSparkAPY as getSparkAPY };          // Duplicate export error
```

**✅ Correct:**
```typescript
export async function getSparkBalance(address: Address) { ... }
export async function getSparkAPY(): Promise<number> { ... }

// No need for export aliases - functions are already exported
```

### 6. Missing Import Functions

**❌ Wrong:**
```typescript
import { verifyTransaction, safeErrorLog } from '../utils/test-helpers';
// These functions don't exist in test-helpers
```

**✅ Correct:**
```typescript
import { isValidTxHash } from '../utils/test-helpers';

// Replace verifyTransaction with:
if (!isValidTxHash(txHash)) {
  console.warn(`⚠️ Transaction hash format invalid: ${txHash}`);
} else {
  console.log(`✅ Transaction hash verified: ${txHash}`);
}

// Replace safeErrorLog with:
const errorMsg = error?.message || 'Unknown error';
```

## 🎯 Prevention Checklist

Before creating test scripts, verify:

- [ ] **Read the actual interfaces** from `src/utils/test-helpers.ts`
- [ ] **Check function return types** using TypeScript hover or definitions
- [ ] **Don't duplicate exports** in service files
- [ ] **Use correct property names** from return objects
- [ ] **Import only functions that exist** in test-helpers
- [ ] **Run `npm run build`** to catch TypeScript errors early

## 🛠️ Quick Fixes Reference

### Balance Calculations
```typescript
// For USDC balances (object type)
const usdcBalance = await checkUSDCBalance(address);
const usdcAmount = parseFloat(usdcBalance.formatted);

// For calculations between balances
const difference = parseFloat(finalBalance.formatted) - parseFloat(initialBalance.formatted);
```

### Test Results Pattern
```typescript
const startTime = Date.now();
// ... perform operation ...
testResults.push({
  success: operation.success,
  startTime,
  endTime: Date.now(),
  txHash: operation.txHash,
  shares: operation.shares || '0',
  error: operation.error
});
```

### Error Handling Pattern
```typescript
try {
  // ... test operations ...
} catch (error: any) {
  const errorMsg = error?.message || 'Unknown error';
  testResults.push({
    success: false,
    startTime: Date.now(),
    endTime: Date.now(),
    error: errorMsg
  });
  console.error('❌ Test failed:', errorMsg);
  process.exit(1);
}
```

## 📝 Template Validation

When copying from templates, **always replace these placeholders**:

- `[POOL_NAME]` → `Spark` (or actual pool name)
- `[pool-name]` → `spark` (lowercase)
- `deployTo[POOL_NAME]` → `deployToSpark`
- `withdrawFrom[POOL_NAME]` → `withdrawFromSpark`
- `get[POOL_NAME]Balance` → `getSparkBalance`

## ⚡ Quick Commands

```bash
# Check TypeScript compilation
npm run build

# Verify test script syntax
ts-node --noEmit src/scripts/test-spark-deposit.ts

# Run actual tests
npm run test:spark -- --help
npm run test:spark-withdraw -- --help
```

---

**🔑 Key Takeaway**: Always check the actual type definitions and function signatures in the codebase before using them. TypeScript errors are your friend - they prevent runtime issues!