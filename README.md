# 🎸 Maestro

> **Transform your air guitar dreams into reality. Play any instrument, anywhere, with just your hands and imagination.**

[![Demo](https://img.shields.io/badge/demo-live-brightgreen)](http://localhost:3000)
[![Python](https://img.shields.io/badge/python-3.11+-blue)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/next.js-15-black)](https://nextjs.org/)

---

## 🌟 The Vision

**What if you could play any instrument in the world without ever owning one?**

Maestro is an AI-powered air instrument platform that turns your body into a musical instrument. Using cutting-edge computer vision, audio analysis, and generative AI, we're democratizing music creation for everyone.

No lessons. No equipment. Just pure creativity.

---

## ✨ Features That'll Blow Your Mind

### 🎯 **Universal Instrument Library**
- **60+ instruments** from guitar to sitar to erhu
- **AI-powered discovery** - search for any instrument, anywhere in the world
- **3D visualization** - see and explore instruments in stunning 3D
- **Cultural context** - learn the history, origin, and famous players

### 🎥 **Real-Time Computer Vision**
- **Hand tracking** with MediaPipe - your fingers are the fretboard
- **Strum detection** - air strum with natural rhythm
- **Gesture recognition** - pole position for pitch control
- **60fps streaming** - zero latency, maximum flow

### 🎤 **Intelligent Audio Capture**
- **Voice + instrument** recording simultaneously
- **Multi-modal analysis** - understand your playing style
- **Cultural context extraction** - preserve authenticity
- **Real-time feedback** - improve as you play

### 🧠 **AI-Powered Coaching**
- **Personalized tutoring** - learn technique from AI instructors
- **Performance analysis** - get instant feedback on timing, rhythm, and expression
- **Cultural authenticity** - learn traditional playing styles
- **Progress tracking** - watch yourself improve

### 🎵 **Song Generation Pipeline**
- **MIDI capture** - record every note you play
- **Audio-to-text** - AI understands your musical intent
- **4 song variations** - Suno AI generates complete songs
- **MP3 export** - share your creations with the world

---

## 🚀 How It Works

### 1️⃣ **Choose Your Instrument**
Search our library or discover exotic instruments from around the world. See them in 3D, learn their history, and hear what they sound like.

### 2️⃣ **Start Playing**
Your webcam becomes your stage. Use your left hand as the fretboard, your right hand to strum. Our AI tracks every movement in real-time.

### 3️⃣ **Get Coached**
AI tutors watch your technique and give you personalized feedback. Learn traditional playing styles from different cultures.

### 4️⃣ **Generate Songs**
Stop recording and watch the magic happen. We convert your performance into complete, shareable songs powered by Suno AI.

---

## 🎬 The Tech Stack

### **Frontend Magic**
```
Next.js 15          → Lightning-fast React framework
Tailwind CSS        → Beautiful, responsive design
Framer Motion       → Buttery smooth animations
WebSocket           → Real-time video streaming
```

### **Backend Powerhouse**
```
Python 3.11+        → Core vision & audio engine
FastAPI             → Blazing fast API server
MediaPipe           → Hand tracking & pose detection
FluidSynth          → Real-time MIDI synthesis
OpenCV              → Computer vision processing
```

### **AI & ML**
```
Perplexity Sonar    → Instrument discovery & info
Suno AI             → Song generation from performance
Whisper (planned)   → Audio-to-text transcription
GPT-4 (planned)     → Coaching & feedback
```

### **3D & Media**
```
Sketchfab API       → 3D instrument models
YouTube Data API    → Performance examples
FFmpeg              → Audio/video processing
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   USER'S BROWSER                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Next.js App (localhost:3000)             │  │
│  │  • Instrument selection                           │  │
│  │  • Real-time video feed                          │  │
│  │  • Recording controls                             │  │
│  │  • Song generation UI                             │  │
│  └──────────────────────────────────────────────────┘  │
│           ↕ WebSocket (video)  ↕ HTTP (API)           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   BACKEND SERVICES                       │
│                                                          │
│  ┌────────────────────┐      ┌────────────────────┐   │
│  │  Vision Server     │      │   API Server       │   │
│  │  (port 8766)       │      │   (port 8000)      │   │
│  │  • Hand tracking   │      │   • MIDI → MP3     │   │
│  │  • Strum detection │      │   • Song pipeline  │   │
│  │  • MIDI generation │      │   • File serving   │   │
│  │  • Phone fretboard │      │                    │   │
│  └────────────────────┘      └────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │         External APIs (via Next.js)            │   │
│  │  • Perplexity  → Instrument discovery          │   │
│  │  • Sketchfab   → 3D models                     │   │
│  │  • YouTube     → Performance videos            │   │
│  │  • Suno        → Song generation               │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 🎮 Getting Started

### **Prerequisites**
```bash
# macOS
brew install python@3.11 node@20 fluid-synth ffmpeg

# Python packages
pip install opencv-python mediapipe pyfluidsynth fastapi uvicorn pretty_midi
```

### **Quick Start**
```bash
# 1. Clone the repo
git clone https://github.com/yourusername/maestro.git
cd maestro

# 2. Install frontend dependencies
cd vision/website
npm install

# 3. Set up environment variables
cp .env.example .env
# Add your API keys: PERPLEXITY_API_KEY, SUNO_API_KEY

# 4. Start the vision server (Terminal 1)
cd ../../vision
uv run server.py

# 5. Start the API server (Terminal 2)
cd ../app
python3 api_server.py

# 6. Start the web app (Terminal 3)
cd ../vision/website
npm run dev

# 7. Open http://localhost:3000 and start playing! 🎸
```

---

## 🎯 Use Cases

### **🎓 Music Education**
- Learn instruments you can't afford
- Practice anytime, anywhere
- Get AI coaching without expensive lessons
- Explore instruments from different cultures

### **🎪 Performance & Entertainment**
- Street performance with just a laptop
- Virtual concerts in the metaverse
- Music therapy for accessibility
- Interactive museum installations

### **🎨 Content Creation**
- Generate unique songs for videos
- Create custom music without production skills
- Experiment with exotic instruments
- Rapid prototyping for musicians

### **🌍 Cultural Preservation**
- Document traditional playing techniques
- Make rare instruments accessible globally
- Cross-cultural musical education
- Archive endangered musical traditions

---

## 🔮 Roadmap

### **Phase 1: Foundation** ✅
- [x] Core hand tracking & gesture recognition
- [x] Real-time MIDI generation
- [x] Instrument library & discovery
- [x] WebSocket video streaming

### **Phase 2: Intelligence** 🚧
- [x] Audio capture & analysis
- [ ] Speech-to-text for vocals
- [ ] AI coaching system
- [ ] Performance feedback engine

### **Phase 3: Creation** 📋
- [ ] Suno song generation integration
- [ ] Multi-track recording
- [ ] Collaborative jamming
- [ ] Social sharing platform

### **Phase 4: Scale** 🌟
- [ ] Mobile app (iOS/Android)
- [ ] VR/AR support
- [ ] Multiplayer sessions
- [ ] Marketplace for generated songs

---

## 🎨 Project Structure

```
maestro/
├── vision/                    # Computer vision & audio engine
│   ├── server.py             # Main WebSocket server (port 8766)
│   ├── audio_engine.py       # FluidSynth MIDI playback
│   ├── hand_tracking.py      # MediaPipe hand detection
│   ├── note_engine.py        # MIDI note generation
│   └── website/              # Next.js frontend
│       ├── app/
│       │   ├── page.tsx      # Landing page
│       │   ├── select/       # Instrument selection
│       │   ├── play/         # Recording studio
│       │   ├── analysis/     # Performance analysis
│       │   └── api/          # API routes
│       └── components/       # Reusable UI components
├── app/                      # Backend services
│   ├── api_server.py        # FastAPI server (port 8000)
│   ├── session.py           # Session management
│   └── generated/           # Output files (MIDI, MP3)
└── README.md                # You are here!
```

---

## 🤝 Contributing

We're building the future of music creation, and we'd love your help!

### **Ways to Contribute**
- 🐛 **Report bugs** - help us squash those pesky issues
- 💡 **Suggest features** - what would make this even cooler?
- 🎨 **Improve design** - make it beautiful
- 🌍 **Add instruments** - expand our cultural library
- 📚 **Write docs** - help others learn

### **Development Setup**
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 🏆 Built At TreeHacks 2025

This project was built during Stanford's TreeHacks 2025 hackathon with ❤️ and lots of ☕.

**The Team:**
- Vision & Backend Engineering
- Frontend & Design
- AI/ML Integration
- Product & UX

---

## 📜 License

MIT License - feel free to use this for learning, teaching, or building something even cooler!

---

## 🙏 Acknowledgments

- **MediaPipe** - for incredible hand tracking
- **FluidSynth** - for beautiful MIDI synthesis
- **Perplexity** - for AI-powered search
- **Suno** - for mind-blowing music generation
- **Sketchfab** - for 3D models
- **TreeHacks** - for the opportunity to build this

---

## 📞 Contact & Links

- 🌐 **Website**: [maestro.ai](https://maestro.ai) (coming soon)
- 🐦 **Twitter**: [@MaestroAI](https://twitter.com/MaestroAI)
- 💬 **Discord**: [Join our community](https://discord.gg/maestro)
- 📧 **Email**: hello@maestro.ai

---

<div align="center">

### 🎸 **Ready to become a maestro?**

**[Try it now](http://localhost:3000)** • **[Watch the demo](https://youtube.com)** • **[Join Discord](https://discord.gg)**

---

*Made with 🎵 by music lovers, for music lovers*

**Star ⭐ this repo if you believe in democratizing music creation!**

</div>
