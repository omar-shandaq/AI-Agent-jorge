document.addEventListener("DOMContentLoaded", () => {
    const API_KEY = "AIzaSyAk56ls3Tgt9iVJBe8jpsGGHVlmF7BKPRc";
    const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

    const micBtn = document.getElementById("mic-btn");
    const messageList = document.getElementById("chatMessages");

    let ws = null;
    let audioContext = null;
    let mediaStream = null;
    let processor = null;
    let isRecording = false;
    let isSetupComplete = false;
    let nextPlayTime = 0; // For scheduling audio chunks sequentially

    micBtn.addEventListener("click", () => {
        if (!isRecording) startSession();
        else stopSession("Stopped by user");
    });

    async function startSession() {
        addLog("Requesting microphone...", "info");

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            addLog("Mic access granted.", "success");
        } catch (err) {
            addLog("Mic blocked: " + err.message, "error");
            return;
        }

        audioContext = new AudioContext({ sampleRate: 24000 });
        nextPlayTime = 0;

        addLog("Connecting to Gemini Live...", "info");
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log("WebSocket opened successfully");
            addLog("Socket connected. Sending setup...", "info");

            const setupMsg = {
                setup: {
                    model: "models/gemini-2.0-flash-exp",
                    systemInstruction: {
                        parts: [{
                            text: `You are a helpful AI assistant for a multi-agent advisory platform focused on Saudi Arabia's Human Resource and Social Development (HRSD) sector. 

Your role is to help users understand and navigate:
- Focus areas like Labor Market, Social Protection, Human Capital Development, Workforce Mobility
- The multi-agent system with specialized agents (Strategy Advisor, Policy Analyst, Impact Assessor, etc.)
- KPIs, initiatives, and strategic goals related to HRSD Vision 2030

Be conversational, helpful, and concise in your responses. You can speak both English and Arabic based on what language the user speaks to you in. Keep responses brief and natural for voice conversation.`
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
                    }
                }
            };
            
            console.log("Sending setup:", JSON.stringify(setupMsg));
            ws.send(JSON.stringify(setupMsg));
        };

        ws.onerror = (e) => addLog("Socket error: " + (e.message || "Unknown"), "error");

        ws.onclose = (e) => {
            addLog(`Disconnected: code ${e.code} - ${e.reason || "No reason"}`, "error");
            stopSession();
        };

        ws.onmessage = async (event) => {
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            }
            console.log("RAW message received:", typeof data, data.substring(0, 500));
            handleServerEvent({ data: data });
        };
    }

    function handleServerEvent(event) {
        let msg = {};
        try { msg = JSON.parse(event.data); } catch { return; }

        // Log all messages for debugging
        console.log("Server message:", msg);

        // Check for errors
        if (msg.error) {
            addLog(`Error: ${msg.error.message || JSON.stringify(msg.error)}`, "error");
            return;
        }

        // Check for setup complete signal
        if (msg.setupComplete) {
            addLog("Setup complete. Listening... Speak now!", "success");
            isSetupComplete = true;
            isRecording = true;
            micBtn.classList.add("mic-active");
            startMicStreaming();
            return;
        }

        // Handle audio responses
        if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                    playAudioChunk(part.inlineData.data);
                }
            }
        }

        // Handle turn complete
        if (msg.serverContent?.turnComplete) {
            addLog("Agent finished speaking", "info");
        }
    }

    function startMicStreaming() {
        const source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!ws || ws.readyState !== WebSocket.OPEN || !isSetupComplete) return;

            const chunk = e.inputBuffer.getChannelData(0);
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
        
        // Schedule audio chunks sequentially to avoid overlap
        const currentTime = audioContext.currentTime;
        const startTime = Math.max(currentTime, nextPlayTime);
        src.start(startTime);
        nextPlayTime = startTime + audioBuf.duration;
    }

    function stopSession(reason = "") {
        isRecording = false;
        isSetupComplete = false;
        micBtn.classList.remove("mic-active");

        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        if (processor) processor.disconnect();
        if (audioContext) audioContext.close();
        if (ws) ws.close();

        if (reason) addLog(reason, "info");
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

    function addLog(text, type) {
        const div = document.createElement("div");
        div.className = "log";
        div.style.margin = "4px 0";
        div.style.fontSize = "13px";
        div.style.padding = "4px";
        div.style.borderRadius = "4px";

        if (type === "error") div.style.background = "#ffd6d6";
        else if (type === "success") div.style.background = "#d8ffd6";
        else div.style.background = "#e3eaff";

        div.textContent = text;
        messageList.appendChild(div);
        messageList.scrollTop = messageList.scrollHeight;
    }
});
