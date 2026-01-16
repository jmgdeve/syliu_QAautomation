// Centralized test data for Sylius QA automation
// Add new data sets here without modifying test files

export const defaultPassword = "qauser1";
export const defaultLocale = "en_US";

// Admin credentials for API authentication
// Uses the default admin created by Sylius fixtures (works in both local and CI)
export const adminCredentials = {
    email: 'sylius@example.com',
    password: 'sylius',
    tokenEndpoint: '/api/v2/admin/administrators/token'
};

// Shop customer token endpoint
export const shopTokenEndpoint = '/api/v2/shop/customers/token';

// User templates - Sylius has 2 tables: customer (profile) and user (credentials)
export const users = {
    checkout: {
        firstName: "Checkout",
        lastName: "Tester",
        subscribedToNewsletter: true
    },
    cart: {
        firstName: "QA",
        lastName: "User",
        subscribedToNewsletter: true,
        birthday: "2006-01-01T16:49:05.002Z",
        localeCode: defaultLocale
    },
    basic: {
        firstName: "QA",
        lastName: "User",
        subscribedToNewsletter: true,
        birthday: "2006-01-01T16:49:05.002Z",
        localeCode: defaultLocale
    }
};

// Address templates
export const addresses = {
    us: {
        firstName: "John",
        lastName: "Doe",
        street: "123 Fashion St",
        countryCode: "US",
        city: "New York",
        postcode: "10001"
    }
};

// Helper to generate unique email
// Uses timestamp + random suffix to prevent collisions in parallel test runs
export function generateEmail(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8); // 6 random chars
    return `${prefix}_${timestamp}_${random}@example.com`;
}

// Helper to create full customer payload with credentials
export function createCustomerData(
    email: string,
    userTemplate: keyof typeof users = 'basic',
    password: string = defaultPassword
) {
    return {
        email,
        ...users[userTemplate],
        user: {
            plainPassword: password,
            enabled: true
        }
    };
}

// Helper to create address payload for checkout
export function createAddressPayload(addressKey: keyof typeof addresses = 'us') {
    const addr = addresses[addressKey];
    return {
        shippingAddress: { ...addr },
        billingAddress: { ...addr }
    };
}

// Helper to generate unique product code
// Uses timestamp + random suffix to prevent collisions in parallel test runs
export function generateProductCode(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 random chars
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

// Helper to generate slug from name
// Uses timestamp + random suffix to prevent collisions in parallel test runs
export function generateSlug(name: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${name.toLowerCase().replace(/\s+/g, '-')}-${timestamp}-${random}`;
}

// Helper to create product payload with variant
export function createProductData(code: string, name: string, channelCode: string = 'FASHION_WEB') {
    const slug = generateSlug(name);
    return {
        code,
        translations: {
            en_US: {
                name,
                slug,
                description: `Test product: ${name}`,
                shortDescription: `${name} for QA testing`
            }
        },
        channels: [`/api/v2/admin/channels/${channelCode}`],
        enabled: true
    };
}

// Helper to create product variant payload
export function createVariantData(
    productCode: string,
    variantCode: string,
    price: number = 1999,
    stock: number = 100,
    channelCode: string = 'FASHION_WEB'
) {
    return {
        code: variantCode,
        product: `/api/v2/admin/products/${productCode}`,
        channelPricings: {
            [channelCode]: {
                price,
                channelCode
            }
        },
        onHand: stock,
        tracked: true
    };
}
