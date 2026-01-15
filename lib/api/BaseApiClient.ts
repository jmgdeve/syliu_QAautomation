import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Base API client with shared HTTP methods
 * Follows DRY principle - common functionality extracted here
 */
export abstract class BaseApiClient {
    protected readonly request: APIRequestContext;
    protected token: string | null = null;

    constructor(request: APIRequestContext) {
        this.request = request;
    }

    protected validateToken(): void {
        if (!this.token) {
            throw new Error('Not authenticated. Please login first.');
        }
    }

    protected getHeaders(includeContentType: boolean = false): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/ld+json',
        };
        if (includeContentType) {
            headers['Content-Type'] = 'application/ld+json';
        }
        return headers;
    }

    protected getPatchHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/ld+json',
            'Content-Type': 'application/merge-patch+json',
        };
    }

    async get(endpoint: string): Promise<APIResponse> {
        this.validateToken();
        return this.request.get(endpoint, {
            headers: this.getHeaders(),
        });
    }

    async post(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.post(endpoint, {
            headers: this.getHeaders(true),
            data,
        });
    }

    async put(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.put(endpoint, {
            headers: this.getHeaders(true),
            data,
        });
    }

    async patch(endpoint: string, data: object): Promise<APIResponse> {
        this.validateToken();
        return this.request.patch(endpoint, {
            headers: this.getPatchHeaders(),
            data,
        });
    }

    async delete(endpoint: string): Promise<APIResponse> {
        this.validateToken();
        return this.request.delete(endpoint, {
            headers: this.getHeaders(),
        });
    }
}
