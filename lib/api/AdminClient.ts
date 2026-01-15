import { APIRequestContext } from '@playwright/test';
import { BaseApiClient } from './BaseApiClient';
import { adminCredentials } from '../data/testData';

/**
 * Admin API client for Sylius
 * Handles admin authentication and inherits HTTP methods from BaseApiClient
 */
export class AdminClient extends BaseApiClient {
    constructor(request: APIRequestContext) {
        super(request);
    }

    async login(): Promise<void> {
        const response = await this.request.post(adminCredentials.tokenEndpoint, {
            data: {
                email: adminCredentials.email,
                password: adminCredentials.password,
            },
        });

        if (!response.ok()) {
            throw new Error(`Admin login failed: ${response.status()} ${await response.text()}`);
        }
        
        const body = await response.json();
        this.token = body.token;
    }
}
