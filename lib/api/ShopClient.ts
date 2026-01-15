import { APIRequestContext } from '@playwright/test';
import { BaseApiClient } from './BaseApiClient';
import { shopTokenEndpoint } from '../data/testData';

/**
 * Shop API client for Sylius
 * Handles customer authentication and inherits HTTP methods from BaseApiClient
 */
export class ShopClient extends BaseApiClient {
    constructor(request: APIRequestContext) {
        super(request);
    }

    async login_token(email: string, password: string): Promise<void> {
        const response = await this.request.post(shopTokenEndpoint, {
            data: { email, password }
        });

        if (!response.ok()) {
            throw new Error(`Shop login failed: ${response.status()} - ${await response.text()}`);
        }

        const body = await response.json();
        this.token = body.token;
    }
}
