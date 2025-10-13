import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserLimitService } from './user-limit-service';
import { IUserLimitRepository } from '../repositories/user-limit-repository';
import { EventType } from '../models/events';
import { UserLimit, LimitStatus, LimitType, LimitPeriod } from '../models/user-limit';

describe('UserLimitService', () => {
  let service: UserLimitService;
  let mockRepository: IUserLimitRepository;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    service = new UserLimitService(mockRepository);
  });

  describe('processEvent - routing', () => {
    it('should route to correct handler based on eventType', async () => {
      const createEvent = {
        eventType: EventType.USER_LIMIT_CREATED,
        userId: 'user-123',
        userLimitId: 'limit-123',
        type: LimitType.DEPOSIT,
        period: LimitPeriod.DAY,
        value: '1000',
      };

      await service.processEvent(createEvent);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw error for unknown event type', async () => {
      const invalidEvent = {
        eventType: 'INVALID_EVENT' as EventType,
        userId: 'user-123',
      };

      await expect(service.processEvent(invalidEvent)).rejects.toThrow('Unknown event type');
    });
  });

  describe('handleLimitCreated', () => {
    it('should create user limit with progress=0', async () => {
      const event = {
        eventType: EventType.USER_LIMIT_CREATED,
        userId: 'user-123',
        userLimitId: 'limit-123',
        brandId: 'brand-123',
        type: LimitType.DEPOSIT,
        period: LimitPeriod.DAY,
        value: '1000',
        currencyCode: 'USD',
        status: LimitStatus.ACTIVE,
        activeFrom: 1234567890,
      };

      await service.processEvent(event);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userLimitId: 'limit-123',
          userId: 'user-123',
          progress: '0',
        })
      );
    });

    it('should set createdAt timestamp', async () => {
      const beforeTime = Date.now();

      const event = {
        eventType: EventType.USER_LIMIT_CREATED,
        userId: 'user-123',
        userLimitId: 'limit-123',
        type: LimitType.DEPOSIT,
        period: LimitPeriod.DAY,
        value: '1000',
      };

      await service.processEvent(event);

      const afterTime = Date.now();

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: expect.any(Number),
        })
      );

      const savedLimit = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedLimit.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(savedLimit.createdAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('handleProgressChanged', () => {
    const existingLimit: UserLimit = {
      userLimitId: 'limit-123',
      userId: 'user-123',
      brandId: 'brand-123',
      type: LimitType.DEPOSIT,
      period: LimitPeriod.DAY,
      value: '1000',
      currencyCode: 'USD',
      status: LimitStatus.ACTIVE,
      activeFrom: 1234567890,
      progress: '100',
      createdAt: 1234567890,
    };

    it('should update progress', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(existingLimit);

      const event = {
        eventType: EventType.USER_LIMIT_PROGRESS_CHANGED,
        userId: 'user-123',
        userLimitId: 'limit-123',
        amount: '500',
      };

      await service.processEvent(event);

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          userLimitId: 'limit-123',
          progress: '500',
        })
      );
    });
  });

  describe('handleLimitReset', () => {
    const existingLimit: UserLimit = {
      userLimitId: 'limit-123',
      userId: 'user-123',
      brandId: 'brand-123',
      type: LimitType.DEPOSIT,
      period: LimitPeriod.DAY,
      value: '1000',
      currencyCode: 'USD',
      status: LimitStatus.ACTIVE,
      activeFrom: 1234567890,
      progress: '800',
      createdAt: 1234567890,
    };

    it('should reset progress to 0', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(existingLimit);

      const event = {
        eventType: EventType.USER_LIMIT_RESET,
        userId: 'user-123',
        userLimitId: 'limit-123',
      };

      await service.processEvent(event);

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: '0',
        })
      );
    });
  });
});
