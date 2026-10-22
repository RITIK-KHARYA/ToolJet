import { DataSourcesUtilService } from '../../../../src/modules/data-sources/util.service';

function serviceWith(pluginService: object): DataSourcesUtilService {
  return new DataSourcesUtilService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { getService: jest.fn().mockResolvedValue(pluginService) } as any,
    {} as any,
    {} as any
  );
}

describe('DataSourcesUtilService.testConnection', () => {
  const input = { kind: 'plugin', options: {}, environment_id: 'environment' } as any;

  it('marks a missing plugin connection test as structurally unsupported', async () => {
    await expect(serviceWith({}).testConnection(input, 'organization')).resolves.toMatchObject({
      status: 'failed',
      category: 'unsupported',
      supported: false,
    });
  });

  it('does not mark an actual plugin failure as unsupported', async () => {
    const testConnection = jest.fn().mockRejectedValue(new Error('connection refused'));
    const result = await serviceWith({ testConnection }).testConnection(input, 'organization');

    expect(result).toMatchObject({ status: 'failed', message: expect.stringContaining('connection refused') });
    expect(result).not.toHaveProperty('category');
  });
});

function serviceResolvingConstants(resolvedValues: Record<string, string>): DataSourcesUtilService {
  const encryptionService = {
    decryptColumnValue: jest
      .fn()
      .mockImplementation(async (_table: string, _organizationId: string, value: string) => resolvedValues[value]),
  };
  const organizationConstantsUtilService = {
    getOrgEnvironmentConstant: jest
      .fn()
      .mockImplementation(async (key: string) => (key in resolvedValues ? { value: key } : null)),
  };

  return new DataSourcesUtilService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    encryptionService as any,
    {} as any,
    organizationConstantsUtilService as any,
    {} as any,
    {} as any,
    {} as any
  );
}

describe('DataSourcesUtilService.resolveConstants', () => {
  it.each([['ab$$cd'], ['p$&q'], ['a$`b'], ["a$'b"], ['plain-value']])(
    'inserts the decrypted value literally: %s',
    async (value) => {
      const service = serviceResolvingConstants({ DB_PASS: value });

      await expect(service.resolveConstants('{{secrets.DB_PASS}}', 'org-id', 'env-id')).resolves.toBe(value);
    }
  );

  it('inserts the decrypted value literally when embedded in other text', async () => {
    const service = serviceResolvingConstants({ DB_PASS: 'ab$$cd' });

    await expect(
      service.resolveConstants('postgres://user:{{secrets.DB_PASS}}@localhost:5432/db', 'org-id', 'env-id')
    ).resolves.toBe('postgres://user:ab$$cd@localhost:5432/db');
  });

  it('resolves every occurrence of the same placeholder', async () => {
    const service = serviceResolvingConstants({ DB_PASS: 'p$&q' });

    await expect(
      service.resolveConstants('{{secrets.DB_PASS}} and {{secrets.DB_PASS}}', 'org-id', 'env-id')
    ).resolves.toBe('p$&q and p$&q');
  });

  it('resolves multiple different placeholders with literal values', async () => {
    const service = serviceResolvingConstants({ DB_PASS: 'ab$$cd', API_KEY: 'p$&q' });

    await expect(
      service.resolveConstants('user={{secrets.DB_PASS}}&key={{constants.API_KEY}}', 'org-id', 'env-id')
    ).resolves.toBe('user=ab$$cd&key=p$&q');
  });

  it('leaves an unresolved placeholder untouched', async () => {
    const service = serviceResolvingConstants({});

    await expect(service.resolveConstants('{{secrets.MISSING}}', 'org-id', 'env-id')).resolves.toBe(
      '{{secrets.MISSING}}'
    );
  });

  it('returns the input unchanged when it has no placeholders', async () => {
    const service = serviceResolvingConstants({ DB_PASS: 'unused' });

    await expect(service.resolveConstants('plain text', 'org-id', 'env-id')).resolves.toBe('plain text');
  });
});
