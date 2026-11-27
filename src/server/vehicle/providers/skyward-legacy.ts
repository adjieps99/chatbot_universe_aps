import type { NormalizedVehicle } from '../../../shared/vehicle-types.ts';

/**
 * Skyward Legacy Adapter Extension Point
 *
 * Preserves a clean integration boundary for private enterprise Skyward deployments
 * (Azure Cosmos DB telemetry, Azure Blob cold storage, SQL Server fleet hierarchy,
 * and HERE Maps reverse-geocoding) without bundling proprietary code or credentials
 * in the open-source KRESNA core.
 */
export interface SkywardLegacyAdapterConfig {
  cosmosEndpoint?: string;
  sqlServerConnectionString?: string;
  blobContainerUrl?: string;
  hereApiKeyConfigured?: boolean;
  tenantCode?: string;
}

export class SkywardLegacyVehicleProvider {
  private config: SkywardLegacyAdapterConfig;

  constructor(config?: SkywardLegacyAdapterConfig) {
    this.config = config || {};
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message:
        'Skyward Legacy adapter extension point is registered, but private Azure Cosmos DB / SQL Server driver bindings are not attached in this open-source build.',
    };
  }

  async listVehicles(): Promise<NormalizedVehicle[]> {
    throw new Error(
      `Skyward Legacy provider (${this.config.tenantCode || 'default'}) requires attaching your private Cosmos DB / SQL Server adapter module. See DEPLOYMENT.md for adapter wiring.`
    );
  }
}
