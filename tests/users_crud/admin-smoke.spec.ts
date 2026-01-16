import { expect, request, test } from "@playwright/test";
import { AdminClient } from "../../lib/api/AdminClient";

test.describe('Admin Smoke Tests', () => {
    // Run tests serially to avoid race conditions with shared admin client
    test.describe.configure({ mode: 'serial' });

    let adminClient: AdminClient;

    test.beforeAll('charge token', async ({ }) => {
        const apiContext = await request.newContext();
        adminClient = new AdminClient(apiContext);
        await adminClient.login();
    });

    test('validation shop configuration (channels)', async ({ }) => {
        let response = await adminClient.get('/api/v2/admin/channels');
        expect(response.status(), 'Channels api should retunr 200').toBe(200);
        const body = await response.json();
        const channelcodes = body['hydra:member'].map((channel: any) => channel.code);
        expect(channelcodes).toContain('FASHION_WEB');
    });

    test('Validate product catalog', async ({ }) => {
        // Re-login to ensure fresh token (in case previous tests invalidated it)
        await adminClient.login();
        
        let response = await adminClient.get('/api/v2/admin/products')
        expect(response.status()).toBe(200);
        let body = await response.json();
        expect(body['hydra:totalItems']).toBeGreaterThan(0);
    });
});
