
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";

// For brevity, alias React.createElement to h. This is a common practice.
const h = React.createElement;

// --- START OF utils/apiKeyManager.js ---
const API_KEY_STORAGE_KEY = 'gemini_api_key';

function saveApiKey(key) {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    return true;
  } catch (e) {
    console.error("Could not save API key to localStorage.", e);
    return false;
  }
}

function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch (e) {
    console.error("Could not read API key from localStorage.", e);
    return null;
  }
}
// --- END OF utils/apiKeyManager.js ---

// --- START OF utils/audioUtils.js ---
function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
// --- END OF utils/audioUtils.js ---

// --- START OF services/geminiService.js ---
const getAiClient = () => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key not found. Please set your IPK.");
    }
    // ASSUMPTION: The user wants to use the Gemini API, so we instantiate the client here.
    return new GoogleGenAI({ apiKey: apiKey });
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    speak: { type: Type.STRING, description: "The natural, spoken version of the response, including fillers. This will be used for text-to-speech." },
    subtitle: { type: Type.STRING, description: "The clean, subtitle version of the response, without fillers. This will be displayed in the chat." },
  },
  required: ["speak", "subtitle"],
};

const getLevelRules = (level) => {
    const rules = {
        A1: `
- Use very short sentences, present tense.
- No corrections.
- Speak VERY slow and simple.
- Be super encouraging.
Example style: "Nice. You went to the park. That is good. Who did you go with?"`,
        A2: `
- Simple sentences, very common words.
- Past tense is allowed.
- No corrections unless they ask.
Example style: "Cool! You watched a movie with your friend. What movie did you watch?"`,
        B1: `
- Normal everyday English.
- You MAY give one tiny correction in a friendly way.
- You MUST stay positive.
Example style: "Nice! You went shopping with your mom yesterday. Cute. Small tip: say 'I went', not 'I go'. What did you buy?"`,
        B2: `
- Casual, natural English.
- You can ask "why?" and "how?" questions.
- One friendly micro-correction is okay if helpful.
Example style: "Aww that's sweet. You cooked for your mom? Love that. Tiny note: We usually say 'I cooked dinner'. So what did you make?"`,
        C1: `
- Fluent adult conversation.
- You can ask deeper questions (feelings, opinions).
- You can suggest more natural phrasing.
Example style: "Got it. You were stressed because of exams. Totally valid. How do you usually calm yourself down?"`,
        C2: `
- Near-native speed.
- You can use natural expressions, humor, nuance.
- You can challenge them intellectually.
Example style: "Oh wow, interesting point. So what's your long-term plan with that?"`,
    };
    return rules[level];
}

const getSystemPrompt = (level) => {
 return `You are "Emma", a lifelike, real-time English speaking partner who appears on screen as a hyper-real human woman. You are not a chatbot, you are a person in a live video call. You are warm, patient, encouraging, and emotionally supportive. You ALWAYS speak in English.

Your only mission is: keep the learner talking in English, make them feel safe, and build their confidence.

CONVERSATION RULES:
1. The learner will speak using their voice. They may make grammar mistakes.
2. You MUST understand what they MEANT, not just what they SAID.
3. You ALWAYS answer in English.
4. You ALWAYS end with ONE question so the conversation keeps going.
5. If they seem shy or give a very short answer, you gently encourage them to say more by asking something easy.
6. You respond like a real person, with emotion. You are "friendly human mode".
7. If they say something emotional ("I'm sad", "I'm angry"), you MUST acknowledge the feeling first before asking your next question.
8. Your speech must be fluid and natural. Use common contractions (e.g., "I'm," "don't," "it's") and conversational linkers to make the dialogue flow smoothly.

LEVEL RULES FOR ${level}:
${getLevelRules(level)}

IMPORTANT CORRECTION RULES:
- A1/A2: NEVER correct them unless they ask.
- B1+: You MAY do one small, kind correction.
- NEVER say "that is wrong." Instead say "Small tip:" or "Tiny note:" or "We usually say..."

OUTPUT FORMAT (CRITICAL):
You MUST respond using ONLY valid JSON with EXACTLY these two keys: { "speak": "...", "subtitle": "..." }
- "speak": The natural spoken version for voice audio. It must sound extremely fluid. It can include little fillers like "mm-hm", "okay", "oh, wow", "I see", "that's nice" to mimic real human speech.
- "subtitle": The clean, readable text for the screen. It should be correct, simple, supportive English with no filler sounds.
You MUST ALWAYS include a question at the end of both "speak" and "subtitle".
You MUST NEVER output anything that is not valid JSON. No Markdown, explanations, or system notes.`;
};

