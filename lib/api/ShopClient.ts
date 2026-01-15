import { APIRequestContext, APIResponse } from "@playwright/test";
// 


export class ShopClient {
    readonly request: APIRequestContext;
    private token: string | null = null;

    constructor(request: APIRequestContext) {
        this.request = request;
    }

    private validateToken() {
        if (!this.token) {

            throw new Error('No shop token')

        }
    }

    async login_token(email: string, password: string) {
        const response = await this.request.post('/api/v2/shop/customers/token', {
            data: { email, password }
        });
        console.log(`email: ${email}, password: ${password}`)
        if (!response.ok()) {
            throw new Error(`Shop login failed ${response.status()} - ${await response.text()}`)
        }
        const body = await response.json();
        this.token = body.token;


    }
    

    async get(endpoint: string): Promise<APIResponse> {
        this.validateToken();
        return this.request.get(endpoint, {

            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
            }
        });

    }

    async post(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.post(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
                'Content-Type': 'application/ld+json',
            },
            data: data
        });
    }

    async put(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.put(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
                'Content-Type': 'application/ld+json',
            },
            data: data
        });
    }

    async patch(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.patch(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
                'Content-Type': 'application/merge-patch+json',
            },
            data: data
        });
    }

    async delete(endpoint: string): Promise<APIResponse> {
        this.validateToken();
        return this.request.delete(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
            }
        });
    }

}