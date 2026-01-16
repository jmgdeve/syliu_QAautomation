# Sylius QA Automation

Automated API testing framework for [Sylius](https://sylius.com/) e-commerce platform using Playwright.

![CI Status](https://github.com/jmgdeve/syliu_QAautomation/actions/workflows/playwright.yml/badge.svg)

## Overview

This project demonstrates professional QA automation practices including:
- **API Testing** with Playwright
- **SOLID Principles** in test architecture
- **CI/CD Pipeline** with GitHub Actions
- **Docker-based** test environment

---

## Architecture

### Project Structure

```
syliu_QAautomation/
├── .github/
│   └── workflows/
│       └── playwright.yml      # CI/CD pipeline definition
├── lib/
│   ├── api/
│   │   ├── BaseApiClient.ts    # Abstract base class (DRY principle)
│   │   ├── AdminClient.ts      # Admin API operations
│   │   └── ShopClient.ts       # Shop/Customer API operations
│   └── data/
│       └── testData.ts         # Centralized test data (Single Source of Truth)
├── tests/
│   ├── admin_catalog/
│   │   └── product-inventory.spec.ts
│   ├── critical/
│   │   ├── price-integrity.spec.ts
│   │   ├── security-authorization.spec.ts
│   │   └── stock-validation.spec.ts
│   ├── shop_user_test/
│   │   ├── check-out.spec.ts
│   │   └── shop-cart.spec.ts
│   └── users_crud/
│       ├── admin-customer.spec.ts
│       ├── admin-smoke.spec.ts
│       └── e2e-login.spec.ts
├── playwright.config.ts
└── package.json
```

### SOLID Principles Applied

#### Single Responsibility Principle (SRP)
Each class has one reason to change:
- `AdminClient` → Admin API authentication and requests
- `ShopClient` → Shop/Customer API authentication and requests
- `testData.ts` → Test data management only

#### Open/Closed Principle (OCP)
```typescript
// BaseApiClient is OPEN for extension, CLOSED for modification
abstract class BaseApiClient {
    abstract login(...args: any[]): Promise<void>;
    // Common HTTP methods defined once
}

// Extend without modifying base class
class AdminClient extends BaseApiClient { }
class ShopClient extends BaseApiClient { }
```

#### Dependency Inversion Principle (DIP)
```typescript
// Tests depend on abstractions (BaseApiClient), not concretions
// Easy to swap implementations or mock for unit testing
```

### API Client Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BaseApiClient (Abstract)                    │
├─────────────────────────────────────────────────────────────────┤
│  - request: APIRequestContext                                   │
│  - token: string | null                                         │
│  + get(endpoint): Promise<APIResponse>                          │
│  + post(endpoint, data): Promise<APIResponse>                   │
│  + put(endpoint, data): Promise<APIResponse>                    │
│  + patch(endpoint, data): Promise<APIResponse>                  │
│  + delete(endpoint): Promise<APIResponse>                       │
│  + abstract login(): Promise<void>                              │
└─────────────────────────────────────────────────────────────────┘
                    ▲                       ▲
                    │                       │
        ┌───────────┴───────┐     ┌────────┴────────┐
        │    AdminClient    │     │    ShopClient   │
        ├───────────────────┤     ├─────────────────┤
        │ + login()         │     │ + login_token() │
        │   (admin token)   │     │   (customer)    │
        └───────────────────┘     └─────────────────┘
```

---

## Test Data Management

### Centralized Test Data (`lib/data/testData.ts`)

```typescript
// Credentials
export const adminCredentials = {
    email: 'sylius@example.com',
    password: 'sylius',
    tokenEndpoint: '/api/v2/admin/administrators/token'
};

// Templates
export const users = { checkout: {...}, cart: {...}, basic: {...} };
export const addresses = { us: {...} };

// Helpers (generate unique data for each test run)
export function generateEmail(prefix: string): string;
export function generateProductCode(prefix: string): string;
export function generateSlug(name: string): string;
export function createCustomerData(email, template, password);
export function createAddressPayload(addressKey);
export function createProductData(code, name, channelCode);
export function createVariantData(productCode, variantCode, price, stock, channelCode);
```

### Why Centralized Data?

| Benefit | Explanation |
|---------|-------------|
| **Single Source of Truth** | Change credentials in one place |
| **Reusability** | Same templates across all tests |
| **Maintainability** | Add new data without modifying tests |
| **CI/CD Compatibility** | Same data works locally and in CI |

---

## CI/CD Pipeline

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GITHUB ACTIONS WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   TRIGGERS                                                                  │
│   ├── push to main         → Automatic                                     │
│   ├── pull_request         → Blocks merge if tests fail                    │
│   └── workflow_dispatch    → Manual trigger (GitHub UI button)             │
│                                                                             │
│   RUNNER: ubuntu-latest                                                     │
│   TIMEOUT: 30 minutes                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Phases

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: SETUP                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                             │
│  │ Checkout tests  │    │ Clone Sylius    │                             │
│  │ (this repo)     │    │ Standard        │                             │
│  └─────────────────┘    └─────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: DOCKER SERVICES                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    ┌─────────────────────────────────────────────────────────┐          │
│    │              Docker Compose Network                      │          │
│    │  ┌─────────┐    ┌─────────┐    ┌─────────┐             │          │
│    │  │  nginx  │◄───│   php   │◄───│  mysql  │             │          │
│    │  │  :80    │    │  :9000  │    │  :3306  │             │          │
│    │  └─────────┘    └─────────┘    └─────────┘             │          │
│    └─────────────────────────────────────────────────────────┘          │
│                                                                          │
│    Health Check: Wait for MySQL to accept connections                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: APPLICATION SETUP                                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  composer install          → PHP dependencies                            │
│  doctrine:migrations       → Database schema                             │
│  sylius:fixtures:load      → Test data (products, users, etc.)          │
│  jwt:generate-keypair      → API authentication keys                     │
│  grant ROLE_API_ACCESS     → Admin can use API                          │
│  cache:clear               → Symfony optimization                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: VERIFY                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  curl http://localhost → Wait for HTTP 200/302                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: TEST EXECUTION                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  npm ci                    → Install test dependencies                   │
│  playwright install        → Download browser engines                    │
│  playwright test           → RUN ALL TESTS                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: ARTIFACTS & CLEANUP                                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Upload playwright-report/  → Downloadable from GitHub Actions           │
│  docker compose down        → Stop and remove containers                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key CI/CD Concepts

| Concept | Implementation | Purpose |
|---------|----------------|---------|
| **Triggers** | `on: push, pull_request, workflow_dispatch` | When pipeline runs |
| **Runner** | `ubuntu-latest` | Where pipeline runs |
| **Health Checks** | `mysqladmin ping`, `curl localhost` | Wait for services |
| **Artifacts** | `upload-artifact@v4` | Save test reports |
| **Cleanup** | `if: always()` | Run even on failure |
| **Timeout** | `timeout-minutes: 30` | Prevent hung jobs |

---

## Running Tests

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Sylius Standard running locally (or use CI)

### Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run all tests (Sylius must be running on localhost:80)
npx playwright test

# Run specific test file
npx playwright test tests/users_crud/admin-smoke.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run with debug mode
npx playwright test --debug
```

### Environment Configuration

Tests expect Sylius at `http://localhost`. Configure in `playwright.config.ts`:

```typescript
export default defineConfig({
  use: {
    baseURL: 'http://localhost',
  },
});
```

---

## Test Suites

### 🔴 Critical Tests (`tests/critical/`)

**These tests verify business-critical functionality that, if broken, causes immediate business impact.**

| Test | Description | Business Impact |
|------|-------------|-----------------|
| `stock-validation.spec.ts` | Prevent overselling | Angry customers, refunds |
| `price-integrity.spec.ts` | Verify price calculations | Financial loss |
| `security-authorization.spec.ts` | Protect customer data | Data breaches, legal issues |

### Admin API Tests (`tests/admin_catalog/`, `tests/users_crud/`)

| Test | Description |
|------|-------------|
| `admin-smoke.spec.ts` | Verify API connectivity and channels |
| `admin-customer.spec.ts` | CRUD operations on customers |
| `product-inventory.spec.ts` | Create products, manage stock, fulfill orders |
| `e2e-login.spec.ts` | Admin creates user → user logs in |

### Shop API Tests (`tests/shop_user_test/`)

| Test | Description |
|------|-------------|
| `shop-cart.spec.ts` | Cart operations (add, update, remove items) |
| `check-out.spec.ts` | Full checkout flow (address, shipping, payment) |

---

## Critical Test Coverage

### Stock Validation (`stock-validation.spec.ts`)
```
┌────────────────────────────────────────────────────────────────────────┐
│  OVERSELLING PREVENTION                                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ✓ Cannot add more items than available stock                         │
│  ✓ Stock is decremented after successful order                        │
│  ✓ Tracked variants show correct available quantity                   │
│                                                                        │
│  WHY CRITICAL: Selling items you don't have = refunds + angry users   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Price Integrity (`price-integrity.spec.ts`)
```
┌────────────────────────────────────────────────────────────────────────┐
│  FINANCIAL ACCURACY                                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ✓ Item subtotal = unit price × quantity                              │
│  ✓ Order total = items + shipping + tax                               │
│  ✓ Currency is correctly displayed                                    │
│  ✓ Zero/negative quantities rejected                                  │
│                                                                        │
│  WHY CRITICAL: Wrong prices = financial loss or legal issues          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Security (`security-authorization.spec.ts`)
```
┌────────────────────────────────────────────────────────────────────────┐
│  DATA PROTECTION                                                       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ✓ User cannot access another user's cart                             │
│  ✓ Shop users blocked from admin endpoints                            │
│  ✓ Anonymous users blocked from authenticated endpoints               │
│  ✓ Invalid JWT tokens rejected                                        │
│  ✓ SQL injection attempts handled safely                              │
│  ✓ Users can only modify their own resources                          │
│                                                                        │
│  WHY CRITICAL: Data breaches = legal liability + reputation damage    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Debugging

### View Test Report

```bash
npx playwright show-report
```

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid/expired token | Check credentials in `testData.ts` |
| `403 Forbidden` | Missing role | Admin needs `ROLE_API_ACCESS` |
| `404 Not Found` | Wrong endpoint | Check Sylius API documentation |
| `500 Server Error` | App misconfiguration | Check Sylius logs, JWT keys |

### Debug Mode

```bash
# Run with Playwright inspector
PWDEBUG=1 npx playwright test

# Run with verbose logging
DEBUG=pw:api npx playwright test
```

---

## Contributing

1. Create feature branch from `main`
2. Write tests following existing patterns
3. Ensure all tests pass locally
4. Open PR → CI will run automatically
5. Merge after CI passes and review approved

---

## License

MIT

---

## References

- [Sylius Documentation](https://docs.sylius.com/)
- [Sylius API Reference](https://master.demo.sylius.com/api/v2/docs)
- [Playwright Documentation](https://playwright.dev/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
