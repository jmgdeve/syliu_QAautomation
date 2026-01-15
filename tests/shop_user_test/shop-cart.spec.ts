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
    userEmail = `testuser_${Date.now()}@example.com`;

    const userData = {
        email: userEmail,
        firstName: "QA",
        lastName: "User",
        subscribedToNewsletter: true,
        birthday: "2006-01-01T16:49:05.002Z",
        localeCode: "en_US",
        //sylius has 2 tables for user/customer
        user: {
            plainPassword: userPassword,
            enabled: true

        }

    };
    const userResp = await adminClient.post('/api/v2/admin/customers', userData);
    expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();
    const userBody = await userResp.json();
    userId = userBody.id;

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

test('Registered customer can initialize a cart and add a product', async ({ }) => {
    // Step 1: Login to Shop API
    // We use 'localhost' as baseURL to match the 'FASHION_WEB' channel configuration
    const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login_token(userEmail, userPassword);

    // Step 2: Create a new Cart
    const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
    expect(cartResp.ok(), `Create cart failed: ${await cartResp.text()}`).toBeTruthy();

    const cart = await cartResp.json();
    const tokenValue = cart.tokenValue;
    createdCarts.push(tokenValue);

    // Step 3: Add item to Cart
    // Note: We use the IRI (ID reference) of the variant
    const addItemResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
        productVariant: `/api/v2/shop/product-variants/${variantCode}`,
        quantity: 1
    });
    expect(addItemResp.ok(), `Add item failed: ${await addItemResp.text()}`).toBeTruthy();

    // Step 4: Verify Cart content
    const verifyCartResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
    expect(verifyCartResp.ok()).toBeTruthy();
    const verifyCart = await verifyCartResp.json();

    // Verifications
    expect(verifyCart.items).toHaveLength(1);
    expect(verifyCart.state || verifyCart.checkoutState).toBe('cart');
    expect(verifyCart.total).toBeGreaterThan(0);
    expect(verifyCart.items[0].variant).toContain(variantCode);
});

test('Registered customer can modify item quantity', async ({ }) => {
    // Step 1: Login to Shop API
    const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login_token(userEmail, userPassword);

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
    const itemData = await addItemResp.json();
    // In Sylius API Platform, adding an item *returns the whole Order object*, not just the Item.   
    // We assume the last added item is the one we want, or we filter by variant.
    const addedItem = itemData.items.find((i: any) => i.variant.includes(variantCode));

    if (!addedItem) {
        throw new Error(`Could not find item with variant ${variantCode} in the response.`);
    }

    const itemId = String(addedItem.id);
    const initialTotal = addedItem.total;

    // The route to update quantity is: PATCH /api/v2/shop/orders/{tokenValue}/items/{id}
    // The response is usually the Order object containing the updated items
    const modifyResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/items/${itemId}`, {
        quantity: 5
    });
    expect(modifyResp.ok(), `Modify quantity failed: ${await modifyResp.text()}`).toBeTruthy();
    const modifyResponseJson = await modifyResp.json();
    
    // We know the response is an Order object, so we specifically look for our item in the items array
    const updatedItem = modifyResponseJson.items.find((i: any) => String(i.id) === itemId);

    expect(updatedItem.quantity).toBe(5);

    // Step 5: Verify Cart Total and Quantity
    const verifyCartResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
    expect(verifyCartResp.ok()).toBeTruthy();
    const verifyCart = await verifyCartResp.json();

    expect(verifyCart.items[0].quantity).toBe(5);
    expect(verifyCart.items[0].total).toBeGreaterThan(initialTotal);
});

test('Registered customer can remove an item from the cart', async ({ }) => {
    // Step 1: Login to Shop API
    const shopContext = await request.newContext();
    shopClient = new ShopClient(shopContext);
    await shopClient.login_token(userEmail, userPassword);

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
    
    // Get Item ID
    const itemData = await addItemResp.json();
    const addedItem = itemData.items.find((i: any) => i.variant.includes(variantCode));
    const itemId = String(addedItem.id);

    // Step 4: Remove item
   
    const deleteResp = await shopClient.delete(`/api/v2/shop/orders/${tokenValue}/items/${itemId}`);
    expect(deleteResp.status()).toBe(204); 

    // Step 5: Verify Cart is empty
    const verifyCartResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
    expect(verifyCartResp.ok()).toBeTruthy();
    const verifyCart = await verifyCartResp.json();

    expect(verifyCart.items).toHaveLength(0);
    expect(verifyCart.total).toBe(0);
});

test.afterAll(async () => {
    // Cleanup 1: Delete Carts created during tests because sylius mantain the cart of customers even if we delete shop user and cant get access the cart
    if (createdCarts.length > 0) {
        // Ensure we have a valid shop session
        const shopContext = await request.newContext();
        const cleanupShopClient = new ShopClient(shopContext);
        
        // We might need to login if tokens require ownership, but standard cart deletion often works if we own it.
        // However, the tokens in 'createdCarts' are just strings. The API needs to identify WHO is deleting it?

        if (userEmail) {
             await cleanupShopClient.login_token(userEmail, userPassword);
        }

        for (const token of createdCarts) {
            const deleteResp = await cleanupShopClient.delete(`/api/v2/shop/orders/${token}`);
            // We don't assert strictly here because if it fails, it might be already deleted or 404
            if (!deleteResp.ok()) {
                console.log(`Failed to delete cart ${token}: ${deleteResp.status()}`);
            }
        }
    }

    // Cleanup 2: Delete the created user (the credentials)
    if (userId) {
        // Sylius API v2 deletes the *Shop User* credentials associated with a custome but it still contein the first name , last name an email records for historic buys.
        // Endpoint: DELETE /api/v2/admin/customers/{id}/user
        const deleteResp = await adminClient.delete(`/api/v2/admin/customers/${userId}/user`);
        expect(deleteResp.ok(), `Delete user failed: ${await deleteResp.text()}`).toBeTruthy();
    }
});