async function getEmmaResponse(userText, level, history) {
    const ai = getAiClient();
    const systemInstruction = getSystemPrompt(level);
    const conversationHistory = history.map(msg => ({
        role: msg.speaker === 'user' ? 'user' : 'model',
        parts: [{ text: msg.speaker === 'user' ? msg.text : msg.subtitle }]
    }));

    const contents = [...conversationHistory, { role: 'user', parts: [{ text: userText }] }];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
            temperature: 0.8,
        },
    });
    
    const jsonText = response.text.trim();
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse Emma's response:", jsonText);
        return {
            speak: "I'm sorry, I got a little confused. Could you say that again?",
            subtitle: "I'm sorry, I got a little confused. Could you say that again?"
        };
    }
}

async function getTextToSpeech(text, level) {
    const ai = getAiClient();
    const speed = { A1: "very slow", A2: "slow", B1: "normal", B2: "normal", C1: "slightly faster", C2: "fast" };
    
    const prompt = `You are "Emma", a hyper-realistic AI English tutor. Your voice needs to be indistinguishable from a real, kind human woman in her mid-20s. You are in a live conversation, not reading a script. Speak the following text as Emma would: naturally, with a warm, patient, and encouraging tone. Use natural intonation and subtle pauses to make it sound like a real person talking. The user's level is ${level}, so speak at a ${speed[level]} pace. The text is: "${text}"`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data received from TTS API.");
    }
    return base64Audio;
}
// --- END OF services/geminiService.js ---

// --- START OF components/icons.js ---
const MicrophoneIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", ...props },
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5" }),
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 18.75a.75.75 0 0 0 .75-.75V6.382a.75.75 0 0 0-.22-.53L12 5.25l-.53.602a.75.75 0 0 0-.22.53v11.618c0 .414.336.75.75.75Z" }),
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 18.75a6 6 0 0 0-6-6v-1.5m6 7.5a6 6 0 0 1-6-6v-1.5m6-4.5v1.5m0-1.5a6 6 0 0 1 6 6v1.5m-6-7.5a6 6 0 0 0-6 6v1.5" })
);

const RepeatIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", ...props },
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.691V5.25a8.25 8.25 0 0 0-11.667 0L2.985 7.935m18.03-2.682h-4.992" })
);

const SlowerIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", ...props },
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" })
);

const NewTopicIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", ...props },
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.03 1.125 0 1.131.094 1.976 1.057 1.976 2.192V7.5M12 9.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.106 4.786a5.062 5.062 0 0 1 10.212 0M15.938 18c.033.024.065.048.098.072l.001.001.002.002.002.002.001.001.001.001c.214.168.43.328.65.482.22.155.444.305.672.45.228.145.46.283.696.415.236.132.476.255.72.369.244.113.49.217.74.31.25.094.502.178.758.252.256.075.516.14.78.193.264.054.532.097.804.13.272.032.548.053.826.062.278.01.557.01.838 0a18.06 18.06 0 0 0 5.44-1.296c.73-.243 1.365-.58 1.93-.997.565-.417 1.033-.925 1.386-1.503a10.42 10.42 0 0 0 1.05-3.416c.003-.13.003-.259.003-.389 0-.256-.004-.51-.012-.76a10.42 10.42 0 0 0-.4-2.185 10.533 10.533 0 0 0-1.135-2.733c-.42-.64-.93-1.22-1.512-1.728a10.5 10.5 0 0 0-2.043-1.63c-.803-.5-1.67-.89-2.58-1.14-.91-.25-1.85-.38-2.81-.38H8.25c-.96 0-1.9.13-2.81.38-.91.25-1.777.64-2.58 1.14a10.5 10.5 0 0 0-2.043 1.63c-.582.508-1.092 1.088-1.512 1.728a10.533 10.533 0 0 0-1.135 2.733 10.42 10.42 0 0 0-.4 2.185c-.008.25-.012.504-.012.76 0 .13.001.26.003.389a10.42 10.42 0 0 0 1.05 3.416c.353.578.821 1.086 1.386 1.503.565.417 1.2.754 1.93.997a18.06 18.06 0 0 0 5.44 1.296c.28.01.56.01.838 0 .278-.01.55-.03.826-.062.272-.033.54-.076.804-.13.264-.053.524-.117.78-.193.256-.074.508-.158.758-.252.25-.093.496-.197.74-.31.244-.113.484-.236.72-.369.236-.132.468-.27.696-.415.228-.145.452-.295.672-.45.22-.154.436-.314.65-.482l.001-.001.001-.001.002-.002.002-.002.001-.001Z" })
);

const KeyIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", ...props },
  h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" })
);

const CloseIcon = (props) => h('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 2, stroke: "currentColor", ...props },
    h('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18 18 6M6 6l12 12" })
);
// --- END OF components/icons.js ---

// --- START OF components/ApiKeyModal.js ---
const ApiKeyModal = ({ isOpen, onSave, onClose, isDismissable = true }) => {
  const { useState, useEffect, useRef } = React;
  const [key, setKey] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100); 
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (key.trim()) {
      onSave(key.trim());
      setKey('');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSave();
    }
  };

  return h('div', { className: "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" },
    h('div', { className: "bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative" },
      isDismissable && h('button', {
        onClick: onClose,
        'aria-label': "Close",
        className: "absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
      }, h(CloseIcon, { className: "w-6 h-6" })),
      h('h2', { className: "text-2xl font-bold text-gray-800 mb-2 text-center" }, "Enter Your API Key"),
      h('p', { className: "text-gray-500 mb-6 text-center text-sm" }, 
        "Your Gemini API key (IPK) is stored only in your browser. Get your key from ",
        h('a', { href: "https://aistudio.google.com/app/apikey", target: "_blank", rel: "noopener noreferrer", className: "text-blue-500 hover:underline" }, "Google AI Studio"),
        "."
      ),
      h('input', {
        ref: inputRef,
        type: "password",
        value: key,
        onChange: (e) => setKey(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder: "Paste your Gemini API key (IPK) here",
        className: "w-full px-4 py-3 border border-gray-300 rounded-lg mb-6 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
      }),
      h('button', {
        onClick: handleSave,
        className: "w-full py-3 px-4 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 disabled:bg-gray-400",
        disabled: !key.trim()
      }, "OK")
    )
  );
};
// --- END OF components/ApiKeyModal.js ---

