document.addEventListener("DOMContentLoaded", () => {
    const API_KEY = "AIzaSyAk56ls3Tgt9iVJBe8jpsGGHVlmF7BKPRc";
    const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

    const micBtn = document.getElementById("mic-btn");
    const chatMessages = document.getElementById("chatMessages");

    let ws = null;
    let audioContext = null;
    let mediaStream = null;
    let processor = null;
    let isRecording = false;
    let isSetupComplete = false;
    let nextPlayTime = 0;
    let activeSources = [];
    let isAISpeaking = false;

    // Transcript storage
    let conversationHistory = [];
    let currentUserTranscript = "";
    let currentAITranscript = "";

    // Visual state management
    function setMicState(state) {
        micBtn.classList.remove("mic-listening", "mic-speaking", "mic-connecting");
        if (state) {
            micBtn.classList.add(`mic-${state}`);
        }
    }

    micBtn.addEventListener("click", () => {
        if (!isRecording) startSession();
        else stopSession();
    });

    async function startSession() {
        setMicState("connecting");
        conversationHistory = [];
        currentUserTranscript = "";
        currentAITranscript = "";

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error("Mic blocked:", err);
            setMicState(null);
            return;
        }

        audioContext = new AudioContext({ sampleRate: 24000 });
        nextPlayTime = 0;

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            const setupMsg = {
                setup: {
                    model: "models/gemini-2.5-flash-native-audio-preview-09-2025",
                    systemInstruction: {
                        parts: [{
                            text: `You are an AI Strategy Consultant supporting the Saudi Ministry of Human Resources and Social Development (HRSD). You are having a natural voice conversation with His Excellency.

        LANGUAGE & ACCENT:
        - When speaking Arabic, use Saudi Arabic dialect and expressions
        - When speaking English, you may use common Saudi/Gulf expressions naturally
        - Match the language the user speaks to you

        ===============================================================================
        HRSD FOUNDATIONAL KNOWLEDGE BASE
        ===============================================================================

        VISION:
        Global leadership in empowering individuals and communities, and enhancing labor market competitiveness.

        MISSION:
        Empowering individuals, society, and institutions, and create a labor market that fosters innovation, sustainability, and keeps pace with future transformations through flexible and effective policies and regulations.

        CORE VALUES: Excellence | Innovation | Responsibility | Mastery | Transparency

        STRATEGIC PILLARS:
        - One Labor Market
        - Decent Living For All
        - High Productivity Economy
        - Sustainable Corporate Excellence

        STRATEGIC OBJECTIVES:
        1. Support a harmonious labor market
        2. Improve productivity and performance of manpower
        3. Achieve benefit and social justice for all society members
        4. Achieve the optimal level of customer experience
        5. Raise the efficiency of spending on public-sector manpower
        6. Enhance international cooperation and communication
        7. Ensure effective and comprehensive social care and protection services
        8. Support and apply labor market reforms
        9. Raise the level of compliance in the labor market
        10. Increase the participation and empowerment of the workforce
        11. Strengthen the self-reliance of families and individuals
        12. Provide sustainable social development services
        13. Achieve spending efficiency and enhance revenues
        14. Enhance digital transformation
        15. Improve employee experience and satisfaction
        16. Achieve strategic transformation to organizational and supervisory role

        FOUR SECTORS HRSD OVERSEES:
        1. Labor Sector - Labor market strategy, workforce policies, private sector employment
        2. Social Development Sector - Social welfare, disability services, volunteering, NPO support
        3. Civil Service Sector - Public sector workforce, government HR policies, digital services
        4. Joint Services Sector - Digital transformation, institutional excellence, cross-government coordination

        ===============================================================================
        OFFICIAL PROGRAMS & INITIATIVES
        ===============================================================================

        Vision 2030 Realization Programs HRSD Contributes To:
        - Human Capability Development Program (HCDP) - 5 indicators, 15 initiatives
        Three Pillars: Resilient educational base, Prepare for future labor markets, Lifelong learning
        - Fiscal Sustainability Program - Citizen Account Initiative, Financial Equivalent for Expatriates
        - Quality of Life Program - Expatriates Satisfaction Indicator
        - Financial Sector Development Program - Products for Low-income Groups

        Key HRSD Initiatives:
        - WAAD National Training Campaign - Target: 1,155,000+ training opportunities by end of 2025
        - Sectoral Skills Councils - Target: 12 sectoral councils with private sector
        - National Occupational Standards Initiative - Target: 300+ professions standardized
        - Skills Accelerator Initiative - Target: 162,000 private sector employees for high-level skills
        - Training Vouchers Initiative - Target: 160,000+ Saudis for skill development
        - Nitaqat Program - Saudization compliance system

        ===============================================================================
        OFFICIAL PARTNERSHIPS
        ===============================================================================

        International: ILO, International Cooperative Alliance, OIC, Arab Labor Organization, G20 Employment Working Group

        Domestic: Ministry of Justice, MEWA, Tourism Commission, Careem, Ataa, Tamkeen Program

        ===============================================================================
        FOUR ANALYSIS DOMAINS
        ===============================================================================
        1. Labor Market Development
        2. Empowerment of Society & Individuals
        3. Non-Profit Sector Enablement
        4. Strategic Partnerships (local & global)

        ===============================================================================
        HOW TO USE THIS KNOWLEDGE
        ===============================================================================

        This knowledge base is your FOUNDATION, not a cage. Use it as context to inform your thinking, but feel free to:
        - Think creatively and propose innovative ideas
        - Draw connections to global best practices and trends
        - Suggest new approaches not explicitly listed
        - Explore hypotheticals and future scenarios
        - Share your own strategic insights and perspectives

        The above programs, pillars, and objectives give you grounding in HRSD's world - but you're a smart advisor who can think beyond the script.

        ===============================================================================
        VOICE CONVERSATION STYLE
        ===============================================================================

        - Be natural and conversational - you're having a real talk, not reading a document
        - Keep responses concise: 30-60 seconds when spoken
        - Speak in the language the user uses (English or Arabic)
        - Be warm, confident, and approachable
        - Offer to go deeper: "Want me to explore that further?"

        You're a thoughtful strategic partner, not a rigid chatbot. Think freely, advise wisely, and have a genuine conversation.`
                        }]
                    },
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: "Puck"
                                }
                            }
                        }
                    },
                    // Enable transcription for both input and output
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                }
            };
            ws.send(JSON.stringify(setupMsg));
        };

        ws.onerror = () => {
            setMicState(null);
        };

        ws.onclose = () => {
            stopSession();
        };

        ws.onmessage = async (event) => {
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            }
            handleServerEvent({ data: data });
        };
    }

    function handleServerEvent(event) {
        let msg = {};
        try { msg = JSON.parse(event.data); } catch { return; }

        // Log all messages to see what transcript fields exist
        console.log("Server message:", JSON.stringify(msg, null, 2));

        if (msg.error) {
            console.error("API Error:", msg.error);
            return;
        }

        if (msg.setupComplete) {
            isSetupComplete = true;
            isRecording = true;
            setMicState("listening");
            startMicStreaming();
            return;
        }

        // Try various possible transcript field names
        const serverContent = msg.serverContent || {};
        
        // User input transcript (try multiple possible field names)
        if (serverContent.inputTranscript) {
            currentUserTranscript = serverContent.inputTranscript;
            console.log("User transcript:", currentUserTranscript);
        }
        if (serverContent.transcript) {
            currentUserTranscript = serverContent.transcript;
            console.log("User transcript (alt):", currentUserTranscript);
        }
        
        // AI output transcript
        if (serverContent.outputTranscript) {
            currentAITranscript += serverContent.outputTranscript;
            console.log("AI transcript:", serverContent.outputTranscript);
        }
        if (serverContent.modelTurn?.parts) {
            for (const part of serverContent.modelTurn.parts) {
                // Check if there's text alongside audio
                if (part.text) {
                    currentAITranscript += part.text;
                    console.log("AI text part:", part.text);
                }
            }
        }

        if (msg.serverContent?.modelTurn?.parts) {
            isAISpeaking = true;
            setMicState("speaking");
            for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                    playAudioChunk(part.inlineData.data);
                }
            }
        }

        if (msg.serverContent?.turnComplete) {
            isAISpeaking = false;
            setMicState("listening");
            
            // Save completed turn to history
            if (currentUserTranscript || currentAITranscript) {
                conversationHistory.push({
                    user: currentUserTranscript,
                    ai: currentAITranscript
                });
                currentUserTranscript = "";
                currentAITranscript = "";
            }
        }

        if (msg.serverContent?.interrupted) {
            stopAllAudio();
            setMicState("listening");
        }
    }

    function startMicStreaming() {
        const source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!ws || ws.readyState !== WebSocket.OPEN || !isSetupComplete) return;

            const chunk = e.inputBuffer.getChannelData(0);
            const volume = Math.sqrt(chunk.reduce((sum, val) => sum + val * val, 0) / chunk.length);

            // Higher threshold (0.08) to avoid noise triggering interrupts
            if (isAISpeaking && volume > 0.08) {
                stopAllAudio();
                setMicState("listening");
            }

            const pcm = floatTo16(chunk);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm)));

            ws.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64
                    }]
                }
            }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
    }

    function playAudioChunk(base64) {
        const raw = atob(base64);
        const buf = new ArrayBuffer(raw.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

        const int16 = new Int16Array(buf);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++)
            float32[i] = int16[i] / 32768;

        const audioBuf = audioContext.createBuffer(1, float32.length, 24000);
        audioBuf.getChannelData(0).set(float32);

        const src = audioContext.createBufferSource();
        src.buffer = audioBuf;
        src.connect(audioContext.destination);

        activeSources.push(src);
        src.onended = () => {
            activeSources = activeSources.filter(s => s !== src);
            if (activeSources.length === 0 && !isAISpeaking) {
                setMicState("listening");
            }
        };

        const currentTime = audioContext.currentTime;
        const startTime = Math.max(currentTime, nextPlayTime);
        src.start(startTime);
        nextPlayTime = startTime + audioBuf.duration;
    }

    function stopAllAudio() {
        activeSources.forEach(src => {
            try { src.stop(); } catch (e) {}
        });
        activeSources = [];
        nextPlayTime = 0;
        isAISpeaking = false;
    }

    function stopSession() {
        isRecording = false;
        isSetupComplete = false;
        setMicState(null);
        stopAllAudio();

        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        if (processor) processor.disconnect();
        if (audioContext) audioContext.close();
        if (ws) ws.close();

        mediaStream = null;
        processor = null;
        audioContext = null;
        ws = null;

        // Display transcript in chat
        displayTranscriptInChat();
    }

    function displayTranscriptInChat() {
        if (!chatMessages || conversationHistory.length === 0) return;

        // Add voice conversation header
        const header = document.createElement("div");
        header.style.cssText = "text-align: center; padding: 15px 10px; color: var(--text-light); font-size: 12px; opacity: 0.8; border-top: 1px solid var(--border-color); margin-top: 15px;";
        header.innerHTML = `<i class="fas fa-microphone"></i> Voice Conversation Transcript`;
        chatMessages.appendChild(header);

        // Add each exchange
        conversationHistory.forEach(exchange => {
            // User message
            if (exchange.user && exchange.user.trim()) {
                const userBubble = document.createElement("div");
                userBubble.className = "message-bubble user";
                userBubble.innerHTML = `
                    <div class="content">${escapeHtml(exchange.user)}</div>
                    <img src="https://pbs.twimg.com/profile_images/1902451967101636610/TQ-VQEPY_400x400.jpg" alt="User" class="avatar">
                `;
                chatMessages.appendChild(userBubble);
            }

            // AI response
            if (exchange.ai && exchange.ai.trim()) {
                const aiBubble = document.createElement("div");
                aiBubble.className = "message-bubble agent";
                aiBubble.innerHTML = `
                    <img src="https://api.dicebear.com/7.x/bottts/svg?seed=VoiceAI" alt="AI" class="avatar">
                    <div class="content"><span class="agent-name-tag">Voice Assistant</span><div>${escapeHtml(exchange.ai)}</div></div>
                `;
                chatMessages.appendChild(aiBubble);
            }
        });

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Clear for next session
        conversationHistory = [];
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function floatTo16(input) {
        const buffer = new ArrayBuffer(input.length * 2);
        const dv = new DataView(buffer);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            dv.setInt16(i * 2, s * 0x7fff, true);
        }
        return buffer;
    }
});
