import { AdminClient } from "../../lib/api/AdminClient";

import { request, expect } from "@playwright/test";
import test from "@playwright/test";


let adminclient: AdminClient;

test.beforeAll('Charge token for admin', async({}) => {

    const apiContext = await request.newContext();
    adminclient = new AdminClient(apiContext);
    await adminclient.login()

});

test ('Create customer', async ({}) => {
    
    const randomemail = `qauser_${Date.now()}@example.com`;

    const data = { 
        email: randomemail,
        firstName: "QA",
        lastName: "User", 
        password: "qauser1",
        subscribedToNewsletter: true,
        birthday: "2006-01-01T16:49:05.002Z"
        
    };

    let response = await adminclient.post('/api/v2/admin/customers', data);
    expect (response.status()).toBe(201);
    const body = await response.json();
    expect(body.email).toBe(randomemail);
    expect(body.firstName).toBe("QA"); 
});

