// Centralized test data for Sylius QA automation
// Add new data sets here without modifying test files

export const defaultPassword = "qauser1";
export const defaultLocale = "en_US";

// Admin credentials for API authentication
export const adminCredentials = {
    email: 'qa@example.com',
    password: 'sylius123',
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
export function generateEmail(prefix: string): string {
    return `${prefix}_${Date.now()}@example.com`;
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
export function generateProductCode(prefix: string): string {
    return `${prefix}_${Date.now()}`.toUpperCase();
}

// Helper to generate slug from name
export function generateSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
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