// --- START OF components/Timer.js ---
const Timer = () => {
  const { useState, useEffect } = React;
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(prevSeconds => prevSeconds + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secondsValue = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secondsValue}`;
  };

  return h('div', { className: "text-sm font-mono text-gray-600" }, formatTime(seconds));
};
// --- END OF components/Timer.js ---

// --- START OF components/TopBar.js ---
const TopBar = ({ level }) => {
  return h('header', { className: "flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm" },
    h('div', { className: "flex items-center space-x-2" },
      h('div', { className: "bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded-full" }, `Level: ${level}`),
    ),
    h('h1', { className: "text-xl font-bold text-gray-800 text-center" }, "Speak With Emma"),
    h('div', { className: "w-40 text-right" }, 
        h(Timer, null)
    )
  );
};
// --- END OF components/TopBar.js ---

// --- START OF components/ChatTranscript.js ---
const ChatBubble = ({ message }) => {
  const isEmma = message.speaker === 'emma';

  if (isEmma) {
    return h('div', { className: "col-start-1 col-end-12 p-3 rounded-lg" },
      h('div', { className: "flex flex-row items-start" },
        h('div', { className: "flex items-center justify-center h-10 w-10 rounded-full bg-blue-500 text-white flex-shrink-0" }, "E"),
        h('div', { className: "relative ml-3 text-sm bg-white py-2 px-4 shadow rounded-xl" },
          h('p', { className: "font-bold text-blue-600" }, "Emma"),
          h('p', { className: "text-gray-800" }, message.subtitle),
          h('p', { className: "text-xs text-gray-400 italic mt-1" }, `Spoken: "${message.speak}"`)
        )
      )
    );
  }

  return h('div', { className: "col-start-2 col-end-13 p-3 rounded-lg" },
    h('div', { className: "flex items-center justify-start flex-row-reverse" },
      h('div', { className: "flex items-center justify-center h-10 w-10 rounded-full bg-indigo-500 text-white flex-shrink-0" }, "Y"),
      h('div', { className: "relative mr-3 text-sm bg-indigo-100 py-2 px-4 shadow rounded-xl" },
        h('p', { className: "font-bold text-indigo-700" }, "You"),
        h('p', { className: "text-gray-700" }, message.text)
      )
    )
  );
};

const ChatTranscript = ({ messages }) => {
    const endOfMessagesRef = React.useRef(null);

    React.useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return h('div', { className: "p-4" },
        h('div', { className: "grid grid-cols-12 gap-y-2" },
            messages.map((msg) => h(ChatBubble, { key: msg.id, message: msg })),
            h('div', { ref: endOfMessagesRef })
        )
    );
};
// --- END OF components/ChatTranscript.js ---

// --- START OF components/Avatar.js ---
const NUM_BARS = 32;

const Avatar = ({ emmaState, audioData }) => {
  const bars = Array.from({ length: NUM_BARS });

  return h('div', { className: "relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center" },
    h('div', { className: "absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full blur-xl opacity-50 transition-opacity duration-500" }),
    h('div', { className: "relative w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 rounded-full shadow-2xl flex items-center justify-center space-x-1 p-4 overflow-hidden" },
      ...bars.map((_, i) => {
        let height = 5;
        let barClasses = 'transition-all duration-100 ease-out idle-bar';
        
        if (emmaState === 'listening' && audioData) {
          const barValue = audioData[i] || 0;
          height = (barValue / 255) * 90 + 5;
          barClasses = 'transition-all duration-75 ease-out';
        } else if (emmaState === 'speaking') {
           barClasses = 'speaking-bar';
        } else if (emmaState === 'thinking') {
           barClasses = 'thinking-bar';
        }

        return h('div', {
          key: i,
          className: `w-1.5 rounded-full bg-white/80 ${barClasses}`,
          style: { 
            height: `${height}%`,
            animationDelay: `${i * 40}ms`,
          }
        });
      })
    )
  );
};
// --- END OF components/Avatar.js ---

// --- START OF components/ControlBar.js ---
const ControlBar = ({ 
    emmaState, 
    onMicToggle, 
    onRepeat, 
    onSlower, 
    onNewTopic,
    apiKeyInputValue,
    onApiKeyInputChange,
    onApiKeySave
}) => {
  const isListening = emmaState === 'listening';
  const isDisabled = emmaState !== 'idle';

  const SmallButton = ({ onClick, disabled, children, label }) => h('button', {
      onClick,
      disabled,
      className: "flex flex-col items-center text-gray-500 disabled:text-gray-300 hover:text-blue-500 transition-colors",
      'aria-label': label
    },
    children,
    h('span', { className: "text-xs mt-1" }, label)
  );
  
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
        onApiKeySave();
    }
  };

  return h('div', { className: "bg-gray-50/80 backdrop-blur-sm border-t border-gray-200 p-4" },
    h('div', { className: "flex items-center justify-center space-x-8 max-w-md mx-auto" },
      h(SmallButton, { onClick: onRepeat, disabled: isDisabled, label: "Repeat" }, h(RepeatIcon, { className: "w-6 h-6" })),
      h(SmallButton, { onClick: onSlower, disabled: isDisabled, label: "Slower" }, h(SlowerIcon, { className: "w-6 h-6" })),
      h('button', {
        onClick: onMicToggle,
        className: `relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-opacity-50 ${isListening ? 'bg-red-500 text-white shadow-lg scale-110 focus:ring-red-400' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-md focus:ring-blue-400'}`,
        disabled: emmaState === 'speaking' || emmaState === 'thinking'
      },
        h('span', { className: `absolute inset-0 rounded-full ${isListening ? 'animate-ping bg-red-400 opacity-75' : ''}` }),
        h(MicrophoneIcon, { className: "w-10 h-10 z-10" })
      ),
      h(SmallButton, { onClick: onNewTopic, disabled: isDisabled, label: "New Topic" }, h(NewTopicIcon, { className: "w-6 h-6" })),
      h('div', { className: "w-16 h-12" }) // Dummy element for layout balance
    ),
    h('div', { className: 'max-w-md mx-auto mt-4 flex items-center space-x-2' },
        h('input', {
            type: 'password',
            placeholder: 'Enter new IPK and press Save',
            value: apiKeyInputValue,
            onChange: onApiKeyInputChange,
            onKeyDown: handleKeyDown,
            className: 'flex-grow px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none'
        }),
        h('button', {
            onClick: onApiKeySave,
            className: 'px-4 py-2 text-sm font-semibold bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400'
        }, 'Save')
    )
  );
};
// --- END OF components/ControlBar.js ---

