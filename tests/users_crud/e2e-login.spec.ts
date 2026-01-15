import test, { expect, request } from "@playwright/test";
import { AdminClient } from "../../lib/api/AdminClient";
import { generateEmail, createCustomerData } from "../../lib/data/testData";

let adminClient: AdminClient;

test.beforeAll('charge token from admin', async ({ }) => {
    const adminContext = await request.newContext();
    adminClient = new AdminClient(adminContext);
    await adminClient.login();
});

test('Admin creates user-> user logs in', async ({ }) => {
    const email = generateEmail('qauser');
    const data = createCustomerData(email, 'basic');

    const response = await adminClient.post('/api/v2/admin/customers', data);
    expect(response.status()).toBe(201);
});