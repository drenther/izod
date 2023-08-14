import { z } from 'zod';
import type { EventMap } from '@izod/core';

export const parentOriginEvents = {
  askQuestion: z.object({
    question: z.string(),
  }),
  shout: z.object({
    message: z.string(),
  }),
} as const satisfies EventMap;

export const childOriginEvents = {
  answerQuestion: z.object({
    answer: z.string(),
  }),
  whisper: z.object({
    message: z.string(),
  }),
} as const satisfies EventMap;