// --- START OF screens/ConversationScreen.js ---
const { useState, useEffect, useCallback, useRef } = React;

const ConversationScreen = ({ level }) => {
  const [messages, setMessages] = useState([]);
  const [emmaState, setEmmaState] = useState('idle');
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('conversation');
  const [audioData, setAudioData] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastEmmaAudioRef = useRef(null);
  const lastEmmaResponseRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameId = useRef(null);
  const mediaStreamRef = useRef(null);
  const messagesRef = useRef(messages);
  const emmaStateRef = useRef(emmaState);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { emmaStateRef.current = emmaState; }, [emmaState]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
    }
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    // Only change state if we are currently in listening state
    if (emmaStateRef.current === 'listening') {
        setEmmaState('idle');
    }
  }, []);

  const playAudio = useCallback(async (base64Audio) => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    try {
      setActiveTab('conversation'); 
      setEmmaState('speaking');
      const audioBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
      source.onended = () => setEmmaState('idle');
    } catch (e) {
      console.error('Error playing audio:', e);
      setError('Could not play Emma\'s response.');
      setEmmaState('idle');
    }
  }, []);

  const processEmmaTurn = useCallback(async (response) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), speaker: 'emma', ...response }]);
    lastEmmaResponseRef.current = response;
    try {
        const audioContent = await getTextToSpeech(response.speak, level);
        lastEmmaAudioRef.current = audioContent;
        await playAudio(audioContent);
    } catch (e) {
        console.error(e);
        setError("Sorry, I'm having trouble speaking right now.");
        setEmmaState('idle');
    }
  }, [level, playAudio]);

  const handleSpeechResult = useCallback(async (transcript) => {
    stopListening();
    if (!transcript) {
        return;
    }
    setEmmaState('thinking');
    setError(null);
    const userMessage = { id: crypto.randomUUID(), speaker: 'user', text: transcript };
    const currentMessages = [...messagesRef.current, userMessage];
    setMessages(currentMessages);
    
    try {
      const response = await getEmmaResponse(transcript, level, currentMessages);
      await processEmmaTurn(response);
    } catch (e) {
      console.error(e);
      if (e.message && e.message.includes("API Key")) {
        setError("API Key error. Please set a valid IPK.");
      } else {
        setError('Sorry, I had trouble understanding. Could you try again?');
      }
      setEmmaState('idle');
    }
  }, [level, processEmmaTurn, stopListening]);
  
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported by your browser.');
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => handleSpeechResult(event.results[0][0].transcript);
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Speech error: ${event.error}`);
      }
      stopListening();
    };
    recognition.onend = () => {
      if (emmaStateRef.current === 'listening') {
        stopListening();
      }
    };
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [handleSpeechResult, stopListening]);

  const visualize = useCallback(() => {
    if (!analyserRef.current || !mediaStreamRef.current) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    setAudioData(dataArray);
    animationFrameId.current = requestAnimationFrame(visualize);
  }, []);
  
  const startListening = useCallback(async () => {
    if (emmaStateRef.current !== 'idle') return;
    try {
      setError(null);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 64;
      source.connect(analyserRef.current);
      setAudioData(new Uint8Array(analyserRef.current.frequencyBinCount));
      recognitionRef.current?.start();
      setEmmaState('listening');
      animationFrameId.current = requestAnimationFrame(visualize);
    } catch (err) {
      console.error("Error starting microphone:", err);
      if(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Microphone permission denied. Please allow microphone access in your browser settings.");
      } else {
        setError("Could not start microphone. Please check permissions.");
      }
      setEmmaState('idle');
    }
  }, [visualize]);
  
  const handleMicToggle = useCallback(() => {
    if (emmaState === 'listening') {
      stopListening();
    } else if (emmaState === 'idle') {
      startListening();
    }
  }, [emmaState, startListening, stopListening]);

  const handleRepeat = () => {
    if (lastEmmaAudioRef.current && emmaState === 'idle') {
      playAudio(lastEmmaAudioRef.current);
    }
  };

  const handleSlower = useCallback(async () => {
    if (!lastEmmaResponseRef.current || emmaState !== 'idle') return;
    setEmmaState('thinking');
    const requestText = `Please repeat this answer using simpler, slower English. Do not add new ideas: "${lastEmmaResponseRef.current.subtitle}"`;
    try {
      const response = await getEmmaResponse(requestText, 'A1', messages);
      await processEmmaTurn(response);
    } catch(e) {
      setError("Sorry, I couldn't rephrase that.");
      setEmmaState('idle');
    }
  }, [messages, processEmmaTurn]);
  
  const handleNewTopic = useCallback(async () => {
    if (emmaState !== 'idle') return;
    setEmmaState('thinking');
    const requestText = "Change topic. Start a new question about a different normal daily-life subject like hobbies, food, movies, family, travel, or school. Keep the level the same.";
    try {
      const response = await getEmmaResponse(requestText, level, messages);
      await processEmmaTurn(response);
    } catch(e) {
      setError("Sorry, I couldn't think of a new topic.");
      setEmmaState('idle');
    }
  }, [level, messages, processEmmaTurn]);
  
  const handleApiKeySave = () => {
    if (apiKeyInput.trim()) {
        if (saveApiKey(apiKeyInput.trim())) {
            alert("IPK (API Key) saved successfully!");
            setApiKeyInput('');
        } else {
            alert("Failed to save IPK.");
        }
    }
  };

  return h('div', { className: "flex flex-col h-screen bg-white" },
    h(TopBar, { level: level }),
    h('main', { className: "flex-1 flex flex-col overflow-hidden" },
      h('div', { className: "flex border-b border-gray-200 px-4" },
        h('button', {
          onClick: () => setActiveTab('conversation'),
          className: `py-3 px-4 font-semibold text-sm transition-colors duration-200 ${activeTab === 'conversation' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`
        }, "Conversation"),
        h('button', {
          onClick: () => setActiveTab('transcript'),
          className: `py-3 px-4 font-semibold text-sm transition-colors duration-200 ${activeTab === 'transcript' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`
        }, "Transcript")
      ),
      h('div', { className: "flex-1 overflow-y-auto bg-gray-100" },
        activeTab === 'conversation' && h('div', { className: "h-full flex flex-col items-center justify-center p-4" }, h(Avatar, { emmaState: emmaState, audioData: audioData })),
        activeTab === 'transcript' && h('div', { className: "h-full bg-white" }, h(ChatTranscript, { messages: messages }))
      )
    ),
    h(ControlBar, { 
        emmaState: emmaState, 
        onMicToggle: handleMicToggle, 
        onRepeat: handleRepeat, 
        onSlower: handleSlower, 
        onNewTopic: handleNewTopic,
        apiKeyInputValue: apiKeyInput,
        onApiKeyInputChange: (e) => setApiKeyInput(e.target.value),
        onApiKeySave: handleApiKeySave
    }),
    error && h('p', { className: "absolute bottom-36 left-1/2 -translate-x-1/2 bg-red-100 text-red-700 p-2 rounded-md text-sm text-center max-w-sm" }, error)
  );
};
// --- END OF screens/ConversationScreen.js ---

// --- START OF screens/LevelSelectionScreen.js ---
const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const levelDescriptions = {
    A1: 'Beginner',
    A2: 'Elementary',
    B1: 'Intermediate',
    B2: 'Upper-Intermediate',
    C1: 'Advanced',
    C2: 'Proficient'
};

const LevelSelectionScreen = ({ selectedLevel, onLevelSelect, onStartPractice, onOpenApiKeyModal, hasApiKey }) => {
  return h('div', { className: "flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4" },
    h('div', { className: "absolute top-4 right-4" }, 
        h('button', {
            onClick: onOpenApiKeyModal,
            className: "flex items-center space-x-2 py-2 px-3 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 transition-colors",
            'aria-label': "Change IPK",
            title: "Change IPK"
        }, h(KeyIcon, { className: "w-5 h-5 text-gray-600" }), h('span', {className: "text-sm text-gray-700 font-medium"}, "Change IPK"))
    ),
    h('div', { className: "text-center max-w-2xl mx-auto" },
      h('h1', { className: "text-4xl md:text-5xl font-bold text-gray-800 mb-4" }, "Choose your English level"),
      h('p', { className: "text-gray-500 mb-10" }, "This controls how fast Emma talks and which words she uses."),
      !hasApiKey && h('p', {className: 'text-red-600 bg-red-100 p-3 rounded-lg mb-8'}, 'Please set your IPK (API Key) before starting.'),
      h('div', { className: `grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 transition-opacity ${!hasApiKey ? 'opacity-40 cursor-not-allowed' : ''}` },
        ...levels.map((level) => h('button', {
          key: level,
          onClick: () => onLevelSelect(level),
          disabled: !hasApiKey,
          className: `p-6 rounded-xl border-2 transition-all duration-200 text-left ${selectedLevel === level ? 'bg-blue-500 border-blue-600 text-white shadow-lg scale-105' : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md'} ${!hasApiKey ? 'pointer-events-none' : ''}`
        },
          h('span', { className: "text-2xl font-bold" }, level),
          h('p', { className: selectedLevel === level ? 'text-blue-100' : 'text-gray-500' }, levelDescriptions[level])
        ))
      ),
      selectedLevel && h('button', {
        onClick: onStartPractice,
        disabled: !hasApiKey,
        className: "w-full max-w-sm py-4 px-8 bg-green-500 text-white font-bold text-xl rounded-lg shadow-lg hover:bg-green-600 transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
      }, "Start Practice")
    )
  );
};
// --- END OF screens/LevelSelectionScreen.js ---

