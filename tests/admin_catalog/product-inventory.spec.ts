import { test, expect, request } from '@playwright/test';
import { AdminClient } from '../../lib/api/AdminClient';
import { ShopClient } from '../../lib/api/ShopClient';
import {
    generateProductCode,
    createProductData,
    createVariantData,
    generateEmail,
    createCustomerData,
    createAddressPayload,
    defaultPassword
} from '../../lib/data/testData';

let adminClient: AdminClient;
let createdProductCodes: string[] = [];

test.beforeAll(async () => {
    adminClient = new AdminClient(await request.newContext());
    await adminClient.login();
});

test.describe('Admin Power - Inventory & Catalog', () => {

    test('Admin can create a new product (Summer Hat)', async () => {
        // Step 1: Generate unique product code and name
        const productCode = generateProductCode('SUMMER_HAT');
        const productName = 'Summer Hat';

        // Step 2: Create the product
        const productData = createProductData(productCode, productName);
        const productResp = await adminClient.post('/api/v2/admin/products', productData);
        expect(productResp.ok(), `Create product failed: ${await productResp.text()}`).toBeTruthy();
        
        const product = await productResp.json();
        expect(product.code).toBe(productCode);
        createdProductCodes.push(productCode);

        // Step 3: Create a variant for the product (required for it to be purchasable)
        const variantCode = `${productCode}_VAR`;
        const variantData = createVariantData(productCode, variantCode, 2499, 50);
        const variantResp = await adminClient.post('/api/v2/admin/product-variants', variantData);
        expect(variantResp.ok(), `Create variant failed: ${await variantResp.text()}`).toBeTruthy();

        const variant = await variantResp.json();
        expect(variant.code).toBe(variantCode);
        expect(variant.onHand).toBe(50);

        // Step 4: Verify product appears in Shop API
        const shopContext = await request.newContext();
        const shopResp = await shopContext.get(`/api/v2/shop/products/${productCode}`, {
            headers: { Accept: 'application/ld+json' }
        });
        expect(shopResp.ok(), `Product not visible in shop: ${await shopResp.text()}`).toBeTruthy();
        
        const shopProduct = await shopResp.json();
        expect(shopProduct.code).toBe(productCode);
    });

    test('Admin can update inventory stock', async () => {
        // Step 1: Create a product with initial stock of 0
        const productCode = generateProductCode('STOCK_TEST');
        const productData = createProductData(productCode, 'Stock Test Item');
        const productResp = await adminClient.post('/api/v2/admin/products', productData);
        expect(productResp.ok(), `Create product failed: ${await productResp.text()}`).toBeTruthy();
        createdProductCodes.push(productCode);

        // Step 2: Create variant with 0 stock
        const variantCode = `${productCode}_VAR`;
        const variantData = createVariantData(productCode, variantCode, 999, 0);
        const variantResp = await adminClient.post('/api/v2/admin/product-variants', variantData);
        expect(variantResp.ok(), `Create variant failed: ${await variantResp.text()}`).toBeTruthy();

        // Step 3: Verify initial stock is 0
        const checkResp = await adminClient.get(`/api/v2/admin/product-variants/${variantCode}`);
        expect(checkResp.ok()).toBeTruthy();
        const initialVariant = await checkResp.json();
        expect(initialVariant.onHand).toBe(0);

        // Step 4: Update inventory - received shipment of 100 units
        // Sylius requires PUT for variant updates (PATCH not allowed)
        const updateResp = await adminClient.put(`/api/v2/admin/product-variants/${variantCode}`, {
            onHand: 100
        });
        expect(updateResp.ok(), `Update stock failed: ${await updateResp.text()}`).toBeTruthy();

        // Step 5: Verify stock is now 100
        const verifyResp = await adminClient.get(`/api/v2/admin/product-variants/${variantCode}`);
        expect(verifyResp.ok()).toBeTruthy();
        const updatedVariant = await verifyResp.json();
        expect(updatedVariant.onHand).toBe(100);
    });

    test('Admin can fulfill (ship) an order', async () => {
        // Setup: Create a complete order first
        // Step 1: Create a customer
        const userEmail = generateEmail('ship_test');
        const customerResp = await adminClient.post('/api/v2/admin/customers', createCustomerData(userEmail));
        expect(customerResp.ok(), `Create customer failed: ${await customerResp.text()}`).toBeTruthy();
        const userId = (await customerResp.json()).id;

        // Step 2: Login as customer and create an order
        const shopContext = await request.newContext();
        const shopClient = new ShopClient(shopContext);
        await shopClient.login_token(userEmail, defaultPassword);

        // Step 3: Create cart and add item
        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        expect(cartResp.ok()).toBeTruthy();
        const tokenValue = (await cartResp.json()).tokenValue;

        // Get an existing variant to add
        const variantsResp = await adminClient.get('/api/v2/admin/product-variants');
        const variants = (await variantsResp.json())['hydra:member'];
        const variantCode = variants[0].code;

        const addItemResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
            productVariant: `/api/v2/shop/product-variants/${variantCode}`,
            quantity: 1
        });
        expect(addItemResp.ok()).toBeTruthy();

        // Step 4: Add address
        const addressResp = await shopClient.put(`/api/v2/shop/orders/${tokenValue}`, createAddressPayload('us'));
        expect(addressResp.ok()).toBeTruthy();
        const orderData = await addressResp.json();

        // Step 5: Select shipping
        const shipmentId = orderData.shipments[0].id;
        const shippingMethodsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}/methods`);
        const shippingMethods = (await shippingMethodsResp.json())['hydra:member'];
        await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}`, {
            shippingMethod: shippingMethods[0]['@id']
        });

        // Step 6: Select payment
        const orderAfterShipping = await (await shopClient.get(`/api/v2/shop/orders/${tokenValue}`)).json();
        const paymentId = orderAfterShipping.payments[0].id;
        const paymentMethodsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}/payments/${paymentId}/methods`);
        const paymentMethods = (await paymentMethodsResp.json())['hydra:member'];
        await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/payments/${paymentId}`, {
            paymentMethod: paymentMethods[0]['@id']
        });

        // Step 7: Complete the order
        const completeResp = await shopClient.patch(`/api/v2/shop/orders/${tokenValue}/complete`, {});
        expect(completeResp.ok(), `Complete order failed: ${await completeResp.text()}`).toBeTruthy();
        const completedOrder = await completeResp.json();
        expect(completedOrder.state).toBe('new');

        // Step 8: Get the order's shipment ID from admin API
        const orderResp = await adminClient.get(`/api/v2/admin/orders/${tokenValue}`);
        expect(orderResp.ok()).toBeTruthy();
        const adminOrder = await orderResp.json();
        
        // Shipment can be an IRI string or an object with @id
        const shipmentData = adminOrder.shipments[0];
        const adminShipmentIri = typeof shipmentData === 'string' ? shipmentData : shipmentData['@id'];
        const adminShipmentId = adminShipmentIri.split('/').pop();

        // Step 9: Admin ships the order via shipment endpoint
        // Try PATCH first, if that fails try PUT with state transition
        let shipResp = await adminClient.patch(`/api/v2/admin/shipments/${adminShipmentId}/ship`, {});
        
        // If PATCH to /ship doesn't work, try updating shipment state directly
        if (!shipResp.ok()) {
            shipResp = await adminClient.put(`/api/v2/admin/shipments/${adminShipmentId}`, {
                state: 'shipped'
            });
        }
        expect(shipResp.ok(), `Ship order failed: ${await shipResp.text()}`).toBeTruthy();

        // Step 10: Verify shipment state is "shipped"
        const shipmentVerifyResp = await adminClient.get(`/api/v2/admin/shipments/${adminShipmentId}`);
        expect(shipmentVerifyResp.ok()).toBeTruthy();
        const shippedShipment = await shipmentVerifyResp.json();
        expect(shippedShipment.state).toBe('shipped');

        // Step 11: Verify order shipping state
        // Note: Order state becomes "fulfilled" only when BOTH shipped AND paid
        // For cash-on-delivery, payment is completed upon delivery
        const verifyResp = await adminClient.get(`/api/v2/admin/orders/${tokenValue}`);
        expect(verifyResp.ok()).toBeTruthy();
        const shippedOrder = await verifyResp.json();
        expect(shippedOrder.shippingState).toBe('shipped');

        // Cleanup: Delete user credentials
        await adminClient.delete(`/api/v2/admin/customers/${userId}/user`);
    });
});

test.afterAll(async () => {
    // Cleanup: Delete created products
    for (const code of createdProductCodes) {
        const deleteResp = await adminClient.delete(`/api/v2/admin/products/${code}`);
        if (!deleteResp.ok() && deleteResp.status() !== 404) {
            console.log(`Cleanup warning - product ${code}: ${deleteResp.status()}`);
        }
    }
});
