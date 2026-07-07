import { GoogleGenerativeAI } from '@google/generative-ai';

const mockResponse = {
  completeness: { score: 3, reasoning: 'Mocked response for completeness.' },
  accuracy: { score: 3, reasoning: 'Mocked response for accuracy.' },
  spag: { score: 3, reasoning: 'Mocked response for SPaG.' },
};

GoogleGenerativeAI.prototype.getGenerativeModel = function getGenerativeModel() {
  return {
    generateContent: async () => ({
      response: {
        text: () => JSON.stringify(mockResponse),
      },
    }),
  };
};
