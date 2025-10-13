export interface EventProcessor {
  canHandle(eventType: string): boolean;
  processEvent(event: Record<string, unknown>, eventType: string): Promise<void>;
}
