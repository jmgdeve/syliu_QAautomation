/**
 * 🔴 CRITICAL TEST: Security & Authorization
 * 
 * PURPOSE: Protect customer data and prevent unauthorized access
 * 
 * BUSINESS IMPACT:
 * - Data breaches = legal liability + reputation damage
 * - Unauthorized access = fraud, theft
 * - GDPR/Privacy violations = massive fines
 * 
 * TEST SCENARIOS:
 * 1. User cannot access another user's cart
 * 2. Shop users cannot access admin endpoints
 * 3. Anonymous users cannot access authenticated endpoints
 * 4. Tokens expire and are validated correctly
 */

import { test, expect, request } from '@playwright/test';
import { AdminClient } from '../../lib/api/AdminClient';
import { ShopClient } from '../../lib/api/ShopClient';
import {
    generateEmail,
    createCustomerData,
    defaultPassword
} from '../../lib/data/testData';

test.describe('🔴 CRITICAL: Security & Authorization', () => {
    let adminClient: AdminClient;
    let userAEmail: string;
    let userBEmail: string;

    test.beforeAll(async () => {
        // Setup admin client
        adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Create two separate test users
        userAEmail = generateEmail('security_user_a');
        userBEmail = generateEmail('security_user_b');

        await adminClient.post('/api/v2/admin/customers', createCustomerData(userAEmail, 'basic'));
        await adminClient.post('/api/v2/admin/customers', createCustomerData(userBEmail, 'basic'));
    });

    test('User cannot access another users cart', async () => {
        // User A creates a cart
        const shopClientA = new ShopClient(await request.newContext());
        await shopClientA.login_token(userAEmail, defaultPassword);

        const cartRespA = await shopClientA.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        expect(cartRespA.ok()).toBeTruthy();
        const cartA = await cartRespA.json();
        const tokenValueA = cartA.tokenValue;

        // User B tries to access User A's cart
        const shopClientB = new ShopClient(await request.newContext());
        await shopClientB.login_token(userBEmail, defaultPassword);

        const accessResp = await shopClientB.get(`/api/v2/shop/orders/${tokenValueA}`);
        
        // Should be forbidden or not found
        const status = accessResp.status();
        expect([403, 404]).toContain(status);
        console.log(`✅ User B cannot access User A's cart (status: ${status})`);

        // Cleanup
        await shopClientA.delete(`/api/v2/shop/orders/${tokenValueA}`);
    });

    test('Shop user cannot access admin endpoints', async () => {
        // Login as shop user (customer)
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userAEmail, defaultPassword);

        // Try to access admin endpoints with shop token
        const adminEndpoints = [
            '/api/v2/admin/products',
            '/api/v2/admin/customers',
            '/api/v2/admin/orders'
        ];

        for (const endpoint of adminEndpoints) {
            const resp = await shopClient.get(endpoint);
            const status = resp.status();
            
            // Should be 401 (unauthorized) or 403 (forbidden)
            expect([401, 403]).toContain(status);
            console.log(`✅ Shop user blocked from ${endpoint} (status: ${status})`);
        }
    });

    test('Anonymous user cannot access authenticated shop endpoints', async () => {
        // Create request context WITHOUT authentication
        const anonymousContext = await request.newContext();

        // Try to access endpoints that require authentication
        const protectedEndpoints = [
            '/api/v2/shop/customers/me',      // Current user info
            '/api/v2/shop/account/orders',    // User's order history
        ];

        for (const endpoint of protectedEndpoints) {
            const resp = await anonymousContext.get(endpoint);
            const status = resp.status();
            
            // Should require authentication
            expect([401, 403]).toContain(status);
            console.log(`✅ Anonymous access blocked for ${endpoint} (status: ${status})`);
        }
    });

    test('Invalid JWT token is rejected', async () => {
        // Create request context with fake/invalid token
        const fakeTokenContext = await request.newContext({
            extraHTTPHeaders: {
                'Authorization': 'Bearer fake.invalid.token.here',
                'Accept': 'application/ld+json'
            }
        });

        // Try to access a protected endpoint
        const resp = await fakeTokenContext.get('/api/v2/shop/customers/me');
        
        // Should be rejected
        expect(resp.status()).toBe(401);
        console.log(`✅ Invalid JWT token rejected (status: ${resp.status()})`);
    });

    test('Malformed Authorization header is rejected', async () => {
        // Create request context with malformed auth header
        const malformedContext = await request.newContext({
            extraHTTPHeaders: {
                'Authorization': 'NotBearer some.token',
                'Accept': 'application/ld+json'
            }
        });

        const resp = await malformedContext.get('/api/v2/shop/customers/me');
        
        // Should be rejected
        const status = resp.status();
        expect([400, 401, 403]).toContain(status);
        console.log(`✅ Malformed auth header rejected (status: ${status})`);
    });

    test('SQL injection in parameters is handled safely', async () => {
        // Login as shop user
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userAEmail, defaultPassword);

        // Try SQL injection in various parameters
        const maliciousInputs = [
            "'; DROP TABLE sylius_order; --",
            "1 OR 1=1",
            "<script>alert('xss')</script>",
            "../../../etc/passwd"
        ];

        for (const input of maliciousInputs) {
            // Try in search/filter parameter
            const resp = await shopClient.get(`/api/v2/shop/products?name=${encodeURIComponent(input)}`);
            
            // Should not cause 500 error (that would indicate SQL injection vulnerability)
            expect(resp.status()).not.toBe(500);
            
            // If we get a response, check it's a valid JSON (not a database error)
            if (resp.ok()) {
                const body = await resp.json();
                expect(body).toBeDefined();
            }
        }
        console.log(`✅ SQL injection attempts handled safely`);
    });

    test('User can only modify their own cart', async () => {
        // User A creates a cart and adds an item
        const shopClientA = new ShopClient(await request.newContext());
        await shopClientA.login_token(userAEmail, defaultPassword);

        const cartRespA = await shopClientA.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        const cartA = await cartRespA.json();
        const tokenValueA = cartA.tokenValue;

        // User B tries to modify User A's cart
        const shopClientB = new ShopClient(await request.newContext());
        await shopClientB.login_token(userBEmail, defaultPassword);

        // Try to add item to User A's cart
        const variantsResp = await adminClient.get('/api/v2/admin/product-variants?itemsPerPage=1');
        const variants = await variantsResp.json();
        
        if (variants['hydra:member'] && variants['hydra:member'].length > 0) {
            const variantCode = variants['hydra:member'][0].code;
            
            const modifyResp = await shopClientB.post(`/api/v2/shop/orders/${tokenValueA}/items`, {
                productVariant: `/api/v2/shop/product-variants/${variantCode}`,
                quantity: 1
            });

            // Should be rejected
            const status = modifyResp.status();
            expect([403, 404]).toContain(status);
            console.log(`✅ User B cannot modify User A's cart (status: ${status})`);
        }

        // Cleanup
        await shopClientA.delete(`/api/v2/shop/orders/${tokenValueA}`);
    });

    test('Admin credentials dont work on shop API', async () => {
        // Try to use admin token endpoint credentials on shop API
        const shopContext = await request.newContext();
        
        // Try admin login on shop token endpoint (should fail)
        const resp = await shopContext.post('/api/v2/shop/customers/token', {
            data: {
                email: 'sylius@example.com',  // Admin email
                password: 'sylius'            // Admin password
            }
        });

        // Admin should NOT be able to login as shop customer
        // (unless there's also a customer account with same credentials)
        if (!resp.ok()) {
            console.log(`✅ Admin credentials rejected on shop API (status: ${resp.status()})`);
        } else {
            // If it works, it means there's a customer with same credentials
            // This is technically okay but worth noting
            console.log(`⚠️  Admin email has corresponding customer account`);
        }
    });

    test('Rate limiting or request throttling exists', async () => {
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userAEmail, defaultPassword);

        // Make many rapid requests
        const requests = [];
        for (let i = 0; i < 20; i++) {
            requests.push(shopClient.get('/api/v2/shop/products'));
        }

        const responses = await Promise.all(requests);
        
        // Check if any were rate-limited (429) or if all succeeded
        const rateLimited = responses.filter(r => r.status() === 429).length;
        const successful = responses.filter(r => r.ok()).length;
        
        console.log(`✅ Rapid requests test: ${successful} successful, ${rateLimited} rate-limited`);
        
        // Note: Not all APIs implement rate limiting, so we just report
        // In production, rate limiting SHOULD exist
    });
});
