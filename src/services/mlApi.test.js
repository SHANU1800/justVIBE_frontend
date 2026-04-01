import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock('axios', () => {
  const axiosMock = {
    create: () => ({ request: requestMock }),
    isAxiosError: (err) => Boolean(err?.isAxiosError),
  };

  return {
    default: axiosMock,
    ...axiosMock,
  };
});

import { checkHealth } from './mlApi';

describe('mlApi smoke', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('calls health endpoint', async () => {
    requestMock.mockResolvedValueOnce({ data: { status: 'ok' } });

    const result = await checkHealth();

    expect(result).toEqual({ status: 'ok' });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/health',
        method: 'get',
      }),
    );
  });

  it('maps axios timeout into API error with status 408', async () => {
    requestMock.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNABORTED',
    });

    await expect(checkHealth()).rejects.toMatchObject({ status: 408 });
  });
});
