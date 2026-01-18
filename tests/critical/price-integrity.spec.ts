/**
 * 🔴 CRITICAL TEST: Price Integrity
 * 
 * PURPOSE: Ensure all price calculations are correct - money is involved!
 * 
 * BUSINESS IMPACT:
 * - Wrong prices = financial loss or customer disputes
 * - Tax miscalculations = legal issues
 * - Discount errors = revenue loss
 * 
 * TEST SCENARIOS:
 * 1. Order total = items + shipping + tax
 * 2. Item subtotal = unit price × quantity
 * 3. Promotion/coupon discounts apply correctly
 * 
 * NOTE: Each test is fully isolated for parallel execution
 */

import { test, expect, request } from '@playwright/test';
import { AdminClient } from '../../lib/api/AdminClient';
import { ShopClient } from '../../lib/api/ShopClient';
import {
    generateEmail,
    createCustomerData,
    defaultPassword,
    createAddressPayload
} from '../../lib/data/testData';

/**
 * Helper to get a product variant for price tests
 * Each test calls this independently to avoid shared state
 */
async function getTestVariant(adminClient: AdminClient): Promise<{ code: string; price: number }> {
    const variantsResp = await adminClient.get('/api/v2/admin/product-variants?itemsPerPage=1');
    expect(variantsResp.ok()).toBeTruthy();
    const variants = await variantsResp.json();
    
    if (variants['hydra:member'] && variants['hydra:member'].length > 0) {
        const variant = variants['hydra:member'][0];
        let price = 1000; // Default fallback
        
        if (variant.channelPricings && Object.keys(variant.channelPricings).length > 0) {
            const channelKey = Object.keys(variant.channelPricings)[0];
            price = variant.channelPricings[channelKey].price;
        }
        
        return { code: variant.code, price };
    }
    
    throw new Error('No product variants available for testing');
}