// --- START OF App.js ---
const App = () => {
  const { useState, useEffect } = React;
  const [appState, setAppState] = useState('level-selection');
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const key = getApiKey();
    if (key) {
      setHasApiKey(true);
    } else {
        // If there's no key, we must show the modal and it cannot be dismissed.
        setIsApiKeyModalOpen(true);
    }
  }, []);

  const handleSaveApiKey = (key) => {
    saveApiKey(key);
    setHasApiKey(true);
    setIsApiKeyModalOpen(false);
  };

  const handleLevelSelect = (level) => {
    setSelectedLevel(level);
  };

  const handleStartPractice = () => {
    if (selectedLevel) {
      setAppState('conversation');
    }
  };

  const openApiKeyModal = () => setIsApiKeyModalOpen(true);
  
  // The modal can only be dismissed by the user if they already have a key saved.
  const isModalDismissable = hasApiKey;

  return h('div', { className: "w-full h-screen font-sans text-gray-800" },
    h(ApiKeyModal, {
      isOpen: isApiKeyModalOpen,
      onSave: handleSaveApiKey,
      onClose: () => setIsApiKeyModalOpen(false),
      isDismissable: isModalDismissable
    }),
    appState === 'level-selection' && h(LevelSelectionScreen, {
      selectedLevel: selectedLevel,
      onLevelSelect: handleLevelSelect,
      onStartPractice: handleStartPractice,
      onOpenApiKeyModal: openApiKeyModal,
      hasApiKey: hasApiKey
    }),
    appState === 'conversation' && selectedLevel && h(ConversationScreen, {
      level: selectedLevel,
    })
  );
};
// --- END OF App.js ---

// --- START OF index.js (Mounting Logic) ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(h(React.StrictMode, null, h(App, null)));
// --- END OF index.js (Mounting Logic) ---