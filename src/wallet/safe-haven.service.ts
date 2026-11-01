import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import jwt from 'jsonwebtoken';

export interface SubAccountResponse {
  _id: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
}

@Injectable()
export class SafeHavenService {
  private readonly logger = new Logger(SafeHavenService.name);

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  // ─── Auth ────────────────────────────────────────────────────────────────────

  generateClientAssertion(): string {
    const rawPrivateKey = this.configService.get<string>('SAFE_HAVEN_PRIVATE_KEY');
    const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : '';

    const payload = {
      iss: this.configService.get<string>('SAFE_HAVEN_COMPANY_URL'),
      sub: this.configService.get<string>('SAFE_HAVEN_CLIENT_ID'),
      aud: this.configService.get<string>('SAFE_HAVEN_AUDIENCE'),
    };

    const sign =
      typeof (jwt as any)?.sign === 'function'
        ? (jwt as any).sign
        : (jwt as any)?.default?.sign;

    if (typeof sign !== 'function') {
      throw new Error('Unable to resolve jsonwebtoken sign function');
    }

    return sign(payload, privateKey, {
      algorithm: 'RS256',
      header: { alg: 'RS256', typ: 'JWT' },
      expiresIn: '1h',
      allowInsecureKeySizes: true,
    } as any);
  }

