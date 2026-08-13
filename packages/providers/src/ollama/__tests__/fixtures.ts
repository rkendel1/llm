export const mockOllamaResponse = {
  response: "Hello, how can I help you?",
  done: false,
};

export const mockOllamaStreamChunks = [
  { response: "Hello, ", done: false },
  { response: "how can I ", done: false },
  { response: "help you?", done: true },
];

export const mockOpenAIResponse = {
  id: "chatcmpl-123",
  object: "chat.completion",
  created: 1234567890,
  model: "gpt-3.5-turbo",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Hello, how can I help you?",
        tool_calls: [],
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};

export const mockOpenAIStreamChunks = [
  {
    id: "chatcmpl-123",
    object: "chat.completion.chunk",
    created: 1234567890,
    model: "gpt-3.5-turbo",
    choices: [
      {
        index: 0,
        delta: { content: "Hello" },
        finish_reason: null,
      },
    ],
  },
  {
    id: "chatcmpl-123",
    object: "chat.completion.chunk",
    created: 1234567890,
    model: "gpt-3.5-turbo",
    choices: [
      {
        index: 0,
        delta: { content: ", how are you?" },
        finish_reason: "stop",
      },
    ],
  },
];

export const mockAnthropicResponse = {
  id: "msg-123",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: "Hello, how can I help you?",
    },
  ],
  model: "claude-3-sonnet",
  stop_reason: "end_turn",
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
};

export const mockAnthropicStreamChunks = [
  {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "text",
      text: "",
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "Hello, ",
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "how are you?",
    },
  },
  {
    type: "message_stop",
  },
];

export const mockGoogleResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: "Hello, how can I help you?",
          },
        ],
        role: "model",
      },
      finishReason: "STOP",
      safetyRatings: [],
    },
  ],
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 20,
    totalTokenCount: 30,
  },
};

export const mockGoogleStreamChunks = [
  {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "Hello, ",
            },
          ],
          role: "model",
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "how are you?",
            },
          ],
          role: "model",
        },
      },
    ],
  },
];
