// this file is used to interact with the admin API
import { APIRequestContext, APIResponse } from '@playwright/test';

export class AdminClient {
    readonly request: APIRequestContext;
    private token: string | null = null;

    constructor(request: APIRequestContext) {
        this.request = request;
    }
    // Validate that the token is set
    private validateToken() {
        if (!this.token) {
            throw new Error('Not authenticated. Please login first.');
        }
    }
    /** 
     * Authenticate with the admin API and store the token
     * script the route --> docekr compose exec php bin/console debug:router | grep "authentication"
     */
    async login() {
        const response: APIResponse = await this.request.post('/api/v2/admin/administrators/token', {
            data: {
                email: 'qa@example.com',
                password: 'sylius123',
            },
        });

        if (!response.ok()) {
            throw new Error(`Failed to login: ${response.status()} ${await response.text()}`);
        }
        const body = await response.json();
        this.token = body.token;


    }
    /**
     * Wrapper for GET requests that adds the authentication token 
     */
    async get(endpoint: string): Promise<APIResponse> {
        // Ensure token is valid before making the request
        this.validateToken();

        return this.request.get(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',

            },
        });
    }

    /**
     * Wrapper for POST requests that adds the authentication token 
     */
    async post(endpoint: string, data: object): Promise<APIResponse> {
        // Ensure token is valid before making the request
        this.validateToken();
        return this.request.post(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
                'Content-Type': 'application/ld+json',
            },
            data: data,
        });
    }
        /** Delete users created to clear the DDBB */
    async delete (endpoint:string): Promise<APIResponse> {
        this.validateToken();
        return this.request.delete(endpoint, {
            headers: {
                authorization: `Bearer ${this.token}`,
                Accept: 'application/ld+json',
                'content-Type': 'application/ld+json',

            },
        });

    }
}