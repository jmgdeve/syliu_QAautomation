import { test, expect, request } from '@playwright/test';
import { AdminClient } from '../../lib/api/AdminClient';
import { ShopClient } from '../../lib/api/ShopClient';

let adminClient: AdminClient;
let shopClient: ShopClient;
let userEmail: string;
const userPassword = "qauser1";
let variantCode: string;
let userId: string;
let createdCarts: string[] = [];

test.beforeAll(async ({ }) => {
    // 1. Admin Login
    adminClient = new AdminClient(await request.newContext());
    await adminClient.login();

    // 2. Create User
    userEmail = `checkout_${Date.now()}@example.com`;
    // Standard Sylius User Setup
    const userData = {
        email: userEmail,
        firstName: "Checkout",
        lastName: "Tester",
        subscribedToNewsletter: true,
        user: {
            plainPassword: userPassword,
            enabled: true
        }
    };
    const userResp = await adminClient.post('/api/v2/admin/customers', userData);
    expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();
    userId = (await userResp.json()).id;

    // 3. Get existing Product Variant to use
    const variantsResp = await adminClient.get('/api/v2/admin/product-variants');
    expect(variantsResp.ok()).toBeTruthy();
    const variantsBody = await variantsResp.json();
    const members = variantsBody['hydra:member'];
    if (members && members.length > 0) {
        variantCode = members[0].code;
    } else {
        throw new Error('No product variants found. Please seed the database.');
    }
});

test('Registered customer can add shipping and billing address', async ({ }) => {
    // Step 1: Login to Shop API
    const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login_token(userEmail, userPassword);

    // Step 2: Create a new Cart
    const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
    expect(cartResp.ok(), `Create cart failed: ${await cartResp.text()}`).toBeTruthy();
    const tokenValue = (await cartResp.json()).tokenValue;
    createdCarts.push(tokenValue);

    // Step 3: Add item to Cart (Order must have items to be addressed)
    const addItemResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
        productVariant: `/api/v2/shop/product-variants/${variantCode}`,
        quantity: 1
    });
    expect(addItemResp.ok(), `Add item failed: ${await addItemResp.text()}`).toBeTruthy();

    // Step 4: Add Shipping and Billing Address
    
    const addressData = {
        shippingAddress: {
            firstName: "John",
            lastName: "Doe",
            street: "123 Fashion St",
            countryCode: "US",
            city: "New York",
            postcode: "10001"
        },
        billingAddress: {
            firstName: "John",
            lastName: "Doe",
            street: "123 Fashion St",
            countryCode: "US",
            city: "New York",
            postcode: "10001"
        }
    };

    const addressResp = await shopClient.put(`/api/v2/shop/orders/${tokenValue}`, addressData);
    expect(addressResp.ok(), `Add address failed: ${await addressResp.text()}`).toBeTruthy();
    
    // Step 5: Verify Order State
    const orderData = await addressResp.json();
    expect(orderData.checkoutState).toBe('addressed');
    expect(orderData.shippingAddress.street).toBe('123 Fashion St');
    expect(orderData.billingAddress.street).toBe('123 Fashion St');

    // Step 6: Select Shipping Method
    // We need to find the specific shipment related to our order
    const shipmentId = orderData.shipments[0].id;
    



    // We can fetch available shipping methods or assume 'ups' exists (standard Sylius fixture)
    // To be robust, let's fetch valid shipping methods. 
    // Usually available at GET /api/v2/shop/shipping-methods, but getting the one for a specific shipment is safer if available.
    // For now, we will assume 'ups' based on standard fixtures or try to fetch from a collection.
    
    const shippingMethodCode = 'ups'; // Default fixture
    const shippingMethodIri = `/api/v2/shop/shipping-methods/${shippingMethodCode}`;

    const selectShippingResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}`, {
        method: shippingMethodIri
    });
    expect(selectShippingResp.ok(), `Select shipping failed: ${await selectShippingResp.text()}`).toBeTruthy();
    
    const shippingStateData = await selectShippingResp.json();
    expect(shippingStateData.checkoutState).toBe('shipping_selected');
    // Verify total increased (assuming shipping cost > 0)
    // We can check 'shippingTotal'
    expect(shippingStateData.shippingTotal).toBeGreaterThan(0);
});






test.afterAll(async () => {
    // Cleanup 1: Delete Carts created during tests
    if (createdCarts.length > 0) {
        const shopContext = await request.newContext();
        const cleanupShopClient = new ShopClient(shopContext);
        // Login again to be sure (as the user created for this test file)
        if (userEmail) {
             await cleanupShopClient.login_token(userEmail, userPassword);
        }

        for (const token of createdCarts) {
            const deleteResp = await cleanupShopClient.delete(`/api/v2/shop/orders/${token}`);
            if (!deleteResp.ok()) {
                console.log(`Failed to delete cart ${token}: ${deleteResp.status()}`);
            }
        }
    }

    // Cleanup 2: Delete the created user (the credentials)
    if (userId) {
        const deleteResp = await adminClient.delete(`/api/v2/admin/customers/${userId}/user`);
        expect(deleteResp.ok(), `Delete user failed: ${await deleteResp.text()}`).toBeTruthy();
    }
});
