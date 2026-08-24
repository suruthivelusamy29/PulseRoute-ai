PulseRoute AI

An intelligent, local-first emergency healthcare coordination and clinical handover platform that bridges the critical communication gap between paramedics in transit and hospital trauma teams.
🚀 Features
 Core Functionality
*   Proactive Intake Management: Automated hospital trauma bay pre-allocation and ER system initialization before vehicle arrival 
*   Offline-First Records: Fault-tolerant client-side persistence and local synchronization mechanisms utilizing browser-level cache meshes 
*   3D Telemetry Mapping: Procedural 3D route trajectory HUD canvas utilizing explicit linear vector path updates 
*   Real-Time Data Dissemination**: High-velocity bi-directional server synchronization using continuous socket event pipelines 
*   Resilient Media Slicing: Segmented binary chunk ingestion separating large high-resolution scans into sequential 512KB packets.
*   Fluid Supply Diagnostics: Percentage-calculated blood bank monitoring modules with dynamic CSS fill keyframes 
AI & Machine Learning (Clinical Decision Support)
*   AI Pre-Arrival Operational Briefing: Condition-specific clinical checklist generation mapping abnormal vitals parameters automatically
*   AI Triage Severity Classifier: Automated patient mapping onto a dynamic 1-to-5 Emergency Severity Index (ESI) grid view.
*   AI EMS Radio Script Generator: In-transit synthesis of raw field metrics into a high-density clinical verbal script for radio operators.
*   Local Edge Fallback Inference: Localized rule-based mock routing engines automatically taking over during network dead zones 

## 🏗️ Architecture

This is a full-stack, local-first unified architecture structured as follows:


hospital/
├── app/                      # Next.js Client Interface (App Router)
│   ├── hospital/
│   │   └── page.tsx          # ER Command Center dashboard UI (Sockets, 3D radar grid) [1.1]
│   ├── paramedic/        
│   │   └── page.tsx          # Ambulance field intake multi-tab forms (IndexedDB logic)
│   ├── patient/[id]/
│   │   └── page.tsx          # Deep clinical analysis, ESI 1-5 triage grids, & metrics
│   └── globals.css           # Global core layout styles (Includes custom waveShift keyframes) [1.1]
├── components/3d/            # Reusable Isolated Three.js React Three Fiber Modules
│   ├── BedMapVisual.tsx      # Interactive 3D spatial emergency room bed allocation map
│   ├── HeartVisual.tsx       # 3D cardiovascular asset pacing visual dilation matching live BPM
│   └── LiveVitalsChart.tsx   # Continuous canvas tracking continuous timelines for HR & SpO₂
├── lib/                      # Shared Frontend Core Utilities
│   └── ai.ts                 # Strongly typed fetch wrapper linking UI buttons to backend proxies
├── uploads/                  # Secure folder directory storing reassembled paramedic scans
└── server.ts                 # Secure Node.js + Express backend router & Socket.io event hub

🛠️ Tech Stack
Frontend
*   Framework: Next.js 15 with TypeScript
*   3D Graphics Engine: Three.js via @react-three/fiber and @react-three/drei
*   Local Cache Layer: Dexie.js (IndexedDB abstraction data-mesh)
*   **Charts & Visual Analytics**: Recharts (Continuous Heart Rate and SpO₂ data timelines)
*   Styling Engine: Tailwind CSS with custom background keyframes (`waveShift`) 
*   HTTP Client: Axios

Backend
*   Framework: Node.js with Express REST API router
*   Real-Time Protocols: Socket.io bi-directional server connection managers 
*   Database Integration: Hybrid storage pattern linking local client state matrices with server file caches
*   Security Configuration: Server-side proxy masking environment keys to protect application credentials
 🚀 Quick Start
 Prerequisites
*   Node.js 18+ and npm
*   Git
Clone Repository
bash
git clone https://github.com
cd PulseRoute-ai

Installation & System Setup

1.  Install Structural Packages:
    bash
    npm install
    

2.  Create Environment Configuration:
    Create a `.env` file inside the root directory and append your environment variables:
    
    AI_API_KEY=your_secure_server_side_key
    AI_API_URL=https://openai.com
    AI_MODEL=gpt-4o-mini
   
    *Note: If `AI_API_KEY` is omitted or empty, the application automatically triggers its local rule-based mock routing handler. This allows the 3D grid movements, countdown alerts, and pre-arrival briefs to function perfectly offline without throwing missing configuration errors [1.1].*

3.  Boot the Backend Synchronization Server:
   
    npm run server
    Backend data systems run on http://localhost:4000

4.  Initialize the Next.js Client Engine:
    bash
    npm run dev
    Frontend client layers run on http://localhost:3000

 🌐 Deployment

This monorepo supports independent cloud deployment configurations:

Vercel (Frontend Client)
1. Connect your GitHub repository to the Vercel dashboard.
2. Set Root Directory: `.` (or specify frontend assets context).
3. Build Command: npm run build
4.Output Directory: .next
5. Deploy ✅

### Render / DigitalOcean (Express Backend)
1. Connect your GitHub repository to the backend environment host.
2. Set Build Command: npm install
3. Start Command: npm run server
4. Add environment variables (`AI_API_KEY`) inside the configuration panels.
5. Deploy ✅


## 📱 Application Pages
*   Landing Dashboard (`/`) - Central gateway routing users to field paramedic terminals or hospital command configurations.
*   Paramedic View (`/paramedic`) - Local-first offline intake client containing the 3-tab vitals form, chunked image file attachments, and radio script reviews.
*   Hospital ER Command Center (`/hospital`) - Tactical real-time monitoring HUD tracking blood inventories, bed states, and moving 3D ambulance telemetry grids [1.1].
*   Patient Profile Insight (`/patient/[id]`) - Extended clinical history lookup with transfusion warning flags and color-coded interactive ESI triage maps.

🔐 Environment Variables
Frontend
VITE_API_URL=http://localhost:4000
Backend
text
AI_API_KEY=your-secure-openai-key
AI_API_URL=https://openai.com
AI_MODEL=gpt-4o-mini

📄 License

Private - All rights reserved
👤 Author
Suruthi
GitHub: Suruthivelusamy29


🙏 Acknowledgments
*   React Three Fiber for bringing real-time 3D telemetry tracking maps to web layers 
*   Dexie.js for providing stable IndexedDB persistence under emergency field dropouts.
*   Socket.io for powering instantaneous data streaming lines when every second matters

**Built with ❤ for resilient, full-stack emergency healthcare coordination**
