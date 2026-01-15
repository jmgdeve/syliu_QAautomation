import { expect, request } from "@playwright/test";
import { AdminClient } from "../../lib/api/AdminClient";
import test from '@playwright/test';


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
   let response = await adminClient.get('/api/v2/admin/products')
   expect(response.status()).toBe(200);
   let body = await response.json();

   expect(body['hydra:totalItems']).toBeGreaterThan(0);

});