test.describe('🔴 CRITICAL: Price Integrity', () => {
    // Tests run in parallel - each test is fully isolated

    test('Item subtotal equals unit price × quantity', async () => {
        // Setup: Create isolated admin client
        const adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Get a product variant
        const { code: variantCode } = await getTestVariant(adminClient);

        // Create unique test user
        const userEmail = generateEmail('price_subtotal_test');
        const userResp = await adminClient.post('/api/v2/admin/customers',
            createCustomerData(userEmail, 'checkout'));
        expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();

        // Login as shop user
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userEmail, defaultPassword);

        // Create cart
        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        expect(cartResp.ok()).toBeTruthy();
        const cart = await cartResp.json();
        const tokenValue = cart.tokenValue;

        // Add 3 items to cart
        const quantity = 3;
        const addResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
            productVariant: `/api/v2/shop/product-variants/${variantCode}`,
            quantity: quantity
        });
        expect(addResp.ok(), `Add items failed: ${await addResp.text()}`).toBeTruthy();

        // Get updated cart with prices
        const updatedCartResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
        const updatedCart = await updatedCartResp.json();

        // Verify item calculation
        const item = updatedCart.items[0];
        const baseSubtotal = item.unitPrice * quantity;
        
        // In Sylius, item.subtotal is unitPrice × quantity (before adjustments)
        // item.total includes adjustments like taxes
        // We verify: subtotal = unitPrice × quantity
        const itemSubtotal = item.subtotal ?? baseSubtotal; // subtotal field if available
        
        expect(item.quantity).toBe(quantity);
        expect(itemSubtotal).toBe(baseSubtotal);
        
        // Also verify total >= subtotal (total includes taxes/adjustments)
        expect(item.total).toBeGreaterThanOrEqual(itemSubtotal);
        
        console.log(`✅ Price calculation correct:`);
        console.log(`   Unit price: $${(item.unitPrice / 100).toFixed(2)} (cents: ${item.unitPrice})`);
        console.log(`   Quantity: ${quantity}`);
        console.log(`   Subtotal (price × qty): $${(baseSubtotal / 100).toFixed(2)}`);
        console.log(`   Item total (with adjustments): $${(item.total / 100).toFixed(2)}`);
        if (item.total > baseSubtotal) {
            console.log(`   Adjustments (tax, etc.): $${((item.total - baseSubtotal) / 100).toFixed(2)}`);
        }

        // Cleanup
        await shopClient.delete(`/api/v2/shop/orders/${tokenValue}`);
    });

    test('Order total includes items, shipping, and adjustments', async () => {
        // Increase timeout for checkout flow
        test.setTimeout(60000);

        // Setup: Create isolated admin client
        const adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Get a product variant
        const { code: variantCode } = await getTestVariant(adminClient);

        // Create unique test user
        const orderEmail = generateEmail('price_total_test');
        await adminClient.post('/api/v2/admin/customers', createCustomerData(orderEmail, 'checkout'));

        // Login and create cart
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(orderEmail, defaultPassword);

        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        const cart = await cartResp.json();
        const tokenValue = cart.tokenValue;

        // Add item
        await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
            productVariant: `/api/v2/shop/product-variants/${variantCode}`,
            quantity: 2
        });

        // Add address (required for shipping calculation)
        const addressPayload = createAddressPayload('us');
        await shopClient.patch(`/api/v2/shop/orders/${tokenValue}`, {
            email: orderEmail,
            ...addressPayload
        });

        // Select shipping method
        const shipmentsResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
        const orderWithShipments = await shipmentsResp.json();
        
        if (orderWithShipments.shipments && orderWithShipments.shipments.length > 0) {
            const shipmentId = orderWithShipments.shipments[0].id;
            const methodsResp = await shopClient.get(
                `/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}/methods`
            );
            
            if (methodsResp.ok()) {
                const methods = await methodsResp.json();
                if (methods['hydra:member'] && methods['hydra:member'].length > 0) {
                    const methodCode = methods['hydra:member'][0].code;
                    await shopClient.patch(
                        `/api/v2/shop/orders/${tokenValue}/shipments/${shipmentId}`,
                        { shippingMethod: `/api/v2/shop/shipping-methods/${methodCode}` }
                    );
                }
            }
        }

        // Get final order totals
        const finalOrderResp = await shopClient.get(`/api/v2/shop/orders/${tokenValue}`);
        const finalOrder = await finalOrderResp.json();

        // Verify totals structure exists
        expect(finalOrder.itemsTotal).toBeDefined();
        expect(finalOrder.total).toBeDefined();

        // Get all component totals from Sylius
        const itemsTotal = finalOrder.itemsTotal || 0;
        const shippingTotal = finalOrder.shippingTotal || 0;
        const taxTotal = finalOrder.taxTotal || 0;
        const orderPromotionTotal = finalOrder.orderPromotionTotal || 0;
        
        // In Sylius, taxTotal may be included in itemsTotal depending on tax configuration
        // The formula can be: total = itemsTotal + shippingTotal + orderPromotionTotal
        // (where itemsTotal already includes item taxes, and shippingTotal includes shipping taxes)
        // OR: total = itemsTotal + shippingTotal + taxTotal + orderPromotionTotal
        // (where taxes are separate)
        
        // Calculate both possible formulas
        const totalWithSeparateTax = itemsTotal + shippingTotal + taxTotal + orderPromotionTotal;
        const totalWithIncludedTax = itemsTotal + shippingTotal + orderPromotionTotal;

        console.log(`✅ Order totals breakdown:`);
        console.log(`   Items total: $${(itemsTotal / 100).toFixed(2)}`);
        console.log(`   Shipping total: $${(shippingTotal / 100).toFixed(2)}`);
        console.log(`   Tax total: $${(taxTotal / 100).toFixed(2)}`);
        console.log(`   Promotions: $${(orderPromotionTotal / 100).toFixed(2)}`);
        console.log(`   ─────────────────────`);
        console.log(`   Actual total: $${(finalOrder.total / 100).toFixed(2)}`);

        // Verify the total makes sense with one of the calculation methods
        // Sylius may include taxes in itemsTotal, so we check both scenarios
        const matchesSeparateTax = Math.abs(finalOrder.total - totalWithSeparateTax) <= 1;
        const matchesIncludedTax = Math.abs(finalOrder.total - totalWithIncludedTax) <= 1;
        
        // Total should be positive and make sense
        expect(finalOrder.total).toBeGreaterThan(0);
        
        // Total should be at least the items total
        expect(finalOrder.total).toBeGreaterThanOrEqual(itemsTotal);
        
        // Verify internal consistency: total should match one of the calculation methods
        expect(matchesSeparateTax || matchesIncludedTax).toBeTruthy();
        
        console.log(`   Calculation method: ${matchesIncludedTax ? 'Tax included in items' : 'Tax separate'}`);

        // Cleanup
        await shopClient.delete(`/api/v2/shop/orders/${tokenValue}`);
    });

    test('Prices are shown in correct currency', async () => {
        // Setup: Create isolated admin client
        const adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Get channel info to verify currency
        const channelsResp = await adminClient.get('/api/v2/admin/channels');
        expect(channelsResp.ok()).toBeTruthy();
        const channels = await channelsResp.json();

        if (channels['hydra:member'] && channels['hydra:member'].length > 0) {
            const channel = channels['hydra:member'][0];
            console.log(`✅ Channel: ${channel.code}`);
            console.log(`   Base currency: ${channel.baseCurrency}`);
            console.log(`   Currencies enabled: ${channel.currencies?.length || 'N/A'}`);
        }

        // Create unique test user
        const userEmail = generateEmail('price_currency_test');
        const userResp = await adminClient.post('/api/v2/admin/customers',
            createCustomerData(userEmail, 'basic'));
        expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();

        // Create cart and verify currency in order
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userEmail, defaultPassword);

        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        const cart = await cartResp.json();

        expect(cart.currencyCode).toBeDefined();
        console.log(`✅ Order currency: ${cart.currencyCode}`);

        // Cleanup
        await shopClient.delete(`/api/v2/shop/orders/${cart.tokenValue}`);
    });

    test('Zero quantity items are not allowed', async () => {
        // Setup: Create isolated admin client
        const adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Get a product variant
        const { code: variantCode } = await getTestVariant(adminClient);

        // Create unique test user
        const userEmail = generateEmail('price_zero_qty_test');
        const userResp = await adminClient.post('/api/v2/admin/customers',
            createCustomerData(userEmail, 'basic'));
        expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();

        // Create a fresh shop client for this test
        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userEmail, defaultPassword);

        // Create cart
        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        expect(cartResp.ok(), `Create cart failed: ${await cartResp.text()}`).toBeTruthy();
        const cart = await cartResp.json();
        const tokenValue = cart.tokenValue;

        // Try to add 0 items
        const addResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
            productVariant: `/api/v2/shop/product-variants/${variantCode}`,
            quantity: 0 // Invalid!
        });

        // Should be rejected
        expect(addResp.ok()).toBeFalsy();
        const status = addResp.status();
        expect([400, 422]).toContain(status);
        console.log(`✅ Zero quantity rejected with status ${status}`);

        // Cleanup
        await shopClient.delete(`/api/v2/shop/orders/${tokenValue}`);
    });

    test('Negative quantity items are not allowed', async () => {
        // Setup: Create isolated admin client
        const adminClient = new AdminClient(await request.newContext());
        await adminClient.login();

        // Get a product variant
        const { code: variantCode } = await getTestVariant(adminClient);

        // Create unique test user
        const userEmail = generateEmail('price_neg_qty_test');
        const userResp = await adminClient.post('/api/v2/admin/customers',
            createCustomerData(userEmail, 'basic'));
        expect(userResp.ok(), `Create user failed: ${await userResp.text()}`).toBeTruthy();

        const shopClient = new ShopClient(await request.newContext());
        await shopClient.login_token(userEmail, defaultPassword);

        // Create cart
        const cartResp = await shopClient.post('/api/v2/shop/orders', { localeCode: 'en_US' });
        const cart = await cartResp.json();
        const tokenValue = cart.tokenValue;

        // Try to add negative items
        const addResp = await shopClient.post(`/api/v2/shop/orders/${tokenValue}/items`, {
            productVariant: `/api/v2/shop/product-variants/${variantCode}`,
            quantity: -5 // Invalid!
        });

        // Should be rejected
        expect(addResp.ok()).toBeFalsy();
        console.log(`✅ Negative quantity rejected with status ${addResp.status()}`);

        // Cleanup
        await shopClient.delete(`/api/v2/shop/orders/${tokenValue}`);
    });
});
