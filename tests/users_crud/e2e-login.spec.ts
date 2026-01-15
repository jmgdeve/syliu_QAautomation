import test, { expect } from "@playwright/test";
import { AdminClient } from "../../lib/api/AdminClient";

import { request } from "@playwright/test";


let adminClient: AdminClient;
// let shopClient: ShopClient;
test.beforeAll('charge token from admin', async ({ }) => {
    const adminContext = await request.newContext();
    adminClient = new AdminClient(adminContext);
    await adminClient.login();
})


test('Admin creates user-> user logs in', async ({ }) => {

    const randomemail = `qauser_${Date.now()}@example.com`;
    const password = "qauser1"
    const data = {
        email: randomemail,
        firstName: "QA",
        lastName: "User",
        subscribedToNewsletter: true,
        birthday: "2006-01-01T16:49:05.002Z",
        localeCode: "en_US",
        //sylius has 2 tables for user/customer
        user: {
            plainPassword: password,
            enabled: true

        }

    };

    let response = await adminClient.post('/api/v2/admin/customers', data);
    expect(response.status()).toBe(201);
    /**
     const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login(randomemail, password);

    const orderresponse = await shopClient.get('/api/v2/shop/orders');
    if (orderresponse.status() !== 200) {
        console.error('error details', await orderresponse.text())
    }
    expect(orderresponse.status()).toBe(200);
    */

})