  async getAccessToken(): Promise<string> {
    const clientAssertion = this.generateClientAssertion();
    const baseUrl = this.configService.get<string>('SAFE_HAVEN_AUDIENCE') || 'https://api.sandbox.safehavenmfb.com';
    const clientId = this.configService.get<string>('SAFE_HAVEN_CLIENT_ID') || '';

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: clientAssertion,
      client_id: clientId,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${baseUrl}/oauth2/token`, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }),
      );
      return response.data.access_token;
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error_description ||
        error.response?.data?.message ||
        (typeof error.response?.data === 'string' ? error.response.data : 'Failed to authenticate with Safe Haven');
      this.logger.error('Safe Haven OAuth failed', errorMsg);
      throw new HttpException(errorMsg, error.response?.status || 500);
    }
  }

  // ─── Authenticated API helper ─────────────────────────────────────────────────

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    const clientId = this.configService.get<string>('SAFE_HAVEN_CLIENT_ID');
    return {
      Authorization: `Bearer ${token}`,
      ClientID: clientId ?? '',
      'Content-Type': 'application/json',
    };
  }

  private get baseUrl(): string {
    return this.configService.get<string>('SAFE_HAVEN_AUDIENCE') ?? '';
  }

  // ─── Sub-Accounts ─────────────────────────────────────────────────────────────

  /**
   * Creates a Safe Haven sub-account (virtual bank account) for a user.
   * The returned accountNumber is what the user will send money to.
   *
   * Safe Haven docs: POST /accounts/v2/subaccount
   *
   * @param params.externalReference  Your unique ID for this account (e.g. "wallet_userId_42")
   * @param params.phoneNumber        User's phone with country code e.g. "+2348012345678"
   * @param params.emailAddress       User's email
   * @param params.identityType       "BVN" | "NIN" | "vNIN" | "vID"
   * @param params.identityNumber     The BVN or NIN number
   * @param params.identityId         The _id returned from Safe Haven Identity Verification (if pre-verified)
   * @param params.callbackUrl        Optional per-account webhook URL
   */
  async createSubAccount(params: {
    externalReference: string;
    phoneNumber: string;
    emailAddress: string;
    identityType: 'BVN' | 'NIN' | 'vNIN' | 'vID';
    identityNumber?: string;
    identityId?: string;
    callbackUrl?: string;
  }): Promise<SubAccountResponse> {
    const headers = await this.authHeaders();

    const body: Record<string, any> = {
      phoneNumber: params.phoneNumber,
      emailAddress: params.emailAddress,
      externalReference: params.externalReference,
      identityType: params.identityType,
      autoSweep: false, // funds stay in the sub-account; we track balance ourselves
    };

    if (params.identityNumber) body.identityNumber = params.identityNumber;
    if (params.identityId) body.identityId = params.identityId;
    if (params.callbackUrl) body.callbackUrl = params.callbackUrl;

    this.logger.log(`Creating sub-account for reference: ${params.externalReference}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/accounts/v2/subaccount`, body, { headers }),
      );

      const data = response.data?.data ?? response.data;
      return {
        _id: data._id,
        accountNumber: data.accountNumber,
        bankName: data.bankName ?? 'Safe Haven MFB',
        accountName: data.accountName,
      };
    } catch (error: any) {
      this.logger.error('createSubAccount failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Failed to create virtual account',
        error.response?.status || 500,
      );
    }
  }

  /**
   * Fetch the current balance of a Safe Haven sub-account.
   * Safe Haven docs: GET /accounts/{id}
   */
  async getSubAccountBalance(subAccountId: string): Promise<number> {
    const headers = await this.authHeaders();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/accounts/${subAccountId}`, { headers }),
      );
      const data = response.data?.data ?? response.data;
      // Safe Haven returns balance in Naira; multiply by 100 to get kobo
      return Math.round((data.balance ?? 0) * 100);
    } catch (error: any) {
      this.logger.error('getSubAccountBalance failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Failed to fetch account balance',
        error.response?.status || 500,
      );
    }
  }

  // ─── VAS – Value Added Services ───────────────────────────────────────────────

  /**
   * Returns the list of top-level VAS services (Airtime, Data, Electricity, etc.)
   * Safe Haven docs: GET /vas/services
   */
  async getVasServices(): Promise<VasService[]> {
    const headers = await this.authHeaders();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/vas/services`, { headers }),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.logger.error('getVasServices failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Failed to fetch VAS services',
        error.response?.status || 500,
      );
    }
  }

  /**
   * Returns all network categories (e.g. MTN, Airtel, Glo, 9mobile) under a
   * given VAS service ID (the Airtime service _id from getVasServices).
   * Safe Haven docs: GET /vas/service/{id}/service-categories
   */
  async getNetworkCategories(vasServiceId: string): Promise<VasCategory[]> {
    const headers = await this.authHeaders();
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/vas/service/${vasServiceId}/service-categories`,
          { headers },
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.logger.error('getNetworkCategories failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Failed to fetch network categories',
        error.response?.status || 500,
      );
    }
  }

  /**
   * Purchases airtime for a recipient phone number, debiting a Safe Haven
   * sub-account (virtualAccountNumber).
   * Safe Haven docs: POST /vas/pay/airtime
   *
   * @param params.serviceCategoryId  Network category _id (from getNetworkCategories)
   * @param params.amount             Amount in Naira (NOT kobo)
   * @param params.debitAccountNumber The Safe Haven virtual account number to debit
   * @param params.phoneNumber        Recipient phone number (e.g. "08012345678")
   * @param params.externalReference  Your unique ref for reconciliation
   * @param params.statusUrl          Optional webhook for async status updates
   */
  async purchaseAirtime(params: {
    serviceCategoryId: string;
    amount: number;
    debitAccountNumber: string;
    phoneNumber: string;
    externalReference: string;
    statusUrl?: string;
  }): Promise<AirtimePurchaseResult> {
    const headers = await this.authHeaders();

    const body: Record<string, any> = {
      serviceCategoryId: params.serviceCategoryId,
      amount: params.amount, // Naira
      channel: 'WEB',
      debitAccountNumber: params.debitAccountNumber,
      phoneNumber: params.phoneNumber,
      externalReference: params.externalReference,
    };

    if (params.statusUrl) body.statusUrl = params.statusUrl;

    this.logger.log(
      `Purchasing ₦${params.amount} airtime for ${params.phoneNumber} ref=${params.externalReference}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/airtime`, body, { headers }),
      );
      const data = response.data?.data ?? response.data;
      return {
        reference: data.reference ?? data.externalReference ?? params.externalReference,
        status: data.status ?? 'success',
        message: data.message ?? 'Airtime purchase successful',
      };
    } catch (error: any) {
      this.logger.error('purchaseAirtime failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Airtime purchase failed',
        error.response?.status || 500,
      );
    }
  }

  /**
   * Returns all available data bundles / plans for a given network category.
   * Safe Haven docs: GET /vas/service-category/{id}/products
   *
   * @param serviceCategoryId The _id of the network category (from getNetworkCategories)
   */
  async getDataPlans(serviceCategoryId: string): Promise<VasProduct[]> {
    const headers = await this.authHeaders();
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/vas/service-category/${serviceCategoryId}/products`,
          { headers },
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.logger.error('getDataPlans failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Failed to fetch data plans',
        error.response?.status || 500,
      );
    }
  }

  /**
   * Purchases a data bundle for a recipient phone number, debiting a Safe Haven
   * sub-account (virtualAccountNumber).
   * Safe Haven docs: POST /vas/pay/data
   *
   * @param params.serviceCategoryId  Network category _id (e.g. MTN Data, Airtel Data)
   * @param params.bundleCode         The bundle plan code (from getDataPlans)
   * @param params.amount             Amount in Naira
   * @param params.debitAccountNumber The Safe Haven virtual account number to debit
   * @param params.phoneNumber        Recipient phone number (e.g. "08012345678")
   * @param params.externalReference  Your unique ref for reconciliation
   * @param params.statusUrl          Optional webhook for async status updates
   */
  async purchaseData(params: {
    serviceCategoryId: string;
    bundleCode: string;
    amount: number;
    debitAccountNumber: string;
    phoneNumber: string;
    externalReference: string;
    statusUrl?: string;
  }): Promise<DataPurchaseResult> {
    const headers = await this.authHeaders();

    const body: Record<string, any> = {
      serviceCategoryId: params.serviceCategoryId,
      bundleCode: params.bundleCode,
      amount: params.amount, // Naira
      channel: 'WEB',
      debitAccountNumber: params.debitAccountNumber,
      phoneNumber: params.phoneNumber,
      externalReference: params.externalReference,
    };

    if (params.statusUrl) body.statusUrl = params.statusUrl;

    this.logger.log(
      `Purchasing data bundle ${params.bundleCode} (₦${params.amount}) for ${params.phoneNumber} ref=${params.externalReference}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/data`, body, { headers }),
      );
      const data = response.data?.data ?? response.data;
      return {
        reference: data.reference ?? data.externalReference ?? params.externalReference,
        status: data.status ?? 'success',
        message: data.message ?? 'Data bundle purchase successful',
      };
    } catch (error: any) {
      this.logger.error('purchaseData failed', error.response?.data);
      throw new HttpException(
        error.response?.data?.message || 'Data purchase failed',
        error.response?.status || 500,
      );
    }
  }
}

// ─── VAS Types ────────────────────────────────────────────────────────────────

export interface VasService {
  _id: string;
  name: string;
  description?: string;
}

export interface VasCategory {
  _id: string;
  name: string;        // e.g. "MTN", "Airtel"
  serviceId: string;
  description?: string;
}

export interface VasProduct {
  _id: string;
  name: string;
  bundleCode: string;
  amount: number;
  validity?: string;
  description?: string;
}

export interface AirtimePurchaseResult {
  reference: string;
  status: string;
  message: string;
}

export interface DataPurchaseResult {
  reference: string;
  status: string;
  message: string;
}