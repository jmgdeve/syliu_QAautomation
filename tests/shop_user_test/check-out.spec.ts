import { test, expect, request } from '@playwright/test';
import { AdminClient } from '../../lib/api/AdminClient';
import { ShopClient } from '../../lib/api/ShopClient';
import { defaultPassword, generateEmail, createCustomerData, createAddressPayload, addresses } from '../../lib/data/testData';

let adminClient: AdminClient;
let shopClient: ShopClient;
let userEmail: string;
let variantCode: string;
let userId: string;
let createdCarts: string[] = [];

test.beforeAll(async ({ }) => {
    // 1. Admin Login
    adminClient = new AdminClient(await request.newContext());
    await adminClient.login();

    // 2. Create User
    userEmail = generateEmail('checkout');
    const userData = createCustomerData(userEmail, 'checkout');
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
    await shopClient.login_token(userEmail, defaultPassword);

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
    const addressData = createAddressPayload('us');

    const addressResp = await shopClient.put(`/api/v2/shop/orders/${tokenValue}`, addressData);
    expect(addressResp.ok(), `Add address failed: ${await addressResp.text()}`).toBeTruthy();
    
    // Step 5: Verify Order State
    const orderData = await addressResp.json();
    expect(orderData.checkoutState).toBe('addressed');
    expect(orderData.shippingAddress.street).toBe(addresses.us.street);
    expect(orderData.billingAddress.street).toBe(addresses.us.street);

    // Step 6: Select Shipping Method
    const shipmentId = orderData.shipments[0].id;

    // Fetch available shipping methods for this order dynamically
    const shippingMethodsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}/methods`);
    expect(shippingMethodsResp.ok(), `Get shipping methods failed: ${await shippingMethodsResp.text()}`).toBeTruthy();
    
    const shippingMethodsData = await shippingMethodsResp.json();
    const availableMethods = shippingMethodsData['hydra:member'];
    expect(availableMethods.length).toBeGreaterThan(0);
    
    // Use the first available shipping method
    const shippingMethodIri = availableMethods[0]['@id'];

    const selectShippingResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}`, {
        shippingMethod: shippingMethodIri
    });
    expect(selectShippingResp.ok(), `Select shipping failed: ${await selectShippingResp.text()}`).toBeTruthy();
    
    const shippingStateData = await selectShippingResp.json();
    expect(shippingStateData.checkoutState).toBe('shipping_selected');
    expect(shippingStateData.shippingTotal).toBeGreaterThan(0);
});

test('User can complete order with payment (Buy Now)', async ({ }) => {
    // Step 1: Login to Shop API
    const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login_token(userEmail, defaultPassword);

    // Step 2: Create a new Cart
    const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
    expect(cartResp.ok(), `Create cart failed: ${await cartResp.text()}`).toBeTruthy();
    const tokenValue = (await cartResp.json()).tokenValue;
    createdCarts.push(tokenValue);

    // Step 3: Add item to Cart
    const addItemResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
        productVariant: `/api/v2/shop/product-variants/${variantCode}`,
        quantity: 1
    });
    expect(addItemResp.ok(), `Add item failed: ${await addItemResp.text()}`).toBeTruthy();

    // Step 4: Add Shipping and Billing Address
    const addressResp = await shopClient.put(`/api/v2/shop/orders/${tokenValue}`, createAddressPayload('us'));
    expect(addressResp.ok(), `Add address failed: ${await addressResp.text()}`).toBeTruthy();
    const orderData = await addressResp.json();
    expect(orderData.checkoutState).toBe('addressed');

    // Step 5: Select Shipping Method
    const shipmentId = orderData.shipments[0].id;
    const shippingMethodsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}/methods`);
    expect(shippingMethodsResp.ok(), `Get shipping methods failed: ${await shippingMethodsResp.text()}`).toBeTruthy();
    const shippingMethods = (await shippingMethodsResp.json())['hydra:member'];
    expect(shippingMethods.length).toBeGreaterThan(0);

    const selectShippingResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}`, {
        shippingMethod: shippingMethods[0]['@id']
    });
    expect(selectShippingResp.ok(), `Select shipping failed: ${await selectShippingResp.text()}`).toBeTruthy();
    const shippingData = await selectShippingResp.json();
    expect(shippingData.checkoutState).toBe('shipping_selected');

    // Step 6: Select Payment Method (Cash on Delivery)
    const paymentId = shippingData.payments[0].id;

    // Fetch available payment methods
    const paymentMethodsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}/payments/${paymentId}/methods`);
    expect(paymentMethodsResp.ok(), `Get payment methods failed: ${await paymentMethodsResp.text()}`).toBeTruthy();
    const paymentMethods = (await paymentMethodsResp.json())['hydra:member'];
    expect(paymentMethods.length).toBeGreaterThan(0);

    // Select payment method (prefer cash_on_delivery if available, otherwise first available)
    const cashOnDelivery = paymentMethods.find((m: any) => m.code === 'cash_on_delivery');
    const selectedPaymentMethod = cashOnDelivery || paymentMethods[0];

    const selectPaymentResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/payments/${paymentId}`, {
        paymentMethod: selectedPaymentMethod['@id']
    });
    expect(selectPaymentResp.ok(), `Select payment failed: ${await selectPaymentResp.text()}`).toBeTruthy();
    const paymentData = await selectPaymentResp.json();
    expect(paymentData.checkoutState).toBe('payment_selected');

    // Step 7: Complete the Order (Buy Now)
    const completeResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/complete`, {});
    expect(completeResp.ok(), `Complete order failed: ${await completeResp.text()}`).toBeTruthy();
    
    const completedOrder = await completeResp.json();
    expect(completedOrder.checkoutState).toBe('completed');
    expect(completedOrder.state).toBe('new');
    expect(completedOrder.total).toBeGreaterThan(0);
});

test.afterAll(async () => {
    // Cleanup 1: Delete Carts created during tests
    if (createdCarts.length > 0) {
        const shopContext = await request.newContext();
        const cleanupShopClient = new ShopClient(shopContext);
        if (userEmail) {
             await cleanupShopClient.login_token(userEmail, defaultPassword);
        }

        for (const token of createdCarts) {
            const deleteResp = await cleanupShopClient.delete(`/api/v2/shop/orders/${token}`);
            // 404 = already deleted or completed order (expected), only log unexpected errors
            if (!deleteResp.ok() && deleteResp.status() !== 404) {
                console.log(`Cleanup warning - cart ${token}: ${deleteResp.status()}`);
            }
        }
    }

    // Cleanup 2: Delete the created user (the credentials)
    if (userId) {
        const deleteResp = await adminClient.delete(`/api/v2/admin/customers/${userId}/user`);
        expect(deleteResp.ok(), `Delete user failed: ${await deleteResp.text()}`).toBeTruthy();
    }
});
